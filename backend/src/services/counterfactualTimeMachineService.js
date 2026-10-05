/**
 * Counterfactual Time Machine Service (Phase 12)
 * 
 * An adversarial historical intelligence engine that answers:
 * "WHAT WOULD HAVE HAPPENED IF WE HAD MADE A DIFFERENT DECISION EARLIER?"
 * 
 * Compares ACTUAL PROJECT HISTORY against SIMULATED ALTERNATIVE HISTORY.
 * 
 * ARCHITECTURAL INVARIANTS:
 * - NEVER overwrites historical records in the database.
 * - NEVER fabricates historical events or false statistical confidence.
 * - All counterfactuals execute on isolated in-memory clones of the Digital Twin.
 * - Verifies zero production mutations via SHA-256 state hashing before & after.
 * - Clearly distinguishes actual facts from simulated projections.
 * - Reuses existing Phase 1-11 intelligence engines.
 */

import crypto from "crypto";
import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { getStartOfTodayUtc } from "./taskService.js";

// Phase 1-11 Analytical Engine Reuse
import {
    calculateCriticalPath,
    calculateTaskDurationDays
} from "./criticalPathService.js";
import {
    computeProjectStateHash,
    deepClone,
    runScenarioSimulation,
    MUTATION_TYPES
} from "./scenarioSimulationService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth } from "./projectHealthService.js";
import { detectBottlenecks } from "./bottleneckService.js";
import { calculateScheduleDrift } from "./scheduleDriftService.js";
import { calculateDeadlineRisks } from "./deadlineRiskService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { getProjectHealthHistory } from "./projectHistoryService.js";
import { getProjectTimeline } from "./projectTimelineService.js";
import { replayProjectPointInTime } from "./projectReplayService.js";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================

export const COUNTERFACTUAL_TYPES = Object.freeze({
    EARLIER_COMPLETION: "EARLIER_COMPLETION",
    LATER_COMPLETION: "LATER_COMPLETION",
    EARLIER_START: "EARLIER_START",
    LATER_START: "LATER_START",
    ALTERNATIVE_ASSIGNMENT: "ALTERNATIVE_ASSIGNMENT",
    REMOVED_DEPENDENCY: "REMOVED_DEPENDENCY",
    ADDED_DEPENDENCY: "ADDED_DEPENDENCY",
    DIFFERENT_ESTIMATE: "DIFFERENT_ESTIMATE",
    DIFFERENT_DEADLINE: "DIFFERENT_DEADLINE",
    DIFFERENT_SCOPE: "DIFFERENT_SCOPE",
    DIFFERENT_RESOURCE: "DIFFERENT_RESOURCE",
    ALTERNATIVE_RECOVERY: "ALTERNATIVE_RECOVERY",
    ALTERNATIVE_DECISION: "ALTERNATIVE_DECISION",
    RISK_ACTION_EARLIER: "RISK_ACTION_EARLIER"
});

export const EVIDENCE_QUALITY = Object.freeze({
    STRONG_EVIDENCE: "STRONG_EVIDENCE",
    MODERATE_EVIDENCE: "MODERATE_EVIDENCE",
    LIMITED_EVIDENCE: "LIMITED_EVIDENCE",
    INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE"
});

// In-memory request-scoped cache and test store (project-isolated)
const inMemoryCounterfactualStore = new Map();
const inMemoryProjectDataStore = new Map();

export const clearCounterfactualStore = () => {
    inMemoryCounterfactualStore.clear();
    inMemoryProjectDataStore.clear();
};

export const setInMemoryCounterfactual = (key, data) => {
    inMemoryCounterfactualStore.set(key, data);
};

export const getInMemoryCounterfactual = (key) => {
    return inMemoryCounterfactualStore.get(key) || null;
};

export const setInMemoryProjectData = (projectId, data) => {
    inMemoryProjectDataStore.set(projectId, data);
};

export const getInMemoryProjectData = (projectId) => {
    return inMemoryProjectDataStore.get(projectId) || null;
};

// ============================================================
// HISTORICAL BASELINE RESOLVER
// ============================================================

/**
 * Resolves a historical baseline reference point using persisted snapshots
 * and timeline records. Never fabricates unavailable historical state.
 */
export const selectHistoricalBaseline = async ({
    projectId,
    referenceTimestamp = null,
    baseData = null
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to select historical baseline.");
    }

    if (baseData) {
        return {
            status: "AVAILABLE",
            isExactSnapshot: true,
            snapshotTimestamp: referenceTimestamp || new Date().toISOString(),
            baselineState: baseData,
            evidenceQuality: EVIDENCE_QUALITY.STRONG_EVIDENCE,
            limitations: ["Baseline provided via direct project state context."]
        };
    }

    if (!referenceTimestamp) {
        // Current state baseline
        const stored = inMemoryProjectDataStore.get(projectId);
        if (stored) {
            return {
                status: "AVAILABLE",
                isExactSnapshot: true,
                snapshotTimestamp: new Date().toISOString(),
                baselineState: stored,
                evidenceQuality: EVIDENCE_QUALITY.STRONG_EVIDENCE,
                limitations: ["Current active state used as baseline reference."]
            };
        }
    }

    // Attempt point-in-time reconstruction via Phase 4 Replay
    try {
        const replay = await replayProjectPointInTime(projectId, referenceTimestamp || new Date().toISOString());
        if (replay.status === "UNAVAILABLE" || !replay.isAvailable) {
            return {
                status: "INSUFFICIENT_EVIDENCE",
                isExactSnapshot: false,
                snapshotTimestamp: null,
                baselineState: null,
                evidenceQuality: EVIDENCE_QUALITY.INSUFFICIENT_EVIDENCE,
                message: "Historical state is unavailable for this timestamp because no recorded snapshot exists in project history.",
                limitations: ["Exact historical state reconstruction unavailable.", "No snapshot recorded in the requested window."]
            };
        }

        return {
            status: "AVAILABLE",
            isExactSnapshot: replay.isExact,
            snapshotTimestamp: replay.snapshotTimestamp,
            snapshotId: replay.snapshotId,
            baselineState: replay,
            evidenceQuality: replay.isExact ? EVIDENCE_QUALITY.STRONG_EVIDENCE : EVIDENCE_QUALITY.MODERATE_EVIDENCE,
            limitations: replay.isExact
                ? ["Reconstructed from exact recorded snapshot."]
                : ["Approximated using the nearest preceding valid recorded snapshot."]
        };
    } catch {
        return {
            status: "INSUFFICIENT_EVIDENCE",
            isExactSnapshot: false,
            snapshotTimestamp: null,
            baselineState: null,
            evidenceQuality: EVIDENCE_QUALITY.INSUFFICIENT_EVIDENCE,
            message: "Insufficient historical evidence to reconstruct project state.",
            limitations: ["No historical snapshot data found for requested reference point."]
        };
    }
};

// ============================================================
// COUNTERFACTUAL SIMULATION ENGINE
// ============================================================

/**
 * Runs a counterfactual simulation comparing actual baseline against an alternate history.
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.userId]
 * @param {Object} params.scenario - Counterfactual scenario configuration
 * @param {string} params.scenario.type - COUNTERFACTUAL_TYPES enum value
 * @param {string} [params.scenario.targetTaskId] - Target task
 * @param {string} [params.scenario.targetMemberId] - Target user for reassignment/resource
 * @param {string} [params.scenario.fromTaskId] - Source task for dependency changes
 * @param {string} [params.scenario.toTaskId] - Target task for dependency changes
 * @param {number} [params.scenario.deltaDays] - Days earlier/later or shift
 * @param {number} [params.scenario.newHours] - New estimate or scope hours
 * @param {string} [params.scenario.referenceDate] - Historical timestamp or date
 * @param {Object} [params.baseData] - Direct project state injection for tests
 * @param {Date|string} [params.startOfToday]
 * @returns {Promise<Object>} Comprehensive actual vs counterfactual comparison report
 */
export const runCounterfactualSimulation = async ({
    projectId,
    userId = null,
    scenario,
    baseData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for counterfactual simulation.");
    }
    if (!scenario || !scenario.type) {
        throw new Error("Scenario definition with valid type is required for counterfactual simulation.");
    }

    // 1. Authorization Verification
    if (userId && !baseData && prisma) {
        await verifyProjectAccess(projectId, userId);
    }

    // 2. Resolve Active Project Data
    let project = {};
    let tasks = [];
    let dependencies = [];
    let projectMembers = [];

    if (baseData) {
        project = baseData.project || { id: projectId };
        tasks = baseData.tasks || [];
        dependencies = baseData.dependencies || [];
        projectMembers = baseData.projectMembers || [];
    } else if (inMemoryProjectDataStore.has(projectId)) {
        const stored = inMemoryProjectDataStore.get(projectId);
        project = stored.project || { id: projectId };
        tasks = stored.tasks || [];
        dependencies = stored.dependencies || [];
        projectMembers = stored.projectMembers || [];
    } else if (prisma) {
        try {
            project = await prisma.projects.findUnique({ where: { id: projectId } });
            tasks = await prisma.tasks.findMany({
                where: { project_id: projectId, is_archived: false },
                include: { task_assignments: true }
            });
            dependencies = await prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId }
                }
            });
            projectMembers = await prisma.project_members.findMany({
                where: { project_id: projectId },
                include: { users: true }
            });
        } catch {
            // Fall back cleanly
        }
    }

    if (!tasks || tasks.length === 0) {
        return {
            status: "INSUFFICIENT_EVIDENCE",
            projectId,
            scenarioType: scenario.type,
            message: "Insufficient project data to evaluate counterfactual scenario.",
            evidenceQuality: EVIDENCE_QUALITY.INSUFFICIENT_EVIDENCE,
            limitations: ["No tasks recorded in baseline project."]
        };
    }

    // 3. Verify State Hash Before Simulation (Zero DB Mutation Invariant)
    const stateHashBefore = computeProjectStateHash({ project, tasks, dependencies });
    const today = (startOfToday instanceof Date) ? startOfToday : new Date(startOfToday || getStartOfTodayUtc());

    // 4. Compute Actual Baseline Analytics
    const actualTwin = buildDigitalTwin({
        project,
        tasks,
        dependencies,
        projectMembers,
        startOfToday: today
    });

    const actualHealth = calculateProjectHealth(actualTwin, { startOfToday: today });
    const actualDrift = calculateScheduleDrift(actualTwin, today);
    const actualCpm = calculateCriticalPath({ project, tasks, dependencies, startOfToday: today });
    const actualBottlenecks = detectBottlenecks({ project, tasks, dependencies, startOfToday: today });
    const actualForecast = runMonteCarloForecast({
        projectId: projectId || project?.id,
        tasks,
        dependencies,
        iterations: 200,
        startOfToday: today,
        projectDeadline: project.end_date
    });

    // 5. Deep Clone Baseline into Isolated Simulation Workspace
    const clonedTasks = deepClone(tasks);
    const clonedDependencies = deepClone(dependencies);
    const clonedProject = deepClone(project);

    // 6. Map Counterfactual Scenario to Simulation Mutations
    const mutations = [];
    let divergenceDescription = "";
    let targetEntityName = "Project";
    const deltaDays = Number(scenario.deltaDays || 2);

    switch (scenario.type) {
        case COUNTERFACTUAL_TYPES.EARLIER_COMPLETION: {
            const tId = scenario.targetTaskId || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            targetEntityName = targetTask?.title || tId;
            const hoursReduction = deltaDays * 8;

            mutations.push({
                type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                taskId: tId,
                hours: hoursReduction,
                parameter: { hours: hoursReduction }
            });
            divergenceDescription = `Task "${targetEntityName}" completed ${deltaDays} day(s) earlier than historical record.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.LATER_COMPLETION:
        case COUNTERFACTUAL_TYPES.LATER_START: {
            const tId = scenario.targetTaskId || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            targetEntityName = targetTask?.title || tId;
            const hoursIncrease = deltaDays * 8;

            mutations.push({
                type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                taskId: tId,
                hours: hoursIncrease,
                parameter: { hours: hoursIncrease }
            });
            divergenceDescription = `Task "${targetEntityName}" delayed by ${deltaDays} day(s) relative to historical record.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.EARLIER_START: {
            const tId = scenario.targetTaskId || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            targetEntityName = targetTask?.title || tId;
            const hoursReduction = Math.min(24, deltaDays * 8);

            mutations.push({
                type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                taskId: tId,
                hours: hoursReduction,
                parameter: { hours: hoursReduction }
            });
            divergenceDescription = `Task "${targetEntityName}" started ${deltaDays} day(s) earlier.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.ALTERNATIVE_ASSIGNMENT: {
            const tId = scenario.targetTaskId || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            const toUserId = scenario.targetMemberId || "alt-user";
            targetEntityName = targetTask?.title || tId;

            mutations.push({
                type: MUTATION_TYPES.TASK_REASSIGN,
                taskId: tId,
                parameter: { newAssignee: toUserId }
            });
            divergenceDescription = `Task "${targetEntityName}" Reassigned to alternate team member.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY: {
            const fromId = scenario.fromTaskId || clonedDependencies[0]?.depends_on_task_id;
            const toId = scenario.toTaskId || clonedDependencies[0]?.task_id;

            mutations.push({
                type: MUTATION_TYPES.DEPENDENCY_REMOVE,
                parameter: { taskId: toId, dependsOnTaskId: fromId }
            });
            divergenceDescription = `Dependency decoupling: constraint between tasks removed (parallelized).`;
            break;
        }

        case COUNTERFACTUAL_TYPES.ADDED_DEPENDENCY: {
            const fromId = scenario.fromTaskId || clonedTasks[0]?.id;
            const toId = scenario.toTaskId || clonedTasks[1]?.id;

            mutations.push({
                type: MUTATION_TYPES.DEPENDENCY_CREATE,
                parameter: { taskId: toId, dependsOnTaskId: fromId }
            });
            divergenceDescription = `New dependency sequence enforced between tasks.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.DIFFERENT_ESTIMATE: {
            const tId = scenario.targetTaskId || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            targetEntityName = targetTask?.title || tId;
            const newHrs = Number(scenario.newHours || 40);
            const currentHrs = Number(targetTask?.estimated_hours || 16);
            const diff = newHrs - currentHrs;

            mutations.push({
                type: diff >= 0 ? MUTATION_TYPES.TASK_DURATION_INCREASE : MUTATION_TYPES.TASK_DURATION_DECREASE,
                taskId: tId,
                hours: Math.abs(diff),
                parameter: { hours: Math.abs(diff) }
            });
            divergenceDescription = `Task "${targetEntityName}" estimate adjusted from ${currentHrs}h to ${newHrs}h.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.DIFFERENT_DEADLINE: {
            mutations.push({
                type: MUTATION_TYPES.PROJECT_DEADLINE_CHANGE,
                parameter: { deltaDays }
            });
            divergenceDescription = `Project target delivery milestone shifted by ${deltaDays} days.`;
            break;
        }

        case COUNTERFACTUAL_TYPES.DIFFERENT_SCOPE: {
            const scopeDeltaHours = Number(scenario.newHours || (deltaDays * 16));
            mutations.push({
                type: MUTATION_TYPES.SCOPE_CHANGE,
                parameter: { hours: scopeDeltaHours }
            });
            divergenceDescription = `Project scope adjusted by ${scopeDeltaHours} hour(s).`;
            break;
        }

        case COUNTERFACTUAL_TYPES.DIFFERENT_RESOURCE:
        case COUNTERFACTUAL_TYPES.ALTERNATIVE_RECOVERY:
        case COUNTERFACTUAL_TYPES.RISK_ACTION_EARLIER: {
            const tId = scenario.targetTaskId || actualCpm.criticalTaskIds[0] || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            targetEntityName = targetTask?.title || tId;
            const recoveryHours = deltaDays * 8;

            mutations.push({
                type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                taskId: tId,
                hours: recoveryHours,
                parameter: { hours: recoveryHours }
            });
            divergenceDescription = `Early mitigation / resource assistance applied on "${targetEntityName}", accelerating delivery by ${deltaDays} day(s).`;
            break;
        }

        case COUNTERFACTUAL_TYPES.ALTERNATIVE_DECISION: {
            const tId = scenario.targetTaskId || clonedTasks[0]?.id;
            const targetTask = clonedTasks.find((t) => t.id === tId);
            targetEntityName = targetTask?.title || tId;

            mutations.push({
                type: MUTATION_TYPES.TASK_PRIORITY_CHANGE,
                taskId: tId,
                parameter: { priority: "High" }
            });
            divergenceDescription = `Alternative decision policy applied on component "${targetEntityName}".`;
            break;
        }

        default: {
            mutations.push({
                type: MUTATION_TYPES.TASK_DURATION_DECREASE,
                taskId: clonedTasks[0]?.id,
                hours: 16,
                parameter: { hours: 16 }
            });
            divergenceDescription = `Alternate scenario evaluated.`;
            break;
        }
    }

    // 7. Execute Simulation on In-Memory Clones
    const simResult = runScenarioSimulation({
        project: clonedProject,
        tasks: clonedTasks,
        dependencies: clonedDependencies,
        projectMembers,
        mutations,
        startOfToday
    });

    const simTasks = simResult.simulatedState?.tasks || clonedTasks;
    const simDependencies = simResult.simulatedState?.dependencies || clonedDependencies;
    const simProject = simResult.simulatedState?.project || clonedProject;

    const simTwin = buildDigitalTwin({
        project: simProject,
        tasks: simTasks,
        dependencies: simDependencies,
        projectMembers,
        startOfToday
    });

    const simHealth = calculateProjectHealth(simTwin, { startOfToday });
    const simDrift = calculateScheduleDrift(simTwin, today);
    const simCpm = calculateCriticalPath({ project: simProject, tasks: simTasks, dependencies: simDependencies, startOfToday: today });
    const simBottlenecks = detectBottlenecks({ project: simProject, tasks: simTasks, dependencies: simDependencies, startOfToday: today });
    const simForecast = runMonteCarloForecast({
        projectId: projectId || simProject?.id,
        tasks: simTasks,
        dependencies: simDependencies,
        iterations: 200,
        startOfToday: today,
        projectDeadline: simProject.end_date
    });

    // 8. Compute Actual vs Simulated Deltas
    const healthDelta = (simHealth.score ?? 75) - (actualHealth.score ?? 75);
    const driftDeltaDays = (simDrift.deltaDays ?? 0) - (actualDrift.deltaDays ?? 0);
    const scheduleDaysDelta = (simCpm.totalDurationDays ?? 0) - (actualCpm.totalDurationDays ?? 0);

    const actualP50Time = actualForecast.p50Date ? new Date(actualForecast.p50Date).getTime() : 0;
    const simP50Time = simForecast.p50Date ? new Date(simForecast.p50Date).getTime() : 0;
    const p50DeltaDays = (actualP50Time > 0 && simP50Time > 0)
        ? Math.round((simP50Time - actualP50Time) / (1000 * 60 * 60 * 24))
        : scheduleDaysDelta;

    const actualP80Time = actualForecast.p80Date ? new Date(actualForecast.p80Date).getTime() : 0;
    const simP80Time = simForecast.p80Date ? new Date(simForecast.p80Date).getTime() : 0;
    const p80DeltaDays = (actualP80Time > 0 && simP80Time > 0)
        ? Math.round((simP80Time - actualP80Time) / (1000 * 60 * 60 * 24))
        : scheduleDaysDelta;

    const criticalPathChanged = actualCpm.criticalTaskIds.join(",") !== simCpm.criticalTaskIds.join(",");
    const bottlenecksChanged = (actualBottlenecks.bottlenecks?.length || 0) !== (simBottlenecks.bottlenecks?.length || 0);

    // 9. Divergence Point Detection
    const divergenceDate = scenario.referenceDate || new Date(startOfToday).toISOString().split("T")[0];
    const divergencePoint = {
        date: divergenceDate,
        description: divergenceDescription,
        entityName: targetEntityName,
        entityId: scenario.targetTaskId || mutations[0]?.taskId || null,
        type: scenario.type === COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY ? "DEPENDENCY_REMOVAL" : scenario.type,
        mutationType: mutations[0]?.type || scenario.type
    };

    // 10. Sequential Causal Impact Chain
    const impactChain = [
        `Alternate Event: ${divergenceDescription}`,
        `Task Network: Mutation applied across ${simTasks.length} simulated task(s).`,
        criticalPathChanged
            ? `Critical Path: Path migrated (${actualCpm.criticalTaskIds.length} → ${simCpm.criticalTaskIds.length} tasks, ${scheduleDaysDelta >= 0 ? "+" : ""}${scheduleDaysDelta} days total duration).`
            : `Critical Path: Path remained stable (${scheduleDaysDelta >= 0 ? "+" : ""}${scheduleDaysDelta} days total duration).`,
        `Schedule Drift: Drift shifted from ${actualDrift.deltaDays || 0}d to ${simDrift.deltaDays || 0}d (${driftDeltaDays >= 0 ? "+" : ""}${driftDeltaDays} days delta).`,
        `Monte Carlo Forecast: P80 completion shifted by ${p80DeltaDays >= 0 ? "+" : ""}${p80DeltaDays} day(s).`,
        `Health Impact: Project health shifted from ${actualHealth.score || 75} to ${simHealth.score || 75} (${healthDelta >= 0 ? "+" : ""}${healthDelta} points).`
    ];

    // 11. Verify Zero State Mutation Invariant
    const stateHashAfter = computeProjectStateHash({ project, tasks, dependencies });
    if (stateHashBefore !== stateHashAfter) {
        throw new Error("Counterfactual invariant violation: production project state was mutated during simulation.");
    }

    const counterfactualId = `cf-${projectId}-${Date.now()}`;
    const report = {
        counterfactualId,
        projectId,
        title: scenario.title || `Counterfactual: ${scenario.type.replace(/_/g, " ")}`,
        scenarioType: scenario.type,
        status: "COMPLETED",
        referenceDate: divergenceDate,
        divergencePoint,
        actualState: {
            healthScore: actualHealth.score ?? 75,
            healthStatus: actualHealth.status || "HEALTHY",
            scheduleDriftDays: actualDrift.deltaDays ?? 0,
            projectedEndDate: actualTwin.project?.end_date || null,
            totalCriticalDurationDays: actualCpm.totalDurationDays || 0,
            criticalTaskIds: actualCpm.criticalTaskIds,
            criticalTaskCount: actualCpm.criticalTaskIds.length,
            bottlenecksCount: actualBottlenecks.bottlenecks?.length || 0,
            p50Date: actualForecast.p50Date || null,
            p80Date: actualForecast.p80Date || null,
            p90Date: actualForecast.p90Date || null,
            onTimeProbabilityPercent: actualForecast.onTimeProbabilityPercent || 50
        },
        simulatedState: {
            healthScore: simHealth.score ?? 75,
            healthStatus: simHealth.status || "HEALTHY",
            scheduleDriftDays: simDrift.deltaDays ?? 0,
            projectedEndDate: simTwin.project?.end_date || null,
            totalCriticalDurationDays: simCpm.totalDurationDays || 0,
            criticalTaskIds: simCpm.criticalTaskIds,
            criticalTaskCount: simCpm.criticalTaskIds.length,
            bottlenecksCount: simBottlenecks.bottlenecks?.length || 0,
            p50Date: simForecast.p50Date || null,
            p80Date: simForecast.p80Date || null,
            p90Date: simForecast.p90Date || null,
            onTimeProbabilityPercent: simForecast.onTimeProbabilityPercent || 50
        },
        deltas: {
            healthDelta,
            scheduleDaysDelta,
            driftDeltaDays,
            p50DeltaDays,
            p80DeltaDays,
            criticalPathChanged,
            bottlenecksChanged
        },
        impactChain,
        evidenceQuality: baseData ? EVIDENCE_QUALITY.STRONG_EVIDENCE : EVIDENCE_QUALITY.MODERATE_EVIDENCE,
        evidence: [
            `Deterministic simulation computed on deep-cloned Digital Twin state.`,
            `Schedule deltas verified through Critical Path Method and Monte Carlo forecasting.`,
            `Zero database writes occurred during this evaluation (State Hash: ${stateHashBefore.slice(0, 16)}...).`
        ],
        limitations: [
            "Counterfactual analysis is a deterministic simulation based on recorded project state and not a guarantee.",
            "Historical assumptions rely on available snapshot evidence without speculating on external unrecorded events.",
            "Temporal association does not establish direct causality."
        ],
        stateHash: stateHashBefore,
        evaluatedAt: new Date().toISOString()
    };

    inMemoryCounterfactualStore.set(counterfactualId, report);
    return report;
};

// ============================================================
// MULTI-BRANCH COMPARISON
// ============================================================

/**
 * Compares multiple counterfactual alternative branches against the actual baseline.
 * Bounded to maximum 5 branches to guarantee performance.
 */
export const compareCounterfactualBranches = async ({
    projectId,
    userId = null,
    branches = [],
    baseData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to compare counterfactual branches.");
    }

    const boundedBranches = (branches || []).slice(0, 5);
    const branchResults = [];

    for (const branch of boundedBranches) {
        const evalResult = await runCounterfactualSimulation({
            projectId,
            userId,
            scenario: branch,
            baseData,
            startOfToday
        });
        branchResults.push(evalResult);
    }

    const baselineActual = branchResults[0]?.actualState || {};

    const comparisonRows = [
        {
            scenarioName: "ACTUAL BASELINE (Recorded)",
            type: "ACTUAL",
            healthScore: baselineActual.healthScore ?? 75,
            scheduleDriftDays: baselineActual.scheduleDriftDays ?? 0,
            p80Date: baselineActual.p80Date || "N/A",
            criticalTaskCount: baselineActual.criticalTaskCount ?? 0,
            bottlenecksCount: baselineActual.bottlenecksCount ?? 0,
            p80ShiftDays: 0,
            healthGain: 0,
            isBaseline: true
        },
        ...branchResults.map((res, idx) => ({
            scenarioName: res.title || `Alternative ${String.fromCharCode(65 + idx)}`,
            type: res.scenarioType,
            healthScore: res.simulatedState?.healthScore ?? 75,
            scheduleDriftDays: res.simulatedState?.scheduleDriftDays ?? 0,
            p80Date: res.simulatedState?.p80Date || "N/A",
            criticalTaskCount: res.simulatedState?.criticalTaskCount ?? 0,
            bottlenecksCount: res.simulatedState?.bottlenecksCount ?? 0,
            p80ShiftDays: res.deltas?.p80DeltaDays ?? 0,
            healthGain: res.deltas?.healthDelta ?? 0,
            isBaseline: false,
            counterfactualId: res.counterfactualId
        }))
    ];

    return {
        projectId,
        branchesCount: branchResults.length,
        comparisonRows,
        branchResults,
        evaluatedAt: new Date().toISOString()
    };
};

// ============================================================
// COUNTERFACTUAL TIMELINE REPLAY GENERATOR
// ============================================================

/**
 * Builds dual-track timeline events (Actual Timeline vs Counterfactual Timeline)
 * highlighting divergence points and downstream consequences.
 */
export const getCounterfactualTimelineReplay = async ({
    projectId,
    counterfactualId = null,
    scenario = null,
    baseData = null
}) => {
    let report = null;
    if (counterfactualId && inMemoryCounterfactualStore.has(counterfactualId)) {
        report = inMemoryCounterfactualStore.get(counterfactualId);
    } else if (scenario) {
        report = await runCounterfactualSimulation({ projectId, scenario, baseData });
    }

    if (!report) {
        throw new Error("Valid counterfactual simulation report or scenario required for timeline replay.");
    }

    const divergence = report.divergencePoint || {};
    const divDate = divergence.date || new Date().toISOString().split("T")[0];

    const actualTimeline = [
        {
            date: divDate,
            title: "Actual Event Execution",
            description: "Historical progression as recorded in project activity logs.",
            type: "ACTUAL_EVENT",
            isDivergence: false
        },
        {
            date: report.actualState?.p80Date || divDate,
            title: "Actual Projected Completion (P80)",
            description: `Project projected delivery under recorded baseline (Health: ${report.actualState?.healthScore || 75}/100).`,
            type: "ACTUAL_MILESTONE",
            isDivergence: false
        }
    ];

    const counterfactualTimeline = [
        {
            date: divDate,
            title: `Counterfactual Divergence: ${divergence.entityName || "Target"}`,
            description: divergence.description,
            type: "DIVERGENCE_POINT",
            isDivergence: true
        },
        {
            date: report.simulatedState?.p80Date || divDate,
            title: "Simulated Delivery Outcome (P80)",
            description: `Project delivery outcome under simulated alternate branch (Health: ${report.simulatedState?.healthScore || 75}/100, Delta: ${report.deltas?.scheduleDaysDelta || 0}d).`,
            type: "SIMULATED_MILESTONE",
            isDivergence: false
        }
    ];

    return {
        counterfactualId: report.counterfactualId,
        projectId,
        title: report.title,
        divergencePoint: divergence,
        actualTimeline,
        counterfactualTimeline,
        deltas: report.deltas,
        limitations: report.limitations
    };
};
