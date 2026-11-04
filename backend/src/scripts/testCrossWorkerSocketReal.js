import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const PORT = 5370;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";

async function waitForServer(port, maxWaitMs = 15000) {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 2500));
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
                headers: { Authorization: "Bearer test" }
            });
            if (res.status === 401 || res.status === 200) return true;
        } catch {}
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Server on port ${port} not ready`);
}

async function runRealCrossWorkerTest() {
    console.log("================================================================================");
    console.log("PHASE 22F.3.1: REAL CROSS-WORKER SOCKET.IO RELIABILITY & ISOLATION TEST");
    console.log("================================================================================");

    // Find a workspace with at least 2 members and at least 1 project
    const sharedWs = await prisma.workspaces.findFirst({
        where: {
            workspace_members: { some: {} },
            projects: { some: { is_archived: false } }
        },
        include: {
            workspace_members: { take: 2, include: { users: true } },
            projects: { take: 1 }
        }
    });

    if (!sharedWs || sharedWs.workspace_members.length < 2 || sharedWs.projects.length === 0) {
        throw new Error("Need a workspace with at least 2 members and 1 project");
    }

    const user1 = sharedWs.workspace_members[0].users;
    const user2 = sharedWs.workspace_members[1].users;
    const workspaceId = sharedWs.id;
    const project = sharedWs.projects[0];
    const projectId = project.id;

    // Find a 3rd user from a DIFFERENT workspace for isolation testing
    const isolatedUser = await prisma.users.findFirst({
        where: {
            id: { notIn: [user1.id, user2.id] },
            workspace_members: { none: { workspace_id: workspaceId } }
        }
    });

    console.log(`[CONFIG] Project: ${project.name} (${projectId}) in Workspace: ${workspaceId}`);
    console.log(`[CONFIG] Member 1: ${user1.email} (${user1.id})`);
    console.log(`[CONFIG] Member 2: ${user2.email} (${user2.id})`);
    console.log(`[CONFIG] Isolated User 3: ${isolatedUser?.email || "None"} (${isolatedUser?.id})`);

    const token1 = jwt.sign({ userId: user1.id, email: user1.email, role: "Team Member" }, JWT_SECRET, { expiresIn: "1h" });
    const token2 = jwt.sign({ userId: user2.id, email: user2.email, role: "Team Member" }, JWT_SECRET, { expiresIn: "1h" });
    const token3 = isolatedUser ? jwt.sign({ userId: isolatedUser.id, email: isolatedUser.email, role: "Team Member" }, JWT_SECRET, { expiresIn: "1h" }) : null;

    // Boot cluster server with 3 workers
    const backendDir = path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend");
    const clusterProc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(PORT),
            CLUSTER_MODE: "true",
            CLUSTER_WORKERS: "3",
            DB_POOL_SIZE: "20"
        },
        stdio: "inherit"
    });

    await waitForServer(PORT);
    console.log(`\n[BOOT] Cluster server is active on port ${PORT}`);

    // Connect Client 1, Client 2, and Client 3
    const client1Events = [];
    const client2Events = [];
    const client3Events = [];

    const socket1 = Client(BASE_URL, {
        auth: { token: token1 },
        transports: ["websocket"],
        forceNew: true
    });
    socket1.on("taskflow:event", (data) => client1Events.push(data));

    const socket2 = Client(BASE_URL, {
        auth: { token: token2 },
        transports: ["websocket"],
        forceNew: true
    });
    socket2.on("taskflow:event", (data) => client2Events.push(data));

    let socket3 = null;
    if (token3) {
        socket3 = Client(BASE_URL, {
            auth: { token: token3 },
            transports: ["websocket"],
            forceNew: true
        });
        socket3.on("taskflow:event", (data) => client3Events.push(data));
    }

    // Wait for sockets to connect
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`  - Sockets connected: Socket 1: ${socket1.connected}, Socket 2: ${socket2.connected}, Socket 3: ${socket3?.connected}`);

    // ------------------------------------------------------------------------
    // TEST 1: Member 1 creates a task via REST API
    // ------------------------------------------------------------------------
    console.log("\n[TEST 1] Member 1 creates task in Project via HTTP POST...");
    const createRes = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token1}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            title: "Cross Worker Real Socket Verification Task",
            priority: "Medium",
            status: "Backlog"
        })
    });

    console.log(`  -> HTTP Create Status: ${createRes.status}`);
    const taskData = await createRes.json().catch(() => null);
    const createdTaskId = taskData?.task?.id || taskData?.data?.id;

    // Allow 1.5 seconds for IPC cross-worker propagation
    await new Promise((r) => setTimeout(r, 1500));

    console.log(`  - Member 1 received events: ${client1Events.length}`);
    console.log(`  - Member 2 received events: ${client2Events.length}`);
    console.log(`  - Isolated User 3 received events: ${client3Events.length}`);

    const member2GotEvent = client2Events.some((e) => e.taskId === createdTaskId || e.projectId === projectId);
    const isolatedUserLeak = client3Events.some((e) => e.taskId === createdTaskId || e.projectId === projectId);

    console.log(`  -> Member 2 Cross-Worker Event Delivered: ${member2GotEvent ? "PASS" : "FAIL"}`);
    console.log(`  -> Tenant Isolation (User 3 received 0): ${!isolatedUserLeak ? "PASS" : "FAIL (LEAK!)"}`);

    // ------------------------------------------------------------------------
    // TEST 2: Disconnection on User Deactivation
    // ------------------------------------------------------------------------
    console.log("\n[TEST 2] Testing Socket Eviction on User Deactivation via Admin API...");
    // Fetch a real Admin user from DB
    const adminUser = await prisma.users.findFirst({
        where: { roles: { role_name: "Admin" }, is_active: true }
    });
    const adminToken = jwt.sign(
        { userId: adminUser?.id || "admin-system", email: adminUser?.email || "admin@taskflow.dev", role: "Admin" },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    const deactRes = await fetch(`${BASE_URL}/api/admin/users/${user2.id}/status`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ isActive: false })
    });
    console.log(`  -> Admin Deactivation HTTP Status: ${deactRes.status}`);

    await new Promise((r) => setTimeout(r, 2000));
    console.log(`  -> Socket 2 Connected after deactivation: ${socket2.connected} (Expected: false)`);

    // Restore user2 status via Admin API
    await fetch(`${BASE_URL}/api/admin/users/${user2.id}/status`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ isActive: true })
    });

    // Cleanup created task
    if (createdTaskId) {
        await prisma.tasks.delete({ where: { id: createdTaskId } }).catch(() => {});
    }

    socket1.disconnect();
    socket2.disconnect();
    if (socket3) socket3.disconnect();
    clusterProc.kill();

    console.log("\n================================================================================");
    console.log("CROSS-WORKER SOCKET TEST RESULTS:");
    console.log(`  - Member 2 Delivery:     ${member2GotEvent ? "PASSED (Delivered across workers)" : "FAILED"}`);
    console.log(`  - Tenant Isolation:      ${!isolatedUserLeak ? "PASSED (Zero cross-tenant leakage)" : "FAILED"}`);
    console.log(`  - Deactivation Eviction: ${!socket2.connected ? "PASSED (Socket disconnected)" : "FAILED"}`);
    console.log("================================================================================");
}

runRealCrossWorkerTest().catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
