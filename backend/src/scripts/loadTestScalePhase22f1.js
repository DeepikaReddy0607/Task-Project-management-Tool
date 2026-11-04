process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";
import http from "node:http";
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import app from "../app.js";
import { initSocket } from "../socket.js";
import prisma from "../config/prisma.js";

const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";

function calculatePercentiles(latencies) {
    if (latencies.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
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

async function runConcurrentBatch(fn, totalRequests, concurrency) {
    const latencies = [];
    let errors = 0;
    let completed = 0;
    const startWall = Date.now();
    const memBefore = process.memoryUsage();

    async function worker() {
        while (true) {
            const current = completed++;
            if (current >= totalRequests) break;
            const t0 = process.hrtime.bigint();
            try {
                const ok = await fn(current);
                if (!ok) errors++;
            } catch {
                errors++;
            }
            const t1 = process.hrtime.bigint();
            latencies.push(Number(t1 - t0) / 1_000_000);
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    const elapsedSec = (Date.now() - startWall) / 1000;
    const stats = calculatePercentiles(latencies);
    const memAfter = process.memoryUsage();

    return {
        totalRequests,
        concurrency,
        elapsedSec: Number(elapsedSec.toFixed(2)),
        rps: Number((totalRequests / (elapsedSec || 0.001)).toFixed(2)),
        errors,
        errorRate: Number(((errors / totalRequests) * 100).toFixed(2)),
        heapUsedMb: Number((memAfter.heapUsed / 1024 / 1024).toFixed(1)),
        rssMb: Number((memAfter.rss / 1024 / 1024).toFixed(1)),
        ...stats
    };
}

async function runScaleBenchmarks() {
    console.log("============================================================");
    console.log("TASKFLOW PHASE 22F.1: HIGH-SCALE MULTI-USER BENCHMARK HARNESS");
    console.log("============================================================");

    // 1. Boot server
    const server = http.createServer(app);
    const io = initSocket(server);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`[BOOT] Server listening on port ${PORT}`);

    // 2. Prepare test fixtures
    const testEmail = "perf_scale_tester@taskflow.local";
    const password = "PerfPassword123!";
    const hashedPassword = await bcrypt.hash(password, 10);
    let role = await prisma.roles.findFirst({ where: { role_name: "Administrator" } });
    if (!role) role = await prisma.roles.findFirst();

    const user = await prisma.users.upsert({
        where: { email: testEmail },
        update: { password_hash: hashedPassword, is_active: true },
        create: {
            first_name: "Scale",
            last_name: "Tester",
            email: testEmail,
            password_hash: hashedPassword,
            role_id: role.id,
            is_active: true
        }
    });

    const token = jwt.sign(
        { userId: user.id, email: user.email, role: "Administrator" },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    const sampleProject = await prisma.projects.findFirst({ select: { id: true, workspace_id: true } });
    const sampleWorkspace = await prisma.workspaces.findFirst({ select: { id: true } });

    // Ensure tester is member
    if (sampleWorkspace) {
        await prisma.workspace_members.upsert({
            where: {
                workspace_id_user_id: {
                    workspace_id: sampleWorkspace.id,
                    user_id: user.id
                }
            },
            update: { workspace_role: "Admin" },
            create: {
                workspace_id: sampleWorkspace.id,
                user_id: user.id,
                workspace_role: "Admin"
            }
        });
    }

    const authHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const results = {};

    // ------------------------------------------------------------
    // BENCHMARK 1: TARGETED ENDPOINTS UNDER 50 & 100 CONCURRENCY
    // ------------------------------------------------------------
    console.log("\n============================================================");
    console.log("1. TARGETED ENDPOINT LATENCY VERIFICATION (50 & 100 CONCURRENCY)");
    console.log("============================================================");

    const endpoints = [
        {
            name: "GET /api/projects/:id/tasks (100k tasks table)",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/tasks?page=1&limit=20`, { headers: authHeaders });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/notifications (50k notifs table)",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/notifications?page=1&limit=20`, { headers: authHeaders });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/reports/dashboard (Consolidated Analytics)",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/reports/dashboard?projectId=${sampleProject.id}`, { headers: authHeaders });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/search?q=Task&type=all (Optimized Unified Search)",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/search?query=Task&type=all`, { headers: authHeaders });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/calendar (Date-bounded & Indexed Tasks)",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, { headers: authHeaders });
                return res.status === 200;
            }
        },
        {
            name: "POST /api/auth/login (Threadpool-expanded Bcrypt)",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: testEmail, password })
                });
                return res.status === 200;
            }
        }
    ];

    results.targetedEndpoints = [];

    for (const ep of endpoints) {
        console.log(`\nBenchmarking: ${ep.name}`);
        // 50 concurrency, 100 requests
        const r50 = await runConcurrentBatch(ep.fn, 100, 50);
        console.log(`  [C=50]  RPS: ${r50.rps} | p50: ${r50.p50}ms | p95: ${r50.p95}ms | p99: ${r50.p99}ms | Errors: ${r50.errors}`);

        // 100 concurrency, 200 requests
        const r100 = await runConcurrentBatch(ep.fn, 200, 100);
        console.log(`  [C=100] RPS: ${r100.rps} | p50: ${r100.p50}ms | p95: ${r100.p95}ms | p99: ${r100.p99}ms | Errors: ${r100.errors}`);

        results.targetedEndpoints.push({
            name: ep.name,
            c50: r50,
            c100: r100
        });
    }

    // ------------------------------------------------------------
    // BENCHMARK 2: REALISTIC MIXED WORKLOAD ACROSS CONCURRENCY TIERS
    // ------------------------------------------------------------
    console.log("\n============================================================");
    console.log("2. REALISTIC MIXED WORKLOAD MULTI-USER SCALABILITY MATRIX");
    console.log("============================================================");

    async function executeMixedUserJourney(reqIdx) {
        // Weighted realistic distribution:
        // 0-24: Tasks (25%)
        // 25-44: Notifications (20%)
        // 45-64: Calendar (20%)
        // 65-79: Search (15%)
        // 80-89: Dashboard (10%)
        // 90-99: Auth Login (10%)
        const bucket = reqIdx % 100;
        let res;

        if (bucket < 25) {
            res = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/tasks?page=1&limit=20`, { headers: authHeaders });
        } else if (bucket < 45) {
            res = await fetch(`${BASE_URL}/api/notifications?page=1&limit=20`, { headers: authHeaders });
        } else if (bucket < 65) {
            res = await fetch(`${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`, { headers: authHeaders });
        } else if (bucket < 80) {
            res = await fetch(`${BASE_URL}/api/search?query=Task&type=all`, { headers: authHeaders });
        } else if (bucket < 90) {
            res = await fetch(`${BASE_URL}/api/reports/dashboard?projectId=${sampleProject.id}`, { headers: authHeaders });
        } else {
            res = await fetch(`${BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: testEmail, password })
            });
        }
        return res && (res.status === 200 || res.status === 304);
    }

    const concurrencyTiers = [10, 25, 50, 100, 250, 500];
    results.mixedWorkload = [];

    for (const c of concurrencyTiers) {
        const totalRequests = Math.max(c * 4, 100);
        console.log(`\nTesting Tier: ${c} Concurrent Users (${totalRequests} total requests)...`);
        try {
            const tierResult = await runConcurrentBatch(executeMixedUserJourney, totalRequests, c);
            console.log(`  -> RPS: ${tierResult.rps} | p50: ${tierResult.p50}ms | p95: ${tierResult.p95}ms | p99: ${tierResult.p99}ms | ErrorRate: ${tierResult.errorRate}% | Heap: ${tierResult.heapUsedMb}MB`);
            results.mixedWorkload.push(tierResult);
        } catch (tierErr) {
            console.error(`  -> Failed at tier C=${c}:`, tierErr.message);
            results.mixedWorkload.push({ concurrency: c, error: tierErr.message });
            break;
        }
    }

    // ------------------------------------------------------------
    // BENCHMARK 3: REAL-TIME SOCKET.IO CONCURRENT COLLABORATION
    // ------------------------------------------------------------
    console.log("\n============================================================");
    console.log("3. REAL-TIME SOCKET.IO HIGH-CONCURRENCY COLLABORATION TEST");
    console.log("============================================================");

    const SOCKET_CONCURRENCY = 100;
    console.log(`Establishing ${SOCKET_CONCURRENCY} concurrent Socket.IO client connections...`);

    const sockets = [];
    let connectedCount = 0;
    let roomJoinedCount = 0;
    let eventsReceived = 0;

    const socketConnectT0 = Date.now();

    for (let i = 0; i < SOCKET_CONCURRENCY; i++) {
        const s = Client(`http://127.0.0.1:${PORT}`, {
            auth: { token },
            transports: ["websocket"],
            reconnection: false
        });

        s.on("connect", () => {
            connectedCount++;
            s.emit("join:project", sampleProject.id);
        });

        s.on("joined:project", () => {
            roomJoinedCount++;
        });

        s.on("task:updated", () => {
            eventsReceived++;
        });

        sockets.push(s);
    }

    // Wait up to 3 seconds for connections
    await new Promise((r) => setTimeout(r, 2000));
    const socketConnectElapsed = Date.now() - socketConnectT0;

    console.log(`  -> Connected: ${connectedCount}/${SOCKET_CONCURRENCY} in ${socketConnectElapsed}ms`);
    console.log(`  -> Joined Project Room: ${roomJoinedCount}/${SOCKET_CONCURRENCY}`);

    // Broadcast 5 events into project room
    console.log("  -> Broadcasting 5 project-wide realtime events...");
    const broadcastT0 = Date.now();
    for (let i = 1; i <= 5; i++) {
        io.to(`project:${sampleProject.id}`).emit("task:updated", {
            taskId: "fake-task",
            projectId: sampleProject.id,
            version: i
        });
    }

    await new Promise((r) => setTimeout(r, 1000));
    const expectedEvents = roomJoinedCount * 5;
    const socketBroadcastElapsed = Date.now() - broadcastT0;

    console.log(`  -> Broadcast Completed in ${socketBroadcastElapsed}ms`);
    console.log(`  -> Total Events Received: ${eventsReceived} / ${expectedEvents} expected (${((eventsReceived / (expectedEvents || 1)) * 100).toFixed(1)}% delivery)`);

    results.realtime = {
        socketConcurrency: SOCKET_CONCURRENCY,
        connectedCount,
        roomJoinedCount,
        socketConnectElapsedMs: socketConnectElapsed,
        eventsReceived,
        expectedEvents,
        deliveryRatePercent: Number(((eventsReceived / (expectedEvents || 1)) * 100).toFixed(1))
    };

    // Cleanup sockets
    sockets.forEach((s) => s.disconnect());

    // Teardown server
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();

    console.log("\n============================================================");
    console.log("BENCHMARK RUN COMPLETED. DATA READY FOR REPORT ARTIFACT.");
    console.log("============================================================");
    console.log(JSON.stringify(results, null, 2));
}

runScaleBenchmarks().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
});
