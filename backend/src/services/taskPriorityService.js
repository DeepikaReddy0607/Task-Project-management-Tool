import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";

// ============================================================
// CONSTANTS & THRESHOLDS
// ============================================================

export const PRIORITY_THRESHOLDS = {
    CRITICAL: 80,
    HIGH: 60,
    MEDIUM: 35,
    LOW: 0
};

export const READINESS_STATES = {
    READY: "READY",
    BLOCKED: "BLOCKED",
    COMPLETED: "COMPLETED",
    ARCHIVED: "ARCHIVED"
};

/**
 * Converts a numeric score into a human-readable priority level.
 * Deterministic thresholds:
 *   >= 80: CRITICAL
 *   >= 60: HIGH
 *   >= 35: MEDIUM
 *   < 35:  LOW
 */
export const determinePriorityLevel = (score) => {
    const num = Number(score) || 0;
    if (num >= PRIORITY_THRESHOLDS.CRITICAL) return "CRITICAL";
    if (num >= PRIORITY_THRESHOLDS.HIGH) return "HIGH";
    if (num >= PRIORITY_THRESHOLDS.MEDIUM) return "MEDIUM";
    return "LOW";
};

const formatDate = (date) => {
    if (!date) return "No deadline";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
};

// ============================================================
// CANONICAL SCORING ENGINE: calculateTaskPriorityScore
// ============================================================
/**
 * Calculates a multi-factor deterministic priority score for a task.
 * Factors:
 *   1. Overdue & Due Date Proximity (highest urgency)
 *   2. Priority Enum (Critical/High/Medium/Low)
 *   3. Actionable Status (In Progress/Review/To Do/Backlog)
 *   4. Dependency Impact (Downstream blockers weight)
 *   5. Readiness (Prerequisites unblocked bonus, or blocked penalty)
 *   6. Quick Win (Estimated hours modest bonus)
 *   7. Project Context (Approaching deadline / project priority)
 */
export const calculateTaskPriorityScore = (task, options = {}) => {
    const startOfToday = options.startOfToday || getStartOfTodayUtc();
    const projectId = options.projectId || null;

    if (!task) {
        return {
            score: 0,
            priorityScore: 0,
            priorityLevel: "LOW",
            readiness: READINESS_STATES.READY,
            isActionable: false,
            reasons: [],
            blockers: [],
            blockedBy: []
        };
    }

    // 1. Completed or Archived tasks are not actionable
    if (task.is_archived) {
        return {
            score: 0,
            priorityScore: 0,
            priorityLevel: "LOW",
            readiness: READINESS_STATES.ARCHIVED,
            isActionable: false,
            reasons: ["Task is archived"],
            blockers: [],
            blockedBy: []
        };
    }

    if (task.status === "Completed") {
        return {
            score: 0,
            priorityScore: 0,
            priorityLevel: "LOW",
            readiness: READINESS_STATES.COMPLETED,
            isActionable: false,
            reasons: ["Task is completed"],
            blockers: [],
            blockedBy: []
        };
    }

    let score = 0;
    const reasons = [];

    // ---------------------------------------------------------
    // A. Overdue & Due Date Factor (highest urgency)
    // ---------------------------------------------------------
    if (task.due_date) {
        const dueDate = new Date(task.due_date);
        if (dueDate < startOfToday) {
            const daysOverdue = Math.max(
                1,
                Math.round((startOfToday.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
            );
            // Overdue tasks receive high base urgency (50 base + 2 per day overdue, max 20)
            score += 50 + Math.min(daysOverdue * 2, 20);
            reasons.push(daysOverdue === 1 ? "1 day overdue" : `${daysOverdue} days overdue`);
        } else {
            const diffDays = Math.round((dueDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) {
                score += 35;
                reasons.push("Due today");
            } else if (diffDays === 1) {
                score += 25;
                reasons.push("Due tomorrow");
            } else if (diffDays <= 3) {
                score += 15;
                reasons.push(`Due in ${diffDays} days`);
            } else if (diffDays <= 7) {
                score += 8;
                reasons.push("Due this week");
            }
        }
    }

    // ---------------------------------------------------------
    // B. Priority Factor
    // ---------------------------------------------------------
    const priority = String(task.priority || "Medium").toLowerCase();
    if (priority === "critical" || priority === "high") {
        score += 30;
        reasons.push(priority === "critical" ? "Critical priority" : "High priority");
    } else if (priority === "medium") {
        score += 15;
        reasons.push("Medium priority");
    } else {
        score += 5;
        reasons.push("Low priority");
    }

    // ---------------------------------------------------------
    // C. Actionable Status Factor
    // ---------------------------------------------------------
    const status = String(task.status || "To Do");
    if (status === "In Progress") {
        score += 15;
        reasons.push("In progress");
    } else if (status === "Review") {
        score += 12;
        reasons.push("In review");
    } else if (status === "To Do") {
        score += 8;
        reasons.push("Ready to start");
    } else if (status === "Backlog") {
        score += 2;
    }

    // ---------------------------------------------------------
    // D. Dependency Impact (Downstream tasks this task blocks)
    // ---------------------------------------------------------
    const downstream = task.task_dependencies_task_dependencies_depends_on_task_idTotasks || [];
    const activeBlocking = downstream.filter((d) => {
        const target = d.tasks_task_dependencies_task_idTotasks;
        return target && !target.is_archived && target.status !== "Completed";
    });

    const blockers = activeBlocking.map((d) => ({
        id: d.tasks_task_dependencies_task_idTotasks.id,
        title: d.tasks_task_dependencies_task_idTotasks.title,
        status: d.tasks_task_dependencies_task_idTotasks.status,
        priority: d.tasks_task_dependencies_task_idTotasks.priority
    }));

    if (activeBlocking.length > 0) {
        score += Math.min(activeBlocking.length * 10, 25);
        reasons.push(`Blocking ${activeBlocking.length} downstream task${activeBlocking.length > 1 ? "s" : ""}`);
    }

    // ---------------------------------------------------------
    // E. Readiness & Upstream Prerequisites
    // ---------------------------------------------------------
    const upstream = task.task_dependencies_task_dependencies_task_idTotasks || [];
    const activePrereqs = upstream.filter((d) => {
        const prereq = d.tasks_task_dependencies_depends_on_task_idTotasks;
        return prereq && !prereq.is_archived && prereq.status !== "Completed";
    });

    const blockedBy = activePrereqs.map((d) => ({
        id: d.tasks_task_dependencies_depends_on_task_idTotasks.id,
        title: d.tasks_task_dependencies_depends_on_task_idTotasks.title,
        status: d.tasks_task_dependencies_depends_on_task_idTotasks.status,
        priority: d.tasks_task_dependencies_depends_on_task_idTotasks.priority,
        dueDate: d.tasks_task_dependencies_depends_on_task_idTotasks.due_date
    }));

    let readiness = READINESS_STATES.READY;
    let isActionable = true;

    if (activePrereqs.length > 0) {
        readiness = READINESS_STATES.BLOCKED;
        isActionable = false;
        score -= 20;
        reasons.push(`Blocked by ${activePrereqs.length} prerequisite task${activePrereqs.length > 1 ? "s" : ""}`);
    } else {
        score += 10;
        reasons.push("Unblocked and ready to start");
    }

    // ---------------------------------------------------------
    // F. Estimated Effort Factor (Quick Win)
    // ---------------------------------------------------------
    const hours = Number(task.estimated_hours || 0);
    if (hours > 0 && hours <= 2) {
        score += 8;
        reasons.push(`Quick win (~${hours}h)`);
    } else if (hours > 2 && hours <= 4) {
        score += 5;
        reasons.push(`Focus block (~${hours}h)`);
    } else if (hours > 4) {
        score += 2;
        reasons.push(`Substantial task (~${hours}h)`);
    }

    // ---------------------------------------------------------
    // G. Project Impact
    // ---------------------------------------------------------
    const project = task.projects;
    if (project) {
        if (project.end_date) {
            const projEnd = new Date(project.end_date);
            const projDays = Math.round((projEnd.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
            if (projDays >= 0 && projDays <= 3) {
                score += 12;
                reasons.push(projDays === 0 ? "Project deadline is today" : `Project deadline in ${projDays} day${projDays > 1 ? "s" : ""}`);
            } else if (projDays > 3 && projDays <= 7) {
                score += 8;
                reasons.push("Project deadline approaching");
            }
        }
        const projPrio = String(project.priority || "").toLowerCase();
        if (projPrio === "high" || projPrio === "critical") {
            score += 5;
            reasons.push("High-priority project");
        }
    }

    const finalScore = Math.max(0, score);
    const priorityLevel = determinePriorityLevel(finalScore);

    return {
        score: finalScore,
        priorityScore: finalScore,
        priorityLevel,
        readiness,
        isActionable,
        reasons,
        blockers,
        blockedBy
    };
};

/**
 * Backward-compatible alias for existing Focus Mode callers
 */
export const calculateFocusScore = calculateTaskPriorityScore;

// ============================================================
// CANONICAL PRIORITIZATION SERVICE: prioritizeTasks
// ============================================================
/**
 * Prioritizes tasks deterministically based on actual TaskFlow data.
 * @param {Object} params
 * @param {string} params.userId - Authenticated user ID
 * @param {string} [params.projectId] - Optional project ID filter
 * @param {string} [params.taskId] - Optional specific task ID
 * @param {string} [params.context="my-tasks"] - Context: "my-tasks" | "project" | "dashboard" | "calendar" | "task"
 * @param {number} [params.limit] - Max tasks to return
 */
export const prioritizeTasks = async ({
    userId,
    projectId = null,
    taskId = null,
    context = "my-tasks",
    limit = null
}) => {
    const startOfToday = getStartOfTodayUtc();
    const normalizedContext = String(context || "my-tasks").toLowerCase().trim();

    // 1. Verify project access if projectId is specified
    if (projectId) {
        const project = await prisma.projects.findUnique({
            where: { id: projectId }
        });
        if (!project) {
            const error = new Error("Project not found");
            error.statusCode = 404;
            throw error;
        }

        const membership = await prisma.workspace_members.findFirst({
            where: {
                workspace_id: project.workspace_id,
                user_id: userId
            }
        });
        if (!membership) {
            const error = new Error("Project access denied");
            error.statusCode = 403;
            throw error;
        }
    }

    // 2. Resolve accessible workspace IDs for user
    const userMemberships = await prisma.workspace_members.findMany({
        where: { user_id: userId },
        select: { workspace_id: true }
    });
    const accessibleWorkspaceIds = userMemberships.map((m) => m.workspace_id);

    // 3. Common relation includes
    const taskInclude = {
        projects: {
            select: {
                id: true,
                title: true,
                status: true,
                end_date: true,
                priority: true,
                workspace_id: true
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
        task_dependencies_task_dependencies_depends_on_task_idTotasks: {
            include: {
                tasks_task_dependencies_task_idTotasks: {
                    select: { id: true, title: true, status: true, is_archived: true, priority: true }
                }
            }
        },
        task_dependencies_task_dependencies_task_idTotasks: {
            include: {
                tasks_task_dependencies_depends_on_task_idTotasks: {
                    select: { id: true, title: true, status: true, is_archived: true, priority: true, due_date: true }
                }
            }
        }
    };

    let candidateTasks = [];

    // ---------------------------------------------------------
    // Context-specific task retrieval
    // ---------------------------------------------------------
    if (taskId || normalizedContext === "task") {
        const targetTaskId = taskId;
        if (!targetTaskId) {
            return {
                success: true,
                context: "task",
                total: 0,
                tasks: []
            };
        }

        const task = await prisma.tasks.findUnique({
            where: { id: targetTaskId },
            include: taskInclude
        });

        if (!task) {
            const error = new Error("Task not found");
            error.statusCode = 404;
            throw error;
        }

        // Verify workspace access for this task's project
        if (task.projects) {
            const membership = await prisma.workspace_members.findFirst({
                where: {
                    workspace_id: task.projects.workspace_id,
                    user_id: userId
                }
            });
            if (!membership) {
                const error = new Error("Task access denied");
                error.statusCode = 403;
                throw error;
            }
        }

        candidateTasks = [task];
    } else if (projectId || normalizedContext === "project") {
        // Project context: all active tasks in the project
        candidateTasks = await prisma.tasks.findMany({
            where: {
                project_id: projectId,
                is_archived: false,
                status: { not: "Completed" }
            },
            include: taskInclude
        });
    } else if (normalizedContext === "calendar") {
        // Calendar context: active tasks with due date assigned to user
        candidateTasks = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                due_date: { not: null },
                projects: {
                    workspace_id: { in: accessibleWorkspaceIds },
                    is_archived: false
                }
            },
            include: taskInclude
        });
    } else if (normalizedContext === "dashboard") {
        // Dashboard context: actionable workload across accessible projects
        candidateTasks = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                projects: {
                    workspace_id: { in: accessibleWorkspaceIds },
                    is_archived: false
                }
            },
            include: taskInclude
        });
    } else {
        // Default: My Tasks context (strictly assigned to user)
        const whereClause = {
            assigned_to: userId,
            is_archived: false,
            status: { not: "Completed" }
        };
        if (projectId) {
            whereClause.project_id = projectId;
        }

        candidateTasks = await prisma.tasks.findMany({
            where: whereClause,
            include: taskInclude
        });
    }

    // 4. Handle empty state
    if (candidateTasks.length === 0) {
        return {
            success: true,
            context: normalizedContext,
            total: 0,
            tasks: []
        };
    }

    // 5. Score, sort, and rank candidate tasks using pure in-memory engine
    const rankedTasks = scoreAndRankTasksInMemory(candidateTasks, { startOfToday, projectId, limit });

    return {
        success: true,
        context: normalizedContext,
        total: candidateTasks.length,
        tasks: rankedTasks
    };
};

/**
 * Pure in-memory scoring and ranking engine.
 * Computes priority scores and ranks tasks deterministically.
 * Used by prioritizeTasks and What-If simulation.
 */
export const scoreAndRankTasksInMemory = (candidateTasks = [], options = {}) => {
    const startOfToday = options.startOfToday || getStartOfTodayUtc();
    const projectId = options.projectId || null;
    const limit = options.limit || null;

    if (!candidateTasks || candidateTasks.length === 0) {
        return [];
    }

    const scoredTasks = candidateTasks.map((t) => {
        const analysis = calculateTaskPriorityScore(t, { startOfToday, projectId });
        const assignee = t.users_tasks_assigned_toTousers;
        const isOverdue = t.due_date ? new Date(t.due_date) < startOfToday : false;

        return {
            taskId: t.id,
            id: t.id,
            title: t.title,
            priorityScore: analysis.priorityScore,
            score: analysis.score,
            priorityLevel: analysis.priorityLevel,
            readiness: analysis.readiness,
            isActionable: analysis.isActionable,
            isOverdue,
            reasons: analysis.reasons,
            blockers: analysis.blockers,
            blockedBy: analysis.blockedBy,
            dueDate: t.due_date ? (t.due_date instanceof Date ? t.due_date.toISOString().slice(0, 10) : String(t.due_date).slice(0, 10)) : null,
            dueDateFormatted: formatDate(t.due_date),
            estimatedHours: t.estimated_hours ? Number(t.estimated_hours) : null,
            priority: t.priority,
            status: t.status,
            createdAt: t.created_at,
            project: t.projects ? {
                id: t.projects.id,
                title: t.projects.title,
                status: t.projects.status,
                priority: t.projects.priority
            } : null,
            assignee: assignee ? {
                id: assignee.id,
                name: `${assignee.first_name || ""} ${assignee.last_name || ""}`.trim() || assignee.email,
                email: assignee.email
            } : null
        };
    });

    // ---------------------------------------------------------
    // Deterministic Sorting & Tie-Breakers (Section 15)
    // ---------------------------------------------------------
    const prioRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };

    scoredTasks.sort((a, b) => {
        // Tie-breaker 0: READY tasks outrank BLOCKED tasks if both are non-zero
        if (a.readiness === READINESS_STATES.READY && b.readiness === READINESS_STATES.BLOCKED) return -1;
        if (a.readiness === READINESS_STATES.BLOCKED && b.readiness === READINESS_STATES.READY) return 1;

        // Tie-breaker 1: Priority score descending
        if (b.priorityScore !== a.priorityScore) {
            return b.priorityScore - a.priorityScore;
        }

        // Tie-breaker 2: Overdue status (overdue first)
        const aOverdue = a.isOverdue ? 1 : 0;
        const bOverdue = b.isOverdue ? 1 : 0;
        if (bOverdue !== aOverdue) {
            return bOverdue - aOverdue;
        }

        // Tie-breaker 3: Due date ascending (earliest deadline first, no due date last)
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (aDue !== bDue) {
            return aDue - bDue;
        }

        // Tie-breaker 4: Task priority rank (Critical > High > Medium > Low)
        const aPrio = prioRank[a.priority] || 2;
        const bPrio = prioRank[b.priority] || 2;
        if (bPrio !== aPrio) {
            return bPrio - aPrio;
        }

        // Tie-breaker 5: Created date ascending (older tasks first)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Assign 1-based rank
    const rankedTasks = scoredTasks.map((t, idx) => ({
        ...t,
        rank: idx + 1
    }));

    return (limit && limit > 0) ? rankedTasks.slice(0, limit) : rankedTasks;
};


// ============================================================
// FORMATTER FOR QUACKIE CHAT & ASSISTANT
// ============================================================
export const formatTaskPriorityReply = (prioritizationResult, note = "") => {
    const tasks = prioritizationResult?.tasks || [];

    if (tasks.length === 0) {
        return "🦆 **Priority Recommendation**\n\nYou're all caught up! There are no active tasks requiring your attention right now.";
    }

    let reply = `🦆 **Priority Recommendation**\n\n`;
    if (note) {
        reply += `${note}\n\n`;
    }

    const displayTasks = tasks.slice(0, 5);

    displayTasks.forEach((t, i) => {
        const rankNum = i + 1;
        const proj = t.project?.title ? ` [${t.project.title}]` : "";
        reply += `${rankNum}. **${t.title}** — **${t.priorityScore}** (${t.priorityLevel})${proj}\n`;

        if (t.readiness === READINESS_STATES.BLOCKED && t.blockedBy && t.blockedBy.length > 0) {
            reply += `   • ⚠️ **Status: BLOCKED** by ${t.blockedBy.map((b) => `"${b.title}"`).join(", ")}\n`;
        }

        if (t.reasons && t.reasons.length > 0) {
            t.reasons.slice(0, 3).forEach((r) => {
                reply += `   • ${r}\n`;
            });
        }
        reply += `\n`;
    });

    if (tasks.length > 5) {
        reply += `*...and ${tasks.length - 5} more prioritized tasks in your queue.*`;
    }

    return reply.trim();
};

/**
 * Quackie chat assistant helper
 */
export const getQuackiePrioritizedTasks = async ({ userId, projectId = null, taskId = null, context = "my-tasks", limit = 5 }) => {
    const result = await prioritizeTasks({ userId, projectId, taskId, context, limit });
    const message = formatTaskPriorityReply(result);

    let emotion = "happy";
    if (result.tasks.length > 0) {
        const top = result.tasks[0];
        if (top.isOverdue || top.priorityLevel === "CRITICAL") {
            emotion = "worried";
        } else if (top.priorityLevel === "HIGH") {
            emotion = "thinking";
        }
    }

    return {
        ...result,
        message,
        emotion
    };
};
