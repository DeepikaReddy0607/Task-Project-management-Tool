import "dotenv/config";
import prisma from "../config/prisma.js";

async function main() {
    console.log("================================================================================");
    console.log("PHASE 22G: APPLYING PG_TRGM GIN INDEXES FOR GLOBAL SEARCH");
    console.log("================================================================================");

    // 1. Ensure pg_trgm extension
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    console.log("✓ Verified pg_trgm extension.");

    // 2. Index on projects (title)
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_projects_title_trgm 
        ON taskflow.projects USING gin (title gin_trgm_ops);
    `);
    console.log("✓ Created idx_projects_title_trgm on projects(title)");

    // 3. Index on workspaces (name)
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_workspaces_name_trgm 
        ON taskflow.workspaces USING gin (name gin_trgm_ops);
    `);
    console.log("✓ Created idx_workspaces_name_trgm on workspaces(name)");

    // 4. Index on decisions (decision)
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_decisions_decision_trgm 
        ON taskflow.decisions USING gin (decision gin_trgm_ops);
    `);
    console.log("✓ Created idx_decisions_decision_trgm on decisions(decision)");

    // 5. Index on risks (title)
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_risks_title_trgm 
        ON taskflow.risks USING gin (title gin_trgm_ops);
    `);
    console.log("✓ Created idx_risks_title_trgm on risks(title)");

    // 6. Index on activity_logs (description)
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_desc_trgm 
        ON taskflow.activity_logs USING gin (description gin_trgm_ops);
    `);
    console.log("✓ Created idx_activity_logs_desc_trgm on activity_logs(description)");

    // 7. Re-analyze statistics
    console.log("Running ANALYZE on indexed tables...");
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.tasks;`);
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.projects;`);
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.workspaces;`);
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.decisions;`);
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.risks;`);
    await prisma.$executeRawUnsafe(`ANALYZE taskflow.activity_logs;`);
    console.log("✓ ANALYZE complete.");

    process.exit(0);
}

main().catch(err => {
    console.error("Index creation failed:", err);
    process.exit(1);
});
