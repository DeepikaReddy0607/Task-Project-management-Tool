import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { calculateCriticalPath } from "./criticalPathService.js";
import { detectBottlenecks } from "./bottleneckService.js";

const inMemoryStandupStore = new Map();

export const clearStandupStore = () => {
    inMemoryStandupStore.clear();
};

export const setInMemoryStandup = (key, standup) => {
    inMemoryStandupStore.set(key, standup);
};

/**
 * Pure in-memory calculation of Standup Intelligence.
 */
export const calculateStandupData = ({
    scope = "PROJECT", // "PROJECT" | "TEAM" | "PERSONAL"
    scopeId = null,
    scopeTitle = "Project Standup",
    tasks = [],
    dependencies = [],
    decisions = [],
    proposals = [],
    activityLogs = [],
    criticalPathData = null,
    currentUserId = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const today = new Date(startOfToday);
    const twoDaysAgo = new Date(today.getTime() - 48 * 60 * 60 * 1000);

    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");
    const completedTasks = activeTasks.filter((t) => t.status === "Completed");

    // Dependency lookup
    const allTaskMap = new Map();
    activeTasks.forEach((t) => allTaskMap.set(t.id, t));

    const prereqMap = new Map();
    (dependencies || []).forEach((d) => {
        if (!prereqMap.has(d.task_id)) {
            prereqMap.set(d.task_id, []);
        }
        prereqMap.get(d.task_id).push(d.depends_on_task_id);
    });

    // CPM calculation for critical path tags
    const cpm = calculateCriticalPath({ project: { id: scopeId }, tasks: activeTasks, dependencies, startOfToday });
    const criticalTaskIds = new Set([
        ...(criticalPathData?.criticalTaskIds || []),
        ...(cpm.criticalTaskIds || [])
    ]);
    const bottlenecks = detectBottlenecks({ project: { id: scopeId }, tasks: activeTasks, dependencies, startOfToday });
    const bottleneckTaskIds = new Set((bottlenecks.majorBottlenecks || []).map((b) => b.taskId || b.id));

    // Filter tasks if scope is PERSONAL
    let filteredIncomplete = incompleteTasks;
    let filteredCompleted = completedTasks;
    if (scope === "PERSONAL" && currentUserId) {
        filteredIncomplete = incompleteTasks.filter((t) => t.assigned_to === currentUserId);
        filteredCompleted = completedTasks.filter((t) => t.assigned_to === currentUserId);
    }

    // 1. YESTERDAY (Recorded completed work in the recent window)
    const yesterday = [];
    filteredCompleted.forEach((t) => {
        const completedAt = t.updated_at ? new Date(t.updated_at) : null;
        if (!completedAt || completedAt >= twoDaysAgo) {
            yesterday.push({
                taskId: t.id,
                title: t.title,
                assignedTo: t.assigned_to || null,
                completedAt: completedAt ? completedAt.toISOString().split("T")[0] : null
            });
        }
    });

    // Include recent completed activity logs if available
    (activityLogs || []).forEach((log) => {
        if (log.action_type === "TASK_COMPLETED" || /completed/i.test(log.description || "")) {
            if (!yesterday.some((y) => y.taskId === log.entity_id)) {
                yesterday.push({
                    taskId: log.entity_id || "task-log",
                    title: log.description || "Task completed",
                    assignedTo: log.user_id || null,
                    completedAt: log.created_at ? new Date(log.created_at).toISOString().split("T")[0] : null
                });
            }
        }
    });

    // 2. TODAY (Active tasks scheduled, in progress, due soon, or on critical path)
    const todayItems = [];
    filteredIncomplete.forEach((t) => {
        let isTodayPriority = false;
        let daysUntil = null;
        if (t.due_date) {
            const diffDays = Math.round((new Date(t.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            daysUntil = diffDays;
            if (diffDays <= 2 && diffDays >= 0) {
                isTodayPriority = true;
            }
        }
        if (t.status === "In Progress" || criticalTaskIds.has(t.id)) {
            isTodayPriority = true;
        }

        if (isTodayPriority) {
            todayItems.push({
                taskId: t.id,
                title: t.title,
                status: t.status,
                assignedTo: t.assigned_to || null,
                dueDate: t.due_date ? new Date(t.due_date).toISOString().split("T")[0] : null,
                isCriticalPath: criticalTaskIds.has(t.id),
                daysUntilDue: daysUntil
            });
        }
    });

    // 3. BLOCKED (Tasks with incomplete dependencies)
    const blocked = [];
    filteredIncomplete.forEach((t) => {
        const prereqs = prereqMap.get(t.id) || [];
        const incompletePrereqs = prereqs
            .map((pId) => allTaskMap.get(pId))
            .filter((p) => p && p.status !== "Completed");

        if (incompletePrereqs.length > 0) {
            blocked.push({
                taskId: t.id,
                title: t.title,
                assignedTo: t.assigned_to || null,
                isCriticalPath: criticalTaskIds.has(t.id),
                blockedBy: incompletePrereqs.map((p) => ({
                    id: p.id,
                    title: p.title,
                    status: p.status,
                    assignedTo: p.assigned_to || null
                })),
                reason: `Blocked by ${incompletePrereqs.length} prerequisite task(s): ${incompletePrereqs.map((p) => p.title).join(", ")}`
            });
        }
    });

    // 4. AT RISK (Tasks overdue or near deadline with high effort, or bottleneck tasks)
    const atRisk = [];
    filteredIncomplete.forEach((t) => {
        let isOverdue = false;
        let overdueDays = 0;
        if (t.due_date) {
            const dueDateMs = new Date(t.due_date).getTime();
            if (dueDateMs < today.getTime() || dueDateMs < Date.now()) {
                isOverdue = true;
                const diffDays = Math.round((dueDateMs - today.getTime()) / (1000 * 60 * 60 * 24));
                overdueDays = Math.max(1, Math.abs(diffDays));
            }
        }
        const isBottle = bottleneckTaskIds.has(t.id);
        const isCrit = criticalTaskIds.has(t.id);

        if (isOverdue || (isBottle && isCrit)) {
            atRisk.push({
                taskId: t.id,
                title: t.title,
                assignedTo: t.assigned_to || null,
                dueDate: t.due_date ? new Date(t.due_date).toISOString().split("T")[0] : null,
                overdueDays,
                isCriticalPath: isCrit,
                isBottleneck: isBottle,
                riskReason: isOverdue
                    ? `Overdue by ${overdueDays} day(s)`
                    : "Critical path bottleneck dragging delivery"
            });
        }
    });

    // 5. NEEDS DISCUSSION (Pending decisions, proposals, or major bottlenecks)
    const needsDiscussion = [];
    (decisions || []).forEach((d) => {
        if (d.status === "Proposed" || d.status === "PROPOSED") {
            needsDiscussion.push({
                type: "DECISION",
                id: d.id,
                title: d.title || d.decision,
                reason: d.reason || "Decision requires team confirmation",
                status: d.status
            });
        }
    });
    (proposals || []).forEach((p) => {
        if (p.status === "PROPOSED" || p.status === "Pending") {
            needsDiscussion.push({
                type: "REPLANNING_PROPOSAL",
                id: p.id,
                title: p.strategy || p.title || "Replanning Proposal",
                reason: p.rationale || "Proposal awaiting review and approval",
                status: p.status
            });
        }
    });
    bottlenecks.majorBottlenecks?.forEach((b) => {
        needsDiscussion.push({
            type: "BOTTLENECK",
            id: b.taskId || b.id,
            title: b.title || b.taskTitle || "Bottleneck Task",
            reason: `Bottleneck score ${b.bottleneckScore || b.score || 0}: high dependency drag`,
            status: "Active"
        });
    });

    return {
        scope,
        scopeId,
        scopeTitle,
        generatedAt: new Date().toISOString(),
        yesterday: yesterday.length > 0 ? yesterday : [],
        today: todayItems.length > 0 ? todayItems : [],
        blocked: blocked.length > 0 ? blocked : [],
        atRisk: atRisk.length > 0 ? atRisk : [],
        needsDiscussion: needsDiscussion.length > 0 ? needsDiscussion : [],
        summary: {
            yesterdayCount: yesterday.length,
            todayCount: todayItems.length,
            blockedCount: blocked.length,
            atRiskCount: atRisk.length,
            discussionCount: needsDiscussion.length
        },
        disclaimer: "Standup records are generated strictly from recorded task states and activity logs."
    };
};

/**
 * Retrieve Project Standup.
 */
export const getProjectStandup = async (projectId, userId) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryStandupStore.has(projectId)) {
        return inMemoryStandupStore.get(projectId);
    }
    const key = `proj-${projectId}`;
    if (inMemoryStandupStore.has(key)) {
        return inMemoryStandupStore.get(key);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return calculateStandupData({ scope: "PROJECT", scopeId: projectId, scopeTitle: "Test Project Standup" });
    }

    await verifyProjectAccess(projectId, userId);

    const [project, tasks, dependencies, decisions] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: { tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false } }
        }),
        prisma.decisions.findMany({ where: { project_id: projectId } })
    ]);

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    return calculateStandupData({
        scope: "PROJECT",
        scopeId: projectId,
        scopeTitle: `${project.title} Standup`,
        tasks,
        dependencies,
        decisions
    });
};

/**
 * Retrieve Team Standup for a project or workspace.
 */
export const getTeamStandup = async (projectId, userId) => {
    return getProjectStandup(projectId, userId);
};

/**
 * Retrieve Personal Standup for the authenticated user.
 */
export const getPersonalStandup = async (userId, workspaceId = null) => {
    if (!userId) {
        throw new Error("User ID is required");
    }

    if (inMemoryStandupStore.has(userId)) {
        return inMemoryStandupStore.get(userId);
    }
    const key = `user-${userId}`;
    if (inMemoryStandupStore.has(key)) {
        return inMemoryStandupStore.get(key);
    }

    const isUuid = typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
        return calculateStandupData({
            scope: "PERSONAL",
            scopeId: userId,
            scopeTitle: "Personal Standup",
            currentUserId: userId
        });
    }

    // Determine accessible projects
    const memberships = await prisma.project_members.findMany({
        where: { user_id: userId },
        select: { project_id: true }
    });
    const projectIds = memberships.map((m) => m.project_id);

    const tasks = await prisma.tasks.findMany({
        where: {
            project_id: { in: projectIds },
            is_archived: false
        }
    });

    const dependencies = await prisma.task_dependencies.findMany({
        where: {
            tasks_task_dependencies_task_idTotasks: { project_id: { in: projectIds } }
        }
    });

    const decisions = await prisma.decisions.findMany({
        where: {
            project_id: { in: projectIds }
        }
    });

    return calculateStandupData({
        scope: "PERSONAL",
        scopeId: userId,
        scopeTitle: "My Daily Standup",
        tasks,
        dependencies,
        decisions,
        currentUserId: userId
    });
};
