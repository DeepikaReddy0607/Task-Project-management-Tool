import http from "node:http";
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import app from "../app.js";
import { initSocket } from "../socket.js";
import prisma from "../config/prisma.js";

const PORT = 5098;
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

    return {
        totalRequests,
        concurrency,
        elapsedSec: Number(elapsedSec.toFixed(2)),
        rps: Number((totalRequests / (elapsedSec || 0.001)).toFixed(2)),
        errors,
        errorRate: Number(((errors / totalRequests) * 100).toFixed(2)),
        ...stats
    };
}

async function runLoadTests() {
    console.log("============================================================");
    console.log("TASKFLOW PHASE 22F: PERFORMANCE & LOAD BENCHMARK HARNESS");
    console.log("============================================================");

    // 1. Boot server
    const server = http.createServer(app);
    const io = initSocket(server);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`[BOOT] Server listening on port ${PORT}`);

    // 2. Prepare test fixtures
    const testEmail = "perf_tester@taskflow.local";
    const password = "PerfPassword123!";
    const hashedPassword = await bcrypt.hash(password, 10);
    let role = await prisma.roles.findFirst({ where: { role_name: "Administrator" } });
    if (!role) role = await prisma.roles.findFirst();

    const user = await prisma.users.upsert({
        where: { email: testEmail },
        update: { password_hash: hashedPassword, is_active: true },
        create: {
            first_name: "Perf",
            last_name: "Tester",
            email: testEmail,
            password_hash: hashedPassword,
            role_id: role.id,
            is_active: true
        }
    });

    const token = jwt.sign(
        { userId: user.id, id: user.id, email: user.email, role: role.role_name },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    const workspace = await prisma.workspaces.create({
        data: {
            name: "Perf Load Workspace",
            description: "Dedicated workspace for load testing",
            owner_id: user.id,
            workspace_members: {
                create: {
                    user_id: user.id,
                    workspace_role: "Owner"
                }
            }
        }
    });

    const project = await prisma.projects.create({
        data: {
            workspace_id: workspace.id,
            title: "Perf Load Project",
            description: "Dedicated project for load testing",
            manager_id: user.id,
            project_members: {
                create: {
                    user_id: user.id,
                    role_id: role.id
                }
            }
        }
    });

    // Seed 10 tasks for realistic queries
    for (let i = 1; i <= 10; i++) {
        await prisma.tasks.create({
            data: {
                project_id: project.id,
                created_by: user.id,
                assigned_to: user.id,
                title: `Load Test Task ${i}`,
                status: i % 2 === 0 ? "In Progress" : "Completed",
                priority: "Medium",
                start_date: new Date(),
                due_date: new Date(Date.now() + 86400000 * i)
            }
        });
    }

    // Seed 5 notifications
    for (let i = 1; i <= 5; i++) {
        await prisma.notifications.create({
            data: {
                user_id: user.id,
                type: "assignment",
                message: `Load notification ${i}`,
                is_read: false
            }
        });
    }

    console.log("[FIXTURES] Test entities ready:", {
        userId: user.id,
        workspaceId: workspace.id,
        projectId: project.id
    });

    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    // -------------------------------------------------------------
    // PART 1: API LOAD BENCHMARK (10, 25, 50 concurrency)
    // -------------------------------------------------------------
    console.log("\n>>> PART 1: API CONCURRENCY BENCHMARKS");

    const concurrencyLevels = [10, 25, 50];
    const totalRequestsPerLevel = { 10: 100, 25: 250, 50: 500 };

    const endpoints = [
        {
            name: "GET /api/workspaces",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/workspaces`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/workspaces/:id/projects",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/workspaces/${workspace.id}/projects`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/search?q=Task",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/search?q=Task`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/projects/:id/tasks",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/projects/${project.id}/tasks?page=1&limit=20`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/notifications",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/notifications?page=1&limit=20`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/calendar",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/calendar`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "GET /api/reports/dashboard",
            fn: async () => {
                const res = await fetch(`${BASE_URL}/api/reports/dashboard?projectId=${project.id}`, { headers });
                return res.status === 200;
            }
        },
        {
            name: "POST /api/auth/login",
            fn: async (idx) => {
                const res = await fetch(`${BASE_URL}/api/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-forwarded-for": `10.10.${Math.floor(idx / 250)}.${(idx % 250) + 1}`
                    },
                    body: JSON.stringify({ email: testEmail, password })
                });
                return res.status === 200;
            }
        }
    ];

    const apiResults = [];

    for (const ep of endpoints) {
        console.log(`\nBenchmarking ${ep.name}...`);
        for (const c of concurrencyLevels) {
            const numReqs = totalRequestsPerLevel[c];
            const memBefore = process.memoryUsage();
            const cpuBefore = process.cpuUsage();

            const result = await runConcurrentBatch(ep.fn, numReqs, c);

            const cpuDiff = process.cpuUsage(cpuBefore);
            const memAfter = process.memoryUsage();

            const item = {
                endpoint: ep.name,
                concurrency: c,
                totalRequests: numReqs,
                rps: result.rps,
                medianMs: result.p50,
                p95Ms: result.p95,
                p99Ms: result.p99,
                errorRate: `${result.errorRate}%`,
                heapUsedMb: (memAfter.heapUsed / (1024 * 1024)).toFixed(2),
                rssMb: (memAfter.rss / (1024 * 1024)).toFixed(2)
            };
            apiResults.push(item);
            console.log(
                `  Concurrency ${c}: ${result.rps} req/s | Median: ${result.p50}ms | p95: ${result.p95}ms | p99: ${result.p99}ms | Errors: ${result.errors}`
            );
        }
    }

    // -------------------------------------------------------------
    // PART 2: SOCKET.IO LOAD & BROADCAST BENCHMARK
    // -------------------------------------------------------------
    console.log("\n>>> PART 2: SOCKET.IO LOAD & CONCURRENCY BENCHMARKS");

    const socketResults = {};

    for (const c of [10, 25, 50]) {
        console.log(`\nConnecting ${c} concurrent socket clients...`);
        const memStart = process.memoryUsage();
        const connectT0 = process.hrtime.bigint();

        const clients = [];
        const connectPromises = [];

        for (let i = 0; i < c; i++) {
            const client = Client(BASE_URL, {
                auth: { token },
                transports: ["websocket"],
                forceNew: true
            });
            clients.push(client);
            connectPromises.push(new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("Timeout")), 5000);
                client.on("connect", () => {
                    clearTimeout(timer);
                    resolve();
                });
                client.on("connect_error", (err) => {
                    clearTimeout(timer);
                    reject(err);
                });
            }));
        }

        await Promise.all(connectPromises);
        const connectT1 = process.hrtime.bigint();
        const connectTotalMs = Number(connectT1 - connectT0) / 1_000_000;
        const avgConnectMs = connectTotalMs / c;

        // Test room joins
        const roomJoinT0 = process.hrtime.bigint();
        for (const client of clients) {
            client.emit("join:project", project.id);
        }
        await new Promise((r) => setTimeout(r, 100));
        const roomJoinT1 = process.hrtime.bigint();
        const roomJoinMs = Number(roomJoinT1 - roomJoinT0) / 1_000_000;

        // Test broadcast delivery across all connected clients
        const broadcastT0 = process.hrtime.bigint();
        let receivedCount = 0;
        const allReceived = new Promise((resolve) => {
            clients.forEach((client) => {
                client.once("taskflow:event", () => {
                    receivedCount++;
                    if (receivedCount === c) resolve();
                });
            });
        });

        // Trigger broadcast from server
        io.to(`project:${project.id}`).emit("taskflow:event", {
            type: "task.updated",
            projectId: project.id,
            timestamp: new Date().toISOString()
        });

        await Promise.race([
            allReceived,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Broadcast timeout")), 3000))
        ]);

        const broadcastT1 = process.hrtime.bigint();
        const broadcastDeliveryMs = Number(broadcastT1 - broadcastT0) / 1_000_000;
        const memActive = process.memoryUsage();

        // Disconnect clients
        for (const client of clients) {
            client.disconnect();
        }
        await new Promise((r) => setTimeout(r, 50));
        const memClean = process.memoryUsage();

        socketResults[`concurrency_${c}`] = {
            connections: c,
            connectTotalMs: Number(connectTotalMs.toFixed(2)),
            avgConnectMs: Number(avgConnectMs.toFixed(2)),
            roomJoinMs: Number(roomJoinMs.toFixed(2)),
            broadcastDeliveryMs: Number(broadcastDeliveryMs.toFixed(2)),
            receptionRate: `${(receivedCount / c) * 100}%`,
            heapGrowthMb: Number(((memActive.heapUsed - memStart.heapUsed) / (1024 * 1024)).toFixed(2)),
            heapAfterCleanupMb: Number(((memClean.heapUsed - memStart.heapUsed) / (1024 * 1024)).toFixed(2))
        };

        console.log(
            `  ${c} sockets: Total connect ${connectTotalMs.toFixed(2)}ms (${avgConnectMs.toFixed(2)}ms/conn) | Broadcast to all: ${broadcastDeliveryMs.toFixed(2)}ms | Memory growth: ${socketResults[`concurrency_${c}`].heapGrowthMb} MB`
        );
    }

    // -------------------------------------------------------------
    // PART 3: MULTI-TAB & RECONNECTION TEST
    // -------------------------------------------------------------
    console.log("\n>>> PART 3: MULTI-TAB CONNECTION OVERHEAD (5 tabs per user)");
    const multiTabClients = [];
    const multiTabT0 = process.hrtime.bigint();
    for (let tab = 1; tab <= 5; tab++) {
        const client = Client(BASE_URL, {
            auth: { token },
            transports: ["websocket"],
            forceNew: true
        });
        multiTabClients.push(client);
    }
    await Promise.all(multiTabClients.map((c) => new Promise((res) => c.on("connect", res))));
    const multiTabT1 = process.hrtime.bigint();
    console.log(`  5 tabs connected in ${Number(multiTabT1 - multiTabT0) / 1_000_000} ms`);
    multiTabClients.forEach((c) => c.disconnect());

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log("\n[CLEANUP] Removing test fixtures...");
    await prisma.notifications.deleteMany({ where: { user_id: user.id } });
    await prisma.tasks.deleteMany({ where: { project_id: project.id } });
    await prisma.project_members.deleteMany({ where: { project_id: project.id } });
    await prisma.projects.delete({ where: { id: project.id } });
    await prisma.workspace_members.deleteMany({ where: { workspace_id: workspace.id } });
    await prisma.workspaces.delete({ where: { id: workspace.id } });
    await prisma.users.delete({ where: { id: user.id } });

    io.close();
    server.close();
    await prisma.$disconnect();

    console.log("\n============================================================");
    console.log("FINAL BENCHMARK DATA (JSON Output for Report)");
    console.log("============================================================");
    console.log(JSON.stringify({ apiResults, socketResults }, null, 2));
}

runLoadTests().catch((err) => {
    console.error("FATAL in load tests:", err);
    process.exit(1);
});
