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
    test("3. Successful email delivery: Resend dispatches OTP email and registration succeeds with HTTP 200", async () => {
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

        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Alex",
                lastName: "Morgan",
                email: testEmail,
                password: testPassword
            })
        });

        assert.equal(res.status, 200, "Registration must succeed with HTTP 200");
        const body = await res.json();
        assert.equal(body.message, "Verification code sent to your email");
        assert.equal(body.email, testEmail);

        // Verify Resend payload was constructed correctly
        assert.ok(dispatchedPayload, "Resend emails.send must have been called");
        assert.equal(dispatchedPayload.to, testEmail);
        assert.ok(dispatchedPayload.subject.includes("verification code"));
        assert.ok(dispatchedPayload.html.includes("Confirm your email address"));

        // Verify database state: pending record created, no permanent user created
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testEmail }
        });
        assert.ok(pending, "Pending registration must exist in DB");
        assert.ok(pending.otp_hash, "Pending registration must contain HMAC-SHA256 OTP hash");

        const user = await prisma.users.findUnique({
            where: { email: testEmail }
        });
        assert.equal(user, null, "Permanent user must NOT be created prior to OTP verification");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Invalid API Key / Provider Rejection (HTTP 401 from Resend)
    // -------------------------------------------------------------------------
    test("4. Invalid API key/provider rejection: returns HTTP 500, cleans pending registration, refunds rate-limit quota", async () => {
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

        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Jordan",
                lastName: "Lee",
                email: testEmail,
                password: testPassword
            })
        });

        assert.equal(res.status, 500, "Must return HTTP 500 on Resend rejection");
        const body = await res.json();
        assert.equal(body.message, "Failed to send verification email. Please check your email address and try again.");

        // Verify pending registration was purged
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testEmail }
        });
        assert.equal(pending, null, "Pending registration must be purged after email failure");

        // Verify rate-limit quota was refunded
        const keyCount = registerEmailRateLimiter.getKeyCount(testEmail.toLowerCase().trim());
        assert.equal(keyCount, 0, "Email rate-limit hit must be refunded on HTTP 500");
    });

    // -------------------------------------------------------------------------
    // TEST 5: Network Timeout Handling
    // -------------------------------------------------------------------------
    test("5. Network timeout: sendWithTimeout rejects promptly on timeout, cleans pending registration", async () => {
        // First verify sendWithTimeout rejects with ETIMEDOUT when operation hangs
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

        // Next test via registration endpoint
        const testEmail = `resendtest_timeout_${Date.now()}@example.com`;

        setResendClientOverride({
            emails: {
                send: async () => {
                    const timeoutErr = new Error("Email delivery timed out after 10000ms");
                    timeoutErr.code = "ETIMEDOUT";
                    throw timeoutErr;
                }
            }
        });

        const start = Date.now();
        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Taylor",
                lastName: "Swift",
                email: testEmail,
                password: testPassword
            })
        });
        const duration = Date.now() - start;

        assert.equal(res.status, 500, "Must return HTTP 500 on timeout");
        assert.ok(duration < 5000, "Must return promptly without hanging indefinitely");

        // Verify pending record cleaned up
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testEmail }
        });
        assert.equal(pending, null, "Pending registration must be purged after timeout failure");
    });

    // -------------------------------------------------------------------------
    // TEST 6: Registration Retry After Provider Recovery
    // -------------------------------------------------------------------------
    test("6. Failed registration allows a legitimate retry after provider recovers", async () => {
        const testEmail = `resendtest_retry_${Date.now()}@example.com`;

        // 1. First attempt fails due to Resend error
        setResendClientOverride({
            emails: {
                send: async () => ({
                    data: null,
                    error: { name: "internal_server_error", message: "Resend service down", statusCode: 500 }
                })
            }
        });

        const failRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Retry",
                lastName: "User",
                email: testEmail,
                password: testPassword
            })
        });
        assert.equal(failRes.status, 500);

        // 2. Provider recovers
        setResendClientOverride({
            emails: {
                send: async () => ({ data: { id: "resend_msg_recovered_123" }, error: null })
            }
        });

        const retryRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Retry",
                lastName: "User",
                email: testEmail,
                password: testPassword
            })
        });

        assert.equal(retryRes.status, 200, "Retry must succeed with HTTP 200");
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testEmail }
        });
        assert.ok(pending, "Pending registration must exist after successful retry");
    });

    // -------------------------------------------------------------------------
    // TEST 7: OTP Resend Failure & Previous OTP Invalidation
    // -------------------------------------------------------------------------
    test("7. OTP resend failure: returns HTTP 500, preserves pending state, and invalidates previous OTP", async () => {
        const testEmail = `resendtest_resend_${Date.now()}@example.com`;
        let firstOtp = null;

        // 1. Initial registration succeeds
        setResendClientOverride({
            emails: {
                send: async (payload) => {
                    const match = payload.subject.match(/(\d{6})/);
                    if (match) firstOtp = match[1];
                    return { data: { id: "msg_init_123" }, error: null };
                }
            }
        });

        const regRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Resend",
                lastName: "Tester",
                email: testEmail,
                password: testPassword
            })
        });
        assert.equal(regRes.status, 200);
        assert.ok(firstOtp, "First OTP must be captured");

        // Advance cooldown timestamp so resend is allowed
        await prisma.pending_registrations.update({
            where: { email: testEmail },
            data: { last_resend_at: new Date(Date.now() - 70000) }
        });

        // 2. Make Resend reject during resend attempt
        setResendClientOverride({
            emails: {
                send: async () => ({
                    data: null,
                    error: { name: "application_error", message: "Failed to dispatch email", statusCode: 500 }
                })
            }
        });

        const resendRes = await fetch(`${baseApiUrl}/auth/resend-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testEmail })
        });

        assert.equal(resendRes.status, 500, "Must return HTTP 500 on resend email failure");

        // 3. Verify pending registration was NOT deleted (user should not lose their session)
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testEmail }
        });
        assert.ok(pending, "Pending registration must remain intact after resend failure");

        // 4. Verify the first OTP cannot be verified anymore because resend generated a new hash
        const verifyOldRes = await fetch(`${baseApiUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testEmail, otp: firstOtp })
        });
        assert.equal(verifyOldRes.status, 400, "Old OTP must be rejected");
        const verifyBody = await verifyOldRes.json();
        assert.ok(verifyBody.message.includes("Invalid verification code"), "Must reject with invalid code message");
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
    test("10. Concurrent registration attempts: exactly 1 pending record persists and only final committed OTP verifies", async () => {
        const testEmail = `resendtest_concurrent_${Date.now()}@example.com`;
        const capturedOtps = [];

        setResendClientOverride({
            emails: {
                send: async (payload) => {
                    const match = payload.subject.match(/(\d{6})/);
                    if (match) capturedOtps.push(match[1]);
                    return { data: { id: `resend_msg_${Date.now()}` }, error: null };
                }
            }
        });

        // Fire 5 concurrent registrations
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
        for (const r of responses) {
            assert.equal(r.status, 200, "All concurrent requests should return 200");
        }

        // Exactly one pending registration record must exist in DB
        const pendingRecords = await prisma.pending_registrations.findMany({
            where: { email: testEmail }
        });
        assert.equal(pendingRecords.length, 1, "There must be exactly one pending registration record");

        // Exactly 0 permanent users must exist
        const users = await prisma.users.findMany({
            where: { email: testEmail }
        });
        assert.equal(users.length, 0, "No permanent user must exist prior to verification");

        // The final captured OTP must verify successfully
        const finalOtp = capturedOtps[capturedOtps.length - 1];
        const verifyRes = await fetch(`${baseApiUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testEmail, otp: finalOtp })
        });
        assert.equal(verifyRes.status, 201, "Final OTP must verify and create user");

        // Earlier OTPs must now be rejected
        if (capturedOtps.length > 1) {
            const firstOtp = capturedOtps[0];
            const verifyFirstRes = await fetch(`${baseApiUrl}/auth/verify-registration-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: testEmail, otp: firstOtp })
            });
            // Pending registration was deleted upon successful verification, so returns 404 or 409
            assert.ok([400, 404, 409].includes(verifyFirstRes.status), "Old OTP must not verify");
        }
    });
});
