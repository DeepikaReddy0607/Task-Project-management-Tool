import "dotenv/config";
import prisma from "../config/prisma.js";

async function explain(title, sql, params = []) {
    console.log(`\n================================================================================`);
    console.log(`EXPLAIN ANALYZE: ${title}`);
    console.log(`SQL: ${sql}`);
    console.log(`================================================================================`);
    try {
        const res = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
        for (const row of res) {
            console.log(row["QUERY PLAN"]);
        }
    } catch (err) {
        console.error("Error executing EXPLAIN:", err.message);
    }
}

async function main() {
    // 1. Task search by title
    await explain(
        "Tasks ILIKE '%Task%'",
        "SELECT id, title, project_id, status FROM taskflow.tasks WHERE title ILIKE '%Task%' LIMIT 25;"
    );

    // 2. Task search by rare keyword
    await explain(
        "Tasks ILIKE '%Synthetic%'",
        "SELECT id, title, project_id, status FROM taskflow.tasks WHERE title ILIKE '%Synthetic%' LIMIT 25;"
    );

    // 3. Task search with project scope
    const prj = await prisma.projects.findFirst({ select: { id: true } });
    if (prj) {
        await explain(
            `Tasks in Project ${prj.id} with ILIKE '%Task%'`,
            `SELECT id, title, project_id, status FROM taskflow.tasks WHERE project_id = '${prj.id}' AND title ILIKE '%Task%' LIMIT 25;`
        );
    }

    // 4. Projects search by title
    await explain(
        "Projects ILIKE '%Project%'",
        "SELECT id, title, workspace_id FROM taskflow.projects WHERE title ILIKE '%Project%' LIMIT 25;"
    );

    // 5. Workspaces search by name
    await explain(
        "Workspaces ILIKE '%Workspace%'",
        "SELECT id, name FROM taskflow.workspaces WHERE name ILIKE '%Workspace%' LIMIT 25;"
    );

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
