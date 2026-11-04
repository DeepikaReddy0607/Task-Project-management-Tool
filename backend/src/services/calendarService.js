import prisma from "../config/prisma.js";

/**
 * Validates and parses calendar date bounding query parameters.
 * Throws 400 Bad Request if format is invalid or if startDate > endDate.
 */
export const parseCalendarBounds = (startDate, endDate) => {
    let parsedStart = null;
    let parsedEnd = null;

    if (startDate !== undefined && startDate !== null && startDate !== "") {
        if (typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
            parsedStart = new Date(`${startDate.trim()}T00:00:00.000Z`);
        } else {
            parsedStart = new Date(startDate);
        }
        if (isNaN(parsedStart.getTime())) {
            const error = new Error("Invalid startDate format");
            error.statusCode = 400;
            throw error;
        }
    }

    if (endDate !== undefined && endDate !== null && endDate !== "") {
        if (typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
            parsedEnd = new Date(`${endDate.trim()}T23:59:59.999Z`);
        } else {
            parsedEnd = new Date(endDate);
        }
        if (isNaN(parsedEnd.getTime())) {
            const error = new Error("Invalid endDate format");
            error.statusCode = 400;
            throw error;
        }
    }

    if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
        const error = new Error("startDate cannot be after endDate");
        error.statusCode = 400;
        throw error;
    }

    return { parsedStart, parsedEnd };
};

/*
 * Get calendar events for the logged-in user.
 *
 * Includes:
 *  - Tasks assigned to user, created by user, or in user's projects
 *  - Projects where the user is a member
 *
 * Only records with relevant non-null dates are returned.
 * Supports optional date bounding via { startDate, endDate }.
 */
export const getCalendarEvents = async (userId, { startDate, endDate } = {}) => {
    const { parsedStart, parsedEnd } = parseCalendarBounds(startDate, endDate);

    // Get all projects where the user is an active member
    const userMemberships = await prisma.project_members.findMany({
        where: { user_id: userId },
        select: { project_id: true },
    });
    const userProjectIds = userMemberships.map((m) => m.project_id);

    // Build task access filter: tasks assigned to user, created by user, OR in user's projects
    const accessFilter = [
        { assigned_to: userId },
        { created_by: userId },
    ];
    if (userProjectIds.length > 0) {
        accessFilter.push({ project_id: { in: userProjectIds } });
    }

    // Filter tasks: must have non-null start_date or due_date
    const taskWhere = {
        is_archived: false,
        projects: {
            is_archived: false,
        },
        OR: accessFilter,
        AND: [
            {
                OR: [
                    { start_date: { not: null } },
                    { due_date: { not: null } },
                ],
            },
        ],
    };

    if (parsedStart || parsedEnd) {
        const boundsOr = [];
        if (parsedStart && parsedEnd) {
            boundsOr.push(
                { start_date: { gte: parsedStart, lte: parsedEnd } },
                { due_date: { gte: parsedStart, lte: parsedEnd } },
                {
                    AND: [
                        { start_date: { lte: parsedStart } },
                        { due_date: { gte: parsedEnd } },
                    ],
                }
            );
        } else if (parsedStart) {
            boundsOr.push(
                { start_date: { gte: parsedStart } },
                { due_date: { gte: parsedStart } }
            );
        } else if (parsedEnd) {
            boundsOr.push(
                { start_date: { lte: parsedEnd } },
                { due_date: { lte: parsedEnd } }
            );
        }
        taskWhere.AND.push({ OR: boundsOr });
    }

    // Build project where clause: must have non-null start_date or end_date
    const projectWhere = {
        is_archived: false,
        OR: [
            { start_date: { not: null } },
            { end_date: { not: null } },
        ],
    };

    if (parsedStart || parsedEnd) {
        const boundsOr = [];
        if (parsedStart && parsedEnd) {
            boundsOr.push(
                { start_date: { gte: parsedStart, lte: parsedEnd } },
                { end_date: { gte: parsedStart, lte: parsedEnd } },
                {
                    AND: [
                        { start_date: { lte: parsedStart } },
                        { end_date: { gte: parsedEnd } },
                    ],
                }
            );
        } else if (parsedStart) {
            boundsOr.push(
                { start_date: { gte: parsedStart } },
                { end_date: { gte: parsedStart } }
            );
        } else if (parsedEnd) {
            boundsOr.push(
                { start_date: { lte: parsedEnd } },
                { end_date: { lte: parsedEnd } }
            );
        }
        projectWhere.AND = [{ OR: boundsOr }];
    }

    // Get tasks and project memberships concurrently
    const [tasks, projectMemberships] = await Promise.all([
        prisma.tasks.findMany({
            where: taskWhere,
            select: {
                id: true,
                title: true,
                start_date: true,
                due_date: true,
                status: true,
                priority: true,
                project_id: true,
                projects: {
                    select: {
                        id: true,
                        title: true,
                        is_archived: true,
                    },
                },
            },
            orderBy: {
                due_date: "asc",
            },
        }),
        prisma.project_members.findMany({
            where: {
                user_id: userId,
                projects: projectWhere,
            },
            select: {
                projects: {
                    select: {
                        id: true,
                        title: true,
                        start_date: true,
                        end_date: true,
                        status: true,
                        priority: true,
                    },
                },
            },
        })
    ]);

    let events = [];

    // -----------------------------------------
    // TASK EVENTS
    // -----------------------------------------

    for (const task of tasks) {
        if (task.start_date) {
            events.push({
                id: `${task.id}-start`,
                sourceId: task.id,
                title: task.title,
                type: "task-start",
                date: task.start_date,
                status: task.status,
                priority: task.priority,
                projectId: task.project_id,
                projectTitle: task.projects?.title || "Unknown Project",
            });
        }

        if (task.due_date) {
            events.push({
                id: `${task.id}-deadline`,
                sourceId: task.id,
                title: task.title,
                type: "task",
                date: task.due_date,
                status: task.status,
                priority: task.priority,
                projectId: task.project_id,
                projectTitle: task.projects?.title || "Unknown Project",
            });
        }
    }

    // -----------------------------------------
    // PROJECT EVENTS
    // -----------------------------------------

    const addedProjects = new Set();

    for (const membership of projectMemberships) {
        const project = membership.projects;

        if (!project || addedProjects.has(project.id)) {
            continue;
        }

        addedProjects.add(project.id);

        if (project.start_date) {
            events.push({
                id: `${project.id}-start`,
                sourceId: project.id,
                title: project.title,
                type: "project-start",
                date: project.start_date,
                status: project.status,
                priority: project.priority,
                projectId: project.id,
                projectTitle: project.title,
            });
        }

        if (project.end_date) {
            events.push({
                id: `${project.id}-deadline`,
                sourceId: project.id,
                title: project.title,
                type: "project",
                date: project.end_date,
                status: project.status,
                priority: project.priority,
                projectId: project.id,
                projectTitle: project.title,
            });
        }
    }

    // Filter events to bounded range if bounds are specified
    if (parsedStart || parsedEnd) {
        events = events.filter((e) => {
            const time = new Date(e.date).getTime();
            if (parsedStart && time < parsedStart.getTime()) return false;
            if (parsedEnd && time > parsedEnd.getTime()) return false;
            return true;
        });
    }

    // -----------------------------------------
    // SORT EVENTS BY DATE
    // -----------------------------------------

    events.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
    });

    return events;
};