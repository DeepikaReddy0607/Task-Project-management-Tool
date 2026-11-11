import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import {
    RESEND_TIMEOUT_MS,
    getSenderEmail,
    sanitizeErrorMessage,
    setMailMock,
    setResendClientOverride,
    sendWithTimeout,
    sendPasswordResetEmail,
    sendRegistrationOtpEmail
} from "../services/mailService.js";
import {
    registerRateLimiter,
    registerEmailRateLimiter,
    createRateLimiter
} from "../middleware/rateLimiter.js";
import { requestPasswordReset } from "../services/authService.js";

describe("Resend Email Delivery & Registration Error Recovery Test Suite", () => {
    let server;
    let baseApiUrl;
    let defaultRole;
    const testPassword = "SecurePassword123!";

    before(async () => {
        defaultRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!defaultRole) {
            defaultRole = await prisma.roles.findFirst();
        }

        // Clean up any test users from previous runs
        await prisma.pending_registrations.deleteMany({
            where: { email: { contains: "resendtest_" } }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { email: { contains: "resendtest_" } }
        }).catch(() => {});

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        setMailMock(null);
        setResendClientOverride(null);

        try {
            await prisma.pending_registrations.deleteMany({
                where: { email: { contains: "resendtest_" } }
            }).catch(() => {});

            await prisma.users.deleteMany({
                where: { email: { contains: "resendtest_" } }
            }).catch(() => {});
        } catch {}

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        await prisma.$disconnect().catch(() => {});
    });

    beforeEach(() => {
        setMailMock(null);
        setResendClientOverride(null);
        registerRateLimiter.reset();
        registerEmailRateLimiter.reset();
    });

    // -------------------------------------------------------------------------
    // TEST 1: Resend Provider Configuration & Sender Resolution
    // -------------------------------------------------------------------------
    test("1. Resend configuration defines 10s timeout and resolves sender correctly", () => {
        assert.equal(RESEND_TIMEOUT_MS, 10000, "RESEND_TIMEOUT_MS must be 10000ms");

        const sender = getSenderEmail();
        assert.ok(typeof sender === "string" && sender.length > 0, "Sender email must be resolved");
        assert.ok(sender.includes("@"), "Sender email must contain valid email address");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Error Sanitization Prevents Credential / API Key / OTP Leaks
    // -------------------------------------------------------------------------
    test("2. sanitizeErrorMessage strips API keys, passwords, and 6-digit OTPs", () => {
        const dirtyMessage = "Auth failed for user@example.com with Bearer re_live_98374823974892374 and password: SuperSecretPassword123 using code 482910";
        const cleaned = sanitizeErrorMessage(dirtyMessage);

        assert.ok(!cleaned.includes("re_live_98374823974892374"), "Resend API keys must be stripped");
        assert.ok(!cleaned.includes("SuperSecretPassword123"), "Passwords must be stripped");
        assert.ok(!cleaned.includes("482910"), "6-digit OTPs must be stripped");
        assert.ok(cleaned.includes("[REDACTED_OTP]"), "OTP replacement tag must be present");
        assert.ok(cleaned.includes("re_[REDACTED_API_KEY]"), "API key replacement tag must be present");
        assert.ok(cleaned.includes("credential=[REDACTED]"), "Password replacement tag must be present");
    });

    // -------------------------------------------------------------------------
    // TEST 3: Successful Email Delivery via Resend API Mock
    // -------------------------------------------------------------------------
    test("3. Successful email delivery: sendRegistrationOtpEmail dispatches OTP email with valid payload", async () => {
        const testEmail = `resendtest_success_${Date.now()}@example.com`;
        let dispatchedPayload = null;

        setResendClientOverride({
            emails: {
                send: async (payload) => {
                    dispatchedPayload = payload;
                    return { data: { id: "resend_msg_test_123" }, error: null };
                }
            }
        });

        const result = await sendRegistrationOtpEmail(testEmail, "123456", "Alex");
        assert.ok(result);
        assert.ok(dispatchedPayload, "Resend emails.send must have been called");
        assert.equal(dispatchedPayload.to, testEmail);
        assert.ok(dispatchedPayload.subject.includes("verification code"));
        assert.ok(dispatchedPayload.html.includes("Confirm your email address"));
    });

    // -------------------------------------------------------------------------
    // TEST 4: Invalid API Key / Provider Rejection (HTTP 401 from Resend)
    // -------------------------------------------------------------------------
    test("4. Invalid API key/provider rejection: sendRegistrationOtpEmail throws with descriptive error", async () => {
        const testEmail = `resendtest_invalidkey_${Date.now()}@example.com`;

        setResendClientOverride({
            emails: {
                send: async () => {
                    return {
                        data: null,
                        error: {
                            name: "validation_error",
                            message: "API key is invalid",
                            statusCode: 401
                        }
                    };
                }
            }
        });

        await assert.rejects(
            async () => {
                await sendRegistrationOtpEmail(testEmail, "123456", "Jordan");
            },
            (err) => {
                assert.ok(err.message.includes("API key is invalid") || err.message.includes("Failed to send"));
                return true;
            }
        );
    });

    // -------------------------------------------------------------------------
    // TEST 5: Network Timeout Handling
    // -------------------------------------------------------------------------
    test("5. Network timeout: sendWithTimeout rejects promptly on timeout", async () => {
        const hangingOperation = new Promise((resolve) => setTimeout(resolve, 500));
        await assert.rejects(
            async () => {
                await sendWithTimeout(hangingOperation, 50);
            },
            (err) => {
                assert.equal(err.code, "ETIMEDOUT");
                return true;
            },
            "sendWithTimeout must reject with ETIMEDOUT when timer expires"
        );
    });

    // -------------------------------------------------------------------------
    // TEST 6: Registration Resiliency Without Provider Bottlenecks
    // -------------------------------------------------------------------------
    test("6. Direct registration succeeds reliably regardless of Resend provider status", async () => {
        const testEmail = `resendtest_retry_${Date.now()}@example.com`;

        setResendClientOverride({
            emails: {
                send: async () => ({
                    data: null,
                    error: { name: "internal_server_error", message: "Resend service down", statusCode: 500 }
                })
            }
        });

        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Direct",
                lastName: "User",
                email: testEmail,
                password: testPassword
            })
        });

        assert.equal(res.status, 200, "Direct registration must succeed without email bottleneck");
        const user = await prisma.users.findUnique({
            where: { email: testEmail }
        });
        assert.ok(user, "Permanent user created directly in database");

        // Cleanup
        await prisma.users.deleteMany({ where: { email: testEmail } });
    });

    // -------------------------------------------------------------------------
    // TEST 7: Password-Reset Email Failure Handling
    // -------------------------------------------------------------------------
    test("7. Password-reset email failure handles provider error gracefully without crashing", async () => {
        const resetEmail = `resendtest_resend_err_${Date.now()}@example.com`;

        setResendClientOverride({
            emails: {
                send: async () => ({
                    data: null,
                    error: { name: "application_error", message: "Failed to dispatch email", statusCode: 500 }
                })
            }
        });

        // sendPasswordResetEmail catches and logs error gracefully
        const res = await sendPasswordResetEmail(resetEmail, "http://localhost:5173/reset-password?token=mock");
        assert.equal(res, undefined, "Gracefully returns undefined on provider error");
    });

    // -------------------------------------------------------------------------
    // TEST 8: Password-Reset Email Compatibility
    // -------------------------------------------------------------------------
    test("8. Password-reset email compatibility: dispatches password reset email via Resend with valid reset link", async () => {
        const resetEmail = `resendtest_pwdreset_${Date.now()}@example.com`;
        let sentEmailPayload = null;

        // Create an active user for password reset
        await prisma.users.create({
            data: {
                first_name: "Reset",
                last_name: "User",
                email: resetEmail,
                password_hash: "$2b$10$abcdefghijklmnopqrstuvwxyz123456",
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        setResendClientOverride({
            emails: {
                send: async (payload) => {
                    sentEmailPayload = payload;
                    return { data: { id: "resend_pwd_msg_123" }, error: null };
                }
            }
        });

        await requestPasswordReset(resetEmail);

        assert.ok(sentEmailPayload, "Resend email send must have been called for password reset");
        assert.equal(sentEmailPayload.to, resetEmail);
        assert.equal(sentEmailPayload.subject, "TaskFlow Password Reset");
        assert.ok(sentEmailPayload.html.includes("Reset your TaskFlow password"));
        assert.ok(sentEmailPayload.html.includes("reset-password?token="), "HTML must contain reset link with token");
    });

    // -------------------------------------------------------------------------
    // TEST 9: Duplicate Refund Prevention (Idempotent Hit Refund)
    // -------------------------------------------------------------------------
    test("9. Duplicate refund prevention: finish and close events refund quota at most once", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            max: 5,
            keyGenerator: (req) => req.ip,
            ignoreStatuses: [500]
        });

        const req = { ip: "192.168.1.100" };
        let finishHandler;
        let closeHandler;
        const res = {
            statusCode: 500,
            writableEnded: true,
            on: (event, handler) => {
                if (event === "finish") finishHandler = handler;
                if (event === "close") closeHandler = handler;
            }
        };

        limiter(req, res, () => {});
        assert.equal(limiter.getKeyCount("192.168.1.100"), 1, "Hit count must initially be 1");

        // Trigger finish event
        if (finishHandler) finishHandler();
        assert.equal(limiter.getKeyCount("192.168.1.100"), 0, "Hit count must be 0 after finish refund");

        // Trigger close event on same request
        if (closeHandler) closeHandler();
        assert.equal(limiter.getKeyCount("192.168.1.100"), 0, "Hit count must remain 0 (no duplicate refund)");
    });

    // -------------------------------------------------------------------------
    // TEST 10: Concurrent Registration Attempts Consistency
    // -------------------------------------------------------------------------
    test("10. Concurrent registration attempts: exactly 1 permanent user created and concurrent duplicates return 409", async () => {
        const testEmail = `resendtest_concurrent_${Date.now()}@example.com`;

        // Fire 5 concurrent registrations for the same email
        const requests = Array.from({ length: 5 }, (_, i) =>
            fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName: `Concurrent${i}`,
                    lastName: "User",
                    email: testEmail,
                    password: testPassword
                })
            })
        );

        const responses = await Promise.all(requests);
        const statuses = responses.map((r) => r.status);
        const successCount = statuses.filter((s) => s === 200).length;
        const conflictCount = statuses.filter((s) => s === 409).length;

        assert.equal(successCount, 1, `Exactly 1 registration must succeed with 200 (statuses: ${statuses.join(", ")})`);
        assert.equal(conflictCount, 4, `The remaining 4 concurrent registrations must return 409 Conflict`);

        // Exactly one user must exist in DB
        const users = await prisma.users.findMany({
            where: { email: testEmail }
        });
        assert.equal(users.length, 1, "There must be exactly one user record");

        // Cleanup
        await prisma.users.deleteMany({ where: { email: testEmail } });
    });
});
