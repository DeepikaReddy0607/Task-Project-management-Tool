import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { analyzeProjectRisk } from "./projectRiskService.js";
import { prioritizeTasks } from "./taskPriorityService.js";
import { emitRealtimeEvent } from "../socket.js";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================
export const ALERT_TYPES = Object.freeze({
    TASK_OVERDUE: "TASK_OVERDUE",
    TASK_BLOCKED: "TASK_BLOCKED",
    HIGH_RISK_PROJECT: "HIGH_RISK_PROJECT",
    DEADLINE_WARNING: "DEADLINE_WARNING",
    PRIORITY_SHIFT: "PRIORITY_SHIFT",
    NEW_CRITICAL_TASK: "NEW_CRITICAL_TASK",
    CRITICAL_PATH_CHANGED: "CRITICAL_PATH_CHANGED",
    CRITICAL_TASK_OVERDUE: "CRITICAL_TASK_OVERDUE",
    BOTTLENECK_ESCALATED: "BOTTLENECK_ESCALATED",
    NEW_MAJOR_BOTTLENECK: "NEW_MAJOR_BOTTLENECK",
    PROJECT_DURATION_INCREASED: "PROJECT_DURATION_INCREASED",
    CYCLE_DETECTED: "CYCLE_DETECTED"
});

export const ALERT_SEVERITY = Object.freeze({
    INFO: "INFO",
    WARNING: "WARNING",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
});

// Priority ranking order for alerts
export const SEVERITY_WEIGHT = Object.freeze({
    CRITICAL: 4,
    HIGH: 3,
    WARNING: 2,
    INFO: 1
});

// Risk tier hierarchy for transitions
const RISK_LEVEL_ORDER = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4
};

// Helper: Format date for dedupe keys (YYYY-MM-DD)
const formatDateKey = (date) => {
    if (!date) return "nodate";
    return new Date(date).toISOString().slice(0, 10);
};

// ============================================================
// CORE ALERT CREATION & DEDUPLICATION ENGINE
// ============================================================
/**
 * Persists an alert with strict deduplication and emits a real-time event.
 * Follows persistence-first architecture.
 */
export const createProactiveAlert = async ({
    userId,
    type,
    severity = ALERT_SEVERITY.INFO,
    title,
    message,
    projectId = null,
    taskId = null,
    dedupeKey,
    actionable = true
}) => {
    if (!userId || !type || !message || !dedupeKey) {
        throw new Error("Missing required fields for proactive alert creation");
    }

    // 1. Deduplication check: Has this alert already been emitted for this user?
    const existing = await prisma.notifications.findFirst({
        where: {
            user_id: userId,
            dedupe_key: dedupeKey
        }
    });

    if (existing) {
        return null; // Already emitted - skip to prevent duplicate spam
    }

    // 2. Database Persistence with atomic concurrency protection
    let notif = null;
    try {
        notif = await prisma.notifications.create({
            data: {
                user_id: userId,
                type,
                severity,
                title: title || type,
                message,
                project_id: projectId,
                task_id: taskId,
                dedupe_key: dedupeKey,
                is_read: false
            }
        });
    } catch (createErr) {
        // If unique constraint violation on (user_id, dedupe_key), return null
        if (
            createErr.code === "P2002" ||
            createErr.message?.includes("Unique constraint") ||
            createErr.message?.includes("idx_notifications_dedupe_unique") ||
            createErr.message?.includes("duplicate key")
        ) {
            return null;
        }
        throw createErr;
    }

    const structuredAlert = {
        id: notif.id,
        type: notif.type,
        severity: notif.severity,
        title: notif.title,
        message: notif.message,
        projectId: notif.project_id,
        taskId: notif.task_id,
        createdAt: notif.created_at,
        actionable,
        dedupeKey: notif.dedupe_key
    };

    // 3. Socket.IO Delivery: Emit notification.created to user:{userId} room
    try {
        emitRealtimeEvent({
            type: "notification.created",
            userId,
            data: {
                notification: structuredAlert
            }
        });
    } catch (err) {
        console.warn("Socket notification emit error (non-fatal):", err.message);
    }

    return structuredAlert;
};

// ============================================================
// SPECIFIC ALERT DETECTORS
// ============================================================

/**
 * A. TASK_OVERDUE
 * Trigger when task was not overdue and becomes overdue.
 */
export const checkTaskOverdueAlert = async ({ task, previousState = null }) => {
    if (!task) return null;

    const startOfToday = getStartOfTodayUtc();
    const isOverdue =
        task.due_date &&
        new Date(task.due_date) < startOfToday &&
        task.status !== "Completed" &&
        !task.is_archived;

    if (!isOverdue) return null;

    // Check if task was already overdue in previous state
    if (previousState && previousState.isOverdue === true) {
        return null;
    }

    const recipientUserId = task.assigned_to;
    if (!recipientUserId) return null;

    const dedupeKey = `task-overdue:${task.id}:${formatDateKey(task.due_date)}`;

    return await createProactiveAlert({
        userId: recipientUserId,
        type: ALERT_TYPES.TASK_OVERDUE,
        severity: ALERT_SEVERITY.WARNING,
        title: "Task Overdue",
        message: `${task.title} is now overdue.`,
        projectId: task.project_id,
        taskId: task.id,
        dedupeKey,
        actionable: true
    });
};

/**
 * B. TASK_BLOCKED
 * Trigger when task becomes blocked by an incomplete prerequisite.
 */
export const checkTaskBlockedAlert = async ({ taskId, previousState = null }) => {
    if (!taskId) return null;

    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            task_dependencies_task_dependencies_task_idTotasks: {
                include: {
                    tasks_task_dependencies_depends_on_task_idTotasks: {
                        select: { id: true, title: true, status: true }
                    }
                }
            }
        }
    });

    if (!task || task.status === "Completed" || task.is_archived || !task.assigned_to) {
        return null;
    }

    // Find any incomplete prerequisite tasks
    const blockingDeps = (task.task_dependencies_task_dependencies_task_idTotasks || [])
        .map((d) => d.tasks_task_dependencies_depends_on_task_idTotasks)
        .filter((prereq) => prereq && prereq.status !== "Completed");

    if (blockingDeps.length === 0) {
        return null;
    }

    const alerts = [];
    for (const blocker of blockingDeps) {
        const dedupeKey = `task-blocked:${task.id}:${blocker.id}`;
        const alert = await createProactiveAlert({
            userId: task.assigned_to,
            type: ALERT_TYPES.TASK_BLOCKED,
            severity: ALERT_SEVERITY.HIGH,
            title: "Task Blocked",
            message: `${task.title} is blocked by ${blocker.title}.`,
            projectId: task.project_id,
            taskId: task.id,
            dedupeKey,
            actionable: true
        });

        if (alert) alerts.push(alert);
    }

    return alerts.length > 0 ? alerts[0] : null;
};

/**
 * C. HIGH_RISK_PROJECT
 * Trigger when project risk crosses into a materially concerning tier transition:
 * LOW -> MEDIUM, MEDIUM -> HIGH, HIGH -> CRITICAL.
 * Does NOT spam on minor score shifts like 62 -> 63.
 */
export const checkProjectRiskAlert = async ({
    projectId,
    previousRiskLevel = null,
    currentRiskLevel = null,
    riskScore = null,
    userId = null
}) => {
    if (!projectId) return null;

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { id: true, title: true, manager_id: true, workspace_id: true }
    });

    if (!project) return null;

    let computedRiskLevel = currentRiskLevel;
    let computedRiskScore = riskScore;

    if (!computedRiskLevel || computedRiskScore === null) {
        const riskAnalysis = await analyzeProjectRisk(projectId, project.manager_id);
        computedRiskLevel = riskAnalysis.riskLevel;
        computedRiskScore = riskAnalysis.riskScore;
    }

    // Material transition check:
    // Only alert when transitioning upward between levels (e.g. LOW -> MEDIUM, MEDIUM -> HIGH, HIGH -> CRITICAL)
    const prevRank = previousRiskLevel ? (RISK_LEVEL_ORDER[previousRiskLevel] || 0) : 0;
    const currRank = RISK_LEVEL_ORDER[computedRiskLevel] || 0;

    const isMaterialTransition = previousRiskLevel
        ? currRank > prevRank && currRank >= 2
        : currRank >= 2; // If no previous state provided, alert if at least MEDIUM

    if (!isMaterialTransition) {
        return null;
    }

    const prevLevelLabel = previousRiskLevel || "PREVIOUS";
    const dedupeKey = `risk-transition:${projectId}:${prevLevelLabel}:${computedRiskLevel}`;

    const severity =
        computedRiskLevel === "CRITICAL"
            ? ALERT_SEVERITY.CRITICAL
            : ALERT_SEVERITY.HIGH;

    // Notify project manager and active contributors
    const recipients = new Set([project.manager_id]);
    if (userId) recipients.add(userId);

    const projectMembers = await prisma.project_members.findMany({
        where: { project_id: projectId },
        select: { user_id: true }
    });
    projectMembers.forEach((m) => recipients.add(m.user_id));

    let primaryAlert = null;
    for (const recipientId of recipients) {
        const alert = await createProactiveAlert({
            userId: recipientId,
            type: ALERT_TYPES.HIGH_RISK_PROJECT,
            severity,
            title: "Project Risk Increased",
            message: `${project.title} is now ${computedRiskLevel} RISK (${computedRiskScore}/100).`,
            projectId: project.id,
            dedupeKey: `${dedupeKey}:${recipientId}`,
            actionable: true
        });
        if (alert && !primaryAlert) {
            primaryAlert = alert;
        }
    }

    return primaryAlert;
};

/**
 * D. DEADLINE_WARNING
 * Trigger when project approaches meaningful deadline thresholds: 7 days, 3 days, 1 day.
 * Only generated once per threshold/deadline. Resets if deadline changes.
 */
export const checkProjectDeadlineAlert = async ({ projectId, userId = null }) => {
    if (!projectId) return null;

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        select: {
            id: true,
            title: true,
            end_date: true,
            manager_id: true,
            status: true,
            is_archived: false,
            tasks: {
                where: { is_archived: false, status: { not: "Completed" } },
                select: { id: true }
            }
        }
    });

    if (!project || !project.end_date || project.is_archived || project.status === "Completed") {
        return null;
    }

    const startOfToday = getStartOfTodayUtc();
    const endDateTime = new Date(project.end_date).getTime();
    const diffDays = Math.ceil((endDateTime - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null; // Deadline passed

    let threshold = null;
    let severity = ALERT_SEVERITY.INFO;

    if (diffDays <= 1) {
        threshold = 1;
        severity = ALERT_SEVERITY.HIGH;
    } else if (diffDays <= 3) {
        threshold = 3;
        severity = ALERT_SEVERITY.WARNING;
    } else if (diffDays <= 7) {
        threshold = 7;
        severity = ALERT_SEVERITY.INFO;
    } else {
        return null; // More than 7 days out
    }

    const dateKey = formatDateKey(project.end_date);
    const activeTasksCount = project.tasks?.length || 0;
    const taskSuffix = activeTasksCount > 0 ? ` with ${activeTasksCount} active task${activeTasksCount > 1 ? "s" : ""}` : "";
    const message = `${project.title} has ${diffDays} day${diffDays === 1 ? "" : "s"} remaining${taskSuffix}.`;

    const recipients = new Set([project.manager_id]);
    if (userId) recipients.add(userId);

    let primaryAlert = null;
    for (const recipientId of recipients) {
        const dedupeKey = `deadline:${project.id}:${dateKey}:${threshold}:${recipientId}`;
        const alert = await createProactiveAlert({
            userId: recipientId,
            type: ALERT_TYPES.DEADLINE_WARNING,
            severity,
            title: "Deadline Warning",
            message,
            projectId: project.id,
            dedupeKey,
            actionable: true
        });
        if (alert && !primaryAlert) {
            primaryAlert = alert;
        }
    }

    return primaryAlert;
};

/**
 * E. PRIORITY_SHIFT
 * Trigger when a task enters rank #1 from a lower position or newly becomes #1 actionable task.
 */
export const checkPriorityShiftAlert = async ({ userId, previousTopTaskId = null }) => {
    if (!userId) return null;

    const prioritized = await prioritizeTasks({
        userId,
        context: "my-tasks",
        limit: 5
    });

    const actionableTasks = (prioritized.tasks || []).filter((t) => t.isActionable);
    if (actionableTasks.length === 0) return null;

    const currentTop = actionableTasks[0];

    // If top task is unchanged, no alert
    if (previousTopTaskId && currentTop.id === previousTopTaskId) {
        return null;
    }

    const dedupeKey = `priority-shift:${userId}:${currentTop.id}`;

    return await createProactiveAlert({
        userId,
        type: ALERT_TYPES.PRIORITY_SHIFT,
        severity: currentTop.priorityLevel === "CRITICAL" ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.INFO,
        title: "Priority Shift",
        message: `${currentTop.title} is now your highest-priority task.`,
        projectId: currentTop.project?.id || null,
        taskId: currentTop.id,
        dedupeKey,
        actionable: true
    });
};

/**
 * F. NEW_CRITICAL_TASK
 * Trigger when a newly created or assigned task has High or Critical priority and is assigned to user.
 */
export const checkTaskAssignmentAlert = async ({ task }) => {
    if (!task || !task.assigned_to) return null;

    const priorityNorm = String(task.priority || "").toLowerCase();
    const isCriticalOrHigh = priorityNorm === "high" || priorityNorm === "critical" || priorityNorm === "urgent";

    if (!isCriticalOrHigh) return null;

    const dedupeKey = `new-critical-task:${task.id}`;

    return await createProactiveAlert({
        userId: task.assigned_to,
        type: ALERT_TYPES.NEW_CRITICAL_TASK,
        severity: ALERT_SEVERITY.INFO,
        title: "High-Priority Task Assigned",
        message: `${task.title} was assigned to you with ${task.priority} priority.`,
        projectId: task.project_id || null,
        taskId: task.id,
        dedupeKey,
        actionable: true
    });
};

// ============================================================
// UNIFIED DETECT PROACTIVE ALERTS
// ============================================================
/**
 * Detects and dispatches proactive alerts deterministically based on event, state change, or inspection.
 */
export const detectProactiveAlerts = async ({
    userId,
    event = null,
    previousState = null,
    currentState = null
}) => {
    const alerts = [];

    try {
        // 1. New Critical/High Task Assignment
        if (
            (event === "task.created" || event === "task.assigned" || !event) &&
            currentState?.task
        ) {
            const assignAlert = await checkTaskAssignmentAlert({
                task: currentState.task
            });
            if (assignAlert) alerts.push(assignAlert);
        }

        // 2. Task Overdue
        if (currentState?.task) {
            const overdueAlert = await checkTaskOverdueAlert({
                task: currentState.task,
                previousState
            });
            if (overdueAlert) alerts.push(overdueAlert);
        }

        // 3. Task Blocked
        if (currentState?.taskId || currentState?.task?.id) {
            const taskId = currentState.taskId || currentState.task.id;
            const blockedAlert = await checkTaskBlockedAlert({
                taskId,
                previousState
            });
            if (blockedAlert) alerts.push(blockedAlert);
        }

        // 4. Project Risk Transition
        if (currentState?.projectId || currentState?.project?.id) {
            const projectId = currentState.projectId || currentState.project.id;
            const riskAlert = await checkProjectRiskAlert({
                projectId,
                previousRiskLevel: previousState?.riskLevel,
                currentRiskLevel: currentState?.riskLevel,
                riskScore: currentState?.riskScore,
                userId
            });
            if (riskAlert) alerts.push(riskAlert);
        }

        // 5. Project Deadline Warning
        if (currentState?.projectId || currentState?.project?.id) {
            const projectId = currentState.projectId || currentState.project.id;
            const deadlineAlert = await checkProjectDeadlineAlert({
                projectId,
                userId
            });
            if (deadlineAlert) alerts.push(deadlineAlert);
        }

        // 6. Priority Shift (User's #1 Actionable Task Changed)
        if (userId && (event?.startsWith("task.") || !event)) {
            const prioAlert = await checkPriorityShiftAlert({
                userId,
                previousTopTaskId: previousState?.topTaskId
            });
            if (prioAlert) alerts.push(prioAlert);
        }
    } catch (err) {
        console.error("detectProactiveAlerts execution error:", err);
    }

    return alerts;
};

// ============================================================
// NOTIFICATION QUERIES & MUTATIONS (USER ISOLATED)
// ============================================================

/**
 * Fetch notifications for a user with unread counts and pagination.
 */
export const getUserNotifications = async ({
    userId,
    page = 1,
    limit = 20,
    unreadOnly = false
}) => {
    if (!userId) throw new Error("userId is required");

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {
        user_id: userId,
        ...(unreadOnly ? { is_read: false } : {})
    };

    const [items, total, unreadCount] = await Promise.all([
        prisma.notifications.findMany({
            where,
            orderBy: [{ created_at: "desc" }],
            skip,
            take: limitNum,
            include: {
                projects: { select: { id: true, title: true } },
                tasks: { select: { id: true, title: true, priority: true, status: true } }
            }
        }),
        prisma.notifications.count({ where }),
        prisma.notifications.count({
            where: { user_id: userId, is_read: false }
        })
    ]);

    const notifications = items.map((n) => ({
        id: n.id,
        type: n.type,
        severity: n.severity || "INFO",
        title: n.title || n.type,
        message: n.message,
        projectId: n.project_id,
        projectTitle: n.projects?.title || null,
        taskId: n.task_id,
        taskTitle: n.tasks?.title || null,
        isRead: n.is_read,
        dedupeKey: n.dedupe_key,
        createdAt: n.created_at
    }));

    return {
        success: true,
        notifications,
        total,
        unreadCount,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1
    };
};

/**
 * Mark a single notification as read (with user isolation).
 */
export const markNotificationAsRead = async ({ notificationId, userId }) => {
    if (!notificationId || !userId) {
        throw new Error("notificationId and userId are required");
    }

    const notification = await prisma.notifications.findFirst({
        where: { id: notificationId, user_id: userId }
    });

    if (!notification) {
        throw new Error("Notification not found or access denied");
    }

    const updated = await prisma.notifications.update({
        where: { id: notificationId },
        data: { is_read: true }
    });

    const unreadCount = await prisma.notifications.count({
        where: { user_id: userId, is_read: false }
    });

    return {
        success: true,
        notification: {
            id: updated.id,
            isRead: updated.is_read
        },
        unreadCount
    };
};

/**
 * Mark all notifications as read for a user.
 */
export const markAllNotificationsAsRead = async ({ userId }) => {
    if (!userId) throw new Error("userId is required");

    const result = await prisma.notifications.updateMany({
        where: { user_id: userId, is_read: false },
        data: { is_read: true }
    });

    return {
        success: true,
        count: result.count,
        unreadCount: 0
    };
};

/**
 * Event-driven alert processor:
 * Asynchronously processes Socket.IO / mutation event payloads to detect meaningful alerts.
 */
export const processEventForAlerts = async (eventPayload) => {
    if (!eventPayload || !eventPayload.type) return;
    const { type, projectId, taskId, userId, data, changes } = eventPayload;

    // Prevent recursive alert generation
    if (type === "notification.created") return;

    try {
        if (type === "task.created") {
            const task = data?.task || (taskId ? await prisma.tasks.findUnique({ where: { id: taskId } }) : null);
            if (task) {
                await checkTaskAssignmentAlert({ task });
                await checkTaskOverdueAlert({ task });
                await checkTaskBlockedAlert({ taskId: task.id });
                if (task.assigned_to) {
                    await checkPriorityShiftAlert({ userId: task.assigned_to });
                }
            }
        } else if (type === "task.assigned") {
            const task = data?.task || (taskId ? await prisma.tasks.findUnique({ where: { id: taskId } }) : null);
            if (task) {
                await checkTaskAssignmentAlert({ task });
                if (task.assigned_to) {
                    await checkPriorityShiftAlert({ userId: task.assigned_to });
                }
            }
        } else if (type === "task.status_changed" || type === "task.updated") {
            const task = data?.task || (taskId ? await prisma.tasks.findUnique({ where: { id: taskId } }) : null);
            if (task) {
                await checkTaskOverdueAlert({ task });
                await checkTaskBlockedAlert({ taskId: task.id });
                if (task.assigned_to) {
                    await checkPriorityShiftAlert({ userId: task.assigned_to });
                }
            }
        } else if (type === "project.updated") {
            const pid = projectId || data?.project?.id;
            if (pid) {
                await checkProjectDeadlineAlert({ projectId: pid, userId });
                await checkProjectRiskAlert({ projectId: pid, userId });
            }
        } else if (type.startsWith("risk.")) {
            const pid = projectId || data?.risk?.project_id;
            if (pid) {
                await checkProjectRiskAlert({ projectId: pid, userId });
            }
        }

        // Schedule debounced project intelligence evaluation (Phase 1C)
        let intelProjectId =
            projectId ||
            data?.projectId ||
            data?.project_id ||
            data?.project?.id ||
            data?.task?.project_id;
        if (!intelProjectId && (taskId || data?.taskId || data?.task_id)) {
            const tid = taskId || data?.taskId || data?.task_id;
            const t = await prisma.tasks.findUnique({
                where: { id: tid },
                select: { project_id: true }
            });
            intelProjectId = t?.project_id;
        }
        if (
            intelProjectId &&
            (type.startsWith("task.") ||
             type.startsWith("dependency.") ||
             type === "project.updated")
        ) {
            const { scheduleProjectIntelligenceEvaluation } = await import("./intelligenceAlertService.js");
            scheduleProjectIntelligenceEvaluation({ projectId: intelProjectId });
        }
    } catch (err) {
        console.warn("processEventForAlerts error (non-fatal):", err.message);
    }
};

