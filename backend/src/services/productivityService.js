import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";

/**
 * Get comprehensive, real database-backed productivity metrics for a user.
 * @param {string} userId - User UUID
 * @param {object} options - Optional filters (e.g., workspaceId, projectId)
 */
export const getUserProductivity = async (userId, options = {}) => {
    const { workspaceId, projectId } = options;

    // Base filter for user's assigned tasks
    const baseWhere = {
        assigned_to: userId,
        is_archived: false
    };

    if (projectId) {
        baseWhere.project_id = projectId;
    } else if (workspaceId) {
        baseWhere.projects = { workspace_id: workspaceId };
    }

    // 1. Fetch all assigned tasks for the user with relevant fields
    const tasks = await prisma.tasks.findMany({
        where: baseWhere,
        select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            start_date: true,
            due_date: true,
            estimated_hours: true,
            created_at: true,
            updated_at: true,
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            }
        },
        orderBy: { updated_at: "desc" }
    });

    const startOfToday = getStartOfTodayUtc();

    let completedCount = 0;
    let activeCount = 0;
    let overdueCount = 0;
    let totalEstimatedHours = 0;
    let totalCycleTimeMs = 0;
    let completedWithDatesCount = 0;

    const priorityBreakdown = {
        Low: { count: 0, estimatedHours: 0 },
        Medium: { count: 0, estimatedHours: 0 },
        High: { count: 0, estimatedHours: 0 },
        Critical: { count: 0, estimatedHours: 0 }
    };

    const overdueTasks = [];
    const recentCompletions = [];

    // Daily completions map for the last 14 days
    const dailyVelocity = {};
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyVelocity[key] = 0;
    }

    for (const t of tasks) {
        const isCompleted = t.status === "Completed";
        const hours = Number(t.estimated_hours) || 0;

        if (isCompleted) {
            completedCount++;
            // Calculate cycle time (created_at -> updated_at)
            if (t.created_at && t.updated_at) {
                const cycleMs = Math.max(0, new Date(t.updated_at).getTime() - new Date(t.created_at).getTime());
                totalCycleTimeMs += cycleMs;
                completedWithDatesCount++;
            }

            // Track daily velocity
            const updatedDay = new Date(t.updated_at).toISOString().slice(0, 10);
            if (dailyVelocity[updatedDay] !== undefined) {
                dailyVelocity[updatedDay]++;
            }

            // Recent completions
            if (recentCompletions.length < 5) {
                recentCompletions.push({
                    id: t.id,
                    title: t.title,
                    priority: t.priority,
                    completedAt: t.updated_at,
                    projectTitle: t.projects?.title || "Direct Task"
                });
            }
        } else {
            // Active task
            activeCount++;
            totalEstimatedHours += hours;

            const prio = priorityBreakdown[t.priority] ? t.priority : "Medium";
            priorityBreakdown[prio].count++;
            priorityBreakdown[prio].estimatedHours += hours;

            // Check overdue
            if (t.due_date && new Date(t.due_date) < startOfToday) {
                overdueCount++;
                overdueTasks.push({
                    id: t.id,
                    title: t.title,
                    priority: t.priority,
                    dueDate: t.due_date,
                    projectTitle: t.projects?.title || "Direct Task"
                });
            }
        }
    }

    const totalAssigned = completedCount + activeCount;
    const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

    const avgCycleTimeHours = completedWithDatesCount > 0
        ? Math.round((totalCycleTimeMs / (completedWithDatesCount * 1000 * 3600)) * 10) / 10
        : 0;
    const avgCycleTimeDays = Math.round((avgCycleTimeHours / 24) * 10) / 10;

    // Deterministic Focus Index (0 - 100)
    let focusIndex = 100;
    if (totalAssigned > 0) {
        focusIndex -= overdueCount * 12;
        focusIndex -= priorityBreakdown.Critical.count * 8;
        focusIndex -= priorityBreakdown.High.count * 3;
        if (completionRate > 70) focusIndex += 5;
        focusIndex = Math.max(10, Math.min(100, Math.round(focusIndex)));
    }

    // Velocity array for charts
    const velocityTrend = Object.entries(dailyVelocity).map(([date, count]) => ({
        date,
        count
    }));

    return {
        summary: {
            totalAssigned,
            completedCount,
            activeCount,
            overdueCount,
            completionRate,
            totalEstimatedHours,
            avgCycleTimeHours,
            avgCycleTimeDays,
            focusIndex
        },
        priorityBreakdown,
        velocityTrend,
        overdueTasks: overdueTasks.slice(0, 10),
        recentCompletions
    };
};
