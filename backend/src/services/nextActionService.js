import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { calculateCriticalPath } from "./criticalPathService.js";
import { detectBottlenecks } from "./bottleneckService.js";

const inMemoryNextActionStore = new Map();

export const clearNextActionStore = () => {
    inMemoryNextActionStore.clear();
};

export const setInMemoryNextActions = (key, actions) => {
    inMemoryNextActionStore.set(key, actions);
};

export const ACTION_TYPES = Object.freeze({
    CRITICAL_PATH_ACCELERATION: "CRITICAL_PATH_ACCELERATION",
    BOTTLENECK_RESOLUTION: "BOTTLENECK_RESOLUTION",
    STALLED_WORK_PROGRESSION: "STALLED_WORK_PROGRESSION",
    UNASSIGNED_TASK_ALLOCATION: "UNASSIGNED_TASK_ALLOCATION",
    REVIEW_OVERDUE_TASK: "REVIEW_OVERDUE_TASK",
    REVIEW_CRITICAL_TASK: "REVIEW_CRITICAL_TASK",
    REVIEW_BOTTLENECK: "REVIEW_BOTTLENECK",
    REVIEW_DEADLINE_RISK: "REVIEW_DEADLINE_RISK",
    REVIEW_RESOURCE_CONFLICT: "REVIEW_RESOURCE_CONFLICT",
    REVIEW_SCOPE_PRESSURE: "REVIEW_SCOPE_PRESSURE",
    REVIEW_RISK: "REVIEW_RISK",
    REVIEW_DECISION: "REVIEW_DECISION",
    REVIEW_REPLANNING: "REVIEW_REPLANNING",
    APPROVE_PROPOSAL: "APPROVE_PROPOSAL",
    REVIEW_PROJECT_HEALTH: "REVIEW_PROJECT_HEALTH",
    REVIEW_FORECAST: "REVIEW_FORECAST"
});

export const ACTION_URGENCY = Object.freeze({
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW"
});

export const getUrgencyFromScore = (score) => {
    if (score >= 80) return ACTION_URGENCY.CRITICAL;
    if (score >= 60) return ACTION_URGENCY.HIGH;
    if (score >= 35) return ACTION_URGENCY.MEDIUM;
    return ACTION_URGENCY.LOW;
};

/**
 * Deterministic Action Priority Scoring (0-100)
 * Evaluates urgency, critical-path impact, downstream dependency reach,
 * and project health context without evaluating personnel performance.
 */
export const calculateActionPriorityScore = ({
    status = null,
    overdueDays = 0,
    isOverdue = false,
    daysUntilDue = null,
    isCriticalPath = false,
    criticalProbability = 0,
    blockedDependentsCount = 0,
    isBottleneck = false,
    downstreamCount = 0,
    slack = null,
    driftDays = 0,
    projectHealthStatus = "HEALTHY",
    riskSeverity = null,
    isPendingApproval = false
} = {}) => {
    if (status === "Completed") return 0;

    let score = 20;

    // 1. Urgency / Overdue component
    if (isOverdue || overdueDays > 0) {
        score += 15 + Math.min(25, (overdueDays || 1) * 2);
    } else if (daysUntilDue !== null && daysUntilDue <= 1) {
        score += 15;
    } else if (daysUntilDue !== null && daysUntilDue <= 3) {
        score += 10;
    } else if (daysUntilDue !== null && daysUntilDue <= 7) {
        score += 5;
    }

    // 2. Critical Path component
    if (isCriticalPath || criticalProbability >= 80) {
        score += 25;
    } else if (criticalProbability >= 50) {
        score += 18;
    } else if (criticalProbability >= 20) {
        score += 10;
    }

    // 3. Downstream Impact / Blocker reach
    const totalDownstream = Math.max(blockedDependentsCount, downstreamCount);
    if (totalDownstream > 0) {
        score += 10 + Math.min(15, totalDownstream * 2);
    }

    // 4. Bottleneck context
    if (isBottleneck) {
        score += 15;
    }

    // 5. Slack impact
    if (typeof slack === "number") {
        if (slack < 0) {
            score += Math.min(20, Math.abs(slack) * 2);
        } else if (slack > 0) {
            score -= Math.min(15, slack);
        }
    }

    // 6. Drift days
    if (driftDays > 0) {
        score += Math.min(15, driftDays);
    }

    // 7. Project Health context
    if (projectHealthStatus === "CRITICAL") {
        score += 12;
    } else if (projectHealthStatus === "AT_RISK") {
        score += 8;
    } else if (projectHealthStatus === "WATCH") {
        score += 4;
    }

    // 8. Risk Severity & Approval readiness
    if (isPendingApproval) {
        score += 10;
    } else if (riskSeverity === "Critical" || riskSeverity === "CRITICAL") {
        score += 10;
    } else if (riskSeverity === "High" || riskSeverity === "HIGH") {
        score += 7;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
};

/**
 * Pure in-memory calculation of intelligent next actions for a project.
 */
export const calculateNextActions = ({
    projectId = null,
    project = {},
    tasks = [],
    dependencies = [],
    risks = [],
    decisions = [],
    proposals = [],
    forecast = null,
    health = null,
    resourceConflicts = null,
    scopeIntelligence = null,
    criticalPathData = null,
    bottlenecksData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const actions = [];
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");
    const today = new Date(startOfToday);
    const healthStatus = health?.healthStatus || health?.status || "HEALTHY";

    // Build reverse dependency lookup (downstream dependents map)
    const downstreamMap = new Map();
    activeTasks.forEach((t) => downstreamMap.set(t.id, []));
    (dependencies || []).forEach((d) => {
        const parentId = d.depends_on_task_id;
        const childId = d.task_id;
        if (downstreamMap.has(parentId)) {
            downstreamMap.get(parentId).push(childId);
        }
    });

    // Compute Critical Path and Bottlenecks
    let cpm = { criticalTaskIds: [] };
    let bottlenecks = { majorBottlenecks: [] };
    if (!criticalPathData) {
        try {
            cpm = calculateCriticalPath({ project, tasks: activeTasks, dependencies, startOfToday });
        } catch (e) {}
    }
    if (!bottlenecksData) {
        try {
            bottlenecks = detectBottlenecks({ project, tasks: activeTasks, dependencies, startOfToday });
        } catch (e) {}
    }

    const criticalTaskIds = new Set(criticalPathData?.criticalTaskIds || cpm.criticalTaskIds || []);
    const bottleneckList = bottlenecksData?.bottlenecks || bottlenecks.majorBottlenecks || bottlenecks.bottleneckTasks || [];
    const bottleneckTaskIds = new Set(bottleneckList.map((b) => b.taskId || b.id));

    // A. Task-Level Actions (Overdue, Critical, Bottlenecks, Near-term Deadlines)
    incompleteTasks.forEach((task) => {
        const isCritical = criticalTaskIds.has(task.id);
        const isBottleneck = bottleneckTaskIds.has(task.id);
        const downstream = downstreamMap.get(task.id) || [];
        const blockedCount = downstream.length;

        let overdueDays = 0;
        let daysUntilDue = null;
        if (task.due_date) {
            const dueDate = new Date(task.due_date);
            const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                overdueDays = Math.abs(diffDays);
            } else {
                daysUntilDue = diffDays;
            }
        }

        // 1. Overdue Task
        if (overdueDays > 0) {
            const priorityScore = calculateActionPriorityScore({
                overdueDays,
                isOverdue: true,
                isCriticalPath: isCritical,
                blockedDependentsCount: blockedCount,
                isBottleneck,
                projectHealthStatus: healthStatus
            });
            const urgency = getUrgencyFromScore(priorityScore);

            const evidence = [
                `${overdueDays} day(s) overdue (due ${new Date(task.due_date).toISOString().split("T")[0]})`,
                isCritical ? "Currently on the project critical path" : "Off critical path",
                blockedCount > 0 ? `Blocks ${blockedCount} downstream dependent task(s)` : "No downstream tasks blocked"
            ];
            if (isBottleneck) evidence.push("Identified as an operational bottleneck");
            if (task.estimated_hours) evidence.push(`${task.estimated_hours} estimated hours remaining`);

            actions.push({
                id: `action-overdue-${task.id}`,
                taskId: task.id,
                type: ACTION_TYPES.REVIEW_OVERDUE_TASK,
                title: `Review Overdue Task: ${task.title}`,
                why: `Task is ${overdueDays} day(s) overdue and requires immediate schedule review or replanning.`,
                evidence,
                urgency,
                priorityScore,
                source: isCritical ? ACTION_TYPES.CRITICAL_PATH_ACCELERATION : ACTION_TYPES.REVIEW_OVERDUE_TASK,
                suggestedNextStep: isCritical
                    ? `Open ${task.title} in Replanning to simulate deadline extension or task reassignment.`
                    : `Update status or revise due date for ${task.title}.`,
                targetEntity: {
                    type: "TASK",
                    id: task.id,
                    title: task.title,
                    assignedTo: task.assigned_to || null,
                    dueDate: task.due_date || null
                },
                requiresApproval: false
            });
        }
        // 2. Critical Path Incomplete Task (not overdue, but high importance)
        else if (isCritical) {
            const priorityScore = calculateActionPriorityScore({
                daysUntilDue,
                isCriticalPath: true,
                blockedDependentsCount: blockedCount,
                isBottleneck,
                projectHealthStatus: healthStatus
            });
            const urgency = getUrgencyFromScore(priorityScore);

            actions.push({
                id: `action-critical-${task.id}`,
                taskId: task.id,
                type: ACTION_TYPES.CRITICAL_PATH_ACCELERATION,
                title: `Maintain Velocity on Critical Task: ${task.title}`,
                why: "Task sits directly on the active critical path. Any delay will cause 1:1 project schedule slippage.",
                evidence: [
                    "Directly on project critical path (0 days slack)",
                    daysUntilDue !== null ? `Due in ${daysUntilDue} day(s)` : "No explicit due date set",
                    blockedCount > 0 ? `Precedes ${blockedCount} downstream task(s)` : "Terminal critical task"
                ],
                urgency,
                priorityScore,
                source: ACTION_TYPES.CRITICAL_PATH_ACCELERATION,
                suggestedNextStep: "Ensure resources are unblocked and focus daily standup priorities on this task.",
                targetEntity: {
                    type: "TASK",
                    id: task.id,
                    title: task.title,
                    assignedTo: task.assigned_to || null,
                    dueDate: task.due_date || null
                },
                requiresApproval: false
            });
        }
        // 3. Bottleneck Task
        else if (isBottleneck) {
            const priorityScore = calculateActionPriorityScore({
                daysUntilDue,
                isBottleneck: true,
                blockedDependentsCount: blockedCount,
                projectHealthStatus: healthStatus
            });
            const urgency = getUrgencyFromScore(priorityScore);

            actions.push({
                id: `action-bottleneck-${task.id}`,
                taskId: task.id,
                type: ACTION_TYPES.BOTTLENECK_RESOLUTION,
                title: `Alleviate Bottleneck: ${task.title}`,
                why: "Task is identified as a structural bottleneck causing scheduling delay drag.",
                evidence: [
                    "Identified by bottleneck intelligence engine",
                    `Blocks ${blockedCount} downstream task(s)`
                ],
                urgency,
                priorityScore,
                source: ACTION_TYPES.BOTTLENECK_RESOLUTION,
                suggestedNextStep: "Review task dependencies and consider parallelizing downstream work.",
                targetEntity: {
                    type: "TASK",
                    id: task.id,
                    title: task.title,
                    assignedTo: task.assigned_to || null
                },
                requiresApproval: false
            });
        }

        // 4. Stalled Task Check (updated_at older than 7 days)
        if (task.updated_at) {
            const daysSinceUpdate = Math.round((today.getTime() - new Date(task.updated_at).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceUpdate >= 7 && task.status !== "Completed") {
                const priorityScore = calculateActionPriorityScore({ isOverdue: true, overdueDays: 3, isCriticalPath: isCritical });
                const urgency = getUrgencyFromScore(priorityScore);
                actions.push({
                    id: `action-stall-${task.id}`,
                    taskId: task.id,
                    type: ACTION_TYPES.STALLED_WORK_PROGRESSION,
                    title: `Check Stalled Task: ${task.title}`,
                    why: `Task has experienced ${daysSinceUpdate} days of inactivity.`,
                    evidence: [`Last updated: ${new Date(task.updated_at).toISOString().split("T")[0]}`, `${daysSinceUpdate} days of inactivity`],
                    urgency,
                    priorityScore,
                    source: ACTION_TYPES.STALLED_WORK_PROGRESSION,
                    suggestedNextStep: "Review task status with owner or investigate blockers.",
                    targetEntity: { type: "TASK", id: task.id, title: task.title },
                    requiresApproval: false
                });
            }
        }

        // 5. Unassigned Task Check
        if (!task.assigned_to && (task.priority === "Urgent" || task.priority === "High")) {
            const priorityScore = calculateActionPriorityScore({ isCriticalPath: isCritical });
            const urgency = getUrgencyFromScore(priorityScore);
            actions.push({
                id: `action-unassigned-${task.id}`,
                taskId: task.id,
                type: ACTION_TYPES.UNASSIGNED_TASK_ALLOCATION,
                title: `Assign Resource: ${task.title}`,
                why: "High-priority task is currently unassigned.",
                evidence: [`Priority: ${task.priority || "Normal"}`, `Critical Path: ${isCritical ? "Yes" : "No"}`],
                urgency,
                priorityScore,
                source: ACTION_TYPES.UNASSIGNED_TASK_ALLOCATION,
                suggestedNextStep: "Assign task to available team member with matching skill profile.",
                targetEntity: { type: "TASK", id: task.id, title: task.title },
                requiresApproval: false
            });
        }
    });

    // B. Replanning Proposal Actions
    (proposals || []).forEach((prop) => {
        if (prop.status === "PROPOSED" || prop.status === "Pending") {
            const priorityScore = calculateActionPriorityScore({
                isPendingApproval: true,
                projectHealthStatus: healthStatus
            });
            const urgency = getUrgencyFromScore(priorityScore);

            actions.push({
                id: `action-proposal-${prop.id}`,
                type: ACTION_TYPES.APPROVE_PROPOSAL,
                title: `Review Replanning Proposal: ${prop.title || prop.strategy || "Schedule Optimization"}`,
                why: prop.rationale || "Replanning proposal generated to alleviate project delay and optimize delivery.",
                evidence: [
                    `Strategy: ${prop.strategy || "Optimization"}`,
                    `Projected impact: ${prop.summary?.expectedRecoveryDays ? `Recovers ${prop.summary.expectedRecoveryDays} day(s)` : "Improves schedule alignment"}`,
                    `Status: ${prop.status}`
                ],
                urgency,
                priorityScore,
                source: "projectReplanningService",
                suggestedNextStep: "Open Approval Center to inspect proposed changes, run scenario simulation, and confirm approval.",
                targetEntity: {
                    type: "PROPOSAL",
                    id: prop.id,
                    title: prop.title || prop.strategy
                },
                requiresApproval: true
            });
        }
    });

    // C. Open Risk Actions
    (risks || []).forEach((risk) => {
        if (risk.status === "Open" || risk.status === "OPEN") {
            const isCriticalRisk = risk.severity === "Critical" || risk.severity === "High";
            if (isCriticalRisk) {
                const priorityScore = calculateActionPriorityScore({
                    riskSeverity: risk.severity,
                    projectHealthStatus: healthStatus
                });
                const urgency = getUrgencyFromScore(priorityScore);

                actions.push({
                    id: `action-risk-${risk.id}`,
                    type: ACTION_TYPES.REVIEW_RISK,
                    title: `Mitigate ${risk.severity} Risk: ${risk.title}`,
                    why: risk.description || "High-severity project risk requires documented mitigation plan.",
                    evidence: [
                        `Severity: ${risk.severity}`,
                        `Probability: ${risk.probability || "Medium"}`,
                        risk.mitigation_plan ? `Mitigation: ${risk.mitigation_plan}` : "No mitigation plan documented"
                    ],
                    urgency,
                    priorityScore,
                    source: "projectRiskService",
                    suggestedNextStep: "Review risk mitigation actions with project owner and update status.",
                    targetEntity: {
                        type: "RISK",
                        id: risk.id,
                        title: risk.title
                    },
                    requiresApproval: false
                });
            }
        }
    });

    // D. Decision Actions
    (decisions || []).forEach((decision) => {
        if (decision.status === "Proposed" || decision.status === "PROPOSED") {
            const priorityScore = calculateActionPriorityScore({
                daysUntilDue: 1,
                projectHealthStatus: healthStatus
            });
            const urgency = getUrgencyFromScore(priorityScore);

            actions.push({
                id: `action-decision-${decision.id}`,
                type: ACTION_TYPES.REVIEW_DECISION,
                title: `Resolve Pending Decision: ${decision.decision}`,
                why: decision.reason || "Decision is awaiting confirmation to avoid blocking dependent execution.",
                evidence: [
                    `Status: ${decision.status}`,
                    decision.decision_date ? `Target date: ${new Date(decision.decision_date).toISOString().split("T")[0]}` : "No target date set"
                ],
                urgency,
                priorityScore,
                source: "decisionIntelligenceService",
                suggestedNextStep: "Confirm or reject decision in the Decisions dashboard.",
                targetEntity: {
                    type: "DECISION",
                    id: decision.id,
                    title: decision.decision
                },
                requiresApproval: true
            });
        }
    });

    // E. Scope Pressure Actions
    if (scopeIntelligence && (scopeIntelligence.scopePressure === "HIGH" || scopeIntelligence.scopePressure === "CRITICAL")) {
        const priorityScore = calculateActionPriorityScore({
            projectHealthStatus: healthStatus,
            riskSeverity: "High"
        });
        const urgency = getUrgencyFromScore(priorityScore);

        actions.push({
            id: `action-scope-${project.id || "proj"}`,
            type: ACTION_TYPES.REVIEW_SCOPE_PRESSURE,
            title: `Manage Scope Creep: ${scopeIntelligence.scopePressure} Pressure`,
            why: `Project has expanded by ${scopeIntelligence.netGrowthPercentage}% since baseline, creating delivery risk.`,
            evidence: [
                `Net scope growth: +${scopeIntelligence.netGrowthPercentage}%`,
                `Baseline task count: ${scopeIntelligence.baselineTaskCount}`,
                `Current active tasks: ${scopeIntelligence.currentTaskCount}`,
                `Scope creep events: ${scopeIntelligence.scopeCreepEvents?.length || 0}`
            ],
            urgency,
            priorityScore,
            source: "scopeIntelligenceService",
            suggestedNextStep: "Review recently added tasks and establish explicit change control.",
            targetEntity: {
                type: "PROJECT",
                id: project.id,
                title: project.title
            },
            requiresApproval: false
        });
    }

    // F. Forecast Risk Actions
    if (forecast && forecast.deadlineProbability !== null && forecast.deadlineProbability < 0.50) {
        const probPct = Math.round(forecast.deadlineProbability <= 1 ? forecast.deadlineProbability * 100 : forecast.deadlineProbability);
        const priorityScore = calculateActionPriorityScore({
            overdueDays: forecast.expectedDelayDays || 1,
            isCriticalPath: true,
            projectHealthStatus: healthStatus
        });
        const urgency = getUrgencyFromScore(priorityScore);

        actions.push({
            id: `action-forecast-${project.id || "proj"}`,
            type: ACTION_TYPES.REVIEW_FORECAST,
            title: `Address Low Deadline Probability (${probPct}%)`,
            why: `Monte Carlo forecast estimates only a ${probPct}% probability of meeting the project deadline.`,
            evidence: [
                `P50 Finish Date: ${forecast.p50FinishDate || "N/A"}`,
                `P80 Finish Date: ${forecast.p80FinishDate || "N/A"}`,
                `Expected delay: ${forecast.expectedDelayDays || 0} day(s)`
            ],
            urgency,
            priorityScore,
            source: "monteCarloForecastService",
            suggestedNextStep: "Trigger Replanning scenario simulation to explore sequence compression.",
            targetEntity: {
                type: "PROJECT",
                id: project.id,
                title: project.title
            },
            requiresApproval: false
        });
    }

    // Deterministic tie-breaking: priorityScore DESC, then title ASC
    actions.sort((a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title));

    return {
        projectId: project.id || projectId,
        actions
    };
};

/**
 * Fetch and calculate next actions for a project from database or in-memory store.
 */
export const getProjectNextActions = async (projectId, userId) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryNextActionStore.has(projectId)) {
        return inMemoryNextActionStore.get(projectId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return calculateNextActions({ project: { id: projectId, title: "Test Project" }, tasks: [], dependencies: [] });
    }

    await verifyProjectAccess(projectId, userId);

    const [project, tasks, dependencies, risks, decisions] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
            }
        }),
        prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
        prisma.decisions.findMany({ where: { project_id: projectId } })
    ]);

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    const actions = calculateNextActions({
        project,
        tasks,
        dependencies,
        risks,
        decisions
    });

    return actions;
};

/**
 * Fetch all prioritized next actions across authorized projects in a workspace.
 */
export const getWorkspaceNextActions = async (workspaceId, userId) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (inMemoryNextActionStore.has(workspaceId)) {
        return inMemoryNextActionStore.get(workspaceId);
    }
    const wsKey = `ws-${workspaceId}`;
    if (inMemoryNextActionStore.has(wsKey)) {
        return inMemoryNextActionStore.get(wsKey);
    }

    const isUuid = typeof workspaceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId);
    if (!isUuid) {
        return { workspaceId, actions: [] };
    }

    const membership = await prisma.workspace_members.findFirst({
        where: { workspace_id: workspaceId, user_id: userId }
    });
    if (!membership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    const projects = await prisma.projects.findMany({
        where: { workspace_id: workspaceId, is_archived: false },
        include: {
            tasks: { where: { is_archived: false } },
            risks: { where: { status: "Open" } },
            decisions: true
        }
    });

    let allActions = [];
    for (const proj of projects) {
        const deps = await prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: proj.id, is_archived: false }
            }
        });
        const projRes = calculateNextActions({
            project: proj,
            tasks: proj.tasks,
            dependencies: deps,
            risks: proj.risks,
            decisions: proj.decisions
        });
        const list = Array.isArray(projRes) ? projRes : (projRes.actions || []);
        allActions = allActions.concat(list);
    }

    allActions.sort((a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title));
    return {
        workspaceId,
        actions: allActions
    };
};
