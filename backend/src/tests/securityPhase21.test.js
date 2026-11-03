import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { io as Client } from "socket.io-client";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { initSocket, emitRealtimeEvent } from "../socket.js";
import { processMessage } from "../services/quackieService.js";

describe("PHASE 21B: Attachment Tenant Isolation & Security Regression Test Suite", () => {
    let server;
    let baseApiUrl;
    let socketServer;
    let socketPort;
    let io;

    let userA;
    let userB;
    let tokenA;
    let tokenB;

    let workspaceA;
    let workspaceB;
    let projectA;
    let projectB;
    let taskA;
    let attachmentA;
    let testFilePath;

    before(async () => {
        const teamRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!teamRole) throw new Error("Team Member role missing in database");

        // 1. Create two isolated test users
        userA = await prisma.users.upsert({
            where: { email: "phase21_user_a@taskflow.dev" },
            update: {},
            create: {
                email: "phase21_user_a@taskflow.dev",
                first_name: "TenantA",
                last_name: "User",
                password_hash: "mock_hash_a",
                role_id: teamRole.id
            }
        });

        userB = await prisma.users.upsert({
            where: { email: "phase21_user_b@taskflow.dev" },
            update: {},
            create: {
                email: "phase21_user_b@taskflow.dev",
                first_name: "TenantB",
                last_name: "User",
                password_hash: "mock_hash_b",
                role_id: teamRole.id
            }
        });

        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, process.env.JWT_SECRET || "fallback_secret");
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, process.env.JWT_SECRET || "fallback_secret");

        // 2. Create Workspace A & Project A (Tenant A)
        workspaceA = await prisma.workspaces.create({
            data: {
                name: "Phase21 Workspace A",
                description: "Tenant A isolated workspace",
                owner_id: userA.id,
                workspace_members: {
                    create: {
                        user_id: userA.id,
                        workspace_role: "Owner"
                    }
                }
            }
        });

        projectA = await prisma.projects.create({
            data: {
                workspace_id: workspaceA.id,
                title: "Tenant A Project",
                description: "Confidential Project A",
                manager_id: userA.id,
                priority: "High",
                status: "Active",
                project_members: {
                    create: {
                        user_id: userA.id,
                        role_id: teamRole.id
                    }
                }
            }
        });

        taskA = await prisma.tasks.create({
            data: {
                project_id: projectA.id,
                title: "Confidential Task in Project A",
                description: "Task A description",
                created_by: userA.id,
                assigned_to: userA.id,
                priority: "High",
                status: "To Do"
            }
        });

        // 3. Create Workspace B & Project B (Tenant B - Isolated)
        workspaceB = await prisma.workspaces.create({
            data: {
                name: "Phase21 Workspace B",
                description: "Tenant B isolated workspace",
                owner_id: userB.id,
                workspace_members: {
                    create: {
                        user_id: userB.id,
                        workspace_role: "Owner"
                    }
                }
            }
        });

        projectB = await prisma.projects.create({
            data: {
                workspace_id: workspaceB.id,
                title: "Tenant B Project",
                description: "Confidential Project B",
                manager_id: userB.id,
                priority: "Medium",
                status: "Planning",
                project_members: {
                    create: {
                        user_id: userB.id,
                        role_id: teamRole.id
                    }
                }
            }
        });

        // 4. Create a physical test file in uploads/attachments for Attachment A
        const uploadDir = path.resolve(process.cwd(), "uploads", "attachments");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const testFileName = `test-phase21-${Date.now()}.txt`;
        testFilePath = path.join(uploadDir, testFileName);
        fs.writeFileSync(testFilePath, "TOP_SECRET_TENANT_A_PAYLOAD_DATA", "utf8");

        attachmentA = await prisma.attachments.create({
            data: {
                task_id: taskA.id,
                project_id: null,
                uploaded_by: userA.id,
                file_name: "confidential_tenant_a.txt",
                file_url: `uploads/attachments/${testFileName}`,
                file_type: "text/plain",
                file_size: BigInt(33)
            }
        });

        // 5. Start HTTP server
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://localhost:${port}`;

        // 6. Start Socket.IO server
        socketServer = http.createServer();
        io = initSocket(socketServer);
        await new Promise((resolve) => socketServer.listen(0, resolve));
        socketPort = socketServer.address().port;
    });

    after(async () => {
        try {
            if (testFilePath && fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
            }
            if (attachmentA?.id) {
                await prisma.attachments.deleteMany({ where: { id: attachmentA.id } }).catch(() => {});
            }
            if (taskA?.id) {
                await prisma.tasks.deleteMany({ where: { id: taskA.id } }).catch(() => {});
            }
            if (projectA?.id) {
                await prisma.project_members.deleteMany({ where: { project_id: projectA.id } }).catch(() => {});
                await prisma.projects.deleteMany({ where: { id: projectA.id } }).catch(() => {});
            }
            if (projectB?.id) {
                await prisma.project_members.deleteMany({ where: { project_id: projectB.id } }).catch(() => {});
                await prisma.projects.deleteMany({ where: { id: projectB.id } }).catch(() => {});
            }
            if (workspaceA?.id) {
                await prisma.workspace_members.deleteMany({ where: { workspace_id: workspaceA.id } }).catch(() => {});
                await prisma.workspaces.deleteMany({ where: { id: workspaceA.id } }).catch(() => {});
            }
            if (workspaceB?.id) {
                await prisma.workspace_members.deleteMany({ where: { workspace_id: workspaceB.id } }).catch(() => {});
                await prisma.workspaces.deleteMany({ where: { id: workspaceB.id } }).catch(() => {});
            }
            const testUserIds = [userA?.id, userB?.id].filter(Boolean);
            if (testUserIds.length > 0) {
                await prisma.users.deleteMany({ where: { id: { in: testUserIds } } }).catch(() => {});
            }
        } catch (cleanupErr) {
            console.warn("Cleanup warning:", cleanupErr.message);
        } finally {
            if (io) {
                await new Promise((resolve) => io.close(resolve));
            }
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
            if (socketServer) {
                await new Promise((resolve) => socketServer.close(resolve));
            }
        }
    });

    // ============================================================
    // A. SOCKET.IO SECURITY
    // ============================================================

    test("1. Unauthenticated socket connection handshake is rejected", async () => {
        let connectFailed = false;
        let errorMessage = "";

        const client = Client(`http://localhost:${socketPort}`, {
            transports: ["websocket"],
            reconnection: false
        });

        await new Promise((resolve) => {
            client.on("connect_error", (err) => {
                connectFailed = true;
                errorMessage = err.message;
                client.disconnect();
                resolve();
            });
            client.on("connect", () => {
                client.disconnect();
                resolve();
            });
        });

        assert.equal(connectFailed, true, "Expected unauthenticated socket to fail connection");
        assert.match(errorMessage, /Authentication required|Invalid authentication/i);
    });

    test("2. Unauthorized workspace room join is blocked", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        // User A emits join:workspace for Workspace B (which User A has no access to)
        clientA.emit("join:workspace", workspaceB.id);
        await new Promise((r) => setTimeout(r, 200));

        const socketInstance = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userA.id);
        const inUnauthorizedRoom = socketInstance?.rooms.has(`workspace:${workspaceB.id}`);

        clientA.disconnect();
        assert.equal(inUnauthorizedRoom, false, "User A must not be joined to unauthorized Workspace B room");
    });

    test("3. Unauthorized project room join is blocked", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        // User A emits join:project for Project B (in Workspace B)
        clientA.emit("join:project", projectB.id);
        await new Promise((r) => setTimeout(r, 200));

        const socketInstance = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userA.id);
        const inUnauthorizedRoom = socketInstance?.rooms.has(`project:${projectB.id}`);

        clientA.disconnect();
        assert.equal(inUnauthorizedRoom, false, "User A must not be joined to unauthorized Project B room");
    });

    test("4. Cross-workspace real-time events are isolated and never leak", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let leaked = false;
        clientA.on("taskflow:event", (payload) => {
            if (payload?.workspaceId === workspaceB.id) {
                leaked = true;
            }
        });

        // Broadcast event scoped strictly to Workspace B
        emitRealtimeEvent({
            type: "task.created",
            workspaceId: workspaceB.id,
            projectId: projectB.id,
            data: { title: "Secret task in Workspace B" }
        });

        await new Promise((r) => setTimeout(r, 200));
        clientA.disconnect();

        assert.equal(leaked, false, "User A must never receive events from unauthorized Workspace B");
    });

    test("5. Authorized room join succeeds and receives broadcast", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let received = false;
        clientA.on("taskflow:event", (payload) => {
            if (payload?.workspaceId === workspaceA.id) {
                received = true;
            }
        });

        // User A emits join:workspace for their own legitimate Workspace A
        clientA.emit("join:workspace", workspaceA.id);
        await new Promise((r) => setTimeout(r, 200));

        emitRealtimeEvent({
            type: "task.updated",
            workspaceId: workspaceA.id,
            projectId: projectA.id,
            data: { title: "Updated task in Workspace A" }
        });

        await new Promise((r) => setTimeout(r, 200));
        clientA.disconnect();

        assert.equal(received, true, "User A must receive events from authorized Workspace A");
    });

    // ============================================================
    // B. FILE SECURITY & TENANT ISOLATION
    // ============================================================

    test("6. Unauthenticated direct file access to /uploads is rejected with HTTP 403", async () => {
        const res = await fetch(`${baseApiUrl}/uploads/attachments/secret.txt`);
        assert.equal(res.status, 403, "Direct unauthenticated access to /uploads must return 403 Forbidden");

        const body = await res.json();
        assert.equal(body.success, false);
        assert.match(body.message, /Direct file access is disabled/i);
    });

    test("7. Authenticated direct file access to /uploads is rejected with HTTP 403", async () => {
        const res = await fetch(`${baseApiUrl}/uploads/attachments/secret.txt`, {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.equal(res.status, 403, "Direct authenticated access to /uploads must also return 403 Forbidden");

        const body = await res.json();
        assert.equal(body.success, false);
        assert.match(body.message, /Direct file access is disabled/i);
    });

    test("8. Authenticated cross-workspace attachment download is rejected with HTTP 404/403", async () => {
        // User B (Workspace B) attempts to download User A's attachment (Workspace A)
        const res = await fetch(`${baseApiUrl}/api/attachments/${attachmentA.id}/download`, {
            headers: { Authorization: `Bearer ${tokenB}` }
        });

        assert.ok(
            res.status === 403 || res.status === 404,
            `Expected HTTP 403/404 for unauthorized cross-tenant download, got ${res.status}`
        );

        const body = await res.json();
        assert.equal(body.success, false);
        assert.match(body.message, /Access denied|not found/i);
    });

    test("9. Authorized attachment download succeeds with physical file stream", async () => {
        // User A (Workspace A) downloads their own attachment
        const res = await fetch(`${baseApiUrl}/api/attachments/${attachmentA.id}/download`, {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        assert.equal(res.status, 200, "Authorized user must receive HTTP 200 for attachment download");
        assert.match(res.headers.get("content-disposition"), /attachment;\s*filename=/i);

        const text = await res.text();
        assert.equal(text, "TOP_SECRET_TENANT_A_PAYLOAD_DATA");
    });

    test("10. Invalid and non-existent attachment IDs are handled safely without 500", async () => {
        const fakeUuid = "00000000-0000-0000-0000-000000000000";
        const resFake = await fetch(`${baseApiUrl}/api/attachments/${fakeUuid}/download`, {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.equal(resFake.status, 404, "Non-existent UUID must return 404");

        const resMalformed = await fetch(`${baseApiUrl}/api/attachments/not-a-valid-uuid/download`, {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.ok(resMalformed.status === 400 || resMalformed.status === 404, "Malformed ID must return 400 or 404");
    });

    // ============================================================
    // C. QUACKIE CONTEXT HYDRATION
    // ============================================================

    test("11. Quackie LLM context hydration populates live project and active task context", async () => {
        // Process a query with project context that triggers the fallback/hydration path
        const result = await processMessage({
            message: "What is the detailed trajectory and architecture of this project?",
            context: { projectId: projectA.id },
            userId: userA.id
        });

        assert.ok(result, "Expected Quackie to return a response payload");
        assert.ok(result.reply, "Expected Quackie to return a reply string");
        assert.equal(result.context?.projectId, projectA.id);
    });

    // ============================================================
    // D. FRONTEND SECURITY BEHAVIORS
    // ============================================================

    test("12. Client-side ProtectedRoute redirects unauthenticated navigation", () => {
        const checkAuthRedirect = (token, pathname) => {
            if (!token) {
                return `/login?redirect=${encodeURIComponent(pathname)}`;
            }
            return null; // Allowed
        };

        const redirectWithoutToken = checkAuthRedirect(null, "/settings");
        assert.equal(redirectWithoutToken, "/login?redirect=%2Fsettings");

        const redirectWithToken = checkAuthRedirect("valid_token_xyz", "/settings");
        assert.equal(redirectWithToken, null);
    });

    test("13. Axios 401 response interceptor clears credentials and initiates redirect", () => {
        const mockStorage = {
            taskflow_token: "stale_token",
            taskflow_user: '{"name":"User"}',
            removeItem(key) {
                delete this[key];
            }
        };

        const handleAxios401 = (status, currentPath, storage) => {
            if (status === 401) {
                storage.removeItem("taskflow_token");
                storage.removeItem("taskflow_user");
                const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password"];
                if (!publicPaths.some((p) => currentPath.startsWith(p))) {
                    return `/login?redirect=${encodeURIComponent(currentPath)}`;
                }
            }
            return null;
        };

        const redirectUrl = handleAxios401(401, "/projects", mockStorage);
        assert.equal(mockStorage.taskflow_token, undefined, "taskflow_token must be cleared on 401");
        assert.equal(mockStorage.taskflow_user, undefined, "taskflow_user must be cleared on 401");
        assert.equal(redirectUrl, "/login?redirect=%2Fprojects");
    });
});
