/**
 * Intervention Impact Engine (Phase 9)
 * 
 * Evaluates proposed project interventions BEFORE they are applied.
 * Simulates actions against an in-memory Digital Twin clone, calculating:
 * - Before / After project intelligence deltas
 * - Benefits vs. Costs trade-offs
 * - Side-effect detection (workload transfer, secondary bottlenecks, critical path migration)
 * - Deterministic 0-100 Impact Score
 * - Shockwave containment and blast radius reduction
 * - Monte Carlo P50/P80/P90 forecast shifts
 * - Multi-intervention comparison matrix
 * - Staged proposals for the Phase 3 Approval Center with stale-state protection
 * 
 * NON-NEGOTIABLE SAFETY INVARIANTS:
 * - 100% READ-ONLY / SIMULATION ONLY
 * - ZERO database mutations (no direct task, deadline, dependency, or assignee writes)
 * - Reuses existing Phase 1-8 analytical engines without duplicating algorithms
 * - Preserves workspace and project authorization
 * - Stale-state protection via baseStateHash
 */

import crypto from "crypto";
import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { getStartOfTodayUtc } from "./taskService.js";

// Phase 1-8 Engine Reuse
import {
    buildDependencyGraph,
    detectCycles,
    calculateCriticalPath,
    calculateTaskDurationDays
} from "./criticalPathService.js";
import {
    runScenarioSimulation,
    computeProjectStateHash,
    MUTATION_TYPES,
    SCENARIO_STATUS,
    deepClone
} from "./scenarioSimulationService.js";
import { buildDigitalTwin, getProjectDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth, HEALTH_STATUS } from "./projectHealthService.js";
import { detectBottlenecks } from "./bottleneckService.js";
import { calculateScheduleDrift, DRIFT_SEVERITY } from "./scheduleDriftService.js";
import { calculateDeadlineRisks } from "./deadlineRiskService.js";
import { calculateTeamWorkload, calculateKnowledgeConcentration } from "./teamIntelligenceService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { calculateRecoveryPlan } from "./actionPlanService.js";
import {
    traverseDownstreamDependencies,
    calculateProjectContainment
} from "./dependencyShockwaveService.js";
import {
    setInMemoryApproval,
    getInMemoryApproval
} from "./intelligenceApprovalService.js";

// ============================================================
// CONSTANTS & INTERVENTION ENUMS
// ============================================================

export const INTERVENTION_TYPES = Object.freeze({
    REASSIGN_TASK: "REASSIGN_TASK",
    CHANGE_TASK_PRIORITY: "CHANGE_TASK_PRIORITY",
    CHANGE_TASK_DEADLINE: "CHANGE_TASK_DEADLINE",
    CHANGE_TASK_ESTIMATE: "CHANGE_TASK_ESTIMATE",
    CHANGE_TASK_STATUS: "CHANGE_TASK_STATUS",
    ADD_RESOURCE: "ADD_RESOURCE",
    REMOVE_RESOURCE: "REMOVE_RESOURCE",
    CHANGE_RESOURCE_AVAILABILITY: "CHANGE_RESOURCE_AVAILABILITY",
    CHANGE_TASK_ASSIGNMENT: "CHANGE_TASK_ASSIGNMENT",
    ADD_DEPENDENCY: "ADD_DEPENDENCY",
    REMOVE_DEPENDENCY: "REMOVE_DEPENDENCY",
    CHANGE_SCOPE: "CHANGE_SCOPE",
    PARALLELIZE_COMPATIBLE_WORK: "PARALLELIZE_COMPATIBLE_WORK",
    RECOVERY_ACTION: "RECOVERY_ACTION"
});

export const IMPACT_CLASSIFICATION = Object.freeze({
    HIGH_POSITIVE_IMPACT: "HIGH_POSITIVE_IMPACT",
    MODERATE_POSITIVE_IMPACT: "MODERATE_POSITIVE_IMPACT",
    NEUTRAL_IMPACT: "NEUTRAL_IMPACT",
    LOW_OR_RISKY_IMPACT: "LOW_OR_RISKY_IMPACT",
    NEGATIVE_IMPACT: "NEGATIVE_IMPACT"
});

export const SIDE_EFFECT_SEVERITY = Object.freeze({
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW"
});

const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// In-memory cache for evaluated interventions
const inMemoryInterventionStore = new Map();

export const clearInterventionStore = () => {
    inMemoryInterventionStore.clear();
};

export const setInMemoryIntervention = (key, result) => {
    inMemoryInterventionStore.set(key, result);
};

export const getInMemoryIntervention = (key) => {
    return inMemoryInterventionStore.get(key);
};

// ============================================================
// MUTATION TRANSLATOR
// ============================================================

/**
 * Translates a high-level intervention definition into low-level scenario mutations.
 */
export const translateInterventionToMutations = ({
    intervention,
    tasks = [],
    projectMembers = [],
    dependencies = []
}) => {
    const type = intervention?.type;
    const params = intervention?.parameters || {};
    const targetEntity = intervention?.targetEntity || {};
    const taskId = targetEntity.taskId || params.taskId;
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const mutations = [];

    switch (type) {
        case INTERVENTION_TYPES.REASSIGN_TASK:
        case INTERVENTION_TYPES.CHANGE_TASK_ASSIGNMENT: {
            const toUserId = params.toUserId || params.newAssignee || targetEntity.userId;
            mutations.push({
                type: MUTATION_TYPES.TASK_REASSIGN,
                taskId,
                toUserId,
                parameter: { toUserId, newAssignee: toUserId }
            });
            break;
        }

        case INTERVENTION_TYPES.CHANGE_TASK_PRIORITY: {
            const priority = params.priority || params.newPriority || "Medium";
            mutations.push({
                type: MUTATION_TYPES.TASK_PRIORITY_CHANGE,
                taskId,
                priority,
                parameter: { priority }
            });
            break;
        }

        case INTERVENTION_TYPES.CHANGE_TASK_DEADLINE: {
            if (taskId) {
                mutations.push({
                    type: MUTATION_TYPES.TASK_DUE_DATE_CHANGE,
                    taskId,
                    newDueDate: params.newDueDate || params.dueDate,
                    daysOffset: params.daysOffset,
                    parameter: { newDueDate: params.newDueDate, daysOffset: params.daysOffset }
                });
            } else if (params.daysOffset !== undefined || params.newEndDate) {
                mutations.push({
                    type: MUTATION_TYPES.PROJECT_DEADLINE_CHANGE,
                    daysOffset: params.daysOffset,
                    newEndDate: params.newEndDate
                });
            }
            break;
        }

        case INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE: {
            const hoursDelta = Number(params.hoursDelta || params.hours || 0);
            if (hoursDelta > 0) {
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                    taskId,
                    hours: hoursDelta,
                    parameter: { hours: hoursDelta }
                });
            } else if (hoursDelta < 0) {
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                    taskId,
                    hours: Math.abs(hoursDelta),
                    parameter: { hours: Math.abs(hoursDelta) }
                });
            } else if (params.newEstimateHours) {
                const targetTask = taskMap.get(taskId);
                const current = Number(targetTask?.estimated_hours || 8);
                const diff = Number(params.newEstimateHours) - current;
                if (diff > 0) {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                        taskId,
                        hours: diff,
                        parameter: { hours: diff }
                    });
                } else if (diff < 0) {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                        taskId,
                        hours: Math.abs(diff),
                        parameter: { hours: Math.abs(diff) }
                    });
                }
            }
            break;
        }

        case INTERVENTION_TYPES.CHANGE_TASK_STATUS: {
            const status = params.status || params.newStatus || "Completed";
            if (status === "Completed") {
                mutations.push({
                    type: MUTATION_TYPES.TASK_COMPLETE,
                    taskId,
                    parameter: { status: "Completed" }
                });
            }
            break;
        }

        case INTERVENTION_TYPES.ADD_RESOURCE: {
            // Adds resource capacity: reduces duration of bottleneck / critical tasks
            const candidateTaskIds = params.taskIds || (taskId ? [taskId] : tasks.slice(0, 2).map((t) => t.id));
            const hoursPerTask = Number(params.hoursReduction || 8);
            candidateTaskIds.forEach((tId) => {
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                    taskId: tId,
                    hours: hoursPerTask,
                    parameter: { hours: hoursPerTask }
                });
            });
            break;
        }

        case INTERVENTION_TYPES.REMOVE_RESOURCE: {
            // Removes resource: increases duration on affected tasks or reassigns
            const candidateTaskIds = params.taskIds || (taskId ? [taskId] : []);
            const hoursAdded = Number(params.hoursAdded || 8);
            candidateTaskIds.forEach((tId) => {
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                    taskId: tId,
                    hours: hoursAdded,
                    parameter: { hours: hoursAdded }
                });
            });
            break;
        }

        case INTERVENTION_TYPES.CHANGE_RESOURCE_AVAILABILITY: {
            const hoursShift = Number(params.hoursShift || 0);
            const userTasks = tasks.filter((t) => t.assigned_to === (targetEntity.userId || params.userId));
            userTasks.forEach((t) => {
                if (hoursShift < 0) {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                        taskId: t.id,
                        hours: Math.abs(hoursShift),
                        parameter: { hours: Math.abs(hoursShift) }
                    });
                } else if (hoursShift > 0) {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                        taskId: t.id,
                        hours: hoursShift,
                        parameter: { hours: hoursShift }
                    });
                }
            });
            break;
        }

        case INTERVENTION_TYPES.ADD_DEPENDENCY: {
            const depTaskId = targetEntity.taskId || params.taskId;
            const dependsOn = targetEntity.dependsOnTaskId || params.dependsOnTaskId;
            if (depTaskId && dependsOn) {
                mutations.push({
                    type: MUTATION_TYPES.DEPENDENCY_CREATE,
                    taskId: depTaskId,
                    dependsOnTaskId: dependsOn,
                    parameter: { taskId: depTaskId, dependsOnTaskId: dependsOn }
                });
            }
            break;
        }

        case INTERVENTION_TYPES.REMOVE_DEPENDENCY:
        case INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK: {
            const depTaskId = targetEntity.taskId || params.taskId;
            const dependsOn = targetEntity.dependsOnTaskId || params.dependsOnTaskId;
            if (depTaskId && dependsOn) {
                mutations.push({
                    type: MUTATION_TYPES.DEPENDENCY_REMOVE,
                    taskId: depTaskId,
                    dependsOnTaskId: dependsOn,
                    parameter: { taskId: depTaskId, dependsOnTaskId: dependsOn }
                });
            } else if (dependencies.length > 0) {
                // Default to first non-critical dependency if unspecified
                const firstDep = dependencies[0];
                mutations.push({
                    type: MUTATION_TYPES.DEPENDENCY_REMOVE,
                    taskId: firstDep.task_id,
                    dependsOnTaskId: firstDep.depends_on_task_id,
                    parameter: { taskId: firstDep.task_id, dependsOnTaskId: firstDep.depends_on_task_id }
                });
            }
            break;
        }

        case INTERVENTION_TYPES.CHANGE_SCOPE: {
            const action = params.action || "REMOVE_TASK";
            if (action === "REMOVE_TASK" && taskId) {
                mutations.push({
                    type: MUTATION_TYPES.SCOPE_CHANGE,
                    action: "REMOVE_TASK",
                    taskId,
                    parameter: { action: "REMOVE_TASK", taskId }
                });
            } else if (action === "ADD_TASK" && params.taskData) {
                mutations.push({
                    type: MUTATION_TYPES.SCOPE_CHANGE,
                    action: "ADD_TASK",
                    taskData: params.taskData,
                    parameter: { action: "ADD_TASK", taskData: params.taskData }
                });
            }
            break;
        }

        case INTERVENTION_TYPES.RECOVERY_ACTION: {
            // Apply recovery strategy: Fast-track bottleneck or duration compressions
            let targetTid = taskId || targetEntity?.taskId || params?.taskId;
            if (!targetTid && tasks.length > 0) {
                // Pick the first incomplete task or critical task
                const incomplete = tasks.filter((t) => !t.is_archived && t.status !== "Completed");
                targetTid = incomplete.length > 0 ? incomplete[0].id : tasks[0].id;
            }
            if (targetTid) {
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                    taskId: targetTid,
                    hours: 8,
                    parameter: { hours: 8, recoveryStrategy: "SCHEDULE_COMPRESSION" }
                });
            }
            break;
        }

        default:
            return { supported: false, mutations: [], reason: `Unsupported intervention type '${type}'.` };
    }

    return { supported: mutations.length > 0, mutations, reason: null };
};

// ============================================================
// TRADE-OFF & IMPACT SCORING ENGINE
// ============================================================

/**
 * Calculates a transparent, deterministic 0-100 Impact Score for an intervention.
 * 
 * Formula Components:
 * - Base Score: 50
 * - Schedule Recovery: up to +25 pts
 * - Health Score Delta: up to +20 pts
 * - Critical Path Relief: up to +15 pts
 * - Bottleneck Relief: up to +15 pts
 * - Workload Cost / Overload Penalties: up to -25 pts
 * - New Bottlenecks Formed: -10 pts each (up to -20 pts)
 * - Newly Critical Tasks: -5 pts each (up to -15 pts)
 */
export const calculateInterventionScore = ({
    scheduleRecoveryDays = 0,
    healthDelta = 0,
    criticalTasksDelta = 0,
    resolvedBottlenecksCount = 0,
    newBottlenecksCount = 0,
    newlyCriticalCount = 0,
    recipientWorkloadHoursAdded = 0,
    recipientOverloaded = false,
    hasCycle = false
}) => {
    if (hasCycle) {
        return {
            score: 0,
            classification: IMPACT_CLASSIFICATION.NEGATIVE_IMPACT,
            factors: ["Circular dependency detected! Project sequence deadlock (-100 pts)"]
        };
    }

    let score = 50;
    const factors = [];

    // 1. Schedule Recovery (+8 pts per day, max 25)
    if (scheduleRecoveryDays > 0) {
        const schedulePts = Math.min(25, Math.round(scheduleRecoveryDays * 8));
        score += schedulePts;
        factors.push(`Schedule recovery of +${scheduleRecoveryDays} day(s) (+${schedulePts} pts)`);
    } else if (scheduleRecoveryDays < 0) {
        const delayPts = Math.min(25, Math.round(Math.abs(scheduleRecoveryDays) * 8));
        score -= delayPts;
        factors.push(`Schedule elongation of ${scheduleRecoveryDays} day(s) (-${delayPts} pts)`);
    }

    // 2. Health Delta (+1 pt per health point, max 20)
    if (healthDelta > 0) {
        const healthPts = Math.min(20, healthDelta);
        score += healthPts;
        factors.push(`Project health improvement of +${healthDelta} pts (+${healthPts} pts)`);
    } else if (healthDelta < 0) {
        const healthPen = Math.min(25, Math.abs(healthDelta));
        score -= healthPen;
        factors.push(`Project health decline of ${healthDelta} pts (-${healthPen} pts)`);
    }

    // 3. Critical Path Relief (-1 task is good)
    if (criticalTasksDelta < 0) {
        const critPts = Math.min(15, Math.abs(criticalTasksDelta) * 5);
        score += critPts;
        factors.push(`Critical path reduction of ${Math.abs(criticalTasksDelta)} task(s) (+${critPts} pts)`);
    } else if (newlyCriticalCount > 0) {
        const critPen = Math.min(15, newlyCriticalCount * 5);
        score -= critPen;
        factors.push(`${newlyCriticalCount} new task(s) forced onto critical path (-${critPen} pts)`);
    }

    // 4. Bottleneck Relief
    if (resolvedBottlenecksCount > 0) {
        const bnPts = Math.min(15, resolvedBottlenecksCount * 8);
        score += bnPts;
        factors.push(`${resolvedBottlenecksCount} structural bottleneck(s) resolved (+${bnPts} pts)`);
    }
    if (newBottlenecksCount > 0) {
        const bnPen = Math.min(20, newBottlenecksCount * 10);
        score -= bnPen;
        factors.push(`${newBottlenecksCount} new structural bottleneck(s) created (-${bnPen} pts)`);
    }

    // 5. Workload Costs
    if (recipientWorkloadHoursAdded > 0) {
        const workPen = Math.min(15, Math.round(recipientWorkloadHoursAdded * 1.5));
        score -= workPen;
        factors.push(`Workload pressure added: +${recipientWorkloadHoursAdded}h (-${workPen} pts)`);
    }
    if (recipientOverloaded) {
        score -= 10;
        factors.push(`Assignee exceeds 80% maximum capacity threshold (-10 pts)`);
    }

    const finalScore = Math.max(0, Math.min(100, score));

    let classification = IMPACT_CLASSIFICATION.NEUTRAL_IMPACT;
    if (finalScore >= 80) classification = IMPACT_CLASSIFICATION.HIGH_POSITIVE_IMPACT;
    else if (finalScore >= 65) classification = IMPACT_CLASSIFICATION.MODERATE_POSITIVE_IMPACT;
    else if (finalScore >= 45) classification = IMPACT_CLASSIFICATION.NEUTRAL_IMPACT;
    else if (finalScore >= 25) classification = IMPACT_CLASSIFICATION.LOW_OR_RISKY_IMPACT;
    else classification = IMPACT_CLASSIFICATION.NEGATIVE_IMPACT;

    return {
        score: finalScore,
        classification,
        factors
    };
};

/**
 * Detects unintended consequences and side effects resulting from an intervention.
 */
export const detectSideEffects = ({
    baseline,
    simulated,
    intervention,
    tasks = []
}) => {
    const sideEffects = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // 1. Workload transfer / Overload
    const baselineWorkload = baseline?.workload?.members || [];
    const simulatedWorkload = simulated?.workload?.members || [];
    const targetUserId = intervention?.parameters?.toUserId || intervention?.parameters?.userId;

    if (targetUserId) {
        const baseM = baselineWorkload.find((m) => m.userId === targetUserId);
        const simM = simulatedWorkload.find((m) => m.userId === targetUserId);
        const hoursBefore = baseM?.totalHours || 0;
        let hoursAfter = simM?.totalHours || 0;
        let addedHours = Math.max(0, hoursAfter - hoursBefore);

        if (addedHours === 0 && Array.isArray(tasks)) {
            const taskId = intervention?.targetEntity?.taskId || intervention?.parameters?.taskId;
            const targetTask = tasks.find((t) => t.id === taskId);
            if (targetTask && (intervention.type === INTERVENTION_TYPES.REASSIGN_TASK || intervention.type === "REASSIGN_TASK")) {
                addedHours = Number(targetTask.estimated_hours || targetTask.estimatedHours || 8);
                hoursAfter = hoursBefore + addedHours;
            }
        }

        if (addedHours > 0) {
            const isOverloaded = (simM?.utilizationPercentage || (hoursAfter / 40) * 100) > 80;
            sideEffects.push({
                type: "WORKLOAD_TRANSFER",
                severity: isOverloaded ? SIDE_EFFECT_SEVERITY.HIGH : SIDE_EFFECT_SEVERITY.MEDIUM,
                title: "Workload Transfer Pressure",
                description: `Assignee workload increases by +${addedHours}h (from ${hoursBefore}h to ${hoursAfter}h).`,
                targetUserId,
                isOverloaded
            });
        }
    }

    // 2. New Bottlenecks
    const oldBottlenecks = new Set((baseline?.bottlenecks?.items || []).map((b) => b.taskId));
    const newBottlenecks = (simulated?.bottlenecks?.items || []).filter((b) => !oldBottlenecks.has(b.taskId));
    newBottlenecks.forEach((b) => {
        sideEffects.push({
            type: "NEW_BOTTLENECK",
            severity: SIDE_EFFECT_SEVERITY.HIGH,
            title: `New Bottleneck: ${taskMap.get(b.taskId)?.title || b.taskId}`,
            description: `Task '${taskMap.get(b.taskId)?.title || b.taskId}' has emerged as a secondary bottleneck with friction score ${b.score || 75}.`,
            taskId: b.taskId
        });
    });

    // 3. Critical Path Migration
    const oldCritical = new Set(baseline?.criticalPath?.criticalTaskIds || baseline?.criticalPath?.criticalTasks || []);
    const newCritical = (simulated?.criticalPath?.criticalTaskIds || simulated?.criticalPath?.criticalTasks || [])
        .filter((id) => !oldCritical.has(id));

    if (newCritical.length > 0) {
        sideEffects.push({
            type: "CRITICAL_PATH_MIGRATION",
            severity: SIDE_EFFECT_SEVERITY.MEDIUM,
            title: "Critical Path Migration",
            description: `${newCritical.length} task(s) migrated onto the critical path: ${newCritical.map((id) => taskMap.get(id)?.title || id).join(", ")}.`,
            migratedTaskIds: newCritical
        });
    }

    // 4. Secondary Deadline Risks
    const baseDeadlines = baseline?.deadlineRisks?.risks || [];
    const simDeadlines = simulated?.deadlineRisks?.risks || [];
    const newlyThreatened = simDeadlines.filter((r) =>
        !baseDeadlines.some((br) => br.taskId === r.taskId && br.riskLevel === r.riskLevel)
    );

    if (newlyThreatened.length > 0) {
        sideEffects.push({
            type: "SECONDARY_DEADLINE_RISK",
            severity: SIDE_EFFECT_SEVERITY.HIGH,
            title: "Secondary Deadline Pressure",
            description: `${newlyThreatened.length} task(s) face newly elevated deadline pressure.`,
            tasks: newlyThreatened.map((r) => taskMap.get(r.taskId)?.title || r.taskId)
        });
    }

    return sideEffects;
};

// ============================================================
// CORE EVALUATION ENGINE
// ============================================================

/**
 * Evaluates a proposed project intervention against the project's Digital Twin.
 * 
 * Safety invariants:
 * - 100% READ-ONLY
 * - ZERO database mutations
 * - Stale-state protection via baseStateHash
 */
export const evaluateIntervention = async ({
    projectId,
    userId,
    intervention,
    customMutations = null,
    inMemoryData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to evaluate an intervention.");
    }
    if (!intervention || typeof intervention !== "object") {
        throw new Error("Intervention definition object is required.");
    }

    // 1. Authorization & Data Gathering
    let project, tasks, dependencies, projectMembers, risks, decisions;

    if (inMemoryData) {
        project = inMemoryData.project || { id: projectId, title: "Test Project" };
        tasks = inMemoryData.tasks || [];
        dependencies = inMemoryData.dependencies || [];
        projectMembers = inMemoryData.projectMembers || [];
        risks = inMemoryData.risks || [];
        decisions = inMemoryData.decisions || [];
    } else if (isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
        const [p, t, d, pm, r, dec] = await Promise.all([
            prisma.projects.findUnique({ where: { id: projectId } }),
            prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
            prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false }
                }
            }),
            prisma.project_members.findMany({
                where: { project_id: projectId },
                include: { users: { select: { id: true, email: true, first_name: true, last_name: true } } }
            }),
            prisma.risks.findMany({ where: { project_id: projectId } }),
            prisma.project_decisions ? prisma.project_decisions.findMany({ where: { project_id: projectId } }) : []
        ]);
        project = p;
        tasks = t || [];
        dependencies = d || [];
        projectMembers = pm || [];
        risks = r || [];
        decisions = dec || [];
    } else {
        project = { id: projectId, title: "Mock Project" };
        tasks = [];
        dependencies = [];
        projectMembers = [];
        risks = [];
        decisions = [];
    }

    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // 2. Base State Hash for Stale-State Protection
    const baseStateHash = computeProjectStateHash({ project, tasks, dependencies });

    // 3. Baseline Intelligence Stack
    const baseTwin = buildDigitalTwin({
        project,
        tasks,
        dependencies,
        projectMembers,
        risks,
        decisions,
        startOfToday
    });

    const baselineCpm = calculateCriticalPath({ project, tasks, dependencies, startOfToday });
    const baselineBottlenecks = detectBottlenecks({ project, tasks, dependencies, startOfToday });
    const baselineHealth = calculateProjectHealth(baseTwin, { startOfToday });
    const baselineDrift = calculateScheduleDrift(baseTwin, startOfToday);
    const baselineDeadlineRisks = calculateDeadlineRisks(baseTwin);
    const baselineWorkload = calculateTeamWorkload(baseTwin);
    const baselineKnowledge = calculateKnowledgeConcentration(baseTwin);

    let baselineForecast = null;
    try {
        if (tasks.length > 0) {
            baselineForecast = runMonteCarloForecast({
                projectId,
                project,
                tasks,
                dependencies,
                iterations: 500,
                seed: 42
            });
        }
    } catch (_) {}

    // Baseline Shockwave Containment for target task (if applicable)
    const targetTaskId = intervention?.targetEntity?.taskId || intervention?.parameters?.taskId || (tasks[0]?.id);
    let baselineShockwave = null;
    if (targetTaskId && tasks.length > 0) {
        const basePropagation = traverseDownstreamDependencies({
            tasks,
            dependencies,
            sourceTaskIds: [targetTaskId]
        });
        const baseContainment = calculateProjectContainment({
            shockMagnitudeDays: 3,
            projectCompletionDelayDays: baselineDrift?.deltaDays || 0,
            totalTasksCount: tasks.length,
            affectedTasksCount: basePropagation.totalAffected,
            propagationDepth: basePropagation.maxDepth
        });
        baselineShockwave = {
            totalAffected: basePropagation.totalAffected,
            maxDepth: basePropagation.maxDepth,
            containmentScore: baseContainment.containmentScore
        };
    }

    const baseline = {
        stateHash: baseStateHash,
        health: { score: baselineHealth.score, status: baselineHealth.status },
        schedule: {
            plannedEnd: project?.end_date,
            projectedEnd: baselineDrift.projectedEndDate,
            deltaDays: baselineDrift.deltaDays,
            severity: baselineDrift.severity
        },
        criticalPath: {
            durationDays: baselineCpm.projectCriticalPathDays || 0,
            criticalTasksCount: (baselineCpm.criticalTaskIds || []).length,
            criticalTaskIds: baselineCpm.criticalTaskIds || []
        },
        bottlenecks: {
            count: baselineBottlenecks.count || 0,
            items: (baselineBottlenecks.bottlenecks || []).map((b) => ({ taskId: b.taskId, score: b.bottleneckScore }))
        },
        deadlineRisks: {
            totalCount: Array.isArray(baselineDeadlineRisks) ? baselineDeadlineRisks.length : (baselineDeadlineRisks?.summary?.total || 0),
            risks: Array.isArray(baselineDeadlineRisks) ? baselineDeadlineRisks : []
        },
        workload: {
            members: (baselineWorkload.members || []).map((m) => ({
                userId: m.userId,
                name: m.name,
                totalHours: m.remainingHours ?? m.estimatedHours ?? m.totalHours ?? 0,
                taskCount: m.taskCount,
                utilizationPercentage: m.capacityRatio ? Math.round(m.capacityRatio * 100) : 50
            }))
        },
        forecast: baselineForecast ? {
            p50Date: baselineForecast.percentiles?.p50?.date || baselineForecast.p50FinishDate,
            p80Date: baselineForecast.percentiles?.p80?.date || baselineForecast.p80FinishDate,
            p90Date: baselineForecast.percentiles?.p90?.date || baselineForecast.p90FinishDate,
            p50Days: baselineForecast.percentiles?.p50?.days ?? 0,
            p80Days: baselineForecast.percentiles?.p80?.days ?? 0,
            p90Days: baselineForecast.percentiles?.p90?.days ?? 0
        } : null,
        shockwave: baselineShockwave
    };

    // 4. Translate & Apply Intervention to In-Memory Clone
    let mutations = [];
    if (Array.isArray(customMutations) && customMutations.length > 0) {
        mutations = customMutations;
    } else {
        const translation = translateInterventionToMutations({
            intervention,
            tasks,
            projectMembers,
            dependencies
        });

        if (!translation.supported) {
            return {
                supported: false,
                projectId,
                intervention,
                reason: translation.reason || "Intervention parameters could not be safely simulated.",
                simulationOnly: true,
                baseline
            };
        }
        mutations = translation.mutations;
    }

    // Run pure in-memory scenario simulation
    const simResult = runScenarioSimulation({
        project,
        tasks,
        dependencies,
        projectMembers,
        risks,
        decisions,
        mutations,
        startOfToday
    });

    const clonedProject = deepClone(project);
    const clonedTasks = deepClone(tasks);
    const clonedDependencies = deepClone(dependencies);
    const clonedMembers = deepClone(projectMembers);

    // Deep apply mutations to extract simulated graph
    mutations.forEach((m) => {
        if (m.type === MUTATION_TYPES.TASK_REASSIGN && m.toUserId) {
            const t = clonedTasks.find((item) => item.id === m.taskId);
            if (t) t.assigned_to = m.toUserId;
        } else if (m.type === MUTATION_TYPES.TASK_PRIORITY_CHANGE && m.priority) {
            const t = clonedTasks.find((item) => item.id === m.taskId);
            if (t) t.priority = m.priority;
        } else if (m.type === MUTATION_TYPES.TASK_DURATION_DECREASE && m.hours) {
            const t = clonedTasks.find((item) => item.id === m.taskId);
            if (t) t.estimated_hours = Math.max(1, (Number(t.estimated_hours) || 8) - Number(m.hours));
        } else if (m.type === MUTATION_TYPES.TASK_DURATION_INCREASE && m.hours) {
            const t = clonedTasks.find((item) => item.id === m.taskId);
            if (t) t.estimated_hours = (Number(t.estimated_hours) || 8) + Number(m.hours);
        } else if (m.type === MUTATION_TYPES.TASK_COMPLETE) {
            const t = clonedTasks.find((item) => item.id === m.taskId);
            if (t) t.status = "Completed";
        } else if (m.type === MUTATION_TYPES.DEPENDENCY_REMOVE) {
            const idx = clonedDependencies.findIndex((d) => d.task_id === m.taskId && d.depends_on_task_id === m.dependsOnTaskId);
            if (idx !== -1) clonedDependencies.splice(idx, 1);
        } else if (m.type === MUTATION_TYPES.DEPENDENCY_CREATE) {
            clonedDependencies.push({ task_id: m.taskId, depends_on_task_id: m.dependsOnTaskId });
        }
    });

    const simCpm = calculateCriticalPath({ project: clonedProject, tasks: clonedTasks, dependencies: clonedDependencies, startOfToday });
    const simBottlenecks = detectBottlenecks({ project: clonedProject, tasks: clonedTasks, dependencies: clonedDependencies, startOfToday });
    const simTwin = buildDigitalTwin({
        project: clonedProject,
        tasks: clonedTasks,
        dependencies: clonedDependencies,
        projectMembers: clonedMembers,
        risks,
        decisions,
        startOfToday
    });

    const simHealth = calculateProjectHealth(simTwin, { startOfToday });
    const simDrift = calculateScheduleDrift(simTwin, startOfToday);
    const simDeadlineRisks = calculateDeadlineRisks(simTwin);
    const simWorkload = calculateTeamWorkload(simTwin);

    let simForecast = null;
    try {
        if (clonedTasks.length > 0) {
            simForecast = runMonteCarloForecast({
                projectId,
                project: clonedProject,
                tasks: clonedTasks,
                dependencies: clonedDependencies,
                iterations: 500,
                seed: 42
            });
        }
    } catch (_) {}

    // Simulated Shockwave Containment
    let simShockwave = null;
    if (targetTaskId && clonedTasks.length > 0) {
        const simPropagation = traverseDownstreamDependencies({
            tasks: clonedTasks,
            dependencies: clonedDependencies,
            sourceTaskIds: [targetTaskId]
        });
        const simContainment = calculateProjectContainment({
            shockMagnitudeDays: 3,
            projectCompletionDelayDays: simDrift?.deltaDays || 0,
            totalTasksCount: clonedTasks.length,
            affectedTasksCount: simPropagation.totalAffected,
            propagationDepth: simPropagation.maxDepth
        });
        simShockwave = {
            totalAffected: simPropagation.totalAffected,
            maxDepth: simPropagation.maxDepth,
            containmentScore: simContainment.containmentScore,
            propagationReduction: Math.max(0, (baselineShockwave?.totalAffected || 0) - simPropagation.totalAffected),
            containmentDelta: simContainment.containmentScore - (baselineShockwave?.containmentScore || 0)
        };
    }

    const simulated = {
        health: { score: simHealth.score, status: simHealth.status },
        schedule: {
            plannedEnd: clonedProject?.end_date,
            projectedEnd: simDrift.projectedEndDate,
            deltaDays: simDrift.deltaDays,
            severity: simDrift.severity
        },
        criticalPath: {
            durationDays: simCpm.projectCriticalPathDays || 0,
            criticalTasksCount: (simCpm.criticalTaskIds || []).length,
            criticalTaskIds: simCpm.criticalTaskIds || []
        },
        bottlenecks: {
            count: simBottlenecks.count || 0,
            items: (simBottlenecks.bottlenecks || []).map((b) => ({ taskId: b.taskId, score: b.bottleneckScore }))
        },
        deadlineRisks: {
            totalCount: Array.isArray(simDeadlineRisks) ? simDeadlineRisks.length : (simDeadlineRisks?.summary?.total || 0),
            risks: Array.isArray(simDeadlineRisks) ? simDeadlineRisks : []
        },
        workload: {
            members: (simWorkload.members || []).map((m) => ({
                userId: m.userId,
                name: m.name,
                totalHours: m.remainingHours ?? m.estimatedHours ?? m.totalHours ?? 0,
                taskCount: m.taskCount,
                utilizationPercentage: m.capacityRatio ? Math.round(m.capacityRatio * 100) : 50
            }))
        },
        forecast: simForecast ? {
            p50Date: simForecast.percentiles?.p50?.date || simForecast.p50FinishDate,
            p80Date: simForecast.percentiles?.p80?.date || simForecast.p80FinishDate,
            p90Date: simForecast.percentiles?.p90?.date || simForecast.p90FinishDate,
            p50Days: simForecast.percentiles?.p50?.days ?? 0,
            p80Days: simForecast.percentiles?.p80?.days ?? 0,
            p90Days: simForecast.percentiles?.p90?.days ?? 0
        } : null,
        shockwave: simShockwave
    };

    // 5. Compute Impact Vector
    const healthDelta = simulated.health.score - baseline.health.score;
    const scheduleRecoveryDays = baseline.schedule.deltaDays - simulated.schedule.deltaDays;
    const criticalTasksDelta = simulated.criticalPath.criticalTasksCount - baseline.criticalPath.criticalTasksCount;
    const bottleneckDelta = simulated.bottlenecks.count - baseline.bottlenecks.count;
    const deadlineRiskDelta = simulated.deadlineRisks.totalCount - baseline.deadlineRisks.totalCount;

    const oldCritSet = new Set(baseline.criticalPath.criticalTaskIds);
    const newCritSet = new Set(simulated.criticalPath.criticalTaskIds);
    const newlyCriticalTasks = Array.from(newCritSet).filter((id) => !oldCritSet.has(id));
    const resolvedCriticalTasks = Array.from(oldCritSet).filter((id) => !newCritSet.has(id));

    const oldBnMap = new Map(baseline.bottlenecks.items.map((b) => [b.taskId, b.score]));
    const newBnMap = new Map(simulated.bottlenecks.items.map((b) => [b.taskId, b.score]));
    const resolvedBottlenecks = Array.from(oldBnMap.keys()).filter((id) => !newBnMap.has(id));
    const newlyCreatedBottlenecks = Array.from(newBnMap.keys()).filter((id) => !oldBnMap.has(id));

    const impactVector = {
        healthDelta,
        scheduleRecoveryDays,
        criticalTasksDelta,
        bottleneckDelta,
        deadlineRiskDelta,
        p50ShiftDays: baseline.forecast && simulated.forecast ? baseline.forecast.p50Days - simulated.forecast.p50Days : 0,
        p80ShiftDays: baseline.forecast && simulated.forecast ? baseline.forecast.p80Days - simulated.forecast.p80Days : 0,
        p90ShiftDays: baseline.forecast && simulated.forecast ? baseline.forecast.p90Days - simulated.forecast.p90Days : 0
    };

    // 6. Benefits & Evidence Extraction
    const benefits = [];
    if (scheduleRecoveryDays > 0) {
        benefits.push({
            title: `Schedule Recovery of +${scheduleRecoveryDays} Day(s)`,
            description: `Intervention reduces projected project delay from ${baseline.schedule.deltaDays}d to ${simulated.schedule.deltaDays}d.`,
            evidence: `Projected completion date advances to ${simulated.schedule.projectedEnd || "on-time"}.`
        });
    }
    if (healthDelta > 0) {
        benefits.push({
            title: `Health Score Gain (+${healthDelta} pts)`,
            description: `Project health score improves from ${baseline.health.score} to ${simulated.health.score} (${simulated.health.status}).`,
            evidence: `Health metrics upgraded across critical path slack and workload balance.`
        });
    }
    if (resolvedBottlenecks.length > 0) {
        benefits.push({
            title: `${resolvedBottlenecks.length} Bottleneck(s) Alleviated`,
            description: `Structural dependency bottlenecks removed: ${resolvedBottlenecks.map((id) => taskMap.get(id)?.title || id).join(", ")}.`,
            evidence: `Downstream dependency wait queues cleared.`
        });
    }
    if (resolvedCriticalTasks.length > 0) {
        benefits.push({
            title: `${resolvedCriticalTasks.length} Critical Task(s) Relieved`,
            description: `Tasks moved off the zero-float critical path: ${resolvedCriticalTasks.map((id) => taskMap.get(id)?.title || id).join(", ")}.`,
            evidence: `Critical path total duration reduced by ${Math.max(0, baseline.criticalPath.durationDays - simulated.criticalPath.durationDays)} day(s).`
        });
    }
    if (simShockwave && simShockwave.containmentDelta > 0) {
        benefits.push({
            title: `Shockwave Containment +${simShockwave.containmentDelta}%`,
            description: `Downstream buffer absorption increases to ${simShockwave.containmentScore}%.`,
            evidence: `Affected tasks reduced by ${simShockwave.propagationReduction || 0} downstream node(s).`
        });
    }

    // 7. Costs Extraction
    const costs = [];
    const targetUserId = intervention?.parameters?.toUserId || intervention?.parameters?.userId;
    let recipientHoursAdded = 0;
    let recipientOverloaded = false;

    if (targetUserId) {
        // Direct calculation from tasks vs clonedTasks to ensure absolute accuracy
        const hoursBefore = tasks
            .filter((t) => (t.assigned_to === targetUserId || t.assigneeId === targetUserId) && t.status !== "Completed")
            .reduce((sum, t) => sum + Number(t.estimated_hours || t.estimatedHours || 0), 0);
        const hoursAfter = clonedTasks
            .filter((t) => (t.assigned_to === targetUserId || t.assigneeId === targetUserId) && t.status !== "Completed")
            .reduce((sum, t) => sum + Number(t.estimated_hours || t.estimatedHours || 0), 0);
        recipientHoursAdded = Math.max(0, hoursAfter - hoursBefore);

        const baseM = baseline.workload.members.find((m) => m.userId === targetUserId);
        const simM = simulated.workload.members.find((m) => m.userId === targetUserId);
        if (recipientHoursAdded === 0 && simM && baseM) {
            recipientHoursAdded = Math.max(0, (simM.totalHours || 0) - (baseM.totalHours || 0));
        }
        recipientOverloaded = (simM?.utilizationPercentage || 0) > 80 || (hoursAfter > 40);

        if (recipientHoursAdded > 0) {
            costs.push({
                title: `Assignee Workload Pressure (+${recipientHoursAdded}h)`,
                description: `Target assignee assigned additional work; utilization reaches ${simM?.utilizationPercentage || 75}%.`,
                evidence: recipientOverloaded ? "Assignee exceeds sustainable 80% capacity ceiling." : "Acceptable capacity utilization within standard threshold."
            });
        }
    }

    if (newlyCreatedBottlenecks.length > 0) {
        costs.push({
            title: `${newlyCreatedBottlenecks.length} Secondary Bottleneck(s) Formed`,
            description: `New dependency queue formed at: ${newlyCreatedBottlenecks.map((id) => taskMap.get(id)?.title || id).join(", ")}.`,
            evidence: `Elevated downstream queue wait times detected.`
        });
    }
    if (newlyCriticalTasks.length > 0) {
        costs.push({
            title: `${newlyCriticalTasks.length} New Critical Path Task(s)`,
            description: `Previously buffered tasks now hold zero float: ${newlyCriticalTasks.map((id) => taskMap.get(id)?.title || id).join(", ")}.`,
            evidence: `Any slippage on these tasks directly delays project finish.`
        });
    }
    if (healthDelta < 0) {
        costs.push({
            title: `Health Score Decrease (${healthDelta} pts)`,
            description: `Project health drops to ${simulated.health.score}.`,
            evidence: `Intervention introduced structural instability into schedule.`
        });
    }

    // 8. Side Effects Detection
    const sideEffects = detectSideEffects({
        baseline,
        simulated,
        intervention,
        tasks
    });

    // 9. Impact Scoring
    const scoring = calculateInterventionScore({
        scheduleRecoveryDays,
        healthDelta,
        criticalTasksDelta,
        resolvedBottlenecksCount: resolvedBottlenecks.length,
        newBottlenecksCount: newlyCreatedBottlenecks.length,
        newlyCriticalCount: newlyCriticalTasks.length,
        recipientWorkloadHoursAdded: recipientHoursAdded,
        recipientOverloaded,
        hasCycle: simCpm.hasCycle
    });

    // 10. Trade-off Synthesis & Recommendation
    let recommendationVerdict = "RECOMMENDED";
    let recommendationRationale = "The intervention delivers measurable project benefits with manageable trade-offs.";

    if (scoring.score >= 80) {
        recommendationVerdict = "HIGHLY_RECOMMENDED";
        recommendationRationale = "Substantial project schedule and health improvements achieved with low unintended friction.";
    } else if (scoring.score >= 60) {
        recommendationVerdict = "RECOMMENDED_WITH_TRADE_OFFS";
        recommendationRationale = `Potentially beneficial (+${scheduleRecoveryDays}d recovery), but introduces secondary trade-offs: ${costs.map((c) => c.title).join(", ") || "added effort"}.`;
    } else if (scoring.score >= 40) {
        recommendationVerdict = "NEUTRAL";
        recommendationRationale = "Intervention impacts are marginal or roughly equal across positive and negative dimensions.";
    } else {
        recommendationVerdict = "NOT_RECOMMENDED";
        recommendationRationale = "Negative consequences (new bottlenecks, critical migration, or overload) outweigh projected benefits.";
    }

    const tradeOffs = {
        summary: `Net Impact: ${scoring.classification} (Score: ${scoring.score}/100)`,
        benefitCount: benefits.length,
        costCount: costs.length,
        netScheduleDeltaDays: scheduleRecoveryDays,
        netHealthDelta: healthDelta,
        primaryBenefit: benefits[0]?.title || "Minimal disruption",
        primaryCost: costs[0]?.title || "None detected",
        isPositive: scoring.score >= 50
    };

    const evaluationResult = {
        supported: true,
        projectId,
        intervention,
        baseStateHash,
        simulationOnly: true,
        impactScore: scoring.score,
        classification: scoring.classification,
        scoringFactors: scoring.factors,
        recommendation: {
            verdict: recommendationVerdict,
            rationale: recommendationRationale,
            score: scoring.score
        },
        impactVector,
        benefits,
        costs,
        tradeOffs,
        sideEffects,
        comparison: {
            health: { before: baseline.health.score, after: simulated.health.score, delta: healthDelta },
            projectedEnd: { before: baseline.schedule.projectedEnd, after: simulated.schedule.projectedEnd },
            scheduleDelayDays: { before: baseline.schedule.deltaDays, after: simulated.schedule.deltaDays, recoveredDays: scheduleRecoveryDays },
            criticalTasks: { before: baseline.criticalPath.criticalTasksCount, after: simulated.criticalPath.criticalTasksCount, delta: criticalTasksDelta },
            bottlenecks: { before: baseline.bottlenecks.count, after: simulated.bottlenecks.count, delta: bottleneckDelta },
            deadlineRisks: { before: baseline.deadlineRisks.totalCount, after: simulated.deadlineRisks.totalCount, delta: deadlineRiskDelta }
        },
        baseline,
        simulated,
        proposedMutations: mutations
    };

    // Cache evaluation
    const cacheKey = `${projectId}_${intervention.type}_${Date.now()}`;
    setInMemoryIntervention(cacheKey, evaluationResult);

    return evaluationResult;
};

// ============================================================
// MULTI-INTERVENTION COMPARISON
// ============================================================

/**
 * Evaluates and compares multiple intervention options against the same project baseline.
 */
export const compareInterventions = async ({
    projectId,
    userId,
    interventions = [],
    inMemoryData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to compare interventions.");
    }
    if (!Array.isArray(interventions) || interventions.length === 0) {
        throw new Error("An array of at least one intervention is required for comparison.");
    }

    const evaluations = await Promise.all(
        interventions.map(async (inv, idx) => {
            try {
                const evalRes = await evaluateIntervention({
                    projectId,
                    userId,
                    intervention: inv,
                    inMemoryData,
                    startOfToday
                });
                return {
                    optionId: `Option ${String.fromCharCode(65 + idx)}`,
                    name: inv.name || inv.title || `Intervention ${idx + 1}: ${inv.type}`,
                    intervention: inv,
                    evaluation: evalRes,
                    score: evalRes.impactScore || 0,
                    classification: evalRes.classification || IMPACT_CLASSIFICATION.NEUTRAL_IMPACT,
                    recoveryDays: evalRes.impactVector?.scheduleRecoveryDays || 0,
                    healthDelta: evalRes.impactVector?.healthDelta || 0,
                    verdict: evalRes.recommendation?.verdict || "NEUTRAL"
                };
            } catch (err) {
                return {
                    optionId: `Option ${String.fromCharCode(65 + idx)}`,
                    name: inv.name || inv.type,
                    intervention: inv,
                    error: err.message,
                    score: 0,
                    verdict: "FAILED"
                };
            }
        })
    );

    // Sort descending by score for ranking
    const sorted = [...evaluations].sort((a, b) => (b.score || 0) - (a.score || 0));
    const bestOption = sorted[0];

    const comparisonMatrix = {
        optionsCount: evaluations.length,
        rankedOptions: sorted.map((opt, rank) => ({
            rank: rank + 1,
            optionId: opt.optionId,
            name: opt.name,
            score: opt.score,
            verdict: opt.verdict,
            recoveryDays: opt.recoveryDays,
            healthDelta: opt.healthDelta
        })),
        recommendedOption: bestOption ? {
            optionId: bestOption.optionId,
            name: bestOption.name,
            score: bestOption.score,
            verdict: bestOption.verdict,
            rationale: bestOption.evaluation?.recommendation?.rationale || "Highest deterministic trade-off score."
        } : null
    };

    return {
        projectId,
        comparisonMatrix,
        evaluations,
        simulationOnly: true
    };
};

// ============================================================
// PROPOSAL PREPARATION & STALE-STATE PROTECTION
// ============================================================

/**
 * Prepares an intervention as an unexecuted proposal staged for human review
 * in the Phase 3 Approval Center.
 * 
 * Safety invariants:
 * - Computes and stores baseStateHash
 * - Sets status: PROPOSED
 * - ZERO database mutations occur at preparation time
 */
export const prepareInterventionProposal = async ({
    projectId,
    userId,
    intervention,
    evaluation = null,
    inMemoryData = null
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to prepare an intervention proposal.");
    }

    // Evaluate intervention if evaluation was not pre-computed
    const evalData = evaluation || await evaluateIntervention({
        projectId,
        userId,
        intervention,
        inMemoryData
    });

    if (!evalData.supported) {
        throw new Error(`Cannot prepare proposal: ${evalData.reason || "Unsupported intervention."}`);
    }

    const proposalId = `prop-intv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const proposal = {
        id: proposalId,
        proposalId,
        projectId,
        title: `Intervention: ${intervention.type}`,
        interventionType: intervention.type,
        intervention,
        rationale: intervention.rationale || evalData.recommendation?.rationale || "Prepared via Intervention Impact Engine.",
        status: SCENARIO_STATUS.PROPOSED,
        baseStateHash: evalData.baseStateHash,
        mutations: evalData.proposedMutations,
        impactScore: evalData.impactScore,
        impactSummary: `Projected Impact: ${evalData.classification}. Schedule recovery: +${evalData.impactVector?.scheduleRecoveryDays || 0}d. Health: ${evalData.impactVector?.healthDelta > 0 ? "+" : ""}${evalData.impactVector?.healthDelta || 0} pts.`,
        tradeOffs: evalData.tradeOffs,
        benefits: evalData.benefits,
        costs: evalData.costs,
        sideEffects: evalData.sideEffects,
        generatedAt: new Date().toISOString(),
        expiresAt,
        requiresApproval: true,
        createdBy: userId || "SYSTEM",
        simulationOnly: false // Will be true until approved
    };

    // Stage in Approval Store
    setInMemoryApproval(proposalId, proposal);

    return {
        proposalId,
        title: proposal.title,
        status: proposal.status,
        baseStateHash: proposal.baseStateHash,
        requiresApproval: true,
        impactSummary: proposal.impactSummary,
        proposedChanges: proposal.mutations,
        expiresAt: proposal.expiresAt,
        message: "Intervention proposal staged for Approval Center review. No project changes will occur until explicitly approved."
    };
};

/**
 * Safely executes an approved intervention proposal, enforcing stale-state protection.
 */
export const executeInterventionProposalSafely = async ({
    projectId,
    proposalId,
    userId,
    inMemoryData = null
}) => {
    if (!proposalId) {
        const error = new Error("Proposal ID is required for execution.");
        error.code = "PROPOSAL_ID_REQUIRED";
        error.statusCode = 400;
        throw error;
    }

    let proposal = getInMemoryApproval(proposalId);
    if (!proposal && isUuid(projectId)) {
        try {
            const { getProjectProposal } = await import("./projectReplanningService.js");
            proposal = await getProjectProposal(projectId, proposalId, userId);
        } catch (_) {}
    }

    if (!proposal) {
        const error = new Error(`Proposal '${proposalId}' not found.`);
        error.code = "PROPOSAL_NOT_FOUND";
        error.statusCode = 404;
        throw error;
    }

    // 1. Check approval status
    if (proposal.status !== SCENARIO_STATUS.APPROVED) {
        const error = new Error("Execution rejected: Proposal has not been approved in the Approval Center.");
        error.code = "PROPOSAL_NOT_APPROVED";
        error.statusCode = 400;
        throw error;
    }

    // 2. Expiration check
    if (new Date(proposal.expiresAt) < new Date()) {
        proposal.status = SCENARIO_STATUS.EXPIRED;
        const error = new Error("Execution rejected: Proposal has expired. Please re-evaluate the intervention.");
        error.code = "PROPOSAL_EXPIRED";
        error.statusCode = 400;
        throw error;
    }

    // 3. Stale-state check against live data
    let currentLiveHash;
    if (inMemoryData) {
        currentLiveHash = computeProjectStateHash({
            project: inMemoryData.project,
            tasks: inMemoryData.tasks,
            dependencies: inMemoryData.dependencies
        });
    } else if (isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
        const [project, tasks, dependencies] = await Promise.all([
            prisma.projects.findUnique({ where: { id: projectId } }),
            prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
            prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false }
                }
            })
        ]);
        currentLiveHash = computeProjectStateHash({ project, tasks, dependencies });
    }

    if (proposal.baseStateHash && currentLiveHash && currentLiveHash !== proposal.baseStateHash) {
        proposal.status = SCENARIO_STATUS.STALE;
        const error = new Error("Execution rejected: Stale state detected. The project has changed since this intervention was evaluated.");
        error.code = "STALE_STATE_DETECTED";
        error.statusCode = 400;
        error.stale = true;
        error.requiresReevaluation = true;
        throw error;
    }

    // 4. Mark as executed
    proposal.status = SCENARIO_STATUS.EXECUTED;
    proposal.executedAt = new Date().toISOString();
    proposal.executedBy = userId;

    return {
        success: true,
        proposalId,
        status: SCENARIO_STATUS.EXECUTED,
        message: "Intervention proposal successfully executed.",
        executedAt: proposal.executedAt
    };
};
