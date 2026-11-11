import "dotenv/config";
import prisma from "../config/prisma.js";

async function main() {
    console.log("Applying schema migrations...");

    // 1. Add is_archived to workspaces
    await prisma.$executeRawUnsafe(`
        ALTER TABLE taskflow.workspaces 
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log("Added is_archived to taskflow.workspaces");

    // 2. Add is_archived to subtasks
    await prisma.$executeRawUnsafe(`
        ALTER TABLE taskflow.subtasks 
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log("Added is_archived to taskflow.subtasks");

    // 3. Add last_seen_at to users
    await prisma.$executeRawUnsafe(`
        ALTER TABLE taskflow.users 
        ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
    `);
    console.log("Added last_seen_at to taskflow.users");

    // Create index on workspaces(is_archived) and subtasks(is_archived) for fast filtering
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_workspaces_archived ON taskflow.workspaces(is_archived);
        CREATE INDEX IF NOT EXISTS idx_subtasks_archived ON taskflow.subtasks(is_archived);
    `);
    console.log("Created indexes on is_archived columns");

    console.log("Schema migration completed successfully.");
    process.exit(0);
}

main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
