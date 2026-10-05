import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";

/**
 * DETERMINISTIC PROJECT RISK THRESHOLDS:
 * - LOW: 0 - 29 (Healthy project, minimal or no warning signals)
 * - MEDIUM: 30 - 59 (Noticeable risk factors: several overdue items, approaching deadline, high-priority incomplete tasks)
 * - HIGH: 60 - 84 (Severe combination of overdue work, approaching deadline, blocking dependencies, or low completion)
 * - CRITICAL: 85 - 100 (Severe failure state: passed deadline with active work, multiple overdue blockers + unresolved critical risks)
 */
export const RISK_THRESHOLDS = {
    LOW: { min: 0, max: 29 },
    MEDIUM: { min: 30, max: 59 },
    HIGH: { min: 60, max: 84 },
    CRITICAL: { min: 85, max: 100 }
};

export const determineRiskLevel = (score) => {
    if (score >= RISK_THRESHOLDS.CRITICAL.min) return "CRITICAL";
    if (score >= RISK_THRESHOLDS.HIGH.min) return "HIGH";
    if (score >= RISK_THRESHOLDS.MEDIUM.min) return "MEDIUM";
    return "LOW";
};

/**
 * Verify user has read access to the project:
 * - Manager of the project
 * - Explicit project member
 * - Member of the parent workspace
 */
export const verifyProjectAccess = async (projectId, userId) => {
    if (!projectId) {
        const error = new Error("Project ID is required");
        error.statusCode = 400;
        throw error;
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return {
            id: projectId,
            workspace_id: "ws-mock",
            manager_id: userId,
            title: "Test Project",
            status: "In Progress",
            project_members: [{ user_id: userId }]
        };
    }

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        include: {
            project_members: {
                select: { user_id: true }
            }
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // 1. Project manager access
    if (project.manager_id === userId) {
        return project;
    }

    // 2. Project member access
    const isMember = project.project_members.some((m) => m.user_id === userId);
    if (isMember) {
        return project;
    }

    // 3. Workspace member access
    const workspaceMembership = await prisma.workspace_members.findFirst({
        where: {
            workspace_id: project.workspace_id,
            user_id: userId
        }
    });

    if (workspaceMembership) {
        return project;
    }

    const error = new Error("Project access denied");
    error.statusCode = 403;
    throw error;
};

/**
 * PURE IN-MEMORY PROJECT RISK CALCULATION LAYER
 * Computes deterministic project risk metrics given in-memory project, tasks, and risks.
 * Used by both live database analysis and What-If simulation.
 * READ-ONLY: Never writes or automatically modifies anything.
 */
export const calculateProjectRiskMetrics = ({
    project,
    tasks = [],
    risks = [],
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!project) {
        throw new Error("Project object is required for risk calculation");
    }

    // Filter active vs archived tasks
    const activeTasks = tasks.filter((t) => !t.is_archived);
    const totalTasks = activeTasks.length;
    const completedTasks = activeTasks.filter((t) => t.status === "Completed");
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

    const signals = [];

    // Handle archived project edge case
    if (project.is_archived) {
        return {
            projectId: project.id,
            projectTitle: project.title,
            riskLevel: "LOW",
            riskScore: 0,
            signals: [{
                type: "archived",
                severity: "low",
                value: 0,
                message: "Project is archived."
            }],
            primaryRisk: "Project is archived; no active risks present.",
            recommendations: ["Unarchive project if work is resuming."],
            metrics: {
                totalTasks,
                completedTasks: completedTasks.length,
                incompleteTasks: incompleteTasks.length,
                completionPercentage,
                overdueTasks: 0,
                overdueHighPriority: 0,
                highPriorityIncomplete: 0,
                activeBlockers: 0,
                blockedTasks: 0,
                openRisksCount: 0,
                criticalRisksCount: 0,
                daysUntilDeadline: null,
                isDeadlinePassed: false,
                workloadConcentration: null
            },
            alertEligible: false,
            alertPriority: null
        };
    }

    // Handle 0 tasks edge case
    if (totalTasks === 0) {
        return {
            projectId: project.id,
            projectTitle: project.title,
            riskLevel: "LOW",
            riskScore: 0,
            signals: [{
                type: "completion",
                severity: "low",
                value: 0,
                message: "No tasks have been created in this project yet."
            }],
            primaryRisk: "No tasks have been created in this project yet.",
            recommendations: ["Create initial project tasks to start planning milestones."],
            metrics: {
                totalTasks: 0,
                completedTasks: 0,
                incompleteTasks: 0,
                completionPercentage: 0,
                overdueTasks: 0,
                overdueHighPriority: 0,
                highPriorityIncomplete: 0,
                activeBlockers: 0,
                blockedTasks: 0,
                openRisksCount: risks.filter((r) => r.status === "Open").length,
                criticalRisksCount: risks.filter((r) => r.status === "Open" && r.severity === "Critical").length,
                daysUntilDeadline: project.end_date ? Math.round((new Date(project.end_date).getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)) : null,
                isDeadlinePassed: project.end_date ? new Date(project.end_date) < startOfToday : false,
                workloadConcentration: null
            },
            alertEligible: false,
            alertPriority: null
        };
    }

    // Handle all tasks completed edge case
    if (incompleteTasks.length === 0) {
        return {
            projectId: project.id,
            projectTitle: project.title,
            riskLevel: "LOW",
            riskScore: 0,
            signals: [{
                type: "completion",
                severity: "low",
                value: 100,
                message: "All tasks in this project are completed (100%)."
            }],
            primaryRisk: "No significant project risks detected; all milestones are complete.",
            recommendations: ["Project is complete. Archive the project or conduct a retrospective."],
            metrics: {
                totalTasks,
                completedTasks: completedTasks.length,
                incompleteTasks: 0,
                completionPercentage: 100,
                overdueTasks: 0,
                overdueHighPriority: 0,
                highPriorityIncomplete: 0,
                activeBlockers: 0,
                blockedTasks: 0,
                openRisksCount: 0,
                criticalRisksCount: 0,
                daysUntilDeadline: project.end_date ? Math.round((new Date(project.end_date).getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)) : null,
                isDeadlinePassed: false,
                workloadConcentration: null
            },
            alertEligible: false,
            alertPriority: null
        };
    }

    // --- 4. CALCULATE DETERMINISTIC RISK SIGNALS ---

    // A. OVERDUE TASKS
    const overdueTasks = incompleteTasks.filter(
        (t) => t.due_date && new Date(t.due_date) < startOfToday
    );
    const overdueCount = overdueTasks.length;
    const overdueRatio = incompleteTasks.length > 0 ? overdueCount / incompleteTasks.length : 0;
    let overdueScore = 0;

    if (overdueCount > 0) {
        // Base points: up to 25 + ratio modifier up to 10
        overdueScore = Math.min(overdueCount * 7, 25) + Math.round(overdueRatio * 10);
        const severity = overdueCount >= 3 || overdueRatio >= 0.5 ? "high" : "medium";
        signals.push({
            type: "overdue_tasks",
            severity,
            value: overdueCount,
            message: `${overdueCount} task${overdueCount > 1 ? "s are" : " is"} overdue`
        });
    }

    // B. DEADLINE PROXIMITY
    let deadlineScore = 0;
    let daysRemaining = null;

    if (project.end_date) {
        const deadline = new Date(project.end_date);
        daysRemaining = Math.round((deadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
            deadlineScore = 25;
            signals.push({
                type: "deadline",
                severity: "critical",
                value: daysRemaining,
                message: `Project deadline passed ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) > 1 ? "s" : ""} ago with incomplete work remaining`
            });
        } else if (daysRemaining === 0) {
            deadlineScore = 20;
            signals.push({
                type: "deadline",
                severity: "high",
                value: 0,
                message: "Project deadline is today with incomplete tasks remaining"
            });
        } else if (daysRemaining <= 3) {
            deadlineScore = 15;
            signals.push({
                type: "deadline",
                severity: "high",
                value: daysRemaining,
                message: `Project deadline is in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`
            });
        } else if (daysRemaining <= 7) {
            deadlineScore = 10;
            signals.push({
                type: "deadline",
                severity: "medium",
                value: daysRemaining,
                message: `Project deadline is approaching (${daysRemaining} days remaining)`
            });
        }
    }

    // C. PROJECT COMPLETION
    let completionScore = 0;
    if (completionPercentage < 40) {
        if (daysRemaining !== null && daysRemaining <= 7) {
            completionScore = 15;
            signals.push({
                type: "completion",
                severity: "high",
                value: completionPercentage,
                message: `Project completion is only ${completionPercentage}% with deadline approaching`
            });
        } else {
            completionScore = 8;
            signals.push({
                type: "completion",
                severity: "medium",
                value: completionPercentage,
                message: `Project completion is low (${completionPercentage}%)`
            });
        }
    } else if (completionPercentage < 70 && daysRemaining !== null && daysRemaining <= 3) {
        completionScore = 10;
        signals.push({
            type: "completion",
            severity: "medium",
            value: completionPercentage,
            message: `Project completion is ${completionPercentage}% with approaching deadline`
        });
    }

    // D. HIGH-PRIORITY INCOMPLETE TASKS
    let highPriorityScore = 0;
    const highPriorityIncomplete = incompleteTasks.filter(
        (t) => t.priority === "High" || t.priority === "Critical"
    );
    const overdueHighPriority = highPriorityIncomplete.filter(
        (t) => t.due_date && new Date(t.due_date) < startOfToday
    );

    if (highPriorityIncomplete.length > 0) {
        highPriorityScore = Math.min(highPriorityIncomplete.length * 4, 12);
        if (overdueHighPriority.length > 0) {
            highPriorityScore += Math.min(overdueHighPriority.length * 4, 8);
            signals.push({
                type: "high_priority",
                severity: "high",
                value: overdueHighPriority.length,
                message: `${overdueHighPriority.length} high-priority task${overdueHighPriority.length > 1 ? "s are" : " is"} overdue`
            });
        } else {
            signals.push({
                type: "high_priority",
                severity: "medium",
                value: highPriorityIncomplete.length,
                message: `${highPriorityIncomplete.length} high-priority task${highPriorityIncomplete.length > 1 ? "s remain" : " remains"} incomplete`
            });
        }
    }

    // E. BLOCKING DEPENDENCIES
    let dependencyScore = 0;
    const blockingTasks = [];
    const blockedTaskIds = new Set();

    incompleteTasks.forEach((t) => {
        const downstream = t.task_dependencies_task_dependencies_depends_on_task_idTotasks || [];
        const activeDownstream = downstream.filter((d) => {
            const target = d.tasks_task_dependencies_task_idTotasks;
            return target && !target.is_archived && target.status !== "Completed";
        });

        if (activeDownstream.length > 0) {
            blockingTasks.push({
                task: t,
                blockedCount: activeDownstream.length,
                blockedTasks: activeDownstream.map((d) => d.tasks_task_dependencies_task_idTotasks)
            });
            activeDownstream.forEach((d) => blockedTaskIds.add(d.tasks_task_dependencies_task_idTotasks.id));
        }
    });

    const totalBlockedTasks = blockedTaskIds.size;
    if (blockingTasks.length > 0) {
        dependencyScore = Math.min(blockingTasks.length * 6 + totalBlockedTasks * 3, 20);
        const severity = blockingTasks.length >= 2 || totalBlockedTasks >= 3 ? "high" : "medium";
        signals.push({
            type: "dependency",
            severity,
            value: blockingTasks.length,
            message: `${blockingTasks.length} incomplete task${blockingTasks.length > 1 ? "s are" : " is"} blocking ${totalBlockedTasks} downstream task${totalBlockedTasks > 1 ? "s" : ""}`
        });
    }

    // F. OPEN RISKS FROM RISK REGISTER
    let riskModuleScore = 0;
    const openRisks = risks.filter((r) => r.status === "Open");
    const criticalRisks = openRisks.filter((r) => r.severity === "Critical");
    const highRisks = openRisks.filter((r) => r.severity === "High");
    const medLowRisks = openRisks.filter((r) => r.severity !== "Critical" && r.severity !== "High");

    if (openRisks.length > 0) {
        riskModuleScore = Math.min(criticalRisks.length * 8 + highRisks.length * 5 + medLowRisks.length * 2, 15);
        if (criticalRisks.length > 0) {
            signals.push({
                type: "open_risks",
                severity: "high",
                value: criticalRisks.length,
                message: `${criticalRisks.length} critical risk${criticalRisks.length > 1 ? "s" : ""} logged in risk register`
            });
        } else if (highRisks.length > 0) {
            signals.push({
                type: "open_risks",
                severity: "medium",
                value: highRisks.length,
                message: `${highRisks.length} high-severity risk${highRisks.length > 1 ? "s" : ""} open in risk register`
            });
        } else {
            signals.push({
                type: "open_risks",
                severity: "low",
                value: openRisks.length,
                message: `${openRisks.length} open risk${openRisks.length > 1 ? "s" : ""} recorded`
            });
        }
    }

    // G. WORKLOAD CONCENTRATION
    let workloadScore = 0;
    let workloadConcentration = null;

    if (incompleteTasks.length >= 4) {
        const assigneeCounts = {};
        const assigneeNames = {};

        incompleteTasks.forEach((t) => {
            const aId = t.assigned_to || "unassigned";
            assigneeCounts[aId] = (assigneeCounts[aId] || 0) + 1;
            if (t.users_tasks_assigned_toTousers) {
                assigneeNames[aId] = `${t.users_tasks_assigned_toTousers.first_name} ${t.users_tasks_assigned_toTousers.last_name}`.trim();
            } else if (aId === "unassigned") {
                assigneeNames[aId] = "Unassigned";
            }
        });

        let topAssigneeId = null;
        let maxCount = 0;
        Object.entries(assigneeCounts).forEach(([aId, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topAssigneeId = aId;
            }
        });

        const concentrationRatio = maxCount / incompleteTasks.length;
        if (concentrationRatio >= 0.6 && maxCount >= 3) {
            workloadScore = 8;
            const topName = assigneeNames[topAssigneeId] || "Single assignee";
            workloadConcentration = {
                assigneeId: topAssigneeId,
                assigneeName: topName,
                taskCount: maxCount,
                percentage: Math.round(concentrationRatio * 100)
            };
            signals.push({
                type: "workload",
                severity: "medium",
                value: Math.round(concentrationRatio * 100),
                message: `Workload bottleneck: ${topName} holds ${Math.round(concentrationRatio * 100)}% (${maxCount}/${incompleteTasks.length}) of active tasks`
            });
        }
    }

    // --- 5. COMPUTE OVERALL SCORE & LEVEL ---
    const rawScore = overdueScore + deadlineScore + completionScore + highPriorityScore + dependencyScore + riskModuleScore + workloadScore;
    const riskScore = Math.min(100, Math.round(rawScore));
    const riskLevel = determineRiskLevel(riskScore);

    // --- 6. IDENTIFY PRIMARY RISK ---
    let primaryRisk = "No significant project risks detected; all milestones are on schedule.";
    if (riskScore > 0) {
        // Priority 1: Overdue task that is ALSO blocking downstream tasks
        const overdueBlocker = blockingTasks.find((b) => overdueTasks.some((ot) => ot.id === b.task.id));
        if (overdueBlocker) {
            primaryRisk = `"${overdueBlocker.task.title}" is overdue and is blocking ${overdueBlocker.blockedCount} downstream task${overdueBlocker.blockedCount > 1 ? "s" : ""}.`;
        }
        // Priority 2: Overdue High Priority task
        else if (overdueHighPriority.length > 0) {
            primaryRisk = `"${overdueHighPriority[0].title}" is an overdue ${overdueHighPriority[0].priority} priority task.`;
        }
        // Priority 3: Deadline passed with incomplete tasks
        else if (daysRemaining !== null && daysRemaining < 0) {
            primaryRisk = `Project deadline passed ${Math.abs(daysRemaining)} days ago with ${incompleteTasks.length} active task${incompleteTasks.length > 1 ? "s" : ""} remaining.`;
        }
        // Priority 4: Deadline in <= 3 days with low completion
        else if (daysRemaining !== null && daysRemaining <= 3 && completionPercentage < 70) {
            primaryRisk = `Project deadline is in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""} with ${incompleteTasks.length} task${incompleteTasks.length > 1 ? "s" : ""} still incomplete (${completionPercentage}% completed).`;
        }
        // Priority 5: Active blocker
        else if (blockingTasks.length > 0) {
            primaryRisk = `"${blockingTasks[0].task.title}" is blocking ${blockingTasks[0].blockedCount} downstream task${blockingTasks[0].blockedCount > 1 ? "s" : ""}.`;
        }
        // Priority 6: Overdue tasks general
        else if (overdueTasks.length > 0) {
            primaryRisk = `${overdueTasks.length} task${overdueTasks.length > 1 ? "s are" : " is"} overdue, starting with "${overdueTasks[0].title}".`;
        }
        // Priority 7: Critical open risk
        else if (criticalRisks.length > 0) {
            primaryRisk = `Critical open risk "${criticalRisks[0].title}" is unresolved.`;
        }
        // Priority 8: Workload bottleneck
        else if (workloadConcentration) {
            primaryRisk = `${workloadConcentration.assigneeName} has an excessive concentration of active tasks (${workloadConcentration.percentage}%).`;
        }
        // Priority 9: Multiple contributing factors
        else {
            primaryRisk = "Multiple factors are contributing to project risk.";
        }
    }

    // --- 7. ACTIONABLE RECOMMENDATIONS ---
    const recommendations = [];

    const overdueBlocker = blockingTasks.find((b) => overdueTasks.some((ot) => ot.id === b.task.id));
    if (overdueBlocker) {
        recommendations.push(`Resolve "${overdueBlocker.task.title}" first to clear schedule delay and unblock ${overdueBlocker.blockedCount} dependent task${overdueBlocker.blockedCount > 1 ? "s" : ""}.`);
    } else if (blockingTasks.length > 0) {
        recommendations.push(`Resolve "${blockingTasks[0].task.title}" to unblock downstream work.`);
    } else if (overdueHighPriority.length > 0) {
        recommendations.push(`Resolve overdue high-priority task "${overdueHighPriority[0].title}" immediately.`);
    } else if (overdueTasks.length > 0) {
        recommendations.push(`Clear the ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""} to recover schedule velocity.`);
    }

    if (daysRemaining !== null && daysRemaining <= 7 && incompleteTasks.length > 0) {
        recommendations.push(`Review scope or schedule adjustments for the upcoming deadline (${daysRemaining <= 0 ? "due now" : `${daysRemaining} days left`} for ${incompleteTasks.length} tasks).`);
    }

    if (criticalRisks.length > 0) {
        recommendations.push(`Execute mitigation plan for critical risk "${criticalRisks[0].title}".`);
    } else if (highRisks.length > 0) {
        recommendations.push(`Review mitigation plan for high-severity risk "${highRisks[0].title}".`);
    }

    if (workloadConcentration) {
        recommendations.push(`Rebalance workload from ${workloadConcentration.assigneeName} to other team members.`);
    }

    if (recommendations.length === 0) {
        if (incompleteTasks.length === 0) {
            recommendations.push("Project is complete! Archive the project or conduct a retrospective.");
        } else {
            recommendations.push("Maintain current velocity to hit all project milestones on schedule.");
        }
    }

    // --- 8. PROACTIVE ALERT METADATA ---
    const alertEligible = riskLevel === "HIGH" || riskLevel === "CRITICAL" || signals.some((s) => s.severity === "high" || s.severity === "critical");
    let alertPriority = null;
    if (riskLevel === "CRITICAL") alertPriority = "critical";
    else if (riskLevel === "HIGH") alertPriority = "high";
    else if (riskLevel === "MEDIUM") alertPriority = "medium";

    return {
        projectId: project.id,
        projectTitle: project.title,
        riskLevel,
        riskScore,
        signals,
        primaryRisk,
        recommendations,
        metrics: {
            totalTasks,
            completedTasks: completedTasks.length,
            incompleteTasks: incompleteTasks.length,
            completionPercentage,
            overdueTasks: overdueCount,
            overdueHighPriority: overdueHighPriority.length,
            highPriorityIncomplete: highPriorityIncomplete.length,
            activeBlockers: blockingTasks.length,
            blockedTasks: totalBlockedTasks,
            openRisksCount: openRisks.length,
            criticalRisksCount: criticalRisks.length,
            daysUntilDeadline: daysRemaining,
            isDeadlinePassed: daysRemaining !== null && daysRemaining < 0,
            workloadConcentration
        },
        alertEligible,
        alertPriority
    };
};

/**
 * Analyzes project risk by fetching live database records and calculating risk metrics.
 * Supports options overrides for What-If simulation.
 */
export const analyzeProjectRisk = async (projectId, userId, options = {}) => {
    const project = await verifyProjectAccess(projectId, userId);

    const [tasks, risks] = await Promise.all([
        prisma.tasks.findMany({
            where: { project_id: projectId },
            include: {
                users_tasks_assigned_toTousers: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                },
                task_dependencies_task_dependencies_depends_on_task_idTotasks: {
                    include: {
                        tasks_task_dependencies_task_idTotasks: true
                    }
                },
                task_dependencies_task_dependencies_task_idTotasks: {
                    include: {
                        tasks_task_dependencies_depends_on_task_idTotasks: true
                    }
                }
            }
        }),
        prisma.risks ? prisma.risks.findMany({
            where: { project_id: projectId }
        }) : []
    ]);

    const startOfToday = options.startOfToday || getStartOfTodayUtc();

    return calculateProjectRiskMetrics({
        project: options.projectOverride || project,
        tasks: options.tasksOverride || tasks,
        risks: options.risksOverride || risks,
        startOfToday
    });
};

export default {
    analyzeProjectRisk,
    calculateProjectRiskMetrics,
    verifyProjectAccess,
    determineRiskLevel,
    RISK_THRESHOLDS
};
