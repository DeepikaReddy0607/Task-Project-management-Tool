import "dotenv/config";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../app.js";
import prisma from "../config/prisma.js";

const PORT = 5555;
const BASE_URL = `http://127.0.0.1:${PORT}`;
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

async function benchmarkQuery(name, url, headers, iterations = 20) {
    const latencies = [];
    let errors = 0;
    let sampleResultsCount = 0;

    for (let i = 0; i < iterations; i++) {
        const t0 = process.hrtime.bigint();
        try {
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
            const t1 = process.hrtime.bigint();
            const ms = Number(t1 - t0) / 1_000_000;
            latencies.push(ms);
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (i === 0) {
                    sampleResultsCount = data?.data?.counts?.total ?? data?.counts?.total ?? data?.flatResults?.length ?? 0;
                }
            } else if (name.includes("Unauthorized") || name.includes("Invalid")) {
                // Expected status code for security/invalid checks
                if (i === 0) sampleResultsCount = 0;
            } else {
                errors++;
            }
        } catch (err) {
            errors++;
        }
    }

    const stats = calculatePercentiles(latencies);
    const rps = Number((iterations / (latencies.reduce((a, b) => a + b, 0) / 1000)).toFixed(2));
    const errorRate = Number(((errors / iterations) * 100).toFixed(2));

    console.log(
        `  ${name.padEnd(38)} | p50: ${String(stats.p50).padStart(6)}ms | p95: ${String(stats.p95).padStart(6)}ms | p99: ${String(stats.p99).padStart(6)}ms | RPS: ${String(rps).padStart(6)} | Match: ${sampleResultsCount} | Err: ${errors}/${iterations}`
    );

    return { name, ...stats, rps, errorRate, sampleResultsCount };
}

export async function runSearchBenchmarkSuite(label = "Search Benchmark") {
    console.log(`\n================================================================================`);
    console.log(`GLOBAL SEARCH PERFORMANCE SUITE: ${label}`);
    console.log(`Dataset: 100k Tasks, 520 Workspaces, 1,019 Projects`);
    console.log(`================================================================================`);

    // 1. Get an active synthetic team member who belongs to a project with tasks
    const topProjGroup = await prisma.tasks.groupBy({
        by: ['project_id'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1
    });
    const targetProjectId = topProjGroup[0]?.project_id;
    const projMember = await prisma.project_members.findFirst({
        where: { project_id: targetProjectId },
        include: { users: true, projects: true }
    });

    const memberUser = projMember.users;
    const memberWsId = projMember.projects.workspace_id;

    // Inaccessible workspace for unauthorized check
    const otherWs = await prisma.workspaces.findFirst({
        where: { id: { not: memberWsId } },
        select: { id: true }
    });

    const memberToken = jwt.sign(
        { userId: memberUser.id, email: memberUser.email, role: "Team Member" },
        JWT_SECRET,
        { expiresIn: "2h" }
    );
    const memberHeaders = { Authorization: `Bearer ${memberToken}` };

    // 2. Get an Admin user
    const adminUser = await prisma.users.findFirst({
        where: { roles: { role_name: "Admin" } }
    });
    const adminToken = jwt.sign(
        { userId: adminUser.id, email: adminUser.email, role: "Admin" },
        JWT_SECRET,
        { expiresIn: "2h" }
    );
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    console.log(`\n--- Part 1: Team Member Scoped Search (${memberUser.email}) ---`);
    const memberResults = [];

    // 1. Common Query: "Task"
    memberResults.push(await benchmarkQuery(
        "1. Member: Common ('Task', type=all)",
        `${BASE_URL}/api/search?query=Task&type=all`,
        memberHeaders
    ));

    // 2. Rare Query: "Authentication"
    memberResults.push(await benchmarkQuery(
        "2. Member: Rare ('Authentication')",
        `${BASE_URL}/api/search?query=Authentication&type=all`,
        memberHeaders
    ));

    // 3. Partial Match: "Auth"
    memberResults.push(await benchmarkQuery(
        "3. Member: Partial ('Auth')",
        `${BASE_URL}/api/search?query=Auth&type=all`,
        memberHeaders
    ));

    // 4. Empty Query: ""
    memberResults.push(await benchmarkQuery(
        "4. Member: Empty (type=all)",
        `${BASE_URL}/api/search?query=&type=all`,
        memberHeaders
    ));

    // 5. Invalid Query: invalid pagination & parameters
    memberResults.push(await benchmarkQuery(
        "5. Member: Invalid (page=-5, limit=999)",
        `${BASE_URL}/api/search?query=Task&page=-5&pageSize=999`,
        memberHeaders
    ));

    // 6. Workspace-scoped search
    memberResults.push(await benchmarkQuery(
        "6. Member: Workspace-Scoped ('Task')",
        `${BASE_URL}/api/search?query=Task&workspaceId=${memberWsId}&type=all`,
        memberHeaders
    ));

    // 7. Project-scoped search
    memberResults.push(await benchmarkQuery(
        "7. Member: Project-Scoped ('Task')",
        `${BASE_URL}/api/search?query=Task&projectId=${targetProjectId}&type=all`,
        memberHeaders
    ));

    // 8. Unauthorized Workspace search (IDOR defense)
    memberResults.push(await benchmarkQuery(
        "8. Member: Unauthorized WS (IDOR guard)",
        `${BASE_URL}/api/search?query=Task&workspaceId=${otherWs.id}&type=all`,
        memberHeaders
    ));

    console.log(`\n--- Part 2: System Admin Global Search (${adminUser.email}) ---`);
    const adminResults = [];

    // 9. Admin Common Global Search
    adminResults.push(await benchmarkQuery(
        "9. Admin: Global Common ('Task')",
        `${BASE_URL}/api/search?query=Task&type=all`,
        adminHeaders
    ));

    // 10. Admin Projects Search
    adminResults.push(await benchmarkQuery(
        "10. Admin: Projects ('Project')",
        `${BASE_URL}/api/search?query=Project&type=projects`,
        adminHeaders
    ));

    // 11. Admin Workspaces Search
    adminResults.push(await benchmarkQuery(
        "11. Admin: Workspaces ('Workspace')",
        `${BASE_URL}/api/search?query=Workspace&type=workspaces`,
        adminHeaders
    ));

    // 12. Admin Rare Search
    adminResults.push(await benchmarkQuery(
        "12. Admin: Rare Query ('Authentication')",
        `${BASE_URL}/api/search?query=Authentication&type=all`,
        adminHeaders
    ));

    return { memberResults, adminResults };
}

async function main() {
    const server = http.createServer(app);
    await new Promise(r => server.listen(PORT, r));
    console.log(`Benchmark test server running on port ${PORT}`);

    try {
        const results = await runSearchBenchmarkSuite("BASELINE (Current State)");
        console.log("\nBenchmark complete.");
    } finally {
        server.close();
        process.exit(0);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
