import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";
const PORT = 5500;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(port, maxWaitMs = 15000) {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 2000));
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
                headers: { Authorization: "Bearer test" }
            });
            if (res.status === 401 || res.status === 200) return true;
        } catch {}
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Server on port ${port} did not become ready`);
}

function calculatePercentiles(latencies) {
    if (!latencies || latencies.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, avg: 0 };
    const sorted = [...latencies].sort((a, b) => a - b);
    const getPercentile = (p) => {
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
    };
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    return {
        min: Number(sorted[0].toFixed(2)),
        p50: Number(getPercentile(50).toFixed(2)),
        p95: Number(getPercentile(95).toFixed(2)),
        p99: Number(getPercentile(99).toFixed(2)),
        avg: Number((sum / sorted.length).toFixed(2))
    };
}

async function runInvestigation() {
    console.log("================================================================================");
    console.log("STEP 1: ROOT-CAUSE INVESTIGATION & PER-ENDPOINT LATENCY PROFILING");
    console.log("================================================================================");

    const backendDir = path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend");

    const proc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(PORT),
            CLUSTER_MODE: "false",
            DB_POOL_SIZE: "50",
            DB_CONNECTION_TIMEOUT: "20000",
            UV_THREADPOOL_SIZE: "64"
        },
        stdio: "inherit"
    });

    await waitForServer(PORT);
    console.log(`Server ready on port ${PORT}`);

    // Load 50 synthetic users
    const users = await prisma.users.findMany({
        where: { email: { endsWith: "@synthetic.taskflow.local" } },
        take: 50,
        select: {
            id: true,
            email: true,
            workspace_members: { take: 1, select: { workspace_id: true } },
            project_members: { take: 1, select: { project_id: true } }
        }
    });

    const fallbackWs = await prisma.workspaces.findFirst();
    const fallbackPrj = await prisma.projects.findFirst();

    const sessions = users.map((u, i) => {
        const wsId = u.workspace_members[0]?.workspace_id || fallbackWs.id;
        const pId = u.project_members[0]?.project_id || fallbackPrj.id;
        const token = jwt.sign(
            { userId: u.id, email: u.email, role: "Team Member" },
            JWT_SECRET,
            { expiresIn: "1h" }
        );
        return {
            index: i,
            userId: u.id,
            email: u.email,
            workspaceId: wsId,
            projectId: pId,
            token,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        };
    });

    console.log(`Initialized ${sessions.length} sessions.`);

    // Pre-create tasks for status updates
    const preTasks = [];
    for (let i = 0; i < 20; i++) {
        const s = sessions[i];
        const res = await fetch(`${BASE_URL}/api/projects/${s.projectId}/tasks`, {
            method: "POST",
            headers: s.headers,
            body: JSON.stringify({ title: `Investigate Task ${i}`, priority: "Medium", status: "Backlog" })
        });
        const data = await res.json();
        if (data?.task?.id) preTasks.push({ id: data.task.id, session: s });
    }
    console.log(`Pre-created ${preTasks.length} tasks for status update profiling.`);

    const endpoints = [
        {
            name: "1. GET /api/workspaces",
            fn: (s) => fetch(`${BASE_URL}/api/workspaces`, { headers: s.headers })
        },
        {
            name: "2. GET /api/projects/:pId/tasks?page=1&limit=20",
            fn: (s) => fetch(`${BASE_URL}/api/projects/${s.projectId}/tasks?page=1&limit=20`, { headers: s.headers })
        },
        {
            name: "3. POST /api/projects/:pId/tasks",
            fn: (s, i) => fetch(`${BASE_URL}/api/projects/${s.projectId}/tasks`, {
                method: "POST",
                headers: s.headers,
                body: JSON.stringify({ title: `Inv Task ${i}`, priority: "Medium", status: "Backlog" })
            })
        },
        {
            name: "4. PATCH /api/tasks/:id/status",
            fn: (s, i) => {
                const t = preTasks[i % preTasks.length];
                return fetch(`${BASE_URL}/api/tasks/${t.id}/status`, {
                    method: "PATCH",
                    headers: t.session.headers,
                    body: JSON.stringify({ status: "In Progress" })
                });
            }
        },
        {
            name: "5. GET /api/reports/dashboard",
            fn: (s) => fetch(`${BASE_URL}/api/reports/dashboard?projectId=${s.projectId}`, { headers: s.headers })
        },
        {
            name: "6. GET /api/calendar",
            fn: (s) => fetch(`${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, { headers: s.headers })
        },
        {
            name: "7. GET /api/notifications",
            fn: (s) => fetch(`${BASE_URL}/api/notifications?page=1&limit=20`, { headers: s.headers })
        },
        {
            name: "8. GET /api/search",
            fn: (s) => fetch(`${BASE_URL}/api/search?query=Task&type=all`, { headers: s.headers })
        }
    ];

    console.log("\n================================================================================");
    console.log("PROFILING 50 CONCURRENT REQUESTS PER ENDPOINT (Burst Concurrency)");
    console.log("================================================================================");

    const report = [];

    for (const ep of endpoints) {
        const latencies = [];
        let errors = 0;

        const startT = performance.now();
        const promises = sessions.map(async (s, i) => {
            const t0 = performance.now();
            try {
                const res = await ep.fn(s, i);
                const t1 = performance.now();
                latencies.push(t1 - t0);
                if (!res.ok) errors++;
                await res.text();
            } catch {
                errors++;
            }
        });

        await Promise.all(promises);
        const totalDuration = performance.now() - startT;
        const stats = calculatePercentiles(latencies);
        const rps = (sessions.length / (totalDuration / 1000)).toFixed(1);

        console.log(`\nEndpoint: ${ep.name}`);
        console.log(`  -> Duration: ${totalDuration.toFixed(0)}ms | Throughput: ${rps} RPS | Errors: ${errors}/${sessions.length}`);
        console.log(`  -> Latency: p50: ${stats.p50}ms | p95: ${stats.p95}ms | p99: ${stats.p99}ms | Avg: ${stats.avg}ms | Min: ${stats.min}ms`);

        report.push({ name: ep.name, stats, errors, rps: Number(rps) });
        await new Promise((r) => setTimeout(r, 1000));
    }

    // Clean up pre-created tasks
    const taskIds = preTasks.map((t) => t.id);
    if (taskIds.length > 0) {
        await prisma.tasks.deleteMany({ where: { id: { in: taskIds } } }).catch(() => {});
    }

    proc.kill();
    await prisma.$disconnect();

    console.log("\n================================================================================");
    console.log("INVESTIGATION SUMMARY TABLE:");
    console.log("================================================================================");
    console.log("| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Avg (ms) | RPS | Errors |");
    console.log("|---|---:|---:|---:|---:|---:|---:|");
    for (const r of report) {
        console.log(`| ${r.name} | ${r.stats.p50} | ${r.stats.p95} | ${r.stats.p99} | ${r.stats.avg} | ${r.rps} | ${r.errors} |`);
    }
}

runInvestigation().catch((err) => {
    console.error("Investigation failed:", err);
    process.exit(1);
});
