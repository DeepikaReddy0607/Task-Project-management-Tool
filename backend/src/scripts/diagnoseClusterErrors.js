import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const CLUSTER_PORT = 5360;
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_change_in_production";

async function waitForAllWorkers(port, maxWaitMs = 15000) {
    const start = Date.now();
    console.log("Waiting for cluster to be fully ready...");
    // Give all 3 workers time to boot and initialize DB pools
    await new Promise((r) => setTimeout(r, 3000));
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
                headers: { Authorization: "Bearer test" }
            });
            if (res.status === 401 || res.status === 200) {
                console.log("Cluster is responsive!");
                return true;
            }
        } catch {}
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Server on port ${port} not ready`);
}

async function main() {
    console.log("================================================================================");
    console.log("DIAGNOSING CLUSTER WITH UNDICI POOLED AGENT (250 Concurrent Users)");
    console.log("================================================================================");

    const rawUsers = await prisma.users.findMany({
        where: { email: { endsWith: "@synthetic.taskflow.local" } },
        take: 250,
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

    const backendDir = path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend");
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

    await waitForAllWorkers(CLUSTER_PORT);
    console.log("Cluster server listening on port", CLUSTER_PORT);

    const errorsByType = {};
    const statusCodes = {};
    const errorTimes = { earlySec: 0, midSec: 0, lateSec: 0 };
    let total = 0;
    let failed = 0;
    const testStart = Date.now();
    const testDuration = 8000;
    const stopTime = testStart + testDuration;

    async function runUser(idx) {
        const user = userSessions[idx % userSessions.length];
        const headers = user.headers;
        const pId = user.projectId;
        const staggerMs = Math.floor((idx / 250) * 1500);
        await new Promise((r) => setTimeout(r, staggerMs));

        let step = 0;
        while (Date.now() < stopTime) {
            step++;
            total++;
            const action = step % 6;
            let url = `http://127.0.0.1:${CLUSTER_PORT}/api/workspaces`;
            if (action === 1) url = `http://127.0.0.1:${CLUSTER_PORT}/api/projects/${pId}/tasks?page=1&limit=20`;
            else if (action === 2) url = `http://127.0.0.1:${CLUSTER_PORT}/api/reports/dashboard?projectId=${pId}`;
            else if (action === 3) url = `http://127.0.0.1:${CLUSTER_PORT}/api/calendar?startDate=2026-01-01&endDate=2026-12-31`;
            else if (action === 4) url = `http://127.0.0.1:${CLUSTER_PORT}/api/notifications?page=1&limit=20`;
            else if (action === 5) url = `http://127.0.0.1:${CLUSTER_PORT}/api/search?query=Task&type=all`;

            try {
                const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
                statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;
                if (!res.ok) {
                    failed++;
                    const body = await res.text().catch(() => "");
                    const key = `${res.status}: ${body.slice(0, 100)}`;
                    errorsByType[key] = (errorsByType[key] || 0) + 1;
                }
            } catch (err) {
                failed++;
                const elapsedSec = (Date.now() - testStart) / 1000;
                if (elapsedSec < 2) errorTimes.earlySec++;
                else if (elapsedSec < 6) errorTimes.midSec++;
                else errorTimes.lateSec++;
                const causeMsg = err.cause ? `${err.cause.code || err.cause.name || ''} - ${err.cause.message || ''}` : '';
                const key = `FETCH_ERR: ${err.name} - ${err.message} [Cause: ${causeMsg}]`;
                errorsByType[key] = (errorsByType[key] || 0) + 1;
            }

            await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 25)));
        }
    }

    const workers = Array.from({ length: 250 }, (_, i) => runUser(i));
    await Promise.all(workers);

    // Wait a brief moment before killing so in-flight requests finish cleanly
    await new Promise((r) => setTimeout(r, 500));
    clusterProc.kill();

    console.log("\n================================================================================");
    console.log("CLUSTER RESULTS WITH POOLED AGENT:");
    console.log(`  - Total Requests: ${total}`);
    console.log(`  - Failed Requests: ${failed} (${((failed / total) * 100).toFixed(2)}%)`);
    console.log("  - Status Codes:", JSON.stringify(statusCodes, null, 2));
    console.log("  - Error Timing Distribution:", JSON.stringify(errorTimes, null, 2));
    console.log("  - Error Breakdown:", JSON.stringify(errorsByType, null, 2));
    console.log("================================================================================");
}

main().catch(console.error);
