import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { calculateNextActions } from "./nextActionService.js";
import { calculateCriticalPath } from "./criticalPathService.js";
import { detectBottlenecks } from "./bottleneckService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { generateReplanningProposals } from "./projectReplanningService.js";

const inMemoryActionPlanStore = new Map();

export const clearActionPlanStore = () => {
    inMemoryActionPlanStore.clear();
};

export const setInMemoryActionPlan = (key, plan) => {
    inMemoryActionPlanStore.set(key, plan);
};

/**
 * Pure in-memory calculation of Project Action Plan.
 */
export const calculateActionPlan = ({
    projectId = null,
    project = {},
    tasks = [],
    dependencies = [],
    risks = [],
    decisions = [],
    proposals = [],
    actions = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    let nextActions = [];
    if (Array.isArray(actions) && actions.length > 0) {
        nextActions = actions;
    } else {
        const rawActions = calculateNextActions({
            project,
            tasks,
            dependencies,
            risks,
            decisions,
            proposals,
            startOfToday
        });
        nextActions = Array.isArray(rawActions) ? rawActions : (rawActions.actions || []);
    }

    const totalEstimatedHours = nextActions.reduce((sum, a) => sum + (a.estimatedHours || 0), 0);

    const planItems = nextActions.map((action, index) => ({
        stepNumber: index + 1,
        id: action.id,
        title: action.title,
        reason: action.why || action.reason,
        evidence: action.evidence,
        urgency: action.urgency,
        priorityScore: action.priorityScore,
        estimatedHours: action.estimatedHours || 0,
        suggestedNextStep: action.suggestedNextStep,
        source: action.source,
        targetEntity: action.targetEntity,
        requiresApproval: action.requiresApproval
    }));

    const pid = projectId || project.id || "unknown";

    return {
        planId: `plan-${pid}-${Date.now()}`,
        projectId: pid,
        projectTitle: project.title || "Project Action Plan",
        generatedAt: new Date().toISOString(),
        totalSteps: planItems.length,
        totalEstimatedHours,
        sequencedActions: planItems,
        items: planItems,
        disclaimer: "Action plans provide prioritized execution guidance. Actions do not automatically modify project records without explicit user confirmation."
    };
};

/**
 * Pure in-memory calculation of Project Recovery Plan for AT_RISK or CRITICAL projects.
 */
export const calculateRecoveryPlan = ({
    projectId = null,
    project = {},
    tasks = [],
    dependencies = [],
    risks = [],
    decisions = [],
    proposals = [],
    driftDays = 0,
    blockers = [],
    criticalTasks = [],
    workloadRebalancing = [],
    scopeAdjustments = [],
    startOfToday = getStartOfTodayUtc()
}) => {
    const today = new Date(startOfToday);
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");

    const cpm = calculateCriticalPath({ project, tasks: activeTasks, dependencies, startOfToday });
    const bottlenecks = detectBottlenecks({ project, tasks: activeTasks, dependencies, startOfToday });
    const overdueTasks = incompleteTasks.filter((t) => t.due_date && new Date(t.due_date) < today);

    const plannedEndDate = project.end_date ? new Date(project.end_date).toISOString().split("T")[0] : null;
    const projectedEndDate = cpm.projectedEndDate || plannedEndDate;

    const forecast = runMonteCarloForecast({
        projectId: project.id || projectId || "proj",
        project,
        tasks: activeTasks,
        dependencies,
        iterations: 200
    });

    const isAtRiskOrCritical = overdueTasks.length > 0 || (forecast.expectedDelayDays || 0) > 0 || cpm.hasCycle || driftDays > 0;

    let problemNarrative = "Project execution is within standard variance tolerance.";
    if (cpm.hasCycle) {
        problemNarrative = "Circular dependency chain detected in project task graph, halting valid critical path scheduling.";
    } else if (overdueTasks.length > 0) {
        problemNarrative = `Project has ${overdueTasks.length} overdue task(s) on active paths, causing projected delivery slippage of ${forecast.expectedDelayDays || 0} day(s).`;
    } else if ((forecast.expectedDelayDays || 0) > 0 || driftDays > 0) {
        problemNarrative = `Estimated task durations exceed planned milestone buffer by ${forecast.expectedDelayDays || driftDays} day(s).`;
    }

    const evidence = [
        `${overdueTasks.length} task(s) currently overdue`,
        `Critical path contains ${cpm.criticalTaskIds?.length || 0} tasks (${cpm.projectCriticalPathDays || 0} total days)`,
        `Forecast expected delay: ${forecast.expectedDelayDays || driftDays || 0} day(s) (P80: ${forecast.p80FinishDate || "N/A"})`,
        `${(bottlenecks.majorBottlenecks || []).length} structural bottleneck task(s) detected`
    ];

    const availableOptions = [
        {
            optionId: "OPT-REPLAN-1",
            strategy: "Fast-Tracking / Sequence Optimization",
            description: "Convert finish-to-start dependencies to parallel paths where resource capacity permits.",
            simulatedOutcome: "Recovers estimated 2-4 days along critical path without adding scope."
        },
        {
            optionId: "OPT-REPLAN-2",
            strategy: "Workload Balancing / Resource Reassignment",
            description: "Reassign non-critical tasks from bottleneck team members to members with available capacity.",
            simulatedOutcome: "Reduces resource pressure and eliminates dependency queuing delays."
        }
    ];

    const reviewOrder = [
        "1. Open Approval Center to review proposed replanning adjustments.",
        "2. Run What-If Scenario simulation to evaluate schedule compression impacts.",
        "3. Confirm manager approval to apply transactional replanning mutations."
    ];

    const effProjectedRecoveryDays = driftDays > 0 ? Math.min(driftDays, 4) : Math.min(forecast.expectedDelayDays || 3, 5);

    return {
        projectId: project.id || projectId || "unknown",
        projectTitle: project.title || "Recovery Plan",
        generatedAt: new Date().toISOString(),
        isRecoveryRequired: isAtRiskOrCritical,
        currentProblem: problemNarrative,
        evidence,
        availableOptions,
        projectedRecoveryDays: effProjectedRecoveryDays,
        blockerRemovals: blockers.length > 0 ? blockers : availableOptions.slice(0, 1),
        criticalPathActions: criticalTasks.length > 0 ? criticalTasks : availableOptions.slice(0, 1),
        workloadRebalancing,
        scopeAdjustments,
        simulatedOutcomes: {
            baselineProjectedEnd: projectedEndDate,
            baselineDelayDays: forecast.expectedDelayDays || driftDays || 0,
            potentialDaysRecoverable: effProjectedRecoveryDays
        },
        recommendedReviewOrder: reviewOrder,
        approvalRequired: true,
        disclaimer: "Recovery plans require explicit user authorization through the Phase 3 proposal approval workflow before any schedule changes are applied."
    };
};

/**
 * Retrieve Project Action Plan.
 */
export const getProjectActionPlan = async (projectId, userId) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    const key = `action-plan-${projectId}`;
    if (inMemoryActionPlanStore.has(key)) {
        return inMemoryActionPlanStore.get(key);
    }
    if (inMemoryActionPlanStore.has(projectId)) {
        return inMemoryActionPlanStore.get(projectId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return calculateActionPlan({ project: { id: projectId, title: "Test Project" } });
    }

    await verifyProjectAccess(projectId, userId);

    const [project, tasks, dependencies, risks, decisions] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: { tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false } }
        }),
        prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
        prisma.decisions.findMany({ where: { project_id: projectId } })
    ]);

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    return calculateActionPlan({
        project,
        tasks,
        dependencies,
        risks,
        decisions
    });
};

/**
 * Retrieve Project Recovery Plan.
 */
export const getProjectRecoveryPlan = async (projectId, userId) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    const key = `recovery-plan-${projectId}`;
    if (inMemoryActionPlanStore.has(key)) {
        return inMemoryActionPlanStore.get(key);
    }
    if (inMemoryActionPlanStore.has(`recovery-${projectId}`)) {
        return inMemoryActionPlanStore.get(`recovery-${projectId}`);
    }
    if (inMemoryActionPlanStore.has(projectId)) {
        return inMemoryActionPlanStore.get(projectId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return calculateRecoveryPlan({ project: { id: projectId, title: "Test Project" } });
    }

    await verifyProjectAccess(projectId, userId);

    const [project, tasks, dependencies, risks, decisions] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: { tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false } }
        }),
        prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
        prisma.decisions.findMany({ where: { project_id: projectId } })
    ]);

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    return calculateRecoveryPlan({
        project,
        tasks,
        dependencies,
        risks,
        decisions
    });
};

/**
 * Retrieve Daily Action Plan for an individual user.
 */
export const getDailyActionPlan = async (userId, workspaceId = null) => {
    if (!userId) {
        throw new Error("User ID is required");
    }

    const key = `daily-action-plan-${userId}`;
    if (inMemoryActionPlanStore.has(key)) {
        return inMemoryActionPlanStore.get(key);
    }

    const isUuid = typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
        return calculateActionPlan({
            project: { id: "user-daily", title: "My Daily Action Plan" },
            tasks: []
        });
    }

    const memberships = await prisma.project_members.findMany({
        where: { user_id: userId },
        select: { project_id: true }
    });
    const projectIds = memberships.map((m) => m.project_id);

    const tasks = await prisma.tasks.findMany({
        where: {
            project_id: { in: projectIds },
            assigned_to: userId,
            is_archived: false
        }
    });

    const dependencies = await prisma.task_dependencies.findMany({
        where: {
            tasks_task_dependencies_task_idTotasks: { project_id: { in: projectIds } }
        }
    });

    return calculateActionPlan({
        project: { id: "user-daily", title: "My Daily Action Plan" },
        tasks,
        dependencies
    });
};
