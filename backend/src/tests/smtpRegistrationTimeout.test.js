import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import app from "../app.js";
import prisma from "../config/prisma.js";
import {
    SMTP_TIMEOUTS,
    setMailMock,
    sanitizeErrorMessage,
    transporter
} from "../services/mailService.js";
import {
    registerRateLimiter,
    registerEmailRateLimiter,
    createRateLimiter
} from "../middleware/rateLimiter.js";

describe("SMTP Registration Timeout & Error Recovery Test Suite", () => {
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
            where: { email: { contains: "smtptest_" } }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { email: { contains: "smtptest_" } }
        }).catch(() => {});

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        setMailMock(null);

        try {
            await prisma.pending_registrations.deleteMany({
                where: { email: { contains: "smtptest_" } }
            }).catch(() => {});

            await prisma.users.deleteMany({
                where: { email: { contains: "smtptest_" } }
            }).catch(() => {});
        } catch {}

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    beforeEach(() => {
        registerRateLimiter.reset();
        registerEmailRateLimiter.reset();
    });

    // -------------------------------------------------------------------------
    // TEST 1: SMTP Transporter Timeout Configuration
    // -------------------------------------------------------------------------
    test("1. SMTP configuration defines explicit timeouts: 10s connection, 10s greeting, 15s socket", () => {
        assert.equal(SMTP_TIMEOUTS.connectionTimeout, 10000, "connectionTimeout must be 10000ms");
        assert.equal(SMTP_TIMEOUTS.greetingTimeout, 10000, "greetingTimeout must be 10000ms");
        assert.equal(SMTP_TIMEOUTS.socketTimeout, 15000, "socketTimeout must be 15000ms");

        // Verify transporter instance options contain configured timeouts
        assert.equal(transporter.options.connectionTimeout, 10000);
        assert.equal(transporter.options.greetingTimeout, 10000);
        assert.equal(transporter.options.socketTimeout, 15000);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Error Sanitization Prevents Credential / OTP Leaks
    // -------------------------------------------------------------------------
    test("2. sanitizeErrorMessage strips passwords, credentials, and 6-digit OTPs", () => {
        const dirtyMessage = "Auth failed for user@example.com with password: SuperSecretPassword123 using code 482910";
        const cleaned = sanitizeErrorMessage(dirtyMessage);

        assert.ok(!cleaned.includes("SuperSecretPassword123"), "Passwords must be stripped");
        assert.ok(!cleaned.includes("482910"), "6-digit OTPs must be stripped");
        assert.ok(cleaned.includes("[REDACTED_OTP]"), "OTP replacement tag must be present");
        assert.ok(cleaned.includes("credential=[REDACTED]"), "Password replacement tag must be present");
    });

    // -------------------------------------------------------------------------
    // TEST 3: SMTP Success Flow
    // -------------------------------------------------------------------------
    test("3. Registration succeeds when SMTP dispatches email cleanly", async () => {
        const email = "smtptest_success@taskflow.dev";
        let dispatchedMail = null;

        setMailMock((mail) => {
            dispatchedMail = mail;
            return Promise.resolve({ messageId: "mock-success-id" });
        });

        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Happy",
                lastName: "Path",
                email,
                password: testPassword
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.email, email);
        assert.equal(data.message, "Verification code sent to your email");

        // Verify pending registration was created in DB
        const pending = await prisma.pending_registrations.findUnique({
            where: { email }
        });
        assert.ok(pending, "Pending registration must exist");
        assert.equal(pending.first_name, "Happy");

        // Verify dispatched mail payload
        assert.ok(dispatchedMail, "Mail mock must have been invoked");
        assert.equal(dispatchedMail.email, email);
        assert.match(dispatchedMail.otp, /^\d{6}$/);
    });

    // -------------------------------------------------------------------------
    // TEST 4: SMTP Authentication Failure (EAUTH) Handling & Cleanup
    // -------------------------------------------------------------------------
    test("4. SMTP authentication failure returns HTTP 500, purges pending record, and refunds rate limiter", async () => {
        const email = "smtptest_auth_failure@taskflow.dev";
        const clientIp = "192.0.2.101";

        setMailMock(() => {
            const err = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
            err.code = "EAUTH";
            return Promise.reject(err);
        });

        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "Auth",
                lastName: "Fail",
                email,
                password: testPassword
            })
        });

        assert.equal(res.status, 500);
        const data = await res.json();
        assert.equal(data.message, "Failed to send verification email. Please check your email address and try again.");

        // Verify pending registration was deleted (no partial state)
        const pending = await prisma.pending_registrations.findUnique({
            where: { email }
        });
        assert.equal(pending, null, "Failed SMTP must delete the pending registration");

        // Verify resend returns 404
        const resendRes = await fetch(`${baseApiUrl}/auth/resend-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        assert.equal(resendRes.status, 404);

        // Verify rate limiter quota was refunded: email must still have 0 consumed hits
        assert.equal(registerEmailRateLimiter.getKeyCount(email), 0, "Email rate limiter must be refunded");
    });

    // -------------------------------------------------------------------------
    // TEST 5: SMTP Connection Timeout (ETIMEDOUT) Handling & Cleanup
    // -------------------------------------------------------------------------
    test("5. SMTP connection timeout (ETIMEDOUT) returns HTTP 500 promptly and cleans up", async () => {
        const email = "smtptest_timeout@taskflow.dev";
        const clientIp = "192.0.2.102";

        setMailMock(() => {
            const err = new Error("Connection timeout after 10000ms");
            err.code = "ETIMEDOUT";
            return Promise.reject(err);
        });

        const startTime = Date.now();
        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "Timeout",
                lastName: "Test",
                email,
                password: testPassword
            })
        });
        const elapsed = Date.now() - startTime;

        assert.equal(res.status, 500);
        const data = await res.json();
        assert.equal(data.message, "Failed to send verification email. Please check your email address and try again.");

        // Must return promptly without hanging
        assert.ok(elapsed < 10000, `Execution should complete promptly, took ${elapsed}ms`);

        // Verify pending record cleaned up
        const pending = await prisma.pending_registrations.findUnique({
            where: { email }
        });
        assert.equal(pending, null, "Pending registration must be purged");

        // Verify rate limit refunded
        assert.equal(registerEmailRateLimiter.getKeyCount(email), 0);
    });

    // -------------------------------------------------------------------------
    // TEST 6: Retry After SMTP Failure Succeeds Without Rate-Limit Penalty
    // -------------------------------------------------------------------------
    test("6. User can retry registration immediately after SMTP failure once service recovers", async () => {
        const email = "smtptest_retry_recovery@taskflow.dev";
        const clientIp = "192.0.2.103";

        // Step 1: Simulate 3 consecutive SMTP failures (e.g. temporary network glitch)
        for (let i = 0; i < 3; i++) {
            setMailMock(() => {
                const err = new Error("Temporary SMTP glitch");
                err.code = "ECONNREFUSED";
                return Promise.reject(err);
            });

            const failRes = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Retry",
                    lastName: "User",
                    email,
                    password: testPassword
                })
            });

            assert.equal(failRes.status, 500, `Attempt ${i + 1} should return 500`);
        }

        // Step 2: Rate limit quota must not be consumed by the 3 failed attempts
        assert.equal(registerEmailRateLimiter.getKeyCount(email), 0, "Failed attempts must not consume email quota");

        // Step 3: SMTP recovers -> next registration attempt must succeed (HTTP 200)
        setMailMock(() => Promise.resolve({ messageId: "recovered-id" }));

        const successRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "Retry",
                lastName: "User",
                email,
                password: testPassword
            })
        });

        assert.equal(successRes.status, 200, "Registration must succeed when SMTP recovers");
        const successData = await successRes.json();
        assert.equal(successData.email, email);

        // Verify pending registration exists
        const pending = await prisma.pending_registrations.findUnique({
            where: { email }
        });
        assert.ok(pending, "Pending registration must be stored upon successful recovery");
    });

    // -------------------------------------------------------------------------
    // TEST 7 (Scenario A): Client Disconnect During Registration
    // -------------------------------------------------------------------------
    test("7. Client disconnect during in-flight registration does not crash server and handles cleanup", async () => {
        const email = "smtptest_disconnect_a@taskflow.dev";
        let mockStarted = false;
        let mockFinished = false;

        setMailMock(async () => {
            mockStarted = true;
            await new Promise((resolve) => setTimeout(resolve, 500));
            mockFinished = true;
            return { messageId: "delayed-id" };
        });

        const parsedUrl = new URL(`${baseApiUrl}/auth/register`);
        const payload = JSON.stringify({
            firstName: "Disconnect",
            lastName: "Tester",
            email,
            password: testPassword
        });

        await new Promise((resolve) => {
            const req = http.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload)
                }
            });

            req.on("error", () => {
                // Expected ECONNRESET / socket destroyed
            });

            req.write(payload);
            req.end();

            const checkInterval = setInterval(() => {
                if (mockStarted) {
                    clearInterval(checkInterval);
                    req.destroy(); // Abort the client connection mid-flight
                    setTimeout(resolve, 700);
                }
            }, 40);
        });

        assert.ok(mockStarted, "Mail mock must have initiated");
        assert.ok(mockFinished, "Mail mock must complete cycle without process crash");

        // Verify server remains alive and responsive after client disconnect
        const healthRes = await fetch(`${baseApiUrl}/health`);
        assert.equal(healthRes.status, 200, "Server must remain healthy and responsive");
    });

    // -------------------------------------------------------------------------
    // TEST 8 (Scenario B): Rate-Limit Refund After Client Disconnect
    // -------------------------------------------------------------------------
    test("8. Rate-limit quota for both IP and email is refunded when client prematurely disconnects", async () => {
        const email = "smtptest_abort_refund_b@taskflow.dev";
        const clientIp = "192.0.2.215";
        let mockStarted = false;

        setMailMock(async () => {
            mockStarted = true;
            await new Promise((resolve) => setTimeout(resolve, 500));
            return { messageId: "delayed-id" };
        });

        const parsedUrl = new URL(`${baseApiUrl}/auth/register`);
        const payload = JSON.stringify({
            firstName: "Abort",
            lastName: "Tester",
            email,
            password: testPassword
        });

        await new Promise((resolve) => {
            const req = http.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload),
                    "X-Forwarded-For": clientIp
                }
            });

            req.on("error", () => {});

            req.write(payload);
            req.end();

            const checkInterval = setInterval(() => {
                if (mockStarted) {
                    clearInterval(checkInterval);
                    req.destroy();
                    setTimeout(resolve, 700);
                }
            }, 40);
        });

        // Inspect actual limiter states via getKeyCount
        const emailHits = registerEmailRateLimiter.getKeyCount(email);
        const ipHits = registerRateLimiter.getKeyCount(clientIp);

        assert.equal(emailHits, 0, "Email limiter hit must be refunded after client abort");
        assert.equal(ipHits, 0, "IP limiter hit must be refunded after client abort");
    });

    // -------------------------------------------------------------------------
    // TEST 9 (Scenario C): Duplicate Refund Prevention
    // -------------------------------------------------------------------------
    test("9. Duplicate refund prevention: finish and close events cannot double-refund or corrupt other hits", () => {
        const testLimiter = createRateLimiter({
            windowMs: 60000,
            max: 5,
            ignoreStatuses: [500]
        });

        const clientIp = "192.0.2.225";

        // Request 1: will fail with 500 and trigger both finish and close
        const req1 = { ip: clientIp, headers: {} };
        const res1 = new EventEmitter();
        res1.statusCode = 500;
        res1.writableEnded = false;

        // Request 2: a separate valid request on the same IP
        const req2 = { ip: clientIp, headers: {} };
        const res2 = new EventEmitter();
        res2.statusCode = 200;
        res2.writableEnded = true;

        testLimiter(req1, res1, () => {});
        assert.equal(testLimiter.getKeyCount(clientIp), 1, "First hit recorded");

        testLimiter(req2, res2, () => {});
        assert.equal(testLimiter.getKeyCount(clientIp), 2, "Second hit recorded");

        // Fire finish on req1 (triggers refund)
        res1.emit("finish");
        assert.equal(testLimiter.getKeyCount(clientIp), 1, "Hit count must drop from 2 to 1");

        // Fire close on req1 (must be idempotent and NOT decrement second hit!)
        res1.emit("close");
        assert.equal(testLimiter.getKeyCount(clientIp), 1, "Hit count must remain 1 (no double refund)");

        // Fire repeated finish on req1
        res1.emit("finish");
        assert.equal(testLimiter.getKeyCount(clientIp), 1, "Repeated finish must not decrease hit count");
    });

    // -------------------------------------------------------------------------
    // TEST 10 (Scenario D): OTP Resend SMTP Failure
    // -------------------------------------------------------------------------
    test("10. OTP resend SMTP failure returns HTTP 500, preserves consistent pending state, and invalidates old OTP", async () => {
        const email = "smtptest_resend_failure_d@taskflow.dev";
        let capturedOtp1 = null;

        // Step 1: Initial successful registration
        setMailMock((mail) => {
            capturedOtp1 = mail.otp;
            return Promise.resolve({ messageId: "initial-msg-id" });
        });

        const regRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Resend",
                lastName: "Tester",
                email,
                password: testPassword
            })
        });
        assert.equal(regRes.status, 200);
        assert.ok(capturedOtp1, "Initial OTP must be captured");

        // Step 2: Manually advance cooldown in DB (65 seconds in the past)
        const pastDate = new Date(Date.now() - 65 * 1000);
        await prisma.pending_registrations.update({
            where: { email },
            data: { last_resend_at: pastDate }
        });

        // Step 3: Configure mock to reject on resend
        setMailMock(() => {
            const err = new Error("Resend SMTP failed: ECONNRESET");
            err.code = "ECONNRESET";
            return Promise.reject(err);
        });

        const resendRes = await fetch(`${baseApiUrl}/auth/resend-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        assert.equal(resendRes.status, 500, "Resend must return HTTP 500 when SMTP fails");
        const resendData = await resendRes.json();
        assert.equal(
            resendData.message,
            "Failed to send verification email. Please check your email address and try again."
        );

        // Step 4: Verify pending registration is still present in consistent state
        const pending = await prisma.pending_registrations.findUnique({
            where: { email }
        });
        assert.ok(pending, "Pending registration must be preserved for user to retry");

        // Step 5: Verify old OTP (capturedOtp1) cannot be used to verify account
        const verifyOldRes = await fetch(`${baseApiUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp: capturedOtp1 })
        });
        assert.equal(verifyOldRes.status, 400, "Old OTP must be rejected because it was invalidated by the resend attempt");
    });

    // -------------------------------------------------------------------------
    // TEST 11 (Scenario E): Concurrent Registration Attempts
    // -------------------------------------------------------------------------
    test("11. Concurrent registration requests for same email resolve safely with only final OTP valid", async () => {
        const email = "smtptest_concurrent_e@taskflow.dev";
        const capturedMails = [];

        setMailMock((mail) => {
            capturedMails.push({ ...mail, timestamp: Date.now() });
            return Promise.resolve({ messageId: `concurrent-${Date.now()}` });
        });

        // Fire 5 concurrent registrations for the exact same email
        const requests = [1, 2, 3, 4, 5].map((idx) =>
            fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName: `Concurrent${idx}`,
                    lastName: "User",
                    email,
                    password: testPassword
                })
            })
        );

        const responses = await Promise.all(requests);

        // All responses must complete cleanly (HTTP 200) without 500 deadlock
        for (const res of responses) {
            assert.equal(res.status, 200, "Every concurrent registration request should succeed");
            const data = await res.json();
            assert.equal(data.email, email);
        }

        // Database consistency: exactly 1 pending registration record exists
        const pendingRecords = await prisma.pending_registrations.findMany({
            where: { email }
        });
        assert.equal(pendingRecords.length, 1, "Must maintain exactly one pending registration row");
        assert.ok(pendingRecords[0].otp_hash, "Pending registration must have a valid OTP hash");

        // No permanent user created yet
        const permanentUsers = await prisma.users.findMany({
            where: { email }
        });
        assert.equal(permanentUsers.length, 0, "No permanent user should be created before verification");

        // Multiple OTP emails were dispatched
        assert.ok(capturedMails.length >= 2, "Multiple OTP emails were generated during race");

        // Find which OTP matches the committed hash in DB
        // The one that matches the final committed hash succeeds; any other fails!
        let successCount = 0;
        let failCount = 0;

        for (const mail of capturedMails) {
            const verifyRes = await fetch(`${baseApiUrl}/auth/verify-registration-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp: mail.otp })
            });

            if (verifyRes.status === 201) {
                successCount++;
                // Once verified, further attempts will fail (either 409 already verified or 404 pending deleted)
            } else {
                failCount++;
            }
        }

        assert.equal(successCount, 1, "Exactly one OTP from the concurrent race must succeed");
        assert.ok(failCount >= 1, "Outdated OTPs from concurrent race must be rejected");

        // Verify permanent user exists
        const createdUser = await prisma.users.findUnique({
            where: { email }
        });
        assert.ok(createdUser, "Permanent user must exist after OTP verification");

        // Pending registration must now be deleted
        const pendingAfter = await prisma.pending_registrations.findUnique({
            where: { email }
        });
        assert.equal(pendingAfter, null, "Pending registration must be purged after verification");
    });
});
