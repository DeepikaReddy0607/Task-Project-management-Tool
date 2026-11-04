import "dotenv/config";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import { io as Client } from "socket.io-client";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { initSocket, emitRealtimeEvent } from "../socket.js";

describe("PHASE 22E: Realtime Reliability & Collaboration Test Suite", () => {
    let server;
    let baseApiUrl;
    let socketServer;
    let socketPort;
    let io;

    let userA;
    let userB;
    let deactivatedUser;
    let tokenA;
    let tokenB;
    let deactivatedToken;
    let expiredToken;

    let workspaceA;
    let workspaceB;
    let projectA;
    let projectB;

    before(async () => {
        const teamRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!teamRole) throw new Error("Team Member role missing in database");

        // 1. Create test users
        userA = await prisma.users.upsert({
            where: { email: "phase22e_user_a@taskflow.dev" },
            update: { is_active: true },
            create: {
                email: "phase22e_user_a@taskflow.dev",
                first_name: "RealtimeA",
                last_name: "User",
                password_hash: "mock_hash_22e_a",
                is_active: true,
                role_id: teamRole.id
            }
        });

        userB = await prisma.users.upsert({
            where: { email: "phase22e_user_b@taskflow.dev" },
            update: { is_active: true },
            create: {
                email: "phase22e_user_b@taskflow.dev",
                first_name: "RealtimeB",
                last_name: "User",
                password_hash: "mock_hash_22e_b",
                is_active: true,
                role_id: teamRole.id
            }
        });

        deactivatedUser = await prisma.users.upsert({
            where: { email: "phase22e_deactivated@taskflow.dev" },
            update: { is_active: false },
            create: {
                email: "phase22e_deactivated@taskflow.dev",
                first_name: "Deactivated",
                last_name: "User",
                password_hash: "mock_hash_22e_deact",
                is_active: false,
                role_id: teamRole.id
            }
        });

        const secret = process.env.JWT_SECRET || "fallback_secret";
        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "2h" });
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, secret, { expiresIn: "2h" });
        deactivatedToken = jwt.sign({ userId: deactivatedUser.id, email: deactivatedUser.email }, secret, { expiresIn: "2h" });
        expiredToken = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "-10s" });

        // 2. Create Workspace A & Project A (User A)
        workspaceA = await prisma.workspaces.create({
            data: {
                name: "Phase22E Workspace A",
                description: "Tenant A realtime workspace",
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
                description: "Realtime Project A",
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

        // 3. Create Workspace B & Project B (User B - Isolated)
        workspaceB = await prisma.workspaces.create({
            data: {
                name: "Phase22E Workspace B",
                description: "Tenant B realtime workspace",
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
                description: "Realtime Project B",
                manager_id: userB.id,
                priority: "Medium",
                status: "Active",
                project_members: {
                    create: {
                        user_id: userB.id,
                        role_id: teamRole.id
                    }
                }
            }
        });

        // 4. Start HTTP & Socket Servers
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://localhost:${port}`;

        socketServer = http.createServer();
        io = initSocket(socketServer);
        await new Promise((resolve) => socketServer.listen(0, resolve));
        socketPort = socketServer.address().port;
    });

    after(async () => {
        try {
            if (projectA?.id) {
                await prisma.project_members.deleteMany({ where: { project_id: projectA.id } }).catch(() => {});
                await prisma.tasks.deleteMany({ where: { project_id: projectA.id } }).catch(() => {});
                await prisma.projects.deleteMany({ where: { id: projectA.id } }).catch(() => {});
            }
            if (projectB?.id) {
                await prisma.project_members.deleteMany({ where: { project_id: projectB.id } }).catch(() => {});
                await prisma.tasks.deleteMany({ where: { project_id: projectB.id } }).catch(() => {});
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
            const testUserIds = [userA?.id, userB?.id, deactivatedUser?.id].filter(Boolean);
            if (testUserIds.length > 0) {
                await prisma.users.deleteMany({ where: { id: { in: testUserIds } } }).catch(() => {});
            }
        } catch (cleanupErr) {
            console.warn("Phase22E Cleanup warning:", cleanupErr.message);
        } finally {
            if (io) {
                io.disconnectSockets(true);
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
    // 1. SOCKET.IO AUTHENTICATION
    // ============================================================

    test("1. Valid JWT establishes authenticated socket connection", async () => {
        const client = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve, reject) => {
            client.on("connect", resolve);
            client.on("connect_error", reject);
        });

        assert.equal(client.connected, true);
        client.disconnect();
    });

    test("2. Missing token is rejected with Authentication required", async () => {
        const client = Client(`http://localhost:${socketPort}`, {
            transports: ["websocket"]
        });

        const error = await new Promise((resolve) => {
            client.on("connect_error", (err) => resolve(err));
            client.on("connect", () => resolve(null));
        });

        client.disconnect();
        assert.ok(error, "Expected connect_error on missing token");
        assert.match(error.message, /Authentication required/i);
    });

    test("3. Invalid/malformed token is rejected with Invalid authentication token", async () => {
        const client = Client(`http://localhost:${socketPort}`, {
            auth: { token: "bad.jwt.token" },
            transports: ["websocket"]
        });

        const error = await new Promise((resolve) => {
            client.on("connect_error", (err) => resolve(err));
            client.on("connect", () => resolve(null));
        });

        client.disconnect();
        assert.ok(error, "Expected connect_error on invalid token");
        assert.match(error.message, /Invalid authentication token/i);
    });

    test("4. Expired token is rejected with Invalid authentication token", async () => {
        const client = Client(`http://localhost:${socketPort}`, {
            auth: { token: expiredToken },
            transports: ["websocket"]
        });

        const error = await new Promise((resolve) => {
            client.on("connect_error", (err) => resolve(err));
            client.on("connect", () => resolve(null));
        });

        client.disconnect();
        assert.ok(error, "Expected connect_error on expired token");
        assert.match(error.message, /Invalid authentication token/i);
    });

    test("5. Deactivated user token is rejected with User account is inactive or not found", async () => {
        const client = Client(`http://localhost:${socketPort}`, {
            auth: { token: deactivatedToken },
            transports: ["websocket"]
        });

        const error = await new Promise((resolve) => {
            client.on("connect_error", (err) => resolve(err));
            client.on("connect", () => resolve(null));
        });

        client.disconnect();
        assert.ok(error, "Expected connect_error on deactivated user");
        assert.match(error.message, /User account is inactive or not found/i);
    });

    // ============================================================
    // 2. ROOM ISOLATION & TENANCY
    // ============================================================

    test("6. User A connects and auto-joins their workspace and user rooms", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        const socketInstance = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userA.id);
        assert.ok(socketInstance, "Socket instance must exist on server");
        assert.equal(socketInstance.rooms.has(`user:${userA.id}`), true, "Must be in personal user room");
        assert.equal(socketInstance.rooms.has(`workspace:${workspaceA.id}`), true, "Must be in workspaceA room");
        assert.equal(socketInstance.rooms.has(`workspace:${workspaceB.id}`), false, "Must NOT be in workspaceB room");

        clientA.disconnect();
    });

    test("7. Cross-tenant event leakage prevention: User A never receives User B workspace events", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let receivedLeakedEvent = false;
        clientA.on("taskflow:event", (payload) => {
            if (payload?.workspaceId === workspaceB.id) {
                receivedLeakedEvent = true;
            }
        });

        emitRealtimeEvent({
            type: "task.created",
            workspaceId: workspaceB.id,
            projectId: projectB.id,
            data: { id: "secret-task-b", title: "Secret task for Tenant B" }
        });

        await new Promise((r) => setTimeout(r, 150));
        clientA.disconnect();

        assert.equal(receivedLeakedEvent, false, "Tenant A must never receive events targeted to Workspace B");
    });

    test("8. User-specific notification room isolation", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let userAReceivedNotification = false;
        clientA.on("taskflow:event", (payload) => {
            if (payload?.type === "notification.created") {
                userAReceivedNotification = true;
            }
        });

        // Emit notification targeted only to User B
        emitRealtimeEvent({
            type: "notification.created",
            userId: userB.id,
            data: {
                notification: {
                    id: "notif-b-private",
                    message: "Private alert for user B"
                }
            }
        });

        await new Promise((r) => setTimeout(r, 150));
        clientA.disconnect();

        assert.equal(userAReceivedNotification, false, "User A must not receive User B private notifications");
    });

    // ============================================================
    // 3. SENSITIVE DATA PROTECTION
    // ============================================================

    test("9. project.member_added realtime payload NEVER exposes password_hash", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let receivedPayload = null;
        clientA.on("taskflow:event", (payload) => {
            if (payload?.type === "project.member_added") {
                receivedPayload = payload;
            }
        });

        // Add User B to Project A via authorized API
        // First add User B to Workspace A
        const teamRole = await prisma.roles.findFirst({ where: { role_name: "Team Member" } });
        await prisma.workspace_members.create({
            data: {
                workspace_id: workspaceA.id,
                user_id: userB.id,
                workspace_role: "Member"
            }
        });

        const addRes = await fetch(`${baseApiUrl}/api/projects/${projectA.id}/members`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                userId: userB.id,
                role: "Team Member"
            })
        });

        assert.equal(addRes.status, 201);
        const addBody = await addRes.json();
        assert.equal(addBody.member.users.password_hash, undefined, "REST response must not leak password_hash");

        await new Promise((r) => setTimeout(r, 150));
        clientA.disconnect();

        assert.ok(receivedPayload, "Realtime event project.member_added must be received");
        assert.equal(receivedPayload.data.users.password_hash, undefined, "Realtime payload must never expose password_hash");
    });

    // ============================================================
    // 4. EVENT EMISSION CORRECTNESS
    // ============================================================

    test("10. Failed database mutation does NOT emit any realtime event", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let unexpectedEvent = false;
        clientA.on("taskflow:event", () => {
            unexpectedEvent = true;
        });

        // Submit invalid task creation (e.g. startDate > dueDate)
        const res = await fetch(`${baseApiUrl}/api/projects/${projectA.id}/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                title: "Invalid Dates Task",
                startDate: "2026-12-31",
                dueDate: "2026-01-01"
            })
        });

        assert.equal(res.status, 400, "Validation failure must return 400 Bad Request");
        await new Promise((r) => setTimeout(r, 150));
        clientA.disconnect();

        assert.equal(unexpectedEvent, false, "Failed mutation must NEVER emit a realtime event");
    });

    test("11. Multi-room targeted events are delivered without duplicate event fires", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));

        let eventCount = 0;
        clientA.on("taskflow:event", (payload) => {
            if (payload?.type === "task.updated" && payload?.data?.id === "dedupe-test-task") {
                eventCount += 1;
            }
        });

        // Client A belongs to both workspaceA and projectA rooms
        // Emit an event targeting both rooms simultaneously
        emitRealtimeEvent({
            type: "task.updated",
            workspaceId: workspaceA.id,
            projectId: projectA.id,
            data: { id: "dedupe-test-task", title: "Testing single delivery" }
        });

        await new Promise((r) => setTimeout(r, 150));
        clientA.disconnect();

        assert.equal(eventCount, 1, "Socket.IO must deliver multi-room event exactly ONCE to a client in both rooms");
    });

    // ============================================================
    // 5. MEMBER REMOVAL & DYNAMIC EVICTION
    // ============================================================

    test("12. Removed workspace member is evicted from workspace and project rooms and cannot rejoin", async () => {
        const clientB = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenB },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientB.on("connect", resolve));

        // User B joins Workspace A room
        clientB.emit("join:workspace", workspaceA.id);
        clientB.emit("join:project", projectA.id);
        await new Promise((r) => setTimeout(r, 150));

        const socketB = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userB.id);
        assert.equal(socketB.rooms.has(`workspace:${workspaceA.id}`), true);

        // Remove User B from Workspace A via API
        const removeRes = await fetch(`${baseApiUrl}/api/workspaces/${workspaceA.id}/members/${userB.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.equal(removeRes.status, 200);

        await new Promise((r) => setTimeout(r, 200));

        // Verify socketB has left workspaceA room
        assert.equal(socketB.rooms.has(`workspace:${workspaceA.id}`), false, "Socket must be evicted from workspace room");

        // Attempt unauthorized rejoin
        clientB.emit("join:workspace", workspaceA.id);
        await new Promise((r) => setTimeout(r, 150));

        assert.equal(socketB.rooms.has(`workspace:${workspaceA.id}`), false, "Removed user must be denied rejoining workspace room");
        clientB.disconnect();
    });

    test("13. Deactivated user live socket is immediately disconnected by server", async () => {
        const clientA = Client(`http://localhost:${socketPort}`, {
            auth: { token: tokenA },
            transports: ["websocket"]
        });

        await new Promise((resolve) => clientA.on("connect", resolve));
        assert.equal(clientA.connected, true);

        let disconnectFired = false;
        clientA.on("disconnect", () => {
            disconnectFired = true;
        });

        // Trigger user deactivation realtime event
        emitRealtimeEvent({
            type: "user.status_changed",
            userId: userA.id,
            data: { isActive: false, userId: userA.id }
        });

        await new Promise((r) => setTimeout(r, 200));
        assert.equal(disconnectFired, true, "Socket must be forcefully disconnected upon user deactivation");

        // Restore user status for subsequent tests
        emitRealtimeEvent({
            type: "user.status_changed",
            userId: userA.id,
            data: { isActive: true, userId: userA.id }
        });
        await new Promise((r) => setTimeout(r, 50));
    });

    // ============================================================
    // 6. PHASE 22E.1: REMOVAL, ROLE DOWNGRADE & MULTI-TAB TESTS
    // ============================================================

    test("14. Project member removal evicts user across multiple browser tabs", async () => {
        // Ensure User B is in Workspace A and Project A
        await prisma.workspace_members.upsert({
            where: { workspace_id_user_id: { workspace_id: workspaceA.id, user_id: userB.id } },
            update: { workspace_role: "Member" },
            create: { workspace_id: workspaceA.id, user_id: userB.id, workspace_role: "Member" }
        });
        const teamRole = await prisma.roles.findFirst({ where: { role_name: "Team Member" } });
        await prisma.project_members.upsert({
            where: { project_id_user_id: { project_id: projectA.id, user_id: userB.id } },
            update: { role_id: teamRole.id },
            create: { project_id: projectA.id, user_id: userB.id, role_id: teamRole.id }
        });

        // Open two tabs for User B
        const tab1 = Client(`http://localhost:${socketPort}`, { auth: { token: tokenB }, transports: ["websocket"] });
        const tab2 = Client(`http://localhost:${socketPort}`, { auth: { token: tokenB }, transports: ["websocket"] });

        await Promise.all([
            new Promise((resolve) => tab1.on("connect", resolve)),
            new Promise((resolve) => tab2.on("connect", resolve))
        ]);

        tab1.emit("join:project", projectA.id);
        tab2.emit("join:project", projectA.id);
        await new Promise((r) => setTimeout(r, 150));

        const userBSockets = [...io.sockets.sockets.values()].filter((s) => s.user?.userId === userB.id);
        assert.equal(userBSockets.length, 2, "Must have 2 connected sockets for User B");
        for (const s of userBSockets) {
            assert.equal(s.rooms.has(`project:${projectA.id}`), true, "Both tabs must be in projectA room");
        }

        let tab1Received = false;
        let tab2Received = false;
        tab1.on("taskflow:event", (p) => { if (p?.projectId === projectA.id && p?.type === "task.created") tab1Received = true; });
        tab2.on("taskflow:event", (p) => { if (p?.projectId === projectA.id && p?.type === "task.created") tab2Received = true; });

        // Remove User B from Project A via authorized API
        const removeRes = await fetch(`${baseApiUrl}/api/projects/${projectA.id}/members/${userB.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.equal(removeRes.status, 200, "Project member removal must succeed");
        await new Promise((r) => setTimeout(r, 200));

        // Both sockets must have left projectA room
        for (const s of userBSockets) {
            assert.equal(s.rooms.has(`project:${projectA.id}`), false, "All tabs must be evicted from project room");
        }

        // Broadcast a new event to Project A
        emitRealtimeEvent({
            type: "task.created",
            projectId: projectA.id,
            data: { id: "post-eviction-task", title: "Only for active members" }
        });

        await new Promise((r) => setTimeout(r, 150));
        assert.equal(tab1Received, false, "Tab 1 must not receive post-removal events");
        assert.equal(tab2Received, false, "Tab 2 must not receive post-removal events");

        tab1.disconnect();
        tab2.disconnect();
    });

    test("15. Unauthorized join:project is strictly rejected after project member removal", async () => {
        const clientB = Client(`http://localhost:${socketPort}`, { auth: { token: tokenB }, transports: ["websocket"] });
        await new Promise((resolve) => clientB.on("connect", resolve));

        // User B (regular workspace member, not project member) attempts to join Project A
        clientB.emit("join:project", projectA.id);
        await new Promise((r) => setTimeout(r, 150));

        const socketB = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userB.id);
        assert.equal(socketB.rooms.has(`project:${projectA.id}`), false, "Non-project-member must be denied project room access");

        clientB.disconnect();
    });

    test("16. Workspace role downgrade immediately evicts user from non-member project rooms", async () => {
        // Promote User B to Workspace Admin
        await prisma.workspace_members.upsert({
            where: { workspace_id_user_id: { workspace_id: workspaceA.id, user_id: userB.id } },
            update: { workspace_role: "Admin" },
            create: { workspace_id: workspaceA.id, user_id: userB.id, workspace_role: "Admin" }
        });

        const clientB = Client(`http://localhost:${socketPort}`, { auth: { token: tokenB }, transports: ["websocket"] });
        await new Promise((resolve) => clientB.on("connect", resolve));

        // As Admin, User B joins Project A room
        clientB.emit("join:project", projectA.id);
        await new Promise((r) => setTimeout(r, 150));

        const socketB = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userB.id);
        assert.equal(socketB.rooms.has(`project:${projectA.id}`), true, "Admin must be allowed to join project room");

        // Downgrade User B to regular Member via workspace API
        const downgradeRes = await fetch(`${baseApiUrl}/api/workspaces/${workspaceA.id}/members/${userB.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({ role: "Member" })
        });
        assert.equal(downgradeRes.status, 200, "Role downgrade must succeed");
        await new Promise((r) => setTimeout(r, 250));

        // Verify socketB has been evicted from projectA room because User B is not an explicit project member
        assert.equal(socketB.rooms.has(`project:${projectA.id}`), false, "Downgraded member must be evicted from non-member project room");

        clientB.disconnect();
    });

    test("17. Project role downgrade takes immediate effect and revokes management permissions", async () => {
        // Ensure User B's workspace role is regular Member so workspace admin rights do not mask project role
        await prisma.workspace_members.upsert({
            where: { workspace_id_user_id: { workspace_id: workspaceA.id, user_id: userB.id } },
            update: { workspace_role: "Member" },
            create: { workspace_id: workspaceA.id, user_id: userB.id, workspace_role: "Member" }
        });

        // Add User B back as Project Manager
        const pmRole = await prisma.roles.findFirst({ where: { role_name: "Project Manager" } });
        await prisma.project_members.upsert({
            where: { project_id_user_id: { project_id: projectA.id, user_id: userB.id } },
            update: { role_id: pmRole.id },
            create: {
                project_id: projectA.id,
                user_id: userB.id,
                role_id: pmRole.id
            }
        });

        // User B as Project Manager can update project
        const updateRes1 = await fetch(`${baseApiUrl}/api/projects/${projectA.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenB}`
            },
            body: JSON.stringify({ description: "PM update" })
        });
        assert.equal(updateRes1.status, 200, "Project Manager must be able to update project");

        // Downgrade User B to Team Member via API
        const roleRes = await fetch(`${baseApiUrl}/api/projects/${projectA.id}/members/${userB.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({ role: "Team Member" })
        });
        assert.equal(roleRes.status, 200, "Project role downgrade must succeed");

        // Attempt management action as Team Member -> Must be rejected with 403 Forbidden
        const updateRes2 = await fetch(`${baseApiUrl}/api/projects/${projectA.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenB}`
            },
            body: JSON.stringify({ description: "Unauthorized team member update" })
        });
        assert.equal(updateRes2.status, 403, "Downgraded Team Member must be immediately blocked with 403 Forbidden");

        // Clean up project membership
        await prisma.project_members.deleteMany({ where: { project_id: projectA.id, user_id: userB.id } });
    });

    test("18. Reconnecting socket only joins currently authorized rooms and excludes evicted rooms", async () => {
        // User B connects. User B is in Workspace A as regular Member, and NOT in Project A.
        const clientB = Client(`http://localhost:${socketPort}`, { auth: { token: tokenB }, transports: ["websocket"] });
        await new Promise((resolve) => clientB.on("connect", resolve));

        const socketB = [...io.sockets.sockets.values()].find((s) => s.user?.userId === userB.id);
        assert.equal(socketB.rooms.has(`workspace:${workspaceA.id}`), true, "Must be in authorized workspace room");
        assert.equal(socketB.rooms.has(`project:${projectA.id}`), false, "Must NOT pre-join unassigned project room on reconnect");

        clientB.disconnect();
    });
});
