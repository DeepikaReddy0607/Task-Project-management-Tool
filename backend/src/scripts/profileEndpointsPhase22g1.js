import "dotenv/config";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function profileEndpoints() {
    console.log("================================================================================");
    console.log("PHASE 22G.1: ENDPOINT PROFILING & ROOT-CAUSE INVESTIGATION");
    console.log("================================================================================");

    // Pick a test synthetic user
    const user = await prisma.users.findFirst({
        where: { email: { endsWith: "@synthetic.taskflow.local" } },
        include: {
            workspace_members: { take: 1, select: { workspace_id: true } },
            project_members: { take: 1, select: { project_id: true } }
        }
    });

    if (!user) throw new Error("No synthetic user found");

    const fallbackWs = await prisma.workspaces.findFirst();
    const fallbackPrj = await prisma.projects.findFirst();
    const workspaceId = user.workspace_members[0]?.workspace_id || fallbackWs.id;
    const projectId = user.project_members[0]?.project_id || fallbackPrj.id;

    const token = jwt.sign(
        { userId: user.id, email: user.email, role: "Team Member" },
        JWT_SECRET,
        { expiresIn: "1h" }
    );
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    console.log(`Profiling against User: ${user.email}, Project: ${projectId}`);

    // Create a temporary task to test status updates
    const tRes = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Profiling Task", priority: "Medium", status: "Backlog" })
    });
    const tData = await tRes.json();
    const taskId = tData?.task?.id;
    console.log(`Created profiling task: ${taskId} (HTTP ${tRes.status})`);

    const endpoints = [
        { name: "1. GET /api/workspaces", url: `${BASE_URL}/api/workspaces`, method: "GET" },
        { name: "2. GET /api/projects/:pId/tasks?page=1&limit=20", url: `${BASE_URL}/api/projects/${projectId}/tasks?page=1&limit=20`, method: "GET" },
        { name: "3. POST /api/projects/:pId/tasks", url: `${BASE_URL}/api/projects/${projectId}/tasks`, method: "POST", body: { title: "Perf Test Task", priority: "Medium", status: "Backlog" } },
        { name: "4. PATCH /api/tasks/:id/status", url: `${BASE_URL}/api/tasks/${taskId}/status`, method: "PATCH", body: { status: "In Progress" } },
        { name: "5. GET /api/reports/dashboard", url: `${BASE_URL}/api/reports/dashboard?projectId=${projectId}`, method: "GET" },
        { name: "6. GET /api/calendar", url: `${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, method: "GET" },
        { name: "7. GET /api/notifications", url: `${BASE_URL}/api/notifications?page=1&limit=20`, method: "GET" },
        { name: "8. GET /api/search", url: `${BASE_URL}/api/search?query=Task&type=all`, method: "GET" }
    ];

    console.log("\nExecuting 10 serial warmup requests per endpoint...");
    for (const ep of endpoints) {
        const latencies = [];
        for (let i = 0; i < 5; i++) {
            const t0 = performance.now();
            const opts = { method: ep.method, headers };
            if (ep.body) opts.body = JSON.stringify(ep.body);
            const res = await fetch(ep.url, opts);
            await res.text();
            latencies.push(performance.now() - t0);
        }
        const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
        const min = Math.min(...latencies).toFixed(2);
        const max = Math.max(...latencies).toFixed(2);
        console.log(`  ${ep.name.padEnd(45)} -> Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms`);
    }

    // Clean up test task
    if (taskId) {
        await prisma.tasks.delete({ where: { id: taskId } }).catch(() => {});
    }

    await prisma.$disconnect();
}

profileEndpoints().catch(err => {
    console.error("Profiling error:", err);
    process.exit(1);
});
