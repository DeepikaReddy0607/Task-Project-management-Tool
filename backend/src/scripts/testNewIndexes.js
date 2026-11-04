import "dotenv/config";
import prisma from "../config/prisma.js";

async function explainQueries() {
    console.log("================================================================================");
    console.log("MEASURING QUERY PLANS AFTER NEW INDEXES");
    console.log("================================================================================");

    const project = await prisma.projects.findFirst();
    const user = await prisma.users.findFirst({
        where: { email: { endsWith: "@synthetic.taskflow.local" } }
    });

    // Query 1: Workspace members with order by joined_at
    const plan1 = await prisma.$queryRawUnsafe(`
        EXPLAIN ANALYZE 
        SELECT * FROM taskflow.workspace_members 
        WHERE user_id = '${user.id}'::uuid 
        ORDER BY joined_at DESC
    `);
    console.log("\nPlan 1: workspace_members by user_id ORDER BY joined_at DESC:");
    plan1.forEach(p => console.log("  ", p["QUERY PLAN"]));

    // Query 2: Tasks priority grouping
    const plan2 = await prisma.$queryRawUnsafe(`
        EXPLAIN ANALYZE 
        SELECT priority, count(*)::int as count 
        FROM taskflow.tasks 
        WHERE project_id = '${project.id}'::uuid AND is_archived = false 
        GROUP BY priority
    `);
    console.log("\nPlan 2: tasks priority grouping by project_id:");
    plan2.forEach(p => console.log("  ", p["QUERY PLAN"]));

    await prisma.$disconnect();
}

explainQueries().catch(err => {
    console.error("Explain error:", err);
    process.exit(1);
});
