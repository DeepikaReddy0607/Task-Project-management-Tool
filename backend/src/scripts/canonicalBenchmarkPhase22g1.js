import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";

function calculatePercentiles(latencies) {
    if (!latencies || latencies.length === 0) {
        return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
    }
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

async function getPgActiveConnections() {
    try {
        const res = await prisma.$queryRawUnsafe(`
            SELECT count(*)::int as active_conns 
            FROM pg_stat_activity 
            WHERE datname = current_database() AND state = 'active'
        `);
        return res[0]?.active_conns || 0;
    } catch {
        return 0;
    }
}

// Persistent HTTP Agent to model realistic browser connection pooling
const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 1000,
    keepAliveMsecs: 60000
});

function httpRequest(urlStr, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const reqOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method || "GET",
            headers: options.headers || {},
            agent: httpAgent,
            timeout: 12000
        };

        const req = http.request(reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                resolve({
                    status: res.statusCode,
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    text: async () => data,
                    json: async () => {
                        try { return JSON.parse(data); } catch { return null; }
                    }
                });
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error("Request timed out"));
        });

        if (options.body) {
            req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

async function waitForServer(port, maxWaitMs = 15000) {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 2000));
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await httpRequest(`http://127.0.0.1:${port}/api/workspaces`, {
                headers: { Authorization: "Bearer test" }
            });
            if (res.status === 401 || res.status === 200) return true;
        } catch {}
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Server on port ${port} did not become ready`);
}

async function runCanonicalTier(baseUrl, userSessions, concurrency, durationSec = 10) {
    const eldMonitor = monitorEventLoopDelay({ resolution: 20 });
    eldMonitor.enable();

    const eluStart = performance.eventLoopUtilization();
    const cpuStart = process.cpuUsage();
    const memStart = process.memoryUsage();
    const wallStart = Date.now();

    const latencies = [];
    let errors = 0;
    let completed = 0;
    let peakPg = 0;
    const createdTaskIds = [];

    const stopTime = Date.now() + durationSec * 1000;

    async function runVirtualUser(idx) {
        const user = userSessions[idx % userSessions.length];
        const headers = user.headers;
        const pId = user.projectId;
        const userTasks = [];

        // Ramp-up: stagger evenly across 3.0s
        const staggerMs = Math.floor((idx / concurrency) * 3000);
        await new Promise((r) => setTimeout(r, staggerMs));

        let step = 0;
        while (Date.now() < stopTime) {
            step++;
            const t0 = process.hrtime.bigint();
            let ok = false;
            const action = step % 8;

            try {
                if (action === 0) {
                    const res = await httpRequest(`${baseUrl}/api/workspaces`, { headers });
                    ok = res.status === 200;
                } else if (action === 1) {
                    const res = await httpRequest(`${baseUrl}/api/projects/${pId}/tasks?page=1&limit=20`, { headers });
                    ok = res.status === 200;
                } else if (action === 2) {
                    const res = await httpRequest(`${baseUrl}/api/projects/${pId}/tasks`, {
                        method: "POST",
                        headers,
                        body: {
                            title: `Canonical22g1 U${user.index} T${step}`,
                            priority: "Medium",
                            status: "Backlog"
                        }
                    });
                    ok = res.status === 201;
                    if (ok) {
                        const data = await res.json();
                        const tId = data?.task?.id || data?.data?.id || data?.id;
                        if (tId) {
                            userTasks.push(tId);
                            createdTaskIds.push(tId);
                        }
                    }
                } else if (action === 3) {
                    if (userTasks.length > 0) {
                        const targetId = userTasks[userTasks.length - 1];
                        const res = await httpRequest(`${baseUrl}/api/tasks/${targetId}/status`, {
                            method: "PATCH",
                            headers,
                            body: { status: "In Progress" }
                        });
                        ok = res.status === 200;
                    } else {
                        const res = await httpRequest(`${baseUrl}/api/projects/${pId}/tasks?page=1&limit=20`, { headers });
                        ok = res.status === 200;
                    }
                } else if (action === 4) {
                    const res = await httpRequest(`${baseUrl}/api/reports/dashboard?projectId=${pId}`, { headers });
                    ok = res.status === 200;
                } else if (action === 5) {
                    const res = await httpRequest(`${baseUrl}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, { headers });
                    ok = res.status === 200;
                } else if (action === 6) {
                    const res = await httpRequest(`${baseUrl}/api/notifications?page=1&limit=20`, { headers });
                    ok = res.status === 200;
                } else {
                    const res = await httpRequest(`${baseUrl}/api/search?query=Task&type=all`, { headers });
                    ok = res.status === 200;
                }
            } catch {
                ok = false;
            }

            const t1 = process.hrtime.bigint();
            latencies.push(Number(t1 - t0) / 1_000_000);
            if (!ok) errors++;
            completed++;

            if (completed % 40 === 0) {
                const conns = await getPgActiveConnections();
                if (conns > peakPg) peakPg = conns;
            }

            // Realistic think time between actions (30ms - 65ms)
            await new Promise((r) => setTimeout(r, 30 + Math.floor(Math.random() * 35)));
        }
    }

    const workers = Array.from({ length: concurrency }, (_, i) => runVirtualUser(i));
    await Promise.all(workers);

    eldMonitor.disable();

    const wallDurationSec = (Date.now() - wallStart) / 1000;
    const eluEnd = performance.eventLoopUtilization(eluStart);
    const cpuDiff = process.cpuUsage(cpuStart);
    const memEnd = process.memoryUsage();

    const totalCpuMicros = cpuDiff.user + cpuDiff.system;
    const cpuPercent = Number(((totalCpuMicros / (wallDurationSec * 1_000_000)) * 100).toFixed(1));

    const eld = {
        min: Number((eldMonitor.min / 1_000_000).toFixed(2)),
        p50: Number((eldMonitor.percentile(50) / 1_000_000).toFixed(2)),
        p95: Number((eldMonitor.percentile(95) / 1_000_000).toFixed(2)),
        p99: Number((eldMonitor.percentile(99) / 1_000_000).toFixed(2)),
        max: Number((eldMonitor.max / 1_000_000).toFixed(2)),
        mean: Number((eldMonitor.mean / 1_000_000).toFixed(2))
    };

    const latStats = calculatePercentiles(latencies);
    const rps = Number((completed / wallDurationSec).toFixed(2));
    const errorRate = Number(((errors / completed) * 100).toFixed(2));

    return {
        concurrency,
        wallDurationSec: Number(wallDurationSec.toFixed(2)),
        completed,
        errors,
        errorRate,
        rps,
        latencies: latStats,
        eventLoopDelay: eld,
        eventLoopUtilization: Number((eluEnd.utilization * 100).toFixed(1)),
        cpuPercent,
        memoryRssMb: Number((memEnd.rss / 1024 / 1024).toFixed(1)),
        memoryHeapUsedMb: Number((memEnd.heapUsed / 1024 / 1024).toFixed(1)),
        peakPgConnections: peakPg,
        createdTasksCount: createdTaskIds.length
    };
}

async function main() {
    console.log("================================================================================");
    console.log("TASKFLOW PHASE 22G.1 CANONICAL REPRODUCIBLE BENCHMARK RUNNER");
    console.log("================================================================================");
    console.log(`OS: ${os.type()} ${os.release()} (${os.arch()}), CPUs: ${os.cpus().length}`);
    console.log(`Node: ${process.version}`);

    // Verify task count
    const taskCount = await prisma.tasks.count();
    const notifCount = await prisma.notifications.count();
    const userCount = await prisma.users.count();
    console.log(`Database state: ${taskCount} tasks, ${notifCount} notifications, ${userCount} users.`);

    // Prepare 500 distinct sessions with synthetic users
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

    console.log(`Initialized ${userSessions.length} independent user sessions.`);

    const backendDir = path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend");
    const tiers = [50, 100, 250, 500];
    const canonicalResults = {
        singleProcess: [],
        clusterMode: []
    };

    // ========================================================================
    // SUITE 1: SINGLE PROCESS BENCHMARK (PORT 5400)
    // ========================================================================
    console.log("\n================================================================================");
    console.log("SUITE 1: SINGLE PROCESS MODE (Port 5400, Pool: 50)");
    console.log("================================================================================");

    const singlePort = 5400;
    const singleProc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(singlePort),
            CLUSTER_MODE: "false",
            DB_POOL_SIZE: "50",
            DB_CONNECTION_TIMEOUT: "20000",
            UV_THREADPOOL_SIZE: "64"
        },
        stdio: "inherit"
    });

    await waitForServer(singlePort);
    console.log("Single process server ready on port", singlePort);

    for (const concurrency of tiers) {
        console.log(`\n--- Single Process: Running ${concurrency} Users (10s) ---`);
        const result = await runCanonicalTier(`http://127.0.0.1:${singlePort}`, userSessions, concurrency, 10);
        canonicalResults.singleProcess.push(result);
        console.log(`  -> Throughput: ${result.rps} RPS | p50: ${result.latencies.p50}ms | p95: ${result.latencies.p95}ms | p99: ${result.latencies.p99}ms | Errors: ${result.errorRate}%`);
        console.log(`  -> ELD: p50: ${result.eventLoopDelay.p50}ms, p95: ${result.eventLoopDelay.p95}ms | ELU: ${result.eventLoopUtilization}% | Peak PG: ${result.peakPgConnections}`);
        await new Promise((r) => setTimeout(r, 1500));
    }

    singleProc.kill();
    await new Promise((r) => setTimeout(r, 2000));

    // ========================================================================
    // SUITE 2: THREE-WORKER CLUSTER BENCHMARK (PORT 5401)
    // ========================================================================
    console.log("\n================================================================================");
    console.log("SUITE 2: THREE-WORKER CLUSTER MODE (Port 5401, Pool: 24/worker = 72 total)");
    console.log("================================================================================");

    const clusterPort = 5401;
    const clusterProc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(clusterPort),
            CLUSTER_MODE: "true",
            CLUSTER_WORKERS: "3",
            DB_POOL_SIZE: "24",
            DB_CONNECTION_TIMEOUT: "20000",
            UV_THREADPOOL_SIZE: "64"
        },
        stdio: "inherit"
    });

    await waitForServer(clusterPort);
    console.log("Cluster server ready on port", clusterPort);

    for (const concurrency of tiers) {
        console.log(`\n--- Cluster Mode (3w): Running ${concurrency} Users (10s) ---`);
        const result = await runCanonicalTier(`http://127.0.0.1:${clusterPort}`, userSessions, concurrency, 10);
        canonicalResults.clusterMode.push(result);
        console.log(`  -> Throughput: ${result.rps} RPS | p50: ${result.latencies.p50}ms | p95: ${result.latencies.p95}ms | p99: ${result.latencies.p99}ms | Errors: ${result.errorRate}%`);
        console.log(`  -> ELD: p50: ${result.eventLoopDelay.p50}ms, p95: ${result.eventLoopDelay.p95}ms | ELU: ${result.eventLoopUtilization}% | Peak PG: ${result.peakPgConnections}`);
        await new Promise((r) => setTimeout(r, 1500));
    }

    clusterProc.kill();
    await new Promise((r) => setTimeout(r, 2000));

    // ========================================================================
    // FINAL REPORT & ACCEPTANCE TARGET ASSESSMENT
    // ========================================================================
    console.log("\n================================================================================");
    console.log("CANONICAL BENCHMARK SUMMARY & ACCEPTANCE EVALUATION");
    console.log("================================================================================");
    console.log("Targets: 50u (p95<500ms, err<1%), 100u (p95<500ms, err<1%), 250u (p95<1000ms, err<1%), 500u (p95<2000ms, err<1%)");
    console.log("\nSINGLE PROCESS RESULTS:");
    console.table(canonicalResults.singleProcess.map(r => ({
        Users: r.concurrency,
        Reqs: r.completed,
        RPS: r.rps,
        Errors: `${r.errors} (${r.errorRate}%)`,
        p50_ms: r.latencies.p50,
        p95_ms: r.latencies.p95,
        p99_ms: r.latencies.p99,
        ELD_p95_ms: r.eventLoopDelay.p95,
        ELU_pct: r.eventLoopUtilization,
        Peak_PG: r.peakPgConnections
    })));

    console.log("\nCLUSTER MODE (3 WORKERS) RESULTS:");
    console.table(canonicalResults.clusterMode.map(r => ({
        Users: r.concurrency,
        Reqs: r.completed,
        RPS: r.rps,
        Errors: `${r.errors} (${r.errorRate}%)`,
        p50_ms: r.latencies.p50,
        p95_ms: r.latencies.p95,
        p99_ms: r.latencies.p99,
        ELD_p95_ms: r.eventLoopDelay.p95,
        ELU_pct: r.eventLoopUtilization,
        Peak_PG: r.peakPgConnections
    })));

    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
});
