import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";
const PORT = 5600;
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

async function run() {
    console.log("================================================================================");
    console.log("DIAGNOSING 500 CONCURRENT USERS IN CLUSTER MODE");
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
                body = JSON.stringify({ title: `Diag U${user.index} T${step}`, priority: "Medium", status: "Backlog" });
            } else if (action === 4) {
                url = `${BASE_URL}/api/reports/dashboard?projectId=${user.projectId}`;
            } else if (action === 5) {
                url = `${BASE_URL}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`;
            } else if (action === 6) {
                url = `${BASE_URL}/api/notifications?page=1&limit=20`;
            } else if (action === 7) {
                url = `${BASE_URL}/api/search?query=Task&type=all`;
            }

            try {
                const res = await fetch(url, {
                    method,
                    headers: user.headers,
                    body,
                    signal: AbortSignal.timeout(10000)
                });
                if (res.ok) {
                    success++;
                    await res.text().catch(() => {});
                } else {
                    const statusKey = `HTTP_${res.status}`;
                    errorCounts[statusKey] = (errorCounts[statusKey] || 0) + 1;
                    const errBody = await res.text().catch(() => "");
                    if (!errorCounts[`${statusKey}_sample`]) {
                        errorCounts[`${statusKey}_sample`] = errBody.slice(0, 100);
                    }
                }
            } catch (err) {
                const causeCode = err.cause?.code || err.code || err.name;
                errorCounts[causeCode] = (errorCounts[causeCode] || 0) + 1;
            }

            await new Promise((r) => setTimeout(r, 40));
        }
    }

    console.log("Running 500 concurrent users for 5s...");
    await Promise.all(sessions.map((_, i) => runUser(i)));

    console.log("\n--- DIAGNOSTIC RESULTS ---");
    console.log(`Total Requests: ${total}`);
    console.log(`Successful Requests: ${success} (${((success / total) * 100).toFixed(1)}%)`);
    console.log(`Failed Requests: ${total - success} (${(((total - success) / total) * 100).toFixed(1)}%)`);
    console.log("Error Breakdown:", JSON.stringify(errorCounts, null, 2));

    clusterProc.kill();
    await prisma.$disconnect();
}

run().catch((err) => {
    console.error("Diagnostic crash:", err);
    process.exit(1);
});
