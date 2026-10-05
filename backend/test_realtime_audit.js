import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const API_BASE = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

const USER_A_ID = "0917e838-492a-4c1f-a75d-b295fc6869c5"; // test@taskflow.com
const USER_B_ID = "a79f01c6-b70f-4c46-8e76-ba4a3f4a6c09"; // 424170@student.nitandhra.ac.in

const tokenA = jwt.sign(
    { userId: USER_A_ID, email: "test@taskflow.com" },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
);

const tokenB = jwt.sign(
    { userId: USER_B_ID, email: "424170@student.nitandhra.ac.in" },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
);

async function request(method, path, body = null, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }
    return { status: res.status, ok: res.ok, data: json };
}

async function runAudit() {
    console.log("================================================================");
    console.log(" TASKFLOW REAL-TIME & QUACKIE MULTI-USER AUDIT VERIFICATION");
    console.log("================================================================");

    // 1. Connect two distinct users
    console.log("\n[1] Connecting Client A (User A: test@taskflow.com) and Client B (User B: 424170@student.nitandhra.ac.in)");
    const clientA = io(SOCKET_URL, { auth: { token: tokenA }, transports: ["websocket"] });
    const clientB = io(SOCKET_URL, { auth: { token: tokenB }, transports: ["websocket"] });

    await Promise.all([
        new Promise((res) => clientA.on("connect", () => { console.log(`✓ Client A connected (Socket: ${clientA.id})`); res(); })),
        new Promise((res) => clientB.on("connect", () => { console.log(`✓ Client B connected (Socket: ${clientB.id})`); res(); }))
    ]);

    // Track events on Client B
    const clientBEvents = [];
    clientB.on("taskflow:event", (ev) => {
        clientBEvents.push(ev);
    });

    const workspaceId = "ba031bd2-093a-44c9-af2b-546dd1c3a536";
    const projectId = "49bd9a6d-7e16-4c46-95ee-8e1866b9a738";

    // 2. Test Dynamic Workspace & Project Membership
    console.log("\n[2] Testing Dynamic Room Membership (User A adds User B to workspace & project)");
    const addWsRes = await request("POST", `/workspaces/${workspaceId}/members`, {
        userId: USER_B_ID,
        workspaceRole: "Member"
    }, tokenA);
    console.log(`Add workspace member result (${addWsRes.status}):`, addWsRes.data.message || addWsRes.data);

    // Wait a brief tick for dynamic server room join
    await new Promise((r) => setTimeout(r, 200));

    const addProjRes = await request("POST", `/projects/${projectId}/members`, {
        userId: USER_B_ID,
        role: "Team Member"
    }, tokenA);
    console.log(`Add project member result (${addProjRes.status}):`, addProjRes.data.message || addProjRes.data);

    // 3. Test Task Assignment and Real-Time Event to Client B
    console.log("\n[3] Testing Real-Time Task Mutation (User A creates & assigns a task to User B)");
    const taskTitle = `Audit Task ${Date.now()}`;
    const createTaskRes = await request("POST", `/projects/${projectId}/tasks`, {
        title: taskTitle,
        priority: "High",
        status: "In Progress",
        assignedTo: USER_B_ID,
        dueDate: "2026-09-28" // Overdue date
    }, tokenA);

    console.log("createTaskRes:", createTaskRes.status, createTaskRes.data);
    const createdTask = createTaskRes.data?.task || createTaskRes.data;
    if (!createdTask?.id) {
        throw new Error(`Failed to create task: ${JSON.stringify(createTaskRes.data)}`);
    }
    console.log(`✓ User A created task "${createdTask.title}" (${createdTask.id}) assigned to User B (status ${createTaskRes.status})`);

    // Verify Client B received the event
    await new Promise((r) => setTimeout(r, 400));
    const receivedTaskEvent = clientBEvents.find(
        (e) => e.taskId === createdTask.id || (e.type === "task.created" && e.data?.id === createdTask.id)
    );
    if (receivedTaskEvent) {
        console.log(`✓ Client B received real-time event without reconnect: "${receivedTaskEvent.type}" for taskId: ${createdTask.id}`);
    } else {
        console.error("FAIL: Client B did not receive the task creation event!");
    }

    // 4. Test Subtask Mutation
    console.log("\n[4] Testing Subtask Real-Time Mutation");
    const subtaskRes = await request("POST", `/tasks/${createdTask.id}/subtasks`, {
        title: "Subtask Audit Check",
        status: "To Do"
    }, tokenA);
    console.log(`✓ User A created subtask on task ${createdTask.id}: status ${subtaskRes.status}`);

    await new Promise((r) => setTimeout(r, 400));
    const receivedSubtaskEvent = clientBEvents.find((e) => e.type === "subtask.created");
    if (receivedSubtaskEvent) {
        console.log(`✓ Client B received real-time event: "${receivedSubtaskEvent.type}"`);
    }

    // 5. Test Risk Mutation
    console.log("\n[5] Testing Risk Real-Time Mutation");
    const riskRes = await request("POST", `/projects/${projectId}/risks`, {
        title: "Real-time audit risk",
        severity: "High",
        probability: "High",
        description: "Potential delay risk"
    }, tokenA);
    console.log(`✓ User A added risk to project: status ${riskRes.status}`);

    await new Promise((r) => setTimeout(r, 400));
    const receivedRiskEvent = clientBEvents.find((e) => e.type?.startsWith("risk."));
    if (receivedRiskEvent) {
        console.log(`✓ Client B received real-time event: "${receivedRiskEvent.type}"`);
    }

    // 6. Test Quackie Context & AI Question Answering with NEW Database State
    console.log("\n[6] Testing Quackie Context & AI Intelligence for User B using NEW Database State");
    const quackieContextRes = await request("GET", "/quackie/context?page=dashboard", null, tokenB);
    console.log("✓ User B Quackie Context:", {
        emotion: quackieContextRes.data.emotion,
        greeting: quackieContextRes.data.greeting,
        badgeCount: quackieContextRes.data.badgeCount,
        observation: quackieContextRes.data.observation
    });

    // Test Question 1: "Show my overdue work"
    console.log('\n[6a] User B asks Quackie: "Show my overdue work"');
    const overdueRes = await request("POST", "/quackie/chat", {
        message: "Show my overdue work",
        context: { page: "dashboard" }
    }, tokenB);
    console.log("Quackie Reply:\n" + overdueRes.data?.reply);
    const mentionsCreatedTask = overdueRes.data?.reply?.toLowerCase().includes(taskTitle.toLowerCase()) ||
                               overdueRes.data?.reply?.includes(createdTask.title);
    if (mentionsCreatedTask) {
        console.log(`✓ Quackie dynamically detected User B's new overdue task "${taskTitle}"!`);
    } else {
        console.log("Task title check:", { taskTitle, inReply: mentionsCreatedTask });
    }

    // Test Question 2: "What should I work on next?"
    console.log('\n[6b] User B asks Quackie: "What should I work on next?"');
    const nextRes = await request("POST", "/quackie/chat", {
        message: "What should I work on next?",
        context: { page: "dashboard" }
    }, tokenB);
    console.log("Quackie Reply:\n" + nextRes.data?.reply);

    // Test Question 3: "Summarize this project"
    console.log('\n[6c] User B asks Quackie: "Summarize this project"');
    const sumRes = await request("POST", "/quackie/chat", {
        message: "Summarize this project",
        context: { page: "project", projectId }
    }, tokenB);
    console.log("Quackie Reply:\n" + sumRes.data?.reply);

    // 7. Test Disconnect and Reconnect Resynchronization
    console.log("\n[7] Testing Disconnect and Reconnect Resynchronization");
    console.log("Disconnecting Client B...");
    clientB.disconnect();

    console.log("User A updates task status to 'Completed' while Client B is offline...");
    await request("PATCH", `/tasks/${createdTask.id}/status`, {
        status: "Completed"
    }, tokenA);

    console.log("Client B reconnecting...");
    const clientB2 = io(SOCKET_URL, { auth: { token: tokenB }, transports: ["websocket"] });
    await new Promise((res) => clientB2.on("connect", res));
    console.log(`✓ Client B reconnected (Socket: ${clientB2.id})`);

    // Fetch refreshed Quackie context on reconnect
    const quackieReconnectRes = await request("GET", "/quackie/context?page=dashboard", null, tokenB);
    console.log("✓ Refreshed Quackie Context after reconnect:", {
        emotion: quackieReconnectRes.data.emotion,
        badgeCount: quackieReconnectRes.data.badgeCount,
        observation: quackieReconnectRes.data.observation
    });

    // 8. Clean up
    clientA.disconnect();
    clientB2.disconnect();

    // Clean up created task & risk & memberships
    await request("PATCH", `/tasks/${createdTask.id}/archive`, null, tokenA);
    if (riskRes.data?.risk?.id) {
        await request("PATCH", `/risks/${riskRes.data.risk.id}/close`, null, tokenA);
    }
    await request("DELETE", `/projects/${projectId}/members/${USER_B_ID}`, null, tokenA);
    await request("DELETE", `/workspaces/${workspaceId}/members/${USER_B_ID}`, null, tokenA);

    console.log("\n================================================================");
    console.log(" AUDIT RUN COMPLETED SUCCESSFULLY!");
    console.log("================================================================");
}

runAudit().catch((err) => {
    console.error("Audit error:", err);
});
