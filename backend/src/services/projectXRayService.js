import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess, analyzeProjectRisk } from "./projectRiskService.js";
import { calculateTaskPriorityScore } from "./taskPriorityService.js";

/**
 * Format date helper
 */
const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(d);
};

/**
 * Classify project deadline pressure deterministically
 * @param {Date|null} endDate
 * @param {Date} startOfToday
 * @param {number} activeTasksCount
 * @param {number} overdueTasksCount
 * @returns {{ hasDeadline: boolean, daysRemaining: number|null, pressure: string, pressureLevel: string, description: string }}
 */
export const calculateDeadlinePressure = (endDate, startOfToday, activeTasksCount, overdueTasksCount) => {
    if (!endDate) {
        return {
            hasDeadline: false,
            daysRemaining: null,
            pressure: "NO_DEADLINE",
            pressureLevel: "NO_DEADLINE",
            description: "No project deadline configured"
        };
    }

    const deadline = new Date(endDate);
    const daysRemaining = Math.round((deadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
        const absDays = Math.abs(daysRemaining);
        return {
            hasDeadline: true,
            daysRemaining,
            pressure: "OVERDUE",
            pressureLevel: activeTasksCount > 0 ? "CRITICAL" : "LOW",
            description: activeTasksCount > 0
                ? `Project deadline passed ${absDays} day${absDays > 1 ? "s" : ""} ago with ${activeTasksCount} active task${activeTasksCount > 1 ? "s" : ""} remaining`
                : `Project deadline passed ${absDays} day${absDays > 1 ? "s" : ""} ago (all tasks completed)`
        };
    }

    if (daysRemaining === 0) {
        return {
            hasDeadline: true,
            daysRemaining: 0,
            pressure: "TODAY",
            pressureLevel: activeTasksCount > 0 ? "HIGH" : "LOW",
            description: activeTasksCount > 0
                ? `Project deadline is TODAY with ${activeTasksCount} task${activeTasksCount > 1 ? "s" : ""} incomplete`
                : "Project deadline is today (all tasks completed)"
        };
    }

    if (daysRemaining <= 3) {
        return {
            hasDeadline: true,
            daysRemaining,
            pressure: "WITHIN_3_DAYS",
            pressureLevel: activeTasksCount > 2 ? "HIGH" : "MEDIUM",
            description: `${daysRemaining} day${daysRemaining > 1 ? "s" : ""} remaining until project deadline (${activeTasksCount} active task${activeTasksCount > 1 ? "s" : ""})`
        };
    }

    if (daysRemaining <= 7) {
        return {
            hasDeadline: true,
            daysRemaining,
            pressure: "WITHIN_7_DAYS",
            pressureLevel: activeTasksCount > 5 || overdueTasksCount > 0 ? "HIGH" : "MEDIUM",
            description: `${daysRemaining} days remaining until project deadline (${activeTasksCount} active task${activeTasksCount > 1 ? "s" : ""})`
        };
    }

    return {
        hasDeadline: true,
        daysRemaining,
        pressure: "NORMAL",
        pressureLevel: "LOW",
        description: `${daysRemaining} days remaining until deadline (${formatDate(endDate)})`
    };
};

/**
 * REUSABLE PROJECT X-RAY SERVICE
 * Produces a complete, data-driven diagnostic view of a project.
 * READ-ONLY: Never writes or automatically modifies anything.
 *
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getProjectXRay = async (projectId, userId) => {
    const startOfToday = getStartOfTodayUtc();

    // 1. Verify user authorization (404 if missing, 403 if unauthorized)
    const project = await verifyProjectAccess(projectId, userId);

    // 2. Fetch project risk analysis from Predictive Risk Engine (reuse existing engine!)
    const riskAnalysis = await analyzeProjectRisk(projectId, userId);

    // 3. Fetch all project tasks with relations
    const tasks = await prisma.tasks.findMany({
        where: { project_id: projectId },
        include: {
            users_tasks_assigned_toTousers: {
                select: { id: true, first_name: true, last_name: true, email: true }
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
                        select: { id: true, title: true, status: true, is_archived: true, priority: true }
                    }
                }
            }
        },
        orderBy: [{ due_date: "asc" }, { created_at: "asc" }]
    });

    // 4. Fetch project members
    const projectMembers = await prisma.project_members.findMany({
        where: { project_id: projectId },
        include: {
            users: {
                select: { id: true, first_name: true, last_name: true, email: true }
            },
            roles: {
                select: { role_name: true }
            }
        }
    });

    // 5. Fetch project risks
    const risks = await prisma.risks.findMany({
        where: { project_id: projectId },
        orderBy: [{ severity: "desc" }, { created_at: "desc" }]
    });

    // -------------------------------------------------------------
    // TASK BREAKDOWN (non-archived tasks only)
    // -------------------------------------------------------------
    const nonArchivedTasks = tasks.filter((t) => !t.is_archived);
    const totalTasks = nonArchivedTasks.length;
    const completedTasks = nonArchivedTasks.filter((t) => t.status === "Completed");
    const activeTasks = nonArchivedTasks.filter((t) => t.status !== "Completed");
    const inProgressTasks = activeTasks.filter((t) => t.status === "In Progress");
    const todoTasks = activeTasks.filter((t) => t.status === "To Do");
    const backlogTasks = activeTasks.filter((t) => t.status === "Backlog");

    // Overdue tasks
    const overdueTasks = activeTasks.filter(
        (t) => t.due_date && new Date(t.due_date) < startOfToday
    );

    // Due today
    const dueTodayTasks = activeTasks.filter((t) => {
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        return Math.round((d.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)) === 0;
    });

    // Due soon (within next 3 days, excluding today)
    const dueSoonTasks = activeTasks.filter((t) => {
        if (!t.due_date) return false;
        const diff = Math.round((new Date(t.due_date).getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
        return diff > 0 && diff <= 3;
    });

    // High/Critical priority incomplete tasks
    const highPriorityIncomplete = activeTasks.filter(
        (t) => t.priority === "High" || t.priority === "Critical"
    );

    // Completion percentage
    const completionPercentage = totalTasks > 0
        ? Number(((completedTasks.length / totalTasks) * 100).toFixed(1))
        : 0;

    // -------------------------------------------------------------
    // HEALTH SUMMARY
    // -------------------------------------------------------------
    let healthSummary = "Project is in great health with no detected risks or delays.";
    if (project.is_archived) {
        healthSummary = "Project is archived; all activity is currently suspended.";
    } else if (totalTasks === 0) {
        healthSummary = "No tasks have been created yet. Project planning is in early stage.";
    } else if (activeTasks.length === 0) {
        healthSummary = "All project tasks are complete (100%). No active risks detected.";
    } else if (riskAnalysis.riskScore > 0) {
        if (riskAnalysis.signals.length > 0) {
            const signalMessages = riskAnalysis.signals.slice(0, 2).map((s) => s.message.toLowerCase()).join(" and ");
            healthSummary = `Project has ${riskAnalysis.riskLevel.toLowerCase()} risk due to ${signalMessages}.`;
        } else {
            healthSummary = `Project risk is ${riskAnalysis.riskLevel} (${riskAnalysis.riskScore}/100).`;
        }
    }

    // -------------------------------------------------------------
    // DEADLINE PRESSURE
    // -------------------------------------------------------------
    const deadline = calculateDeadlinePressure(
        project.end_date,
        startOfToday,
        activeTasks.length,
        overdueTasks.length
    );

    // -------------------------------------------------------------
    // DEPENDENCY INTELLIGENCE
    // -------------------------------------------------------------
    const blockingMap = new Map();
    const blockedTaskIds = new Set();

    activeTasks.forEach((t) => {
        const downstream = t.task_dependencies_task_dependencies_depends_on_task_idTotasks || [];
        const activeDownstream = downstream.filter((d) => {
            const target = d.tasks_task_dependencies_task_idTotasks;
            return target && !target.is_archived && target.status !== "Completed";
        });

        if (activeDownstream.length > 0) {
            activeDownstream.forEach((d) => {
                blockedTaskIds.add(d.tasks_task_dependencies_task_idTotasks.id);
            });

            blockingMap.set(t.id, {
                id: t.id,
                title: t.title,
                priority: t.priority,
                status: t.status,
                dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
                dueDateFormatted: formatDate(t.due_date),
                isOverdue: t.due_date ? new Date(t.due_date) < startOfToday : false,
                blockingCount: activeDownstream.length,
                blockedCount: activeDownstream.length,
                task: {
                    id: t.id,
                    title: t.title,
                    priority: t.priority,
                    status: t.status,
                    dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
                    dueDateFormatted: formatDate(t.due_date),
                    isOverdue: t.due_date ? new Date(t.due_date) < startOfToday : false
                },
                blockedTasks: activeDownstream.map((d) => ({
                    id: d.tasks_task_dependencies_task_idTotasks.id,
                    title: d.tasks_task_dependencies_task_idTotasks.title,
                    status: d.tasks_task_dependencies_task_idTotasks.status,
                    priority: d.tasks_task_dependencies_task_idTotasks.priority
                }))
            });
        }
    });

    const topBlockers = Array.from(blockingMap.values()).sort((a, b) => {
        if (b.blockedCount !== a.blockedCount) return b.blockedCount - a.blockedCount;
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return 0;
    });

    // -------------------------------------------------------------
    // TEAM WORKLOAD
    // -------------------------------------------------------------
    const assigneeMap = new Map();
    let unassignedActiveCount = 0;

    // Pre-populate with known project members
    projectMembers.forEach((pm) => {
        if (pm.users) {
            assigneeMap.set(pm.users.id, {
                id: pm.users.id,
                userId: pm.users.id,
                name: `${pm.users.first_name || ""} ${pm.users.last_name || ""}`.trim() || pm.users.email,
                email: pm.users.email,
                role: pm.roles?.role_name || "Contributor",
                activeTasks: 0,
                completedTasks: 0,
                overdueTasks: 0,
                workloadPercentage: 0
            });
        }
    });

    // Add manager if not in projectMembers
    if (project.manager_id && !assigneeMap.has(project.manager_id) && project.users) {
        assigneeMap.set(project.manager_id, {
            id: project.manager_id,
            userId: project.manager_id,
            name: `${project.users.first_name || ""} ${project.users.last_name || ""}`.trim() || project.users.email,
            email: project.users.email,
            role: "Manager",
            activeTasks: 0,
            completedTasks: 0,
            overdueTasks: 0,
            workloadPercentage: 0
        });
    }

    // Tally tasks for each assignee
    nonArchivedTasks.forEach((t) => {
        if (!t.assigned_to) {
            if (t.status !== "Completed") {
                unassignedActiveCount++;
            }
            return;
        }

        let member = assigneeMap.get(t.assigned_to);
        if (!member) {
            const userObj = t.users_tasks_assigned_toTousers;
            member = {
                id: t.assigned_to,
                userId: t.assigned_to,
                name: userObj ? `${userObj.first_name || ""} ${userObj.last_name || ""}`.trim() || userObj.email : "Assignee",
                email: userObj?.email || "",
                role: "Contributor",
                activeTasks: 0,
                completedTasks: 0,
                overdueTasks: 0,
                workloadPercentage: 0
            };
            assigneeMap.set(t.assigned_to, member);
        }

        if (t.status === "Completed") {
            member.completedTasks++;
        } else {
            member.activeTasks++;
            if (t.due_date && new Date(t.due_date) < startOfToday) {
                member.overdueTasks++;
            }
        }
    });

    const membersList = Array.from(assigneeMap.values());
    const totalActiveCount = activeTasks.length;

    membersList.forEach((m) => {
        m.workloadPercentage = totalActiveCount > 0 ? Math.round((m.activeTasks / totalActiveCount) * 100) : 0;
    });

    // Sort by active tasks descending
    membersList.sort((a, b) => b.activeTasks - a.activeTasks);

    // Calculate top concentration
    let concentration = null;
    if (membersList.length > 0 && totalActiveCount > 0 && membersList[0].activeTasks > 0) {
        concentration = {
            assigneeId: membersList[0].userId,
            assigneeName: membersList[0].name,
            percentage: membersList[0].workloadPercentage,
            activeCount: membersList[0].activeTasks
        };
    }

    // -------------------------------------------------------------
    // RISKS (reusing analyzeProjectRisk)
    // -------------------------------------------------------------
    const openRisks = risks.filter((r) => r.status === "Open");
    const highSeverityRisks = openRisks.filter((r) => r.severity === "High" || r.severity === "Critical");

    // -------------------------------------------------------------
    // RECOMMENDED FOCUS (reusing calculateTaskPriorityScore)
    // -------------------------------------------------------------
    let recommendedTasks = [];
    if (activeTasks.length > 0) {
        const scored = activeTasks.map((t) => {
            const analysis = calculateTaskPriorityScore(t, { startOfToday, projectId });
            const assignee = t.users_tasks_assigned_toTousers;
            return {
                id: t.id,
                title: t.title,
                priority: t.priority,
                status: t.status,
                dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
                dueDateFormatted: formatDate(t.due_date),
                estimatedHours: t.estimated_hours ? Number(t.estimated_hours) : null,
                assigneeName: assignee ? `${assignee.first_name || ""} ${assignee.last_name || ""}`.trim() : "Unassigned",
                focusScore: analysis.priorityScore,
                priorityScore: analysis.priorityScore,
                priorityLevel: analysis.priorityLevel,
                readiness: analysis.readiness,
                focusReasons: analysis.reasons,
                reasons: analysis.reasons
            };
        });

        scored.sort((a, b) => {
            if (b.focusScore !== a.focusScore) return b.focusScore - a.focusScore;
            const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return aDue - bDue;
        });

        recommendedTasks = scored.slice(0, 4);
    }

    // -------------------------------------------------------------
    // STRUCTURED X-RAY RESULT
    // -------------------------------------------------------------
    return {
        project: {
            id: project.id,
            title: project.title,
            description: project.description || "",
            category: project.category || "General",
            status: project.status,
            priority: project.priority,
            startDate: project.start_date ? project.start_date.toISOString().slice(0, 10) : null,
            startDateFormatted: formatDate(project.start_date),
            endDate: project.end_date ? project.end_date.toISOString().slice(0, 10) : null,
            endDateFormatted: formatDate(project.end_date),
            isArchived: project.is_archived
        },

        health: {
            riskLevel: riskAnalysis.riskLevel,
            riskScore: riskAnalysis.riskScore,
            completionPercentage,
            summary: healthSummary
        },

        tasks: {
            total: totalTasks,
            completed: completedTasks.length,
            inProgress: inProgressTasks.length,
            todo: todoTasks.length,
            backlog: backlogTasks.length,
            active: activeTasks.length,
            overdue: overdueTasks.length,
            dueToday: dueTodayTasks.length,
            dueSoon: dueSoonTasks.length,
            highPriorityIncomplete: highPriorityIncomplete.length
        },

        deadline,

        dependencies: {
            activeBlockers: blockingMap.size,
            blockedTasks: blockedTaskIds.size,
            topBlockers
        },

        workload: {
            totalActiveTasks: activeTasks.length,
            unassignedTasks: unassignedActiveCount,
            concentration,
            members: membersList
        },

        risks: {
            open: openRisks.length,
            highSeverity: highSeverityRisks.length,
            primaryRisk: riskAnalysis.primaryRisk,
            signals: riskAnalysis.signals
        },

        focus: {
            recommendedTasks,
            message: recommendedTasks.length > 0
                ? `Prioritize "${recommendedTasks[0].title}" (${recommendedTasks[0].focusReasons.slice(0, 2).join(", ")})`
                : "Project has no active tasks requiring attention."
        },

        recommendations: riskAnalysis.recommendations
    };
};

export default {
    getProjectXRay,
    calculateDeadlinePressure
};
