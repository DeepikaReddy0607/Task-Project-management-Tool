import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import app from "../app.js";
import prisma from "../config/prisma.js";
import {
    resetPassword,
    ensureUsedPasswordResetTokensTable
} from "../services/authService.js";
import {
    loginRateLimiter,
    loginAccountRateLimiter,
    registerRateLimiter,
    registerEmailRateLimiter,
    forgotPasswordRateLimiter
} from "../middleware/rateLimiter.js";
import { getAllowedOrigins } from "../config/cors.js";

describe("PHASE 22B: Security Hardening Test Suite (Single-Use Tokens, Rate Limiting & Strict CORS)", () => {
    let server;
    let baseApiUrl;
    let testUser;
    let userRole;
    const testPassword = "InitialPassword123!";

    before(async () => {
        userRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!userRole) throw new Error("Team Member role missing in database");

        await ensureUsedPasswordResetTokensTable();

        const passwordHash = await bcrypt.hash(testPassword, 10);
        testUser = await prisma.users.upsert({
            where: { email: "phase22b_security_tester@taskflow.dev" },
            update: { password_hash: passwordHash, is_active: true },
            create: {
                email: "phase22b_security_tester@taskflow.dev",
                first_name: "SecHardened",
                last_name: "Tester",
                password_hash: passwordHash,
                role_id: userRole.id,
                is_active: true
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        try {
            if (testUser?.id) {
                await prisma.$executeRawUnsafe(
                    `DELETE FROM taskflow.used_password_reset_tokens WHERE user_id = $1::uuid`,
                    testUser.id
                );
                await prisma.users.delete({
                    where: { id: testUser.id }
                });
            }
        } catch (cleanupErr) {
            console.error("Cleanup error in Phase 22B test suite:", cleanupErr.message);
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    beforeEach(() => {
        loginRateLimiter.reset();
        loginAccountRateLimiter.reset();
        registerRateLimiter.reset();
        registerEmailRateLimiter.reset();
        forgotPasswordRateLimiter.reset();
    });

    // =========================================================================
    // DEFECT 1: SINGLE-USE PASSWORD RESET TOKENS & CONCURRENCY PROTECTION
    // =========================================================================

    test("1. Valid password reset token successfully updates user password (HTTP 200)", async () => {
        const resetSecret = process.env.RESET_PASSWORD_SECRET || "fallback_secret";
        const token = jwt.sign(
            {
                userId: testUser.id,
                purpose: "password-reset",
                jti: crypto.randomUUID()
            },
            resetSecret,
            { expiresIn: "15m" }
        );

        const newPassword = "NewValidSecurePass123!";
        const res = await fetch(`${baseApiUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password: newPassword })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, "Password reset successful");

        // Verify database password hash was updated
        const updated = await prisma.users.findUnique({ where: { id: testUser.id } });
        const isMatch = await bcrypt.compare(newPassword, updated.password_hash);
        assert.equal(isMatch, true);
    });

    test("2. Successfully used password reset token cannot be reused (HTTP 400)", async () => {
        const resetSecret = process.env.RESET_PASSWORD_SECRET || "fallback_secret";
        const token = jwt.sign(
            {
                userId: testUser.id,
                purpose: "password-reset",
                jti: crypto.randomUUID()
            },
            resetSecret,
            { expiresIn: "15m" }
        );

        // First use: must succeed
        const res1 = await fetch(`${baseApiUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password: "FirstPasswordChange1!" })
        });
        assert.equal(res1.status, 200);

        // Second use (replay attempt within 15m window): must be rejected with 400
        const res2 = await fetch(`${baseApiUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password: "MaliciousReplayChange2!" })
        });
        assert.equal(res2.status, 400);
        const data2 = await res2.json();
        assert.equal(data2.message, "Password reset token has already been used");
    });

    test("3. Expired password reset token is strictly rejected (HTTP 400)", async () => {
        const resetSecret = process.env.RESET_PASSWORD_SECRET || "fallback_secret";
        const expiredToken = jwt.sign(
            {
                userId: testUser.id,
                purpose: "password-reset",
                jti: crypto.randomUUID()
            },
            resetSecret,
            { expiresIn: "-1s" } // Expired 1 second ago
        );

        const res = await fetch(`${baseApiUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: expiredToken, password: "ShouldNeverApply123!" })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Reset link is invalid or expired");
    });

    test("4. Invalid password reset token is strictly rejected (HTTP 400)", async () => {
        // Wrong purpose token
        const wrongPurposeToken = jwt.sign(
            {
                userId: testUser.id,
                purpose: "auth-login"
            },
            process.env.RESET_PASSWORD_SECRET || "fallback_secret",
            { expiresIn: "15m" }
        );

        const res1 = await fetch(`${baseApiUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: wrongPurposeToken, password: "ShouldFailPassword1!" })
        });
        assert.equal(res1.status, 400);
        const data1 = await res1.json();
        assert.equal(data1.message, "Invalid password reset token");

        // Completely forged/garbage token
        const res2 = await fetch(`${baseApiUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: "invalid.forged.jwt.token", password: "ShouldFailPassword1!" })
        });
        assert.equal(res2.status, 400);
        const data2 = await res2.json();
        assert.equal(data2.message, "Reset link is invalid or expired");
    });

    test("5. Concurrent reuse attempts cannot reset the password more than once", async () => {
        const resetSecret = process.env.RESET_PASSWORD_SECRET || "fallback_secret";
        const token = jwt.sign(
            {
                userId: testUser.id,
                purpose: "password-reset",
                jti: crypto.randomUUID()
            },
            resetSecret,
            { expiresIn: "15m" }
        );

        // Fire 5 concurrent requests simultaneously using the exact same reset token
        const concurrentPromises = [1, 2, 3, 4, 5].map((idx) =>
            fetch(`${baseApiUrl}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token,
                    password: `ConcurrentPass${idx}123!`
                })
            })
        );

        const responses = await Promise.all(concurrentPromises);
        const statusCodes = responses.map((r) => r.status);

        // Exactly ONE request must succeed (HTTP 200)
        const successCount = statusCodes.filter((code) => code === 200).length;
        assert.equal(successCount, 1, `Expected exactly 1 success, but got: ${JSON.stringify(statusCodes)}`);

        // All other 4 concurrent requests must be rejected with HTTP 400
        const rejectedCount = statusCodes.filter((code) => code === 400).length;
        assert.equal(rejectedCount, 4);

        // Verify the rejected responses indicate already used token
        const rejectedResponses = responses.filter((r) => r.status === 400);
        for (const rej of rejectedResponses) {
            const body = await rej.json();
            assert.equal(body.message, "Password reset token has already been used");
        }
    });

    // =========================================================================
    // DEFECT 2: AUTHENTICATION RATE LIMITING TESTS
    // =========================================================================

    test("6. Login rate limiting allows up to 30 attempts and rejects the 31st with HTTP 429", async () => {
        const clientIp = "192.168.1.101";

        // Make 30 requests (all should pass through rate limiter, will get 401 for wrong credentials)
        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: `login_quota_${i}@test.com`,
                    password: "wrongpassword"
                })
            });
            // Should reach controller (either 401 invalid creds or 400) - NOT 429
            assert.notEqual(res.status, 429, `Attempt ${i + 1} was prematurely rate limited`);
        }

        // 31st request must exceed rate limit and return HTTP 429
        const blockedRes = await fetch(`${baseApiUrl}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email: "login_quota_31@test.com",
                password: "wrongpassword"
            })
        });

        assert.equal(blockedRes.status, 429);
        const blockedData = await blockedRes.json();
        assert.equal(blockedData.message, "Too many login attempts. Please try again later.");
        assert.ok(blockedData.retryAfter >= 1);
        assert.ok(blockedRes.headers.get("retry-after"));
    });

    test("7. Registration rate limiting allows up to 30 requests and rejects the 31st with HTTP 429", async () => {
        const clientIp = "192.168.1.102";

        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Rate",
                    lastName: "Tester",
                    email: `register_quota_${i}@test.com`,
                    password: "Password123!"
                })
            });
            assert.notEqual(res.status, 429, `Registration attempt ${i + 1} was prematurely blocked`);
        }

        // 31st request must return 429
        const blockedRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "Rate",
                lastName: "Tester",
                email: "register_quota_31@test.com",
                password: "Password123!"
            })
        });

        assert.equal(blockedRes.status, 429);
        const blockedData = await blockedRes.json();
        assert.equal(blockedData.message, "Too many accounts created from this IP. Please try again later.");
        assert.ok(blockedData.retryAfter >= 1);
        assert.ok(blockedRes.headers.get("retry-after"));
    });

    test("8. Forgot-password rate limiting allows up to 5 requests and rejects the 6th with HTTP 429", async () => {
        const clientIp = "192.168.1.103";

        for (let i = 0; i < 5; i++) {
            const res = await fetch(`${baseApiUrl}/auth/forgot-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: "any_user@taskflow.dev"
                })
            });
            assert.equal(res.status, 200);
        }

        // 6th request must exceed rate limit
        const blockedRes = await fetch(`${baseApiUrl}/auth/forgot-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email: "any_user@taskflow.dev"
            })
        });

        assert.equal(blockedRes.status, 429);
        const blockedData = await blockedRes.json();
        assert.equal(blockedData.message, "Too many password reset requests. Please try again later.");
    });

    test("9. Rate limiting isolates client IPs: Client B is not blocked when Client A is limited", async () => {
        const ipA = "10.0.0.1";
        const ipB = "10.0.0.2";

        // Exhaust ipA forgot-password quota (5 requests)
        for (let i = 0; i < 5; i++) {
            await fetch(`${baseApiUrl}/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Forwarded-For": ipA },
                body: JSON.stringify({ email: "user@test.com" })
            });
        }

        // ipA is blocked
        const blockedA = await fetch(`${baseApiUrl}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": ipA },
            body: JSON.stringify({ email: "user@test.com" })
        });
        assert.equal(blockedA.status, 429);

        // ipB is allowed through cleanly
        const allowedB = await fetch(`${baseApiUrl}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": ipB },
            body: JSON.stringify({ email: "user@test.com" })
        });
        assert.equal(allowedB.status, 200);
    });

    // =========================================================================
    // DEFECT 3: STRICT CORS ALLOWLIST & CREDENTIAL HANDLING TESTS
    // =========================================================================

    test("10. Allowed origin returns Access-Control-Allow-Origin and Access-Control-Allow-Credentials: true", async () => {
        const allowedOrigin = "http://localhost:5173";

        const res = await fetch(`${baseApiUrl}/health`, {
            method: "GET",
            headers: {
                Origin: allowedOrigin
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    });

    test("11. Preflight OPTIONS request for allowed origin succeeds with 204 and CORS headers", async () => {
        const allowedOrigin = "http://localhost:5173";

        const res = await fetch(`${baseApiUrl}/auth/login`, {
            method: "OPTIONS",
            headers: {
                Origin: allowedOrigin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type, Authorization"
            }
        });

        assert.equal(res.status, 204);
        assert.equal(res.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(res.headers.get("access-control-allow-credentials"), "true");
        assert.ok(res.headers.get("access-control-allow-methods")?.includes("POST"));
    });

    test("12. Disallowed origin is strictly rejected with HTTP 403 Forbidden and NO allow-origin header", async () => {
        const evilOrigin = "https://malicious-attacker-site.com";

        const res = await fetch(`${baseApiUrl}/health`, {
            method: "GET",
            headers: {
                Origin: evilOrigin
            }
        });

        assert.equal(res.status, 403);
        assert.equal(res.headers.get("access-control-allow-origin"), null);

        const data = await res.json();
        assert.equal(data.message, "CORS policy violation: Origin not allowed");
    });

    test("13. Preflight OPTIONS request for disallowed origin is rejected with HTTP 403 Forbidden", async () => {
        const evilOrigin = "https://phishing-site.xyz";

        const res = await fetch(`${baseApiUrl}/auth/login`, {
            method: "OPTIONS",
            headers: {
                Origin: evilOrigin,
                "Access-Control-Request-Method": "POST"
            }
        });

        assert.equal(res.status, 403);
        assert.equal(res.headers.get("access-control-allow-origin"), null);
    });

    test("14. Non-browser requests without Origin header succeed normally without CORS block", async () => {
        // Direct curl / backend / test runner request without an Origin header
        const res = await fetch(`${baseApiUrl}/health`, {
            method: "GET"
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "OK");
    });

    test("15. getAllowedOrigins respects FRONTEND_URL and ALLOWED_ORIGINS environment configuration", () => {
        const origins = getAllowedOrigins();
        assert.ok(Array.isArray(origins));
        assert.ok(origins.includes("http://localhost:5173"));
        assert.ok(origins.includes("http://127.0.0.1:5173"));
    });
});
