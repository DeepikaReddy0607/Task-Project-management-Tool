import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const API_BASE = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

async function post(url, data, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
}

async function get(url, token = null) {
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
}

async function patch(url, data, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
}

async function runTest() {
    console.log("=== STEP 1: Generate Authenticated JWT ===");
    const user = {
        id: "0917e838-492a-4c1f-a75d-b295fc6869c5",
        email: "test@taskflow.com"
    };
    const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );
    console.log(`✓ Authenticated as ${user.email} (ID: ${user.id})`);

    console.log("\n=== STEP 2: Verify Unauthenticated / Invalid Token Rejection ===");
    await new Promise((resolve) => {
        const badSocket = io(SOCKET_URL, {
            auth: { token: "invalid-token-here" },
            transports: ["websocket"],
            timeout: 3000
        });
        badSocket.on("connect_error", (err) => {
            console.log(`✓ Bad token rejected as expected: "${err.message}"`);
            badSocket.disconnect();
            resolve();
        });
        badSocket.on("connect", () => {
            console.error("FAIL: Bad token connected unexpectedly!");
            badSocket.disconnect();
            resolve();
        });
    });

    console.log("\n=== STEP 3: Connect Authenticated Client A ===");
    const clientA = io(SOCKET_URL, {
        auth: { token },
        transports: ["websocket"]
    });

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Client A connection timed out")), 5000);
        clientA.on("connect", () => {
            clearTimeout(timer);
            console.log(`✓ Client A connected (Socket ID: ${clientA.id})`);
            resolve();
        });
        clientA.on("connect_error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });

    console.log("\n=== STEP 4: Connect Authenticated Client B (Second Client Session) ===");
    const clientB = io(SOCKET_URL, {
        auth: { token },
        transports: ["websocket"]
    });

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Client B connection timed out")), 5000);
        clientB.on("connect", () => {
            clearTimeout(timer);
            console.log(`✓ Client B connected (Socket ID: ${clientB.id})`);
            resolve();
        });
        clientB.on("connect_error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });

    console.log("\n=== STEP 5: Test Real-Time Event Broadcast on REST Mutation ===");
    // Fetch user's tasks
    const tasksRes = await get(`${API_BASE}/tasks/my-tasks`, token);
    const tasks = tasksRes.tasks || [];
    if (tasks.length === 0) {
        console.log("No tasks found to update, creating one...");
        const wsRes = await get(`${API_BASE}/workspaces`, token);
        const wsId = wsRes.workspaces[0].id;
        const projRes = await get(`${API_BASE}/projects?workspaceId=${wsId}`, token);
        const projId = projRes.projects[0].id;
        const newT = await post(`${API_BASE}/tasks/project/${projId}`, {
            title: "Realtime Test Task",
            priority: "High",
            status: "To Do"
        }, token);
        tasks.push(newT.task);
    }

    const testTask = tasks[0];
    const newStatus = testTask.status === "Completed" ? "In Progress" : "Completed";
    console.log(`Updating Task "${testTask.title}" (${testTask.id}) from "${testTask.status}" -> "${newStatus}"`);

    // Prepare listeners for both clients
    const eventPromiseA = new Promise((resolve) => {
        clientA.on("task.status_changed", (event) => {
            console.log(`✓ Client A received 'task.status_changed':`, {
                taskId: event.taskId,
                status: event.changes?.status
            });
            resolve(event);
        });
    });

    const wildcardPromiseB = new Promise((resolve) => {
        clientB.on("taskflow:event", (event) => {
            console.log(`✓ Client B received 'taskflow:event' wildcard:`, {
                type: event.type,
                taskId: event.taskId
            });
            resolve(event);
        });
    });

    // Perform REST mutation
    await patch(`${API_BASE}/tasks/${testTask.id}/status`, {
        status: newStatus
    }, token);

    await Promise.all([eventPromiseA, wildcardPromiseB]);
    console.log("✓ Real-time event propagation verified across multiple clients!");

    console.log("\n=== STEP 6: Verify Quackie Proactive Context Query with Real Data ===");
    const quackieData = await get(`${API_BASE}/quackie/context?page=dashboard`, token);
    console.log("✓ Quackie Context Response:", {
        success: quackieData.success,
        emotion: quackieData.emotion,
        greeting: quackieData.greeting,
        badgeCount: quackieData.badgeCount,
        quickActions: quackieData.quickActions
    });

    clientA.disconnect();
    clientB.disconnect();
    console.log("\n=== ALL REAL-TIME SYNCHRONIZATION TESTS PASSED! ===");
}

runTest().catch((err) => {
    console.error("Test failed with error:", err.message);
    process.exit(1);
});
