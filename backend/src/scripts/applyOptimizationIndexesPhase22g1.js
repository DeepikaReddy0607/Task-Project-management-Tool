import "dotenv/config";
import prisma from "../config/prisma.js";

async function applyIndexes() {
    console.log("Applying performance optimization indexes for Phase 22G.1...");

    // 1. Workspace members composite index for user listing
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_workspace_members_user_joined 
        ON taskflow.workspace_members (user_id, joined_at DESC)
    `);
    console.log("  ✔ Created idx_workspace_members_user_joined");

    // 2. Tasks composite index for project active priority grouping
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_tasks_project_active_priority 
        ON taskflow.tasks (project_id, is_archived, priority)
    `);
    console.log("  ✔ Created idx_tasks_project_active_priority");

    // 3. Tasks composite index for project active due date filtering
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_tasks_project_active_due 
        ON taskflow.tasks (project_id, is_archived, due_date)
    `);
    console.log("  ✔ Created idx_tasks_project_active_due");

    // 4. Update table statistics
    console.log("Analyzing tables...");
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.workspace_members;`);
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.tasks;`);
    console.log("  ✔ Analyzed workspace_members and tasks");

    await prisma.$disconnect();
    console.log("All optimization indexes successfully applied.");
}

applyIndexes().catch(err => {
    console.error("Index application error:", err);
    process.exit(1);
});
