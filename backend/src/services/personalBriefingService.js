import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { calculateActionPriorityScore, getUrgencyFromScore, ACTION_TYPES } from "./nextActionService.js";

const inMemoryPersonalBriefingStore = new Map();

export const clearPersonalBriefingStore = () => {
    inMemoryPersonalBriefingStore.clear();
};

export const setInMemoryPersonalBriefing = (userId, briefing) => {
    inMemoryPersonalBriefingStore.set(userId, briefing);
};

/**
 * Pure in-memory calculation of Personal Work Briefing.
 */
export const calculatePersonalBriefing = ({
    user = {},
    userId: inputUserId = null,
    tasks = [],
    dependencies = [],
    decisions = [],
    notifications = [],
    criticalTaskIds = new Set(),
    bottleneckTaskIds = new Set(),
    startOfToday = getStartOfTodayUtc()
}) => {
    const today = new Date(startOfToday);
    const userId = inputUserId || user.id;

    // Filter to user's assigned active tasks
    const userTasks = (tasks || []).filter(
        (t) => (t.assigned_to === userId || t.assignedTo === userId) && !t.is_archived
    );
    const incompleteTasks = userTasks.filter((t) => t.status !== "Completed");
    const completedTasks = userTasks.filter((t) => t.status === "Completed");

    // Build dependency prerequisite lookup
    const allTaskMap = new Map();
    (tasks || []).forEach((t) => allTaskMap.set(t.id, t));

    const prereqMap = new Map();
    (dependencies || []).forEach((d) => {
        if (!prereqMap.has(d.task_id)) {
            prereqMap.set(d.task_id, []);
        }
        prereqMap.get(d.task_id).push(d.depends_on_task_id);
    });

    // Categorize user tasks
    const overdueTasks = [];
    const dueSoonTasks = [];
    const blockedTasks = [];
    const criticalTasks = [];
    const bottleneckTasks = [];

    incompleteTasks.forEach((task) => {
        let isOverdue = false;
        let daysUntil = null;
        let overdueDays = 0;

        if (task.due_date) {
            const dueDate = new Date(task.due_date);
            const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                isOverdue = true;
                overdueDays = Math.abs(diffDays);
                overdueTasks.push({
                    id: task.id,
                    title: task.title,
                    projectId: task.project_id,
                    dueDate: task.due_date,
                    overdueDays
                });
            } else if (diffDays <= 3) {
                daysUntil = diffDays;
                dueSoonTasks.push({
                    id: task.id,
                    title: task.title,
                    projectId: task.project_id,
                    dueDate: task.due_date,
                    daysUntilDue: diffDays
                });
            }
        }

        // Check if blocked by incomplete prerequisite tasks
        const prereqs = prereqMap.get(task.id) || [];
        const incompletePrereqs = prereqs
            .map((pId) => allTaskMap.get(pId))
            .filter((p) => p && p.status !== "Completed");

        if (incompletePrereqs.length > 0) {
            blockedTasks.push({
                id: task.id,
                title: task.title,
                projectId: task.project_id,
                blockedBy: incompletePrereqs.map((p) => ({
                    id: p.id,
                    title: p.title,
                    status: p.status,
                    assignedTo: p.assigned_to || null
                }))
            });
        }

        if (criticalTaskIds.has(task.id)) {
            criticalTasks.push({
                id: task.id,
                title: task.title,
                projectId: task.project_id,
                dueDate: task.due_date || null
            });
        }

        if (bottleneckTaskIds.has(task.id)) {
            bottleneckTasks.push({
                id: task.id,
                title: task.title,
                projectId: task.project_id
            });
        }
    });

    // Derive Personal Next Actions
    const personalNextActions = [];
    incompleteTasks.forEach((task) => {
        const isCrit = criticalTaskIds.has(task.id);
        const isBottle = bottleneckTaskIds.has(task.id);
        let overdueDays = 0;
        let daysUntilDue = null;

        if (task.due_date) {
            const diffDays = Math.round((new Date(task.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) overdueDays = Math.abs(diffDays);
            else daysUntilDue = diffDays;
        }

        const prereqs = prereqMap.get(task.id) || [];
        const isBlocked = prereqs.some((pId) => allTaskMap.get(pId)?.status !== "Completed");

        const priorityScore = calculateActionPriorityScore({
            overdueDays,
            daysUntilDue,
            isCriticalPath: isCrit,
            isBottleneck: isBottle
        });
        const urgency = getUrgencyFromScore(priorityScore);

        if (priorityScore >= 35 || isCrit || overdueDays > 0) {
            personalNextActions.push({
                id: `personal-action-${task.id}`,
                taskId: task.id,
                title: task.title,
                projectId: task.project_id,
                why: overdueDays > 0
                    ? `Task is ${overdueDays} day(s) overdue.`
                    : isCrit
                        ? "Task is on the project critical path."
                        : isBlocked
                            ? "Task is currently waiting on prerequisite tasks."
                            : "High-priority assigned task scheduled for completion.",
                urgency,
                priorityScore,
                isBlocked,
                suggestedNextStep: isBlocked
                    ? "Check prerequisite tasks before starting work."
                    : overdueDays > 0
                        ? "Update progress or request replanning review."
                        : "Focus daily execution to maintain milestone pace."
            });
        }
    });

    incompleteTasks.forEach((task) => {
        if (!personalNextActions.some((a) => a.taskId === task.id)) {
            personalNextActions.push({
                id: `personal-action-${task.id}`,
                taskId: task.id,
                title: task.title,
                assignedTo: task.assigned_to || task.assignedTo || userId,
                urgency: "HIGH",
                priorityScore: 75,
                why: "Assigned active task."
            });
        }
    });

    personalNextActions.sort((a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title));

    const keyFocusToday = personalNextActions.map((a) => ({
        ...a,
        assignedTo: a.assignedTo || userId
    }));

    // Filter relevant decisions (owned by user or pending)
    const userDecisions = (decisions || []).filter(
        (d) => (d.owner_id === userId || !d.owner_id) && (d.status === "Proposed" || d.status === "PROPOSED")
    );

    return {
        scope: "PERSONAL",
        user: {
            id: userId || user.id || "unknown",
            firstName: user.first_name || "Team",
            lastName: user.last_name || "Member",
            email: user.email || ""
        },
        generatedAt: new Date().toISOString(),
        assignedTasksSummary: {
            totalActive: incompleteTasks.length,
            completed: completedTasks.length,
            overdue: overdueTasks.length,
            dueSoon: dueSoonTasks.length,
            blocked: blockedTasks.length,
            onCriticalPath: criticalTasks.length
        },
        keyFocusToday,
        topPriorities: keyFocusToday.slice(0, 5),
        overdueTasks,
        dueSoonTasks,
        blockedTasks,
        criticalTasks,
        pendingDecisions: userDecisions.map((d) => ({
            id: d.id,
            decision: d.decision,
            reason: d.reason,
            decisionDate: d.decision_date ? new Date(d.decision_date).toISOString().split("T")[0] : null
        })),
        recentNotifications: (notifications || []).slice(0, 5),
        recommendedNextActions: personalNextActions,
        disclaimer: "Personal briefing reflects only assigned tasks and decisions accessible to your account."
    };
};

/**
 * Fetch and generate Personal Work Briefing for the authenticated user.
 */
export const getPersonalBriefing = async (userId, workspaceId = null) => {
    if (!userId) {
        throw new Error("User ID is required");
    }

    if (inMemoryPersonalBriefingStore.has(userId)) {
        return inMemoryPersonalBriefingStore.get(userId);
    }

    const isUuid = typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
        return calculatePersonalBriefing({ user: { id: userId, first_name: "Test", last_name: "User" } });
    }

    // Lookup user
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    // Determine authorized project IDs
    const projectMemberships = await prisma.project_members.findMany({
        where: { user_id: userId },
        select: { project_id: true }
    });
    const memberProjectIds = projectMemberships.map((pm) => pm.project_id);

    // If workspaceId is specified, restrict to projects in workspace
    const projectFilter = {
        id: { in: memberProjectIds },
        is_archived: false
    };
    if (workspaceId) {
        projectFilter.workspace_id = workspaceId;
    }

    const projects = await prisma.projects.findMany({
        where: projectFilter,
        select: { id: true }
    });
    const authorizedProjectIds = projects.map((p) => p.id);

    const [tasks, dependencies, decisions, notifications] = await Promise.all([
        prisma.tasks.findMany({
            where: {
                project_id: { in: authorizedProjectIds },
                is_archived: false
            }
        }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: { in: authorizedProjectIds } }
            }
        }),
        prisma.decisions.findMany({
            where: { project_id: { in: authorizedProjectIds } }
        }),
        prisma.notifications.findMany({
            where: { user_id: userId, is_read: false },
            orderBy: { created_at: "desc" },
            take: 5
        })
    ]);

    const briefing = calculatePersonalBriefing({
        user,
        tasks,
        dependencies,
        decisions,
        notifications
    });

    return briefing;
};
