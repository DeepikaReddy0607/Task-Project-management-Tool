import prisma from '../config/prisma.js';

async function main() {
  console.log("Applying scale indexes for Phase 22F.1...");

  // 1. Task retrieval by project (eliminates in-memory sort on created_at and filter on is_archived)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_active_created 
    ON taskflow.tasks (project_id, is_archived, created_at DESC);
  `);
  console.log("✓ Created idx_tasks_project_active_created");

  // 2. Task retrieval by assignee (calendar, my tasks)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_active_due 
    ON taskflow.tasks (assigned_to, is_archived, due_date ASC);
  `);
  console.log("✓ Created idx_tasks_assigned_active_due");

  // 3. User notifications pagination (eliminates sort on created_at)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
    ON taskflow.notifications (user_id, created_at DESC);
  `);
  console.log("✓ Created idx_notifications_user_created");

  // 4. Projects by workspace
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_projects_workspace_active 
    ON taskflow.projects (workspace_id, is_archived, created_at DESC);
  `);
  console.log("✓ Created idx_projects_workspace_active");

  // 5. Check if pg_trgm can be enabled for fast ILIKE search
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm 
      ON taskflow.tasks USING gin (title gin_trgm_ops);
    `);
    console.log("✓ Created idx_tasks_title_trgm (pg_trgm extension)");
  } catch (err) {
    console.log("pg_trgm not enabled (or insufficient privileges):", err.message);
  }

  // 6. Update table statistics
  console.log("Updating PostgreSQL query planner statistics (ANALYZE)...");
  await prisma.$executeRawUnsafe(`ANALYZE taskflow.tasks;`);
  await prisma.$executeRawUnsafe(`ANALYZE taskflow.notifications;`);
  await prisma.$executeRawUnsafe(`ANALYZE taskflow.projects;`);
  await prisma.$executeRawUnsafe(`ANALYZE taskflow.users;`);
  console.log("✓ Table statistics updated.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed to apply indexes:", err);
  process.exit(1);
});
