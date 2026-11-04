import "dotenv/config";
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const CLUSTER_PORT = 5300;
const SINGLE_PORT = 5301;
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";

function calculatePercentiles(latencies) {
    if (!latencies || latencies.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
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
        max: Number(sorted[sorted.length - 1].toFixed(2)),
        avg: Number((sum / sorted.length).toFixed(2))
    };
}

async function waitForServer(port, maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
                headers: { Authorization: "Bearer test" }
            });
            // 401 means server is up and listening
            if (res.status === 401 || res.status === 200) return true;
        } catch {
            // Wait and retry
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Server on port ${port} did not become ready within ${maxWaitMs}ms`);
}

async function runLoadOnServer(baseUrl, userSessions, concurrency, durationSec = 10) {
    const latencies = [];
    let errors = 0;
    let completed = 0;
    const stopTime = Date.now() + durationSec * 1000;
    const startWall = Date.now();

    async function runUser(idx) {
        const user = userSessions[idx % userSessions.length];
        const headers = user.headers;
        const pId = user.projectId;
        const staggerMs = Math.floor((idx / concurrency) * 2000);
        await new Promise((r) => setTimeout(r, staggerMs));

        let step = 0;
        while (Date.now() < stopTime) {
            step++;
            const t0 = process.hrtime.bigint();
            let ok = false;
            const action = step % 6;

            try {
                if (action === 0) {
                    const res = await fetch(`${baseUrl}/api/workspaces`, { headers });
                    ok = res.status === 200;
                } else if (action === 1) {
                    const res = await fetch(`${baseUrl}/api/projects/${pId}/tasks?page=1&limit=20`, { headers });
                    ok = res.status === 200;
                } else if (action === 2) {
                    const res = await fetch(`${baseUrl}/api/reports/dashboard?projectId=${pId}`, { headers });
                    ok = res.status === 200;
                } else if (action === 3) {
                    const res = await fetch(`${baseUrl}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, { headers });
                    ok = res.status === 200;
                } else if (action === 4) {
                    const res = await fetch(`${baseUrl}/api/notifications?page=1&limit=20`, { headers });
                    ok = res.status === 200;
                } else {
                    const res = await fetch(`${baseUrl}/api/search?query=Task&type=all`, { headers });
                    ok = res.status === 200;
                }
            } catch {
                ok = false;
            }

            const t1 = process.hrtime.bigint();
            latencies.push(Number(t1 - t0) / 1_000_000);
            if (!ok) errors++;
            completed++;

            await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 25)));
        }
    }

    const workers = Array.from({ length: concurrency }, (_, i) => runUser(i));
    await Promise.all(workers);

    const elapsed = (Date.now() - startWall) / 1000;
    const rps = Number((completed / elapsed).toFixed(2));
    const stats = calculatePercentiles(latencies);

    return {
        concurrency,
        durationSec: Number(elapsed.toFixed(1)),
        totalRequests: completed,
        rps,
        errors,
        errorRate: Number(((errors / completed) * 100).toFixed(2)),
        latencies: stats
    };
}

async function runClusterEvaluation() {
    console.log("================================================================================");
    console.log("PHASE 22F.3: MULTI-PROCESS CLUSTER VS. SINGLE-PROCESS EVALUATION");
    console.log("================================================================================");

    // Prepare sessions
    const rawUsers = await prisma.users.findMany({
        where: { email: { endsWith: "@synthetic.taskflow.local" } },
        take: 500,
        select: {
            id: true,
            email: true,
            workspace_members: { take: 1, select: { workspace_id: true } },
            project_members: { take: 1, select: { project_id: true } }
        }
    });

    const fallbackWorkspace = await prisma.workspaces.findFirst({ select: { id: true } });
    const fallbackProject = await prisma.projects.findFirst({ select: { id: true } });

    const userSessions = rawUsers.map((u, idx) => {
        const workspaceId = u.workspace_members[0]?.workspace_id || fallbackWorkspace?.id;
        const projectId = u.project_members[0]?.project_id || fallbackProject?.id;
        const token = jwt.sign(
            { userId: u.id, email: u.email, role: "Team Member" },
            JWT_SECRET,
            { expiresIn: "2h" }
        );
        return {
            index: idx,
            userId: u.id,
            email: u.email,
            workspaceId,
            projectId,
            token,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        };
    });

    console.log(`Prepared ${userSessions.length} virtual user credentials.`);

    // ------------------------------------------------------------------------
    // TEST 1: SINGLE PROCESS SERVER
    // ------------------------------------------------------------------------
    console.log("\n[TEST 1] Starting Single Process Server on port " + SINGLE_PORT + "...");
    const backendDir = path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend");
    const singleProc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(SINGLE_PORT),
            CLUSTER_MODE: "false",
            DB_POOL_SIZE: "30",
            UV_THREADPOOL_SIZE: "64"
        },
        stdio: "inherit"
    });

    await waitForServer(SINGLE_PORT);
    console.log("  -> Single Process Server is ready. Running 250-user load test (10s)...");
    const singleResults250 = await runLoadOnServer(`http://127.0.0.1:${SINGLE_PORT}`, userSessions, 250, 10);
    console.log(`  -> Single Process @ 250 users: ${singleResults250.rps} RPS | p50: ${singleResults250.latencies.p50}ms | p95: ${singleResults250.latencies.p95}ms | Errors: ${singleResults250.errorRate}%`);

    singleProc.kill();
    await new Promise((r) => setTimeout(r, 2000));

    // ------------------------------------------------------------------------
    // TEST 2: MULTI-PROCESS CLUSTER SERVER (3 WORKERS)
    // ------------------------------------------------------------------------
    console.log("\n[TEST 2] Starting Cluster Mode Server (3 Workers, Pool: 20/worker = 60 total) on port " + CLUSTER_PORT + "...");
    const clusterProc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(CLUSTER_PORT),
            CLUSTER_MODE: "true",
            CLUSTER_WORKERS: "3",
            DB_POOL_SIZE: "20",
            UV_THREADPOOL_SIZE: "64"
        },
        stdio: "inherit"
    });

    await waitForServer(CLUSTER_PORT);
    console.log("  -> Cluster Mode Server is ready. Running 250-user load test (10s)...");
    const clusterResults250 = await runLoadOnServer(`http://127.0.0.1:${CLUSTER_PORT}`, userSessions, 250, 10);
    console.log(`  -> Cluster Mode @ 250 users: ${clusterResults250.rps} RPS | p50: ${clusterResults250.latencies.p50}ms | p95: ${clusterResults250.latencies.p95}ms | Errors: ${clusterResults250.errorRate}%`);

    // Cross-worker Socket.IO broadcast test
    console.log("\n[TEST 3] Testing Cross-Worker Socket.IO Broadcast Relay...");
    const socketClients = [];
    let broadcastsReceived = 0;
    const testWsId = userSessions[0].workspaceId;

    for (let i = 0; i < 20; i++) {
        const u = userSessions[i];
        const cl = Client(`http://127.0.0.1:${CLUSTER_PORT}`, {
            auth: { token: u.token },
            transports: ["websocket"],
            forceNew: true
        });
        cl.on("taskflow:event", () => {
            broadcastsReceived++;
        });
        socketClients.push(cl);
    }

    await new Promise((r) => setTimeout(r, 2000));
    console.log(`  -> Connected 20 sockets across cluster workers.`);

    // Trigger an API request that emits a broadcast
    const emitRes = await fetch(`http://127.0.0.1:${CLUSTER_PORT}/api/projects/${userSessions[0].projectId}/tasks`, {
        method: "POST",
        headers: userSessions[0].headers,
        body: JSON.stringify({
            title: "Cross Worker Broadcast Test Task",
            priority: "Low",
            status: "Backlog"
        })
    });
    const emitTaskData = await emitRes.json().catch(() => null);
    const cleanupTaskId = emitTaskData?.task?.id || emitTaskData?.data?.id;

    await new Promise((r) => setTimeout(r, 1500));
    console.log(`  -> Cross-worker broadcast received count: ${broadcastsReceived}/20 sockets across workers.`);

    if (cleanupTaskId) {
        await prisma.tasks.delete({ where: { id: cleanupTaskId } }).catch(() => {});
    }

    socketClients.forEach((c) => c.disconnect());
    clusterProc.kill();

    console.log("\n================================================================================");
    console.log("COMPARISON SUMMARY (250 Concurrent Users):");
    console.log(`  - Single Process: ${singleResults250.rps} RPS | p50: ${singleResults250.latencies.p50}ms | p95: ${singleResults250.latencies.p95}ms | Errors: ${singleResults250.errorRate}%`);
    console.log(`  - Cluster Mode:   ${clusterResults250.rps} RPS | p50: ${clusterResults250.latencies.p50}ms | p95: ${clusterResults250.latencies.p95}ms | Errors: ${clusterResults250.errorRate}%`);
    const rpsGain = (((clusterResults250.rps - singleResults250.rps) / singleResults250.rps) * 100).toFixed(1);
    const p50Improvement = (((singleResults250.latencies.p50 - clusterResults250.latencies.p50) / singleResults250.latencies.p50) * 100).toFixed(1);
    console.log(`  -> Throughput Improvement: +${rpsGain}%`);
    console.log(`  -> Median Latency Reduction: ${p50Improvement}% faster`);
    console.log("================================================================================");
}

runClusterEvaluation().catch((err) => {
    console.error("Cluster evaluation failed:", err);
    process.exit(1);
});
