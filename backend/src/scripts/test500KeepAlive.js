import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import http from "node:http";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";
const PORT = 5700;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 1000,
    keepAliveMsecs: 30000
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
            agent,
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
                    json: async () => JSON.parse(data)
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

async function run() {
    console.log("================================================================================");
    console.log("TESTING 500 USERS IN CLUSTER MODE WITH PERSISTENT KEEPALIVE AGENT");
    console.log("================================================================================");

    const backendDir = path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend");

    const clusterProc = spawn("node", ["src/server.js"], {
        cwd: backendDir,
        env: {
            ...process.env,
            PORT: String(PORT),
            CLUSTER_MODE: "true",
            CLUSTER_WORKERS: "3",
            DB_POOL_SIZE: "24",
            DB_CONNECTION_TIMEOUT: "20000",
            UV_THREADPOOL_SIZE: "64"
        },
        stdio: "inherit"
    });

    await waitForServer(PORT);
    console.log(`Cluster server ready on port ${PORT}`);

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

    const fallbackWs = await prisma.workspaces.findFirst();
    const fallbackPrj = await prisma.projects.findFirst();

    const sessions = rawUsers.map((u, idx) => {
        const wsId = u.workspace_members[0]?.workspace_id || fallbackWs.id;
        const pId = u.project_members[0]?.project_id || fallbackPrj.id;
        const token = jwt.sign({ userId: u.id, email: u.email, role: "Team Member" }, JWT_SECRET, { expiresIn: "1h" });
        return {
            index: idx,
            userId: u.id,
            email: u.email,
            workspaceId: wsId,
            projectId: pId,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        };
    });

    console.log(`Initialized ${sessions.length} sessions.`);

    const errorCounts = {};
    let total = 0;
    let success = 0;
    const latencies = [];
    const stopTime = Date.now() + 5000;

    async function runUser(idx) {
        const user = sessions[idx];
        const staggerMs = Math.floor((idx / 500) * 1500);
        await new Promise((r) => setTimeout(r, staggerMs));

        let step = 0;
        while (Date.now() < stopTime) {
            step++;
            total++;
            const action = step % 8;
            let url = `${BASE_URL}/api/workspaces`;
            let method = "GET";
            let body = null;

            if (action === 1) {
                url = `${BASE_URL}/api/projects/${user.projectId}/tasks?page=1&limit=20`;
            } else if (action === 2) {
                url = `${BASE_URL}/api/projects/${user.projectId}/tasks`;
                method = "POST";
                body = JSON.stringify({ title: `KeepAlive U${user.index} T${step}`, priority: "Medium", status: "Backlog" });
            } else if (action === 4) {
                url = `${BASE_URL}/api/reports/dashboard?projectId=${user.projectId}`;
            } else if (action === 5) {
                url = `${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`;
            } else if (action === 6) {
                url = `${BASE_URL}/api/notifications?page=1&limit=20`;
            } else if (action === 7) {
                url = `${BASE_URL}/api/search?query=Task&type=all`;
            }

            const t0 = performance.now();
            try {
                const res = await httpRequest(url, {
                    method,
                    headers: user.headers,
                    body
                });
                const t1 = performance.now();
                latencies.push(t1 - t0);
                if (res.ok) {
                    success++;
                } else {
                    const statusKey = `HTTP_${res.status}`;
                    errorCounts[statusKey] = (errorCounts[statusKey] || 0) + 1;
                }
            } catch (err) {
                const causeCode = err.code || err.message;
                errorCounts[causeCode] = (errorCounts[causeCode] || 0) + 1;
            }

            await new Promise((r) => setTimeout(r, 40));
        }
    }

    console.log("Running 500 concurrent users for 5s with KeepAlive Agent...");
    await Promise.all(sessions.map((_, i) => runUser(i)));

    sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.50)] || 0;
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

    console.log("\n--- KEEPALIVE RESULTS ---");
    console.log(`Total Requests: ${total}`);
    console.log(`Successful Requests: ${success} (${((success / total) * 100).toFixed(1)}%)`);
    console.log(`Failed Requests: ${total - success} (${(((total - success) / total) * 100).toFixed(1)}%)`);
    console.log(`Latency: p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms`);
    console.log("Error Breakdown:", JSON.stringify(errorCounts, null, 2));

    clusterProc.kill();
    await prisma.$disconnect();
}

let sortedLatencies = [];
run().catch((err) => {
    console.error("KeepAlive test crash:", err);
    process.exit(1);
});
