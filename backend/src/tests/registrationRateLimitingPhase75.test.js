import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { setMailMock } from "../services/mailService.js";
import {
    registerRateLimiter,
    registerEmailRateLimiter,
    createRateLimiter
} from "../middleware/rateLimiter.js";

describe("Phase 7.5: Registration Rate Limiting & Capacity Hardening", () => {
    let server;
    let baseApiUrl;
    let existingUser;
    let defaultRole;
    const testPassword = "SecurePassword123!";

    before(async () => {
        // Use mock email service to keep tests fast and deterministic without external SMTP calls
        setMailMock((mail) => {
            return Promise.resolve({ messageId: `mock-msg-${Date.now()}` });
        });

        defaultRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!defaultRole) {
            defaultRole = await prisma.roles.findFirst();
        }

        // Clean up test users / pending records
        await prisma.pending_registrations.deleteMany({
            where: { email: { contains: "phase75_" } }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { email: { contains: "phase75_" } }
        }).catch(() => {});

        // Pre-create an existing user to test duplicate email (HTTP 409) handling
        existingUser = await prisma.users.create({
            data: {
                first_name: "Existing",
                last_name: "Member",
                email: "phase75_existing_member@taskflow.dev",
                password_hash: "$2b$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ1234567890abcdefghij",
                role_id: defaultRole.id,
                has_completed_onboarding: true
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        setMailMock(null);

        try {
            await prisma.pending_registrations.deleteMany({
                where: { email: { contains: "phase75_" } }
            }).catch(() => {});

            await prisma.users.deleteMany({
                where: { email: { contains: "phase75_" } }
            }).catch(() => {});
        } catch (_) {}

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    beforeEach(() => {
        registerRateLimiter.reset();
        registerEmailRateLimiter.reset();
    });

    // -------------------------------------------------------------------------
    // TEST 1: 30 Registrations Allowed & 31st Rejected
    // -------------------------------------------------------------------------
    test("1. IP-based registration limiter allows up to 30 requests and rejects the 31st with HTTP 429", async () => {
        const clientIp = "203.0.113.10";

        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "User",
                    lastName: `${i}`,
                    email: `phase75_quota_${i}@taskflow.dev`,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200, `Registration ${i + 1} failed unexpectedly with status ${res.status}`);
        }

        // 31st request must be rate limited
        const blockedRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "User",
                lastName: "31",
                email: "phase75_quota_31@taskflow.dev",
                password: testPassword
            })
        });

        assert.equal(blockedRes.status, 429);
        const data = await blockedRes.json();
        assert.equal(data.message, "Too many accounts created from this IP. Please try again later.");
        assert.ok(data.retryAfter >= 1, "Expected retryAfter to be positive");
        assert.ok(blockedRes.headers.get("retry-after"), "Expected Retry-After header");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Window Expiry Restores Capacity
    // -------------------------------------------------------------------------
    test("2. Expiration of the rolling window restores registration capacity", async () => {
        const clientIp = "203.0.113.20";

        // Create a test limiter with a short 200ms window to test expiry mechanics
        const fastLimiter = createRateLimiter({
            windowMs: 200,
            max: 2,
            message: "Too many accounts created from this IP. Please try again later."
        });

        const req = { ip: clientIp, headers: {} };
        let nextCalled = 0;
        const dummyNext = () => { nextCalled++; };
        const dummyRes = {
            setHeader: () => {},
            status: (s) => ({ json: (d) => ({ status: s, ...d }) })
        };

        // Two hits succeed
        fastLimiter(req, dummyRes, dummyNext);
        fastLimiter(req, dummyRes, dummyNext);
        assert.equal(nextCalled, 2);

        // Third hit within window is blocked
        let blockedResult = null;
        const blockRes = {
            setHeader: () => {},
            status: (s) => ({ json: (d) => { blockedResult = { status: s, ...d }; } })
        };
        fastLimiter(req, blockRes, dummyNext);
        assert.equal(blockedResult?.status, 429);
        assert.equal(nextCalled, 2);

        // Wait for window to expire (>200ms)
        await new Promise((resolve) => setTimeout(resolve, 250));

        // After window expiry, capacity is restored
        fastLimiter(req, dummyRes, dummyNext);
        assert.equal(nextCalled, 3, "Expected capacity to be restored after window expiration");
    });

    // -------------------------------------------------------------------------
    // TEST 3: Multiple Legitimate Emails from One IP
    // -------------------------------------------------------------------------
    test("3. Multiple distinct legitimate emails from a single IP register without email-throttle conflict", async () => {
        const clientIp = "203.0.113.30";
        const emails = [
            "phase75_colleague_1@taskflow.dev",
            "phase75_colleague_2@taskflow.dev",
            "phase75_colleague_3@taskflow.dev",
            "phase75_colleague_4@taskflow.dev",
            "phase75_colleague_5@taskflow.dev"
        ];

        for (const email of emails) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Colleague",
                    lastName: "Tester",
                    email,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200, `Registration for ${email} should succeed`);
            const data = await res.json();
            assert.equal(data.email, email);
        }
    });

    // -------------------------------------------------------------------------
    // TEST 4: Repeated Attempts Against One Email Throttled
    // -------------------------------------------------------------------------
    test("4. Repeated registration attempts for the same email address are throttled by registerEmailRateLimiter (5 max)", async () => {
        const targetEmail = "phase75_target_repeated@taskflow.dev";

        // Send 5 registrations for the same email from different IPs (rotating IPs)
        for (let i = 0; i < 5; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": `203.0.113.${40 + i}`
                },
                body: JSON.stringify({
                    firstName: "Target",
                    lastName: `${i}`,
                    email: targetEmail,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200, `Attempt ${i + 1} for target email should succeed`);

            // Delete user record between attempts to test registerEmailRateLimiter against repeated attempts
            await prisma.users.deleteMany({
                where: { email: targetEmail }
            });
        }

        // 6th attempt for this email from a completely new IP must be rejected with HTTP 429
        const blockedRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": "203.0.113.99"
            },
            body: JSON.stringify({
                firstName: "Target",
                lastName: "Blocked",
                email: targetEmail,
                password: testPassword
            })
        });

        assert.equal(blockedRes.status, 429);
        const data = await blockedRes.json();
        assert.equal(data.message, "Too many registration attempts for this email address. Please check your inbox or try again later.");
        assert.ok(data.retryAfter >= 1);
    });

    // -------------------------------------------------------------------------
    // TEST 5: Malformed Payloads (HTTP 400) Do NOT Consume Legitimate Quota
    // -------------------------------------------------------------------------
    test("5. Malformed requests (HTTP 400) do NOT consume legitimate IP registration quota", async () => {
        const clientIp = "203.0.113.50";

        // Send 15 invalid requests (missing fields / short passwords)
        for (let i = 0; i < 15; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    email: `phase75_invalid_${i}@taskflow.dev`,
                    password: "short" // < 6 chars -> HTTP 400
                })
            });

            assert.equal(res.status, 400);
        }

        // Now verify that the IP can STILL submit all 30 valid registrations
        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Valid",
                    lastName: `${i}`,
                    email: `phase75_valid_after_invalid_${i}@taskflow.dev`,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200, `Valid registration ${i + 1} should succeed despite previous 400s`);
        }

        // 31st valid registration must now be blocked
        const blockedRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "Valid",
                lastName: "31",
                email: "phase75_valid_31@taskflow.dev",
                password: testPassword
            })
        });

        assert.equal(blockedRes.status, 429);
    });

    // -------------------------------------------------------------------------
    // TEST 6: Duplicate Email (HTTP 409) Does NOT Consume Quota
    // -------------------------------------------------------------------------
    test("6. Duplicate email conflicts (HTTP 409) do NOT consume legitimate IP registration quota", async () => {
        const clientIp = "203.0.113.60";

        // Attempt to register the pre-existing user 10 times -> all return HTTP 409
        for (let i = 0; i < 10; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Existing",
                    lastName: "Member",
                    email: existingUser.email,
                    password: testPassword
                })
            });

            assert.equal(res.status, 409);
            const data = await res.json();
            assert.equal(data.message, "Email already registered");
        }

        // The IP can still execute all 30 valid registrations
        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Fresh",
                    lastName: `${i}`,
                    email: `phase75_fresh_after_409_${i}@taskflow.dev`,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200, `Valid registration ${i + 1} should succeed despite previous 409s`);
        }

        // 31st is rejected
        const blockedRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "Fresh",
                lastName: "31",
                email: "phase75_fresh_31@taskflow.dev",
                password: testPassword
            })
        });

        assert.equal(blockedRes.status, 429);
    });

    // -------------------------------------------------------------------------
    // TEST 7: SMTP Delivery Failure Does NOT Leave Unusable Pending Registrations
    // -------------------------------------------------------------------------
    test("7. Registration succeeds even during SMTP outages (registration OTP temporarily disabled)", async () => {
        const clientIp = "203.0.113.70";
        const testEmail = "phase75_smtp_failure_test@taskflow.dev";

        // Force mail mock to fail simulating an SMTP network/credential outage
        setMailMock(() => Promise.reject(new Error("SMTP connection failed: ETIMEDOUT")));

        const res = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": clientIp
            },
            body: JSON.stringify({
                firstName: "SMTP",
                lastName: "Fail",
                email: testEmail,
                password: testPassword
            })
        });

        // Direct registration bypasses SMTP OTP dependency
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, "User registered successfully");

        // Verify database: permanent user was created directly
        const permanentUser = await prisma.users.findUnique({
            where: { email: testEmail }
        });
        assert.ok(permanentUser, "Permanent user created directly without SMTP bottleneck");

        // Clean up test user
        await prisma.users.deleteMany({ where: { email: testEmail } });

        // Restore healthy mail mock
        setMailMock((mail) => Promise.resolve({ messageId: "healthy-id" }));

        // Verify remaining valid registrations succeed up to limit
        for (let i = 0; i < 29; i++) {
            const okRes = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": clientIp
                },
                body: JSON.stringify({
                    firstName: "Recovered",
                    lastName: `${i}`,
                    email: `phase75_recovered_${i}@taskflow.dev`,
                    password: testPassword
                })
            });
            assert.equal(okRes.status, 200);
        }
    });

    // -------------------------------------------------------------------------
    // TEST 8: Express Trust Proxy 1 Hop Security
    // -------------------------------------------------------------------------
    test("8. Express trust proxy configured for 1 hop extracts client IP securely without trusting spoofed chains", async () => {
        // Spoofed IP chain: client sends "10.0.0.1, 198.51.100.80"
        // With app.set('trust proxy', 1), Express trusts only 1 hop from the direct connection,
        // correctly isolating the client IP to the last hop before the proxy: 198.51.100.80
        const spoofedHeader = "10.0.0.1, 198.51.100.80";

        for (let i = 0; i < 30; i++) {
            const res = await fetch(`${baseApiUrl}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Forwarded-For": spoofedHeader
                },
                body: JSON.stringify({
                    firstName: "Trust",
                    lastName: "Proxy",
                    email: `phase75_trust_proxy_${i}@taskflow.dev`,
                    password: testPassword
                })
            });
            assert.equal(res.status, 200);
        }

        // 31st request with same header is blocked
        const blocked = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": spoofedHeader
            },
            body: JSON.stringify({
                firstName: "Trust",
                lastName: "Blocked",
                email: "phase75_trust_proxy_blocked@taskflow.dev",
                password: testPassword
            })
        });
        assert.equal(blocked.status, 429);

        // A different IP is NOT blocked
        const diffIpRes = await fetch(`${baseApiUrl}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": "198.51.100.90"
            },
            body: JSON.stringify({
                firstName: "Diff",
                lastName: "Ip",
                email: "phase75_diff_ip@taskflow.dev",
                password: testPassword
            })
        });
        assert.equal(diffIpRes.status, 200, "Different client IP must not be blocked");
    });
});
