import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import app from "../app.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import { setMailMock } from "../services/mailService.js";

describe("Onboarding Routing & State Persistence Test Suite", () => {
    let server;
    let baseUrl;
    let userNew;
    let userExisting;
    let tokenNew;
    let tokenExisting;
    let role;
    const testPassword = "Password123!";

    before(async () => {
        role = await prisma.roles.findFirst();
        if (!role) throw new Error("No roles found in database");

        // Clean up prior test users if present
        await prisma.pending_registrations.deleteMany({
            where: {
                email: {
                    in: [
                        "test_onboarding_new@taskflow.dev",
                        "test_onboarding_existing@taskflow.dev",
                        "test_register_flow@taskflow.dev"
                    ]
                }
            }
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: {
                email: {
                    in: [
                        "test_onboarding_new@taskflow.dev",
                        "test_onboarding_existing@taskflow.dev",
                        "test_register_flow@taskflow.dev"
                    ]
                }
            }
        });

        const hashedPassword = await bcrypt.hash(testPassword, 10);

        // Create a new user with has_completed_onboarding: false
        userNew = await prisma.users.create({
            data: {
                email: "test_onboarding_new@taskflow.dev",
                first_name: "New",
                last_name: "User",
                password_hash: hashedPassword,
                role_id: role.id,
                has_completed_onboarding: false,
            }
        });

        // Create an existing user with has_completed_onboarding: true
        userExisting = await prisma.users.create({
            data: {
                email: "test_onboarding_existing@taskflow.dev",
                first_name: "Existing",
                last_name: "User",
                password_hash: hashedPassword,
                role_id: role.id,
                has_completed_onboarding: true,
            }
        });

        const secret = process.env.JWT_SECRET || "fallback_secret";
        tokenNew = jwt.sign({ userId: userNew.id, email: userNew.email }, secret, { expiresIn: "1h" });
        tokenExisting = jwt.sign({ userId: userExisting.id, email: userExisting.email }, secret, { expiresIn: "1h" });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        setMailMock(null);
        await prisma.pending_registrations.deleteMany({
            where: {
                email: {
                    in: [
                        "test_onboarding_new@taskflow.dev",
                        "test_onboarding_existing@taskflow.dev",
                        "test_register_flow@taskflow.dev"
                    ]
                }
            }
        }).catch(() => {});
        await prisma.users.deleteMany({
            where: {
                email: {
                    in: [
                        "test_onboarding_new@taskflow.dev",
                        "test_onboarding_existing@taskflow.dev",
                        "test_register_flow@taskflow.dev"
                    ]
                }
            }
        }).catch(() => {});
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await prisma.$disconnect().catch(() => {});
        setTimeout(() => process.exit(0), 100);
    });

    test("1. Direct user registration creates permanent user with hasCompletedOnboarding: false", async () => {
        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                firstName: "Reg",
                lastName: "User",
                email: "test_register_flow@taskflow.dev",
                password: testPassword,
            })
        });
        assert.equal(regRes.status, 200);
        const data = await regRes.json();
        assert.equal(data.user.hasCompletedOnboarding, false);

        const permanent = await prisma.users.findUnique({
            where: { email: "test_register_flow@taskflow.dev" }
        });
        assert.ok(permanent, "Permanent user must exist directly in DB without OTP");
        assert.equal(permanent.has_completed_onboarding, false);
    });

    test("2. First-time login endpoint returns hasCompletedOnboarding: false", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: userNew.email,
                password: testPassword,
            })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, false);
    });

    test("3. Returning user login endpoint returns hasCompletedOnboarding: true", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: userExisting.email,
                password: testPassword,
            })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, true);
    });

    test("4. New user profile reflects hasCompletedOnboarding: false", async () => {
        const res = await fetch(`${baseUrl}/users/profile`, {
            headers: { Authorization: `Bearer ${tokenNew}` }
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, false);
    });

    test("5. POST /api/users/onboarding/complete requires authentication (401)", async () => {
        const res = await fetch(`${baseUrl}/users/onboarding/complete`, {
            method: "POST"
        });
        assert.equal(res.status, 401);
    });

    test("6. POST /api/users/onboarding/complete marks onboarding complete in DB and returns success", async () => {
        const res = await fetch(`${baseUrl}/users/onboarding/complete`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenNew}`,
                "Content-Type": "application/json"
            }
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, true);

        // Verify directly in database
        const updatedUser = await prisma.users.findUnique({
            where: { id: userNew.id }
        });
        assert.equal(updatedUser.has_completed_onboarding, true);
    });

    test("7. GET /api/users/profile returns hasCompletedOnboarding: true after completion", async () => {
        const res = await fetch(`${baseUrl}/users/profile`, {
            headers: { Authorization: `Bearer ${tokenNew}` }
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, true);
    });

    test("8. Login after completion returns hasCompletedOnboarding: true", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: userNew.email,
                password: testPassword,
            })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.user.hasCompletedOnboarding, true);
    });
});
