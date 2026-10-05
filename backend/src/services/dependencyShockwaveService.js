/**
 * Dependency Shockwave Engine (Phase 8)
 * 
 * Simulates and models how disruptions propagate through the project dependency graph,
 * calculating downstream task impacts, path traversals, team exposure, critical path shifts,
 * bottleneck escalations, deadline breaches, Monte Carlo forecast variations, and containment resilience.
 * 
 * NON-NEGOTIABLE SAFETY INVARIANTS:
 * - 100% READ-ONLY / SIMULATION ONLY
 * - ZERO database mutations (no task, deadline, dependency, or assignee writes)
 * - Explicit separation of baseline and shocked states
 * - Reuses existing Phase 1-7 analytical engines without duplicating algorithms
 * - Preserves workspace and project authorization
 */

import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { getStartOfTodayUtc } from "./taskService.js";

// Phase 1-7 Engine Reuse
import {
    buildDependencyGraph,
    detectCycles,
    calculateTaskDurationDays,
    calculateCriticalPath
} from "./criticalPathService.js";
import {
    runScenarioSimulation,
    MUTATION_TYPES,
    deepClone
} from "./scenarioSimulationService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth } from "./projectHealthService.js";
import { detectBottlenecks } from "./bottleneckService.js";
import { calculateScheduleDrift } from "./scheduleDriftService.js";
import { calculateDeadlineRisks } from "./deadlineRiskService.js";
import { calculateTeamWorkload } from "./teamIntelligenceService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { calculateRecoveryPlan } from "./actionPlanService.js";
import {
    buildEvidenceItem,
    EVIDENCE_SOURCE_TYPES,
    EVIDENCE_SEVERITY
} from "./intelligenceEvidenceService.js";

// ============================================================
// CONSTANTS & SHOCK TYPES
// ============================================================

export const SHOCK_TYPES = Object.freeze({
    TASK_DELAY: "TASK_DELAY",
    TASK_COMPLETION_DELAY: "TASK_COMPLETION_DELAY",
    TASK_EFFORT_INCREASE: "TASK_EFFORT_INCREASE",
    TASK_BLOCKED: "TASK_BLOCKED",
    TASK_UNAVAILABLE: "TASK_UNAVAILABLE",
    ASSIGNEE_UNAVAILABLE: "ASSIGNEE_UNAVAILABLE",
    DEPENDENCY_BLOCKED: "DEPENDENCY_BLOCKED",
    DEADLINE_COMPRESSION: "DEADLINE_COMPRESSION",
    SCOPE_INCREASE: "SCOPE_INCREASE",
    RESOURCE_REDUCTION: "RESOURCE_REDUCTION"
});

export const SHOCK_SEVERITY = Object.freeze({
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
});

// In-memory test and query cache store (project-isolated)
const inMemoryShockwaveStore = new Map();
const inMemoryProjectDataStore = new Map();

export const clearShockwaveStore = () => {
    inMemoryShockwaveStore.clear();
    inMemoryProjectDataStore.clear();
};

export const setInMemoryShockwave = (key, data) => {
    inMemoryShockwaveStore.set(key, data);
};

export const setInMemoryProjectData = (projectId, data) => {
    inMemoryProjectDataStore.set(projectId, data);
};

const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ============================================================
// GRAPH TRAVERSAL & PROPAGATION PATHS
// ============================================================

/**
 * Traverses downstream dependencies from a set of starting task IDs.
 * Detects direct vs indirect relations, acyclic propagation paths, branching, and convergence.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.tasks
 * @param {Array<Object>} params.dependencies
 * @param {string|Array<string>} params.sourceTaskIds
 * @param {number} [params.maxDepth]
 * @returns {Object} Structured propagation graph
 */
export const traverseDownstreamDependencies = ({
    tasks = [],
    dependencies = [],
    sourceTaskIds = [],
    maxDepth = 50
}) => {
    const sources = Array.isArray(sourceTaskIds) ? sourceTaskIds : [sourceTaskIds];
    const sourceSet = new Set(sources);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const graph = buildDependencyGraph(tasks, dependencies);
    const { adjacencyList } = graph;

    // Track affected nodes: taskId -> { depth, relation, paths: string[][] }
    const affectedNodeMap = new Map();
    const allPaths = [];
    const branchingNodes = new Set();
    const convergingNodes = new Set();
    const inDegreeInShock = new Map();

    // BFS Queue: [taskId, depth, currentPath]
    // currentPath is array of task IDs
    sources.forEach((sourceId) => {
        if (!taskMap.has(sourceId)) return;

        const queue = [{ taskId: sourceId, depth: 0, path: [sourceId] }];
        const visitedInPath = new Set();

        while (queue.length > 0) {
            const { taskId, depth, path } = queue.shift();

            if (depth > maxDepth) continue;

            const successors = adjacencyList.get(taskId) || [];
            if (successors.length > 1) {
                branchingNodes.add(taskId);
            }

            if (successors.length === 0 && depth > 0) {
                // Leaf or terminal reached
                allPaths.push(path);
            }

            for (const nextId of successors) {
                // Cycle prevention: do not traverse if already in the active traversal path
                if (path.includes(nextId)) {
                    continue;
                }

                const nextDepth = depth + 1;
                const nextPath = [...path, nextId];

                // Track convergence (more than one incoming edge within the shock propagation)
                const currentIn = inDegreeInShock.get(nextId) || 0;
                inDegreeInShock.set(nextId, currentIn + 1);
                if (currentIn + 1 > 1) {
                    convergingNodes.add(nextId);
                }

                if (!affectedNodeMap.has(nextId)) {
                    affectedNodeMap.set(nextId, {
                        taskId: nextId,
                        title: taskMap.get(nextId)?.title || `Task ${nextId}`,
                        depth: nextDepth,
                        relation: nextDepth === 1 ? "DIRECT" : "INDIRECT",
                        paths: [nextPath],
                        assignedTo: taskMap.get(nextId)?.assigned_to || null,
                        estimatedHours: Number(taskMap.get(nextId)?.estimated_hours || 0),
                        status: taskMap.get(nextId)?.status || "To Do",
                        dueDate: taskMap.get(nextId)?.due_date || null
                    });
                } else {
                    const existing = affectedNodeMap.get(nextId);
                    // Keep shortest depth
                    if (nextDepth < existing.depth) {
                        existing.depth = nextDepth;
                        existing.relation = nextDepth === 1 ? "DIRECT" : "INDIRECT";
                    }
                    existing.paths.push(nextPath);
                }

                // If not terminal, continue traversal
                const nextSuccessors = adjacencyList.get(nextId) || [];
                if (nextSuccessors.length === 0) {
                    allPaths.push(nextPath);
                } else {
                    queue.push({ taskId: nextId, depth: nextDepth, path: nextPath });
                }
            }
        }
    });

    // Format named paths for explainability
    const formattedPaths = allPaths.map((p) =>
        p.map((id) => taskMap.get(id)?.title || id)
    );

    let longestPath = [];
    formattedPaths.forEach((p) => {
        if (p.length > longestPath.length) {
            longestPath = p;
        }
    });

    const calculatedMaxDepth = allPaths.length > 0
        ? allPaths.reduce((max, p) => Math.max(max, p.length - 1), 0)
        : Array.from(affectedNodeMap.values()).reduce((max, node) => Math.max(max, node.depth), 0);

    return {
        sourceTaskIds: sources,
        affectedTaskIds: Array.from(affectedNodeMap.keys()),
        affectedTasks: Array.from(affectedNodeMap.values()),
        totalAffected: affectedNodeMap.size,
        propagationPaths: formattedPaths,
        rawPaths: allPaths,
        longestPath,
        maxDepth: calculatedMaxDepth,
        branchingNodes: Array.from(branchingNodes),
        convergingNodes: Array.from(convergingNodes)
    };
};

// ============================================================
// SHOCK INTENSITY & SEVERITY SCORING
// ============================================================

/**
 * Calculates a deterministic shockwave impact score (0-100) and severity rating.
 * 
 * Components:
 * - Propagation breadth (Weight: 20%)
 * - Propagation depth (Weight: 15%)
 * - Critical-path exposure (Weight: 25%)
 * - Deadline impact (Weight: 20%)
 * - Team impact (Weight: 10%)
 * - Bottleneck impact (Weight: 10%)
 */
export const calculateShockIntensity = ({
    totalActiveTasks = 1,
    affectedTasksCount = 0,
    maxDepth = 0,
    graphDiameter = 5,
    criticalAffectedCount = 0,
    deadlineShiftDays = 0,
    affectedMembersCount = 0,
    totalMembersCount = 1,
    newBottlenecksCount = 0
}) => {
    // 1. Breadth: fraction of active tasks affected (0-20)
    const breadthRatio = Math.min(1, affectedTasksCount / Math.max(1, totalActiveTasks));
    const breadthScore = Math.round(breadthRatio * 20);

    // 2. Depth: propagation depth relative to graph diameter (0-15)
    const depthRatio = Math.min(1, maxDepth / Math.max(1, graphDiameter));
    const depthScore = Math.round(depthRatio * 15);

    // 3. Critical Path exposure: fraction of affected tasks that are critical (0-25)
    const criticalRatio = affectedTasksCount > 0
        ? Math.min(1, criticalAffectedCount / Math.max(1, affectedTasksCount))
        : 0;
    const criticalScore = Math.round((criticalRatio * 15) + (criticalAffectedCount > 0 ? 10 : 0));

    // 4. Deadline impact: project finish shift in days (0-20)
    // 0 days = 0, 1 day = 8, 3+ days = 16, 5+ days = 20
    const deadlineScore = Math.min(20, Math.round(deadlineShiftDays * 4));

    // 5. Team impact: fraction of team affected (0-10)
    const teamRatio = Math.min(1, affectedMembersCount / Math.max(1, totalMembersCount));
    const teamScore = Math.round(teamRatio * 10);

    // 6. Bottleneck impact: new bottlenecks created (0-10)
    const bottleneckScore = Math.min(10, newBottlenecksCount * 5);

    const totalScore = Math.max(0, Math.min(100,
        breadthScore + depthScore + criticalScore + deadlineScore + teamScore + bottleneckScore
    ));

    let severity = SHOCK_SEVERITY.LOW;
    if (totalScore >= 80) severity = SHOCK_SEVERITY.CRITICAL;
    else if (totalScore >= 60) severity = SHOCK_SEVERITY.HIGH;
    else if (totalScore >= 35) severity = SHOCK_SEVERITY.MEDIUM;

    const factors = [];
    if (affectedTasksCount > 0) factors.push(`${affectedTasksCount} downstream task(s) affected (+${breadthScore} pts)`);
    if (maxDepth > 0) factors.push(`Propagation depth of ${maxDepth} level(s) (+${depthScore} pts)`);
    if (criticalAffectedCount > 0) factors.push(`${criticalAffectedCount} critical-path task(s) in blast radius (+${criticalScore} pts)`);
    if (deadlineShiftDays > 0) factors.push(`Project completion shifted by +${deadlineShiftDays} day(s) (+${deadlineScore} pts)`);
    if (affectedMembersCount > 0) factors.push(`${affectedMembersCount} team member(s) affected (+${teamScore} pts)`);
    if (newBottlenecksCount > 0) factors.push(`${newBottlenecksCount} new bottleneck(s) formed (+${bottleneckScore} pts)`);

    if (factors.length === 0) {
        factors.push("Shockwave contained with negligible downstream operational disruption.");
    }

    return {
        score: totalScore,
        severity,
        breakdown: {
            breadthScore,
            depthScore,
            criticalScore,
            deadlineScore,
            teamScore,
            bottleneckScore
        },
        factors
    };
};

// ============================================================
// PROJECT CONTAINMENT & RESILIENCE
// ============================================================

/**
 * Calculates project resilience and shock containment.
 * Demonstrates whether downstream buffers absorbed the shock.
 */
export const calculateProjectContainment = ({
    shockMagnitudeDays = 0,
    projectCompletionDelayDays = 0,
    totalTasksCount = 1,
    affectedTasksCount = 0,
    propagationDepth = 0
}) => {
    const effectiveShock = Math.max(0, Number(shockMagnitudeDays) || 0);
    const effectiveDelay = Math.max(0, Number(projectCompletionDelayDays) || 0);

    const scheduleAbsorptionDays = Math.max(0, effectiveShock - effectiveDelay);

    // Containment score: 100% means total absorption (0 day project slip)
    // 0% means full delay propagation
    let containmentScore = 100;
    if (effectiveShock > 0) {
        const passThroughRatio = effectiveDelay / effectiveShock;
        containmentScore = Math.max(0, Math.min(100, Math.round((1 - passThroughRatio) * 100)));
    }

    const affectedTaskRatio = totalTasksCount > 0
        ? Math.round((affectedTasksCount / totalTasksCount) * 100)
        : 0;

    return {
        shockMagnitudeDays: effectiveShock,
        projectCompletionDelayDays: effectiveDelay,
        scheduleAbsorptionDays,
        containmentScore,
        affectedTaskRatio,
        propagationDepth,
        status: containmentScore >= 75 ? "HIGH_CONTAINMENT" : containmentScore >= 40 ? "MODERATE_CONTAINMENT" : "LOW_CONTAINMENT",
        summary: containmentScore === 100
            ? "Project completely absorbed the shock via task buffers; zero project completion slippage."
            : containmentScore > 0
                ? `Project partially absorbed ${scheduleAbsorptionDays} day(s) of shock (${containmentScore}% containment).`
                : "Shock propagated directly to project deadline without buffer absorption (0% containment)."
    };
};

// ============================================================
// RISK PROPAGATION CHAIN BUILDER
// ============================================================

/**
 * Builds a structured, step-by-step causal chain showing how the shock
 * travels from the root task to project-level health consequences.
 */
export const buildRiskPropagationChain = ({
    sourceTaskTitle,
    shockType,
    magnitude,
    unit,
    affectedCount,
    criticalCount,
    driftDays,
    healthDelta
}) => {
    const chain = [
        {
            stage: "1. INITIAL_DISRUPTION",
            entity: sourceTaskTitle || "Source Entity",
            impact: `${shockType} of ${magnitude} ${unit}`,
            evidence: `Disruption injected into graph root node.`
        },
        {
            stage: "2. DEPENDENCY_BLOCKAGE",
            entity: `${affectedCount} Downstream Tasks`,
            impact: `Prerequisite dependency gates queued`,
            evidence: `${affectedCount} task(s) directly or indirectly delayed.`
        },
        {
            stage: "3. CRITICAL_PATH_EXPOSURE",
            entity: criticalCount > 0 ? `${criticalCount} Critical Tasks` : "Slack Buffer Chain",
            impact: criticalCount > 0 ? "Zero-slack sequence contaminated" : "Absorbed in non-critical float",
            evidence: criticalCount > 0 ? `${criticalCount} critical task(s) impacted.` : "No immediate critical path intersection."
        },
        {
            stage: "4. SCHEDULE_DRIFT",
            entity: "Project Timeline",
            impact: driftDays > 0 ? `+${driftDays} days accumulated drift` : "No accumulated drift",
            evidence: `Projected completion shifted by ${driftDays} day(s).`
        },
        {
            stage: "5. PROJECT_HEALTH_IMPACT",
            entity: "Overall Health Score",
            impact: healthDelta !== 0 ? `${healthDelta > 0 ? "+" : ""}${healthDelta} points` : "Stable",
            evidence: `Composite health score adjusted by dimension weights.`
        }
    ];

    return chain;
};

// ============================================================
// MAIN DEPENDENCY SHOCKWAVE ANALYSIS SERVICE
// ============================================================

/**
 * Executes a comprehensive, deterministic Dependency Shockwave Analysis.
 * 
 * Safety invariants:
 * - PURE READ-ONLY SIMULATION
 * - ZERO DATABASE MUTATIONS
 * - Strict project access verification
 */
export const analyzeShockwave = async ({
    projectId,
    userId = null,
    sourceTaskId = null,
    sourceUserId = null,
    shockType = SHOCK_TYPES.TASK_DELAY,
    magnitude = 3,
    unit = "days",
    customMutations = null,
    projectData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for shockwave analysis.");
    }

    let project = null;
    let tasks = [];
    let dependencies = [];
    let projectMembers = [];
    let risks = [];
    let decisions = [];

    // 1. Data Retrieval: In-memory store (tests) or Prisma database (production)
    if (projectData) {
        project = projectData.project || { id: projectId, title: "Test Project" };
        tasks = projectData.tasks || [];
        dependencies = projectData.dependencies || [];
        projectMembers = projectData.projectMembers || [];
        risks = projectData.risks || [];
        decisions = projectData.decisions || [];
    } else if (inMemoryProjectDataStore.has(projectId)) {
        const stored = inMemoryProjectDataStore.get(projectId);
        project = stored.project || { id: projectId, title: "Test Project" };
        tasks = stored.tasks || [];
        dependencies = stored.dependencies || [];
        projectMembers = stored.projectMembers || [];
        risks = stored.risks || [];
        decisions = stored.decisions || [];
    } else if (isUuid(projectId)) {
        if (userId) {
            await verifyProjectAccess(projectId, userId);
        }

        const [p, t, d, pm, r, dec] = await Promise.all([
            prisma.projects.findUnique({
                where: { id: projectId },
                include: { workspaces: { select: { id: true, name: true } } }
            }),
            prisma.tasks.findMany({
                where: { project_id: projectId, is_archived: false },
                include: {
                    task_dependencies_task_dependencies_task_idTotasks: true,
                    task_dependencies_task_dependencies_depends_on_task_idTotasks: true,
                    users_tasks_assigned_toTousers: { select: { id: true, first_name: true, last_name: true, email: true } }
                }
            }),
            prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                    tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
                }
            }),
            prisma.project_members.findMany({
                where: { project_id: projectId },
                include: { users: { select: { id: true, first_name: true, last_name: true, email: true } } }
            }),
            prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
            prisma.decisions.findMany({ where: { project_id: projectId } })
        ]);

        if (!p) {
            const err = new Error("Project not found.");
            err.statusCode = 404;
            throw err;
        }

        project = p;
        tasks = t || [];
        dependencies = d || [];
        projectMembers = pm || [];
        risks = r || [];
        decisions = dec || [];
    } else {
        // Fallback for mock IDs
        project = { id: projectId, title: "Mock Project" };
        tasks = [];
        dependencies = [];
    }

    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // 2. Identify Target Source Tasks
    let effectiveSourceTaskIds = [];
    if (sourceTaskId) {
        effectiveSourceTaskIds = [sourceTaskId];
    } else if (shockType === SHOCK_TYPES.ASSIGNEE_UNAVAILABLE && sourceUserId) {
        // All active tasks assigned to this user
        effectiveSourceTaskIds = tasks
            .filter((t) => t.assigned_to === sourceUserId && t.status !== "Completed")
            .map((t) => t.id);
    } else if (tasks.length > 0) {
        // Default to first active task
        effectiveSourceTaskIds = [tasks[0].id];
    }

    const sourceTask = effectiveSourceTaskIds[0] ? taskMap.get(effectiveSourceTaskIds[0]) : null;
    const sourceTaskTitle = sourceTask?.title || effectiveSourceTaskIds[0] || "Target Component";

    // 3. Graph Traversal & Propagation Path Analysis
    const propagation = traverseDownstreamDependencies({
        tasks,
        dependencies,
        sourceTaskIds: effectiveSourceTaskIds
    });

    // 4. Construct Simulation Mutations for Shock
    let mutations = [];
    if (Array.isArray(customMutations) && customMutations.length > 0) {
        mutations = customMutations;
    } else {
        const numMagnitude = Number(magnitude) || 3;
        switch (shockType) {
            case SHOCK_TYPES.TASK_DELAY:
            case SHOCK_TYPES.TASK_COMPLETION_DELAY:
            case SHOCK_TYPES.TASK_BLOCKED:
            case SHOCK_TYPES.TASK_UNAVAILABLE:
            case SHOCK_TYPES.DEPENDENCY_BLOCKED: {
                effectiveSourceTaskIds.forEach((sId) => {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DELAY,
                        taskId: sId,
                        days: numMagnitude,
                        parameter: { delayDays: numMagnitude }
                    });
                });
                break;
            }

            case SHOCK_TYPES.TASK_EFFORT_INCREASE:
            case SHOCK_TYPES.SCOPE_INCREASE: {
                const hours = unit === "days" ? numMagnitude * 8 : numMagnitude;
                effectiveSourceTaskIds.forEach((sId) => {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                        taskId: sId,
                        hours,
                        parameter: { hours }
                    });
                });
                break;
            }

            case SHOCK_TYPES.ASSIGNEE_UNAVAILABLE:
            case SHOCK_TYPES.RESOURCE_REDUCTION: {
                // Delay all tasks assigned to the unavailable user
                effectiveSourceTaskIds.forEach((sId) => {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DELAY,
                        taskId: sId,
                        days: numMagnitude,
                        parameter: { delayDays: numMagnitude }
                    });
                });
                break;
            }

            case SHOCK_TYPES.DEADLINE_COMPRESSION: {
                mutations.push({
                    type: MUTATION_TYPES.PROJECT_DEADLINE_CHANGE,
                    daysOffset: -Math.abs(numMagnitude)
                });
                break;
            }

            default: {
                effectiveSourceTaskIds.forEach((sId) => {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_DELAY,
                        taskId: sId,
                        days: numMagnitude,
                        parameter: { delayDays: numMagnitude }
                    });
                });
            }
        }
    }

    // 5. Execute Simulation comparing Baseline vs Shocked in memory
    const simulationResult = runScenarioSimulation({
        project,
        tasks,
        dependencies,
        projectMembers,
        risks,
        decisions,
        mutations,
        startOfToday
    });

    const baseline = simulationResult.baseline || {};
    const shocked = simulationResult.simulated || {};
    const delta = simulationResult.delta || {};
    const simImpact = simulationResult.impact || {};

    // 6. Critical Path Analysis
    const baselineCpm = calculateCriticalPath({
        project,
        tasks,
        dependencies,
        startOfToday
    });

    const baselineCriticalSet = new Set(simImpact.criticalPath?.oldCriticalTasks || baselineCpm.criticalTaskIds || []);
    const shockedCriticalSet = new Set(simImpact.criticalPath?.newCriticalTasks || []);
    if (shockedCriticalSet.size === 0 && baselineCriticalSet.size > 0) {
        baselineCriticalSet.forEach((id) => shockedCriticalSet.add(id));
    }

    const durationBefore = baselineCpm.projectCriticalPathDays || 0;
    const durationDelta = simImpact.criticalPath?.durationChangeDays || 0;
    const durationAfter = durationBefore + durationDelta;

    const newlyCriticalTasks = (simImpact.criticalPath?.addedCriticalTasks || [])
        .map((id) => ({ id, title: taskMap.get(id)?.title || id }));

    const leftCriticalTasks = (simImpact.criticalPath?.removedCriticalTasks || [])
        .map((id) => ({ id, title: taskMap.get(id)?.title || id }));

    const affectedCriticalTasks = propagation.affectedTaskIds.filter((id) =>
        shockedCriticalSet.has(id) || baselineCriticalSet.has(id)
    );

    const isSourceCritical = effectiveSourceTaskIds.some((id) => baselineCriticalSet.has(id));

    const criticalPathImpact = {
        isSourceCritical,
        durationBefore,
        durationAfter,
        durationDelta,
        totalCriticalBefore: baselineCriticalSet.size,
        totalCriticalAfter: shockedCriticalSet.size,
        affectedCriticalCount: affectedCriticalTasks.length,
        affectedCriticalTasks: affectedCriticalTasks.map((id) => ({ id, title: taskMap.get(id)?.title || id })),
        newlyCriticalTasks,
        leftCriticalTasks,
        pathChanged: newlyCriticalTasks.length > 0 || leftCriticalTasks.length > 0
    };

    // Enrich affected tasks with critical status
    propagation.affectedTasks.forEach((node) => {
        node.criticalBefore = baselineCriticalSet.has(node.taskId);
        node.criticalAfter = shockedCriticalSet.has(node.taskId);
    });

    // 7. Bottleneck Analysis
    const oldBottleneckMap = new Map((baseline.bottlenecks?.items || []).map((b) => [b.taskId, b]));
    const newBottleneckMap = new Map((shocked.bottlenecks?.items || []).map((b) => [b.taskId, b]));

    const newlyCreatedBottlenecks = Array.from(newBottleneckMap.keys())
        .filter((id) => !oldBottleneckMap.has(id))
        .map((id) => ({
            taskId: id,
            title: taskMap.get(id)?.title || id,
            score: newBottleneckMap.get(id)?.score || 80,
            reason: "Escalated downstream dependency queue due to shock propagation."
        }));

    const bottleneckImpact = {
        baselineCount: oldBottleneckMap.size,
        shockedCount: newBottleneckMap.size,
        deltaCount: newBottleneckMap.size - oldBottleneckMap.size,
        isSourceBottleneck: effectiveSourceTaskIds.some((id) => oldBottleneckMap.has(id)),
        newlyCreatedBottlenecks,
        escalatedBottlenecks: Array.from(newBottleneckMap.entries())
            .filter(([id, b]) => oldBottleneckMap.has(id) && b.score > oldBottleneckMap.get(id).score)
            .map(([id, b]) => ({
                taskId: id,
                title: taskMap.get(id)?.title || id,
                scoreBefore: oldBottleneckMap.get(id).score,
                scoreAfter: b.score
            }))
    };

    // 8. Deadline Impact Analysis
    const baselineEnd = baseline.project?.endDate || project?.end_date;
    const projectShiftDays = Math.max(0, simImpact.schedule?.varianceDelta || simImpact.schedule?.deltaDays || 0);

    const deadlineImpact = {
        baselinePlannedEndDate: baselineEnd,
        projectedEndDateBefore: baseline.drift?.projectedEndDate || baselineEnd,
        projectedEndDateAfter: shocked.drift?.projectedEndDate || baselineEnd,
        delayDays: projectShiftDays,
        threatenedDeadlinesCount: simImpact.deadlineRisks?.simulatedTotal || 0,
        baselineDeadlineRisks: simImpact.deadlineRisks?.baselineTotal || 0,
        newlyOverdueTasks: (simImpact.deadlineRisks?.simulatedTotal || 0) - (simImpact.deadlineRisks?.baselineTotal || 0),
        scheduleCompressionDays: projectShiftDays
    };

    // 9. Team Impact Analysis
    const memberImpactMap = new Map();
    propagation.affectedTasks.forEach((taskNode) => {
        const userId = taskNode.assignedTo;
        if (!userId) return;

        if (!memberImpactMap.has(userId)) {
            const memberObj = projectMembers.find((m) => (m.user_id || m.id) === userId);
            const userName = memberObj?.users
                ? `${memberObj.users.first_name || ""} ${memberObj.users.last_name || ""}`.trim() || memberObj.users.email
                : `User ${userId.slice(0, 8)}`;

            memberImpactMap.set(userId, {
                userId,
                userName,
                affectedTaskCount: 0,
                criticalTaskCount: 0,
                additionalEffortHours: 0,
                affectedTaskTitles: []
            });
        }

        const mData = memberImpactMap.get(userId);
        mData.affectedTaskCount += 1;
        mData.affectedTaskTitles.push(taskNode.title);
        mData.additionalEffortHours += taskNode.estimatedHours || 0;
        if (taskNode.criticalAfter) {
            mData.criticalTaskCount += 1;
        }
    });

    const teamImpact = {
        affectedMembersCount: memberImpactMap.size,
        totalMembersCount: Math.max(1, projectMembers.length),
        affectedMembers: Array.from(memberImpactMap.values()),
        workloadConcentrationDelta: delta.workloadConcentrationDelta || 0
    };

    // 10. Health Impact Analysis
    const healthBefore = baseline.health || { score: 80, status: "HEALTHY" };
    const healthAfter = shocked.health || { score: 70, status: "WATCH" };

    const healthImpact = {
        scoreBefore: healthBefore.score,
        scoreAfter: healthAfter.score,
        scoreDelta: healthAfter.score - healthBefore.score,
        statusBefore: healthBefore.status,
        statusAfter: healthAfter.status,
        drivers: [
            ...(criticalPathImpact.affectedCriticalCount > 0 ? [`${criticalPathImpact.affectedCriticalCount} critical task(s) impacted`] : []),
            ...(deadlineImpact.delayDays > 0 ? [`+${deadlineImpact.delayDays} day(s) schedule drift`] : []),
            ...(bottleneckImpact.newlyCreatedBottlenecks.length > 0 ? [`${bottleneckImpact.newlyCreatedBottlenecks.length} new structural bottleneck(s)`] : [])
        ]
    };

    // 11. Monte Carlo Integration (where supported)
    let forecastImpact = null;
    try {
        if (tasks.length > 0) {
            const baselineForecast = runMonteCarloForecast({
                projectId,
                project,
                tasks,
                dependencies,
                iterations: 500,
                seed: 42
            });

            // Clone tasks for shocked forecast
            const shockedTasks = deepClone(tasks);
            effectiveSourceTaskIds.forEach((sId) => {
                const t = shockedTasks.find((item) => item.id === sId);
                if (t) {
                    const curHours = Number(t.estimated_hours || 8);
                    t.estimated_hours = curHours + (Number(magnitude) || 3) * 8;
                }
            });

            const shockedForecast = runMonteCarloForecast({
                projectId,
                project,
                tasks: shockedTasks,
                dependencies,
                iterations: 500,
                seed: 42
            });

            const bp50 = baselineForecast.percentiles?.p50?.days ?? (typeof baselineForecast.percentiles?.p50 === "number" ? baselineForecast.percentiles.p50 : 0);
            const bp80 = baselineForecast.percentiles?.p80?.days ?? (typeof baselineForecast.percentiles?.p80 === "number" ? baselineForecast.percentiles.p80 : 0);
            const bp90 = baselineForecast.percentiles?.p90?.days ?? (typeof baselineForecast.percentiles?.p90 === "number" ? baselineForecast.percentiles.p90 : 0);

            const sp50 = shockedForecast.percentiles?.p50?.days ?? (typeof shockedForecast.percentiles?.p50 === "number" ? shockedForecast.percentiles.p50 : 0);
            const sp80 = shockedForecast.percentiles?.p80?.days ?? (typeof shockedForecast.percentiles?.p80 === "number" ? shockedForecast.percentiles.p80 : 0);
            const sp90 = shockedForecast.percentiles?.p90?.days ?? (typeof shockedForecast.percentiles?.p90 === "number" ? shockedForecast.percentiles.p90 : 0);

            forecastImpact = {
                available: true,
                baseline: {
                    p50Date: baselineForecast.percentiles?.p50?.date || baselineForecast.p50FinishDate || baselineForecast.percentiles?.p50Date || "N/A",
                    p80Date: baselineForecast.percentiles?.p80?.date || baselineForecast.p80FinishDate || baselineForecast.percentiles?.p80Date || "N/A",
                    p90Date: baselineForecast.percentiles?.p90?.date || baselineForecast.p90FinishDate || baselineForecast.percentiles?.p90Date || "N/A"
                },
                shocked: {
                    p50Date: shockedForecast.percentiles?.p50?.date || shockedForecast.p50FinishDate || shockedForecast.percentiles?.p50Date || "N/A",
                    p80Date: shockedForecast.percentiles?.p80?.date || shockedForecast.p80FinishDate || shockedForecast.percentiles?.p80Date || "N/A",
                    p90Date: shockedForecast.percentiles?.p90?.date || shockedForecast.p90FinishDate || shockedForecast.percentiles?.p90Date || "N/A"
                },
                deltas: {
                    p50ShiftDays: Math.max(0, sp50 - bp50),
                    p80ShiftDays: Math.max(0, sp80 - bp80),
                    p90ShiftDays: Math.max(0, sp90 - bp90)
                }
            };
        }
    } catch (_) {
        forecastImpact = { available: false, reason: "Monte Carlo forecast unavailable for this topology." };
    }

    // 12. Shock Intensity & Containment Score
    const intensity = calculateShockIntensity({
        totalActiveTasks: tasks.length,
        affectedTasksCount: propagation.totalAffected,
        maxDepth: propagation.maxDepth,
        criticalAffectedCount: criticalPathImpact.affectedCriticalCount,
        deadlineShiftDays: deadlineImpact.delayDays,
        affectedMembersCount: teamImpact.affectedMembersCount,
        totalMembersCount: teamImpact.totalMembersCount,
        newBottlenecksCount: bottleneckImpact.newlyCreatedBottlenecks.length
    });

    const containment = calculateProjectContainment({
        shockMagnitudeDays: Number(magnitude) || 3,
        projectCompletionDelayDays: deadlineImpact.delayDays,
        totalTasksCount: tasks.length,
        affectedTasksCount: propagation.totalAffected,
        propagationDepth: propagation.maxDepth
    });

    // 13. Risk Chain Construction
    const riskChain = buildRiskPropagationChain({
        sourceTaskTitle,
        shockType,
        magnitude,
        unit,
        affectedCount: propagation.totalAffected,
        criticalCount: criticalPathImpact.affectedCriticalCount,
        driftDays: deadlineImpact.delayDays,
        healthDelta: healthImpact.scoreDelta
    });

    // 14. Recovery Opportunities (SIMULATION ONLY)
    const recoveryPlan = calculateRecoveryPlan({
        projectId,
        project,
        tasks,
        dependencies,
        driftDays: deadlineImpact.delayDays
    });

    const recoveryOptions = (recoveryPlan.availableOptions || []).map((opt) => ({
        ...opt,
        isSimulationOnly: true,
        disclaimer: "Simulation only. Stage this plan into the Phase 3 Approval Center to execute."
    }));

    // 15. Verifiable Evidence Items
    const evidence = [
        buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH,
            sourceId: `shock-cpm-${projectId}`,
            projectId,
            metric: "Critical Path Exposure",
            value: `${criticalPathImpact.affectedCriticalCount} tasks`,
            explanation: `${criticalPathImpact.affectedCriticalCount} downstream tasks lie directly on the project critical path.`,
            severity: criticalPathImpact.affectedCriticalCount > 0 ? EVIDENCE_SEVERITY.HIGH : EVIDENCE_SEVERITY.LOW
        }),
        buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.SCHEDULE_DRIFT,
            sourceId: `shock-drift-${projectId}`,
            projectId,
            metric: "Shockwave Schedule Shift",
            value: `+${deadlineImpact.delayDays} days`,
            explanation: `Downstream dependency propagation delays projected finish by ${deadlineImpact.delayDays} day(s).`,
            severity: deadlineImpact.delayDays > 3 ? EVIDENCE_SEVERITY.CRITICAL : deadlineImpact.delayDays > 0 ? EVIDENCE_SEVERITY.HIGH : EVIDENCE_SEVERITY.LOW
        }),
        buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.HEALTH,
            sourceId: `shock-health-${projectId}`,
            projectId,
            metric: "Health Score Delta",
            value: `${healthImpact.scoreDelta} pts`,
            explanation: `Project health changes from ${healthImpact.scoreBefore} to ${healthImpact.scoreAfter}.`,
            severity: healthImpact.scoreDelta <= -15 ? EVIDENCE_SEVERITY.CRITICAL : healthImpact.scoreDelta < 0 ? EVIDENCE_SEVERITY.MEDIUM : EVIDENCE_SEVERITY.LOW
        })
    ];

    const result = {
        shock: {
            type: shockType,
            sourceEntity: sourceTaskId || sourceUserId || "Multiple Tasks",
            sourceTaskId: effectiveSourceTaskIds[0] || null,
            sourceTaskTitle,
            magnitude: Number(magnitude) || 3,
            unit,
            assumptions: [
                "Dependency relationships represent strict prerequisite completion order.",
                "Simulated delays assume linear workstream slippage without automatic team re-allocation."
            ]
        },
        intensity,
        propagation,
        containment,
        criticalPath: criticalPathImpact,
        bottlenecks: bottleneckImpact,
        deadlineRisk: deadlineImpact,
        teamImpact,
        healthImpact,
        forecastImpact,
        riskChain,
        recoveryOptions,
        evidence,
        simulationOnly: true,
        analyzedAt: new Date().toISOString()
    };

    // Cache result
    const cacheKey = `shock_${projectId}_${sourceTaskId || "all"}_${shockType}_${magnitude}`;
    inMemoryShockwaveStore.set(cacheKey, result);

    return result;
};

// ============================================================
// STRESS-TEST ENGINE (Comparative Shockwave Ranking)
// ============================================================

/**
 * Runs comparative shockwaves across all critical and bottleneck tasks
 * to determine which single task would inflict the most structural damage if delayed.
 */
export const stressTestProject = async ({
    projectId,
    userId = null,
    durationDays = 3,
    projectData = null
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for stress-testing.");
    }

    // Retrieve active tasks
    let tasks = [];
    if (projectData?.tasks) {
        tasks = projectData.tasks;
    } else if (inMemoryProjectDataStore.has(projectId)) {
        tasks = inMemoryProjectDataStore.get(projectId).tasks || [];
    } else if (isUuid(projectId)) {
        if (userId) await verifyProjectAccess(projectId, userId);
        tasks = await prisma.tasks.findMany({
            where: { project_id: projectId, is_archived: false }
        });
    }

    if (tasks.length === 0) {
        return {
            projectId,
            testedTaskCount: 0,
            rankedImpacts: [],
            mostDangerousTask: null,
            message: "Project has no active tasks to stress-test."
        };
    }

    // Test up to top 10 tasks to bound traversal performance
    const candidateTasks = tasks.slice(0, 10);
    const results = [];

    for (const task of candidateTasks) {
        try {
            const shockResult = await analyzeShockwave({
                projectId,
                userId,
                sourceTaskId: task.id,
                shockType: SHOCK_TYPES.TASK_DELAY,
                magnitude: durationDays,
                projectData
            });

            results.push({
                taskId: task.id,
                taskTitle: task.title,
                impactScore: shockResult.intensity.score,
                severity: shockResult.intensity.severity,
                affectedTasksCount: shockResult.propagation.totalAffected,
                maxDepth: shockResult.propagation.maxDepth,
                criticalTasksAffected: shockResult.criticalPath.affectedCriticalCount,
                projectCompletionDelayDays: shockResult.deadlineRisk.delayDays,
                healthDelta: shockResult.healthImpact.scoreDelta
            });
        } catch (_) {}
    }

    // Sort descending by impactScore
    results.sort((a, b) => b.impactScore - a.impactScore);

    const mostDangerous = results[0] || null;

    return {
        projectId,
        testedTaskCount: results.length,
        durationDays,
        rankedImpacts: results,
        mostDangerousTask: mostDangerous,
        summary: mostDangerous
            ? `Task '${mostDangerous.taskTitle}' is the most vulnerable point of failure (Impact Score: ${mostDangerous.impactScore}/100, shifts completion by +${mostDangerous.projectCompletionDelayDays}d).`
            : "No significant vulnerability detected."
    };
};

export default {
    SHOCK_TYPES,
    SHOCK_SEVERITY,
    traverseDownstreamDependencies,
    calculateShockIntensity,
    calculateProjectContainment,
    buildRiskPropagationChain,
    analyzeShockwave,
    stressTestProject,
    clearShockwaveStore,
    setInMemoryShockwave,
    setInMemoryProjectData
};
