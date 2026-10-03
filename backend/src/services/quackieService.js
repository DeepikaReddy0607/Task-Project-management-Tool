import prisma from "../config/prisma.js";
import { callLlmProvider } from "./quackieProvider.js";
import {
    getStartOfTodayUtc,
    getOverdueFilter,
    getUserOverdueCount,
    getUserOverdueTasks,
    createTask
} from "./taskService.js";
import { emitRealtimeEvent } from "../socket.js";
import { analyzeProjectRisk } from "./projectRiskService.js";
import { getProjectXRay } from "./projectXRayService.js";
import {
    calculateTaskPriorityScore,
    prioritizeTasks,
    formatTaskPriorityReply,
    getQuackiePrioritizedTasks,
    calculateFocusScore
} from "./taskPriorityService.js";
import { simulateWhatIf, parseWhatIfQuery, findAccessibleTaskByTitle } from "./whatIfService.js";
import { getProjectCriticalPath } from "./criticalPathService.js";
import { getProjectBottlenecks } from "./bottleneckService.js";

export { calculateFocusScore, simulateWhatIf, parseWhatIfQuery, findAccessibleTaskByTitle, getProjectCriticalPath, getProjectBottlenecks };

// Helper: Format Date nicely
const formatDate = (date) => {
    if (!date) return "No due date";
    const d = new Date(date);
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(d);
};

// Helper: Start of today in UTC for clean overdue check (matches YYYY-MM-DD in DB and frontend)
export const getStartOfToday = () => getStartOfTodayUtc();

// Helper: Get user's accessible projects
export const getUserAccessibleProjects = async (userId) => {
    // 1. Projects where user is a workspace member
    const memberships = await prisma.workspace_members.findMany({
        where: { user_id: userId },
        select: { workspace_id: true }
    });
    const workspaceIds = memberships.map((m) => m.workspace_id);

    // 2. Fetch projects
    const projects = await prisma.projects.findMany({
        where: {
            workspace_id: { in: workspaceIds },
            is_archived: false
        },
        select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            status: true,
            start_date: true,
            end_date: true,
            workspace_id: true,
            manager_id: true
        },
        orderBy: { created_at: "desc" }
    });

    return projects;
};

// ============================================================
// 1. SHOW MY OVERDUE WORK
// ============================================================
export const getOverdueTasks = async ({ userId, projectId = null }) => {
    const rawTasks = await getUserOverdueTasks(userId, projectId);
    const startOfToday = getStartOfToday();

    const tasks = rawTasks.map((task) => {
        const dueDate = new Date(task.due_date);
        const diffMs = startOfToday.getTime() - dueDate.getTime();
        const daysOverdue = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

        return {
            id: task.id,
            title: task.title,
            projectId: task.project_id,
            projectTitle: task.projects?.title || "Unknown Project",
            priority: task.priority || "Medium",
            status: task.status,
            dueDate: task.due_date,
            dueDateFormatted: formatDate(task.due_date),
            daysOverdue
        };
    });

    const totalOverdue = tasks.length;
    let message = "";
    let emotion = "happy";

    if (totalOverdue === 0) {
        message = projectId
            ? "🦆 Great news! There are no overdue tasks in this project."
            : "🦆 Great news! You have no overdue tasks. Everything is on schedule!";
        emotion = "excited";
    } else {
        emotion = "worried";
        message = `🦆 You have ${totalOverdue} overdue task${totalOverdue > 1 ? "s" : ""}.\n\nOverdue:\n`;
        tasks.forEach((t, i) => {
            message += `${i + 1}. **${t.title}**\n   ${t.priority} · due ${t.dueDateFormatted} (${t.daysOverdue} day${t.daysOverdue > 1 ? "s" : ""} overdue)\n   Project: ${t.projectTitle} · Status: ${t.status}\n\n`;
        });
        message = message.trim();
    }

    return {
        totalOverdue,
        tasks,
        message,
        emotion
    };
};

// ============================================================
// 2. FOCUS MODE & RECOMMENDATION ENGINE
// ============================================================

/**
 * QUACKIE FOCUS MODE: Daily Mission / Smart Work Plan
 * Analyzes authenticated user's real TaskFlow data in current context
 * and returns top ~3 actionable tasks with focus recommendation.
 * READ-ONLY: Does not modify the database.
 */
export const getFocusDailyMission = async ({ userId, projectId = null, taskId = null, page = null }) => {
    const startOfToday = getStartOfToday();

    // Helper functions for formatting
    const formatDueInfo = (due_date) => {
        if (!due_date) return "No deadline";
        const dueDate = new Date(due_date);
        if (dueDate < startOfToday) {
            const daysOverdue = Math.max(
                1,
                Math.round((startOfToday.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
            );
            return `${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue`;
        }
        const diffDays = Math.round((dueDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Due today";
        if (diffDays === 1) return "Due tomorrow";
        return `Due ${formatDate(due_date)}`;
    };

    const getPriorityIcon = (priority) => {
        const p = String(priority || "Medium").toLowerCase();
        if (p === "critical" || p === "high") return "🔴";
        if (p === "medium") return "🟠";
        return "🟡";
    };

    // 1. Task Context: User is viewing a specific task
    if (taskId) {
        const task = await prisma.tasks.findUnique({
            where: { id: taskId },
            include: {
                projects: {
                    select: { id: true, title: true, status: true, end_date: true, priority: true }
                },
                subtasks: {
                    where: { status: { not: "Completed" } },
                    orderBy: [{ due_date: "asc" }, { created_at: "asc" }]
                },
                task_dependencies_task_dependencies_depends_on_task_idTotasks: {
                    include: {
                        tasks_task_dependencies_task_idTotasks: {
                            select: { id: true, title: true, status: true, is_archived: true }
                        }
                    }
                },
                task_dependencies_task_dependencies_task_idTotasks: {
                    include: {
                        tasks_task_dependencies_depends_on_task_idTotasks: {
                            select: { id: true, title: true, status: true, is_archived: true }
                        }
                    }
                }
            }
        });

        if (task) {
            if (task.is_archived) {
                return {
                    topTask: null,
                    tasks: [],
                    message: `🦆 **"${task.title}" is archived.**\n\nThere are no active actions needed for this archived task.`,
                    emotion: "happy"
                };
            }
            if (task.status === "Completed") {
                return {
                    topTask: null,
                    tasks: [],
                    message: `🦆 **"${task.title}" is completed!** 🎉\n\nGreat job finishing this task. Switch back to **My Tasks** or your project dashboard for your next daily mission.`,
                    emotion: "excited"
                };
            }

            const { score, reasons } = calculateFocusScore(task, { startOfToday });
            const upstream = task.task_dependencies_task_dependencies_task_idTotasks || [];
            const activePrereqs = upstream.filter(
                (d) => d.tasks_task_dependencies_depends_on_task_idTotasks &&
                       !d.tasks_task_dependencies_depends_on_task_idTotasks.is_archived &&
                       d.tasks_task_dependencies_depends_on_task_idTotasks.status !== "Completed"
            );

            let msg = `🦆 **Task Focus: "${task.title}"**\n\n`;
            msg += `• **Priority:** ${task.priority} · **Status:** ${task.status}\n`;
            msg += `• **Due:** ${formatDueInfo(task.due_date)}\n`;
            if (task.estimated_hours) {
                msg += `• **Estimated:** ${Number(task.estimated_hours)}h\n`;
            }
            if (task.projects?.title) {
                msg += `• **Project:** ${task.projects.title}\n`;
            }
            msg += `\n`;

            if (activePrereqs.length > 0) {
                msg += `⚠️ **Blocked:** This task is waiting on prerequisite "${activePrereqs[0].tasks_task_dependencies_depends_on_task_idTotasks.title}". Unblock that first.\n\n`;
            } else if (task.subtasks.length > 0) {
                msg += `📋 **Next Subtask to Complete:**\n• **${task.subtasks[0].title}**\n\n`;
            }

            msg += `🎯 **Recommendation:**\n${reasons.length > 0 ? reasons.join(" · ") : "Continue working to complete this task."}`;

            return {
                topTask: task,
                tasks: [{ ...task, focusScore: score, focusReasons: reasons }],
                message: msg.trim(),
                emotion: reasons.some((r) => r.includes("overdue")) ? "worried" : "thinking"
            };
        }
    }

    // 2. Project or User Workload Context
    const whereClause = {
        is_archived: false,
        status: { not: "Completed" }
    };

    if (projectId) {
        whereClause.project_id = projectId;
    } else {
        whereClause.assigned_to = userId;
    }

    let candidateTasks = await prisma.tasks.findMany({
        where: whereClause,
        include: {
            projects: {
                select: { id: true, title: true, status: true, end_date: true, priority: true }
            },
            task_dependencies_task_dependencies_depends_on_task_idTotasks: {
                include: {
                    tasks_task_dependencies_task_idTotasks: {
                        select: { id: true, title: true, status: true, is_archived: true }
                    }
                }
            },
            task_dependencies_task_dependencies_task_idTotasks: {
                include: {
                    tasks_task_dependencies_depends_on_task_idTotasks: {
                        select: { id: true, title: true, status: true, is_archived: true }
                    }
                }
            }
        }
    });

    // In project context: if user has assigned tasks in this project, prioritize those
    if (projectId && candidateTasks.length > 0) {
        const userAssigned = candidateTasks.filter((t) => t.assigned_to === userId);
        if (userAssigned.length > 0) {
            candidateTasks = userAssigned;
        }
    }

    // 3. Handle Empty State when candidate tasks = 0
    if (candidateTasks.length === 0) {
        const totalCount = await prisma.tasks.count({
            where: projectId ? { project_id: projectId } : { assigned_to: userId }
        });
        const completedCount = await prisma.tasks.count({
            where: projectId
                ? { project_id: projectId, status: "Completed" }
                : { assigned_to: userId, status: "Completed" }
        });

        if (completedCount > 0 && completedCount === totalCount) {
            return {
                topTask: null,
                tasks: [],
                message: "🦆 **You're all caught up.**\n\nThere are no active tasks requiring your attention today. Great job keeping your work clear!",
                emotion: "excited"
            };
        }

        return {
            topTask: null,
            tasks: [],
            message: "🦆 **You're all caught up.**\n\nThere are no active tasks requiring your attention today.",
            emotion: "excited"
        };
    }

    // 4. Score all candidate tasks deterministically
    const scoredList = candidateTasks
        .map((task) => {
            const { score, reasons } = calculateFocusScore(task, { startOfToday, projectId });
            return {
                task,
                score,
                reasons
            };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
            // Sort by score descending
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // Tiebreaker 1: earlier due date first
            const aDue = a.task.due_date ? new Date(a.task.due_date).getTime() : Infinity;
            const bDue = b.task.due_date ? new Date(b.task.due_date).getTime() : Infinity;
            if (aDue !== bDue) {
                return aDue - bDue;
            }
            // Tiebreaker 2: older task created first
            return new Date(a.task.created_at).getTime() - new Date(b.task.created_at).getTime();
        });

    if (scoredList.length === 0) {
        return {
            topTask: null,
            tasks: [],
            message: "🦆 **You're all caught up.**\n\nThere are no active tasks requiring your attention today.",
            emotion: "excited"
        };
    }

    // 5. Select top ~3 actionable tasks for Daily Mission
    const topItems = scoredList.slice(0, 3);
    const topTask = topItems[0].task;

    let missionText = "🦆 **Today's Mission**\n\n";
    topItems.forEach((item, index) => {
        const t = item.task;
        const icon = getPriorityIcon(t.priority);
        const prio = t.priority || "Medium";
        const due = formatDueInfo(t.due_date);
        const hours = t.estimated_hours ? ` · Estimated: ${Number(t.estimated_hours)}h` : "";
        const proj = t.projects?.title ? `\n   Project: ${t.projects.title}` : "";
        const why = item.reasons.length > 0 ? `\n   *Why:* ${item.reasons.slice(0, 3).join(" · ")}` : "";

        missionText += `${index + 1}. ${icon} **${t.title}**\n   ${prio} priority · ${due}${hours}${proj}${why}\n\n`;
    });

    const topReasonsText = topItems[0].reasons.length > 0
        ? topItems[0].reasons.slice(0, 3).join(", ")
        : "it has the highest urgency";

    missionText += `🎯 **Focus Recommendation:**\nStart with **${topTask.title}** because ${topReasonsText}.`;

    const emotion = topItems.some((it) => it.reasons.some((r) => r.includes("overdue")))
        ? "worried"
        : "thinking";

    return {
        topTask,
        tasks: topItems.map((it) => ({
            ...it.task,
            focusScore: it.score,
            focusReasons: it.reasons
        })),
        message: missionText.trim(),
        emotion
    };
};

/**
 * Backwards-compatible recommendation helper
 */
export const recommendNextTask = async ({ userId, projectId = null }) => {
    const mission = await getFocusDailyMission({ userId, projectId });
    if (!mission.topTask) {
        return {
            recommendedTask: null,
            score: 0,
            why: [],
            message: mission.message,
            emotion: mission.emotion
        };
    }
    const topItem = mission.tasks[0];
    return {
        recommendedTask: mission.topTask,
        score: topItem?.focusScore || 0,
        why: topItem?.focusReasons || [],
        message: mission.message,
        emotion: mission.emotion
    };
};

// ============================================================
// 3. SUMMARIZE THIS PROJECT
// ============================================================
export const summarizeProject = async ({ projectId, userId }) => {
    const startOfToday = getStartOfToday();

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        include: {
            tasks: {
                where: { is_archived: false },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    due_date: true
                }
            },
            risks: {
                where: { status: "Open" },
                select: {
                    id: true,
                    title: true,
                    severity: true,
                    mitigation_plan: true
                }
            }
        }
    });

    if (!project) {
        return {
            error: "Project not found",
            message: "🦆 I couldn't find the requested project. Please ensure you are viewing an active project.",
            emotion: "worried"
        };
    }

    const tasks = project.tasks || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "Completed").length;
    const activeTasks = totalTasks - completedTasks;

    const overdueTasks = tasks.filter(
        (t) => t.status !== "Completed" && t.due_date && new Date(t.due_date) < startOfToday
    );

    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Check dependencies in this project
    const projectTaskIds = tasks.map((t) => t.id);
    const blockingDeps = await prisma.task_dependencies.findMany({
        where: {
            depends_on_task_id: { in: projectTaskIds }
        },
        include: {
            tasks_task_dependencies_depends_on_task_idTotasks: {
                select: { id: true, title: true, status: true }
            }
        }
    });

    const activeBlockingTasks = blockingDeps.filter(
        (d) => d.tasks_task_dependencies_depends_on_task_idTotasks?.status !== "Completed"
    );

    const openRisks = project.risks || [];

    // Next upcoming deadline
    const futureDeadlines = tasks
        .filter((t) => t.status !== "Completed" && t.due_date && new Date(t.due_date) >= startOfToday)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // Determine main area needing attention
    let focusArea = "maintaining current progress towards milestones";
    if (overdueTasks.length > 0) {
        focusArea = `resolving ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""} (starting with "${overdueTasks[0].title}")`;
    } else if (openRisks.length > 0) {
        focusArea = `mitigating the open risk "${openRisks[0].title}" (${openRisks[0].severity} severity)`;
    } else if (activeBlockingTasks.length > 0) {
        focusArea = `unblocking downstream tasks by completing "${activeBlockingTasks[0].tasks_task_dependencies_depends_on_task_idTotasks?.title}"`;
    } else if (activeTasks > 0) {
        focusArea = `driving active tasks forward (${activeTasks} remaining)`;
    }

    let blockerText = "";
    if (activeBlockingTasks.length > 0) {
        blockerText = `\n${activeBlockingTasks.length} task${activeBlockingTasks.length > 1 ? "s are" : " is"} blocking downstream work.`;
    } else {
        blockerText = "\nNo blocking dependencies recorded.";
    }

    let risksText = "";
    if (openRisks.length > 0) {
        risksText = `\n${openRisks.length} open risk${openRisks.length > 1 ? "s" : ""} logged.`;
    }

    const message = `🦆 **${project.title}** is ${completionPercentage}% complete.\n\n• ${completedTasks} of ${totalTasks} tasks are completed.\n• ${overdueTasks.length} task${overdueTasks.length === 1 ? " is" : "s are"} overdue.${blockerText}${risksText}\n\nThe main area needing attention is ${focusArea}.`;

    const emotion = overdueTasks.length > 0 || openRisks.some((r) => r.severity === "Critical")
        ? "worried"
        : completionPercentage >= 75
        ? "excited"
        : "happy";

    return {
        projectId: project.id,
        projectName: project.title,
        status: project.status,
        priority: project.priority,
        completionPercentage,
        totalTasks,
        completedTasks,
        activeTasks,
        overdueTasks: overdueTasks.length,
        knownBlockers: activeBlockingTasks.length,
        openRisks: openRisks.length,
        upcomingDeadlines: futureDeadlines.slice(0, 3).map((t) => ({
            id: t.id,
            title: t.title,
            dueDateFormatted: formatDate(t.due_date)
        })),
        message,
        emotion
    };
};

// ============================================================
// 4. WHAT IS DELAYING THIS PROJECT? / PROJECT BLOCKERS
// ============================================================
export const getProjectBlockers = async ({ projectId, userId }) => {
    const startOfToday = getStartOfToday();

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        include: {
            tasks: {
                where: { is_archived: false },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    due_date: true
                }
            },
            risks: {
                where: { status: "Open" },
                select: {
                    id: true,
                    title: true,
                    severity: true,
                    probability: true,
                    mitigation_plan: true
                }
            }
        }
    });

    if (!project) {
        return {
            message: "🦆 Please select an active project so I can identify what is delaying it.",
            emotion: "curious"
        };
    }

    const overdueTasks = project.tasks.filter(
        (t) => t.status !== "Completed" && t.due_date && new Date(t.due_date) < startOfToday
    );

    const projectTaskIds = project.tasks.map((t) => t.id);
    const blockingDeps = await prisma.task_dependencies.findMany({
        where: {
            depends_on_task_id: { in: projectTaskIds }
        },
        include: {
            tasks_task_dependencies_depends_on_task_idTotasks: {
                select: { id: true, title: true, status: true }
            },
            tasks_task_dependencies_task_idTotasks: {
                select: { id: true, title: true, status: true }
            }
        }
    });

    const activeBlockers = blockingDeps.filter(
        (d) => d.tasks_task_dependencies_depends_on_task_idTotasks?.status !== "Completed"
    );

    const highRisks = project.risks.filter(
        (r) => r.severity === "Critical" || r.severity === "High"
    );

    const hasProblems = overdueTasks.length > 0 || activeBlockers.length > 0 || project.risks.length > 0;

    if (!hasProblems) {
        return {
            message: `🦆 **${project.title}** has no active blockers!\n\n• 0 overdue tasks\n• 0 blocking dependencies\n• 0 open risks\n\nThe project is tracking cleanly.`,
            emotion: "happy"
        };
    }

    let delaySummary = `🦆 Here is what is currently impacting **${project.title}**:\n\n`;

    if (overdueTasks.length > 0) {
        delaySummary += `**Overdue Tasks (${overdueTasks.length}):**\n`;
        overdueTasks.forEach((t) => {
            const dueDate = new Date(t.due_date);
            const daysOverdue = Math.max(1, Math.round((startOfToday.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
            delaySummary += `• **${t.title}** (${t.priority}) — ${daysOverdue} days overdue (${formatDate(t.due_date)})\n`;
        });
        delaySummary += "\n";
    }

    if (activeBlockers.length > 0) {
        delaySummary += `**Blocking Dependencies (${activeBlockers.length}):**\n`;
        activeBlockers.forEach((b) => {
            delaySummary += `• "${b.tasks_task_dependencies_depends_on_task_idTotasks?.title}" blocks "${b.tasks_task_dependencies_task_idTotasks?.title}"\n`;
        });
        delaySummary += "\n";
    }

    if (project.risks.length > 0) {
        delaySummary += `**Open Risks (${project.risks.length}):**\n`;
        project.risks.forEach((r) => {
            delaySummary += `• **${r.title}** [${r.severity} Severity]${r.mitigation_plan ? ` — Plan: ${r.mitigation_plan}` : ""}\n`;
        });
        delaySummary += "\n";
    }

    delaySummary += `**Recommended Next Action:**\nFocus on clearing "${overdueTasks[0]?.title || project.tasks.find((t) => t.status !== "Completed")?.title || "active tasks"}" to regain schedule velocity.`;

    return {
        projectId: project.id,
        projectTitle: project.title,
        overdueCount: overdueTasks.length,
        blockersCount: activeBlockers.length,
        risksCount: project.risks.length,
        message: delaySummary.trim(),
        emotion: "worried"
    };
};

// ============================================================
// 4B. PREDICTIVE PROJECT RISK SUMMARY
// ============================================================
export const formatProjectRiskReply = (riskAnalysis, note = "") => {
    const { projectTitle, riskLevel, riskScore, signals, primaryRisk, recommendations } = riskAnalysis;

    let reply = `🦆 **Project Risk Analysis**\n\n`;
    if (note) {
        reply += `${note}\n\n`;
    }
    reply += `**${projectTitle} — ${riskLevel} RISK** (${riskScore}/100)\n\n`;

    reply += `**Why:**\n`;
    if (signals && signals.length > 0) {
        signals.slice(0, 5).forEach((s) => {
            reply += `• ${s.message}\n`;
        });
    } else {
        reply += `• Project is tracking cleanly with no overdue tasks or blockers.\n`;
    }
    reply += `\n`;

    reply += `**Primary concern:**\n${primaryRisk}\n\n`;

    reply += `**Recommended action:**\n${recommendations?.[0] || "Maintain current velocity to hit all project milestones on schedule."}`;

    return reply.trim();
};

export const getQuackieProjectRiskSummary = async ({ projectId, userId, note = "" }) => {
    const riskAnalysis = await analyzeProjectRisk(projectId, userId);
    const message = formatProjectRiskReply(riskAnalysis, note);

    let emotion = "happy";
    if (riskAnalysis.riskLevel === "CRITICAL" || riskAnalysis.riskLevel === "HIGH") {
        emotion = "worried";
    } else if (riskAnalysis.riskLevel === "MEDIUM") {
        emotion = "thinking";
    } else if (riskAnalysis.riskScore === 0) {
        emotion = riskAnalysis.metrics?.completionPercentage === 100 ? "excited" : "happy";
    }

    return {
        ...riskAnalysis,
        message,
        emotion
    };
};

// ============================================================
// 4C. PROJECT X-RAY SUMMARY
// ============================================================
export const formatProjectXRayReply = (xray, note = "") => {
    const { project, health, tasks, deadline, dependencies, risks, focus, recommendations } = xray;

    let reply = `🦆 **Project X-Ray: ${project.title}**\n\n`;
    if (note) {
        reply += `${note}\n\n`;
    }
    reply += `**Health & Risk:** ${health.riskLevel} (${health.riskScore}/100)\n`;
    reply += `**Completion:** ${health.completionPercentage}%\n`;
    reply += `**Active Tasks:** ${tasks.active} (Overdue: ${tasks.overdue})\n`;

    const deadlineText = deadline.hasDeadline
        ? (deadline.daysRemaining < 0
            ? `Passed ${Math.abs(deadline.daysRemaining)} days ago`
            : deadline.daysRemaining === 0
            ? "Today"
            : `${deadline.daysRemaining} days remaining`)
        : "No deadline configured";
    reply += `**Deadline:** ${deadlineText}\n\n`;

    if (dependencies.topBlockers && dependencies.topBlockers.length > 0) {
        reply += `**Main Blockers:**\n`;
        dependencies.topBlockers.slice(0, 3).forEach((b) => {
            const downstreamNames = b.blockedTasks.slice(0, 2).map((bt) => bt.title).join(", ");
            reply += `• **${b.task?.title || b.title}** blocks ${downstreamNames}\n`;
        });
        reply += `\n`;
    } else {
        reply += `**Main Blockers:**\n• No blocking dependencies detected.\n\n`;
    }

    if (risks.signals && risks.signals.length > 0) {
        reply += `**Main Risks:**\n`;
        risks.signals.slice(0, 3).forEach((s) => {
            reply += `• ${s.message}\n`;
        });
        reply += `\n`;
    } else {
        reply += `**Main Risks:**\n• No active project risks recorded.\n\n`;
    }

    if (focus.recommendedTasks && focus.recommendedTasks.length > 0) {
        reply += `**Recommended Focus:**\n`;
        focus.recommendedTasks.slice(0, 3).forEach((t) => {
            const prio = t.priority ? ` (${t.priority})` : "";
            const due = t.dueDateFormatted ? ` · due ${t.dueDateFormatted}` : "";
            reply += `• **${t.title}**${prio}${due}\n`;
        });
    } else {
        reply += `**Recommended Focus:**\n• Project has no active tasks requiring attention.\n`;
    }

    return reply.trim();
};

export const getQuackieProjectXRaySummary = async ({ projectId, userId, note = "" }) => {
    const xray = await getProjectXRay(projectId, userId);
    const message = formatProjectXRayReply(xray, note);

    let emotion = "happy";
    if (xray.health.riskLevel === "CRITICAL" || xray.health.riskLevel === "HIGH") {
        emotion = "worried";
    } else if (xray.health.riskLevel === "MEDIUM") {
        emotion = "thinking";
    } else if (xray.health.riskScore === 0) {
        emotion = xray.health.completionPercentage === 100 ? "excited" : "happy";
    }

    return {
        ...xray,
        message,
        emotion
    };
};

// ============================================================
// 4D. CRITICAL PATH SUMMARY & FORMATTER
// ============================================================
export const formatCriticalPathReply = (cpm, note = "") => {
    const { projectTitle, projectCriticalPathDays, criticalTaskIds, nodes, hasCycle, cycleNodes, projectStart, projectedEnd } = cpm;

    if (hasCycle) {
        const cycleList = (cycleNodes || []).map((n) => `"${n.title || n.taskId}"`).join(", ");
        return `🦆 **Critical Path Warning: ${projectTitle}**\n\n⚠️ A circular dependency was detected in this project involving tasks: ${cycleList}.\n\nPlease resolve the circular dependency to enable deterministic schedule calculation.`;
    }

    let reply = `🦆 **Critical Path Intelligence: ${projectTitle}**\n\n`;
    if (note) {
        reply += `${note}\n\n`;
    }

    if (!nodes || nodes.length === 0) {
        reply += `No active tasks were found in this project. Add tasks and dependencies to generate a Critical Path schedule.`;
        return reply.trim();
    }

    reply += `• **Critical Path Duration:** ${projectCriticalPathDays} day${projectCriticalPathDays === 1 ? "" : "s"}\n`;
    if (projectStart && projectedEnd) {
        reply += `• **Project Window:** ${projectStart} → ${projectedEnd}\n`;
    }
    reply += `• **Critical Tasks:** ${criticalTaskIds.length} of ${nodes.length} tasks\n\n`;

    const criticalNodes = nodes.filter((n) => n.isCritical);
    if (criticalNodes.length === 0) {
        reply += `All current tasks have flexible slack. No critical path bottlenecks detected.\n`;
    } else {
        reply += `**Critical Sequence (Zero Slack):**\n`;
        criticalNodes.forEach((n, i) => {
            const statusIcon = n.status === "Completed" ? "✅" : "🔴";
            const dueInfo = n.dueDate ? ` · Due: ${n.dueDate}` : "";
            reply += `${i + 1}. ${statusIcon} **${n.title}** (${n.durationDays}d)${dueInfo} [${n.status}]\n`;
        });
        reply += `\n💡 *Any delay on these ${criticalNodes.length} tasks will directly postpone project completion.*`;
    }

    return reply.trim();
};

export const getQuackieCriticalPathSummary = async ({ projectId, userId, note = "" }) => {
    const cpm = await getProjectCriticalPath(projectId, userId);
    const message = formatCriticalPathReply(cpm, note);

    let emotion = "happy";
    if (cpm.hasCycle) {
        emotion = "worried";
    } else {
        const criticalNodes = (cpm.nodes || []).filter((n) => n.isCritical && n.status !== "Completed");
        const hasOverdueCritical = criticalNodes.some((n) => {
            if (!n.dueDate) return false;
            return new Date(n.dueDate) < getStartOfToday();
        });
        if (hasOverdueCritical) {
            emotion = "worried";
        } else if (criticalNodes.length > 3) {
            emotion = "thinking";
        } else if (cpm.projectCriticalPathDays > 0) {
            emotion = "excited";
        }
    }

    return {
        ...cpm,
        message,
        emotion
    };
};

// ============================================================
// 4E. BOTTLENECK INTELLIGENCE SUMMARY & FORMATTER
// ============================================================
export const formatBottleneckReply = (bottleneckData, note = "") => {
    const { projectTitle, bottlenecks, summary, hasCycle, error } = bottleneckData;

    if (hasCycle) {
        return `🦆 **Bottleneck Warning: ${projectTitle}**\n\n⚠️ ${error || "Dependency graph contains a circular dependency"}.\nResolve task cycles to identify workflow bottlenecks.`;
    }

    let reply = `🦆 **Bottleneck Intelligence: ${projectTitle}**\n\n`;
    if (note) {
        reply += `${note}\n\n`;
    }

    if (!bottlenecks || bottlenecks.length === 0) {
        reply += `Great news! No active bottlenecks detected in **${projectTitle}**. Work is flowing smoothly without blocking constraints.`;
        return reply.trim();
    }

    const primary = summary?.primaryBottleneck || bottlenecks[0];
    reply += `**Primary Bottleneck:**\n`;
    const severityIcon = primary.severity === "CRITICAL" ? "🔴" : primary.severity === "HIGH" ? "🟠" : "🟡";
    reply += `${severityIcon} **${primary.title}** — **${primary.severity}** (Score: ${primary.score}/100)\n`;

    const fullPrimary = bottlenecks.find((b) => b.taskId === primary.taskId) || bottlenecks[0];
    if (fullPrimary.reasons && fullPrimary.reasons.length > 0) {
        fullPrimary.reasons.slice(0, 3).forEach((r) => {
            reply += `   • ${r}\n`;
        });
    }
    reply += `\n`;

    const others = bottlenecks.slice(1, 4);
    if (others.length > 0) {
        reply += `**Other Constrained Tasks (${others.length}):**\n`;
        others.forEach((b) => {
            const icon = b.severity === "CRITICAL" ? "🔴" : b.severity === "HIGH" ? "🟠" : "🟡";
            const blockedStr = b.blockedDownstreamCount > 0 ? ` · blocks ${b.blockedDownstreamCount} tasks` : "";
            reply += `• ${icon} **${b.title}** [${b.severity}]${blockedStr}\n`;
        });
        reply += `\n`;
    }

    reply += `💡 *Action item: Unblocking "${fullPrimary.title}" will provide the highest schedule relief.*`;

    return reply.trim();
};

export const getQuackieBottleneckSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectBottlenecks(projectId, userId);
    const message = formatBottleneckReply(data, note);

    let emotion = "happy";
    if (data.hasCycle) {
        emotion = "worried";
    } else if (data.summary?.criticalSeverityCount > 0) {
        emotion = "worried";
    } else if (data.summary?.highSeverityCount > 0) {
        emotion = "thinking";
    } else if (data.bottlenecks?.length === 0) {
        emotion = "excited";
    }

    return {
        ...data,
        message,
        emotion
    };
};

// ============================================================
// 5. NATURAL-LANGUAGE TASK CREATION INTENT PARSER
// ============================================================


export const extractTaskDetails = (rawText, accessibleProjects = []) => {
    let text = rawText.trim();

    // 1. Priority: normalize to TaskFlow enum ("Low", "Medium", "High")
    let priority = "Medium";
    const priorityMatch =
        text.match(/\b(?:with\s+)?(low|medium|high|critical)\s+priority\b/i) ||
        text.match(/\bpriority\s*[:=]?\s*(low|medium|high|critical)\b/i) ||
        text.match(/\b(low|medium|high|critical)\s+priority\b/i);

    if (priorityMatch) {
        const p = priorityMatch[1].toLowerCase();
        if (p === "low") priority = "Low";
        else if (p === "high" || p === "critical") priority = "High";
        else priority = "Medium";
        text = text.replace(priorityMatch[0], " ");
    }

    // 2. Status (optional)
    let status = "To Do";
    const statusMatch = text.match(
        /\b(?:status|in\s+status)\s*[:=]?\s*["']?(to\s+do|in\s+progress|review|backlog|completed)["']?/i
    );
    if (statusMatch) {
        const s = statusMatch[1].toLowerCase();
        if (s === "in progress") status = "In Progress";
        else if (s === "review") status = "Review";
        else if (s === "completed") status = "Completed";
        else if (s === "backlog") status = "Backlog";
        else status = "To Do";
        text = text.replace(statusMatch[0], " ");
    }

    // 3. Estimated Hours (optional)
    let estimatedHours = null;
    const hoursMatch =
        text.match(
            /\b(?:estimated(?:\s+at|\s+hours?)?|est\.?|takes?|duration(?:\s+of)?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i
        ) || text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:estimated|estimate)?\b/i);
    if (hoursMatch) {
        estimatedHours = parseFloat(hoursMatch[1]);
        text = text.replace(hoursMatch[0], " ");
    }

    // 4. Description (optional)
    let description = null;
    const descMatch = text.match(
        /\b(?:with\s+)?(?:description|desc|notes?)\s*[:=]?\s*["']([^"']+)["']/i
    );
    if (descMatch) {
        description = descMatch[1].trim();
        text = text.replace(descMatch[0], " ");
    }

    // 5. Due Date
    let dueDate = null;
    let dueDateFormatted = "No due date";
    const now = new Date();

    const parseSpecificDate = (s) => {
        if (!s) return null;
        const cleanStr = s.trim().replace(/^[,\s]+|[,\s]+$/g, "");

        // A. DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY (application convention: DD-MM-YYYY)
        const dmy = cleanStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (dmy) {
            const d = parseInt(dmy[1], 10);
            const m = parseInt(dmy[2], 10);
            const y = parseInt(dmy[3], 10);
            if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const dt = new Date(y, m - 1, d);
                const formatted = new Intl.DateTimeFormat("en", {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }).format(dt);
                return { iso, formatted };
            }
        }

        // B. YYYY-MM-DD or YYYY/MM/DD
        const ymd = cleanStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (ymd) {
            const y = parseInt(ymd[1], 10);
            const m = parseInt(ymd[2], 10);
            const d = parseInt(ymd[3], 10);
            if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const dt = new Date(y, m - 1, d);
                const formatted = new Intl.DateTimeFormat("en", {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }).format(dt);
                return { iso, formatted };
            }
        }

        // C. Month name Day Year (e.g. October 3 2026, Oct 3, 2026)
        const monthMap = {
            jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
            apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
            aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
            nov: 11, november: 11, dec: 12, december: 12
        };

        const tm1 = cleanStr.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s*(\d{4})?$/i);
        if (tm1 && monthMap[tm1[1].toLowerCase()]) {
            const m = monthMap[tm1[1].toLowerCase()];
            const d = parseInt(tm1[2], 10);
            const y = tm1[3] ? parseInt(tm1[3], 10) : now.getFullYear();
            const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dt = new Date(y, m - 1, d);
            const formatted = new Intl.DateTimeFormat("en", {
                month: "long",
                day: "numeric",
                year: "numeric"
            }).format(dt);
            return { iso, formatted };
        }

        // D. Day Month name Year (e.g. 3 October 2026, 3rd of Oct 2026)
        const tm2 = cleanStr.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-zA-Z]+)(?:,)?\s*(\d{4})?$/i);
        if (tm2 && monthMap[tm2[2].toLowerCase()]) {
            const d = parseInt(tm2[1], 10);
            const m = monthMap[tm2[2].toLowerCase()];
            const y = tm2[3] ? parseInt(tm2[3], 10) : now.getFullYear();
            const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dt = new Date(y, m - 1, d);
            const formatted = new Intl.DateTimeFormat("en", {
                month: "long",
                day: "numeric",
                year: "numeric"
            }).format(dt);
            return { iso, formatted };
        }

        return null;
    };

    // Check for due clause: due <date> or by <date>
    const dueClauseMatch = text.match(
        /\b(?:due(?:\s+date)?(?:\s+(?:on|by|at|is|for))?|by\s+)([\w\d\s\/\-\.,]+?)(?=(?:\s+(?:in|under|for|with|desc|status)|$|,|\.))/i
    );

    let dateMatchText = dueClauseMatch ? dueClauseMatch[1].trim() : null;

    if (dateMatchText) {
        if (/\btoday\b/i.test(dateMatchText)) {
            dueDate = now.toISOString().slice(0, 10);
            dueDateFormatted = "Today";
            text = text.replace(dueClauseMatch[0], " ");
        } else if (/\btomorrow\b/i.test(dateMatchText)) {
            const tom = new Date(now);
            tom.setDate(tom.getDate() + 1);
            dueDate = tom.toISOString().slice(0, 10);
            dueDateFormatted = "Tomorrow";
            text = text.replace(dueClauseMatch[0], " ");
        } else if (/\b(?:this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(dateMatchText)) {
            const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
            const targetDayName = dateMatchText.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)[1].toLowerCase();
            const targetDay = dayNames.indexOf(targetDayName);
            const currentDay = now.getDay();
            const diff = (targetDay - currentDay + 7) % 7 || 7;
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + diff);
            dueDate = targetDate.toISOString().slice(0, 10);
            dueDateFormatted = new Intl.DateTimeFormat("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            }).format(targetDate);
            text = text.replace(dueClauseMatch[0], " ");
        } else if (/\bnext week\b/i.test(dateMatchText)) {
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + 7);
            dueDate = targetDate.toISOString().slice(0, 10);
            dueDateFormatted = "Next week";
            text = text.replace(dueClauseMatch[0], " ");
        } else {
            const parsed = parseSpecificDate(dateMatchText);
            if (parsed) {
                dueDate = parsed.iso;
                dueDateFormatted = parsed.formatted;
                text = text.replace(dueClauseMatch[0], " ");
            }
        }
    }

    // Fallback: search for standalone numeric or month-name date if no "due" keyword was used
    if (!dueDate) {
        const standaloneMatch = text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/);
        if (standaloneMatch) {
            const parsed = parseSpecificDate(standaloneMatch[1]);
            if (parsed) {
                dueDate = parsed.iso;
                dueDateFormatted = parsed.formatted;
                text = text.replace(standaloneMatch[0], " ");
            }
        }
    }

    // 6. Project matching
    let matchedProject = null;
    const projectClauseMatch = text.match(
        /\b(?:in|for|to|under)\s+(?:the\s+)?project\s+["']?([^"'\n,;]+?)["']?(?:\s|$|,|\.)/i
    );
    if (projectClauseMatch) {
        const projName = projectClauseMatch[1].trim().toLowerCase();
        matchedProject = accessibleProjects.find((p) => p.title.toLowerCase() === projName) || null;
        text = text.replace(projectClauseMatch[0], " ");
    } else {
        for (const p of accessibleProjects) {
            const escaped = p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
                matchedProject = p;
                text = text.replace(new RegExp(`\\b(in|for|to|under)?\\s*["']?${escaped}["']?\\b`, "i"), " ");
                break;
            }
        }
    }

    // 7. Title Extraction
    let cleaned = text
        .replace(/^(?:please\s+)?(?:create|add|schedule|make|new)\s+/i, "")
        .replace(/^(?:a|an|the)\s+/i, "")
        .replace(/^(?:task|todo)\s+/i, "")
        .replace(/^(?:called|named|titled)\s+/i, "")
        .replace(/^["'“”‘’]|["'“”‘’]$/g, "")
        .replace(/^[:\-\s,]+|[:\-\s,]+$/g, "")
        .trim();

    cleaned = cleaned
        .replace(/^(?:a|an|the)\s+/i, "")
        .replace(/^(?:task|todo)\s+/i, "")
        .replace(/^(?:called|named|titled)\s+/i, "")
        .replace(/^["'“”‘’]|["'“”‘’]$/g, "")
        .replace(/^[:\-\s,]+|[:\-\s,]+$/g, "")
        .trim();

    const acronyms = ["api", "ui", "ux", "qa", "db", "pr", "hr", "id", "url", "seo", "ai", "ml", "sdk", "cli"];
    const words = cleaned
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => {
            const lw = w.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (acronyms.includes(lw)) {
                return w.toUpperCase();
            }
            if (w === w.toLowerCase()) {
                return w.charAt(0).toUpperCase() + w.slice(1);
            }
            return w;
        });

    const title = words.join(" ");

    return {
        title,
        priority,
        dueDate,
        dueDateFormatted,
        description,
        status,
        estimatedHours,
        matchedProject
    };
};

export const parseTaskCreationProposal = async ({ text, context, userId, conversationHistory = [] }) => {
    const accessibleProjects = await getUserAccessibleProjects(userId);
    const extracted = extractTaskDetails(text, accessibleProjects);
    let { title, priority, dueDate, dueDateFormatted, description, status, estimatedHours, matchedProject } = extracted;

    // Check multi-turn pending draft
    let pendingDraft = context?.pendingTaskDraft || null;
    if (context?.pendingTaskDraft === null) {
        pendingDraft = null;
    } else if (!pendingDraft && Array.isArray(conversationHistory)) {
        for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const h = conversationHistory[i];
            if (h.role === "assistant") {
                if (
                    h.context?.proposalCancelled ||
                    h.context?.pendingTaskDraft === null ||
                    /won't create|cancelled|success!\s*created\s*task/i.test(h.content || "")
                ) {
                    break;
                }
            }
            if (h.context?.pendingTaskDraft) {
                pendingDraft = h.context.pendingTaskDraft;
                break;
            }
        }
    }

    if (pendingDraft) {
        if (!title && pendingDraft.title) title = pendingDraft.title;
        if ((!priority || priority === "Medium") && pendingDraft.priority) priority = pendingDraft.priority;
        if (!dueDate && pendingDraft.dueDate) {
            dueDate = pendingDraft.dueDate;
            dueDateFormatted = pendingDraft.dueDateFormatted;
        }
        if (!description && pendingDraft.description) description = pendingDraft.description;
        if (!status && pendingDraft.status) status = pendingDraft.status;
        if (!estimatedHours && pendingDraft.estimatedHours) estimatedHours = pendingDraft.estimatedHours;
    }

    // Determine target project
    let targetProject = null;
    if (matchedProject) {
        targetProject = matchedProject;
    } else if (context?.projectId) {
        targetProject = accessibleProjects.find((p) => p.id === context.projectId) || null;
    }

    if (!title) {
        return {
            readyForConfirmation: false,
            message: "🦆 What should the title of this task be? For example: *Create a task called API Testing due 03-10-2026 with low priority*.",
            emotion: "curious"
        };
    }

    // If required project is missing, ask the user!
    if (!targetProject) {
        let promptText = `🦆 Which project should I add '${title}' to?`;
        if (accessibleProjects.length > 0) {
            promptText += `\n\n${accessibleProjects.map((p) => `• **${p.title}**`).join("\n")}`;
        }
        return {
            readyForConfirmation: false,
            message: promptText,
            emotion: "curious",
            context: {
                pendingTaskDraft: {
                    title,
                    priority,
                    dueDate,
                    dueDateFormatted,
                    description,
                    status,
                    estimatedHours
                },
                pendingProposal: null,
                proposalCancelled: false
            }
        };
    }

    // All required information is available!
    // Show confirmation before writing: "Create 'API Testing' with Low priority, due October 3, 2026?"
    const duePhrase = dueDateFormatted && dueDateFormatted !== "No due date" ? `, due ${dueDateFormatted}` : "";
    const confirmMessage = `🦆 Create '${title}' with ${priority} priority${duePhrase}?`;

    return {
        readyForConfirmation: true,
        actionType: "create_task_proposal",
        taskData: {
            title,
            priority,
            dueDate,
            dueDateFormatted,
            description: description || null,
            status: status || "To Do",
            estimatedHours: estimatedHours || null,
            projectId: targetProject.id,
            projectTitle: targetProject.title
        },
        message: confirmMessage,
        emotion: "thinking",
        context: {
            projectId: targetProject.id,
            pendingProposal: {
                title,
                priority,
                dueDate,
                dueDateFormatted,
                description: description || null,
                status: status || "To Do",
                estimatedHours: estimatedHours || null,
                projectId: targetProject.id,
                projectTitle: targetProject.title
            },
            pendingTaskDraft: null,
            proposalCancelled: false
        }
    };
};

// ============================================================
// 6. PROACTIVE CONTEXT & GREETING
// ============================================================
export const getProactiveContext = async ({ page, projectId, taskId, userId }) => {
    const startOfToday = getStartOfToday();
    const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { first_name: true }
    });
    const userName = user?.first_name || "there";

    // Query unread notifications for user
    const unreadAlerts = await prisma.notifications.findMany({
        where: {
            user_id: userId,
            is_read: false
        },
        orderBy: [{ created_at: "desc" }],
        take: 5
    });

    const formattedAlerts = unreadAlerts.map((n) => ({
        id: n.id,
        type: n.type,
        severity: n.severity || "INFO",
        title: n.title,
        message: n.message,
        projectId: n.project_id,
        taskId: n.task_id,
        createdAt: n.created_at
    }));

    const highValueAlerts = formattedAlerts.filter(
        (a) => a.severity === "CRITICAL" || a.severity === "HIGH" || a.severity === "WARNING"
    );

    // 1. Task Details Context (when a specific task is open)
    if (taskId) {
        const task = await prisma.tasks.findUnique({
            where: { id: taskId },
            include: {
                projects: { select: { id: true, title: true } }
            }
        });

        if (task) {
            const isOverdue = task.due_date && new Date(task.due_date) < startOfToday && task.status !== "Completed" && !task.is_archived;
            const taskSpecificAlert = formattedAlerts.find((a) => a.taskId === taskId);

            let observation = isOverdue
                ? `🦆 This task is overdue (was due ${formatDate(task.due_date)}).`
                : `🦆 Priority: ${task.priority} · Status: ${task.status}`;

            if (taskSpecificAlert && taskSpecificAlert.type === "TASK_BLOCKED") {
                observation = `🦆 🚧 ${taskSpecificAlert.message}`;
            }

            return {
                contextType: "task",
                taskId: task.id,
                taskTitle: task.title,
                projectId: task.project_id,
                projectTitle: task.projects?.title,
                greeting: `Task: ${task.title}`,
                observation,
                badgeCount: isOverdue || taskSpecificAlert ? 1 : 0,
                emotion: isOverdue || taskSpecificAlert ? "worried" : "thinking",
                alerts: taskSpecificAlert ? [taskSpecificAlert] : [],
                quickActions: [
                    "Explain this task",
                    "What is blocking this task?",
                    "What should I do next?",
                    "Summarize its subtasks"
                ]
            };
        }
    }

    // 2. Project Page Context
    if ((page === "project" || projectId) && !taskId) {
        let project = null;
        if (projectId) {
            project = await prisma.projects.findUnique({
                where: { id: projectId },
                include: {
                    tasks: {
                        where: { is_archived: false },
                        select: { id: true, title: true, status: true, due_date: true }
                    }
                }
            });
        } else {
            const accessibleProjects = await getUserAccessibleProjects(userId);
            if (accessibleProjects.length > 0) {
                project = await prisma.projects.findUnique({
                    where: { id: accessibleProjects[0].id },
                    include: {
                        tasks: {
                            where: { is_archived: false },
                            select: { id: true, title: true, status: true, due_date: true }
                        }
                    }
                });
            }
        }

        if (project) {
            const overdue = project.tasks.filter(
                (t) => t.status !== "Completed" && t.due_date && new Date(t.due_date) < startOfToday
            ).length;

            const projectAlerts = formattedAlerts.filter((a) => a.projectId === project.id);
            const highRiskAlert = projectAlerts.find((a) => a.type === "HIGH_RISK_PROJECT");
            const deadlineAlert = projectAlerts.find((a) => a.type === "DEADLINE_WARNING");

            let observation = overdue > 0
                ? `🦆 I noticed ${overdue} overdue task${overdue > 1 ? "s" : ""} in this project.`
                : "🦆 This project has no overdue tasks. Everything is running smoothly.";

            if (highRiskAlert) {
                observation = `🦆 🔴 ${highRiskAlert.message}`;
            } else if (deadlineAlert) {
                observation = `🦆 📅 ${deadlineAlert.message}`;
            }

            return {
                contextType: "project",
                projectId: project.id,
                projectTitle: project.title,
                greeting: `Viewing "${project.title}"`,
                observation,
                badgeCount: Math.max(overdue, projectAlerts.length),
                emotion: highRiskAlert || overdue > 0 ? "worried" : "happy",
                alerts: projectAlerts,
                quickActions: [
                    "Summarize this project",
                    "What's delaying this project?",
                    "What are the biggest risks?",
                    "What should we focus on?"
                ]
            };
        }
    }

    // 3. My Tasks Page Context
    if (page === "tasks" && !taskId) {
        const overdueCount = await getUserOverdueCount(userId);
        const activeCount = await prisma.tasks.count({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" }
            }
        });

        const taskAlerts = formattedAlerts.filter(
            (a) => a.type === "PRIORITY_SHIFT" || a.type === "TASK_BLOCKED" || a.type === "TASK_OVERDUE"
        );
        const topTaskAlert = taskAlerts[0];

        let observation = overdueCount > 0
            ? `🦆 I noticed you have ${overdueCount} overdue task${overdueCount > 1 ? "s" : ""}.`
            : activeCount > 0
            ? `🦆 You have ${activeCount} active task${activeCount > 1 ? "s" : ""} on your plate.`
            : "🦆 All caught up! No active tasks pending.";

        if (topTaskAlert && topTaskAlert.type === "PRIORITY_SHIFT") {
            observation = `🦆 🎯 ${topTaskAlert.message}`;
        } else if (topTaskAlert && topTaskAlert.type === "TASK_BLOCKED") {
            observation = `🦆 🚧 ${topTaskAlert.message}`;
        }

        return {
            contextType: "tasks",
            greeting: "Viewing My Tasks",
            observation,
            badgeCount: Math.max(overdueCount, taskAlerts.length),
            emotion: overdueCount > 0 || taskAlerts.some((a) => a.severity === "HIGH") ? "worried" : "happy",
            alerts: taskAlerts,
            quickActions: [
                "What should I work on next?",
                "Show my overdue work",
                "What should I focus on today?",
                "Can I finish everything due this week?"
            ]
        };
    }

    // 4. Calendar Context
    if (page === "calendar") {
        const overdueCount = await getUserOverdueCount(userId);
        const upcomingTasks = await prisma.tasks.count({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                due_date: {
                    gte: startOfToday,
                    lte: new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000)
                }
            }
        });

        const deadlineAlerts = formattedAlerts.filter((a) => a.type === "DEADLINE_WARNING");

        return {
            contextType: "calendar",
            greeting: "Viewing Calendar",
            observation: overdueCount > 0
                ? `🦆 You have ${overdueCount} overdue task${overdueCount > 1 ? "s" : ""} and ${upcomingTasks} upcoming this week.`
                : deadlineAlerts.length > 0
                ? `🦆 📅 ${deadlineAlerts[0].message}`
                : upcomingTasks > 0
                ? `🦆 You have ${upcomingTasks} deadline${upcomingTasks > 1 ? "s" : ""} coming up this week.`
                : "🦆 No tight deadlines coming up in the next 7 days.",
            badgeCount: Math.max(overdueCount, deadlineAlerts.length),
            emotion: overdueCount > 0 ? "worried" : "happy",
            alerts: deadlineAlerts,
            quickActions: [
                "What is due soon?",
                "What should I work on next?",
                "Do I have deadline conflicts?",
                "What is overdue?"
            ]
        };
    }

    // 5. Default: Dashboard / Overall Workload Context
    const overdueCount = await getUserOverdueCount(userId);
    const activeCount = await prisma.tasks.count({
        where: {
            assigned_to: userId,
            is_archived: false,
            status: { not: "Completed" }
        }
    });

    let observation = overdueCount > 0
        ? `🦆 I noticed you have ${overdueCount} overdue task${overdueCount > 1 ? "s" : ""}.`
        : activeCount > 0
        ? `🦆 You have ${activeCount} active task${activeCount > 1 ? "s" : ""} assigned to you.`
        : "🦆 All caught up! No active tasks pending.";

    let emotion = overdueCount > 0 ? "worried" : "happy";

    if (highValueAlerts.length === 1) {
        const a = highValueAlerts[0];
        observation = `🦆 ${a.severity === "CRITICAL" ? "🔴" : "⚠️"} ${a.message}`;
        emotion = a.severity === "CRITICAL" ? "worried" : "thinking";
    } else if (highValueAlerts.length > 1) {
        observation = `🦆 You have ${highValueAlerts.length} new important updates requiring attention.`;
        emotion = "worried";
    }

    return {
        contextType: "dashboard",
        greeting: `Good day, ${userName}!`,
        observation,
        badgeCount: Math.max(overdueCount, highValueAlerts.length),
        emotion,
        alerts: highValueAlerts,
        quickActions: [
            "What should I focus on today?",
            "Show my overdue work",
            "What needs attention?",
            "Summarize my workload"
        ]
    };
};

// ============================================================
// 7. NATURAL LANGUAGE CHAT & MULTI-TURN CONVERSATION
// ============================================================
export const processMessage = async ({ message, content, context, conversationHistory = [], userId }) => {
    const rawText = String(message || content || "").trim();
    const lower = rawText.toLowerCase();

    // 1. Detect multi-turn context from history
    let effectiveProjectId = context?.projectId || null;
    let effectiveTaskId = context?.taskId || null;

    if (!effectiveProjectId && Array.isArray(conversationHistory)) {
        for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const h = conversationHistory[i];
            if (h.context?.projectId) {
                effectiveProjectId = h.context.projectId;
                break;
            }
        }
    }

    // Helper: detect negative confirmation responses
    const isNegativeConfirmation = (text) => {
        if (!text) return false;
        const cleaned = String(text)
            .trim()
            .toLowerCase()
            .replace(/[.,!?;:]+$/, "")
            .replace(/\s+/g, " ");

        if (/^(?:no|nope|nah|n)$/i.test(cleaned)) return true;
        if (/^(?:no|nope|nah)[,\s]+(?:cancel(?:\s+it)?|don'?t(?:\s+create(?:\s+it)?|\s+complete(?:\s+it)?)?|do\s+not(?:\s+create(?:\s+it)?|\s+complete(?:\s+it)?)?|never\s*mind|forget\s*it|thanks|thank\s+you|please|stop)$/i.test(cleaned)) return true;
        if (/^(?:cancel|cancel\s+it|please\s+cancel|please\s+cancel\s+it)$/i.test(cleaned)) return true;
        if (/^(?:don'?t|do\s+not)\s+(?:create|complete|finish|mark(?:\s+it)?(?:\s+as)?(?:\s+completed?)?)(?:\s+it)?$/i.test(cleaned)) return true;
        if (/^(?:never\s*mind|nevermind)$/i.test(cleaned)) return true;
        if (/^(?:forget\s*it|forget\s+about\s+it)$/i.test(cleaned)) return true;
        if (/^(?:abort|stop)$/i.test(cleaned)) return true;

        return false;
    };

    // Helper: resolve active pending task proposal across context and conversation history
    const findActivePendingProposal = () => {
        if (context?.pendingProposal) return context.pendingProposal;
        if (context?.suggestedAction?.taskData) return context.suggestedAction.taskData;
        if (context?.pendingTaskDraft) return context.pendingTaskDraft;

        if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const h = conversationHistory[i];
                if (!h) continue;

                if (h.role === "assistant") {
                    if (
                        h.context?.proposalCancelled ||
                        /won't create|won't complete|cancelled|success!\s*created\s*task|marked\s+.*as\s+completed/i.test(h.content || "")
                    ) {
                        return null;
                    }
                    if (h.suggestedAction?.taskData) {
                        return h.suggestedAction.taskData;
                    }
                    if (h.context?.pendingProposal) {
                        return h.context.pendingProposal;
                    }
                    if (h.context?.pendingTaskDraft) {
                        return h.context.pendingTaskDraft;
                    }
                    if (typeof h.content === "string") {
                        const confirmMatch =
                            h.content.match(/🦆?\s*Create\s+['"‘“](.+?)['"’”]/i) ||
                            h.content.match(/Create\s+['"‘“](.+?)['"’”]\s+with/i);
                        if (confirmMatch) {
                            return { type: "create_task", title: confirmMatch[1].trim() };
                        }

                        const completeMatch =
                            h.content.match(/🦆?\s*Mark\s+['"‘“](.+?)['"’”]\s+as\s+completed\?/i) ||
                            h.content.match(/🦆?\s*Complete\s+['"‘“](.+?)['"’”]\?/i);
                        if (completeMatch) {
                            return { type: "complete_task", action: "complete_task", title: completeMatch[1].trim() };
                        }

                        const missingProjectMatch = h.content.match(/Which project should I add\s+['"‘“](.+?)['"’”]\s+to\?/i);
                        if (missingProjectMatch) {
                            return { type: "create_task", title: missingProjectMatch[1].trim() };
                        }
                    }
                    return null;
                }
            }
        }

        return null;
    };

    // 2. User gives negative confirmation (e.g. "no", "cancel", "don't create it", "never mind"):
    if (isNegativeConfirmation(rawText)) {
        const pendingProposal = findActivePendingProposal();
        if (pendingProposal) {
            const isCompleteProposal =
                pendingProposal.type === "complete_task" ||
                pendingProposal.action === "complete_task";
            const taskTitle = pendingProposal.title ? `'${pendingProposal.title}'` : "that task";
            const verb = isCompleteProposal ? "complete" : "create";
            return {
                reply: `🦆 Okay, I won't ${verb} ${taskTitle}.`,
                emotion: "happy",
                suggestedAction: null,
                context: {
                    projectId: effectiveProjectId,
                    taskId: effectiveTaskId,
                    pendingTaskDraft: null,
                    pendingProposal: null,
                    proposalCancelled: true
                }
            };
        } else {
            return {
                reply: "🦆 Understood! Let me know if there's anything else you'd like me to help with.",
                emotion: "happy",
                suggestedAction: null,
                context: {
                    projectId: effectiveProjectId,
                    taskId: effectiveTaskId,
                    pendingTaskDraft: null,
                    pendingProposal: null,
                    proposalCancelled: true
                }
            };
        }
    }

    // 3. User confirms task action/creation via text (e.g. "yes", "confirm", "create it", "do it"):
    if (/^(?:yes|confirm|create it|go ahead|proceed|sure|do it|complete it)\b/i.test(lower)) {
        let pendingProposal = findActivePendingProposal();

        if (pendingProposal) {
            // A. Complete Task Proposal Confirmation
            if (pendingProposal.type === "complete_task" || pendingProposal.action === "complete_task") {
                let targetTaskId = pendingProposal.taskId;
                let targetTaskTitle = pendingProposal.title;

                if (!targetTaskId && targetTaskTitle) {
                    const resolved = await findAccessibleTaskByTitle({
                        title: targetTaskTitle,
                        userId,
                        contextProjectId: effectiveProjectId
                    });
                    if (resolved.found) {
                        targetTaskId = resolved.taskId;
                        targetTaskTitle = resolved.task.title;
                    }
                }

                if (targetTaskId) {
                    const updatedTask = await prisma.tasks.update({
                        where: { id: targetTaskId },
                        data: { status: "Completed" },
                        include: {
                            projects: { select: { id: true, title: true } }
                        }
                    });

                    emitRealtimeEvent({
                        type: "task.updated",
                        projectId: updatedTask.project_id,
                        taskId: updatedTask.id,
                        userId: updatedTask.assigned_to || userId,
                        data: updatedTask
                    });

                    return {
                        reply: `🦆 **Done!** Marked **"${updatedTask.title}"** as completed.`,
                        emotion: "excited",
                        suggestedAction: null,
                        context: {
                            projectId: updatedTask.project_id || effectiveProjectId,
                            taskId: updatedTask.id,
                            pendingProposal: null,
                            pendingTaskDraft: null,
                            proposalCancelled: false
                        }
                    };
                }
            }

            // B. Create Task Proposal Confirmation
            if (pendingProposal.projectId) {
                const { title, priority, dueDate, dueDateFormatted, description, status, estimatedHours, projectId, projectTitle } = pendingProposal;
                const createdTask = await createTask(
                    projectId,
                    userId,
                    title,
                    description || null,
                    priority || "Medium",
                    status || "To Do",
                    null,
                    dueDate || null,
                    estimatedHours || null,
                    userId
                );

                emitRealtimeEvent({
                    type: "task.created",
                    projectId: createdTask.project_id || projectId,
                    taskId: createdTask.id,
                    userId: createdTask.assigned_to || userId,
                    data: createdTask
                });

                return {
                    reply: `🦆 **Success!** Created task **"${title}"** in project **${projectTitle || "current project"}**.\n\n• **Priority:** ${priority}\n• **Due date:** ${dueDateFormatted || "No due date"}`,
                    emotion: "excited",
                    suggestedAction: null,
                    context: {
                        projectId,
                        pendingProposal: null,
                        pendingTaskDraft: null,
                        proposalCancelled: false
                    }
                };
            }
        }
    }

    // 3B. What-If Simulation Intent (Section 10)
    // Matches: "What if I complete API Testing today?", "What happens if we finish the blocker?",
    // "What if the deadline moves by 3 days?", "What if we change this task to High priority?",
    // "Simulate completing API Testing", "Suppose we complete API Testing", etc.
    const isWhatIfIntent =
        /^(?:what\s+if|suppose|simulate|what\s+happens\s+if)\b/i.test(lower) ||
        /\b(?:what\s+if|what\s+happens\s+if|what\s+would\s+happen\s+if|simulate\s+completing|suppose\s+we)\b/i.test(lower);

    if (isWhatIfIntent) {
        const queryParams = await parseWhatIfQuery({ text: rawText, context, userId });
        let targetProjectId = effectiveProjectId;

        // If a task title is referenced in the simulation query, resolve it canonical & context-aware
        if (queryParams?.targetTaskTitle) {
            const resolvedTask = await findAccessibleTaskByTitle({
                title: queryParams.targetTaskTitle,
                userId,
                contextProjectId: effectiveProjectId,
                pageContext: context?.pageContext || context?.page
            });

            if (!resolvedTask.found) {
                if (resolvedTask.reason === "AMBIGUOUS") {
                    const projectList = resolvedTask.duplicates
                        .map((d) => `• **${d.projects?.title || "Unknown Project"}** (Status: ${d.status}, Priority: ${d.priority})`)
                        .join("\n");
                    return {
                        reply: `🦆 I found multiple tasks named "${resolvedTask.title}" across different projects:\n\n${projectList}\n\nPlease specify which project you'd like to simulate.`,
                        emotion: "thinking",
                        context: {
                            projectId: effectiveProjectId,
                            taskId: effectiveTaskId
                        }
                    };
                }

                // If nonexistent task, return clean not-found response (Requirement 12D)
                return {
                    reply: `🦆 I couldn't find a task named "${queryParams.targetTaskTitle}". Please check the task name and try again.`,
                    emotion: "thinking",
                    context: {
                        projectId: effectiveProjectId,
                        taskId: effectiveTaskId
                    }
                };
            }

            // Exactly resolved task!
            targetProjectId = resolvedTask.projectId;
            queryParams.taskId = resolvedTask.taskId;
            queryParams.targetTaskTitle = resolvedTask.task.title;
        }

        // If targetProjectId is still unknown (e.g. project-level simulation: "What if the deadline moves by 3 days?")
        if (!targetProjectId) {
            const accessibleProjects = await getUserAccessibleProjects(userId);

            // A. Check if project title is mentioned in prompt
            for (const p of accessibleProjects) {
                const pattern = new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                if (pattern.test(rawText)) {
                    targetProjectId = p.id;
                    break;
                }
            }

            // B. Fallback: single project or highest risk project
            if (!targetProjectId) {
                if (accessibleProjects.length === 1) {
                    targetProjectId = accessibleProjects[0].id;
                } else if (accessibleProjects.length > 1) {
                    const analyses = await Promise.all(
                        accessibleProjects.map(async (p) => {
                            try {
                                return await analyzeProjectRisk(p.id, userId);
                            } catch {
                                return null;
                            }
                        })
                    );
                    const valid = analyses.filter(Boolean);
                    if (valid.length > 0) {
                        valid.sort((a, b) => b.riskScore - a.riskScore);
                        targetProjectId = valid[0].projectId;
                    } else {
                        targetProjectId = accessibleProjects[0].id;
                    }
                }
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to run a what-if simulation on. Please select a project or create project tasks first.",
                emotion: "thinking",
                context: {}
            };
        }

        const simulation = await simulateWhatIf({
            userId,
            projectId: targetProjectId,
            scenario: queryParams?.scenario || "complete_task",
            taskId: queryParams?.taskId || effectiveTaskId,
            targetTaskTitle: queryParams?.targetTaskTitle,
            priority: queryParams?.priority,
            daysOffset: queryParams?.daysOffset,
            newDate: queryParams?.newDate,
            startOfToday: getStartOfToday()
        });

        return {
            reply: simulation.reply,
            emotion: simulation.emotion,
            data: simulation,
            meta: { simulation },
            context: {
                projectId: targetProjectId,
                taskId: queryParams?.taskId || effectiveTaskId
            }
        };
    }

    // 3C. Task Action Intent: Complete / Mark as completed (Requirement 11 & Case C)
    // Matches: "Complete API Testing", "Mark API Testing as completed", "Finish API Testing", etc.
    // Disambiguated from What-If because What-If was already handled above.
    const completeActionMatch =
        rawText.match(/^(?:please\s+|can\s+you\s+please\s+|can\s+you\s+)?(?:mark|set)\s+(?:the\s+task\s+|task\s+|a\s+task\s+)?(.+?)\s+as\s+(?:completed?|done)\??$/i) ||
        rawText.match(/^(?:please\s+|can\s+you\s+please\s+|can\s+you\s+)?(?:complete|finish|close)\s+(?:the\s+task\s+|task\s+|a\s+task\s+)?(.+?)\??$/i);

    if (completeActionMatch) {
        let taskTitleToComplete = completeActionMatch[1]
            .replace(/['"‘“](.+?)['"’”]/, "$1")
            .replace(/[.,!?;:]+$/, "")
            .trim();

        if (taskTitleToComplete && !/^(?:all|everything|project)$/i.test(taskTitleToComplete)) {
            const resolved = await findAccessibleTaskByTitle({
                title: taskTitleToComplete,
                userId,
                contextProjectId: effectiveProjectId,
                pageContext: context?.pageContext || context?.page
            });

            if (!resolved.found) {
                if (resolved.reason === "AMBIGUOUS") {
                    const projectList = resolved.duplicates
                        .map((d) => `• **${d.projects?.title || "Unknown Project"}** (Status: ${d.status}, Priority: ${d.priority})`)
                        .join("\n");
                    return {
                        reply: `🦆 I found multiple tasks named "${resolved.title}" across different projects:\n\n${projectList}\n\nPlease specify which project's task you'd like to mark as completed.`,
                        emotion: "thinking",
                        context: {
                            projectId: effectiveProjectId,
                            taskId: effectiveTaskId
                        }
                    };
                }

                return {
                    reply: `🦆 I couldn't find a task named "${taskTitleToComplete}". Please check the task name and try again.`,
                    emotion: "thinking",
                    context: {
                        projectId: effectiveProjectId,
                        taskId: effectiveTaskId
                    }
                };
            }

            // Task found: ask for confirmation BEFORE writing to DB (Requirement 11 & Case C)
            const matchedTask = resolved.task;
            return {
                reply: `🦆 Mark '${matchedTask.title}' as completed?`,
                emotion: "thinking",
                suggestedAction: {
                    type: "complete_task",
                    action: "complete_task",
                    taskId: matchedTask.id,
                    title: matchedTask.title,
                    projectId: matchedTask.project_id,
                    projectTitle: resolved.projectTitle
                },
                context: {
                    projectId: matchedTask.project_id,
                    taskId: matchedTask.id,
                    pendingProposal: {
                        type: "complete_task",
                        action: "complete_task",
                        taskId: matchedTask.id,
                        title: matchedTask.title,
                        projectId: matchedTask.project_id,
                        projectTitle: resolved.projectTitle
                    },
                    proposalCancelled: false
                }
            };
        }
    }

    // 4. Action / Task Creation intent (generalized):
    const getActivePendingDraft = () => {
        if (context?.pendingTaskDraft) return context.pendingTaskDraft;
        if (context?.pendingTaskDraft === null) return null;
        if (Array.isArray(conversationHistory)) {
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const h = conversationHistory[i];
                if (h.role === "assistant") {
                    if (
                        h.context?.proposalCancelled ||
                        h.context?.pendingTaskDraft === null ||
                        /won't create|cancelled|success!\s*created\s*task/i.test(h.content || "")
                    ) {
                        return null;
                    }
                }
                if (h.context?.pendingTaskDraft) {
                    return h.context.pendingTaskDraft;
                }
            }
        }
        return null;
    };

    const hasPendingDraft = Boolean(getActivePendingDraft());
    const isTaskCreationRequest = () => {
        if (/^(?:how\s+(?:do|can|to)|who\s+created|where\s+can\s+i\s+create)\b/i.test(rawText)) {
            return false;
        }
        if (/^(?:please\s+)?(?:create|add|schedule|make|new)\b/i.test(rawText)) {
            return true;
        }
        if (/\b(?:create|add|make)\s+(?:a\s+)?(?:(?:low|medium|high|critical)\s+priority\s+)?task\b/i.test(rawText)) {
            return true;
        }
        if (hasPendingDraft) {
            return true;
        }
        return false;
    };

    if (isTaskCreationRequest()) {
        const proposal = await parseTaskCreationProposal({
            text: rawText,
            context: { ...context, projectId: effectiveProjectId },
            userId,
            conversationHistory
        });

        return {
            reply: proposal.message,
            emotion: proposal.emotion,
            suggestedAction: proposal.readyForConfirmation ? proposal : null,
            context: {
                projectId: proposal.taskData?.projectId || effectiveProjectId,
                taskId: effectiveTaskId,
                pendingTaskDraft: proposal.context?.pendingTaskDraft || null,
                pendingProposal: proposal.readyForConfirmation ? proposal.taskData : null,
                proposalCancelled: false
            }
        };
    }

    // 3. Overdue work intent:
    if (/overdue|late|behind\s+schedule|missed\s+deadline|what is overdue|show my overdue/i.test(lower)) {
        const overdueResult = await getOverdueTasks({
            userId,
            projectId: effectiveProjectId
        });
        return {
            reply: overdueResult.message,
            emotion: overdueResult.emotion,
            data: overdueResult,
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 4. Smart Task Prioritization Intent (Section 11)
    // Matches: "What should I work on first?", "What should I do next?", "Which task is most important?",
    // "What should I prioritize?", "Which task needs my attention?", "What should I work on next?"
    const isPriorityIntent =
        /what\s+should\s+i\s+work\s+on\s+first/i.test(lower) ||
        /work\s+on\s+first/i.test(lower) ||
        /what\s+should\s+i\s+do\s+next/i.test(lower) ||
        /what\s+should\s+i\s+work\s+on\s+next/i.test(lower) ||
        /work\s+on\s+next/i.test(lower) ||
        /which\s+task\s+is\s+most\s+important/i.test(lower) ||
        /most\s+important\s+task/i.test(lower) ||
        /most\s+important/i.test(lower) ||
        /which\s+task\s+needs\s+(?:my\s+)?attention/i.test(lower) ||
        /what\s+needs\s+(?:my\s+)?attention/i.test(lower) ||
        /what\s+should\s+i\s+prioritize/i.test(lower) ||
        /how\s+should\s+i\s+prioritize/i.test(lower) ||
        /what\s+to\s+prioritize/i.test(lower) ||
        /prioritize\s+(?:my\s+)?tasks/i.test(lower) ||
        /task\s+priorit(?:y|ization)/i.test(lower) ||
        /next\s+task/i.test(lower) ||
        /do\s+next/i.test(lower);

    if (isPriorityIntent) {
        const prioritized = await getQuackiePrioritizedTasks({
            userId,
            projectId: effectiveProjectId,
            taskId: effectiveTaskId,
            context: context?.page || "my-tasks"
        });

        return {
            reply: prioritized.message,
            emotion: prioritized.emotion,
            data: prioritized,
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 4B. Focus Mode / Daily Mission Intent:
    const isFocusIntent =
        /what\s+should\s+i\s+focus\s+on\s+today/i.test(lower) ||
        /what\s+should\s+i\s+work\s+on\s+today/i.test(lower) ||
        /what\s+should\s+i\s+do\s+today/i.test(lower) ||
        /what\s+should\s+i\s+focus\s+on\b/i.test(lower) ||
        /what\s+should\s+we\s+focus\s+on\b/i.test(lower) ||
        /what\s+to\s+focus\s+on\b/i.test(lower) ||
        /give\s+me\s+(?:my\s+)?daily\s+mission/i.test(lower) ||
        /daily\s+mission/i.test(lower) ||
        /plan\s+my\s+day/i.test(lower) ||
        /work\s+plan/i.test(lower) ||
        /focus\s+mode/i.test(lower) ||
        /focus\s+on\s+today/i.test(lower);

    if (isFocusIntent) {
        const mission = await getFocusDailyMission({
            userId,
            projectId: effectiveProjectId,
            taskId: effectiveTaskId,
            page: context?.page
        });
        return {
            reply: mission.message,
            emotion: mission.emotion,
            data: mission,
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 5. Weekly capacity / "Can I finish everything due this week?" intent:
    if (/finish.*due this week|everything.*this week|can i finish/i.test(lower)) {
        const startOfToday = getStartOfToday();
        const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

        const tasksDueThisWeek = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                due_date: {
                    gte: startOfToday,
                    lte: endOfWeek
                }
            },
            include: {
                projects: { select: { title: true } }
            },
            orderBy: { due_date: "asc" }
        });

        const overdueCount = await getUserOverdueCount(userId);
        const totalEstimatedHours = tasksDueThisWeek.reduce(
            (sum, t) => sum + (Number(t.estimated_hours) || 2),
            0
        );

        let assessment = "";
        let emotion = "thinking";

        if (overdueCount > 0 && tasksDueThisWeek.length > 3) {
            emotion = "worried";
            assessment = `You currently have **${overdueCount} overdue task${overdueCount > 1 ? "s" : ""}** on top of **${tasksDueThisWeek.length} tasks** due this week (~${totalEstimatedHours} hours estimated). It will be tight—I recommend clearing the overdue items first or delegating!`;
        } else if (tasksDueThisWeek.length === 0 && overdueCount === 0) {
            emotion = "excited";
            assessment = `You have no tasks due this week and zero overdue work. Your schedule is completely clear!`;
        } else if (tasksDueThisWeek.length <= 3 && overdueCount === 0) {
            emotion = "happy";
            assessment = `Yes! You have ${tasksDueThisWeek.length} task${tasksDueThisWeek.length > 1 ? "s" : ""} due this week (~${totalEstimatedHours} hrs total) and no overdue backlog. Very manageable pace.`;
        } else {
            emotion = "thinking";
            assessment = `You have ${tasksDueThisWeek.length} task${tasksDueThisWeek.length > 1 ? "s" : ""} due this week (~${totalEstimatedHours} hrs total)${overdueCount > 0 ? ` plus ${overdueCount} overdue item${overdueCount > 1 ? "s" : ""}` : ""}. Stay focused and tackle the highest priority items early.`;
        }

        let taskList = "";
        if (tasksDueThisWeek.length > 0) {
            taskList = "\n\n**Tasks due this week:**\n" + tasksDueThisWeek.map((t, idx) =>
                `${idx + 1}. **${t.title}** (${t.priority}) · due ${formatDate(t.due_date)} · *${t.projects?.title || "No project"}*`
            ).join("\n");
        }

        return {
            reply: `🦆 **Weekly Feasibility Assessment**\n\n${assessment}${taskList}`,
            emotion,
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 5B. Project X-Ray Intent:
    // Matches: "Give me a project X-Ray", "Analyze this project", "What's happening in this project?",
    // "Give me a complete project overview", "How is this project doing?", "Project X-Ray", "Project diagnostic"
    const isProjectXRayQuery =
        /\b(?:x-?ray|project\s+x-?ray)\b/i.test(lower) ||
        /give\s+me\s+(?:a\s+)?(?:project\s+)?x-?ray/i.test(lower) ||
        /analyze\s+this\s+project/i.test(lower) ||
        /what'?s\s+happening\s+in\s+this\s+project/i.test(lower) ||
        /what\s+is\s+happening\s+in\s+this\s+project/i.test(lower) ||
        /complete\s+project\s+overview/i.test(lower) ||
        /how\s+is\s+this\s+project\s+doing/i.test(lower) ||
        /project\s+diagnostic/i.test(lower);

    if (isProjectXRayQuery) {
        let targetProjectId = effectiveProjectId;

        if (!targetProjectId) {
            const accessibleProjects = await getUserAccessibleProjects(userId);

            // 1. Check if user mentioned a specific project title
            for (const p of accessibleProjects) {
                const pattern = new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                if (pattern.test(rawText)) {
                    targetProjectId = p.id;
                    break;
                }
            }

            // 2. If still unselected:
            if (!targetProjectId) {
                if (accessibleProjects.length === 0) {
                    return {
                        reply: "🦆 There are no active projects to generate an X-Ray for.",
                        emotion: "curious",
                        context: {}
                    };
                }
                if (accessibleProjects.length === 1) {
                    targetProjectId = accessibleProjects[0].id;
                } else {
                    // Analyze accessible projects and select the highest risk project
                    const analyses = await Promise.all(
                        accessibleProjects.map(async (p) => {
                            try {
                                return await getProjectXRay(p.id, userId);
                            } catch {
                                return null;
                            }
                        })
                    );
                    const validAnalyses = analyses.filter(Boolean);
                    if (validAnalyses.length === 0) {
                        return {
                            reply: "🦆 There are no active projects to generate an X-Ray for.",
                            emotion: "curious",
                            context: {}
                        };
                    }

                    validAnalyses.sort((a, b) => b.health.riskScore - a.health.riskScore);
                    const highestRiskXRay = validAnalyses[0];
                    const otherProjects = validAnalyses.slice(1);
                    const note = `*Active context: No project selected. Generating X-Ray for your highest-risk project (**${highestRiskXRay.project.title}**). (Other projects: ${otherProjects.map((p) => `${p.project.title} [${p.health.riskLevel}]`).join(", ")})*`;

                    const reply = formatProjectXRayReply(highestRiskXRay, note);
                    let emotion = "happy";
                    if (highestRiskXRay.health.riskLevel === "CRITICAL" || highestRiskXRay.health.riskLevel === "HIGH") {
                        emotion = "worried";
                    } else if (highestRiskXRay.health.riskLevel === "MEDIUM") {
                        emotion = "thinking";
                    } else if (highestRiskXRay.health.riskScore === 0) {
                        emotion = highestRiskXRay.health.completionPercentage === 100 ? "excited" : "happy";
                    }

                    return {
                        reply,
                        emotion,
                        data: highestRiskXRay,
                        meta: { xray: highestRiskXRay },
                        context: { projectId: highestRiskXRay.project.id, taskId: effectiveTaskId }
                    };
                }
            }
        }

        const xray = await getProjectXRay(targetProjectId, userId);
        const reply = formatProjectXRayReply(xray);
        let emotion = "happy";
        if (xray.health.riskLevel === "CRITICAL" || xray.health.riskLevel === "HIGH") {
            emotion = "worried";
        } else if (xray.health.riskLevel === "MEDIUM") {
            emotion = "thinking";
        } else if (xray.health.riskScore === 0) {
            emotion = xray.health.completionPercentage === 100 ? "excited" : "happy";
        }

        return {
            reply,
            emotion,
            data: xray,
            meta: { xray },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5C. Critical Path Intent:
    // Matches: "What is our critical path?", "Show critical path", "Critical path",
    // "Which tasks are on the critical path?", "What is on the critical path?"
    const isCriticalPathQuery =
        /\b(?:critical\s+path|critical-path)\b/i.test(lower) ||
        /what\s+is\s+(?:our|the)\s+critical\s+path/i.test(lower) ||
        /show\s+(?:me\s+)?(?:the\s+)?critical\s+path/i.test(lower) ||
        /which\s+tasks?\s+(?:are\s+on\s+the|is\s+on\s+the)\s+critical\s+path/i.test(lower);

    if (isCriticalPathQuery) {
        let targetProjectId = effectiveProjectId;

        if (!targetProjectId) {
            const accessibleProjects = await getUserAccessibleProjects(userId);
            for (const p of accessibleProjects) {
                const pattern = new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                if (pattern.test(rawText)) {
                    targetProjectId = p.id;
                    break;
                }
            }
            if (!targetProjectId) {
                if (accessibleProjects.length === 0) {
                    return {
                        reply: "🦆 There are no active projects to calculate a Critical Path for.",
                        emotion: "curious",
                        context: {}
                    };
                }
                if (accessibleProjects.length === 1) {
                    targetProjectId = accessibleProjects[0].id;
                } else {
                    targetProjectId = accessibleProjects[0].id;
                }
            }
        }

        const summary = await getQuackieCriticalPathSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { criticalPath: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5D. Project Bottlenecks Intent:
    // Matches: "What is the biggest bottleneck?", "What is blocking this project?",
    // "Which task is delaying us?", "Show bottlenecks", "What are the bottlenecks?"
    const isBottleneckQuery =
        /\bbottlenecks?\b/i.test(lower) ||
        /what\s+is\s+(?:the|our)\s+(?:biggest\s+)?bottleneck/i.test(lower) ||
        /what\s+is\s+blocking\s+(?:this\s+)?project/i.test(lower) ||
        /which\s+task\s+is\s+delaying\s+us/i.test(lower) ||
        /show\s+(?:me\s+)?(?:the\s+)?bottlenecks?/i.test(lower);

    if (isBottleneckQuery) {
        let targetProjectId = effectiveProjectId;

        if (!targetProjectId) {
            const accessibleProjects = await getUserAccessibleProjects(userId);
            for (const p of accessibleProjects) {
                const pattern = new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                if (pattern.test(rawText)) {
                    targetProjectId = p.id;
                    break;
                }
            }
            if (!targetProjectId) {
                if (accessibleProjects.length === 0) {
                    return {
                        reply: "🦆 There are no active projects to detect bottlenecks for.",
                        emotion: "curious",
                        context: {}
                    };
                }
                if (accessibleProjects.length === 1) {
                    targetProjectId = accessibleProjects[0].id;
                } else {
                    targetProjectId = accessibleProjects[0].id;
                }
            }
        }

        const summary = await getQuackieBottleneckSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { bottlenecks: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 6. Predictive Project Risk & Delays Intent:
    // Matches: "What are the biggest risks?", "What's putting this project at risk?",
    // "Is this project at risk?", "Why is this project behind?", "What's delaying this project?",
    // "What is delaying this project?", "Project risk", etc.
    const isProjectRiskQuery =
        /what\s+are\s+the\s+biggest\s+risks/i.test(lower) ||
        /what'?s\s+putting\s+(?:this\s+)?project\s+at\s+risk/i.test(lower) ||
        /what\s+is\s+putting\s+(?:this\s+)?project\s+at\s+risk/i.test(lower) ||
        /what'?s\s+putting\s+.+\s+at\s+risk/i.test(lower) ||
        /what\s+is\s+putting\s+.+\s+at\s+risk/i.test(lower) ||
        /is\s+(?:this\s+)?project\s+at\s+risk/i.test(lower) ||
        /is\s+.+\s+at\s+risk/i.test(lower) ||
        /why\s+is\s+(?:this\s+)?project\s+behind/i.test(lower) ||
        /why\s+is\s+.+\s+behind/i.test(lower) ||
        /what'?s\s+delaying\s+this\s+project/i.test(lower) ||
        /what\s+is\s+delaying\s+this\s+project/i.test(lower) ||
        /what'?s\s+delaying\s+/i.test(lower) ||
        /what\s+is\s+delaying\s+/i.test(lower) ||
        /delaying\s+this\s+project/i.test(lower) ||
        /what\s+are\s+the\s+risks/i.test(lower) ||
        /biggest\s+risks/i.test(lower) ||
        /project\s+risks?/i.test(lower) ||
        /\bat\s+risk\b/i.test(lower) ||
        /project\s+behind/i.test(lower);

    if (isProjectRiskQuery) {
        let targetProjectId = effectiveProjectId;

        if (!targetProjectId) {
            const accessibleProjects = await getUserAccessibleProjects(userId);

            // 1. Check if user mentioned a specific project title in their prompt
            for (const p of accessibleProjects) {
                const pattern = new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                if (pattern.test(rawText)) {
                    targetProjectId = p.id;
                    break;
                }
            }

            // 2. If still unselected:
            if (!targetProjectId) {
                if (accessibleProjects.length === 0) {
                    return {
                        reply: "🦆 There are no active projects to check risks for.",
                        emotion: "curious",
                        context: {}
                    };
                }
                if (accessibleProjects.length === 1) {
                    targetProjectId = accessibleProjects[0].id;
                } else {
                    // Analyze all accessible projects and summarize the highest-risk project
                    const analyses = await Promise.all(
                        accessibleProjects.map(async (p) => {
                            try {
                                return await analyzeProjectRisk(p.id, userId);
                            } catch {
                                return null;
                            }
                        })
                    );
                    const validAnalyses = analyses.filter(Boolean);
                    if (validAnalyses.length === 0) {
                        return {
                            reply: "🦆 There are no active projects to analyze risks for.",
                            emotion: "curious",
                            context: {}
                        };
                    }

                    validAnalyses.sort((a, b) => b.riskScore - a.riskScore);
                    const highestRisk = validAnalyses[0];
                    const otherProjects = validAnalyses.slice(1);
                    const note = `*Active context: No project selected. Analyzing your highest-risk project (**${highestRisk.projectTitle}**). (Other projects: ${otherProjects.map((p) => `${p.projectTitle} [${p.riskLevel}]`).join(", ")})*`;

                    const reply = formatProjectRiskReply(highestRisk, note);
                    let emotion = "happy";
                    if (highestRisk.riskLevel === "CRITICAL" || highestRisk.riskLevel === "HIGH") {
                        emotion = "worried";
                    } else if (highestRisk.riskLevel === "MEDIUM") {
                        emotion = "thinking";
                    } else if (highestRisk.riskScore === 0) {
                        emotion = highestRisk.metrics?.completionPercentage === 100 ? "excited" : "happy";
                    }

                    return {
                        reply,
                        emotion,
                        data: highestRisk,
                        context: { projectId: highestRisk.projectId, taskId: effectiveTaskId }
                    };
                }
            }
        }

        const riskSummary = await getQuackieProjectRiskSummary({
            projectId: targetProjectId,
            userId
        });

        return {
            reply: riskSummary.message,
            emotion: riskSummary.emotion,
            data: riskSummary,
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 7. Team / Project focus intent ("What should we focus on?"):
    if (/what should we focus on|what to focus on|team focus/i.test(lower)) {
        if (effectiveProjectId) {
            const blockers = await getProjectBlockers({ projectId: effectiveProjectId, userId });
            return {
                reply: `🦆 **Recommended Focus for ${blockers.projectTitle}:**\n\n1. **Resolve Critical Delays:** ${blockers.overdueCount > 0 ? `Clear the ${blockers.overdueCount} overdue tasks immediately.` : "No overdue tasks delaying the team."}\n2. **Active Work:** Focus on in-progress tasks to avoid context-switching.\n3. **Unblock Dependencies:** Ensure prerequisites are completed before starting downstream tasks.`,
                emotion: "thinking",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        } else {
            const rec = await recommendNextTask({ userId });
            return {
                reply: `🦆 **Recommended Focus:**\n\n${rec.message}`,
                emotion: rec.emotion,
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }
    }

    // 8. Explain task intent ("Explain this task"):
    if (/explain this task|what is this task|tell me about this task|about this task/i.test(lower)) {
        if (!effectiveTaskId) {
            return {
                reply: "🦆 Please select or open a specific task first so I can explain its details, status, and subtasks for you.",
                emotion: "curious",
                context: { projectId: effectiveProjectId }
            };
        }

        const task = await prisma.tasks.findUnique({
            where: { id: effectiveTaskId },
            include: {
                projects: { select: { title: true } },
                users_tasks_assigned_toTousers: { select: { first_name: true, last_name: true } },
                subtasks: true
            }
        });

        if (!task) {
            return {
                reply: "🦆 Task not found. It might have been deleted or archived.",
                emotion: "confused",
                context: {}
            };
        }

        const completedSubtasks = task.subtasks.filter((s) => s.status === "Completed").length;
        const totalSubtasks = task.subtasks.length;
        const progressPct = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
        const assignee = task.users_tasks_assigned_toTousers
            ? `${task.users_tasks_assigned_toTousers.first_name} ${task.users_tasks_assigned_toTousers.last_name}`
            : "Unassigned";

        const startOfToday = getStartOfToday();
        const isOverdue = task.due_date && new Date(task.due_date) < startOfToday && task.status !== "Completed";

        let reply = `🦆 **${task.title}**\n\n`;
        reply += `• **Project:** ${task.projects?.title || "None"}\n`;
        reply += `• **Status:** ${task.status} ${isOverdue ? "*(OVERDUE)*" : ""}\n`;
        reply += `• **Priority:** ${task.priority}\n`;
        reply += `• **Due Date:** ${formatDate(task.due_date)}\n`;
        reply += `• **Assignee:** ${assignee}\n`;
        if (totalSubtasks > 0) {
            reply += `• **Subtasks:** ${completedSubtasks}/${totalSubtasks} completed (${progressPct}%)\n`;
        }
        if (task.description) {
            reply += `\n**Description:**\n${task.description}\n`;
        }

        return {
            reply: reply.trim(),
            emotion: isOverdue ? "worried" : "thinking",
            context: { projectId: task.project_id, taskId: task.id }
        };
    }

    // 9. Task blocker intent ("What is blocking this task?"):
    if (/blocking this task|is this task blocked|blocking|what is blocking/i.test(lower) && effectiveTaskId) {
        const deps = await prisma.task_dependencies.findMany({
            where: { task_id: effectiveTaskId },
            include: {
                tasks_task_dependencies_depends_on_task_idTotasks: true
            }
        });

        const blockingTasks = deps
            .map((d) => d.tasks_task_dependencies_depends_on_task_idTotasks)
            .filter((t) => t && t.status !== "Completed");

        if (blockingTasks.length === 0) {
            return {
                reply: "🦆 This task is not blocked by any dependencies. You're clear to proceed!",
                emotion: "excited",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }

        let reply = `🦆 **This task is blocked by ${blockingTasks.length} uncompleted prerequisite${blockingTasks.length > 1 ? "s" : ""}:**\n\n`;
        blockingTasks.forEach((t, i) => {
            reply += `${i + 1}. **${t.title}** (${t.status}) · due ${formatDate(t.due_date)}\n`;
        });
        reply += "\nPlease complete these dependencies first.";

        return {
            reply: reply.trim(),
            emotion: "worried",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 10. Summarize subtasks intent ("Summarize its subtasks"):
    if (/summarize.*subtasks|subtask summary|show subtasks|its subtasks/i.test(lower) && effectiveTaskId) {
        const subtasks = await prisma.subtasks.findMany({
            where: { task_id: effectiveTaskId },
            orderBy: { created_at: "asc" }
        });

        if (subtasks.length === 0) {
            return {
                reply: "🦆 This task has no subtasks configured.",
                emotion: "thinking",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }

        const completed = subtasks.filter((s) => s.status === "Completed").length;
        let reply = `🦆 **Subtasks Breakdown (${completed}/${subtasks.length} Completed):**\n\n`;
        subtasks.forEach((s, idx) => {
            reply += `${idx + 1}. [${s.status === "Completed" ? "x" : " "}] **${s.title}** (${s.status})${s.due_date ? ` · due ${formatDate(s.due_date)}` : ""}\n`;
        });

        return {
            reply: reply.trim(),
            emotion: completed === subtasks.length ? "excited" : "thinking",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 11. Workload attention intent ("What needs attention?"):
    if (/what needs attention|needs attention|urgent/i.test(lower)) {
        const overdueTasks = await getUserOverdueTasks(userId, effectiveProjectId);
        const highPriority = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                priority: { in: ["High", "Critical"] }
            },
            take: 5,
            include: { projects: { select: { title: true } } }
        });

        if (overdueTasks.length === 0 && highPriority.length === 0) {
            return {
                reply: "🦆 Everything is in great shape! No overdue items or urgent high-priority tasks requiring attention.",
                emotion: "excited",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }

        let reply = "🦆 **Items Needing Your Immediate Attention:**\n\n";
        if (overdueTasks.length > 0) {
            reply += `**⚠️ Overdue (${overdueTasks.length}):**\n`;
            overdueTasks.slice(0, 3).forEach((t) => {
                reply += `• **${t.title}** (due ${formatDate(t.due_date)})\n`;
            });
            reply += "\n";
        }
        if (highPriority.length > 0) {
            reply += `**🔥 High Priority Active (${highPriority.length}):**\n`;
            highPriority.forEach((t) => {
                reply += `• **${t.title}** [${t.priority}] · *${t.projects?.title || "No project"}*\n`;
            });
        }

        return {
            reply: reply.trim(),
            emotion: "worried",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 12. Workload summary intent ("Summarize my workload"):
    if (/summarize my workload|workload summary|workload/i.test(lower)) {
        const activeTasks = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" }
            },
            include: { projects: { select: { title: true } } }
        });

        const overdueCount = await getUserOverdueCount(userId);
        const highPriorityCount = activeTasks.filter((t) => t.priority === "High" || t.priority === "Critical").length;
        const inProgressCount = activeTasks.filter((t) => t.status === "In Progress").length;
        const toDoCount = activeTasks.filter((t) => t.status === "To Do").length;

        let reply = `🦆 **Your Workload Summary:**\n\n`;
        reply += `• **Total Active Tasks:** ${activeTasks.length}\n`;
        reply += `• **In Progress:** ${inProgressCount}\n`;
        reply += `• **To Do:** ${toDoCount}\n`;
        reply += `• **Overdue:** ${overdueCount}\n`;
        reply += `• **High/Critical Priority:** ${highPriorityCount}\n\n`;

        if (overdueCount > 0) {
            reply += `⚠️ *Action recommendation:* Clear your ${overdueCount} overdue item${overdueCount > 1 ? "s" : ""} first to reduce schedule risk.`;
        } else if (activeTasks.length === 0) {
            reply += `🎉 *Status:* You have no pending tasks. Enjoy your clean slate!`;
        } else {
            reply += `👍 *Status:* Healthy workload distribution. Keep up the momentum!`;
        }

        return {
            reply: reply.trim(),
            emotion: overdueCount > 0 ? "worried" : "happy",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 13. Upcoming deadlines intent ("What is due soon?"):
    if (/due soon|upcoming deadlines|what is due soon/i.test(lower)) {
        const startOfToday = getStartOfToday();
        const dueSoonLimit = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

        const tasks = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                due_date: {
                    gte: startOfToday,
                    lte: dueSoonLimit
                }
            },
            include: { projects: { select: { title: true } } },
            orderBy: { due_date: "asc" }
        });

        if (tasks.length === 0) {
            return {
                reply: "🦆 You have no deadlines due in the next 7 days.",
                emotion: "happy",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }

        let reply = `🦆 **Due in the Next 7 Days (${tasks.length}):**\n\n`;
        tasks.forEach((t, i) => {
            reply += `${i + 1}. **${t.title}** (${t.priority})\n   Due: ${formatDate(t.due_date)} · Project: ${t.projects?.title || "None"}\n\n`;
        });

        return {
            reply: reply.trim(),
            emotion: "thinking",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 14. Deadline conflicts intent ("Do I have deadline conflicts?"):
    if (/deadline conflicts|conflicts|overlapping deadlines/i.test(lower)) {
        const activeTasks = await prisma.tasks.findMany({
            where: {
                assigned_to: userId,
                is_archived: false,
                status: { not: "Completed" },
                due_date: { not: null }
            },
            select: { id: true, title: true, due_date: true, priority: true }
        });

        const dateMap = {};
        activeTasks.forEach((t) => {
            const d = t.due_date.toISOString().slice(0, 10);
            if (!dateMap[d]) dateMap[d] = [];
            dateMap[d].push(t);
        });

        const conflicts = Object.entries(dateMap).filter(([_, list]) => list.length > 1);

        if (conflicts.length === 0) {
            return {
                reply: "🦆 Good news! You don't have multiple tasks sharing the same deadline.",
                emotion: "excited",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }

        let reply = "🦆 **Detected Deadline Conflicts:**\n\n";
        conflicts.forEach(([d, list]) => {
            reply += `📅 **${formatDate(d)}** (${list.length} tasks):\n`;
            list.forEach((t) => {
                reply += `   • **${t.title}** [${t.priority}]\n`;
            });
            reply += "\n";
        });
        reply += "Consider spacing out these tasks or reprioritizing.";

        return {
            reply: reply.trim(),
            emotion: "worried",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 15. Project blocker intent:
    if (/\b(?:blockers?|blocking|prerequisites?)\b/i.test(lower)) {
        if (!effectiveProjectId) {
            const projects = await getUserAccessibleProjects(userId);
            if (projects.length === 1) {
                effectiveProjectId = projects[0].id;
            } else if (projects.length > 1) {
                return {
                    reply: `🦆 Which project would you like me to check blockers for?\n\n${projects.map((p) => `• **${p.title}**`).join("\n")}`,
                    emotion: "curious",
                    context: {}
                };
            } else {
                return {
                    reply: "🦆 You don't have any active projects yet to analyze blockers for.",
                    emotion: "curious",
                    context: {}
                };
            }
        }

        const blockerResult = await getProjectBlockers({
            projectId: effectiveProjectId,
            userId
        });
        return {
            reply: blockerResult.message,
            emotion: blockerResult.emotion,
            data: blockerResult,
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 16. Project summary intent:
    if (/summarize\s+this\s+project|project\s+summary|summarize|summary|project\s+status|how\s+is\s+the\s+project/i.test(lower)) {
        if (!effectiveProjectId) {
            const projects = await getUserAccessibleProjects(userId);
            let found = null;
            for (const p of projects) {
                if (new RegExp(p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(lower)) {
                    found = p;
                    break;
                }
            }

            if (found) {
                effectiveProjectId = found.id;
            } else if (projects.length === 1) {
                effectiveProjectId = projects[0].id;
            } else if (projects.length > 1) {
                return {
                    reply: `🦆 Which project would you like me to summarize?\n\n${projects.map((p) => `• **${p.title}**`).join("\n")}`,
                    emotion: "curious",
                    context: {}
                };
            } else {
                return {
                    reply: "🦆 You don't have any active projects yet to summarize.",
                    emotion: "curious",
                    context: {}
                };
            }
        }

        const summaryResult = await summarizeProject({
            projectId: effectiveProjectId,
            userId
        });
        return {
            reply: summaryResult.message,
            emotion: summaryResult.emotion,
            data: summaryResult,
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 17. Multi-turn follow-up intent ("What should I do about it?", "How do I fix it?"):
    if (/what\s+should\s+i\s+do\s+about\s+it|how\s+to\s+fix|how\s+can\s+i\s+fix/i.test(lower)) {
        if (effectiveProjectId) {
            const blockerResult = await getProjectBlockers({
                projectId: effectiveProjectId,
                userId
            });
            return {
                reply: `🦆 For **${blockerResult.projectTitle}**, here is the most effective action:\n\n1. Prioritize resolving the overdue items first.\n2. Address any critical risk mitigation plans.\n3. Keep communication active with assignees on blocking tasks.`,
                emotion: "thinking",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        } else {
            const rec = await recommendNextTask({ userId });
            return {
                reply: `🦆 The most impactful step you can take right now is:\n\n${rec.message}`,
                emotion: "thinking",
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            };
        }
    }

    // 18. Optional LLM fallback if configured in environment
    const llmReply = await callLlmProvider({
        systemPrompt: "You are Quackie, the friendly, concise, context-aware project copilot for TaskFlow. Ground your responses solely in the real TaskFlow data provided. If data is insufficient, state honestly: 'I don't have enough TaskFlow data to answer that yet.'",
        prompt: rawText,
        context: { projectId: effectiveProjectId, taskId: effectiveTaskId },
        conversationHistory
    });

    if (llmReply) {
        return {
            reply: llmReply,
            emotion: "happy",
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 19. Honest fallback when question is outside supported scope
    return {
        reply: "🦆 I don't have enough TaskFlow data to answer that yet.\n\nYou can ask me to:\n• *Show my overdue work*\n• *What should I work on next?*\n• *Summarize this project*\n• *What is delaying this project?*\n• *Create a task called [name] due [date]*",
        emotion: "curious",
        context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
    };
};
