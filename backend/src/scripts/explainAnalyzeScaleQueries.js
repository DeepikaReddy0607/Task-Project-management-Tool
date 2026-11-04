import prisma from '../config/prisma.js';

async function runExplain() {
  console.log("============================================================");
  console.log("PHASE 22F.1: EXPLAIN ANALYZE QUERY PLAN BENCHMARK");
  console.log("============================================================");

  // Pick a project and user with data
  const sampleProject = await prisma.projects.findFirst({ select: { id: true } });
  const sampleUser = await prisma.users.findFirst({ select: { id: true } });

  console.log(`Using sample project: ${sampleProject?.id}`);
  console.log(`Using sample user: ${sampleUser?.id}\n`);

  // 1. Task retrieval by project with pagination
  console.log("--- 1. Query: Project Tasks (100,000 task table) ---");
  const plan1 = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, title, status, priority, due_date, created_at
    FROM taskflow.tasks
    WHERE project_id = '${sampleProject.id}' AND is_archived = false
    ORDER BY created_at DESC
    LIMIT 20 OFFSET 0;
  `);
  console.log(plan1.map(row => row['QUERY PLAN']).join('\n'));

  // 2. Notification retrieval for user with pagination
  console.log("\n--- 2. Query: User Notifications (50,000 notification table) ---");
  const plan2 = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, type, title, message, is_read, created_at
    FROM taskflow.notifications
    WHERE user_id = '${sampleUser.id}'
    ORDER BY created_at DESC
    LIMIT 20 OFFSET 0;
  `);
  console.log(plan2.map(row => row['QUERY PLAN']).join('\n'));

  // 3. Task retrieval by assignee for Calendar
  console.log("\n--- 3. Query: Assigned Tasks for Calendar ---");
  const plan3 = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, title, start_date, due_date, status, priority
    FROM taskflow.tasks
    WHERE assigned_to = '${sampleUser.id}' AND is_archived = false
    ORDER BY due_date ASC
    LIMIT 50;
  `);
  console.log(plan3.map(row => row['QUERY PLAN']).join('\n'));

  // 4. Unified Search on Tasks with Trigram Index
  console.log("\n--- 4. Query: Global Search on Tasks (Trigram ILIKE) ---");
  const plan4 = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, title, status, priority, created_at
    FROM taskflow.tasks
    WHERE title ILIKE '%Task%' OR description ILIKE '%Task%'
    ORDER BY created_at DESC
    LIMIT 25;
  `);
  console.log(plan4.map(row => row['QUERY PLAN']).join('\n'));

  // 5. Dashboard Aggregation groupBy
  console.log("\n--- 5. Query: Dashboard Status Aggregation (100k tasks) ---");
  const plan5 = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT status, count(*) AS count
    FROM taskflow.tasks
    WHERE is_archived = false
    GROUP BY status;
  `);
  console.log(plan5.map(row => row['QUERY PLAN']).join('\n'));

  await prisma.$disconnect();
}

runExplain().catch((err) => {
  console.error("EXPLAIN ANALYZE failed:", err);
  process.exit(1);
});
