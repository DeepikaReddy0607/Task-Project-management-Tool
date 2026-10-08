import prisma from "../config/prisma.js";

const validateProjectAccess = async (projectId, userId) => {
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        },
        select: {
            id: true,
            workspace_id: true
        }
    });

    if (!project) {
        throw new Error("Project not found");
    }

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

    return project;
};

const getStartOfTodayUtc = (refDate = new Date()) => {
    const todayIso = refDate.toISOString().slice(0, 10);
    return new Date(`${todayIso}T00:00:00.000Z`);
};

/**
 * Get task completion statistics
 */
const getTaskCompletion = async (projectId = null, userId) => {
    if (projectId) {
        await validateProjectAccess(projectId, userId);
    }

    const where = {
        is_archived: false
    };

    if (projectId) {
        where.project_id = projectId;
    }

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
const getPendingOverdue = async (projectId = null, userId) => {
    if (projectId) {
        await validateProjectAccess(projectId, userId);
    }

    const today = getStartOfTodayUtc();

    const baseWhere = {
        is_archived: false,
        status: {
            not: "Completed"
        }
    };

    if (projectId) {
        baseWhere.project_id = projectId;
    }

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
const getTasksByPriority = async (projectId = null, userId) => {
    if (projectId) {
        await validateProjectAccess(projectId, userId);
    }
    const where = {
        is_archived: false
    };

    if (projectId) {
        where.project_id = projectId;
    }

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
const getTasksByStatus = async (projectId = null, userId) => {
    if (projectId) {
        await validateProjectAccess(projectId, userId);
    }
    const where = {
        is_archived: false
    };

    if (projectId) {
        where.project_id = projectId;
    }

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
const getDashboardAnalytics = async (projectId = null, userId) => {
    const [
        completion,
        pendingOverdue,
        byPriority,
        byStatus
    ] = await Promise.all([
        getTaskCompletion(projectId, userId),
        getPendingOverdue(projectId, userId),
        getTasksByPriority(projectId, userId),
        getTasksByStatus(projectId, userId)
    ]);

    return {
        completion,
        pendingOverdue,
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