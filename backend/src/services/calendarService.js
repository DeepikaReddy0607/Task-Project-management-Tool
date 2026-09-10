import prisma from "../config/prisma.js";

/*
 * Get calendar events for the logged-in user.
 *
 * Includes:
 *  - Tasks assigned to the user
 *  - Projects where the user is a member
 *  - Subtasks belonging to the user's assigned tasks
 *
 * Only records with relevant dates are returned.
 */

export const getCalendarEvents = async (userId) => {
    // Get tasks assigned to the current user
    const tasks = await prisma.tasks.findMany({
        where: {
            assigned_to: userId,
            is_archived: false,
        },
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
    });

    // Get projects where the user is a member
    const projectMemberships = await prisma.project_members.findMany({
        where: {
            user_id: userId,
            projects: {
                is_archived: false,
            },
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
    });

    const events = [];

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

    // -----------------------------------------
    // SORT EVENTS BY DATE
    // -----------------------------------------

    events.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
    });

    return events;
};