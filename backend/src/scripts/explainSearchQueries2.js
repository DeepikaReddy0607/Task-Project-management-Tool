import "dotenv/config";
import prisma from "../config/prisma.js";

async function explain(title, sql) {
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
    // 1. Task search by title + description with ORDER BY created_at DESC (exact query pattern of searchService)
    await explain(
        "Tasks ILIKE (title OR desc) ORDER BY created_at DESC LIMIT 25 (Common 'Task')",
        `SELECT id, title, description, project_id, status, created_at 
         FROM taskflow.tasks 
         WHERE (title ILIKE '%Task%' OR description ILIKE '%Task%') 
         ORDER BY created_at DESC 
         LIMIT 25;`
    );

    // 2. Rare keyword (e.g. 'Authentication')
    await explain(
        "Tasks ILIKE (title OR desc) ORDER BY created_at DESC LIMIT 25 (Rare 'Authentication')",
        `SELECT id, title, description, project_id, status, created_at 
         FROM taskflow.tasks 
         WHERE (title ILIKE '%Authentication%' OR description ILIKE '%Authentication%') 
         ORDER BY created_at DESC 
         LIMIT 25;`
    );

    // 3. Multi-project scope IN (list of 50 project IDs) - typical for normal user
    const projects = await prisma.projects.findMany({ take: 50, select: { id: true } });
    const pIds = projects.map(p => `'${p.id}'`).join(',');
    await explain(
        "Tasks scoped to 50 projects with ILIKE and ORDER BY created_at DESC",
        `SELECT id, title, description, project_id, status, created_at 
         FROM taskflow.tasks 
         WHERE project_id IN (${pIds}) 
           AND (title ILIKE '%Task%' OR description ILIKE '%Task%') 
         ORDER BY created_at DESC 
         LIMIT 25;`
    );

    process.exit(0);
}

main().catch(console.error);
