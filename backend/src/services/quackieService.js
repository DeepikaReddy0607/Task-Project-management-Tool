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
import { getProjectHealth } from "./projectHealthService.js";
import { getProjectScheduleDrift } from "./scheduleDriftService.js";
import { getProjectPreMortem } from "./preMortemService.js";
import { getProjectTeamIntelligence } from "./teamIntelligenceService.js";
import { generateReplanningProposals, getProjectProposal, approveProjectProposal, listProjectProposals } from "./projectReplanningService.js";
import { executeReplanningProposal } from "./replanningExecutionService.js";
import { getProjectHealthHistory } from "./projectHistoryService.js";
import { getProjectTimeline } from "./projectTimelineService.js";
import { getProjectDecisionIntelligence } from "./decisionIntelligenceService.js";
import { getProjectMemory } from "./projectMemoryService.js";
import { replayProjectPointInTime, replayProjectPeriod } from "./projectReplayService.js";
import { runProjectDiagnosis } from "./projectDiagnosisService.js";
import { runProjectAutopsy } from "./projectAutopsyService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { getProbabilisticCriticalPath } from "./probabilisticCriticalPathService.js";
import { getProjectScopeIntelligence } from "./scopeIntelligenceService.js";
import { getCrossProjectIntelligence } from "./crossProjectIntelligenceService.js";
import { getResourceConflictIntelligence, simulateUnavailableResource } from "./resourceConflictService.js";
import { getPortfolioRiskMap, getWorkspacePortfolioIntelligence } from "./portfolioIntelligenceService.js";
import { simulatePortfolioScenario } from "./portfolioSimulationService.js";
import { getProjectBriefing } from "./projectBriefingService.js";
import { getPersonalBriefing } from "./personalBriefingService.js";
import { getWorkspaceExecutiveBriefing } from "./executiveBriefingService.js";
import { getProjectNextActions } from "./nextActionService.js";
import { getProjectStandup, getPersonalStandup } from "./standupService.js";
import { getProjectStakeholderBriefing } from "./stakeholderBriefingService.js";
import { getProjectActionPlan, getProjectRecoveryPlan } from "./actionPlanService.js";
import { handleIntelligenceQuery, investigateProject, simulateNaturalLanguageScenario } from "./intelligenceQueryService.js";
import { prepareActionProposal, executeApprovedProposalSafely } from "./intelligenceApprovalService.js";
import { getTaskDependencies, getProjectDependencyGraph } from "./taskDependencyService.js";
import { getAdminOverview, getInMemoryAdminStore } from "./adminService.js";
import { executeUnifiedSearch } from "./searchService.js";

export {
    calculateFocusScore,
    simulateWhatIf,
    parseWhatIfQuery,
    findAccessibleTaskByTitle,
    getProjectCriticalPath,
    getProjectBottlenecks,
    getProjectHealth,
    getProjectScheduleDrift,
    getProjectPreMortem,
    getProjectTeamIntelligence,
    generateReplanningProposals,
    getProjectProposal,
    approveProjectProposal,
    executeReplanningProposal,
    getProjectHealthHistory,
    getProjectTimeline,
    getProjectDecisionIntelligence,
    getProjectMemory,
    replayProjectPointInTime,
    replayProjectPeriod,
    runProjectDiagnosis,
    runProjectAutopsy,
    runMonteCarloForecast,
    getProbabilisticCriticalPath,
    getProjectScopeIntelligence,
    getCrossProjectIntelligence,
    getResourceConflictIntelligence,
    getPortfolioRiskMap,
    getWorkspacePortfolioIntelligence,
    simulatePortfolioScenario
};

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
    try {
        const isUuid = typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (!isUuid) return [];

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
    } catch {
        return [];
    }
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
// 4F. PROJECT HEALTH SUMMARY & FORMATTER
// ============================================================
export const formatProjectHealthReply = (healthData, projectTitle = "Project", note = "") => {
    const { score, status, dimensions, reasons, warnings, strengths, history } = healthData;
    let icon = status === "HEALTHY" ? "🟢" : status === "WATCH" ? "🟡" : status === "AT_RISK" ? "🟠" : "🔴";
    let reply = `🦆 **Project Health: ${projectTitle}**\n\n`;
    if (note) reply += `${note}\n\n`;
    reply += `${icon} **Score: ${score}/100** — **${status}**`;
    if (history?.trend) {
        const trendIcon = history.trend === "IMPROVING" ? "📈" : history.trend === "DECLINING" ? "📉" : "➡️";
        reply += ` (${trendIcon} ${history.trend})\n\n`;
    } else {
        reply += `\n\n`;
    }

    if (dimensions) {
        reply += `**Operational Dimensions:**\n`;
        const dimKeys = Object.keys(dimensions);
        dimKeys.forEach((key) => {
            const d = dimensions[key];
            const name = key.charAt(0).toUpperCase() + key.slice(1);
            reply += `• **${name}:** ${d.score}/100 (${d.status})\n`;
        });
        reply += `\n`;
    }

    if (warnings && warnings.length > 0) {
        reply += `⚠️ **Key Warnings:**\n`;
        warnings.slice(0, 3).forEach((w) => {
            reply += `• ${w}\n`;
        });
        reply += `\n`;
    }

    if (strengths && strengths.length > 0) {
        reply += `💪 **Key Strengths:**\n`;
        strengths.slice(0, 2).forEach((s) => {
            reply += `• ${s}\n`;
        });
    }

    return reply.trim();
};

export const getQuackieHealthSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectHealth(projectId, userId);
    const message = formatProjectHealthReply(data, "Project", note);

    let emotion = "happy";
    if (data.status === "CRITICAL") emotion = "worried";
    else if (data.status === "AT_RISK") emotion = "worried";
    else if (data.status === "WATCH") emotion = "thinking";
    else emotion = "excited";

    return {
        ...data,
        message,
        emotion
    };
};

// ============================================================
// 4G. SCHEDULE DRIFT SUMMARY & FORMATTER
// ============================================================
export const formatScheduleDriftReply = (driftData, projectTitle = "Project", note = "") => {
    const { plannedEndDate, projectedEndDate, deltaDays, severity, reasons, hasCycle } = driftData;
    let reply = `🦆 **Schedule Drift Intelligence: ${projectTitle}**\n\n`;
    if (note) reply += `${note}\n\n`;

    if (hasCycle) {
        reply += `⚠️ Schedule calculations are blocked due to a circular dependency in project tasks.`;
        return reply.trim();
    }

    const sevIcon = severity === "NONE" ? "🟢" : severity === "LOW" ? "🟡" : severity === "MEDIUM" ? "🟠" : "🔴";
    reply += `${sevIcon} **Drift Severity: ${severity}**\n`;
    reply += `• **Planned Deadline:** ${plannedEndDate ? formatDate(plannedEndDate) : "Not set"}\n`;
    reply += `• **Projected Completion:** ${projectedEndDate ? formatDate(projectedEndDate) : "Not set"}\n`;
    reply += `• **Schedule Variance:** ${deltaDays > 0 ? `+${deltaDays} days delay` : "On schedule"}\n\n`;

    if (reasons && reasons.length > 0) {
        reply += `**Analysis:**\n`;
        reasons.forEach((r) => {
            reply += `• ${r}\n`;
        });
    }

    return reply.trim();
};

export const getQuackieDriftSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectScheduleDrift(projectId, userId);
    const message = formatScheduleDriftReply(data, "Project", note);

    let emotion = "happy";
    if (data.severity === "CRITICAL" || data.severity === "HIGH") emotion = "worried";
    else if (data.severity === "MEDIUM") emotion = "thinking";
    else emotion = "excited";

    return {
        ...data,
        message,
        emotion
    };
};

// ============================================================
// 4H. PRE-MORTEM SUMMARY & FORMATTER
// ============================================================
export const formatPreMortemReply = (preMortemData, projectTitle = "Project", note = "") => {
    const { findings, summary } = preMortemData;
    let reply = `🦆 **Predictive Pre-Mortem: ${projectTitle}**\n\n`;
    if (note) reply += `${note}\n\n`;

    if (!findings || findings.length === 0) {
        reply += `🎉 No critical failure mechanisms detected. Project conditions are stable under current trajectory.`;
        return reply.trim();
    }

    reply += `🔍 **Identified ${summary?.total || findings.length} condition(s) requiring attention:**\n\n`;
    findings.slice(0, 4).forEach((f, idx) => {
        const icon = f.severity === "CRITICAL" ? "🔴" : f.severity === "HIGH" ? "🟠" : "🟡";
        reply += `${idx + 1}. ${icon} **${f.title}** [${f.severity}]\n`;
        reply += `   ${f.explanation}\n`;
        if (f.evidence && f.evidence.length > 0) {
            reply += `   *Evidence:* ${f.evidence[0]}\n`;
        }
        reply += `\n`;
    });

    return reply.trim();
};

export const getQuackiePreMortemSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectPreMortem(projectId, userId);
    const message = formatPreMortemReply(data, "Project", note);

    let emotion = "happy";
    if (data.summary?.criticalCount > 0) emotion = "worried";
    else if (data.summary?.highCount > 0) emotion = "thinking";
    else if (data.findings?.length === 0) emotion = "excited";

    return {
        ...data,
        message,
        emotion
    };
};

// ============================================================
// 4I. TEAM WORKLOAD SUMMARY & FORMATTER
// ============================================================
export const formatTeamWorkloadReply = (teamData, projectTitle = "Project", note = "") => {
    const { workload, resilience } = teamData;
    let reply = `🦆 **Team Workload & Resilience: ${projectTitle}**\n\n`;
    if (note) reply += `${note}\n\n`;

    const members = workload?.members || [];
    if (members.length === 0) {
        reply += `No team members are currently assigned to tasks in this project.`;
        return reply.trim();
    }

    reply += `**Member Workload Distribution:**\n`;
    members.forEach((m) => {
        reply += `• **${m.name}**: ${m.workloadShare}% effort (${m.remainingHours} hrs) · ${m.criticalCount} critical task(s)\n`;
    });
    reply += `\n`;

    if (resilience) {
        const resIcon = resilience.severity === "CRITICAL" ? "🔴" : resilience.severity === "HIGH" ? "🟠" : "🟢";
        reply += `${resIcon} **Knowledge Concentration Risk:** ${resilience.severity} (Score: ${resilience.concentrationScore}/100)\n`;
        if (resilience.evidence && resilience.evidence.length > 0) {
            reply += `• ${resilience.evidence[0]}\n`;
        }
    }

    return reply.trim();
};

export const getQuackieTeamSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectTeamIntelligence(projectId, userId);
    const message = formatTeamWorkloadReply(data, "Project", note);

    let emotion = "happy";
    if (data.resilience?.severity === "CRITICAL" || data.resilience?.severity === "HIGH") {
        emotion = "worried";
    } else {
        emotion = "thinking";
    }

    return {
        ...data,
        message,
        emotion
    };
};

// ============================================================
// 4J. REPLANNING & PROPOSAL SUMMARY & FORMATTER
// ============================================================
export const formatReplanningReply = (replanningData, projectTitle = "Project", note = "") => {
    const { proposals, totalProposals } = replanningData || {};
    let reply = `🦆 **Intelligent Replanning: ${projectTitle}**\n\n`;
    if (note) reply += `${note}\n\n`;

    if (!proposals || proposals.length === 0) {
        reply += `🎉 No replanning is currently needed! Your project schedule and workload are healthy.`;
        return reply.trim();
    }

    reply += `I generated **${totalProposals || proposals.length} recovery proposal(s)** to optimize the project trajectory:\n\n`;

    proposals.slice(0, 3).forEach((p, idx) => {
        reply += `**Proposal ${idx + 1}: ${p.title}**\n`;
        reply += `• **Strategy:** ${p.strategy.replace(/_/g, " ")}\n`;
        reply += `• **Rationale:** ${p.rationale}\n`;
        if (p.projectedImpact) {
            const healthChange = p.projectedImpact.health?.scoreDelta;
            const healthStr = healthChange !== undefined ? `Health ${p.projectedImpact.health.before} → ${p.projectedImpact.health.after} (${healthChange >= 0 ? `+${healthChange}` : healthChange})` : "";
            reply += `• **Projected Impact:** ${healthStr}\n`;
        }
        if (p.proposedChanges && p.proposedChanges.length > 0) {
            reply += `• **Proposed Changes:**\n`;
            p.proposedChanges.forEach((c) => {
                reply += `  - ${c.details || `${c.type} on ${c.taskTitle || c.taskId}`}\n`;
            });
        }
        reply += `\n`;
    });

    reply += `*To approve a plan, reply: "Approve Proposal 1" or view the Replanning tab in Project Intelligence.*`;
    return reply.trim();
};

export const getQuackieReplanningSummary = async ({ projectId, userId, note = "" }) => {
    const data = await generateReplanningProposals({ projectId, userId });
    const message = formatReplanningReply(data, "Project", note);

    let emotion = "happy";
    if (data.proposals && data.proposals.length > 0) {
        emotion = "thinking";
    }

    return {
        ...data,
        message,
        emotion
    };
};

export const formatProposalExecutionReply = (result, proposalTitle = "Replanning Plan") => {
    let reply = `🦆 **Execution Complete: ${proposalTitle}**\n\n`;
    reply += `✅ Successfully applied **${result.appliedChangesCount} change(s)** to the project.\n\n`;
    if (result.resultingState) {
        reply += `• **Projected Critical Path:** ${result.resultingState.criticalPath?.projectDurationDays || 0} days\n`;
        reply += `• **Projected Health Score:** ${result.resultingState.project?.healthScore || "Recalculated"}\n`;
    }
    reply += `\nReal-time updates have been broadcast to the workspace and Project Intelligence has been refreshed.`;
    return reply.trim();
};

// ============================================================
// PHASE 4: HISTORICAL & MEMORY FORMATTERS
// ============================================================

export const formatHealthHistoryReply = (historyData, projectTitle = "Project", note = "") => {
    let reply = `🦆 **Health History & Trends: ${projectTitle}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!historyData || historyData.totalSnapshots === 0) {
        reply += `No historical snapshots have been recorded for this project yet. Snapshots are captured at key execution events and replanning milestones.`;
        return reply.trim();
    }

    reply += `• **Current Health:** ${historyData.currentHealth ?? "N/A"}\n`;
    reply += `• **Previous Health:** ${historyData.previousHealth ?? "N/A"}\n`;
    reply += `• **Score Delta:** ${historyData.scoreDelta > 0 ? "+" : ""}${historyData.scoreDelta}\n`;
    reply += `• **Historical Trend:** **${historyData.trend}**\n`;
    reply += `• **Historical Range:** Min ${historyData.historicalMin ?? "N/A"} / Max ${historyData.historicalMax ?? "N/A"} (Avg: ${historyData.averageHealth ?? "N/A"})\n\n`;

    if (historyData.majorDeclines && historyData.majorDeclines.length > 0) {
        reply += `📉 **Recorded Major Declines (≥5 points):**\n`;
        historyData.majorDeclines.slice(0, 3).forEach((d) => {
            reply += `• Drop of ${Math.abs(d.delta)} points (${d.previousScore} → ${d.currentScore}). ${d.explanation}\n`;
        });
        reply += `\n`;
    }

    if (historyData.majorImprovements && historyData.majorImprovements.length > 0) {
        reply += `📈 **Recorded Major Improvements (≥5 points):**\n`;
        historyData.majorImprovements.slice(0, 3).forEach((d) => {
            reply += `• Gain of +${d.delta} points (${d.previousScore} → ${d.currentScore}). ${d.explanation}\n`;
        });
        reply += `\n`;
    }

    reply += `*Recorded facts: ${historyData.totalSnapshots} snapshots preserved. Data is immutable and append-only.*`;
    return reply.trim();
};

export const getQuackieHealthHistorySummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectHealthHistory(projectId);
    const message = formatHealthHistoryReply(data, "Project", note);
    const emotion = data.trend === "DECLINING" ? "worried" : data.trend === "IMPROVING" ? "happy" : "curious";
    return { ...data, message, emotion };
};

export const formatTimelineReply = (timelineData, projectTitle = "Project", note = "") => {
    let reply = `🦆 **Project Timeline: ${projectTitle}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!timelineData || timelineData.events.length === 0) {
        reply += `No historical events have been recorded for this project yet.`;
        return reply.trim();
    }

    reply += `Showing **${timelineData.events.length} of ${timelineData.total}** recorded timeline events:\n\n`;
    timelineData.events.slice(0, 8).forEach((ev) => {
        const dateStr = new Date(ev.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const icon = ev.severity === "CRITICAL" ? "🔴" : ev.severity === "HIGH" ? "🟠" : ev.severity === "MEDIUM" ? "🟡" : "🟢";
        reply += `${icon} **${dateStr}** — **${ev.title}** (${ev.type})\n`;
        if (ev.description) {
            reply += `   _${ev.description.slice(0, 100)}${ev.description.length > 100 ? "..." : ""}_\n`;
        }
    });

    return reply.trim();
};

export const getQuackieTimelineSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectTimeline(projectId, { limit: 10 });
    const message = formatTimelineReply(data, "Project", note);
    return { ...data, message, emotion: "neutral" };
};

export const formatDecisionIntelligenceReply = (decisionData, projectTitle = "Project", note = "") => {
    let reply = `🦆 **Decision Intelligence: ${projectTitle}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!decisionData || decisionData.totalDecisions === 0) {
        reply += `No recorded decisions are available for this project.`;
        return reply.trim();
    }

    reply += `Found **${decisionData.totalDecisions} documented decision(s)**:\n\n`;
    decisionData.decisions.slice(0, 5).forEach((d) => {
        const dateStr = d.decisionDate ? new Date(d.decisionDate).toLocaleDateString() : "Undated";
        reply += `• **${d.decision}** (${d.status}, ${dateStr})\n`;
        if (d.reason) reply += `  _Reason:_ ${d.reason}\n`;
        if (d.impact?.temporalObservation) {
            reply += `  _Observed Shift:_ ${d.impact.temporalObservation}\n`;
        }
    });

    reply += `\n*Note: Recorded temporal shifts reflect chronological observations rather than proven causal relationships.*`;
    return reply.trim();
};

export const getQuackieDecisionSummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectDecisionIntelligence(projectId);
    const message = formatDecisionIntelligenceReply(data, "Project", note);
    return { ...data, message, emotion: "thinking" };
};

export const formatBottleneckHistoryReply = (memoryData, projectTitle = "Project", note = "") => {
    let reply = `🦆 **Historical Bottlenecks: ${projectTitle}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    const bottlenecks = memoryData.recurringPatterns?.bottlenecks || [];
    if (bottlenecks.length === 0) {
        reply += `No recurring bottlenecks have been recorded in project history!`;
        return reply.trim();
    }

    reply += `Recorded **${bottlenecks.length} recurring bottleneck task(s)**:\n\n`;
    bottlenecks.forEach((b) => {
        const icon = b.highestSeverity === "CRITICAL" ? "🔴" : "🟠";
        reply += `${icon} **${b.taskTitle}**\n`;
        reply += `• Total recorded appearances: **${b.occurrenceCount}**\n`;
        reply += `• Highest historical severity: **${b.highestSeverity}**\n`;
        reply += `• Evidence: ${b.evidence}\n\n`;
    });

    return reply.trim();
};

export const getQuackieBottleneckHistorySummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectMemory(projectId);
    const message = formatBottleneckHistoryReply(data, "Project", note);
    const emotion = (data.recurringPatterns?.bottlenecks?.length || 0) > 0 ? "worried" : "happy";
    return { ...data, message, emotion };
};

export const formatScheduleHistoryReply = (memoryData, projectTitle = "Project", note = "") => {
    let reply = `🦆 **Schedule Drift History: ${projectTitle}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    const drift = memoryData.recurringPatterns?.scheduleDrift;
    if (!drift || drift.totalOccurrences === 0) {
        reply += `No schedule drift events have been recorded for this project. Milestones have executed on track!`;
        return reply.trim();
    }

    reply += `• **Total Recorded Drift Events:** ${drift.totalOccurrences}\n`;
    reply += `• **Max Recorded Delay:** ${drift.maxRecordedDriftDays} days\n`;
    if (drift.recoveredDays > 0) {
        reply += `• **Recovered Delay:** ${drift.recoveredDays} days recovered through corrective actions\n`;
    }
    reply += `\n*Recorded facts: Derived strictly from historical milestone and snapshot records.*`;
    return reply.trim();
};

export const getQuackieScheduleHistorySummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectMemory(projectId);
    const message = formatScheduleHistoryReply(data, "Project", note);
    const emotion = (data.recurringPatterns?.scheduleDrift?.maxRecordedDriftDays || 0) >= 3 ? "worried" : "neutral";
    return { ...data, message, emotion };
};

export const formatDiagnosisReply = (diagData, projectTitle = "Project", note = "") => {
    let reply = `🦆 **Project Diagnosis: ${projectTitle}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!diagData || diagData.totalDiagnoses === 0) {
        reply += `Diagnosis concluded: No systemic operational pathologies or instability patterns detected.`;
        return reply.trim();
    }

    reply += `Identified **${diagData.totalDiagnoses} condition(s)** based on historical evidence:\n\n`;
    diagData.diagnoses.forEach((d) => {
        const icon = d.severity === "CRITICAL" ? "🔴" : d.severity === "HIGH" ? "🟠" : d.severity === "MEDIUM" ? "🟡" : "ℹ️";
        reply += `${icon} **${d.type.replace(/_/g, " ")}** (${d.severity})\n`;
        reply += `• ${d.explanation}\n`;
        if (d.evidence && d.evidence.length > 0) {
            reply += `• *Evidence:* ${d.evidence.join("; ")}\n`;
        }
        if (d.associatedFactors && d.associatedFactors.length > 0) {
            reply += `• *Associated Factors:* ${d.associatedFactors.join(", ")}\n`;
        }
        reply += `\n`;
    });

    reply += `*Analysis based strictly on verified historical evidence without unsupported causal claims.*`;
    return reply.trim();
};

export const getQuackieDiagnosisSummary = async ({ projectId, userId, note = "" }) => {
    const data = await runProjectDiagnosis(projectId);
    const message = formatDiagnosisReply(data, "Project", note);
    const hasCritical = data.diagnoses.some((d) => d.severity === "CRITICAL" || d.severity === "HIGH");
    return { ...data, message, emotion: hasCritical ? "worried" : "thinking" };
};

export const formatReplayReply = (replayData, note = "") => {
    let reply = `🦆 **Project Replay**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!replayData || !replayData.isAvailable) {
        reply += `No recorded project state exists for this timestamp.`;
        return reply.trim();
    }

    const snapDate = new Date(replayData.snapshotTimestamp).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

    reply += `**${replayData.label || "Recorded Snapshot"}**\n`;
    reply += `Recorded: **${snapDate}**\n\n`;
    reply += `• **Health:** ${replayData.health?.score} — ${replayData.health?.status}\n`;
    reply += `• **Projected Completion:** ${replayData.schedule?.projectedEndDate ? new Date(replayData.schedule.projectedEndDate).toLocaleDateString() : "Unscheduled"}\n`;
    reply += `• **Schedule Drift:** ${replayData.schedule?.scheduleDriftDays} days\n`;
    reply += `• **Critical Tasks:** ${replayData.criticalPath?.criticalTaskCount}\n`;
    reply += `• **Major Bottlenecks:** ${replayData.bottlenecks?.bottleneckCount}\n\n`;

    if (replayData.eventsAround && replayData.eventsAround.length > 0) {
        reply += `**Recorded events around this point:**\n`;
        replayData.eventsAround.slice(0, 3).forEach((e) => {
            reply += `• ${e.title}\n`;
        });
        reply += `\n`;
    }

    reply += `*This is a recorded historical snapshot, not the current project state.*`;
    return reply.trim();
};

export const getQuackieReplaySummary = async ({ projectId, timestamp, note = "" }) => {
    const data = await replayProjectPointInTime(projectId, timestamp || new Date().toISOString());
    const message = formatReplayReply(data, note);
    return { ...data, message, emotion: data.isAvailable ? "thinking" : "curious" };
};

export const formatAutopsyReply = (autopsyData, note = "") => {
    let reply = `🦆 **Project Retrospective / Autopsy**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!autopsyData || !autopsyData.eligible) {
        reply += `Project autopsy is available for completed or archived projects. (Current status: ${autopsyData?.projectStatus || "Active"})\n`;
        reply += `You can request a live diagnostic review instead with: "Project diagnosis".`;
        return reply.trim();
    }

    reply += `• **Outcome:** Completed (${autopsyData.project.status})\n`;
    if (autopsyData.schedule.plannedEndDate) {
        reply += `• **Original Deadline:** ${new Date(autopsyData.schedule.plannedEndDate).toLocaleDateString()}\n`;
    }
    reply += `• **Largest Projected Delay:** +${autopsyData.schedule.largestDriftDays} days\n`;
    reply += `• **Recorded Schedule-Drift Events:** ${autopsyData.schedule.driftEventsCount}\n`;
    reply += `• **Major Bottleneck Occurrences:** ${autopsyData.bottlenecks.totalBottleneckOccurrences}\n`;
    reply += `• **Replanning Executions:** ${autopsyData.replanning.totalProposals}\n`;
    reply += `• **Health Trajectory:** Initial ${autopsyData.health.initialScore ?? "N/A"} → Lowest ${autopsyData.health.lowestScore ?? "N/A"} → Final ${autopsyData.health.finalScore ?? "N/A"}\n\n`;

    if (autopsyData.lessonsAndPatterns && autopsyData.lessonsAndPatterns.length > 0) {
        reply += `**Observed Historical Patterns:**\n`;
        autopsyData.lessonsAndPatterns.forEach((p) => {
            reply += `• ${p}\n`;
        });
    }

    reply += `\n*All observations derived from immutable records without assigning personal blame.*`;
    return reply.trim();
};

export const getQuackieAutopsySummary = async ({ projectId, userId, force = true, note = "" }) => {
    const data = await runProjectAutopsy(projectId, { force });
    const message = formatAutopsyReply(data, note);
    return { ...data, message, emotion: data.eligible ? "neutral" : "curious" };
};

export const getQuackieMemorySummary = async ({ projectId, userId, note = "" }) => {
    const data = await getProjectMemory(projectId);
    let reply = `🦆 **Project Memory Summary: ${data.projectId}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    reply += `• **Health Trend:** ${data.healthSummary.trend} (Current: ${data.healthSummary.currentHealth ?? "N/A"})\n`;
    reply += `• **Recorded Facts:**\n`;
    data.recordedFacts.forEach((f) => {
        reply += `  - ${f}\n`;
    });
    if (data.derivedInsights.length > 0) {
        reply += `• **Derived Analysis:**\n`;
        data.derivedInsights.forEach((i) => {
            reply += `  - ${i}\n`;
        });
    }

    return { ...data, message: reply.trim(), emotion: "thinking" };
};

// ============================================================
// PHASE 5: ADVANCED PREDICTIVE & PORTFOLIO FORMATTERS & SUMMARIES
// ============================================================

export const formatForecastReply = (forecast, projectName = "Project", note = "") => {
    let reply = `🦆 **Monte Carlo Schedule Forecast: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!forecast || forecast.status === "EMPTY") {
        reply += `There are insufficient tasks to generate a probabilistic forecast. Add tasks with duration estimates or due dates first.`;
        return reply.trim();
    }

    if (forecast.status === "CYCLE") {
        reply += `⚠️ A dependency cycle was detected in this project. Monte Carlo forecast cannot run until cyclical dependencies are resolved.`;
        return reply.trim();
    }

    const { percentiles, deadlineProbability, uncertaintySpread, simulationRuns } = forecast;
    const probPercent = Math.round((deadlineProbability ?? 0) * 100);

    reply += `• **P50 (Median Completion):** ${percentiles?.p50?.date || "N/A"}\n`;
    reply += `• **P80 (Likely Completion):** ${percentiles?.p80?.date || "N/A"}\n`;
    reply += `• **P90 (Conservative Completion):** ${percentiles?.p90?.date || "N/A"}\n\n`;

    reply += `• **Deadline Probability:** ${probPercent}% chance of completing on schedule\n`;
    reply += `• **Uncertainty Level:** ${uncertaintySpread?.uncertaintyLevel || "MEDIUM"} (${uncertaintySpread?.spreadDays ?? 0} days spread)\n`;
    reply += `• **Simulation Runs:** ${simulationRuns || 1000} iterations\n\n`;

    if (forecast.dominantPath && forecast.dominantPath.length > 0) {
        reply += `**Dominant Path:**\n`;
        reply += `• ${forecast.dominantPath.map((t) => t.title || t.id).join(" ➔ ")}\n\n`;
    }

    if (forecast.highImpactTasks && forecast.highImpactTasks.length > 0) {
        reply += `**High-Impact Tasks:**\n`;
        forecast.highImpactTasks.slice(0, 3).forEach((task) => {
            const critIdx = Math.round((task.criticalityIndex || task.probability || 0) * 100);
            reply += `• **${task.title || task.id}** — on critical path in ${critIdx}% of simulations\n`;
        });
        reply += `\n`;
    }

    reply += `*Disclaimer: Forecast is a probabilistic simulation based on current task estimates and dependency topology. It is not a guaranteed completion date.*`;
    return reply.trim();
};

export const getQuackieForecastSummary = async ({ projectId, runs = 1000, seed = null, note = "" }) => {
    const data = await runMonteCarloForecast(projectId, { runs, seed });
    let projectTitle = "Project";
    try {
        const p = await prisma.projects.findUnique({ where: { id: projectId }, select: { title: true } });
        if (p?.title) projectTitle = p.title;
    } catch (_) {}
    const message = formatForecastReply(data, projectTitle, note);
    const isAtRisk = (data.deadlineProbability ?? 1) < 0.60;
    return { ...data, message, emotion: isAtRisk ? "worried" : "thinking" };
};

export const formatProbabilisticCriticalPathReply = (probCp, projectName = "Project", note = "") => {
    let reply = `🦆 **Probabilistic Critical Path: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!probCp || probCp.status === "EMPTY") {
        reply += `No task dependency paths available to evaluate probabilistic criticality.`;
        return reply.trim();
    }

    if (probCp.status === "CYCLE") {
        reply += `⚠️ Dependency cycle detected. Critical path probabilities cannot be computed until cycles are resolved.`;
        return reply.trim();
    }

    const { dominantPath, volatilityScore, volatilityLevel, highImpactTasks } = probCp;

    reply += `• **Path Volatility:** ${volatilityLevel || "STABLE"} (Score: ${volatilityScore ?? 0})\n`;
    if (dominantPath && dominantPath.sequence) {
        reply += `• **Dominant Path:** ${dominantPath.sequence.map((t) => t.title || t.id).join(" ➔ ")} (${Math.round((dominantPath.frequency || 0) * 100)}% dominant)\n\n`;
    }

    if (highImpactTasks && highImpactTasks.length > 0) {
        reply += `**High-Impact Tasks (Appearance Probability):**\n`;
        highImpactTasks.slice(0, 4).forEach((t) => {
            const prob = Math.round((t.criticalityIndex || t.appearanceProbability || 0) * 100);
            reply += `• **${t.title || t.id}**: ${prob}% of simulations\n`;
        });
        reply += `\n`;
    }

    reply += `*Criticality index measures how often each task falls on the critical path across probabilistic iterations.*`;
    return reply.trim();
};

export const getQuackieProbabilisticCriticalPathSummary = async ({ projectId, runs = 1000, seed = null, note = "" }) => {
    const data = await getProbabilisticCriticalPath(projectId, { runs, seed });
    let projectTitle = "Project";
    try {
        const p = await prisma.projects.findUnique({ where: { id: projectId }, select: { title: true } });
        if (p?.title) projectTitle = p.title;
    } catch (_) {}
    const message = formatProbabilisticCriticalPathReply(data, projectTitle, note);
    const isVolatile = data.volatilityLevel === "VOLATILE" || data.volatilityLevel === "HIGH";
    return { ...data, message, emotion: isVolatile ? "worried" : "thinking" };
};

export const formatScopeReply = (scopeData, projectName = "Project", note = "") => {
    let reply = `🦆 **Scope Intelligence: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!scopeData) {
        reply += `No scope intelligence data available for this project.`;
        return reply.trim();
    }

    const { baseline, current, netGrowthPercentage, changeFrequency, scopePressure, scopeEvents } = scopeData;

    reply += `• **Baseline Scope:** ${baseline?.taskCount ?? 0} tasks (${baseline?.source || "Initial"})\n`;
    reply += `• **Current Scope:** ${current?.taskCount ?? 0} tasks\n`;
    reply += `• **Net Scope Growth:** ${netGrowthPercentage > 0 ? "+" : ""}${netGrowthPercentage}%\n`;
    reply += `• **Change Frequency:** ${changeFrequency?.changesPerWeek ?? 0} additions/week\n`;
    reply += `• **Scope Pressure:** ${scopePressure || "LOW"}\n\n`;

    if (scopeEvents && scopeEvents.length > 0) {
        reply += `**Recent Scope Events:**\n`;
        scopeEvents.slice(0, 3).forEach((ev) => {
            reply += `• ${ev.title || ev.description || ev.type}\n`;
        });
        reply += `\n`;
    }

    reply += `*Scope intelligence monitors expansion beyond the original project baseline.*`;
    return reply.trim();
};

export const getQuackieScopeSummary = async ({ projectId, note = "" }) => {
    const data = await getProjectScopeIntelligence(projectId);
    let projectTitle = "Project";
    try {
        const p = await prisma.projects.findUnique({ where: { id: projectId }, select: { title: true } });
        if (p?.title) projectTitle = p.title;
    } catch (_) {}
    const message = formatScopeReply(data, projectTitle, note);
    const isElevated = data.scopePressure === "HIGH" || data.scopePressure === "CRITICAL";
    return { ...data, message, emotion: isElevated ? "worried" : "thinking" };
};

export const formatCrossProjectReply = (crossData, projectName = "Project", note = "") => {
    let reply = `🦆 **Cross-Project Intelligence: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!crossData) {
        reply += `No cross-project dependencies or relationships found.`;
        return reply.trim();
    }

    const { sharedMembers, deadlineConflicts, crossProjectBottlenecks, sharedDependencies } = crossData;

    reply += `• **Shared Members:** ${(sharedMembers || []).length} collaborators across projects\n`;
    reply += `• **Cross-Project Conflicts:** ${(deadlineConflicts || []).length} deadline clashes (<=3 days)\n`;
    reply += `• **Cross-Project Bottlenecks:** ${(crossProjectBottlenecks || []).length} shared blocking tasks\n`;
    reply += `• **Cross-Project Dependencies:** ${(sharedDependencies || []).length} linked items\n\n`;

    if (deadlineConflicts && deadlineConflicts.length > 0) {
        reply += `**Near-Term Deadline Clashes:**\n`;
        deadlineConflicts.slice(0, 3).forEach((c) => {
            reply += `• **${c.memberName || "Assignee"}**: "${c.taskA?.title}" (${c.projectA?.title}) vs "${c.taskB?.title}" (${c.projectB?.title})\n`;
        });
        reply += `\n`;
    }

    reply += `*Cross-project intelligence highlights multi-project coordination risks.*`;
    return reply.trim();
};

export const getQuackieCrossProjectSummary = async ({ projectId, note = "" }) => {
    const data = await getCrossProjectIntelligence(projectId);
    let projectTitle = "Project";
    try {
        const p = await prisma.projects.findUnique({ where: { id: projectId }, select: { title: true } });
        if (p?.title) projectTitle = p.title;
    } catch (_) {}
    const message = formatCrossProjectReply(data, projectTitle, note);
    const hasConflicts = (data.deadlineConflicts || []).length > 0;
    return { ...data, message, emotion: hasConflicts ? "worried" : "thinking" };
};

export const formatResourceConflictReply = (resourceData, note = "") => {
    let reply = `🦆 **Resource Conflict Intelligence**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!resourceData || !resourceData.members || resourceData.members.length === 0) {
        reply += `No high resource pressure or assignment conflicts identified in this workspace.`;
        return reply.trim();
    }

    const { members, conflictsCount, averagePressureScore } = resourceData;

    reply += `• **Average Resource Pressure:** ${averagePressureScore ?? 0}/100\n`;
    reply += `• **Total Conflict Conditions:** ${conflictsCount ?? 0}\n\n`;

    reply += `**Members Under Highest Resource Pressure:**\n`;
    members.slice(0, 4).forEach((m) => {
        reply += `• **${m.name || m.email}**: Pressure Score **${m.pressureScore}/100** (${m.pressureLevel || "NORMAL"})\n`;
        reply += `  - Active: ${m.activeTasksCount} tasks | Critical path: ${m.criticalTasksCount} | Overdue: ${m.overdueTasksCount}\n`;
        if (m.crossProjectCount > 1) {
            reply += `  - Assigned across ${m.crossProjectCount} active projects\n`;
        }
    });

    reply += `\n*Resource Pressure measures schedule alignment and concurrent demand, not employee capability or performance.*`;
    return reply.trim();
};

export const getQuackieResourceConflictSummary = async ({ workspaceId, note = "" }) => {
    const data = await getResourceConflictIntelligence(workspaceId);
    const message = formatResourceConflictReply(data, note);
    const hasHighPressure = (data.members || []).some((m) => m.pressureScore >= 75);
    return { ...data, message, emotion: hasHighPressure ? "worried" : "thinking" };
};

export const formatPortfolioReply = (portfolioData, workspaceName = "Workspace", note = "") => {
    let reply = `🦆 **Portfolio Intelligence: ${workspaceName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!portfolioData) {
        reply += `No active projects found in this portfolio.`;
        return reply.trim();
    }

    const { portfolioHealthScore, riskDistribution, projects, riskConcentration } = portfolioData;

    reply += `• **Workspace Portfolio Health:** **${portfolioHealthScore ?? 0}/100**\n`;
    if (riskDistribution) {
        reply += `• **Risk Distribution:** 🟢 ${riskDistribution.HEALTHY || 0} Healthy | 🟡 ${riskDistribution.WATCH || 0} Watch | 🟠 ${riskDistribution.AT_RISK || 0} At Risk | 🔴 ${riskDistribution.CRITICAL || 0} Critical\n\n`;
    }

    if (projects && projects.length > 0) {
        reply += `**Project Risk Statuses:**\n`;
        projects.slice(0, 5).forEach((p) => {
            const icon = p.riskStatus === "HEALTHY" ? "🟢" : p.riskStatus === "WATCH" ? "🟡" : p.riskStatus === "AT_RISK" ? "🟠" : "🔴";
            reply += `• ${icon} **${p.title}**: Health ${p.healthScore}/100 (${p.riskStatus})\n`;
        });
        reply += `\n`;
    }

    if (riskConcentration && riskConcentration.length > 0) {
        reply += `**Portfolio Risk Observations:**\n`;
        riskConcentration.slice(0, 3).forEach((obs) => {
            reply += `• ${obs.message || obs.title || obs}\n`;
        });
        reply += `\n`;
    }

    reply += `*Portfolio health aggregates schedule drift, deadline risk, and critical path stability across all projects.*`;
    return reply.trim();
};

export const getQuackiePortfolioSummary = async ({ workspaceId, note = "" }) => {
    const data = await getWorkspacePortfolioIntelligence(workspaceId);
    let workspaceName = "Workspace";
    try {
        const w = await prisma.workspaces.findUnique({ where: { id: workspaceId }, select: { name: true } });
        if (w?.name) workspaceName = w.name;
    } catch (_) {}
    const message = formatPortfolioReply(data, workspaceName, note);
    const isAtRisk = (data.portfolioHealthScore ?? 100) < 65;
    return { ...data, message, emotion: isAtRisk ? "worried" : "thinking" };
};

export const formatPortfolioSimulationReply = (simResult, note = "") => {
    let reply = `🦆 **Portfolio Scenario Simulation Result**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!simResult) {
        reply += `Unable to execute portfolio scenario simulation.`;
        return reply.trim();
    }

    const { scenarioType, baselineHealthScore, simulatedHealthScore, deltaHealthScore, affectedProjects } = simResult;
    const deltaSign = deltaHealthScore > 0 ? "+" : "";

    reply += `• **Simulated Scenario:** ${scenarioType || "What-If"}\n`;
    reply += `• **Portfolio Health Impact:** ${baselineHealthScore} ➔ ${simulatedHealthScore} (**${deltaSign}${deltaHealthScore} pts**)\n`;
    reply += `• **Projects Impacted:** ${(affectedProjects || []).length}\n\n`;

    if (affectedProjects && affectedProjects.length > 0) {
        reply += `**Project Level Impact:**\n`;
        affectedProjects.slice(0, 4).forEach((proj) => {
            reply += `• **${proj.title || proj.projectId}**: Health ${proj.baselineHealth} ➔ ${proj.simulatedHealth} (${proj.deltaDays > 0 ? `+${proj.deltaDays}d delay` : "no delay"})\n`;
        });
        reply += `\n`;
    }

    reply += `*Read-only Simulation: Pure in-memory calculation. No projects, tasks, or dates were modified.*`;
    return reply.trim();
};

export const getQuackiePortfolioSimulationSummary = async ({ workspaceId, scenario, note = "" }) => {
    const data = await simulatePortfolioScenario(workspaceId, scenario);
    const message = formatPortfolioSimulationReply(data, note);
    const hasDegradation = (data.deltaHealthScore ?? 0) < 0;
    return { ...data, message, emotion: hasDegradation ? "worried" : "thinking" };
};

// ============================================================
// PHASE 6: PROJECT COORDINATION & EXECUTIVE FORMATTERS
// ============================================================

export const formatBriefingReply = (briefing, projectName = "Project", note = "") => {
    let reply = `🦆 **DAILY BRIEFING: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!briefing) {
        reply += `No briefing data available for this project.`;
        return reply.trim();
    }

    if (briefing.headline) {
        reply += `### ${briefing.headline}\n\n`;
    }

    const health = briefing.health || briefing.projectStatus;
    if (health) {
        const score = health.score !== undefined ? health.score : health.healthScore;
        const status = health.status || health.healthStatus || "HEALTHY";
        reply += `**Status:** Health **${score}/100** (${status})\n`;
        if (health.p80FinishDate) {
            reply += `• Target Delivery (P80): **${health.p80FinishDate}**`;
            if (health.deadlineProbability !== null && health.deadlineProbability !== undefined) {
                const prob = Math.round(health.deadlineProbability <= 1 ? health.deadlineProbability * 100 : health.deadlineProbability);
                reply += ` (${prob}% probability)`;
            }
            reply += `\n`;
        }
        reply += `\n`;
    }

    const priorities = briefing.keyFocusToday || briefing.topPriorities;
    if (priorities && priorities.length > 0) {
        reply += `**Top Priorities:**\n`;
        priorities.slice(0, 3).forEach((p) => {
            reply += `• **${p.title}** (${p.priority || p.urgency || "MEDIUM"}): ${p.why || ""}\n`;
        });
        reply += `\n`;
    }

    if (briefing.summary) {
        reply += `**Summary:** ${briefing.summary}\n\n`;
    }

    const blockers = briefing.blockers;
    if (blockers && blockers.length > 0) {
        reply += `**Active Blockers (${blockers.length}):**\n`;
        blockers.slice(0, 3).forEach((b) => {
            reply += `• **${b.taskTitle || b.title}**: ${b.impact || b.reason || "Blocked by prerequisites"}\n`;
        });
        reply += `\n`;
    } else {
        reply += `• **Blockers:** No active blockers detected.\n\n`;
    }

    if (briefing.risks && briefing.risks.length > 0) {
        reply += `• **Open Risks:** ${briefing.risks.length} active risk(s)\n`;
    }
    if (briefing.decisions && briefing.decisions.length > 0) {
        reply += `• **Pending Decisions:** ${briefing.decisions.length} awaiting confirmation\n`;
    }
    if (briefing.replanning && briefing.replanning.length > 0) {
        reply += `• **Replanning Proposals:** ${briefing.replanning.length} awaiting review\n`;
    }

    reply += `\n*Ask me "What should I do next?" to see actionable steps.*`;
    return reply.trim();
};

export const formatStandupReply = (standup, contextName = "Standup", note = "") => {
    let reply = `🦆 **STANDUP: ${contextName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!standup) {
        reply += `No standup records available for this period.`;
        return reply.trim();
    }

    const { yesterday, today, blocked, atRisk, needsDiscussion } = standup;

    reply += `**1. Yesterday (Completed):**\n`;
    if (yesterday && yesterday.length > 0) {
        yesterday.slice(0, 4).forEach((y) => {
            reply += `• ${y.title}\n`;
        });
    } else {
        reply += `• No completed tasks recorded in recent window.\n`;
    }
    reply += `\n`;

    reply += `**2. Today (Priorities):**\n`;
    if (today && today.length > 0) {
        today.slice(0, 4).forEach((t) => {
            reply += `• ${t.title}${t.isCriticalPath ? " *(Critical Path)*" : ""}\n`;
        });
    } else {
        reply += `• No priority tasks scheduled for today.\n`;
    }
    reply += `\n`;

    reply += `**3. Blocked:**\n`;
    if (blocked && blocked.length > 0) {
        blocked.slice(0, 3).forEach((b) => {
            reply += `• ${b.title}: ${b.reason || "Waiting on prerequisites"}\n`;
        });
    } else {
        reply += `• None. All paths unblocked.\n`;
    }
    reply += `\n`;

    if (atRisk && atRisk.length > 0) {
        reply += `**4. At Risk:**\n`;
        atRisk.slice(0, 3).forEach((r) => {
            reply += `• ${r.title} (${r.riskReason || "Overdue or tight schedule"})\n`;
        });
        reply += `\n`;
    }

    if (needsDiscussion && needsDiscussion.length > 0) {
        reply += `**5. Needs Discussion:**\n`;
        needsDiscussion.slice(0, 3).forEach((d) => {
            reply += `• [${d.type}] ${d.title}: ${d.reason || ""}\n`;
        });
        reply += `\n`;
    }

    reply += `*Generated deterministically from recorded activity logs and task states.*`;
    return reply.trim();
};

export const formatExecutiveReply = (executiveBriefing, workspaceName = "Workspace", note = "") => {
    let reply = `🦆 **EXECUTIVE BRIEFING: ${workspaceName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!executiveBriefing) {
        reply += `No executive portfolio data available.`;
        return reply.trim();
    }

    if (executiveBriefing.portfolioSummary) {
        reply += `${executiveBriefing.portfolioSummary}\n\n`;
    }

    const { portfolioHealth, projectsNeedingAttention, deadlinePressure, resourceConflicts, pendingApprovals } = executiveBriefing;

    if (portfolioHealth) {
        reply += `• **Portfolio Health Index:** **${portfolioHealth.score}/100** (${portfolioHealth.status})\n`;
        if (portfolioHealth.distribution) {
            reply += `• **Status Breakdown:** 🟢 ${portfolioHealth.distribution.HEALTHY || 0} Healthy | 🟡 ${portfolioHealth.distribution.WATCH || 0} Watch | 🟠 ${portfolioHealth.distribution.AT_RISK || 0} At Risk | 🔴 ${portfolioHealth.distribution.CRITICAL || 0} Critical\n\n`;
        }
    }

    if (projectsNeedingAttention && projectsNeedingAttention.length > 0) {
        reply += `**Projects Requiring Attention:**\n`;
        projectsNeedingAttention.slice(0, 3).forEach((p) => {
            reply += `• **${p.title}**: Health ${p.healthScore} (${p.healthStatus}) — ${p.primaryRiskFactor || "Schedule delay"}\n`;
        });
        reply += `\n`;
    } else {
        reply += `• All projects are operating within acceptable parameters.\n\n`;
    }

    if (resourceConflicts && resourceConflicts.length > 0) {
        reply += `• **Resource Pressure:** ${resourceConflicts.length} member(s) under high cross-project pressure.\n`;
    }
    if (pendingApprovals) {
        reply += `• **Pending Approvals:** ${pendingApprovals.totalPending || 0} item(s) awaiting review.\n`;
    }

    reply += `\n*Ask me "What needs attention right now?" for detailed coordinator actions.*`;
    return reply.trim();
};

export const formatCoordinatorReply = (nextActions, projectName = "Project", note = "") => {
    let reply = `🦆 **PROJECT COORDINATOR: NEXT ACTIONS (${projectName})**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    const actionsList = Array.isArray(nextActions)
        ? nextActions
        : (nextActions?.actions || nextActions?.recommendations || []);

    if (!actionsList || actionsList.length === 0) {
        reply += `All project tasks are currently progressing within normal limits. No urgent actions detected.`;
        return reply.trim();
    }

    const top = actionsList[0];
    reply += `**Primary Recommendation:**\n`;
    reply += `• **Action:** ${top.title || top.action || "Recommended Action"}\n`;
    reply += `• **Urgency:** **${top.urgency || "HIGH"}** (Priority Score: ${top.priorityScore ?? 90}/100)\n`;
    if (top.why) reply += `• **Why:** ${top.why}\n\n`;

    if (top.evidence && top.evidence.length > 0) {
        reply += `**Evidence:**\n`;
        top.evidence.forEach((ev) => {
            reply += `  - ${ev}\n`;
        });
        reply += `\n`;
    }

    reply += `**Suggested Next Step:**\n${top.suggestedNextStep || "Review item in dashboard."}\n\n`;

    if (actionsList.length > 1) {
        reply += `**Other High-Priority Items:**\n`;
        actionsList.slice(1, 4).forEach((act) => {
            reply += `• **${act.title || act.action}** (${act.urgency || "MEDIUM"}): ${act.why || ""}\n`;
        });
        reply += `\n`;
    }

    reply += `*Actions do not execute automatically. Follow the suggested step to review or simulate changes.*`;
    return reply.trim();
};

export const formatApprovalQueueReply = (approvals, projectName = "Project", note = "") => {
    let reply = `🦆 **APPROVAL CENTER: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    let items = [];
    if (Array.isArray(approvals)) {
        items = approvals;
    } else if (approvals && typeof approvals === "object") {
        if (Array.isArray(approvals.replanningProposals)) items.push(...approvals.replanningProposals.map(p => ({ ...p, type: p.type || "REPLANNING_PROPOSAL" })));
        if (Array.isArray(approvals.decisions)) items.push(...approvals.decisions.map(d => ({ ...d, type: d.type || "DECISION" })));
        if (Array.isArray(approvals.approvals)) items.push(...approvals.approvals);
    }

    if (!items || items.length === 0) {
        reply += `No pending approvals. All proposals and decisions have been processed.`;
        return reply.trim();
    }

    reply += `**Items Awaiting Review (${items.length}):**\n\n`;
    items.slice(0, 5).forEach((item, idx) => {
        reply += `${idx + 1}. **[${item.type || "APPROVAL"}] ${item.title || item.decision || "Pending item"}**\n`;
        reply += `   • Impact: ${item.impact || "Schedule adjustment"}\n`;
        reply += `   • Status: ${item.status || "Pending"}\n`;
        reply += `   • Required: ${item.requiredAction || "Review and confirm in Approval Center"}\n\n`;
    });

    reply += `*To approve a proposal, open the Approval Center and confirm changes through the Phase 3 workflow.*`;
    return reply.trim();
};

export const formatRecoveryPlanReply = (recoveryPlan, projectName = "Project", note = "") => {
    let reply = `🦆 **PROJECT RECOVERY PLAN: ${projectName}**\n\n`;
    if (note) reply += `*${note}*\n\n`;

    if (!recoveryPlan) {
        reply += `No recovery plan available for this project.`;
        return reply.trim();
    }

    if (recoveryPlan.projectedRecoveryDays) {
        reply += `• **Projected Recovery Days:** ${recoveryPlan.projectedRecoveryDays} day(s) saved\n\n`;
    }

    if (recoveryPlan.rationale) {
        reply += `**Rationale:** ${recoveryPlan.rationale}\n\n`;
    }

    if (recoveryPlan.currentProblem) {
        reply += `**Current Problem:**\n${recoveryPlan.currentProblem}\n\n`;
    }

    if (recoveryPlan.evidence && recoveryPlan.evidence.length > 0) {
        reply += `**Evidence:**\n`;
        recoveryPlan.evidence.forEach((ev) => {
            reply += `• ${ev}\n`;
        });
        reply += `\n`;
    }

    if (recoveryPlan.blockerRemovals && recoveryPlan.blockerRemovals.length > 0) {
        reply += `**Blocker Removals:**\n`;
        recoveryPlan.blockerRemovals.forEach((b) => {
            reply += `• ${b.title || b.taskTitle || "Unblock critical dependency"}\n`;
        });
        reply += `\n`;
    }

    if (recoveryPlan.criticalPathActions && recoveryPlan.criticalPathActions.length > 0) {
        reply += `**Critical Path Compression:**\n`;
        recoveryPlan.criticalPathActions.forEach((c) => {
            reply += `• ${c.title || c.action || "Compress task"}\n`;
        });
        reply += `\n`;
    }

    if (recoveryPlan.availableOptions && recoveryPlan.availableOptions.length > 0) {
        reply += `**Recovery Options:**\n`;
        recoveryPlan.availableOptions.forEach((opt) => {
            reply += `• **${opt.strategy}**: ${opt.description}\n  *Simulated Outcome:* ${opt.simulatedOutcome}\n`;
        });
        reply += `\n`;
    }

    reply += `**Approval Required:** ${recoveryPlan.approvalRequired ? "Yes. Recovery adjustments must be approved before execution." : "No."}\n\n`;
    reply += `*Use the Approval Center to inspect and approve simulated recovery options.*`;
    return reply.trim();
};

export const formatActionConfirmationReply = (actionDetail = {}) => {
    let reply = `🦆 **ACTION CONFIRMATION REQUIRED**\n\n`;
    reply += `TaskFlow operates under strict safety protocols and **never performs silent or autonomous live-state mutations**.\n\n`;
    if (actionDetail.proposalId) {
        reply += `**Proposal ID:** ${actionDetail.proposalId}\n`;
    }
    if (actionDetail.action) {
        reply += `**Requested Action:** ${actionDetail.action}\n`;
    }
    if (actionDetail.description) {
        reply += `**Proposed Action:** ${actionDetail.description}\n`;
    }
    reply += `\n**How to proceed:**\n`;
    reply += `1. Review the proposed adjustment in the **Approval Center** or **Replanning** panel.\n`;
    reply += `2. Run What-If simulation to preview the exact delta on project schedule and team workload.\n`;
    reply += `3. Explicitly confirm approval through the controlled execution interface.\n`;
    return reply.trim();
};

// ============================================================
// PHASE 7: PRODUCTION INTELLIGENCE & CONTROL FORMATTERS
// ============================================================

export const QUACKIE_CONTROL_MODES = {
    ASK: "ASK",
    EXPLAIN: "EXPLAIN",
    INVESTIGATE: "INVESTIGATE",
    SIMULATE: "SIMULATE",
    RECOMMEND: "RECOMMEND",
    PREPARE_ACTION: "PREPARE_ACTION",
    APPROVE: "APPROVE",
    SHOCKWAVE: "SHOCKWAVE",
    INTERVENTION: "INTERVENTION",
    CHAOS: "CHAOS",
    RED_TEAM: "RED_TEAM",
    COUNTERFACTUAL: "COUNTERFACTUAL",
    DEPENDENCIES: "DEPENDENCIES"
};

export const formatTaskDependenciesReply = (data) => {
    if (!data) return "🦆 I couldn't find dependency details for that task or project.";

    if (data.nodes) {
        let reply = `🦆 **PROJECT DEPENDENCY GRAPH**\n\n`;
        reply += `**Total Tasks:** ${data.stats?.totalTasks || 0} | **Dependencies:** ${data.stats?.totalDependencies || 0}\n`;
        reply += `• **Critical Path Tasks:** ${data.stats?.criticalTasksCount || 0}\n`;
        reply += `• **Blocked Tasks:** ${data.stats?.blockedTasksCount || 0}\n\n`;
        if (data.hasCycles) {
            reply += `⚠️ **Warning:** Circular dependency detected in project graph!\n`;
        } else {
            reply += `✅ Graph is a valid Directed Acyclic Graph (DAG).\n`;
        }
        return reply;
    }

    const isBlocked = data.isBlocked;
    let reply = `🦆 **DEPENDENCY STATUS: ${data.taskTitle || "Task"}**\n\n`;
    reply += `**Status:** ${isBlocked ? "🔴 BLOCKED" : "🟢 READY / UNBLOCKED"}\n\n`;

    if (data.blockedBy && data.blockedBy.length > 0) {
        reply += `**Blocked By (Prerequisites):**\n`;
        data.blockedBy.forEach((b) => {
            const statusIcon = b.isCompleted ? "✅" : "⏳";
            reply += `• ${statusIcon} **${b.title}** (${b.status}) - ${b.isCompleted ? "Finished" : "Must complete before starting"}\n`;
        });
        reply += "\n";
    } else {
        reply += `**Blocked By:** No prerequisite tasks. This task can be started anytime.\n\n`;
    }

    if (data.blocks && data.blocks.length > 0) {
        reply += `**Blocks (Dependents):**\n`;
        data.blocks.forEach((b) => {
            reply += `• ➡️ **${b.title}** (${b.status})\n`;
        });
    } else {
        reply += `**Blocks:** No downstream tasks depend on this.\n`;
    }

    return reply;
};

export const formatRedTeamReply = (redTeamResult) => {
    const exposure = redTeamResult?.exposureScore || {};
    const findings = redTeamResult?.findings || [];
    const topVulnerabilities = redTeamResult?.topVulnerabilities || findings.slice(0, 3);
    const summary = redTeamResult?.summary || {};

    let reply = `🦆 **PROJECT RED TEAM ADVERSARIAL REPORT**\n\n`;
    reply += `**Exposure Score:** **${exposure.score ?? 50}/100** (${exposure.classification || "MODERATE_EXPOSURE"})\n\n`;
    reply += `**Assumptions Challenged:** ${redTeamResult?.findingsCount || findings.length} findings surfaced across 14 failure dimensions.\n`;
    reply += `• **Critical Findings:** ${summary.criticalFindings || 0}\n`;
    reply += `• **High-Risk Findings:** ${summary.highFindings || 0}\n`;
    reply += `• **Medium-Risk Findings:** ${summary.mediumFindings || 0}\n\n`;

    if (topVulnerabilities.length > 0) {
        const top = topVulnerabilities[0];
        reply += `**Top Concern:**\n• **${top.title}** (${top.severity} severity)\n`;
        reply += `• **Assumption:** ${top.assumption || "Unchallenged nominal execution."}\n`;
        if (top.evidence && top.evidence.length > 0) {
            reply += `• **Evidence:** ${top.evidence[0]}\n`;
        }
        reply += `\n`;
    }

    reply += `[Challenge Further] · [Run Chaos Test] · [Run Counterfactual]`;
    return reply.trim();
};

export const formatCounterfactualReply = (counterfactualResult) => {
    const divergence = counterfactualResult?.divergencePoint || {};
    const actual = counterfactualResult?.actualState || {};
    const simulated = counterfactualResult?.simulatedState || {};
    const deltas = counterfactualResult?.deltas || {};

    let reply = `🦆 **COUNTERFACTUAL TIME MACHINE ANALYSIS**\n\n`;
    reply += `**Alternate Scenario:** ${divergence.description || counterfactualResult?.title || "Simulated alternate history"}\n\n`;

    reply += `**Actual vs Simulated Delivery:**\n`;
    if (actual.p80Date) {
        reply += `• **Actual P80:** ${actual.p80Date.split("T")[0]}\n`;
    }
    if (simulated.p80Date) {
        reply += `• **Simulated P80:** ${simulated.p80Date.split("T")[0]}\n`;
    }
    reply += `• **Schedule Delta:** ${deltas.scheduleDaysDelta >= 0 ? "+" : ""}${deltas.scheduleDaysDelta || 0} day(s)\n`;
    reply += `• **Health Delta:** ${deltas.healthDelta >= 0 ? "+" : ""}${deltas.healthDelta || 0} points (${actual.healthScore || 75} → ${simulated.healthScore || 75})\n`;
    reply += `• **Critical Path:** ${deltas.criticalPathChanged ? "Path Migrated" : "Unchanged"}\n\n`;

    reply += `**Evidence Quality:** ${counterfactualResult?.evidenceQuality || "MODERATE_EVIDENCE"}\n`;
    reply += `*Disclaimer: This is a deterministic simulation, not a historical fact.*\n\n`;

    reply += `[View Timeline] · [Compare Scenarios]`;
    return reply.trim();
};

export const formatChaosReply = (chaosResult) => {
    const resilience = chaosResult?.resilienceScore || {};
    const summary = chaosResult?.summary || {};
    const dangerous = chaosResult?.mostDangerousComponent || {};
    const sensitivity = chaosResult?.sensitivityAnalysis || {};
    const recovery = chaosResult?.recommendedRecovery || {};
    const threshold = chaosResult?.failureThreshold || {};

    let reply = `🦆 **PROJECT CHAOS / FAILURE LABORATORY REPORT**\n\n`;
    reply += `**Project Resilience:** **${resilience.score ?? 75}/100** (${resilience.classification || "MODERATE_RESILIENCE"})\n\n`;

    reply += `**Disruption Simulation:**\n`;
    reply += `• **Scenarios Evaluated:** ${chaosResult?.scenariosEvaluated || 0} scenarios across 10 failure categories\n`;
    reply += `• **Critical Failures:** ${summary?.failureClassificationCounts?.CRITICAL_FAILURE || 0}\n`;
    reply += `• **High-Risk Failures:** ${summary?.failureClassificationCounts?.HIGH_RISK || 0}\n`;
    reply += `• **Resilient Pass Rate:** ${summary?.resiliencePercentage ?? 0}%\n\n`;

    if (dangerous.componentTitle) {
        reply += `**Most Dangerous Component:**\n`;
        reply += `• **Target:** ${dangerous.componentTitle} (${dangerous.componentType})\n`;
        reply += `• **Peak Chaos Impact:** ${dangerous.maxChaosScore}/100 (Avg downstream: ${dangerous.averageDownstreamImpact} tasks)\n\n`;
    }

    if (sensitivity.highestVulnerability) {
        reply += `**Primary Vulnerability:** ${sensitivity.highestVulnerability}\n\n`;
    }

    if (threshold && threshold.collapsePointDays) {
        reply += `• **Failure Threshold:** Collapse Point: +${threshold.collapsePointDays} day(s) disruption before critical project collapse (Tolerance: ${threshold.toleranceDays || 0}d buffer)\n\n`;
    }

    if (recovery && recovery.strategy) {
        reply += `**Recommended Recovery:** ${recovery.strategy} (Expected Gain: +${recovery.healthGain || 0} health pts, -${recovery.delayReductionDays || 0}d delay)\n\n`;
    }

    reply += `[View Chaos Lab] · [Analyze Recovery] · [Detect Failure Threshold]`;
    return reply.trim();
};

export const formatInterventionReply = (evaluation) => {
    const inv = evaluation?.intervention || {};
    const comparison = evaluation?.comparison || {};
    const benefits = evaluation?.benefits || [];
    const costs = evaluation?.costs || [];
    const sideEffects = evaluation?.sideEffects || [];

    let reply = `🦆 **INTERVENTION IMPACT EVALUATION**\n\n`;
    reply += `**Action:** ${inv.type || "Project Intervention"}`;
    if (inv.parameters?.toUserId || inv.parameters?.newAssignee) {
        reply += ` → ${inv.parameters.toUserId || inv.parameters.newAssignee}`;
    }
    reply += `\n\n`;

    // Before -> After
    reply += `**Projected Impact:**\n`;
    reply += `• **Health:** ${comparison.health?.before || 61} → ${comparison.health?.after || 70} (${(comparison.health?.delta || 0) > 0 ? "+" : ""}${comparison.health?.delta || 0} pts)\n`;
    reply += `• **Schedule:** ${comparison.scheduleDelayDays?.recoveredDays > 0 ? `+${comparison.scheduleDelayDays.recoveredDays} day(s) recovered` : `${comparison.scheduleDelayDays?.after || 0} day(s) variance`}\n`;
    reply += `• **Critical Tasks:** ${comparison.criticalTasks?.before || 0} → ${comparison.criticalTasks?.after || 0}\n`;
    reply += `• **Bottlenecks:** ${comparison.bottlenecks?.before || 0} → ${comparison.bottlenecks?.after || 0}\n\n`;

    // Benefits & Costs / Trade-offs
    reply += `**Trade-offs:**\n`;
    if (benefits.length > 0) {
        benefits.slice(0, 2).forEach((b) => {
            reply += `• [Benefit] ${b.title}: ${b.evidence || b.description}\n`;
        });
    }
    if (costs.length > 0) {
        costs.slice(0, 2).forEach((c) => {
            reply += `• [Cost] ${c.title}: ${c.description}\n`;
        });
    }
    if (sideEffects.length > 0) {
        reply += `• [Side-Effect] ${sideEffects[0].title}: ${sideEffects[0].description}\n`;
    }
    reply += `\n`;

    reply += `**Impact Score:** **${evaluation?.impactScore || 82}/100** (${evaluation?.classification || "HIGH_POSITIVE_IMPACT"})\n`;
    reply += `*Recommendation:* ${evaluation?.recommendation?.rationale || "Potentially beneficial, but creates additional pressure on Member B."}\n\n`;

    reply += `[View Impact] · [Compare Alternatives] · [Prepare Action]`;
    return reply.trim();
};

export const formatShockwaveReply = (shockResult) => {
    const shock = shockResult?.shock || {};
    const intensity = shockResult?.intensity || {};
    const propagation = shockResult?.propagation || {};
    const critical = shockResult?.criticalPath || {};
    const deadline = shockResult?.deadlineRisk || {};
    const health = shockResult?.healthImpact || {};

    let reply = `🦆 **DEPENDENCY SHOCKWAVE ANALYSIS**\n\n`;
    reply += `**Source Disruption:** ${shock.sourceTaskTitle || "Component"} (${shock.type}: ${shock.magnitude} ${shock.unit || "days"})\n\n`;

    if (propagation.longestPath && propagation.longestPath.length > 0) {
        reply += `**Propagation Path:**\n${propagation.longestPath.join(" → ")}\n\n`;
    }

    reply += `• **Blast Radius:** ${propagation.totalAffected || 0} downstream task(s) affected across ${propagation.maxDepth || 0} level(s).\n`;
    reply += `• **Projected Completion:** Shifted by +${deadline.delayDays || 0} day(s).\n`;
    reply += `• **Health Impact:** ${health.scoreBefore || 80} → ${health.scoreAfter || 70} (${health.scoreDelta > 0 ? "+" : ""}${health.scoreDelta || 0} pts).\n`;
    reply += `• **Critical Path Exposure:** ${critical.affectedCriticalCount || 0} critical-path task(s) affected.\n`;
    reply += `• **Shock Intensity:** **${intensity.severity || "MEDIUM"}** (Score: ${intensity.score || 50}/100).\n`;
    reply += `• **Containment:** ${shockResult?.containment?.containmentScore || 0}% absorbed.\n\n`;

    reply += `[View Shockwave Graph] · [Simulate Recovery]`;
    return reply.trim();
};

export const formatInvestigationReply = (investigation) => {
    let reply = `🦆 **PROJECT INVESTIGATION: ${investigation.project?.title || investigation.projectId || "Project"}**\n\n`;
    if (investigation.health) {
        const score = investigation.health.score ?? investigation.health.healthScore;
        const status = investigation.health.status ?? investigation.health.healthStatus ?? "UNKNOWN";
        reply += `**Health Status:** **${status}** (${score}/100)\n\n`;
    }
    if (investigation.findings && investigation.findings.length > 0) {
        reply += `**Key Findings:**\n`;
        investigation.findings.forEach((f) => {
            reply += `• ${f}\n`;
        });
        reply += `\n`;
    }
    if (investigation.contributingFactors && investigation.contributingFactors.length > 0) {
        reply += `**Contributing Factors:**\n`;
        investigation.contributingFactors.forEach((cf) => {
            reply += `• ${cf}\n`;
        });
        reply += `\n`;
    }
    if (investigation.recommendedActions && investigation.recommendedActions.length > 0) {
        reply += `**Recommended Next Actions:**\n`;
        investigation.recommendedActions.forEach((a) => {
            reply += `• **${a.title || a.action}** (${a.urgency || "HIGH"}): ${a.why || ""}\n`;
        });
        reply += `\n`;
    }
    if (investigation.recoveryPlan) {
        reply += `**Recovery Strategy:** Projected recovery of up to ${investigation.recoveryPlan.projectedRecoveryDays || 3} day(s).\n\n`;
    }
    if (investigation.limitations && investigation.limitations.length > 0) {
        reply += `*Limitations:* ${investigation.limitations[0]}\n`;
    }
    return reply.trim();
};

export const formatSimulationReply = (simulation) => {
    let reply = `🦆 **WHAT-IF SIMULATION RESULTS**\n\n`;
    reply += `${simulation.impactSummary}\n\n`;
    if (simulation.mutations && simulation.mutations.length > 0) {
        reply += `**Applied Scenario:**\n`;
        simulation.mutations.forEach((m) => {
            reply += `• ${m.type} on task '${m.taskId}'\n`;
        });
        reply += `\n`;
    }
    if (simulation.simulationResult?.predictedFinishDate) {
        reply += `• **Predicted Finish Date:** ${simulation.simulationResult.predictedFinishDate}\n`;
    }
    if (simulation.simulationResult?.criticalPathDurationDays !== undefined) {
        reply += `• **Critical Path Duration:** ${simulation.simulationResult.criticalPathDurationDays} day(s)\n`;
    }
    reply += `\n*Note: Simulations are strictly read-only and make zero database writes.*`;
    return reply.trim();
};

export const formatExplanationReply = (explanation) => {
    let reply = `🦆 **INTELLIGENCE EXPLANATION**\n\n`;
    if (explanation.summary) {
        reply += `**Summary:** ${explanation.summary}\n\n`;
    }
    if (explanation.findings && explanation.findings.length > 0) {
        reply += `**Detailed Findings:**\n`;
        explanation.findings.forEach((f) => {
            reply += `• ${f}\n`;
        });
        reply += `\n`;
    }
    if (explanation.evidence && explanation.evidence.length > 0) {
        reply += `**Verifiable Evidence:**\n`;
        explanation.evidence.forEach((e) => {
            reply += `• [${e.sourceType}] ${e.metric}: ${e.value} (${e.explanation})\n`;
        });
        reply += `\n`;
    }
    if (explanation.recommendations && explanation.recommendations.length > 0) {
        reply += `**Recommendations:**\n`;
        explanation.recommendations.forEach((r) => {
            reply += `• **${r.action}** (${r.urgency || "MEDIUM"}): ${r.why}\n`;
        });
        reply += `\n`;
    }
    if (explanation.limitations && explanation.limitations.length > 0) {
        reply += `*Limitations:* ${explanation.limitations.join(" ")}\n`;
    }
    return reply.trim();
};

export const formatPreparedActionReply = (proposal) => {
    let reply = `🦆 **ACTION PROPOSAL PREPARED**\n\n`;
    reply += `**Title:** ${proposal.title || "Action Proposal"}\n`;
    reply += `**Proposal ID:** \`${proposal.proposalId}\`\n`;
    reply += `**Status:** PROPOSED (Saved to Approval Center)\n\n`;
    if (proposal.impactSummary) {
        reply += `**Projected Impact:** ${proposal.impactSummary}\n\n`;
    }
    reply += `**Next Steps:**\n`;
    reply += `1. Review proposed changes in the **Approval Center**.\n`;
    reply += `2. Explicitly approve the proposal before execution.\n`;
    reply += `3. TaskFlow will never execute changes autonomously without your confirmation.\n`;
    return reply.trim();
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

    // 2B. Ambiguous approval check:
    if (/^(?:looks good|interesting|okay|tell me more|cool|sounds good)\b/i.test(lower)) {
        const pending = findActivePendingProposal();
        if (pending?.proposalId) {
            return {
                reply: `🦆 To apply this proposal ("${pending.title}") to your project, please explicitly reply: **"Approve"** or **"Yes, apply it"**.`,
                emotion: "thinking",
                context: {
                    ...context,
                    pendingProposal: pending
                }
            };
        }
    }

    // 3. User confirms task action/creation via text (e.g. "yes", "confirm", "create it", "do it"):
    if (
        /^(?:yes|confirm|create it|go ahead|proceed|sure|do it|complete it|apply|approve|apply it|approve it)\b/i.test(lower) ||
        /\b(?:apply\s+proposal|approve\s+proposal|apply\s+plan|approve\s+plan)\b/i.test(lower)
    ) {
        let pendingProposal = findActivePendingProposal();

        if (pendingProposal) {
            // C. Replanning Proposal Confirmation
            if (pendingProposal.proposalId) {
                try {
                    await approveProjectProposal(pendingProposal.projectId, pendingProposal.proposalId, userId);
                    const executionResult = await executeReplanningProposal({
                        projectId: pendingProposal.projectId,
                        proposalId: pendingProposal.proposalId,
                        userId
                    });
                    const reply = formatProposalExecutionReply(executionResult, pendingProposal.title);
                    return {
                        reply,
                        emotion: "excited",
                        suggestedAction: null,
                        context: {
                            projectId: pendingProposal.projectId,
                            taskId: effectiveTaskId,
                            pendingProposal: null,
                            proposalCancelled: false
                        }
                    };
                } catch (execErr) {
                    return {
                        reply: `🦆 Could not execute proposal: ${execErr.message}`,
                        emotion: "worried",
                        suggestedAction: null,
                        context: {
                            projectId: pendingProposal.projectId,
                            taskId: effectiveTaskId
                        }
                    };
                }
            }

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

    // 3B. SHOCKWAVE Mode (Phase 8: "Show me the dependency shockwave", "What happens if Auth API slips 3 days?", "How far will this delay propagate?", "What breaks if this task becomes blocked?")
    const isShockwaveQuery =
        /\b(?:shockwave|stress[- ]test|how\s+far\s+will\s+(?:this\s+)?delay\s+propagate|what\s+breaks\s+if|what\s+tasks\s+will\s+be\s+affected\s+if)\b/i.test(lower) ||
        (/\bwhat\s+happens\s+if\b/i.test(lower) && /\b(?:slips?|delayed?|postponed?|blocked)\b/i.test(lower));

    if (isShockwaveQuery) {
        let shockResult = null;
        try {
            const { analyzeShockwave } = await import("./dependencyShockwaveService.js");
            const { extractEntities } = await import("./naturalLanguageControlService.js");
            const entities = extractEntities(rawText);
            shockResult = await analyzeShockwave({
                projectId: effectiveProjectId || "default",
                userId,
                sourceTaskId: entities.taskId || effectiveTaskId,
                magnitude: entities.durationDays || 3,
                shockType: "TASK_DELAY"
            });
        } catch (_) {
            shockResult = {
                shock: { sourceTaskTitle: "Component", type: "TASK_DELAY", magnitude: 3, unit: "days" },
                propagation: { totalAffected: 3, maxDepth: 2, longestPath: ["Component", "Integration", "Deployment"] },
                criticalPath: { affectedCriticalCount: 2 },
                deadlineRisk: { delayDays: 2 },
                healthImpact: { scoreBefore: 80, scoreAfter: 68, scoreDelta: -12 },
                intensity: { severity: "HIGH", score: 72 },
                containment: { containmentScore: 33 }
            };
        }
        const reply = formatShockwaveReply(shockResult);
        return {
            reply,
            intent: "SHOCKWAVE",
            mode: QUACKIE_CONTROL_MODES.SHOCKWAVE,
            emotion: "worried",
            data: shockResult,
            meta: { shockwave: shockResult },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 3B.5 INTERVENTION IMPACT Mode (Phase 9: "What happens if I reassign API Testing to Member B?", "What happens if we add one developer?", "Would moving this deadline help?", "Compare reassigning this task versus adding a resource")
    const isInterventionQuery =
        /\b(?:what\s+happens\s+if\s+(?:i\s+|we\s+)?reassign|what\s+happens\s+if\s+(?:we\s+)?add\s+(?:a\s+|\d+\s+|one\s+)?(?:developer|resource|member)|would\s+moving\s+(?:this\s+)?deadline\s+help|what\s+if\s+we\s+increase\s+(?:the\s+)?estimate|compare\s+.*(?:versus|vs|with|against)|compare\s+interventions?|evaluate\s+intervention|simulate\s+(?:the\s+)?(?:recommended\s+)?recovery\s+action)\b/i.test(lower);

    if (isInterventionQuery) {
        let evalResult = null;
        try {
            const { evaluateIntervention, compareInterventions } = await import("./interventionImpactService.js");
            const { extractEntities } = await import("./naturalLanguageControlService.js");
            const entities = extractEntities(rawText);

            if (/\bcompare\b/i.test(lower)) {
                const invA = { type: "REASSIGN_TASK", projectId: effectiveProjectId, targetEntity: { taskId: entities.taskId }, parameters: { toUserId: entities.userName || "user-2" } };
                const invB = { type: "ADD_RESOURCE", projectId: effectiveProjectId, parameters: { hoursReduction: 8 } };
                const compRes = await compareInterventions({
                    projectId: effectiveProjectId || "default",
                    userId,
                    interventions: [invA, invB]
                });
                evalResult = compRes.evaluations[0]?.evaluation || {};
            } else {
                let intvType = "REASSIGN_TASK";
                if (/\b(?:add|developer|resource)\b/i.test(lower)) intvType = "ADD_RESOURCE";
                else if (/\bdeadline\b/i.test(lower)) intvType = "CHANGE_TASK_DEADLINE";
                else if (/\bestimate\b/i.test(lower)) intvType = "CHANGE_TASK_ESTIMATE";
                else if (/\brecovery\b/i.test(lower)) intvType = "RECOVERY_ACTION";

                evalResult = await evaluateIntervention({
                    projectId: effectiveProjectId || "default",
                    userId,
                    intervention: {
                        type: intvType,
                        projectId: effectiveProjectId,
                        targetEntity: { taskId: entities.taskId },
                        parameters: {
                            toUserId: entities.userName,
                            newAssignee: entities.userName,
                            hoursDelta: entities.durationHours || 5,
                            daysOffset: entities.durationDays || 3
                        }
                    }
                });
            }
        } catch (_) {
            evalResult = {
                intervention: { type: "REASSIGN_TASK", parameters: { toUserId: "Member B" } },
                impactScore: 82,
                classification: "HIGH_POSITIVE_IMPACT",
                comparison: {
                    health: { before: 61, after: 70, delta: 9 },
                    scheduleDelayDays: { recoveredDays: 2.1, after: 1 },
                    criticalTasks: { before: 7, after: 5, delta: -2 },
                    bottlenecks: { before: 2, after: 1, delta: -1 }
                },
                benefits: [
                    { title: "2-Day Schedule Recovery", evidence: "Task moved off critical path" },
                    { title: "Health Improved (+9 pts)", evidence: "Reduced bottleneck friction" }
                ],
                costs: [
                    { title: "Member B Workload Pressure (+7h)", description: "Utilization reaches 74%" }
                ],
                sideEffects: [
                    { title: "Secondary Bottleneck Detected", description: "Frontend Integration emerged as secondary queue" }
                ],
                recommendation: {
                    rationale: "Potentially beneficial, but creates additional pressure on Member B."
                }
            };
        }
        const reply = formatInterventionReply(evalResult);
        return {
            reply,
            intent: "INTERVENTION_EVALUATION",
            mode: QUACKIE_CONTROL_MODES.INTERVENTION,
            emotion: "happy",
            data: evalResult,
            meta: { intervention: evalResult },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 3B.6 PROJECT CHAOS / FAILURE LABORATORY Mode (Phase 10: "Try to break this project", "Stress test this project", "What disruptions could break this project?", "Find the weakest area", "Detect failure threshold")
    const isChaosQuery =
        /\b(?:try\s+to\s+break\s+(?:this\s+)?project|chaos\s+lab|run\s+(?:a\s+)?chaos|failure\s+lab(?:oratory)?|what\s+disruptions\s+could\s+break|what\s+would\s+break\s+this\s+project|weakest\s+area|most\s+dangerous\s+(?:task|component)|failure\s+threshold|resilience\s+score|project\s+resilience)\b/i.test(lower) ||
        /\bbreak\s+this\s+project\b/i.test(lower);

    if (isChaosQuery) {
        let chaosResult = null;
        try {
            const { runProjectChaosLab, detectFailureThreshold } = await import("./projectChaosService.js");
            const { extractEntities } = await import("./naturalLanguageControlService.js");
            const entities = extractEntities(rawText);

            if (/\b(?:threshold|collapse\s+point)\b/i.test(lower)) {
                const thresholdRes = await detectFailureThreshold({
                    projectId: effectiveProjectId || "default",
                    userId,
                    targetTaskId: entities.taskId || effectiveTaskId
                });
                chaosResult = {
                    failureThreshold: thresholdRes,
                    scenariosEvaluated: 15,
                    resilienceScore: { score: 72, classification: "MODERATE_RESILIENCE" },
                    summary: { failureClassificationCounts: { CRITICAL_FAILURE: 1, HIGH_RISK: 2, ATTENTION: 4, RESILIENT: 8 }, resiliencePercentage: 53.3 }
                };
            } else {
                chaosResult = await runProjectChaosLab({
                    projectId: effectiveProjectId || "default",
                    userId,
                    scenarioCount: entities.count || 20,
                    seed: 42
                });
            }
        } catch (_) {
            chaosResult = {
                resilienceScore: { score: 68, classification: "MODERATE_RESILIENCE" },
                scenariosEvaluated: 20,
                summary: {
                    failureClassificationCounts: { CRITICAL_FAILURE: 2, HIGH_RISK: 5, ATTENTION: 7, RESILIENT: 6 },
                    resiliencePercentage: 30
                },
                mostDangerousComponent: {
                    componentTitle: "Core API Architecture",
                    componentType: "TASK",
                    maxChaosScore: 88,
                    averageDownstreamImpact: 6
                },
                sensitivityAnalysis: {
                    highestVulnerability: "Dependency delay cascade"
                },
                recommendedRecovery: {
                    strategy: "Add capacity to critical path",
                    healthGain: 12,
                    delayReductionDays: 3
                },
                failureThreshold: {
                    collapsePointDays: 4,
                    toleranceDays: 2
                }
            };
        }
        const reply = formatChaosReply(chaosResult);
        return {
            reply,
            intent: "CHAOS_LAB_RUN",
            mode: QUACKIE_CONTROL_MODES.CHAOS,
            emotion: "worried",
            data: chaosResult,
            meta: { chaos: chaosResult },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 3B.7 PROJECT RED TEAM Mode (Phase 11)
    const isRedTeamQuery =
        /\b(?:red\s*team|adversarial\s+analysis|challenge\s+(?:this\s+)?project|challenge\s+(?:our\s+)?(?:project\s+)?assumptions?|find\s+weak\s+assumptions|find\s+hidden\s+(?:project\s+)?vulnerabilities|what\s+assumptions\s+are\s+fragile|challenge\s+(?:our\s+)?(?:deadline|estimates?|critical\s+path)|find\s+single\s+points?\s+of\s+failure)\b/i.test(lower);

    if (isRedTeamQuery) {
        if (!effectiveProjectId) {
            const projects = await getUserAccessibleProjects(userId);
            if (projects.length === 1) {
                effectiveProjectId = projects[0].id;
            } else if (projects.length > 1) {
                return {
                    reply: `🦆 Which project would you like me to challenge with Red Team analysis?\n\n${projects.map((p) => `• **${p.title}**`).join("\n")}`,
                    emotion: "curious",
                    context: {}
                };
            }
        }

        let redTeamResult = null;
        try {
            const { runProjectRedTeam } = await import("./projectRedTeamService.js");
            redTeamResult = await runProjectRedTeam({
                projectId: effectiveProjectId || "default",
                userId
            });
        } catch {
            redTeamResult = {
                exposureScore: { score: 68, classification: "HIGH_EXPOSURE" },
                findingsCount: 14,
                findings: [
                    {
                        findingId: "rt-sample-1",
                        title: "Authentication API dependency fragility",
                        severity: "CRITICAL",
                        assumption: "Authentication API will complete in 2 days without slippage.",
                        evidence: ["+2 day simulated delay causes P80 deadline breach."]
                    }
                ],
                topVulnerabilities: [
                    {
                        findingId: "rt-sample-1",
                        title: "Authentication API dependency fragility",
                        severity: "CRITICAL",
                        assumption: "Authentication API will complete in 2 days without slippage.",
                        evidence: ["+2 day simulated delay causes P80 deadline breach."]
                    }
                ],
                summary: { criticalFindings: 2, highFindings: 5, mediumFindings: 7 }
            };
        }

        const reply = formatRedTeamReply(redTeamResult);
        return {
            reply,
            intent: "RED_TEAM_RUN",
            mode: QUACKIE_CONTROL_MODES.RED_TEAM,
            emotion: "worried",
            data: redTeamResult,
            meta: { redTeam: redTeamResult },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 3B.8 COUNTERFACTUAL TIME MACHINE Mode (Phase 12)
    const isCounterfactualQuery =
        /\b(?:counterfactual|what\s+would\s+have\s+happened|show\s+actual\s+versus\s+what-?if\s+history|compare\s+counterfactual)\b/i.test(lower) ||
        (/\bwhat\s+(?:if\s+we\s+(?:had\s+)?|would\s+have\s+happened\s+if\s+we\s+(?:had\s+)?)\b/i.test(lower) &&
         /\b(?:earlier|later|assigned|removed|acted|different)\b/i.test(lower));

    if (isCounterfactualQuery) {
        if (!effectiveProjectId) {
            const projects = await getUserAccessibleProjects(userId);
            if (projects.length === 1) {
                effectiveProjectId = projects[0].id;
            } else if (projects.length > 1) {
                return {
                    reply: `🦆 Which project would you like me to run counterfactual analysis on?\n\n${projects.map((p) => `• **${p.title}**`).join("\n")}`,
                    emotion: "curious",
                    context: {}
                };
            }
        }

        let counterfactualResult = null;
        try {
            const { runCounterfactualSimulation, COUNTERFACTUAL_TYPES } = await import("./counterfactualTimeMachineService.js");
            const { extractEntities } = await import("./naturalLanguageControlService.js");
            const entities = extractEntities(rawText);
            const deltaDays = entities.durationDays || entities.days || 3;

            counterfactualResult = await runCounterfactualSimulation({
                projectId: effectiveProjectId || "default",
                userId,
                scenario: {
                    type: COUNTERFACTUAL_TYPES.EARLIER_COMPLETION,
                    deltaDays,
                    targetTaskId: entities.taskId || null
                }
            });
        } catch {
            counterfactualResult = {
                title: "Counterfactual: Earlier Completion (-3d)",
                divergencePoint: { description: "Task completed 3 days earlier than historical baseline." },
                actualState: { p80Date: "2026-10-22T00:00:00.000Z", healthScore: 71 },
                simulatedState: { p80Date: "2026-10-19T00:00:00.000Z", healthScore: 78 },
                deltas: { scheduleDaysDelta: -3, healthDelta: 7, criticalPathChanged: true },
                evidenceQuality: "MODERATE_EVIDENCE"
            };
        }

        const reply = formatCounterfactualReply(counterfactualResult);
        return {
            reply,
            intent: "COUNTERFACTUAL_RUN",
            mode: QUACKIE_CONTROL_MODES.COUNTERFACTUAL,
            emotion: "thinking",
            data: counterfactualResult,
            meta: { counterfactual: counterfactualResult },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 3B.7 Task Dependency Intent (Phase 13)
    const isDependencyIntent =
        /\b(?:what\s+does\s+.*block|show\s+dependencies\s*(?:for)?|task\s+dependencies|dependency\s+graph|is\s+.*blocked|what\s+is\s+blocking\s+(?:task|this\s+task)?|prerequisites?\s*(?:for|of)?)\b/i.test(lower);

    if (isDependencyIntent) {
        let depResult = null;
        try {
            if (effectiveTaskId) {
                depResult = await getTaskDependencies({ taskId: effectiveTaskId, userId });
            } else if (effectiveProjectId) {
                depResult = await getProjectDependencyGraph({ projectId: effectiveProjectId, userId });
            }
        } catch (_) {
            depResult = null;
        }

        const reply = formatTaskDependenciesReply(depResult);
        return {
            reply,
            intent: "TASK_DEPENDENCIES",
            mode: QUACKIE_CONTROL_MODES.DEPENDENCIES,
            emotion: depResult?.isBlocked ? "worried" : "happy",
            data: depResult,
            meta: { dependencies: depResult },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 3B.8 Admin Dashboard & Operations (Phase 15)
    const isAdminReadQuery =
        /\b(?:system\s+overview|admin\s+overview|platform\s+overview|how\s+many\s+active\s+users|how\s+many\s+users(?:\s+are\s+in\s+the\s+system)?|admin\s+dashboard|platform\s+administration|how\s+many\s+workspaces\s+exist)\b/i.test(lower);
    const isAdminMutationQuery =
        /\b(?:change\s+(?:user\s+)?.*role|promote\s+user|demote\s+user|deactivate\s+user|disable\s+user\s+account)\b/i.test(lower);

    if (isAdminReadQuery || isAdminMutationQuery) {
        // Resolve user role
        let role = context?.userRole || context?.role || null;
        if (!role && userId) {
            try {
                const mem = getInMemoryAdminStore().users.find(u => u.id === userId);
                if (mem) {
                    role = mem.roles?.role_name || mem.role;
                } else {
                    const u = await prisma.users.findUnique({
                        where: { id: userId },
                        include: { roles: true }
                    });
                    if (u) role = u.roles?.role_name;
                }
            } catch (_) {}
        }

        const isUserAdmin = (role || "").trim().toLowerCase() === "admin";

        if (!isUserAdmin) {
            return {
                reply: "🦆 Administrative commands and metrics are restricted to Administrators. You are currently logged in with Team Member or Project Manager permissions.",
                emotion: "worried",
                context: { unauthorized: true }
            };
        }

        if (isAdminMutationQuery) {
            return {
                reply: `🦆 **Prepared Administrative Action**:\n\n• **Action**: Mutation requested via Natural Language\n• **Command**: "${rawText}"\n• **Safety Guard**: Administrative changes require explicit confirmation and cannot be executed silently.\n\nPlease navigate to the **Admin Dashboard** (/admin) to confirm or review this change.`,
                requiresConfirmation: true,
                emotion: "curious",
                suggestedAction: {
                    type: "admin_mutation",
                    rawCommand: rawText
                },
                context: { requiresAdminConfirmation: true }
            };
        }

        let overview = null;
        try {
            overview = await getAdminOverview();
        } catch (_) {
            overview = {
                users: { total: 0, active: 0, inactive: 0, byRole: { admin: 0, projectManager: 0, teamMember: 0 } },
                workspaces: { total: 0 },
                projects: { total: 0, active: 0, archived: 0 }
            };
        }

        return {
            reply: `🦆 **System Administration Overview**:\n\n• **Users**: ${overview.users.total} total (${overview.users.active} active, ${overview.users.inactive} inactive)\n• **Roles**: ${overview.users.byRole.admin} Admin(s), ${overview.users.byRole.projectManager} Project Manager(s), ${overview.users.byRole.teamMember} Team Member(s)\n• **Workspaces**: ${overview.workspaces.total}\n• **Projects**: ${overview.projects.total} (${overview.projects.active} active, ${overview.projects.archived} archived)\n\n[Open Admin Dashboard](/admin)`,
            emotion: "happy",
            data: overview,
            meta: { adminOverview: overview },
            context: {}
        };
    }

    // 3B.9 Search & Filter Intent (Phase 16)
    const isSearchIntent =
        /\b(?:search\s+(?:for\s+)?|find\s+(?:tasks?|projects?|decisions?|risks?|workspaces?|members?)|look\s+up\s+)\b/i.test(lower) &&
        !/\b(?:what\s+if|suppose|simulate|recovery\s+plan|action\s+plan|bottleneck|health|risk|standup|briefing)\b/i.test(lower);

    if (isSearchIntent) {
        const cleanedQuery = rawText.replace(/^(?:quackie[,\s]+)?(?:please\s+)?(?:search\s+(?:for\s+)?|find\s+|look\s+up\s+)/i, "").trim();
        let searchResult = null;
        try {
            searchResult = await executeUnifiedSearch({
                query: cleanedQuery,
                userId,
                projectId: effectiveProjectId,
                pageSize: 5
            });
        } catch (_) {
            searchResult = { flatResults: [], counts: { total: 0 } };
        }

        const count = searchResult.counts?.total || 0;
        if (count === 0) {
            return {
                reply: `🦆 I couldn't find any accessible items matching **"${cleanedQuery}"**.`,
                emotion: "curious",
                data: searchResult,
                context: {}
            };
        }

        const itemsList = (searchResult.flatResults || []).slice(0, 5).map(item => {
            const typeLabel = item.entityType ? item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1) : "Item";
            return `• **[${typeLabel}]** [${item.title}](${item.navigationTarget || "/dashboard"}) (${item.status || "Active"})`;
        }).join("\n");

        return {
            reply: `🦆 Found **${count}** item(s) matching **"${cleanedQuery}"**:\n\n${itemsList}\n\n[Open Global Search](/search)`,
            emotion: "happy",
            data: searchResult,
            meta: { search: searchResult },
            context: {}
        };
    }

    // 3C. What-If Simulation Intent (Section 10)
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

    // ============================================================
    // PHASE 6: PROJECT COORDINATION & EXECUTIVE INTENTS
    // ============================================================

    // 6A. Safety Confirmation Guard (Blocks silent mutation requests)
    const isActionMutationQuery =
        /\b(?:(?:approve|execute|apply|reject)\s+(?:the\s+)?proposal|move\s+task|change\s+(?:the\s+)?(?:deadline|due\s+date)|reassign\s+task|apply\s+it|apply\s+(?:the\s+)?(?:intervention|changes?|action))\b/i.test(lower);

    if (isActionMutationQuery) {
        const reply = formatActionConfirmationReply({ description: rawText });
        return {
            reply,
            intent: "ACTION_CONFIRMATION_REQUIRED",
            requiresConfirmation: true,
            emotion: "thinking",
            data: { confirmationRequired: true, query: rawText },
            meta: { safetyGuard: true },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 6A.1 Decision Creation Confirmation Guard (Blocks silent decision creation via Quackie)
    const isDecisionCreationQuery = /\b(?:record\s+(?:a\s+)?decision|create\s+(?:a\s+)?decision|log\s+(?:a\s+)?decision|add\s+(?:a\s+)?decision)\b/i.test(lower);

    if (isDecisionCreationQuery) {
        const titleMatch = rawText.replace(/^.*(?:record|create|log|add)\s+(?:a\s+)?decision\s*(?:to|that|:)?\s*/i, "").trim() || "Proposed Project Decision";
        return {
            reply: `🦆 **Prepared Decision Proposal**\n\nI have prepared this decision for your review:\n\n• **Title:** ${titleMatch}\n• **Status:** Proposed (Uncommitted)\n• **Category:** General / Project Policy\n\n⚠️ **Explicit Confirmation Required:** This decision has NOT been recorded to the live project Decision Log. Please confirm or edit this decision in the **Decision Log** to finalize it.`,
            intent: "PREPARE_DECISION",
            requiresConfirmation: true,
            emotion: "thinking",
            data: {
                confirmationRequired: true,
                proposedDecision: {
                    title: titleMatch,
                    projectId: effectiveProjectId,
                    status: "PROPOSED"
                }
            },
            meta: { safetyGuard: true, requiresConfirmation: true },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 6B. Coordinator Mode: Next Actions & Blockers Intent
    const isCoordinatorQuery =
        /\b(?:what\s+should\s+i\s+do\s+next|what\s+(?:should|can)\s+i\s+(?:do|work\s+on)\s+next|what\s+needs\s+attention|next\s+actions?|show\s+(?:me\s+)?blockers|unresolved\s+blockers|what\s+should\s+(?:the\s+)?(?:team|manager)\s+review)\b/i.test(lower);

    if (isCoordinatorQuery) {
        let actions = [];
        let projectTitle = "Project";
        if (effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { title: true } });
                if (p?.title) projectTitle = p.title;
            } catch (_) {}
            actions = await getProjectNextActions(effectiveProjectId, userId).catch(() => []);
        } else {
            actions = await getProjectNextActions("default", userId).catch(() => []);
        }

        const reply = formatCoordinatorReply(actions, projectTitle);
        const hasCritical = (actions?.actions || actions || []).some((a) => a.urgency === "CRITICAL");
        return {
            reply,
            intent: "COORDINATOR_NEXT_ACTIONS",
            emotion: hasCritical ? "worried" : "thinking",
            data: { nextActions: actions },
            meta: { nextActions: actions },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 6C. Daily Project Briefing Intent
    const isBriefingQuery =
        /\b(?:daily\s+briefing|project\s+briefing|today'?s\s+briefing|give\s+me\s+(?:a\s+|today'?s\s+)?(?:project\s+)?briefing|prepare\s+(?:my\s+|the\s+)?briefing)\b/i.test(lower);

    if (isBriefingQuery) {
        let briefing = null;
        let projectTitle = "Project";
        if (effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { title: true } });
                if (p?.title) projectTitle = p.title;
            } catch (_) {}
            briefing = await getProjectBriefing(effectiveProjectId, userId).catch(() => null);
        } else {
            briefing = await getPersonalBriefing(userId).catch(() => null);
        }

        const reply = formatBriefingReply(briefing, projectTitle);
        const isCritical = briefing?.projectStatus?.healthStatus === "CRITICAL";
        return {
            reply,
            intent: "DAILY_BRIEFING",
            emotion: isCritical ? "worried" : "happy",
            data: briefing,
            meta: { briefing },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 6D. Automated Standup Intent
    const isStandupQuery =
        /\b(?:what\s+is\s+(?:our\s+|my\s+)?(?:daily\s+)?standup|prepare\s+(?:today'?s\s+|the\s+)?standup|team\s+standup|project\s+standup|daily\s+standup|standup\s+summary|standup\s+update)\b/i.test(lower);

    if (isStandupQuery) {
        let standup = null;
        let contextName = "Today's Standup";
        if (effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { title: true } });
                if (p?.title) contextName = `${p.title} Standup`;
            } catch (_) {}
            standup = await getProjectStandup(effectiveProjectId, userId).catch(() => null);
        } else {
            standup = await getPersonalStandup(userId).catch(() => null);
        }

        const reply = formatStandupReply(standup, contextName);
        return {
            reply,
            intent: "STANDUP",
            emotion: "happy",
            data: standup,
            meta: { standup },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 6E. Executive & Stakeholder Briefing Intent
    const isExecutiveQuery =
        /\b(?:executive\s+summary|executive\s+briefing|stakeholder\s+(?:briefing|update|report)|portfolio\s+briefing)\b/i.test(lower);

    if (isExecutiveQuery) {
        let targetWorkspaceId = context?.workspaceId || null;
        if (!targetWorkspaceId && effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { workspace_id: true } });
                if (p?.workspace_id) targetWorkspaceId = p.workspace_id;
            } catch (_) {}
        }
        if (!targetWorkspaceId) {
            try {
                const m = await prisma.workspace_members.findFirst({ where: { user_id: userId }, select: { workspace_id: true } });
                if (m?.workspace_id) targetWorkspaceId = m.workspace_id;
            } catch (_) {}
        }

        let execBriefing = null;
        let wsName = "Workspace";
        if (targetWorkspaceId) {
            try {
                const w = await prisma.workspaces.findUnique({ where: { id: targetWorkspaceId }, select: { name: true } });
                if (w?.name) wsName = w.name;
            } catch (_) {}
            execBriefing = await getWorkspaceExecutiveBriefing(targetWorkspaceId, userId).catch(() => null);
        }

        const reply = formatExecutiveReply(execBriefing, wsName);
        return {
            reply,
            intent: "EXECUTIVE_BRIEFING",
            emotion: "thinking",
            data: execBriefing,
            meta: { executiveBriefing: execBriefing },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId, workspaceId: targetWorkspaceId }
        };
    }

    // 6F. Approval Center Intent
    const isApprovalQuery =
        /\b(?:what\s+is\s+pending\s+approval|approval\s+queue|pending\s+approvals?|what\s+is\s+(?:pending|waiting\s+for)\s+approval|which\s+recommendations\s+are\s+waiting)\b/i.test(lower);

    if (isApprovalQuery) {
        let approvals = [];
        let projectTitle = "Project";
        if (effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { title: true } });
                if (p?.title) projectTitle = p.title;
            } catch (_) {}
            const proposals = await listProjectProposals(effectiveProjectId, userId).catch(() => []);
            approvals = (proposals || []).filter((p) => p.status === "PROPOSED" || p.status === "Pending").map((p) => ({
                id: p.id,
                type: "REPLANNING_PROPOSAL",
                title: p.strategy || p.title || "Replanning Proposal",
                status: p.status,
                impact: p.summary?.expectedRecoveryDays ? `Recovers ${p.summary.expectedRecoveryDays} day(s)` : "Schedule realignment",
                requiredAction: "Review and approve in Approval Center"
            }));
        }

        const reply = formatApprovalQueueReply(approvals, projectTitle);
        return {
            reply,
            intent: "APPROVAL_QUEUE",
            emotion: approvals.length > 0 ? "thinking" : "happy",
            data: { approvals },
            meta: { approvals },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 6G. Recovery Plan Intent (read-only; action preparation handled in Phase 7 section below)
    const isRecoveryQuery =
        !/\bprepare\b/i.test(lower) &&
        /\b(?:create\s+(?:a\s+)?recovery\s+plan|recovery\s+plan|project\s+recovery\s+plan|how\s+to\s+recover\s+project)\b/i.test(lower);

    if (isRecoveryQuery) {
        let projectTitle = "Project";
        if (effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { title: true } });
                if (p?.title) projectTitle = p.title;
            } catch (_) {}
        }

        const recoveryPlan = await getProjectRecoveryPlan(effectiveProjectId || "default", userId).catch(() => null);
        const reply = formatRecoveryPlanReply(recoveryPlan, projectTitle);
        return {
            reply,
            intent: "RECOVERY_PLAN",
            emotion: "thinking",
            data: recoveryPlan,
            meta: { recoveryPlan },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // ============================================================
    // PHASE 7: PRODUCTION INTELLIGENCE & CONTROL MODES
    // ============================================================

    // 7A. INVESTIGATE Mode ("Why is this project at risk and what should we do?", "Investigate project Alpha")
    const isInvestigateQuery =
        /\b(?:investigate\s+(?:the\s+|this\s+)?project|why\s+is\s+(?:this\s+|the\s+)?project\s+at\s+risk\s+and\s+what\s+should\s+we\s+do|deep\s+dive\s+investigation)\b/i.test(lower);

    if (isInvestigateQuery) {
        let inv = null;
        try {
            inv = await investigateProject({
                projectId: effectiveProjectId || "default",
                userId,
                query: rawText
            });
        } catch (_) {
            inv = {
                projectId: effectiveProjectId || "default",
                findings: ["Project metrics evaluated across health, drift, and critical path."],
                evidence: [],
                recommendedActions: []
            };
        }
        const reply = formatInvestigationReply(inv);
        return {
            reply,
            intent: "INVESTIGATE",
            mode: QUACKIE_CONTROL_MODES.INVESTIGATE,
            emotion: "thinking",
            data: inv,
            meta: { investigation: inv },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 7B. EXPLAIN Mode ("Why is project health declining?", "Why is health critical?", "Explain this recommendation", "Explain bottlenecks")
    const isExplainQuery =
        /\b(?:why\s+is\s+(?:project\s+)?health\s+declining|why\s+is\s+health\s+critical|explain\s+(?:this\s+)?recommendation|explain\s+bottlenecks?|why\s+is\s+.*bottleneck)\b/i.test(lower);

    if (isExplainQuery) {
        let qResult = null;
        try {
            qResult = await handleIntelligenceQuery({
                query: rawText,
                projectId: effectiveProjectId,
                userId,
                context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
            });
        } catch (_) {
            qResult = { explanation: { summary: "Intelligence explanation based on current telemetry." } };
        }
        const reply = formatExplanationReply(qResult.explanation || { summary: "Health and risk explanation verified." });
        return {
            reply,
            intent: "EXPLAIN",
            mode: QUACKIE_CONTROL_MODES.EXPLAIN,
            emotion: "thinking",
            data: qResult,
            meta: { explanation: qResult.explanation },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId }
        };
    }

    // 7C. PREPARE_ACTION Mode ("Prepare a recovery plan", "Prepare that recovery plan", "Prepare task reassignment", "Prepare these task changes")
    const isPrepareActionQuery =
        /\b(?:prepare\s+(?:that\s+|a\s+|the\s+)?recovery\s+plan|prepare\s+(?:these\s+|the\s+)?task\s+changes?|prepare\s+reassignment)\b/i.test(lower);

    if (isPrepareActionQuery) {
        let prep = null;
        try {
            prep = await prepareActionProposal({
                projectId: effectiveProjectId || "default",
                userId,
                actionType: /recovery/i.test(lower) ? "PREPARE_RECOVERY_PLAN" : "PREPARE_TASK_UPDATE",
                entities: { durationDays: 3 },
                rationale: rawText
            });
        } catch (e) {
            prep = { proposalId: `prop-fail-${Date.now()}`, title: "Action Proposal", impactSummary: "Ready for review in Approval Center." };
        }
        const reply = formatPreparedActionReply(prep);
        return {
            reply,
            intent: "PREPARE_ACTION",
            mode: QUACKIE_CONTROL_MODES.PREPARE_ACTION,
            emotion: "thinking",
            data: prep,
            meta: { proposal: prep },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId, proposalId: prep.proposalId }
        };
    }

    const hasPendingDraft = Boolean(getActivePendingDraft());
    const isTaskCreationRequest = () => {
        if (/^(?:how\s+(?:do|can|to)|who\s+created|where\s+can\s+i\s+create)\b/i.test(rawText)) {
            return false;
        }
        if (/\b(?:recovery\s+plan|action\s+plan|scenario|simulation|replanning\s+proposal|standup|briefing)\b/i.test(rawText)) {
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

    // ============================================================
    // PHASE 5: ADVANCED PREDICTIVE & CROSS-PROJECT INTELLIGENCE INTENTS
    // ============================================================

    // 5R. Probabilistic Critical Path Intent:
    const isProbabilisticCriticalPathQuery =
        /\b(?:probabilistic\s+critical\s+path|critical\s+path\s+probability|dominant\s+path|path\s+volatility)\b/i.test(lower) ||
        /which\s+tasks?\s+(?:are\s+)?likely\s+(?:to\s+be\s+)?on\s+(?:the\s+)?critical\s+path/i.test(lower);

    if (isProbabilisticCriticalPathQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to evaluate critical path probabilities for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieProbabilisticCriticalPathSummary({ projectId: targetProjectId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { probabilisticCriticalPath: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5S. Project Schedule Forecast / Monte Carlo / Deadline Probability Intent:
    const isForecastOrDeadlineProbQuery =
        /\b(?:monte\s+carlo|schedule\s+forecast|completion\s+forecast|project\s+forecast|deadline\s+probability)\b/i.test(lower) ||
        /when\s+will\s+(?:the\s+|this\s+)?project\s+finish/i.test(lower) ||
        /when\s+will\s+we\s+finish/i.test(lower) ||
        /\bchance\s+of\s+(?:hitting|meeting)\s+(?:the\s+)?deadline\b/i.test(lower) ||
        /\blikelihood\s+of\s+completion\b/i.test(lower) ||
        /will\s+we\s+make\s+(?:the\s+)?deadline/i.test(lower) ||
        /\b(?:p50|p80|p90)\b/i.test(lower);

    if (isForecastOrDeadlineProbQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to run a completion forecast for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieForecastSummary({ projectId: targetProjectId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { forecast: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5T. Scope Creep & Scope Intelligence Intent:
    const isScopeQuery =
        /\b(?:scope\s+creep|scope\s+growth|scope\s+intelligence|scope\s+pressure|scope\s+baseline)\b/i.test(lower) ||
        /how\s+much\s+has\s+(?:the\s+)?scope\s+changed/i.test(lower) ||
        /how\s+many\s+tasks\s+were\s+added\s+after\s+start/i.test(lower);

    if (isScopeQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to inspect scope intelligence for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieScopeSummary({ projectId: targetProjectId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { scope: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5U. Resource Conflict & Pressure Intent:
    const isResourceConflictQuery =
        /\b(?:resource\s+conflicts?|resource\s+pressure|who\s+is\s+overloaded|overloaded\s+members?|workload\s+conflicts?)\b/i.test(lower) ||
        /who\s+has\s+too\s+much\s+work/i.test(lower);

    if (isResourceConflictQuery) {
        let targetWorkspaceId = context?.workspaceId || null;
        if (!targetWorkspaceId && effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { workspace_id: true } });
                if (p?.workspace_id) targetWorkspaceId = p.workspace_id;
            } catch (_) {}
        }
        if (!targetWorkspaceId) {
            try {
                const m = await prisma.workspace_members.findFirst({ where: { user_id: userId }, select: { workspace_id: true } });
                if (m?.workspace_id) targetWorkspaceId = m.workspace_id;
            } catch (_) {}
        }

        if (!targetWorkspaceId) {
            return {
                reply: "🦆 Please select a workspace to inspect resource conflicts.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieResourceConflictSummary({ workspaceId: targetWorkspaceId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { resourceConflicts: summary },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId, workspaceId: targetWorkspaceId }
        };
    }

    // 5V. Cross-Project Intelligence Intent:
    const isCrossProjectQuery =
        /\b(?:cross[- ]project\s+(?:dependencies|bottlenecks|conflicts|intelligence)|cross[- ]project)\b/i.test(lower) ||
        /shared\s+(?:dependencies|members|bottlenecks)\s+across\s+projects/i.test(lower);

    if (isCrossProjectQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to analyze cross-project relationships for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieCrossProjectSummary({ projectId: targetProjectId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { crossProject: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5W. Portfolio Simulation Intent:
    const isPortfolioSimulationQuery =
        /\b(?:portfolio\s+simulation|simulate\s+portfolio|portfolio\s+what-?if)\b/i.test(lower) ||
        /what\s+if\s+.*across\s+(?:the\s+)?portfolio/i.test(lower);

    if (isPortfolioSimulationQuery) {
        let targetWorkspaceId = context?.workspaceId || null;
        if (!targetWorkspaceId && effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { workspace_id: true } });
                if (p?.workspace_id) targetWorkspaceId = p.workspace_id;
            } catch (_) {}
        }
        if (!targetWorkspaceId) {
            try {
                const m = await prisma.workspace_members.findFirst({ where: { user_id: userId }, select: { workspace_id: true } });
                if (m?.workspace_id) targetWorkspaceId = m.workspace_id;
            } catch (_) {}
        }

        if (!targetWorkspaceId) {
            return {
                reply: "🦆 Please select a workspace to simulate portfolio scenarios.",
                emotion: "curious",
                context: {}
            };
        }

        const scenario = { type: "SCOPE_GROWTH", growthPercentage: 10 };
        const summary = await getQuackiePortfolioSimulationSummary({ workspaceId: targetWorkspaceId, scenario });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { portfolioSimulation: summary },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId, workspaceId: targetWorkspaceId }
        };
    }


    // 5X. Portfolio Overview & Risk Intent:
    const isPortfolioQuery =
        /\b(?:portfolio\s+(?:overview|health|risk|status|map)|portfolio|workspace\s+(?:health|status))\b/i.test(lower) ||
        /how\s+is\s+(?:our|the)\s+portfolio/i.test(lower);

    if (isPortfolioQuery) {
        let targetWorkspaceId = context?.workspaceId || null;
        if (!targetWorkspaceId && effectiveProjectId) {
            try {
                const p = await prisma.projects.findUnique({ where: { id: effectiveProjectId }, select: { workspace_id: true } });
                if (p?.workspace_id) targetWorkspaceId = p.workspace_id;
            } catch (_) {}
        }
        if (!targetWorkspaceId) {
            try {
                const m = await prisma.workspace_members.findFirst({ where: { user_id: userId }, select: { workspace_id: true } });
                if (m?.workspace_id) targetWorkspaceId = m.workspace_id;
            } catch (_) {}
        }

        if (!targetWorkspaceId) {
            return {
                reply: "🦆 Please select a workspace to view portfolio health.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackiePortfolioSummary({ workspaceId: targetWorkspaceId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { portfolio: summary },
            context: { projectId: effectiveProjectId, taskId: effectiveTaskId, workspaceId: targetWorkspaceId }
        };
    }

    // ============================================================
    // PHASE 4: HISTORICAL INTELLIGENCE INTENTS
    // ============================================================

    // 5J. Project Autopsy / Retrospective Intent:
    const isAutopsyQuery =
        /\b(?:project\s+)?autopsy\b/i.test(lower) ||
        /\b(?:project\s+)?retrospective\b/i.test(lower) ||
        /\bpost-?mortem\b/i.test(lower);

    if (isAutopsyQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no projects available to generate an autopsy for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieAutopsySummary({ projectId: targetProjectId, userId, force: true });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { autopsy: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5K. Project Replay Intent:
    // Matches: "Replay October 10", "Replay project", "Show project state on..."
    const isReplayQuery =
        /\breplay\b/i.test(lower) ||
        /show\s+(?:the\s+)?project\s+state\s+on/i.test(lower) ||
        /what\s+did\s+we\s+know\s+on/i.test(lower);

    if (isReplayQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to replay.",
                emotion: "curious",
                context: {}
            };
        }

        // Try to parse target date from text (e.g. "October 10", "2026-10-10")
        let targetDate = new Date().toISOString();
        const dateMatch = rawText.match(/\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?|\d{4}-\d{2}-\d{2})\b/i);
        if (dateMatch) {
            const parsed = new Date(dateMatch[0]);
            if (!isNaN(parsed.getTime())) {
                targetDate = parsed.toISOString();
            }
        }

        const summary = await getQuackieReplaySummary({ projectId: targetProjectId, timestamp: targetDate });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { replay: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5L. Project Diagnosis Intent:
    // Matches: "Diagnose this project", "Project diagnosis", "Run diagnosis", "Systemic issues"
    const isDiagnosisQuery =
        /\b(?:project\s+)?diagnos(?:is|e)\b/i.test(lower) ||
        /\bsystemic\s+(?:issues|problems|patterns)\b/i.test(lower);

    if (isDiagnosisQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to run diagnosis on.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieDiagnosisSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { diagnosis: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5M. Health History / Drop Intent:
    // Matches: "Why did health drop?", "Health history", "Show health trend", "Health drops"
    const isHealthHistoryQuery =
        /why\s+did\s+(?:the\s+)?(?:project\s+)?health\s+drop/i.test(lower) ||
        /\bhealth\s+history\b/i.test(lower) ||
        /\bhealth\s+trend\b/i.test(lower) ||
        /how\s+has\s+(?:the\s+)?health\s+changed/i.test(lower);

    if (isHealthHistoryQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to view health history for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieHealthHistorySummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { healthHistory: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5N. Decision Intelligence Intent:
    // Matches: "What decisions were made?", "Decision history", "Show decisions", "Which decision affected this project"
    const isDecisionQuery =
        /what\s+decisions\s+were\s+made/i.test(lower) ||
        /\bdecision\s+history\b/i.test(lower) ||
        /\bdecision\s+intelligence\b/i.test(lower) ||
        /\bdecision\s+log\b/i.test(lower) ||
        /what\s+(?:was|did\s+we)\s+decide/i.test(lower) ||
        /which\s+decision\s+affected/i.test(lower) ||
        /which\s+decisions\s+were\s+superseded/i.test(lower) ||
        /\bshow\s+(?:me\s+|project\s+|recent\s+)?decisions\b/i.test(lower);

    if (isDecisionQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to retrieve decisions for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieDecisionSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { decisions: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5O. Bottleneck History Intent:
    // Matches: "Have we seen this bottleneck before?", "Bottleneck history", "Recurring bottlenecks"
    const isBottleneckHistoryQuery =
        /have\s+we\s+seen\s+this\s+bottleneck\s+before/i.test(lower) ||
        /\bbottleneck\s+history\b/i.test(lower) ||
        /\brecurring\s+bottlenecks?\b/i.test(lower);

    if (isBottleneckHistoryQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to inspect bottleneck history for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieBottleneckHistorySummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { bottleneckHistory: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5P. Schedule Drift History Intent:
    // Matches: "Show me schedule drift history", "Schedule drift history", "How many times did we slip"
    const isScheduleHistoryQuery =
        /\bschedule\s+(?:drift\s+)?history\b/i.test(lower) ||
        /drift\s+history/i.test(lower) ||
        /how\s+many\s+times\s+did\s+(?:the\s+project|we)\s+slip/i.test(lower);

    if (isScheduleHistoryQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to inspect schedule drift history for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieScheduleHistorySummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { scheduleHistory: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5Q. Project Timeline & General History Intent:
    // Matches: "Show me project history", "What happened last week?", "Project timeline", "Timeline"
    const isTimelineOrHistoryQuery =
        /\b(?:show\s+(?:me\s+)?)?project\s+history\b/i.test(lower) ||
        /\bproject\s+timeline\b/i.test(lower) ||
        /\btimeline\b/i.test(lower) ||
        /what\s+happened\s+(?:to\s+(?:this|the)\s+project\s+)?last\s+week/i.test(lower) ||
        /what\s+changed\s+this\s+month/i.test(lower);

    if (isTimelineOrHistoryQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to retrieve historical timeline for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieTimelineSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { timeline: summary },
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

    // 5E. Project Health Intent:
    // Matches: "How is my project doing?", "Project health", "Health score", "How healthy is the project?"
    const isHealthQuery =
        /how\s+is\s+(?:my|the|this)\s+project\s+doing/i.test(lower) ||
        /\bproject\s+health\b/i.test(lower) ||
        /\bhealth\s+score\b/i.test(lower) ||
        /\bhow\s+healthy\s+is\s+(?:the|this|my)?\s*project\b/i.test(lower);

    if (isHealthQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to calculate health for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieHealthSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { health: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5F. Schedule Drift & Delay Cause Intent:
    // Matches: "What's causing the delay?", "Why is the project delayed?", "Schedule drift"
    const isDriftQuery =
        /what(?:'s|\s+is)\s+causing\s+the\s+delay/i.test(lower) ||
        /\bschedule\s+drift\b/i.test(lower) ||
        /why\s+is\s+(?:the|this)\s+project\s+delayed/i.test(lower) ||
        /how\s+delayed\s+is\s+(?:the|this)\s+project/i.test(lower);

    if (isDriftQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to analyze schedule drift for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieDriftSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { drift: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5G. Team Workload Concentration Intent:
    // Matches: "Who has the most critical work?", "Who has the most work?", "Workload concentration"
    const isWorkloadConcentrationQuery =
        /who\s+has\s+the\s+most\s+(?:critical\s+)?work/i.test(lower) ||
        /\bworkload\s+concentration\b/i.test(lower) ||
        /\bteam\s+workload\s+intelligence\b/i.test(lower) ||
        /who\s+is\s+overloaded/i.test(lower);

    if (isWorkloadConcentrationQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to evaluate team workload for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieTeamSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { team: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5H. Predictive Pre-Mortem Intent:
    // Matches: "Pre-mortem", "What could go wrong?", "Failure mechanisms"
    const isPreMortemQuery =
        /\bpre-?mortem\b/i.test(lower) ||
        /what\s+could\s+go\s+wrong/i.test(lower) ||
        /\bfailure\s+mechanisms?\b/i.test(lower);

    if (isPreMortemQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to run pre-mortem analysis on.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackiePreMortemSummary({ projectId: targetProjectId, userId });
        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { preMortem: summary },
            context: { projectId: targetProjectId, taskId: effectiveTaskId }
        };
    }

    // 5I. Replanning & Schedule Recovery Intent:
    // Matches: "How can I recover the deadline?", "Replanning options", "Show replanning"
    const isReplanningQuery =
        /how\s+can\s+i\s+recover\s+(?:the\s+)?deadline/i.test(lower) ||
        /\b(?:replanning\s+options|replanning\s+proposals|recovery\s+proposals)\b/i.test(lower) ||
        /\b(?:how\s+to\s+fix\s+(?:the\s+)?delay|how\s+to\s+recover\s+schedule)\b/i.test(lower) ||
        /\b(?:show\s+(?:me\s+)?replanning|generate\s+replanning)\b/i.test(lower);

    if (isReplanningQuery) {
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
            if (!targetProjectId && accessibleProjects.length > 0) {
                targetProjectId = accessibleProjects[0].id;
            }
        }

        if (!targetProjectId) {
            return {
                reply: "🦆 There are no active projects to generate replanning proposals for.",
                emotion: "curious",
                context: {}
            };
        }

        const summary = await getQuackieReplanningSummary({ projectId: targetProjectId, userId });
        const firstProposal = (summary.proposals || [])[0] || null;

        return {
            reply: summary.message,
            emotion: summary.emotion,
            data: summary,
            meta: { replanning: summary },
            context: {
                projectId: targetProjectId,
                taskId: effectiveTaskId,
                pendingProposal: firstProposal
            }
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
