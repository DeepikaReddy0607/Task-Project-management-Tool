import prisma from "../config/prisma.js";
import { getCalendarEvents } from "../services/calendarService.js";
import { createTask } from "../services/taskService.js";

async function run() {
    const user = await prisma.users.findFirst({
        where: { is_active: true }
    });
    console.log("User:", user?.id, user?.email);

    // Find a workspace and project where user is member, or add membership
    let membership = await prisma.project_members.findFirst({
        where: { user_id: user.id },
        include: { projects: true }
    });
    let project = membership?.projects;

    if (!project) {
        project = await prisma.projects.findFirst({ where: { is_archived: false } });
        // Add member
        await prisma.project_members.create({
            data: { project_id: project.id, user_id: user.id, role: "Team Member" }
        }).catch(() => {});
    }
    console.log("Project:", project.id, project.title);

    // 1. Create a task with due date of November 10, 2026
    const task = await createTask(
        project.id,
        user.id,
        "Calendar Bug Test Task Nov 10",
        "Testing calendar due date synchronization",
        "Medium",
        "To Do",
        null, // startDate
        "2026-11-10", // dueDate
        2,
        user.id
    );

    console.log("\n--- CREATED TASK ---");
    console.log("Task ID:", task.id);
    console.log("Task start_date:", task.start_date);
    console.log("Task due_date:", task.due_date);
    console.log("Task due_date toISOString:", task.due_date?.toISOString());
    console.log("Task assigned_to:", task.assigned_to);

    // 2. Fetch calendar events without bounds (like frontend currently does)
    const allEvents = await getCalendarEvents(user.id);
    const myEvent = allEvents.find(e => e.sourceId === task.id);
    console.log("\n--- UNBOUNDED CALENDAR QUERY ---");
    console.log("Found event:", myEvent);

    // 3. Fetch calendar events with November 2026 bounds
    // What does a standard client send? e.g. 2026-11-01 to 2026-11-30
    const novEvents = await getCalendarEvents(user.id, {
        startDate: "2026-11-01",
        endDate: "2026-11-30"
    });
    const myNovEvent = novEvents.find(e => e.sourceId === task.id);
    console.log("\n--- BOUNDED CALENDAR QUERY (2026-11-01 to 2026-11-30) ---");
    console.log("Found event with date-only bounds:", myNovEvent);

    // 4. Test Frontend Mapping in Calendar.jsx
    console.log("\n--- FRONTEND CALENDAR.JSX SIMULATION ---");
    const normalizeEventDate = (date) => {
        if (!date) return null;
        if (typeof date === "string") return date.slice(0, 10);
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const toDateKey = (date) => {
        if (!date) return "";
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    // When serialized over HTTP (JSON):
    const jsonEvent = JSON.parse(JSON.stringify(myEvent));
    console.log("jsonEvent.date:", jsonEvent.date);
    const normalizedDate = normalizeEventDate(jsonEvent.date);
    console.log("normalizedDate:", normalizedDate);

    // Calendar view for Nov 2026
    const viewDate = new Date(2026, 10, 1); // Month 10 is November
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - leadingDays);

    const calendarDays = Array.from({ length: 42 }, (_, index) => {
        const d = new Date(start);
        d.setDate(start.getDate() + index);
        return d;
    });

    const dayKeys = calendarDays.map(d => toDateKey(d));
    const nov10Cell = dayKeys.find(k => k === "2026-11-10");
    console.log("Is 2026-11-10 present in calendar grid cells?", !!nov10Cell);

    // Filter for visible month:
    const eventDate = new Date(`${normalizedDate}T00:00:00`);
    const inVisibleMonth = (
        eventDate.getFullYear() === viewDate.getFullYear() &&
        eventDate.getMonth() === viewDate.getMonth()
    );
    console.log("Is event in eventsInVisibleMonth?", inVisibleMonth);

    // Clean up test task
    await prisma.tasks.delete({ where: { id: task.id } });
    await prisma.$disconnect();
}

run().catch(console.error);
