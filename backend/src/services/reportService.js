import prisma from "../config/prisma.js";
import { getProjectWorkspaceId } from "./taskService.js";

const validateProjectAccess = async (projectId, userId) => {
    const workspaceId = await getProjectWorkspaceId(projectId);

    if (!workspaceId) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    return { id: projectId, workspace_id: workspaceId };
};

const getStartOfTodayUtc = (refDate = new Date()) => {
    const todayIso = refDate.toISOString().slice(0, 10);
    return new Date(`${todayIso}T00:00:00.000Z`);
};

/**
 * Scopes tasks strictly to the authorized workspace/project context.
 * Prevents un-scoped global queries that inadvertently include synthetic load test tasks.
 */
const resolveTaskScopeWhere = async (projectId, userId, workspaceId = null) => {
    const where = {
        is_archived: false
    };

    if (projectId) {
        await validateProjectAccess(projectId, userId);
        where.project_id = projectId;
        return where;
    }

    if (workspaceId) {
        const membership = await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            }
        });
        if (!membership) {
            const error = new Error("Workspace access denied");
            error.statusCode = 403;
            throw error;
        }
        where.projects = {
            workspace_id: workspaceId
        };
        return where;
    }

    // Default: Scope to all workspaces where this user is an authorized member
    const memberships = await prisma.workspace_members.findMany({
        where: { user_id: userId },
        select: { workspace_id: true }
    });

    const userWorkspaceIds = memberships.map((m) => m.workspace_id);
    where.projects = {
        workspace_id: { in: userWorkspaceIds }
    };
    return where;
};

/**
 * Get task completion statistics
 */
const getTaskCompletion = async (projectId = null, userId, skipAccessCheck = false, workspaceId = null) => {
    const where = await resolveTaskScopeWhere(projectId, userId, workspaceId);

    const totalTasks = await prisma.tasks.count({
        where
    });

    const completedTasks = await prisma.tasks.count({
        where: {
            ...where,
            status: "Completed"
        }
    });

    const pendingTasks = totalTasks - completedTasks;

    const completionRate =
        totalTasks === 0
            ? 0
            : Math.round((completedTasks / totalTasks) * 100);

    return {
        totalTasks,
        completedTasks,
        pendingTasks,
        completionRate
    };
};

/**
 * Get pending and overdue task statistics
 */
const getPendingOverdue = async (projectId = null, userId, skipAccessCheck = false, workspaceId = null) => {
    const scopeWhere = await resolveTaskScopeWhere(projectId, userId, workspaceId);
    const today = getStartOfTodayUtc();

    const baseWhere = {
        ...scopeWhere,
        status: {
            not: "Completed"
        }
    };

    const pendingTasks = await prisma.tasks.count({
        where: baseWhere
    });

    const overdueTasks = await prisma.tasks.count({
        where: {
            ...baseWhere,
            due_date: {
                not: null,
                lt: today
            }
        }
    });

    return {
        pendingTasks,
        overdueTasks
    };
};

/**
 * Get tasks grouped by priority
 */
const getTasksByPriority = async (projectId = null, userId, skipAccessCheck = false, workspaceId = null) => {
    const where = await resolveTaskScopeWhere(projectId, userId, workspaceId);

    const tasks = await prisma.tasks.groupBy({
        by: ["priority"],
        where,
        _count: {
            id: true
        }
    });

    return tasks.map((item) => ({
        priority: item.priority,
        count: item._count.id
    }));
};

/**
 * Get tasks grouped by status
 */
const getTasksByStatus = async (projectId = null, userId, skipAccessCheck = false, workspaceId = null) => {
    const where = await resolveTaskScopeWhere(projectId, userId, workspaceId);

    const tasks = await prisma.tasks.groupBy({
        by: ["status"],
        where,
        _count: {
            id: true
        }
    });

    return tasks.map((item) => ({
        status: item.status,
        count: item._count.id
    }));
};

/**
 * Get all reports and analytics
 */
const getDashboardAnalytics = async (projectId = null, userId, workspaceId = null) => {
    const baseWhere = await resolveTaskScopeWhere(projectId, userId, workspaceId);
    const today = getStartOfTodayUtc();

    const [statusGroups, priorityGroups, overdueTasks] = await Promise.all([
        prisma.tasks.groupBy({
            by: ["status"],
            where: baseWhere,
            _count: { id: true }
        }),
        prisma.tasks.groupBy({
            by: ["priority"],
            where: baseWhere,
            _count: { id: true }
        }),
        prisma.tasks.count({
            where: {
                ...baseWhere,
                status: { not: "Completed" },
                due_date: { not: null, lt: today }
            }
        })
    ]);

    const byStatus = statusGroups.map((item) => ({
        status: item.status,
        count: item._count.id
    }));

    const byPriority = priorityGroups.map((item) => ({
        priority: item.priority,
        count: item._count.id
    }));

    let totalTasks = 0;
    let completedTasks = 0;
    for (const item of byStatus) {
        totalTasks += item.count;
        if (item.status === "Completed") {
            completedTasks += item.count;
        }
    }
    const pendingTasks = totalTasks - completedTasks;
    const completionRate =
        totalTasks === 0
            ? 0
            : Math.round((completedTasks / totalTasks) * 100);

    return {
        completion: {
            totalTasks,
            completedTasks,
            pendingTasks,
            completionRate
        },
        pendingOverdue: {
            pendingTasks,
            overdueTasks
        },
        byPriority,
        byStatus
    };
};

export {
    getTaskCompletion,
    getPendingOverdue,
    getTasksByPriority,
    getTasksByStatus,
    getDashboardAnalytics
};
