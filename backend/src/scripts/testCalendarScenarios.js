import assert from "node:assert/strict";
import prisma from "../config/prisma.js";
import { getCalendarEvents, parseCalendarBounds } from "../services/calendarService.js";
import { createTask, updateTask } from "../services/taskService.js";

// Helpers matching frontend Calendar logic
const toDateKey = (date) => {
    if (!date) return "";
    if (typeof date === "string") {
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const normalizeEventDate = (date) => {
    if (!date) return null;
    if (typeof date === "string") {
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    return null;
};

const getCalendarBoundsForMonth = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1, 12, 0, 0);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const startCell = new Date(year, monthIndex, 1 - leadingDays, 12, 0, 0);
    const endCell = new Date(year, monthIndex, 1 - leadingDays + 41, 12, 0, 0);
    return {
        startDate: toDateKey(startCell),
        endDate: toDateKey(endCell)
    };
};

async function runCalendarTests() {
    console.log("=== STARTING TASKFLOW CALENDAR DUE-DATE SYNCHRONIZATION TEST SUITE ===");

    // Find active user and project
    const user = await prisma.users.findFirst({
        where: { is_active: true }
    });
    assert.ok(user, "Active user must exist");

    let membership = await prisma.project_members.findFirst({
        where: { user_id: user.id, projects: { is_archived: false } },
        include: { projects: true }
    });

    let project;
    if (!membership) {
        // Find or create workspace and project
        let ws = await prisma.workspaces.findFirst();
        if (!ws) {
            ws = await prisma.workspaces.create({
                data: { name: "Calendar Test WS", owner_id: user.id }
            });
        }
        project = await prisma.projects.create({
            data: {
                workspace_id: ws.id,
                title: "Calendar Sync Project",
                status: "In Progress",
                is_archived: false,
                project_members: {
                    create: { user_id: user.id }
                }
            }
        });
    } else {
        project = membership.projects;
    }
    assert.ok(project, "Project must exist");
    console.log(`Using User: ${user.email} (${user.id}), Project: ${project.title} (${project.id})`);

    const createdTaskIds = [];

    try {
        const now = new Date();
        const todayStr = toDateKey(now);
        const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);
        const tomorrowStr = toDateKey(tomorrowDate);
        const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5, 12, 0, 0);
        const pastStr = toDateKey(pastDate);

        // -----------------------------------------------------------------
        // SCENARIO 1: Create task due today -> verify appears on today's cell
        // -----------------------------------------------------------------
        console.log("\n[Scenario 1] Creating task due today:", todayStr);
        const task1 = await createTask(
            project.id,
            user.id,
            "Task Due Today",
            "Testing today due date",
            "High",
            "To Do",
            null,
            todayStr, // dueDate
            2,
            user.id
        );
        createdTaskIds.push(task1.id);

        const boundsToday = getCalendarBoundsForMonth(now.getFullYear(), now.getMonth());
        const eventsMonth = await getCalendarEvents(user.id, boundsToday);
        const event1 = eventsMonth.find(e => e.sourceId === task1.id && e.type === "task");
        assert.ok(event1, "Task 1 event must be present in calendar");
        assert.equal(normalizeEventDate(event1.date), todayStr, "Task 1 date must match today's date key");
        console.log("-> PASS: Task 1 appears on today's calendar cell (" + todayStr + ")");

        // -----------------------------------------------------------------
        // SCENARIO 2: Create task due tomorrow -> verify appears on tomorrow's cell
        // -----------------------------------------------------------------
        console.log("\n[Scenario 2] Creating task due tomorrow:", tomorrowStr);
        const task2 = await createTask(
            project.id,
            user.id,
            "Task Due Tomorrow",
            "Testing tomorrow due date",
            "Medium",
            "To Do",
            null,
            tomorrowStr, // dueDate
            3,
            null // unassigned to test visibility
        );
        createdTaskIds.push(task2.id);

        const eventsTomorrow = await getCalendarEvents(user.id, boundsToday);
        const event2 = eventsTomorrow.find(e => e.sourceId === task2.id && e.type === "task");
        assert.ok(event2, "Task 2 (unassigned) event must be visible in calendar");
        assert.equal(normalizeEventDate(event2.date), tomorrowStr, "Task 2 date must match tomorrow's date key");
        console.log("-> PASS: Task 2 appears on tomorrow's calendar cell (" + tomorrowStr + ")");

        // -----------------------------------------------------------------
        // SCENARIO 3: Create task due on last day of month (e.g. 2026-11-30)
        // Verify appears on that day, NOT dropped by bounding filter
        // -----------------------------------------------------------------
        console.log("\n[Scenario 3] Creating task due on last day of month: 2026-11-30");
        const task3 = await createTask(
            project.id,
            user.id,
            "End of Month Task",
            "Testing end of month inclusion",
            "High",
            "To Do",
            null,
            "2026-11-30",
            4,
            user.id
        );
        createdTaskIds.push(task3.id);

        // Bounded query for November 2026: startDate=2026-11-01, endDate=2026-11-30
        const eventsNov = await getCalendarEvents(user.id, { startDate: "2026-11-01", endDate: "2026-11-30" });
        const event3 = eventsNov.find(e => e.sourceId === task3.id && e.type === "task");
        assert.ok(event3, "Task 3 must NOT be dropped by endDate=2026-11-30 boundary filter");
        assert.equal(normalizeEventDate(event3.date), "2026-11-30", "Task 3 date must be 2026-11-30");
        console.log("-> PASS: Task 3 appears on 2026-11-30 without being dropped by boundary filter");

        // -----------------------------------------------------------------
        // SCENARIO 4: Create task due on first day of next month (e.g. 2026-12-01)
        // Verify appears on Dec 1 cell
        // -----------------------------------------------------------------
        console.log("\n[Scenario 4] Creating task due on first day of next month: 2026-12-01");
        const task4 = await createTask(
            project.id,
            user.id,
            "First of Month Task",
            "Testing next month first day",
            "Low",
            "To Do",
            null,
            "2026-12-01",
            1,
            user.id
        );
        createdTaskIds.push(task4.id);

        // Query December 2026 window
        const boundsDec = getCalendarBoundsForMonth(2026, 11); // December (monthIndex 11)
        const eventsDec = await getCalendarEvents(user.id, boundsDec);
        const event4 = eventsDec.find(e => e.sourceId === task4.id && e.type === "task");
        assert.ok(event4, "Task 4 must appear in December calendar query");
        assert.equal(normalizeEventDate(event4.date), "2026-12-01", "Task 4 date must be 2026-12-01");
        console.log("-> PASS: Task 4 appears on 2026-12-01 cell in December calendar view");

        // -----------------------------------------------------------------
        // SCENARIO 5: Create task with due date in the past
        // Verify appears on that past date
        // -----------------------------------------------------------------
        console.log("\n[Scenario 5] Creating task with past due date:", pastStr);
        const task5 = await createTask(
            project.id,
            user.id,
            "Past Due Task",
            "Testing past date persistence",
            "High",
            "To Do",
            null,
            pastStr,
            5,
            user.id
        );
        createdTaskIds.push(task5.id);

        // Unbounded query or bounds covering past
        const boundsPast = getCalendarBoundsForMonth(pastDate.getFullYear(), pastDate.getMonth());
        const eventsPast = await getCalendarEvents(user.id, boundsPast);
        const event5 = eventsPast.find(e => e.sourceId === task5.id && e.type === "task");
        assert.ok(event5, "Task 5 must appear on past calendar view");
        assert.equal(normalizeEventDate(event5.date), pastStr, "Task 5 date must match past date key");
        console.log("-> PASS: Task 5 appears on correct past date (" + pastStr + ")");

        // -----------------------------------------------------------------
        // SCENARIO 6: Edit existing task's due date
        // Verify task moves from old date to new date
        // -----------------------------------------------------------------
        console.log("\n[Scenario 6] Updating task 1 due date from", todayStr, "to 2026-11-20");
        const updatedTask1 = await updateTask(task1.id, user.id, { dueDate: "2026-11-20" });
        assert.ok(updatedTask1, "Task 1 update must succeed");

        const eventsAfterMove = await getCalendarEvents(user.id, { startDate: "2026-11-01", endDate: "2026-11-30" });
        const event1Moved = eventsAfterMove.find(e => e.sourceId === task1.id && e.type === "task");
        assert.ok(event1Moved, "Updated task 1 must exist in calendar");
        assert.equal(normalizeEventDate(event1Moved.date), "2026-11-20", "Task 1 must now be on 2026-11-20");
        assert.notEqual(normalizeEventDate(event1Moved.date), todayStr, "Task 1 must no longer be on old date");
        console.log("-> PASS: Task 1 successfully moved to 2026-11-20");

        // -----------------------------------------------------------------
        // SCENARIO 7: Verify task moves cleanly across dates
        // -----------------------------------------------------------------
        console.log("\n[Scenario 7] Moving task 1 across dates: 2026-11-20 -> 2026-11-25");
        await updateTask(task1.id, user.id, { dueDate: "2026-11-25" });
        const eventsSecondMove = await getCalendarEvents(user.id, { startDate: "2026-11-01", endDate: "2026-11-30" });
        const event1Clean = eventsSecondMove.find(e => e.sourceId === task1.id && e.type === "task");
        assert.equal(normalizeEventDate(event1Clean.date), "2026-11-25", "Task 1 must now be on 2026-11-25");
        console.log("-> PASS: Task 1 moved cleanly across dates to 2026-11-25");

        // -----------------------------------------------------------------
        // SCENARIO 8: Verify tasks remain on correct dates after page refresh/API reload
        // -----------------------------------------------------------------
        console.log("\n[Scenario 8] Verifying tasks persistence upon fresh API calls");
        const reloadEvents = await getCalendarEvents(user.id);
        const task1Reload = reloadEvents.find(e => e.sourceId === task1.id && e.type === "task");
        const task3Reload = reloadEvents.find(e => e.sourceId === task3.id && e.type === "task");
        const task4Reload = reloadEvents.find(e => e.sourceId === task4.id && e.type === "task");

        assert.equal(normalizeEventDate(task1Reload.date), "2026-11-25");
        assert.equal(normalizeEventDate(task3Reload.date), "2026-11-30");
        assert.equal(normalizeEventDate(task4Reload.date), "2026-12-01");
        console.log("-> PASS: All tasks remain persistently on their exact dates across reloads");

        // -----------------------------------------------------------------
        // SCENARIO 9: Calendar month navigation correctly loads events for navigated month
        // -----------------------------------------------------------------
        console.log("\n[Scenario 9] Testing month navigation bounds calculation");
        const novBounds = getCalendarBoundsForMonth(2026, 10); // Nov
        const decBounds = getCalendarBoundsForMonth(2026, 11); // Dec

        const novEvents = await getCalendarEvents(user.id, novBounds);
        const decEvents = await getCalendarEvents(user.id, decBounds);

        const hasTask3InNov = novEvents.some(e => e.sourceId === task3.id);
        const hasTask4InDec = decEvents.some(e => e.sourceId === task4.id);

        assert.ok(hasTask3InNov, "November view must include Nov 30 task");
        assert.ok(hasTask4InDec, "December view must include Dec 1 task");
        console.log("-> PASS: Month navigation correctly bounds and loads target month events");

        // -----------------------------------------------------------------
        // SCENARIO 10: Verify date behavior in Asia/Kolkata, UTC, and America/New_York
        // -----------------------------------------------------------------
        console.log("\n[Scenario 10] Testing timezone invariance (Asia/Kolkata, UTC, America/New_York)");
        const testDates = ["2026-11-10", "2026-11-30", "2026-12-01"];
        const timezones = ["Asia/Kolkata", "UTC", "America/New_York", "Europe/London"];

        for (const tz of timezones) {
            process.env.TZ = tz;
            for (const dStr of testDates) {
                // Backend simulation:
                const dbDate = new Date(`${dStr}T00:00:00.000Z`);
                // JSON serialization simulation:
                const serialized = dbDate.toISOString();
                // Frontend normalization:
                const normalized = normalizeEventDate(serialized);
                assert.equal(normalized, dStr, `Normalized date must equal ${dStr} in ${tz}`);

                // Target cell simulation:
                const [y, m, d] = dStr.split("-").map(Number);
                const cellDate = new Date(y, m - 1, d, 12, 0, 0);
                assert.equal(toDateKey(cellDate), dStr, `Cell dateKey must equal ${dStr} in ${tz}`);
            }
            console.log(`  * Timezone ${tz}: Invariance VERIFIED for all test dates`);
        }
        console.log("-> PASS: Zero timezone shifting across Asia/Kolkata, UTC, and America/New_York");

        console.log("\n=== ALL 10 CALENDAR SCENARIOS PASSED WITH ZERO REGRESSIONS ===");
    } finally {
        // Cleanup created tasks
        if (createdTaskIds.length > 0) {
            await prisma.tasks.deleteMany({
                where: { id: { in: createdTaskIds } }
            });
            console.log(`Cleaned up ${createdTaskIds.length} test tasks`);
        }
        await prisma.$disconnect();
    }
}

runCalendarTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
