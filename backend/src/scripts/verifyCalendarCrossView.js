import prisma from "../config/prisma.js";
import { getCalendarEvents } from "../services/calendarService.js";
import { getProjectTasks } from "../services/taskService.js";

async function verifyCrossView() {
    const user = await prisma.users.findFirst({ where: { is_active: true } });
    const project = await prisma.projects.findFirst({ where: { is_archived: false } });
    console.log("User:", user.email, "Project:", project.title);

    // Create a verification task
    const testTask = await prisma.tasks.create({
        data: {
            project_id: project.id,
            title: "Cross-View Date Consistency Verification Task",
            due_date: new Date("2026-11-10T00:00:00.000Z"),
            status: "In Progress",
            priority: "High",
            created_by: user.id,
            assigned_to: user.id
        }
    });

    try {
        // 1. Fetch via getCalendarEvents
        const calEvents = await getCalendarEvents(user.id, { startDate: "2026-11-01", endDate: "2026-11-30" });
        const calTask = calEvents.find(e => e.sourceId === testTask.id && e.type === "task");

        // 2. Fetch via getProjectTasks
        const projTasks = await getProjectTasks(project.id, user.id, { page: 1, limit: 100 });
        const pTask = (projTasks.tasks || projTasks).find(t => t.id === testTask.id);

        const calIso = calTask.date instanceof Date ? calTask.date.toISOString().slice(0, 10) : String(calTask.date).slice(0, 10);
        const pIso = pTask.due_date instanceof Date ? pTask.due_date.toISOString().slice(0, 10) : String(pTask.due_date).slice(0, 10);

        console.log("Calendar Task Date:", calIso);
        console.log("Project Task due_date:", pIso);

        if (calIso === "2026-11-10" && pIso === "2026-11-10") {
            console.log("CROSS-VIEW VERIFICATION SUCCESSFUL: Both yield 2026-11-10");
        } else {
            throw new Error(`MISMATCH: calIso=${calIso}, pIso=${pIso}`);
        }
    } finally {
        await prisma.tasks.delete({ where: { id: testTask.id } });
        await prisma.$disconnect();
    }
}
verifyCrossView();
