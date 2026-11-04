import prisma from "../config/prisma.js";
import { createNotification } from "./notificationService.js";
import sendEmail from "./emailService.js";

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

    const completedSubtasks = subtasks.filter(
        (subtask) => subtask.status === "Done" || subtask.status === "Completed"
    ).length;

    return Math.round(
        (completedSubtasks / subtasks.length) * 100
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
    assignedTo
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

    // Check whether creator has access to the workspace
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: project.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

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
                throw new Error(
                    "Assigned user is not a member of the project"
                );
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
            assigned_to: assignedTo || userId,
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
    { page, limit, archived } = {}
) => {

    // Check whether project exists and resolve workspace
    const workspaceId = await getProjectWorkspaceId(projectId);

    if (!workspaceId) {
        throw new Error("Project not found");
    }

    // Check whether user has workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            },
            select: {
                id: true
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

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

    task.progress = calculateSubtaskProgress(task.subtasks);

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

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: existingTask.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

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

    if (data.assignedTo !== undefined) {
        updateData.assigned_to = data.assignedTo || null;
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
                    workspace_id: true
                }
            }
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Check whether current user has workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: task.projects.workspace_id,
                    user_id: currentUserId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    // Check that assigned user exists
    const user = await prisma.users.findUnique({
        where: {
            id: assignedTo
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    // Check that assigned user belongs to this project
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
        throw new Error(
            "Assigned user is not a member of the project"
        );
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
            projects: {
                select: {
                    workspace_id: true,
                    is_archived: true
                }
            }
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    const workspaceMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: task.projects.workspace_id,
                user_id: userId
            }
        }
    });

    if (!workspaceMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

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
            projects: {
                select: {
                    workspace_id: true,
                    is_archived: true
                }
            },
            subtasks: true
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    const workspaceMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: task.projects.workspace_id,
                user_id: userId
            }
        }
    });

    if (!workspaceMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

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
                        due_date: sub.due_date
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
                subtasks: true
            }
        });
    });
};


const getMyTasks = async (userId, { archived } = {}) => {
    const isArchived = archived === "true" || archived === true;
    const tasks = await prisma.tasks.findMany({
        where: {
            assigned_to: userId,
            is_archived: isArchived
        },
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
                    title: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
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