import "dotenv/config";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import http from "node:http";
import os from "node:os";
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { initSocket } from "../socket.js";
import prisma from "../config/prisma.js";

const PORT = 5200;
const BASE_URL = `http://127.0.0.1:${PORT}`;
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

async function runBenchmark() {
    console.log("================================================================================");
    console.log("TASKFLOW PHASE 22F.3: EVENT LOOP OPTIMIZATION & MULTI-PROCESS SCALABILITY");
    console.log("================================================================================");

    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || "Intel Core i5-1334U";
    const cpuCores = cpus.length;
    const totalMemGb = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeMemGb = (os.freemem() / (1024 ** 3)).toFixed(2);

    const pgInfo = await prisma.$queryRawUnsafe(`
        SELECT version(), current_setting('max_connections') as max_conns, current_setting('shared_buffers') as shared_bufs
    `);
    const pgVersion = pgInfo[0]?.version?.split(' on ')[0] || "PostgreSQL 18.1";
    const pgMaxConns = pgInfo[0]?.max_conns || "100";
    const pgSharedBufs = pgInfo[0]?.shared_bufs || "128MB";

    const totalTasksInDb = await prisma.tasks.count();
    const totalNotifsInDb = await prisma.notifications.count();
    const totalUsersInDb = await prisma.users.count();
    const totalProjectsInDb = await prisma.projects.count();
    const totalWorkspacesInDb = await prisma.workspaces.count();

    console.log("\n[SYSTEM & RUNTIME INVENTORY]");
    console.log(`  - CPU:                    ${cpuModel} (${cpuCores} logical cores)`);
    console.log(`  - Memory:                 ${totalMemGb} GB total (${freeMemGb} GB available)`);
    console.log(`  - OS:                     ${os.type()} ${os.release()} (${os.arch()})`);
    console.log(`  - Node.js Runtime:        ${process.version}`);
    console.log(`  - libuv Threadpool Size:  ${process.env.UV_THREADPOOL_SIZE || "64"}`);
    console.log(`  - PostgreSQL:             ${pgVersion} (max_conns: ${pgMaxConns}, shared_buffers: ${pgSharedBufs})`);
    console.log(`  - Scale Dataset:          ${totalTasksInDb.toLocaleString()} tasks, ${totalNotifsInDb.toLocaleString()} notifications, ${totalUsersInDb.toLocaleString()} users`);

    // Boot local test server
    const server = http.createServer(app);
    const io = initSocket(server);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`\n[BOOT] Test HTTP/WebSocket server running on 127.0.0.1:${PORT}`);

    // Load user sessions
    console.log("\n[SETUP] Pre-populating 500 distinct synthetic user sessions with valid JWTs...");
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
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        };
    });
    console.log(`  -> Initialized ${userSessions.length} unique user sessions.`);

    const report = {
        system: {
            cpuModel,
            cpuCores,
            totalMemGb,
            pgVersion,
            pgMaxConns,
            threadpoolSize: process.env.UV_THREADPOOL_SIZE || "64",
            dataset: { tasks: totalTasksInDb, notifications: totalNotifsInDb, users: totalUsersInDb }
        },
        independentEndpoints: {},
        concurrencyTiers: [],
        socketIoBenchmarks: [],
        threadpoolComparison: []
    };

    // ------------------------------------------------------------------------
    // SECTION 1: INDEPENDENT ENDPOINT BENCHMARKS
    // ------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("1. INDEPENDENT ENDPOINT BENCHMARKS (15 requests each, measuring pure latency)");
    console.log("================================================================================");

    const testUser = userSessions[0];
    const headers = testUser.headers;
    const testProjectId = testUser.projectId;

    // Helper for testing an endpoint
    async function benchmarkEndpoint(name, url, options = {}) {
        const latencies = [];
        let errors = 0;
        let sampleResult = null;

        for (let i = 0; i < 15; i++) {
            const t0 = process.hrtime.bigint();
            try {
                const res = await fetch(url, options);
                const t1 = process.hrtime.bigint();
                const ms = Number(t1 - t0) / 1_000_000;
                latencies.push(ms);
                if (!res.ok) errors++;
                if (i === 0 && res.ok) {
                    sampleResult = await res.json().catch(() => null);
                }
            } catch {
                errors++;
            }
        }
        const stats = calculatePercentiles(latencies);
        console.log(`  - ${name.padEnd(25)} | p50: ${stats.p50}ms | p95: ${stats.p95}ms | p99: ${stats.p99}ms | Errors: ${errors}/15`);
        report.independentEndpoints[name] = { ...stats, errors, errorRate: Number(((errors / 15) * 100).toFixed(1)) };
        return sampleResult;
    }

    // Benchmark 1: Auth Login
    await benchmarkEndpoint(
        "POST /api/auth/login",
        `${BASE_URL}/api/auth/login`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: testUser.email, password: "Password123!" })
        }
    );

    // Benchmark 2: Workspaces
    await benchmarkEndpoint("GET /api/workspaces", `${BASE_URL}/api/workspaces`, { headers });

    // Benchmark 3: Project Tasks
    await benchmarkEndpoint(`GET /projects/tasks`, `${BASE_URL}/api/projects/${testProjectId}/tasks?page=1&limit=20`, { headers });

    // Benchmark 4: Task Creation
    const createdTask = await benchmarkEndpoint(
        "POST /projects/tasks",
        `${BASE_URL}/api/projects/${testProjectId}/tasks`,
        {
            method: "POST",
            headers,
            body: JSON.stringify({
                title: "Phase 22F.3 Benchmark Task",
                priority: "Medium",
                status: "Backlog"
            })
        }
    );
    const createdTaskId = createdTask?.task?.id || createdTask?.data?.id || createdTask?.id;

    // Benchmark 5: Task Status Update
    if (createdTaskId) {
        await benchmarkEndpoint(
            "PATCH /tasks/:id/status",
            `${BASE_URL}/api/tasks/${createdTaskId}/status`,
            {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: "In Progress" })
            }
        );
    }

    // Benchmark 6: Dashboard Analytics
    await benchmarkEndpoint(
        "GET /reports/dashboard",
        `${BASE_URL}/api/reports/dashboard?projectId=${testProjectId}`,
        { headers }
    );

    // Benchmark 7: Calendar
    await benchmarkEndpoint(
        "GET /api/calendar",
        `${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`,
        { headers }
    );

    // Benchmark 8: Notifications
    await benchmarkEndpoint(
        "GET /api/notifications",
        `${BASE_URL}/api/notifications?page=1&limit=20`,
        { headers }
    );

    // Benchmark 9: Global Search
    await benchmarkEndpoint(
        "GET /api/search",
        `${BASE_URL}/api/search?query=Task&type=all`,
        { headers }
    );

    // ------------------------------------------------------------------------
    // SECTION 2: REALISTIC MIXED WORKLOAD & EVENT LOOP DIAGNOSTICS (50, 100, 250, 500 USERS)
    // ------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("2. CONCURRENCY TIERS WITH EVENT LOOP DIAGNOSTICS (ELD, ELU, CPU, HEAP, RPS)");
    console.log("================================================================================");

    const tiers = [50, 100, 250, 500];

    for (const concurrency of tiers) {
        console.log(`\n--------------------------------------------------------------------------------`);
        console.log(`TESTING CONCURRENCY TIER: ${concurrency} SIMULTANEOUS USERS`);
        console.log(`--------------------------------------------------------------------------------`);

        // Setup event loop delay monitor
        const eldMonitor = monitorEventLoopDelay({ resolution: 20 });
        eldMonitor.enable();

        // Capture initial ELU, CPU, Memory
        const eluStart = performance.eventLoopUtilization();
        const cpuStart = process.cpuUsage();
        const memStart = process.memoryUsage();
        const wallStart = Date.now();

        const latencies = [];
        let errors = 0;
        let completedRequests = 0;
        let peakActivePg = 0;
        const createdTaskIds = [];

        // 12-second test window
        const testDurationSec = 12;
        const stopTime = Date.now() + testDurationSec * 1000;

        async function runUser(uIdx) {
            const user = userSessions[uIdx % userSessions.length];
            const uHeaders = user.headers;
            const pId = user.projectId;
            const userTasks = [];

            // Ramp-up stagger
            const staggerMs = Math.floor((uIdx / concurrency) * 2500);
            await new Promise((r) => setTimeout(r, staggerMs));

            let step = 0;
            while (Date.now() < stopTime) {
                step++;
                const t0 = process.hrtime.bigint();
                let ok = false;
                const action = step % 8;

                try {
                    const fetchOpts = (extra = {}) => ({
                        ...extra,
                        headers: uHeaders,
                        signal: AbortSignal.timeout(8000)
                    });

                    if (action === 0) {
                        const res = await fetch(`${BASE_URL}/api/workspaces`, fetchOpts());
                        ok = res.status === 200;
                    } else if (action === 1) {
                        const res = await fetch(`${BASE_URL}/api/projects/${pId}/tasks?page=1&limit=20`, fetchOpts());
                        ok = res.status === 200;
                    } else if (action === 2) {
                        const res = await fetch(`${BASE_URL}/api/projects/${pId}/tasks`, fetchOpts({
                            method: "POST",
                            body: JSON.stringify({
                                title: `U${user.index} T${step}`,
                                priority: "Medium",
                                status: "Backlog"
                            })
                        }));
                        ok = res.status === 201;
                        if (ok) {
                            const data = await res.json().catch(() => null);
                            const tId = data?.task?.id || data?.data?.id || data?.id;
                            if (tId) {
                                userTasks.push(tId);
                                createdTaskIds.push(tId);
                            }
                        }
                    } else if (action === 3) {
                        if (userTasks.length > 0) {
                            const tId = userTasks[userTasks.length - 1];
                            const res = await fetch(`${BASE_URL}/api/tasks/${tId}/status`, fetchOpts({
                                method: "PATCH",
                                body: JSON.stringify({ status: "In Progress" })
                            }));
                            ok = res.status === 200;
                        } else {
                            const res = await fetch(`${BASE_URL}/api/projects/${pId}/tasks?page=1&limit=20`, fetchOpts());
                            ok = res.status === 200;
                        }
                    } else if (action === 4) {
                        const res = await fetch(`${BASE_URL}/api/reports/dashboard?projectId=${pId}`, fetchOpts());
                        ok = res.status === 200;
                    } else if (action === 5) {
                        const res = await fetch(`${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, fetchOpts());
                        ok = res.status === 200;
                    } else if (action === 6) {
                        const res = await fetch(`${BASE_URL}/api/notifications?page=1&limit=20`, fetchOpts());
                        ok = res.status === 200;
                    } else {
                        const res = await fetch(`${BASE_URL}/api/search?query=Task&type=all`, fetchOpts());
                        ok = res.status === 200;
                    }
                } catch {
                    ok = false;
                }

                const t1 = process.hrtime.bigint();
                latencies.push(Number(t1 - t0) / 1_000_000);
                if (!ok) errors++;
                completedRequests++;

                if (completedRequests % 50 === 0) {
                    const conns = await getPgActiveConnections();
                    if (conns > peakActivePg) peakActivePg = conns;
                }

                // Realistic think time (25ms - 55ms)
                await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 30)));
            }
        }

        const workers = Array.from({ length: concurrency }, (_, i) => runUser(i));
        await Promise.all(workers);

        eldMonitor.disable();

        const wallDurationSec = (Date.now() - wallStart) / 1000;
        const eluEnd = performance.eventLoopUtilization(eluStart);
        const cpuDiff = process.cpuUsage(cpuStart);
        const memEnd = process.memoryUsage();

        const totalCpuMicros = cpuDiff.user + cpuDiff.system;
        const totalWallMicros = wallDurationSec * 1_000_000;
        const cpuPercent = Number(((totalCpuMicros / totalWallMicros) * 100).toFixed(1));

        // ELD in milliseconds (convert nanoseconds to ms)
        const eldStats = {
            min: Number((eldMonitor.min / 1_000_000).toFixed(2)),
            max: Number((eldMonitor.max / 1_000_000).toFixed(2)),
            mean: Number((eldMonitor.mean / 1_000_000).toFixed(2)),
            p50: Number((eldMonitor.percentile(50) / 1_000_000).toFixed(2)),
            p95: Number((eldMonitor.percentile(95) / 1_000_000).toFixed(2)),
            p99: Number((eldMonitor.percentile(99) / 1_000_000).toFixed(2))
        };

        const rps = Number((completedRequests / wallDurationSec).toFixed(2));
        const errorRate = Number(((errors / completedRequests) * 100).toFixed(2));
        const latPercentiles = calculatePercentiles(latencies);

        const tierResult = {
            concurrency,
            durationSec: Number(wallDurationSec.toFixed(2)),
            totalRequests: completedRequests,
            rps,
            errors,
            errorRate,
            latencies: latPercentiles,
            eventLoopDelay: eldStats,
            eventLoopUtilization: Number((eluEnd.utilization * 100).toFixed(2)),
            cpuUsagePercent: cpuPercent,
            heapUsedMb: Number((memEnd.heapUsed / (1024 * 1024)).toFixed(1)),
            heapTotalMb: Number((memEnd.heapTotal / (1024 * 1024)).toFixed(1)),
            rssMb: Number((memEnd.rss / (1024 * 1024)).toFixed(1)),
            peakPgConnections: peakActivePg
        };

        report.concurrencyTiers.push(tierResult);

        console.log(`  - Throughput:          ${rps} RPS (${completedRequests} reqs in ${wallDurationSec.toFixed(1)}s)`);
        console.log(`  - Error Rate:          ${errorRate}% (${errors} errors)`);
        console.log(`  - Latency:             p50: ${latPercentiles.p50}ms | p95: ${latPercentiles.p95}ms | p99: ${latPercentiles.p99}ms | Max: ${latPercentiles.max}ms`);
        console.log(`  - Event Loop Delay:    p50: ${eldStats.p50}ms | p95: ${eldStats.p95}ms | p99: ${eldStats.p99}ms | Max: ${eldStats.max}ms`);
        console.log(`  - Event Loop Util:     ${tierResult.eventLoopUtilization}%`);
        console.log(`  - Process CPU Load:    ${cpuPercent}%`);
        console.log(`  - Heap Usage:          ${tierResult.heapUsedMb} MB (RSS: ${tierResult.rssMb} MB)`);
        console.log(`  - Peak PG Conns:       ${peakActivePg}`);

        // Clean up created benchmark tasks in batches
        if (createdTaskIds.length > 0) {
            await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } }).catch(() => {});
        }

        // Brief cooldown
        await new Promise((r) => setTimeout(r, 1500));
    }

    // ------------------------------------------------------------------------
    // SECTION 3: SOCKET.IO CONCURRENCY BENCHMARKS (100, 250, 500 SOCKETS)
    // ------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("3. SOCKET.IO CONCURRENCY & BROADCAST DELIVERY (100, 250, 500 CONNECTIONS)");
    console.log("================================================================================");

    const socketTiers = [100, 250, 500];

    for (const targetSockets of socketTiers) {
        console.log(`\n--------------------------------------------------------------------------------`);
        console.log(`TESTING SOCKET.IO: ${targetSockets} CONCURRENT WEBSOCKET CLIENTS`);
        console.log(`--------------------------------------------------------------------------------`);

        const clients = [];
        let connectedCount = 0;
        let receivedBroadcasts = 0;
        const connectLatencies = [];
        const roundTripLatencies = [];

        const tStartConnect = Date.now();

        // Connect sockets with stagger
        for (let i = 0; i < targetSockets; i++) {
            const user = userSessions[i % userSessions.length];
            const t0 = process.hrtime.bigint();
            const client = Client(BASE_URL, {
                auth: { token: user.token },
                transports: ["websocket"],
                forceNew: true,
                timeout: 10000
            });

            client.on("connect", () => {
                const t1 = process.hrtime.bigint();
                connectLatencies.push(Number(t1 - t0) / 1_000_000);
                connectedCount++;
            });

            client.on("task.created", (payload) => {
                receivedBroadcasts++;
                if (payload.sentAt) {
                    const rtt = Date.now() - payload.sentAt;
                    roundTripLatencies.push(rtt);
                }
            });

            clients.push(client);
            if (i % 20 === 0) {
                await new Promise((r) => setTimeout(r, 20));
            }
        }

        // Wait up to 8 seconds for all to connect
        const connectDeadline = Date.now() + 8000;
        while (connectedCount < targetSockets && Date.now() < connectDeadline) {
            await new Promise((r) => setTimeout(r, 100));
        }

        const totalConnectTime = (Date.now() - tStartConnect) / 1000;
        const connStats = calculatePercentiles(connectLatencies);
        console.log(`  - Handshake Success:   ${connectedCount}/${targetSockets} (${((connectedCount / targetSockets) * 100).toFixed(1)}%) in ${totalConnectTime.toFixed(2)}s`);
        console.log(`  - Handshake Latency:   p50: ${connStats.p50}ms | p95: ${connStats.p95}ms | p99: ${connStats.p99}ms`);

        // Test Broadcast
        const broadcastSentAt = Date.now();

        // Emit broadcast to all connected sockets
        io.emit("task.created", {
            sentAt: broadcastSentAt,
            message: "Benchmark broadcast test",
            taskId: "synthetic-socket-task-id"
        });

        // Wait 1.5s for broadcast propagation
        await new Promise((r) => setTimeout(r, 1500));

        const rttStats = calculatePercentiles(roundTripLatencies);
        const deliveryRate = connectedCount > 0 ? Number(((receivedBroadcasts / connectedCount) * 100).toFixed(1)) : 0;

        console.log(`  - Broadcast Delivery:  ${receivedBroadcasts} messages received (${deliveryRate}%)`);
        console.log(`  - Propagation RTT:     p50: ${rttStats.p50}ms | p95: ${rttStats.p95}ms | max: ${rttStats.max}ms`);

        report.socketIoBenchmarks.push({
            targetSockets,
            connectedSockets: connectedCount,
            connectionSuccessRate: Number(((connectedCount / targetSockets) * 100).toFixed(1)),
            connectLatencies: connStats,
            broadcastReceived: receivedBroadcasts,
            deliveryRate,
            roundTripLatencies: rttStats
        });

        // Disconnect clients
        clients.forEach((c) => c.disconnect());
        await new Promise((r) => setTimeout(r, 800));
    }

    // Close server
    await new Promise((resolve) => server.close(resolve));
    console.log("\n[SHUTDOWN] Benchmark test server closed.");

    console.log("\n================================================================================");
    console.log("PHASE 22F.3 BENCHMARK EXECUTION COMPLETE");
    console.log("================================================================================");
    console.log(JSON.stringify(report, null, 2));
}

runBenchmark().catch((err) => {
    console.error("Benchmark failed with fatal error:", err);
    process.exit(1);
});
