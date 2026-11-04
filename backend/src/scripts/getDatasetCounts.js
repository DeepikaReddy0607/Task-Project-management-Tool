import "dotenv/config";
import prisma from "../config/prisma.js";

async function countData() {
    const totalUsers = await prisma.users.count();
    const synthUsers = await prisma.users.count({ where: { email: { endsWith: "@synthetic.taskflow.local" } } });
    const totalWorkspaces = await prisma.workspaces.count();
    const synthWorkspaces = await prisma.workspaces.count({ where: { name: { startsWith: "Synthetic WS" } } });
    const totalProjects = await prisma.projects.count();
    const synthProjects = await prisma.projects.count({ where: { title: { startsWith: "Synthetic Project" } } });
    const totalTasks = await prisma.tasks.count();
    const synthTasks = await prisma.tasks.count({ where: { title: { startsWith: "Synthetic Task" } } });
    const totalNotifs = await prisma.notifications.count();

    const summary = {
        users: { total: totalUsers, synthetic: synthUsers, genuine: totalUsers - synthUsers },
        workspaces: { total: totalWorkspaces, synthetic: synthWorkspaces, genuine: totalWorkspaces - synthWorkspaces },
        projects: { total: totalProjects, synthetic: synthProjects, genuine: totalProjects - synthProjects },
        tasks: { total: totalTasks, synthetic: synthTasks, genuine: totalTasks - synthTasks },
        notifications: { total: totalNotifs }
    };

    console.log("Dataset Inventory:", JSON.stringify(summary, null, 2));
    await prisma.$disconnect();
}

countData();
