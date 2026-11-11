import prisma from "../config/prisma.js";
import { createNotification } from "./notificationService.js";
import sendEmail from "./emailService.js";
import { checkProjectAccess } from "./projectService.js";
import { createActivity } from "./activityService.js";

const VALID_TASK_PRIORITIES = [
    "Low",
    "Medium",
    "High"
];

const VALID_TASK_STATUSES = [
    "Backlog",
    "To Do",
    "In Progress",
    "Review",
    "Completed"
];

const projectWorkspaceCache = new Map();
const PROJECT_WORKSPACE_TTL_MS = 60 * 1000;

const getProjectWorkspaceId = async (projectId) => {
    const cached = projectWorkspaceCache.get(projectId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.workspaceId;
    }
    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { workspace_id: true }
    });
    if (!project) return null;
    if (projectWorkspaceCache.size >= 1000) {
        const oldestKey = projectWorkspaceCache.keys().next().value;
        projectWorkspaceCache.delete(oldestKey);
    }
    projectWorkspaceCache.set(projectId, {
        workspaceId: project.workspace_id,
        expiresAt: now + PROJECT_WORKSPACE_TTL_MS
    });
    return project.workspace_id;
};

const calculateSubtaskProgress = (subtasks) => {
    if (!subtasks || subtasks.length === 0) {
        return 0;
    }

    const activeSubtasks = subtasks.filter((s) => !s.is_archived);
    if (activeSubtasks.length === 0) {
        return 0;
    }

    const completedSubtasks = activeSubtasks.filter(
        (subtask) => subtask.status === "Done" || subtask.status === "Completed"
    ).length;

    return Math.round(
        (completedSubtasks / activeSubtasks.length) * 100
    );
};

const createTask = async (
    projectId,
    userId,
    title,
    description,
    priority,
    status,
    startDate,
    dueDate,
    estimatedHours,
    assignedTo,
    workspaceId = null
) => {

    // Check whether project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        throw new Error("Project not found");
    }

    // Validate workspace and project ID association
    if (workspaceId && project.workspace_id !== workspaceId) {
        const error = new Error("Project does not belong to the specified workspace");
        error.statusCode = 400;
        throw error;
    }

    // Verify creator has project access (Workspace Owner/Admin, Manager, or Project Member)
    await checkProjectAccess(project, userId);

    // If assigning task to someone, verify that user
    // is a member of the project or manager of the project
    if (assignedTo) {
        const isManager = project.manager_id === assignedTo;
        if (!isManager) {
            const assignedMember =
                await prisma.project_members.findUnique({
                    where: {
                        project_id_user_id: {
                            project_id: projectId,
                            user_id: assignedTo
                        }
                    }
                });

            if (!assignedMember) {
                const error = new Error(
                    "Assigned user is not a member of the project"
                );
                error.statusCode = 400;
                throw error;
            }
        }
    }

    // Validate task priority
    const resolvedPriority = priority || "Medium";
    if (!VALID_TASK_PRIORITIES.includes(resolvedPriority)) {
        const err = new Error("Invalid task priority");
        err.statusCode = 400;
        throw err;
    }

    // Validate task status
    if (status && !VALID_TASK_STATUSES.includes(status)) {
        const err = new Error("Invalid task status");
        err.statusCode = 400;
        throw err;
    }

    // Validate task dates
    if (startDate && dueDate) {
        const start = new Date(startDate);
        const due = new Date(dueDate);
        if (!isNaN(start.getTime()) && !isNaN(due.getTime()) && start > due) {
            const err = new Error("Task start date cannot be after due date");
            err.statusCode = 400;
            throw err;
        }
    }

    const task = await prisma.tasks.create({
        data: {
            project_id: projectId,
            title,
            description: description || null,
            priority: resolvedPriority,
            status: status || "Backlog",
            start_date: startDate
                ? new Date(startDate)
                : null,
            due_date: dueDate
                ? new Date(dueDate)
                : null,
            estimated_hours:
                estimatedHours !== undefined &&
                estimatedHours !== null
                    ? estimatedHours
                    : null,
            assigned_to: assignedTo ? assignedTo : null,
            created_by: userId
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return task;
};

const getProjectTasks = async (
    projectId,
    userId,
    { page, limit, archived, workspaceId } = {}
) => {

    // Check whether project exists and resolve workspace
    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { id: true, workspace_id: true, manager_id: true }
    });

    if (!project) {
        throw new Error("Project not found");
    }

    if (workspaceId && project.workspace_id !== workspaceId) {
        const error = new Error("Project does not belong to the specified workspace");
        error.statusCode = 400;
        throw error;
    }

    // Check project access (Workspace Owner/Admin, Manager, or Project Member)
    await checkProjectAccess(project, userId);

    const isPaginated = page !== undefined || limit !== undefined;
    let pageNum = 1;
    let limitNum = 20;

    if (isPaginated) {
        if (page !== undefined && page !== null && page !== "") {
            pageNum = parseInt(page, 10);
            if (isNaN(pageNum) || pageNum < 1) {
                const error = new Error("Invalid page parameter. Must be a positive integer.");
                error.statusCode = 400;
                throw error;
            }
        }
        if (limit !== undefined && limit !== null && limit !== "") {
            limitNum = parseInt(limit, 10);
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                const error = new Error("Invalid limit parameter. Must be between 1 and 100.");
                error.statusCode = 400;
                throw error;
            }
        }
    }

    const isArchived = archived === "true" || archived === true;
    const where = {
        project_id: projectId,
        is_archived: isArchived
    };

    const queryOptions = {
        where,
        orderBy: {
            created_at: "desc"
        },
        include: {
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            subtasks: true
        }
    };

    if (isPaginated) {
        queryOptions.skip = (pageNum - 1) * limitNum;
        queryOptions.take = limitNum;
    }

    const [tasks, total] = await Promise.all([
        prisma.tasks.findMany(queryOptions),
        prisma.tasks.count({ where })
    ]);

    tasks.forEach((task) => {
        task.progress = calculateSubtaskProgress(task.subtasks);
    task.subtask_progress = task.progress;
        task.subtask_progress = task.progress;
    });

    const pagination = isPaginated
        ? {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1
        }
        : {
            page: 1,
            limit: total || 1,
            total,
            totalPages: 1
        };

    tasks.pagination = pagination;
    tasks.tasks = tasks;

    return tasks;
};

const getTask = async (
    taskId,
    userId
) => {

    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            subtasks: true,
            comments: {
                orderBy: {
                    created_at: "desc"
                }
            }
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Check project access
    await checkProjectAccess(task.projects, userId);

    task.progress = calculateSubtaskProgress(task.subtasks);
    task.subtask_progress = task.progress;

    return task;
};

const updateTask = async (
    taskId,
    userId,
    data
) => {

    // Find task
    const existingTask = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    workspace_id: true
                }
            }
        }
    });

    if (!existingTask) {
        throw new Error("Task not found");
    }

    // Check project access
    await checkProjectAccess(existingTask.projects, userId);

    // Build update object
    const updateData = {};

    if (data.title !== undefined) {
        updateData.title = data.title.trim();
    }

    if (data.description !== undefined) {
        updateData.description =
            data.description || null;
    }

    if (data.priority !== undefined) {
        if (!VALID_TASK_PRIORITIES.includes(data.priority)) {
            const err = new Error("Invalid task priority");
            err.statusCode = 400;
            throw err;
        }
        updateData.priority = data.priority;
    }

    if (data.status !== undefined) {
        if (!VALID_TASK_STATUSES.includes(data.status)) {
            const err = new Error("Invalid task status");
            err.statusCode = 400;
            throw err;
        }
        updateData.status = data.status;
    }

    if (data.startDate !== undefined) {
        updateData.start_date =
            data.startDate
                ? new Date(data.startDate)
                : null;
    }

    if (data.dueDate !== undefined) {
        updateData.due_date =
            data.dueDate
                ? new Date(data.dueDate)
                : null;
    }

    const effectiveStartDate = updateData.start_date !== undefined ? updateData.start_date : existingTask.start_date;
    const effectiveDueDate = updateData.due_date !== undefined ? updateData.due_date : existingTask.due_date;
    if (effectiveStartDate && effectiveDueDate && effectiveStartDate > effectiveDueDate) {
        const err = new Error("Task start date cannot be after due date");
        err.statusCode = 400;
        throw err;
    }

    if (data.estimatedHours !== undefined) {
        updateData.estimated_hours =
            data.estimatedHours !== null
                ? data.estimatedHours
                : null;
    }

    if (data.assignedTo !== undefined || data.assigned_to !== undefined) {
        const candidateAssignee = data.assignedTo !== undefined ? data.assignedTo : data.assigned_to;
        if (candidateAssignee) {
            const user = await prisma.users.findUnique({
                where: { id: candidateAssignee }
            });
            if (!user) {
                const error = new Error("User not found");
                error.statusCode = 404;
                throw error;
            }
            const project = await prisma.projects.findUnique({
                where: { id: existingTask.project_id }
            });
            const isManager = project && project.manager_id === candidateAssignee;
            if (!isManager) {
                const projectMembership = await prisma.project_members.findUnique({
                    where: {
                        project_id_user_id: {
                            project_id: existingTask.project_id,
                            user_id: candidateAssignee
                        }
                    }
                });
                if (!projectMembership) {
                    const error = new Error("Assigned user is not a member of the project");
                    error.statusCode = 400;
                    throw error;
                }
            }
            updateData.assigned_to = candidateAssignee;
        } else {
            updateData.assigned_to = null;
        }
    }

    updateData.updated_at = new Date();

    const updatedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: updateData,
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    if (data.assignedTo && data.assignedTo !== existingTask.assigned_to) {
        try {
            await createNotification({
                userId: data.assignedTo,
                type: "TASK_ASSIGNED",
                message: `You have been assigned the task "${updatedTask.title}".`,
                relatedEntityType: "TASK",
                relatedEntityId: updatedTask.id
            });
        } catch (notifErr) {
            console.warn("Task assign notification failed:", notifErr.message);
        }
    }

    return updatedTask;
};

const assignTask = async (
    taskId,
    currentUserId,
    assignedTo
) => {

    // Find the task and its project
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    id: true,
                    workspace_id: true,
                    manager_id: true
                }
            }
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Check project access
    await checkProjectAccess(task.projects, currentUserId);

    if (assignedTo) {
        // Check that assigned user exists
        const user = await prisma.users.findUnique({
            where: {
                id: assignedTo
            }
        });

        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        // Check that assigned user belongs to this project or is project manager
        const isManager = task.projects?.manager_id === assignedTo;
        if (!isManager) {
            const projectMembership =
                await prisma.project_members.findUnique({
                    where: {
                        project_id_user_id: {
                            project_id: task.project_id,
                            user_id: assignedTo
                        }
                    }
                });

            if (!projectMembership) {
                const error = new Error(
                    "Assigned user is not a member of the project"
                );
                error.statusCode = 400;
                throw error;
            }
        }
    }

    // Assign task
    const updatedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: {
            assigned_to: assignedTo,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    if (assignedTo && assignedTo !== task.assigned_to) {
        try {
            await createNotification({
                userId: assignedTo,
                type: "TASK_ASSIGNED",
                message: `You have been assigned the task "${updatedTask.title}".`,
                relatedEntityType: "TASK",
                relatedEntityId: updatedTask.id
            });
        } catch (notifErr) {
            console.error("[NOTIFICATION_DISPATCH_WARNING] Task assign notification failed:", {
                taskId: updatedTask.id,
                userId: assignedTo,
                error: notifErr.message
            });
        }
    }

    return updatedTask;
};

const archiveTask = async (
    taskId,
    userId
) => {

    // Find the task and its project
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: true
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Check project access
    await checkProjectAccess(task.projects, userId);

    // Check if already archived
    if (task.is_archived) {
        throw new Error("Task is already archived");
    }

    // Archive task
    const archivedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: {
            is_archived: true,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            }
        }
    });

    return archivedTask;
};

const restoreTask = async (taskId, userId) => {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: true
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    // Check project access
    await checkProjectAccess(task.projects, userId);

    if (!task.is_archived) {
        const error = new Error("Task is not archived");
        error.statusCode = 400;
        throw error;
    }

    if (task.projects?.is_archived) {
        const error = new Error("Cannot restore task while its parent project is archived. Please restore the project first.");
        error.statusCode = 400;
        throw error;
    }

    const restoredTask = await prisma.tasks.update({
        where: { id: taskId },
        data: {
            is_archived: false,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            }
        }
    });

    return restoredTask;
};

const duplicateTask = async (taskId, userId) => {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: true,
            subtasks: true
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    // Check project access
    await checkProjectAccess(task.projects, userId);

    return await prisma.$transaction(async (tx) => {
        const duplicated = await tx.tasks.create({
            data: {
                project_id: task.project_id,
                title: `${task.title} (Copy)`,
                description: task.description,
                priority: task.priority,
                status: "Backlog",
                start_date: task.start_date,
                due_date: task.due_date,
                estimated_hours: task.estimated_hours,
                assigned_to: task.assigned_to,
                created_by: userId,
                is_archived: false
            },
            include: {
                projects: {
                    select: {
                        id: true,
                        title: true,
                        workspace_id: true
                    }
                }
            }
        });

        if (task.subtasks && task.subtasks.length > 0) {
            for (const sub of task.subtasks) {
                await tx.subtasks.create({
                    data: {
                        task_id: duplicated.id,
                        title: sub.title,
                        description: sub.description,
                        status: "To Do",
                        due_date: sub.due_date,
                        is_archived: false
                    }
                });
            }
        }

        return await tx.tasks.findUnique({
            where: { id: duplicated.id },
            include: {
                projects: {
                    select: {
                        id: true,
                        title: true,
                        workspace_id: true
                    }
                },
                users_tasks_created_byTousers: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true
                    }
                },
                users_tasks_assigned_toTousers: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true
                    }
                },
                subtasks: true
            }
        });
    });
};

const deleteTask = async (taskId, userId) => {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: true
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    await checkProjectAccess(task.projects, userId);

    await prisma.tasks.delete({
        where: { id: taskId }
    });

    try {
        await createActivity({
            workspaceId: task.projects.workspace_id,
            userId,
            actionType: "TASK_DELETED",
            entityType: "TASK",
            entityId: taskId,
            description: `Permanently deleted task "${task.title}"`
        });
    } catch (actErr) {
        console.warn("Task delete activity logging failed:", actErr.message);
    }

    return {
        id: taskId,
        projectId: task.project_id,
        workspaceId: task.projects.workspace_id
    };
};


const getMyTasks = async (userId, { archived, workspaceId, projectId, assignedTo } = {}) => {
    const isArchived = archived === "true" || archived === true;

    // Resolve all workspaces where user is Owner or Admin
    const adminMemberships = await prisma.workspace_members.findMany({
        where: {
            user_id: userId,
            workspace_role: { in: ["Owner", "Admin"] },
            workspaces: { is_archived: false }
        },
        select: { workspace_id: true }
    });
    const adminWorkspaceIds = adminMemberships.map((m) => m.workspace_id);

    // Build project scope filter
    const projectWhere = {
        is_archived: false,
        OR: [
            { workspace_id: { in: adminWorkspaceIds } },
            { manager_id: userId },
            { project_members: { some: { user_id: userId } } }
        ]
    };

    if (workspaceId) {
        projectWhere.workspace_id = workspaceId;
    }

    if (projectId) {
        projectWhere.id = projectId;
    }

    if (isArchived) {
        delete projectWhere.is_archived;
    }

    const authorizedProjects = await prisma.projects.findMany({
        where: projectWhere,
        select: { id: true }
    });
    const authorizedProjectIds = authorizedProjects.map((p) => p.id);

    if (authorizedProjectIds.length === 0) {
        return [];
    }

    const taskWhere = {
        project_id: { in: authorizedProjectIds },
        is_archived: isArchived
    };

    if (assignedTo === "me") {
        taskWhere.assigned_to = userId;
    } else if (assignedTo === "unassigned") {
        taskWhere.assigned_to = null;
    } else if (assignedTo) {
        taskWhere.assigned_to = assignedTo;
    }

    const tasks = await prisma.tasks.findMany({
        where: taskWhere,
        orderBy: [
            {
                due_date: "asc"
            },
            {
                created_at: "desc"
            }
        ],
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            subtasks: true
        }
    });

    tasks.forEach((task) => {
        task.progress = calculateSubtaskProgress(task.subtasks);
        task.subtask_progress = task.progress;
    });

    return tasks;
};

const updateTaskStatus = async (
    taskId,
    userId,
    status
) => {

    // Validate status
    if (!VALID_TASK_STATUSES.includes(status)) {
        const err = new Error("Invalid task status");
        err.statusCode = 400;
        throw err;
    }

    // Find task and project
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    workspace_id: true
                }
            }
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: task.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    const oldStatus = task.status;

    // Update status
    const updatedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: {
            status,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    updatedTask.oldStatus = oldStatus;
    return updatedTask;
};

// Canonical Date Helper: Start of today in UTC (matching YYYY-MM-DD date storage in DB and frontend)
const getStartOfTodayUtc = (refDate = new Date()) => {
    const todayIso = refDate.toISOString().slice(0, 10);
    return new Date(`${todayIso}T00:00:00.000Z`);
};

// Canonical Overdue Filter:
// - not completed
// - not archived
// - due_date < startOfTodayUtc
const getOverdueFilter = (refDate = new Date()) => {
    const startOfToday = getStartOfTodayUtc(refDate);
    return {
        is_archived: false,
        status: { not: "Completed" },
        due_date: {
            not: null,
            lt: startOfToday
        }
    };
};

const getUserOverdueCount = async (userId, projectId = null) => {
    const where = getOverdueFilter();
    if (projectId) {
        where.project_id = projectId;
    } else if (userId) {
        where.assigned_to = userId;
    }
    return prisma.tasks.count({ where });
};

const getUserOverdueTasks = async (userId, projectId = null) => {
    const where = getOverdueFilter();
    if (projectId) {
        where.project_id = projectId;
    } else if (userId) {
        where.assigned_to = userId;
    }
    return prisma.tasks.findMany({
        where,
        orderBy: { due_date: "asc" },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true
                }
            }
        }
    });
};

export {
    VALID_TASK_PRIORITIES,
    VALID_TASK_STATUSES,
    calculateSubtaskProgress,
    createTask,
    getProjectTasks,
    getTask,
    updateTask,
    assignTask,
    deleteTask,
    archiveTask,
    restoreTask,
    duplicateTask,
    getMyTasks,
    updateTaskStatus,
    getStartOfTodayUtc,
    getOverdueFilter,
    getUserOverdueCount,
    getUserOverdueTasks,
    getProjectWorkspaceId
};