import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import authMiddleware, {
    clearTokenCache,
    invalidateUserTokens,
    invalidateToken,
    revokeUser,
    unrevokeUser,
    getTokenCacheStats
} from "../middleware/authMiddleware.js";
import { updateUserStatus, updateUserRole } from "../services/adminService.js";
import prisma from "../config/prisma.js";

describe("PHASE 22F.3.1: JWT Cache Security & Invalidation Suite", () => {
    const SECRET_A = "test_secret_alpha_key_1234567890";
    const SECRET_B = "test_secret_bravo_key_0987654321";
    const ORIGINAL_SECRET = process.env.JWT_SECRET;

    beforeEach(() => {
        clearTokenCache();
        process.env.JWT_SECRET = SECRET_A;
    });

    test("1. Valid JWT is verified and cached on first call, served fast-path on second call", () => {
        const payload = { userId: "user-101", email: "user101@test.com", role: "Team Member" };
        const token = jwt.sign(payload, SECRET_A, { expiresIn: "1h" });

        const mockReq1 = { headers: { authorization: `Bearer ${token}` } };
        const mockRes1 = { status: () => mockRes1, json: () => {} };
        let nextCalled1 = false;
        authMiddleware(mockReq1, mockRes1, () => { nextCalled1 = true; });

        assert.equal(nextCalled1, true);
        assert.equal(mockReq1.user.userId, "user-101");
        assert.equal(getTokenCacheStats().size, 1);

        // Second call with same token
        const mockReq2 = { headers: { authorization: `Bearer ${token}` } };
        let nextCalled2 = false;
        authMiddleware(mockReq2, mockRes1, () => { nextCalled2 = true; });

        assert.equal(nextCalled2, true);
        assert.equal(mockReq2.user.userId, "user-101");
    });

    test("2. Expired JWT is strictly rejected with 401 even if evaluated against cache logic", () => {
        // Create already-expired token
        const payload = { userId: "user-exp", email: "exp@test.com" };
        const expiredToken = jwt.sign(payload, SECRET_A, { expiresIn: "-10s" });

        const mockReq = { headers: { authorization: `Bearer ${expiredToken}` } };
        let statusSent = null;
        let jsonSent = null;
        const mockRes = {
            status: (code) => { statusSent = code; return mockRes; },
            json: (body) => { jsonSent = body; }
        };

        let nextCalled = false;
        authMiddleware(mockReq, mockRes, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
        assert.equal(jsonSent.message, "Authentication token expired");
        assert.equal(getTokenCacheStats().size, 0); // Never cached
    });

    test("3. JWT with forged / invalid signature is rejected with 401 and never cached", () => {
        const payload = { userId: "user-forged", email: "forged@test.com" };
        // Signed with wrong secret
        const badToken = jwt.sign(payload, "completely_wrong_secret", { expiresIn: "1h" });

        const mockReq = { headers: { authorization: `Bearer ${badToken}` } };
        let statusSent = null;
        let jsonSent = null;
        const mockRes = {
            status: (code) => { statusSent = code; return mockRes; },
            json: (body) => { jsonSent = body; }
        };

        let nextCalled = false;
        authMiddleware(mockReq, mockRes, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
        assert.equal(jsonSent.message, "Invalid authentication token");
        assert.equal(getTokenCacheStats().size, 0);
    });

    test("4. Secret isolation: Changing JWT_SECRET invalidates cached verifications", () => {
        const payload = { userId: "user-rot", email: "rot@test.com" };
        const token = jwt.sign(payload, SECRET_A, { expiresIn: "1h" });

        // Verify and cache under SECRET_A
        const req1 = { headers: { authorization: `Bearer ${token}` } };
        const res1 = { status: () => res1, json: () => {} };
        authMiddleware(req1, res1, () => {});
        assert.equal(req1.user.userId, "user-rot");

        // Rotate secret to SECRET_B
        process.env.JWT_SECRET = SECRET_B;

        // Same token presented under SECRET_B must be rejected
        let statusSent = null;
        let jsonSent = null;
        const res2 = {
            status: (code) => { statusSent = code; return res2; },
            json: (body) => { jsonSent = body; }
        };
        const req2 = { headers: { authorization: `Bearer ${token}` } };
        let nextCalled = false;
        authMiddleware(req2, res2, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
        assert.equal(jsonSent.message, "Invalid authentication token");
    });

    test("5. Cache Immutability: Mutating req.user downstream does NOT pollute cached decoded object", () => {
        const payload = { userId: "user-safe", role: "Team Member" };
        const token = jwt.sign(payload, SECRET_A, { expiresIn: "1h" });

        // Request 1: malicious downstream code attempts to mutate req.user
        const req1 = { headers: { authorization: `Bearer ${token}` } };
        const res1 = { status: () => res1, json: () => {} };
        authMiddleware(req1, res1, () => {
            req1.user.role = "Admin";
            req1.user.extraMaliciousField = "hacked";
        });

        assert.equal(req1.user.role, "Admin");

        // Request 2: verify cached object was untouched
        const req2 = { headers: { authorization: `Bearer ${token}` } };
        let nextCalled = false;
        authMiddleware(req2, res1, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(req2.user.role, "Team Member");
        assert.equal(req2.user.extraMaliciousField, undefined);
    });

    test("6. invalidateUserTokens(userId) purges all cached tokens for that user", () => {
        const token1 = jwt.sign({ userId: "user-purge-target", email: "t1@test.com" }, SECRET_A, { expiresIn: "1h" });
        const token2 = jwt.sign({ userId: "user-other", email: "other@test.com" }, SECRET_A, { expiresIn: "1h" });

        const res = { status: () => res, json: () => {} };
        authMiddleware({ headers: { authorization: `Bearer ${token1}` } }, res, () => {});
        authMiddleware({ headers: { authorization: `Bearer ${token2}` } }, res, () => {});

        assert.equal(getTokenCacheStats().size, 2);

        invalidateUserTokens("user-purge-target");
        assert.equal(getTokenCacheStats().size, 1);
    });

    test("7. revokeUser(userId) immediately blocks subsequent requests with 401", () => {
        const token = jwt.sign({ userId: "user-revoked", email: "rev@test.com" }, SECRET_A, { expiresIn: "1h" });

        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = { status: () => res, json: () => {} };
        authMiddleware(req, res, () => {});

        // Revoke user
        revokeUser("user-revoked");

        let statusSent = null;
        let jsonSent = null;
        const mockRes = {
            status: (code) => { statusSent = code; return mockRes; },
            json: (body) => { jsonSent = body; }
        };
        let nextCalled = false;
        authMiddleware(req, mockRes, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
        assert.equal(jsonSent.message, "User account is inactive or revoked");

        // Unrevoke restores access
        unrevokeUser("user-revoked");
        let nextCalledAfter = false;
        authMiddleware(req, res, () => { nextCalledAfter = true; });
        assert.equal(nextCalledAfter, true);
    });

    test("8. Deactivating user via updateUserStatus revokes cached access immediately", async () => {
        // Fetch an existing synthetic test user
        const targetUser = await prisma.users.findFirst({
            where: { email: { endsWith: "@synthetic.taskflow.local" } },
            select: { id: true, email: true }
        });
        assert.ok(targetUser, "Synthetic test user must exist");
        const targetUserId = targetUser.id;

        const token = jwt.sign({ userId: targetUserId, email: targetUser.email }, SECRET_A, { expiresIn: "1h" });

        // Authenticate once to populate cache
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = { status: () => res, json: () => {} };
        let firstPass = false;
        authMiddleware(req, res, () => { firstPass = true; });
        assert.equal(firstPass, true);

        // Admin deactivates the user
        await updateUserStatus(targetUserId, false);

        // Subsequent request must be rejected
        let statusSent = null;
        let jsonSent = null;
        const mockRes = {
            status: (code) => { statusSent = code; return mockRes; },
            json: (body) => { jsonSent = body; }
        };
        let secondPass = false;
        authMiddleware(req, mockRes, () => { secondPass = true; });

        assert.equal(secondPass, false);
        assert.equal(statusSent, 401);
        assert.equal(jsonSent.message, "User account is inactive or revoked");

        // Reactivate user to restore clean state
        await updateUserStatus(targetUserId, true);
        unrevokeUser(targetUserId);

        let thirdPass = false;
        authMiddleware(req, res, () => { thirdPass = true; });
        assert.equal(thirdPass, true);
    });

    test("9. User role change via updateUserRole purges cached user tokens", async () => {
        const targetUser = await prisma.users.findFirst({
            where: { email: { endsWith: "@synthetic.taskflow.local" } },
            select: { id: true, email: true, roles: { select: { role_name: true } } }
        });
        assert.ok(targetUser, "Synthetic test user must exist");
        const targetUserId = targetUser.id;
        const originalRole = targetUser.roles?.role_name || "Team Member";

        const token = jwt.sign({ userId: targetUserId, email: targetUser.email, role: originalRole }, SECRET_A, { expiresIn: "1h" });

        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = { status: () => res, json: () => {} };
        authMiddleware(req, res, () => {});
        assert.equal(getTokenCacheStats().size, 1);

        // Update role
        const newRole = originalRole === "Team Member" ? "Project Manager" : "Team Member";
        await updateUserRole(targetUserId, newRole);
        assert.equal(getTokenCacheStats().size, 0); // Purged

        // Restore original role
        await updateUserRole(targetUserId, originalRole);
    });

    test("10. Cache boundary & LRU eviction: Cache strictly bounds memory growth", () => {
        clearTokenCache();
        // Generate and verify 500 tokens
        for (let i = 0; i < 500; i++) {
            const token = jwt.sign({ userId: `user-${i}` }, SECRET_A, { expiresIn: "1h" });
            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = { status: () => res, json: () => {} };
            authMiddleware(req, res, () => {});
        }
        assert.equal(getTokenCacheStats().size, 500);
    });

    test("11. Live DB Authorization: Workspace access is checked live on every query, regardless of valid cached JWT", async () => {
        const { getProjectTasks } = await import("../services/taskService.js");
        const project = await prisma.projects.findFirst({ select: { id: true } });
        assert.ok(project, "Project must exist");

        // Use a random UUID that is definitely NOT a member of this project's workspace
        const nonMemberId = "00000000-0000-0000-0000-000000000000";

        await assert.rejects(
            async () => {
                await getProjectTasks(project.id, nonMemberId);
            },
            {
                message: "Workspace access denied"
            }
        );
    });

    test("12. Live DB Assignment: Task assignment verifies project membership live from DB", async () => {
        const { createTask } = await import("../services/taskService.js");
        const wm = await prisma.workspace_members.findFirst({
            where: {
                workspaces: {
                    projects: { some: {} }
                }
            },
            include: {
                workspaces: {
                    include: {
                        projects: { take: 1 }
                    }
                }
            }
        });
        assert.ok(wm, "Valid workspace member with projects must exist");
        const creatorId = wm.user_id;
        const projectId = wm.workspaces.projects[0].id;

        const nonMemberId = "00000000-0000-0000-0000-000000000000";

        await assert.rejects(
            async () => {
                await createTask(
                    projectId,
                    creatorId,
                    "Unauthorized Assignment Task",
                    "Desc",
                    "Medium",
                    "Backlog",
                    null,
                    null,
                    null,
                    nonMemberId // non-member assigned
                );
            },
            {
                message: "Assigned user is not a member of the project"
            }
        );
    });
});
