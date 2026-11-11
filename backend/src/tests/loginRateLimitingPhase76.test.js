import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import app from "../app.js";
import prisma from "../config/prisma.js";
import {
    loginRateLimiter,
    loginAccountRateLimiter,
    createAccountLoginRateLimiter
} from "../middleware/rateLimiter.js";

describe("PHASE 7.6: Login Rate-Limiting & Account-Level Failure Protection Test Suite", () => {
    let server;
    let baseApiUrl;
    let testUserA;
    let testUserB;
    let userRole;
    const passwordA = "Phase76PassA123!";
    const passwordB = "Phase76PassB123!";

    before(async () => {
        userRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!userRole) throw new Error("Team Member role missing in database");

        // Hash passwords
        const hashA = await bcrypt.hash(passwordA, 10);
        const hashB = await bcrypt.hash(passwordB, 10);

        testUserA = await prisma.users.upsert({
            where: { email: "phase76_user_a@taskflow.dev" },
            update: { password_hash: hashA, is_active: true, has_completed_onboarding: true },
            create: {
                role_id: userRole.id,
                email: "phase76_user_a@taskflow.dev",
                first_name: "Phase76",
                last_name: "UserA",
                password_hash: hashA,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        testUserB = await prisma.users.upsert({
            where: { email: "phase76_user_b@taskflow.dev" },
            update: { password_hash: hashB, is_active: true, has_completed_onboarding: true },
            create: {
                role_id: userRole.id,
                email: "phase76_user_b@taskflow.dev",
                first_name: "Phase76",
                last_name: "UserB",
                password_hash: hashB,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        try {
            if (testUserA) {
                await prisma.users.delete({ where: { id: testUserA.id } });
            }
            if (testUserB) {
                await prisma.users.delete({ where: { id: testUserB.id } });
            }
        } catch (cleanupErr) {
            console.error("Cleanup error in Phase 7.6 test suite:", cleanupErr.message);
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await prisma.$disconnect();
    });

    beforeEach(() => {
        loginRateLimiter.reset();
        loginAccountRateLimiter.reset();
    });

    test("1. Successful logins (HTTP 200) do NOT consume IP failed-attempt quota (Refund verification)", async () => {
        const clientIp = "10.76.1.10";

        // Perform 35 successful logins from the same client IP (exceeding standard 30 limit)
        for (let i = 0; i < 35; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: "phase76_user_a@taskflow.dev",
                    password: passwordA
                })
            });

            assert.equal(res.status, 200, `Login attempt ${i + 1} failed unexpectedly with status ${res.status}`);
            const data = await res.json();
            assert.equal(data.message, "Login successful");
        }

        // Verify that successful logins were refunded and did not accumulate quota
        assert.equal(loginRateLimiter.getKeyCount(clientIp), 0);
        assert.equal(loginAccountRateLimiter.getAccountFailures("phase76_user_a@taskflow.dev"), 0);
    });

    test("2. Incorrect passwords (HTTP 401) consume IP quota and increment account failure strikes", async () => {
        const clientIp = "10.76.1.11";
        const email = "phase76_user_a@taskflow.dev";

        // Perform 4 failed logins with bad passwords
        for (let i = 0; i < 4; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email,
                    password: "IncorrectPassword123!"
                })
            });

            assert.equal(res.status, 401);
            const data = await res.json();
            assert.equal(data.message, "Invalid email or password");
        }

        // Hits must be retained
        assert.equal(loginRateLimiter.getKeyCount(clientIp), 4);
        assert.equal(loginAccountRateLimiter.getAccountFailures(email), 4);
    });

    test("3. Progressive throttling engages after 5 failed attempts on an account (temporary cooldown)", async () => {
        const clientIp = "10.76.1.12";
        const email = "phase76_user_a@taskflow.dev";

        // Submit 5 failed attempts
        for (let i = 0; i < 5; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email,
                    password: "WrongPassword999!"
                })
            });
            assert.equal(res.status, 401);
        }

        assert.equal(loginAccountRateLimiter.getAccountFailures(email), 5);

        // Attempt 6 sent immediately (< 15s) must be throttled with HTTP 429
        const throttledRes = await fetch(`${baseApiUrl}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email,
                password: "WrongPassword999!"
            })
        });

        assert.equal(throttledRes.status, 429);
        const throttledData = await throttledRes.json();
        assert.equal(
            throttledData.message,
            "Too many failed login attempts for this account. Please wait before trying again."
        );
        assert.ok(throttledData.retryAfter >= 1 && throttledData.retryAfter <= 15);
        assert.ok(throttledRes.headers.get("retry-after"));
    });

    test("4. Successful authentication clears account failure strikes immediately", async () => {
        const clientIp = "10.76.1.13";
        const email = "phase76_user_a@taskflow.dev";

        // Accumulate 4 failures (below 5-strike cooldown threshold)
        for (let i = 0; i < 4; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email,
                    password: "WrongPassword!"
                })
            });
            assert.equal(res.status, 401);
        }

        assert.equal(loginAccountRateLimiter.getAccountFailures(email), 4);

        // Now authenticate with correct password
        const successRes = await fetch(`${baseApiUrl}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email,
                password: passwordA
            })
        });

        assert.equal(successRes.status, 200);

        // Strikes must be completely cleared to 0
        assert.equal(loginAccountRateLimiter.getAccountFailures(email), 0);
    });

    test("5. Account isolation: Another account from the same IP is unaffected by first account's throttle", async () => {
        const clientIp = "10.76.1.14";

        // Trigger throttle on User A (5 failed attempts)
        for (let i = 0; i < 5; i++) {
            await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: "phase76_user_a@taskflow.dev",
                    password: "WrongPassword!"
                })
            });
        }

        // User A is now throttled
        const resA = await fetch(`${baseApiUrl}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email: "phase76_user_a@taskflow.dev",
                password: passwordA
            })
        });
        assert.equal(resA.status, 429);

        // User B from the SAME IP logs in successfully with HTTP 200
        const resB = await fetch(`${baseApiUrl}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email: "phase76_user_b@taskflow.dev",
                password: passwordB
            })
        });

        assert.equal(resB.status, 200);
        const dataB = await resB.json();
        assert.equal(dataB.message, "Login successful");
    });

    test("6. IP-level rate limiting stops password spraying (31st attempt across distinct accounts blocked)", async () => {
        const clientIp = "10.76.1.15";

        // Send 30 failed login attempts across 30 different emails from the same IP
        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: `spray_target_${i}@example.com`,
                    password: "Password123!"
                })
            });
            assert.equal(res.status, 401, `Attempt ${i + 1} was prematurely blocked`);
        }

        assert.equal(loginRateLimiter.getKeyCount(clientIp), 30);

        // 31st request from this IP must be blocked by loginRateLimiter with HTTP 429
        const blockedRes = await fetch(`${baseApiUrl}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                email: "spray_target_31@example.com",
                password: "Password123!"
            })
        });

        assert.equal(blockedRes.status, 429);
        const blockedData = await blockedRes.json();
        assert.equal(blockedData.message, "Too many login attempts. Please try again later.");
        assert.ok(blockedData.retryAfter >= 1);
        assert.ok(blockedRes.headers.get("retry-after"));
    });

    test("7. Malformed requests (HTTP 400) and missing credentials do NOT consume account or IP quota", async () => {
        const clientIp = "10.76.1.16";

        // Send 10 malformed requests with missing email or password
        for (let i = 0; i < 10; i++) {
            const res = await fetch(`${baseApiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: i % 2 === 0 ? "some_email@test.com" : undefined,
                    password: i % 2 === 1 ? "some_pass" : undefined
                })
            });

            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, "Email and password are required");
        }

        // IP quota must be completely refunded
        assert.equal(loginRateLimiter.getKeyCount(clientIp), 0);
        assert.equal(loginAccountRateLimiter.getAccountFailures("some_email@test.com"), 0);
    });

    test("8. Concurrency safety: UUID-based tracking reliably refunds concurrent requests without collisions", async () => {
        const clientIp = "10.76.1.17";

        // Launch 20 concurrent requests simultaneously:
        // - 10 successful logins (should be refunded on 200)
        // - 10 failed logins with distinct emails (should remain counted in IP quota on 401)
        const requests = [];

        for (let i = 0; i < 10; i++) {
            requests.push(
                fetch(`${baseApiUrl}/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Forwarded-For": clientIp
                    },
                    body: JSON.stringify({
                        email: "phase76_user_b@taskflow.dev",
                        password: passwordB
                    })
                })
            );

            requests.push(
                fetch(`${baseApiUrl}/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Forwarded-For": clientIp
                    },
                    body: JSON.stringify({
                        email: `concurrent_fail_${i}@test.com`,
                        password: "WrongPassword!"
                    })
                })
            );
        }

        const responses = await Promise.all(requests);
        const statusCodes = responses.map((r) => r.status);

        const count200 = statusCodes.filter((c) => c === 200).length;
        const count401 = statusCodes.filter((c) => c === 401).length;

        assert.equal(count200, 10, "Expected all 10 valid logins to return 200");
        assert.equal(count401, 10, "Expected all 10 invalid logins to return 401");

        // Exactly the 10 failed logins must be counted; the 10 successful logins must have been refunded
        assert.equal(loginRateLimiter.getKeyCount(clientIp), 10);
    });

    test("9. Reaching 10 failed attempts triggers hard window lockout for that account", () => {
        // Fast deterministic unit test using createAccountLoginRateLimiter with 0s cooldownStepSec
        const customLimiter = createAccountLoginRateLimiter({
            windowMs: 15 * 60 * 1000,
            maxFailures: 10,
            throttleThreshold: 5,
            cooldownStepSec: 0,
            maxCooldownSec: 0
        });

        const targetEmail = "lockout_target@taskflow.dev";

        // Simulate 10 failed attempts
        for (let i = 0; i < 10; i++) {
            let nextCalled = false;
            let statusCode = 401;
            const req = { body: { email: targetEmail } };
            const finishListeners = [];
            const res = {
                statusCode: 401,
                setHeader: () => {},
                status: (code) => ({ json: (d) => ({ code, d }) }),
                on: (event, handler) => {
                    if (event === "finish") finishListeners.push(handler);
                }
            };

            customLimiter(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, true, `Attempt ${i + 1} should proceed to next()`);

            // Trigger finish
            finishListeners.forEach((h) => h());
        }

        assert.equal(customLimiter.getAccountFailures(targetEmail), 10);

        // 11th attempt must be rejected with hard window lockout
        let nextCalledOn11 = false;
        let blockedStatus = null;
        let blockedData = null;
        const req11 = { body: { email: targetEmail } };
        const res11 = {
            setHeader: () => {},
            status: (code) => {
                blockedStatus = code;
                return {
                    json: (d) => { blockedData = d; }
                };
            },
            on: () => {}
        };

        customLimiter(req11, res11, () => { nextCalledOn11 = true; });

        assert.equal(nextCalledOn11, false, "11th attempt must NOT call next()");
        assert.equal(blockedStatus, 429);
        assert.equal(
            blockedData.message,
            "Too many failed login attempts for this account. Please try again later."
        );
        assert.ok(blockedData.retryAfter >= 1);
    });
});
