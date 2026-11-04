import prisma from "../config/prisma.js";

async function seedData() {
    console.log("============================================================");
    console.log("TASKFLOW PHASE 22F.1: SYNTHETIC DATASET GENERATOR");
    console.log("============================================================");

    // Check existing synthetic count
    const existingUsers = await prisma.users.count({
        where: { email: { endsWith: "@synthetic.taskflow.local" } }
    });
    console.log(`[INFO] Current synthetic users in DB: ${existingUsers}`);

    let role = await prisma.roles.findFirst({ where: { role_name: "Team Member" } });
    if (!role) role = await prisma.roles.findFirst();

    const NUM_USERS = 1000;
    const NUM_WORKSPACES = 500;
    const NUM_PROJECTS = 1000;
    const NUM_TASKS = 100000;
    const NUM_NOTIFICATIONS = 50000;

    if (existingUsers < NUM_USERS) {
        console.log(`[SEED] Seeding ${NUM_USERS} synthetic users...`);
        const usersToCreate = [];
        const dummyHash = "$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6x8ekEY58yhyE9o.Sg.q"; // pre-hashed "Password123!"

        for (let i = existingUsers + 1; i <= NUM_USERS; i++) {
            usersToCreate.push({
                first_name: `SyntheticUser${i}`,
                last_name: "ScaleTest",
                email: `user${i}@synthetic.taskflow.local`,
                password_hash: dummyHash,
                role_id: role.id,
                is_active: true
            });
        }
        await prisma.users.createMany({ data: usersToCreate, skipDuplicates: true });
        console.log(`[SEED] Finished seeding users.`);
    }

    // Retrieve synthetic user IDs
    const syntheticUsers = await prisma.users.findMany({
        where: { email: { endsWith: "@synthetic.taskflow.local" } },
        select: { id: true },
        take: NUM_USERS
    });
    const userIds = syntheticUsers.map(u => u.id);
    console.log(`[INFO] Loaded ${userIds.length} synthetic user IDs.`);

    // 2. Workspaces
    const existingWorkspaces = await prisma.workspaces.count({
        where: { name: { startsWith: "Synthetic WS" } }
    });
    console.log(`[INFO] Current synthetic workspaces: ${existingWorkspaces}`);

    if (existingWorkspaces < NUM_WORKSPACES) {
        console.log(`[SEED] Seeding ${NUM_WORKSPACES} workspaces...`);
        const wsToCreate = [];
        for (let i = existingWorkspaces + 1; i <= NUM_WORKSPACES; i++) {
            const ownerId = userIds[i % userIds.length];
            wsToCreate.push({
                name: `Synthetic WS ${i}`,
                description: `High-scale test workspace ${i}`,
                owner_id: ownerId
            });
        }
        await prisma.workspaces.createMany({ data: wsToCreate, skipDuplicates: true });
        console.log(`[SEED] Finished seeding workspaces.`);
    }

    const syntheticWorkspaces = await prisma.workspaces.findMany({
        where: { name: { startsWith: "Synthetic WS" } },
        select: { id: true, owner_id: true },
        take: NUM_WORKSPACES
    });
    const wsIds = syntheticWorkspaces.map(w => w.id);
    console.log(`[INFO] Loaded ${wsIds.length} synthetic workspace IDs.`);

    // 3. Workspace Memberships (ensure owners + random members exist)
    const existingMemberships = await prisma.workspace_members.count({
        where: { workspace_id: { in: wsIds } }
    });
    if (existingMemberships < NUM_WORKSPACES) {
        console.log(`[SEED] Ensuring workspace memberships for owners...`);
        const membersToCreate = [];
        for (const ws of syntheticWorkspaces) {
            membersToCreate.push({
                workspace_id: ws.id,
                user_id: ws.owner_id,
                workspace_role: "Owner"
            });
        }
        await prisma.workspace_members.createMany({ data: membersToCreate, skipDuplicates: true });
    }

    // 4. Projects
    const existingProjects = await prisma.projects.count({
        where: { title: { startsWith: "Synthetic Proj" } }
    });
    console.log(`[INFO] Current synthetic projects: ${existingProjects}`);

    if (existingProjects < NUM_PROJECTS) {
        console.log(`[SEED] Seeding ${NUM_PROJECTS} projects...`);
        const projToCreate = [];
        for (let i = existingProjects + 1; i <= NUM_PROJECTS; i++) {
            const wsId = wsIds[i % wsIds.length];
            const managerId = userIds[i % userIds.length];
            projToCreate.push({
                workspace_id: wsId,
                title: `Synthetic Proj ${i}`,
                description: `Project description for scale testing ${i}`,
                manager_id: managerId,
                status: i % 3 === 0 ? "Completed" : (i % 3 === 1 ? "Active" : "Planning"),
                priority: i % 3 === 0 ? "High" : "Medium",
                start_date: new Date(),
                end_date: new Date(Date.now() + 30 * 86400000)
            });
        }
        await prisma.projects.createMany({ data: projToCreate, skipDuplicates: true });
        console.log(`[SEED] Finished seeding projects.`);
    }

    const syntheticProjects = await prisma.projects.findMany({
        where: { title: { startsWith: "Synthetic Proj" } },
        select: { id: true, workspace_id: true, manager_id: true },
        take: NUM_PROJECTS
    });
    const projectIds = syntheticProjects.map(p => p.id);
    console.log(`[INFO] Loaded ${projectIds.length} synthetic project IDs.`);

    // 5. Tasks (target 100,000 tasks)
    const existingTasks = await prisma.tasks.count({
        where: { title: { startsWith: "Synthetic Task" } }
    });
    console.log(`[INFO] Current synthetic tasks: ${existingTasks}`);

    if (existingTasks < NUM_TASKS) {
        const remainingTasks = NUM_TASKS - existingTasks;
        console.log(`[SEED] Seeding ${remainingTasks} tasks in chunks of 10,000...`);
        const CHUNK_SIZE = 10000;
        const statuses = ["Backlog", "To Do", "In Progress", "Review", "Completed"];
        const priorities = ["Low", "Medium", "High"];

        let taskCounter = existingTasks;
        while (taskCounter < NUM_TASKS) {
            const batch = [];
            const thisBatchSize = Math.min(CHUNK_SIZE, NUM_TASKS - taskCounter);
            for (let i = 0; i < thisBatchSize; i++) {
                taskCounter++;
                const proj = syntheticProjects[taskCounter % syntheticProjects.length];
                const assigneeId = userIds[taskCounter % userIds.length];
                const status = statuses[taskCounter % statuses.length];
                const priority = priorities[taskCounter % priorities.length];
                const startDate = new Date(Date.now() - 30 * 86400000);
                const dueDate = new Date(startDate.getTime() + (1 + (taskCounter % 60)) * 86400000);

                batch.push({
                    project_id: proj.id,
                    title: `Synthetic Task ${taskCounter}: High scale workload performance verification`,
                    description: `Detailed description for task ${taskCounter} evaluating text search and filtering`,
                    status,
                    priority,
                    assigned_to: assigneeId,
                    created_by: proj.manager_id,
                    start_date: startDate,
                    due_date: dueDate
                });
            }
            await prisma.tasks.createMany({ data: batch });
            console.log(`  -> Inserted batch up to task ${taskCounter}/${NUM_TASKS}`);
        }
        console.log(`[SEED] Finished seeding 100,000 tasks.`);
    }

    // 6. Notifications (target 50,000 notifications)
    const existingNotifs = await prisma.notifications.count({
        where: { message: { startsWith: "Synthetic notification" } }
    });
    console.log(`[INFO] Current synthetic notifications: ${existingNotifs}`);

    if (existingNotifs < NUM_NOTIFICATIONS) {
        const remainingNotifs = NUM_NOTIFICATIONS - existingNotifs;
        console.log(`[SEED] Seeding ${remainingNotifs} notifications in chunks of 10,000...`);
        const CHUNK_SIZE = 10000;
        const types = ["assignment", "due_date", "comment", "update"];

        let notifCounter = existingNotifs;
        while (notifCounter < NUM_NOTIFICATIONS) {
            const batch = [];
            const thisBatchSize = Math.min(CHUNK_SIZE, NUM_NOTIFICATIONS - notifCounter);
            for (let i = 0; i < thisBatchSize; i++) {
                notifCounter++;
                const uId = userIds[notifCounter % userIds.length];
                const type = types[notifCounter % types.length];
                batch.push({
                    user_id: uId,
                    type,
                    message: `Synthetic notification ${notifCounter} for scale testing`,
                    is_read: notifCounter % 3 === 0,
                    created_at: new Date(Date.now() - (notifCounter % 30) * 86400000)
                });
            }
            await prisma.notifications.createMany({ data: batch });
            console.log(`  -> Inserted batch up to notification ${notifCounter}/${NUM_NOTIFICATIONS}`);
        }
        console.log(`[SEED] Finished seeding 50,000 notifications.`);
    }

    console.log("\n============================================================");
    console.log("FINAL SYNTHETIC DATASET STATS IN DATABASE:");
    console.log("============================================================");
    const totalUsers = await prisma.users.count();
    const totalWorkspaces = await prisma.workspaces.count();
    const totalProjects = await prisma.projects.count();
    const totalTasks = await prisma.tasks.count();
    const totalNotifications = await prisma.notifications.count();

    console.log({
        totalUsers,
        totalWorkspaces,
        totalProjects,
        totalTasks,
        totalNotifications
    });

    await prisma.$disconnect();
}

seedData().catch((err) => {
    console.error("FATAL in seeding synthetic data:", err);
    process.exit(1);
});
