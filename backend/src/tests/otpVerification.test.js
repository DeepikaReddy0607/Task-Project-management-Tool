import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { setMailMock } from "../services/mailService.js";
import { requestPasswordReset, resetPassword } from "../services/authService.js";

/**
 * Phase 3: Direct Registration & Authentication Security Test Suite
 *
 * NOTE: Registration email verification (OTP) is temporarily disabled due to
 * unreliable production SMTP delivery. Direct registration creates permanent
 * user records with bcrypt password hashing, default role assignment, and onboarding
 * tracking. Password reset OTP verification and shared security code remain fully intact.
 */
describe("Phase 3: Direct Registration & Authentication Security Test Suite (Registration OTP Temporarily Disabled)", () => {
    let server;
    let baseUrl;
    let capturedMails = [];
    const testPassword = "SecurePassword123!";

    const testUsers = {
        valid: {
            firstName: "Alice",
            lastName: "Tester",
            email: "alice.direct.reg@taskflow.dev",
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
        loginTest: {
            firstName: "Charlie",
            lastName: "Login",
            email: "charlie.login.test@taskflow.dev",
            password: testPassword
        }
    };

    before(async () => {
        // Disable rate limiting for deterministic integration testing
        process.env.DISABLE_RATE_LIMITING = "true";

        // Setup mock email delivery capturing dispatched emails
        setMailMock((mail) => {
            capturedMails.push(mail);
            return Promise.resolve({ messageId: "mock-mail-id" });
        });

        // Clean up any remnants of test data
        const testEmails = Object.values(testUsers).map(u => u.email.toLowerCase());
        await prisma.pending_registrations.deleteMany({
            where: { email: { in: testEmails } }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { email: { in: testEmails } }
        }).catch(() => {});

        // Pre-create existing user for duplicate check
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No role found in database");

        await prisma.users.create({
            data: {
                first_name: testUsers.existing.firstName,
                last_name: testUsers.existing.lastName,
                email: testUsers.existing.email.toLowerCase(),
                password_hash: await bcrypt.hash(testPassword, 10),
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
        setMailMock(null);

        const testEmails = Object.values(testUsers).map(u => u.email.toLowerCase());
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

    test("REG01: Direct registration creates permanent user in database with password hashing without requiring OTP", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testUsers.valid)
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, "User registered successfully");
        assert.equal(data.email, testUsers.valid.email.toLowerCase());
        assert.ok(data.user);
        assert.equal(data.user.email, testUsers.valid.email.toLowerCase());
        assert.equal(data.user.firstName, testUsers.valid.firstName);
        assert.equal(data.user.lastName, testUsers.valid.lastName);

        // Verify permanent user was created in database
        const permanentUser = await prisma.users.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() },
            include: { roles: true }
        });
        assert.ok(permanentUser, "Permanent user must exist in database");
        assert.equal(permanentUser.first_name, testUsers.valid.firstName);
        assert.equal(permanentUser.last_name, testUsers.valid.lastName);
        assert.equal(permanentUser.has_completed_onboarding, false);
        assert.equal(permanentUser.is_active, true);
        assert.equal(permanentUser.roles.role_name, "Team Member");

        // Verify password hashing
        assert.notEqual(permanentUser.password_hash, testPassword);
        const passwordMatches = await bcrypt.compare(testPassword, permanentUser.password_hash);
        assert.equal(passwordMatches, true, "Bcrypt password comparison must succeed");

        // Verify NO pending registration remains
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: testUsers.valid.email.toLowerCase() }
        });
        assert.equal(pending, null, "No pending registration record should exist");
    });

    test("REG02: Registration with an already registered email is rejected with 409 Conflict", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testUsers.existing)
        });

        assert.equal(res.status, 409);
        const data = await res.json();
        assert.equal(data.message, "Email already registered");
    });

    test("REG03: Registration rejects missing required fields with 400 Bad Request", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Incomplete",
                email: "incomplete@taskflow.dev"
                // missing lastName and password
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(data.message.includes("required"));
    });

    test("REG04: Registration rejects passwords under 6 characters with 400 Bad Request", async () => {
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Short",
                lastName: "Pass",
                email: "shortpass@taskflow.dev",
                password: "123"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(data.message.includes("at least 6 characters"));
    });

    test("REG05: Direct registered user can log in immediately and obtain valid JWT token", async () => {
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
        assert.equal(data.user.hasCompletedOnboarding, false);
    });

    test("REG06: Login rejects invalid password for directly registered user with 401 Unauthorized", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.valid.email,
                password: "WrongPassword999!"
            })
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, "Invalid email or password");
    });

    test("REG07: Completing onboarding persists state and subsequent logins reflect hasCompletedOnboarding: true", async () => {
        // Log in to get token
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

        // Complete onboarding
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

        // Verify subsequent login reflects completed onboarding
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

    test("REG08: Registration clears any legacy pending registration records for that email", async () => {
        const legacyEmail = "legacy.pending@taskflow.dev";

        // Seed a stale pending registration record
        await prisma.pending_registrations.upsert({
            where: { email: legacyEmail },
            update: { otp_hash: "stale_hash", verification_attempts: 2 },
            create: {
                email: legacyEmail,
                first_name: "Legacy",
                last_name: "Pending",
                password_hash: "stale_hash",
                otp_hash: "stale_hash",
                otp_expires_at: new Date(Date.now() + 10000),
                verification_attempts: 2
            }
        });

        // Register user
        const res = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Legacy",
                lastName: "Pending",
                email: legacyEmail,
                password: testPassword
            })
        });
        assert.equal(res.status, 200);

        // Verify pending record was deleted
        const pending = await prisma.pending_registrations.findUnique({
            where: { email: legacyEmail }
        });
        assert.equal(pending, null, "Legacy pending registration must be purged upon direct registration");

        // Verify permanent user exists
        const user = await prisma.users.findUnique({
            where: { email: legacyEmail }
        });
        assert.ok(user, "Permanent user must exist");

        // Cleanup
        await prisma.users.deleteMany({ where: { email: legacyEmail } }).catch(() => {});
    });

    test("REG09: Password reset functionality and email dispatch remain fully functional", async () => {
        capturedMails = [];
        let resetToken;

        // Request password reset for existing user
        const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testUsers.existing.email })
        });
        assert.equal(forgotRes.status, 200);

        // Verify mail dispatch was called
        assert.equal(capturedMails.length, 1);
        assert.equal(capturedMails[0].type, "PASSWORD_RESET");
        assert.equal(capturedMails[0].email, testUsers.existing.email.toLowerCase());
        assert.ok(capturedMails[0].resetLink, "Reset link must be present in dispatch");

        // Extract reset token from resetLink
        const url = new URL(capturedMails[0].resetLink);
        resetToken = url.searchParams.get("token");
        assert.ok(resetToken, "Token parameter must exist in resetUrl");

        // Reset password with token
        const newPassword = "BrandNewPassword456!";
        const resetRes = await fetch(`${baseUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: resetToken,
                password: newPassword
            })
        });
        assert.equal(resetRes.status, 200);

        // Verify login works with new password
        const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testUsers.existing.email,
                password: newPassword
            })
        });
        assert.equal(newLoginRes.status, 200);
    });
});
