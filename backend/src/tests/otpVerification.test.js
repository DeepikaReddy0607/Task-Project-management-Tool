import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { setMailMock } from "../services/mailService.js";

describe("Phase 3: Safe Email OTP Verification Test Suite", () => {
    let server;
    let baseUrl;
    let capturedMails = [];
    const sentOtps = new Map();
    const testPassword = "SecurePassword123!";

    const testUsers = {
        valid: {
            firstName: "Alice",
            lastName: "Tester",
            email: "alice.otp.test@taskflow.dev",
            password: testPassword,
            phone: "+1234567890"
        },
        existing: {
            firstName: "Bob",
            lastName: "Existing",
            email: "bob.existing.test@taskflow.dev",
            password: testPassword,
            phone: "+1234567891"
        },
        attempts: {
            firstName: "Charlie",
            lastName: "Attempts",
            email: "charlie.attempts.test@taskflow.dev",
            password: testPassword
        },
        resend: {
            firstName: "Diana",
            lastName: "Resend",
            email: "diana.resend.test@taskflow.dev",
            password: testPassword
        }
    };

    before(async () => {
        // Disable rate limiting for deterministic integration testing
        process.env.DISABLE_RATE_LIMITING = "true";

        // Setup mock email delivery capturing dispatched emails and OTPs
        setMailMock((mail) => {
            capturedMails.push(mail);
            if (mail.email && mail.otp) {
                sentOtps.set(mail.email.toLowerCase(), mail.otp);
            }
            return Promise.resolve({ messageId: "mock-otp-id" });
        });

        // Clean up any remnants of test data
        const testEmails = Object.values(testUsers).map(u => u.email);
        await prisma.pending_registrations.deleteMany({
            where: { email: { in: testEmails } }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { email: { in: testEmails } }
        }).catch(() => {});

        // Pre-create existing user for OTP02
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No role found in database");

        await prisma.users.create({
            data: {
                first_name: testUsers.existing.firstName,
                last_name: testUsers.existing.lastName,
                email: testUsers.existing.email,
                password_hash: "$2b$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ1234567890abcdefghij",
                role_id: role.id,
                has_completed_onboarding: true
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        // Restore mail mock
        setMailMock(null);

        // Clean up test data
        const testEmails = Object.values(testUsers).map(u => u.email);
        await prisma.pending_registrations.deleteMany({
            where: { email: { in: testEmails } }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { email: { in: testEmails } }
        }).catch(() => {});

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await prisma.$disconnect().catch(() => {});
    });

    // -------------------------------------------------------------
    // OTP01: Valid registration
    // -------------------------------------------------------------
    test("OTP01: Valid registration sends OTP and creates pending record without permanent user", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testUsers.valid)
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, "Verification code sent to your email");
        assert.equal(data.email, testUsers.valid.email.toLowerCase());

        // Verify email was dispatched via mailService mock
        assert.equal(capturedMails.length, 1);
        assert.equal(capturedMails[0].type, "OTP");
        assert.equal(capturedMails[0].email, testUsers.valid.email.toLowerCase());
        assert.match(capturedMails[0].otp, /^\d{6}$/);

        // Verify pending registration exists in database
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() }
        });
        assert.ok(pending, "Pending registration must exist in taskflow.pending_registrations");
        assert.ok(pending.otp_hash, "otp_hash must be stored");
        assert.notEqual(pending.otp_hash, capturedMails[0].otp, "Plaintext OTP must NEVER be stored in DB");

        // Verify permanent user was NOT created in taskflow.users
        const permanentUser = await prisma.users.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() }
        });
        assert.equal(permanentUser, null, "Permanent user must NOT be created before OTP verification");
    });

    // -------------------------------------------------------------
    // OTP02: Existing email
    // -------------------------------------------------------------
    test("OTP02: Registration with an already registered email is rejected with 409", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testUsers.existing)
        });

        assert.equal(res.status, 409);
        const data = await res.json();
        assert.equal(data.message, "Email already registered");
        const existingMails = capturedMails.filter(m => m.email === testUsers.existing.email.toLowerCase());
        assert.equal(existingMails.length, 0, "No OTP email must be dispatched for already registered email");
    });

    // -------------------------------------------------------------
    // OTP11: Login before verification
    // -------------------------------------------------------------
    test("OTP11: Login before verification is rejected with 401", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                password: testUsers.valid.password
            })
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.ok(
            data.message.includes("verify your email") || data.message === "Invalid email or password",
            `Expected message to reject unverified user, got: ${data.message}`
        );
    });

    // -------------------------------------------------------------
    // OTP03: Invalid OTP
    // -------------------------------------------------------------
    test("OTP03: Verification with an incorrect OTP is rejected with 400 and increments attempts", async () => {
        const res = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                otp: "000000" // Wrong code
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(data.message.includes("Invalid verification code"), data.message);

        // Check attempts in DB
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() }
        });
        assert.equal(pending.verification_attempts, 1);
    });

    // -------------------------------------------------------------
    // OTP04: Expired OTP
    // -------------------------------------------------------------
    test("OTP04: Expired OTP is rejected with 400", async () => {
        const validOtp = sentOtps.get(testUsers.valid.email.toLowerCase());

        // Artificially expire the OTP in the database
        await prisma.pending_registrations.update({
            where: { email: testUsers.valid.email.toLowerCase() },
            data: { otp_expires_at: new Date(Date.now() - 10000) } // 10s in the past
        });

        const res = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                otp: validOtp
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(data.message.includes("expired"), `Expected expiry message, got: ${data.message}`);

        // Restore expiry for subsequent tests
        await prisma.pending_registrations.update({
            where: { email: testUsers.valid.email.toLowerCase() },
            data: { otp_expires_at: new Date(Date.now() + 5 * 60 * 1000) }
        });
    });

    // -------------------------------------------------------------
    // OTP05: Valid OTP creates permanent user
    // -------------------------------------------------------------
    test("OTP05: Valid OTP verification creates permanent user and deletes pending registration", async () => {
        const validOtp = sentOtps.get(testUsers.valid.email.toLowerCase());

        const res = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                otp: validOtp
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.message, "Registration verified successfully");
        assert.ok(data.user);
        assert.equal(data.user.email, testUsers.valid.email.toLowerCase());
        assert.equal(data.user.firstName, testUsers.valid.firstName);
        assert.equal(data.user.lastName, testUsers.valid.lastName);
        assert.equal(data.user.role, "Team Member");
        assert.equal(data.user.hasCompletedOnboarding, false);

        // Verify pending registration was deleted
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() }
        });
        assert.equal(pending, null, "Pending registration must be deleted after successful verification");

        // Verify permanent user exists in DB
        const permanentUser = await prisma.users.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() }
        });
        assert.ok(permanentUser, "Permanent user must exist in DB");
        assert.equal(permanentUser.has_completed_onboarding, false);
        assert.equal(permanentUser.is_active, true);
    });

    // -------------------------------------------------------------
    // OTP06: Reuse OTP
    // -------------------------------------------------------------
    test("OTP06: Reusing an already used OTP is rejected", async () => {
        const usedOtp = sentOtps.get(testUsers.valid.email.toLowerCase());

        const res = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                otp: usedOtp
            })
        });

        // Rejected because pending registration was already deleted
        assert.ok(res.status === 404 || res.status === 409);
        const data = await res.json();
        assert.ok(data.message.includes("already") || data.message.includes("No pending registration"));
    });

    // -------------------------------------------------------------
    // OTP12: Login after verification
    // -------------------------------------------------------------
    test("OTP12: Login after verification is successful and issues valid JWT token", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                password: testUsers.valid.password
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, "Login successful");
        assert.ok(data.token, "JWT token must be present");
        assert.equal(data.user.email, testUsers.valid.email.toLowerCase());
    });

    // -------------------------------------------------------------
    // OTP13: First login hasCompletedOnboarding is false
    // -------------------------------------------------------------
    test("OTP13: First-time login reflects hasCompletedOnboarding: false", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                password: testUsers.valid.password
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, false);
    });

    // -------------------------------------------------------------
    // OTP14: Complete onboarding
    // -------------------------------------------------------------
    test("OTP14: Completing onboarding marks state true and subsequent logins return hasCompletedOnboarding: true", async () => {
        // Login to get token
        const loginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                password: testUsers.valid.password
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;

        // Call complete onboarding endpoint
        const completeRes = await fetch(`${baseUrl}/users/onboarding/complete`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        assert.equal(completeRes.status, 200);
        const completeData = await completeRes.json();
        assert.equal(completeData.user.hasCompletedOnboarding, true);

        // Verify subsequent login reflects hasCompletedOnboarding: true
        const secondLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                password: testUsers.valid.password
            })
        });
        const secondLoginData = await secondLoginRes.json();
        assert.equal(secondLoginData.user.hasCompletedOnboarding, true);
    });

    // -------------------------------------------------------------
    // OTP07, OTP08, OTP09: Resend workflow & cooldown
    // -------------------------------------------------------------
    test("OTP07: Resending OTP too early is rejected with 429 cooldown active", async () => {
        // Register diana
        await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testUsers.resend)
        });

        // Immediate resend within 60s
        const res = await fetch(`${baseUrl}/auth/resend-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testUsers.resend.email })
        });

        assert.equal(res.status, 429);
        const data = await res.json();
        assert.ok(data.message.includes("seconds before requesting"), data.message);
        assert.ok(data.retryAfter > 0);
    });

    test("OTP08 & OTP09: Resend after cooldown sends new OTP and invalidates previous OTP", async () => {
        const initialOtp = sentOtps.get(testUsers.resend.email.toLowerCase());

        // Fast-forward last_resend_at by 65 seconds in database to simulate cooldown elapse
        await prisma.pending_registrations.update({
            where: { email: testUsers.resend.email.toLowerCase() },
            data: { last_resend_at: new Date(Date.now() - 65 * 1000) }
        });

        // Request resend
        const resendRes = await fetch(`${baseUrl}/auth/resend-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testUsers.resend.email })
        });

        assert.equal(resendRes.status, 200);
        const newOtp = sentOtps.get(testUsers.resend.email.toLowerCase());
        assert.notEqual(newOtp, initialOtp, "New OTP must differ from initial OTP");

        // OTP09: Verify that old OTP is now rejected
        const oldOtpRes = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.resend.email,
                otp: initialOtp
            })
        });

        assert.equal(oldOtpRes.status, 400);

        // Verify that the NEW OTP succeeds
        const newOtpRes = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.resend.email,
                otp: newOtp
            })
        });

        assert.equal(newOtpRes.status, 201);
    });

    // -------------------------------------------------------------
    // OTP10: Exceed attempt limit
    // -------------------------------------------------------------
    test("OTP10: 5 incorrect verification attempts invalidates OTP and blocks further attempts with 429", async () => {
        // Register charlie
        await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testUsers.attempts)
        });

        // Send 4 wrong attempts (must return 400 with remaining attempts count)
        for (let i = 1; i <= 4; i++) {
            const failRes = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: testUsers.attempts.email,
                    otp: "111111"
                })
            });
            assert.equal(failRes.status, 400);
            const failData = await failRes.json();
            assert.ok(failData.message.includes("remaining"), failData.message);
        }

        // 5th wrong attempt must return 429 and invalidate current OTP
        const fifthRes = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.attempts.email,
                otp: "111111"
            })
        });

        assert.equal(fifthRes.status, 429);
        const fifthData = await fifthRes.json();
        assert.ok(fifthData.message.includes("Maximum verification attempts exceeded"), fifthData.message);

        // Verify that the pending record still exists (not deleted), but otp_hash is cleared/invalidated
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testUsers.attempts.email.toLowerCase() }
        });
        assert.ok(pending, "Pending registration must not be deleted on 5th failure");
        assert.equal(pending.otp_hash, null, "otp_hash must be invalidated to prevent brute force");

        // Even with the original valid OTP, verification must now be rejected
        const originalOtp = sentOtps.get(testUsers.attempts.email.toLowerCase());
        const blockedRes = await fetch(`${baseUrl}/auth/verify-registration-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.attempts.email,
                otp: originalOtp
            })
        });
        assert.ok(blockedRes.status === 400 || blockedRes.status === 429);
    });

    // -------------------------------------------------------------
    // OTP15: Concurrency protection
    // -------------------------------------------------------------
    test("OTP15: Concurrent OTP verification requests cannot create duplicate accounts", async () => {
        const concurrentUser = {
            firstName: "Connie",
            lastName: "Current",
            email: "connie.current@taskflow.dev",
            password: testPassword
        };

        await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(concurrentUser)
        });

        const otp = sentOtps.get(concurrentUser.email.toLowerCase());
        assert.ok(otp);

        const results = await Promise.all(
            Array.from({ length: 5 }).map(() =>
                fetch(`${baseUrl}/auth/verify-registration-otp`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: concurrentUser.email,
                        otp
                    })
                })
            )
        );

        const statuses = results.map(r => r.status);
        const successCount = statuses.filter(s => s === 201).length;
        assert.equal(successCount, 1, `Exactly 1 concurrent verification must succeed (statuses: ${statuses.join(", ")})`);

        const usersCount = await prisma.users.count({
            where: { email: concurrentUser.email.toLowerCase() }
        });
        assert.equal(usersCount, 1, "Database must contain exactly 1 user record");

        await prisma.users.deleteMany({
            where: { email: concurrentUser.email.toLowerCase() }
        }).catch(() => {});
    });
});
