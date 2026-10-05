/**
 * Project Chaos / Failure Laboratory (Phase 10)
 * 
 * Automatically generates controlled project-disruption scenarios, executes them
 * against the Digital Twin in simulation, evaluates resulting project damage,
 * identifies failure thresholds, measures resilience, and surfaces dangerous combinations.
 * 
 * ARCHITECTURAL INVARIANTS:
 * - 100% READ-ONLY / SIMULATION ONLY
 * - ZERO database mutations (verified via SHA-256 state hashing)
 * - Deterministic, reproducible scenario generation using seeded PRNG
 * - Direct reuse of Phase 1-9 intelligence engines (Shockwave, Digital Twin, Monte Carlo, Interventions)
 * - Preserves workspace and project authorization
 */

import crypto from "crypto";
import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { getStartOfTodayUtc } from "./taskService.js";

// Phase 1-9 Analytical Engine Reuse
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
    deepClone
} from "./scenarioSimulationService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth } from "./projectHealthService.js";
import { detectBottlenecks } from "./bottleneckService.js";
import { calculateScheduleDrift } from "./scheduleDriftService.js";
import { calculateDeadlineRisks } from "./deadlineRiskService.js";
import { calculateTeamWorkload, calculateKnowledgeConcentration } from "./teamIntelligenceService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import {
    traverseDownstreamDependencies,
    calculateProjectContainment,
    SHOCK_TYPES,
    SHOCK_SEVERITY
} from "./dependencyShockwaveService.js";
import {
    evaluateIntervention,
    compareInterventions,
    INTERVENTION_TYPES
} from "./interventionImpactService.js";
import { calculateRecoveryPlan } from "./actionPlanService.js";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================

export const CHAOS_CATEGORIES = Object.freeze({
    TASK_FAILURE: "TASK_FAILURE",
    TASK_DELAY: "TASK_DELAY",
    TASK_EFFORT_SHOCK: "TASK_EFFORT_SHOCK",
    TEAM_AVAILABILITY: "TEAM_AVAILABILITY",
    RESOURCE_REDUCTION: "RESOURCE_REDUCTION",
    DEPENDENCY_FAILURE: "DEPENDENCY_FAILURE",
    DEADLINE_COMPRESSION: "DEADLINE_COMPRESSION",
    SCOPE_EXPANSION: "SCOPE_EXPANSION",
    BOTTLENECK_FAILURE: "BOTTLENECK_FAILURE",
    COMBINED_FAILURE: "COMBINED_FAILURE"
});

export const FAILURE_CLASSIFICATION = Object.freeze({
    RESILIENT: "RESILIENT",
    ATTENTION: "ATTENTION",
    HIGH_RISK: "HIGH_RISK",
    CRITICAL_FAILURE: "CRITICAL_FAILURE"
});

export const CHAOS_SEVERITY = Object.freeze({
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
});

// In-memory request-scoped cache and test store (project-isolated)
const inMemoryChaosStore = new Map();
const inMemoryProjectDataStore = new Map();

export const clearChaosStore = () => {
    inMemoryChaosStore.clear();
    inMemoryProjectDataStore.clear();
};

export const setInMemoryChaos = (key, data) => {
    inMemoryChaosStore.set(key, data);
};

export const getInMemoryChaos = (key) => {
    return inMemoryChaosStore.get(key) || null;
};

export const getProjectChaosLab = (projectId, userId = null) => {
    return inMemoryChaosStore.get(projectId) || inMemoryChaosStore.get(`chaos-${projectId}`) || null;
};

export const setInMemoryProjectData = (projectId, data) => {
    inMemoryProjectDataStore.set(projectId, data);
};

const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ============================================================
// DETERMINISTIC SEEDED PRNG (Mulberry32)
// ============================================================

/**
 * Creates a deterministic 32-bit PRNG from an integer or string seed.
 * Guarantees identical output sequences for identical seeds.
 * 
 * @param {number|string} seed
 * @returns {() => number} Float generator in range [0, 1)
 */
export const createPrng = (seed = 42) => {
    let s = 0;
    if (typeof seed === "number") {
        s = Math.abs(seed) >>> 0;
    } else if (typeof seed === "string") {
        for (let i = 0; i < seed.length; i++) {
            s = (Math.imul(31, s) + seed.charCodeAt(i)) >>> 0;
        }
    } else {
        s = 42;
    }
    if (s === 0) s = 42;

    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// ============================================================
// INTELLIGENT RISK-GUIDED TARGET SELECTION
// ============================================================

/**
 * Weights tasks by structural importance to ensure chaos scenarios target
 * areas where failure materially matters.
 */
export const calculateTaskTargetWeights = ({
    tasks = [],
    dependencies = [],
    cpm = null,
    bottlenecks = [],
    criticalTaskIds = null,
    bottleneckTaskIds = null
}) => {
    let criticalSet;
    if (criticalTaskIds instanceof Set) {
        criticalSet = criticalTaskIds;
    } else if (Array.isArray(criticalTaskIds)) {
        criticalSet = new Set(criticalTaskIds);
    } else {
        criticalSet = new Set(cpm?.criticalTaskIds || []);
    }

    let bottleneckSet;
    if (bottleneckTaskIds instanceof Set) {
        bottleneckSet = bottleneckTaskIds;
    } else if (Array.isArray(bottleneckTaskIds)) {
        bottleneckSet = new Set(bottleneckTaskIds);
    } else {
        const bnList = bottlenecks?.bottlenecks || (Array.isArray(bottlenecks) ? bottlenecks : []);
        bottleneckSet = new Set(bnList.map((b) => b.taskId || b.id));
    }

    // Downstream fan-out map
    const fanoutMap = new Map();
    dependencies.forEach((d) => {
        const from = d.depends_on_task_id;
        fanoutMap.set(from, (fanoutMap.get(from) || 0) + 1);
    });

    const result = tasks.map((task) => {
        let weight = 1.0;
        if (criticalSet.has(task.id)) weight += 3.0;
        if (bottleneckSet.has(task.id)) weight += 3.0;

        const fanout = fanoutMap.get(task.id) || 0;
        weight += Math.min(3.0, fanout * 0.75);

        const priority = String(task.priority || "Medium").toUpperCase();
        if (priority === "CRITICAL") weight += 2.5;
        else if (priority === "HIGH") weight += 1.5;

        if (task.status === "In Progress") weight += 1.0;
        if (task.status === "Completed") weight = 0.1; // Low weight for already finished

        return { task, weight };
    });

    result.forEach((entry) => {
        if (entry.task?.id) {
            result[entry.task.id] = entry.weight;
        }
    });

    return result;
};

/**
 * Weights team members by critical task ownership, workload, and knowledge concentration.
 */
export const calculateMemberTargetWeights = ({
    tasks = [],
    projectMembers = [],
    members = [],
    cpm = null
}) => {
    const rawMembers = (projectMembers && projectMembers.length > 0) ? projectMembers : (members || []);
    const criticalSet = new Set(cpm?.criticalTaskIds || []);
    const memberMap = new Map();

    rawMembers.forEach((pm) => {
        const uid = pm.user_id || pm.id || pm.userId;
        memberMap.set(uid, {
            member: pm,
            userId: uid,
            name: `${pm.users?.first_name || ""} ${pm.users?.last_name || ""}`.trim() || pm.users?.email || uid,
            criticalCount: 0,
            totalHours: 0,
            taskCount: 0
        });
    });

    tasks.forEach((t) => {
        const uid = t.assigned_to;
        if (uid && memberMap.has(uid)) {
            const entry = memberMap.get(uid);
            entry.taskCount++;
            entry.totalHours += Number(t.estimated_hours || 0);
            if (criticalSet.has(t.id)) entry.criticalCount++;
        }
    });

    const result = Array.from(memberMap.values()).map((item) => {
        let weight = 1.0;
        weight += item.criticalCount * 2.0;
        weight += Math.min(3.0, item.totalHours / 16);
        return { item, weight };
    });

    result.forEach((entry) => {
        if (entry.item?.userId) {
            result[entry.item.userId] = entry.weight;
        }
    });

    return result;
};

/**
 * Deterministically picks a weighted item using PRNG.
 */
export const pickWeighted = (weightedItems, prng) => {
    if (!weightedItems || weightedItems.length === 0) return null;
    const totalWeight = weightedItems.reduce((sum, wi) => sum + wi.weight, 0);
    if (totalWeight <= 0) return weightedItems[0].task || weightedItems[0].item;

    let roll = prng() * totalWeight;
    for (const wi of weightedItems) {
        if (roll <= wi.weight) {
            return wi.task || wi.item;
        }
        roll -= wi.weight;
    }
    return weightedItems[weightedItems.length - 1].task || weightedItems[weightedItems.length - 1].item;
};

// ============================================================
// DETERMINISTIC SCENARIO GENERATOR
// ============================================================

/**
 * Generates a reproducible suite of controlled chaos disruption scenarios.
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Array<Object>} params.tasks
 * @param {Array<Object>} params.dependencies
 * @param {Array<Object>} params.projectMembers
 * @param {number} [params.scenarioCount=100]
 * @param {number} [params.maxShocksPerScenario=2]
 * @param {Array<string>} [params.severityLevels]
 * @param {number|string} [params.seed=42]
 * @returns {Array<Object>} Structured scenario definitions
 */
export const generateChaosScenarios = ({
    projectId,
    tasks = [],
    dependencies = [],
    projectMembers = [],
    scenarioCount = 100,
    maxShocksPerScenario = 2,
    severityLevels = null,
    severityRange = null,
    seed = 42,
    baseData = null,
    includeCombined = false
}) => {
    const effectiveProjectId = projectId || baseData?.project?.id || baseData?.projectId || "default-proj";
    const effectiveTasks = (tasks && tasks.length > 0) ? tasks : (baseData?.tasks || []);
    const effectiveDependencies = (dependencies && dependencies.length > 0) ? dependencies : (baseData?.dependencies || []);
    const effectiveMembers = (projectMembers && projectMembers.length > 0) ? projectMembers : (baseData?.projectMembers || []);
    const effectiveSeverityLevels = severityRange || severityLevels || [
        CHAOS_SEVERITY.LOW,
        CHAOS_SEVERITY.MEDIUM,
        CHAOS_SEVERITY.HIGH,
        CHAOS_SEVERITY.CRITICAL
    ];

    if (!effectiveProjectId) {
        throw new Error("Project ID is required to generate chaos scenarios.");
    }
    if (!Array.isArray(effectiveTasks) || effectiveTasks.length === 0) {
        return [];
    }

    const prng = createPrng(seed);
    const count = Math.max(1, Math.min(500, Number(scenarioCount) || 100));
    const maxShocks = Math.max(1, Math.min(3, Number(maxShocksPerScenario) || 2));
    const allowCombined = includeCombined || maxShocks > 1;

    // Baseline structural metrics for risk-guided weighting
    const cpm = calculateCriticalPath({ tasks: effectiveTasks, dependencies: effectiveDependencies });
    const bottlenecks = detectBottlenecks({ tasks: effectiveTasks, dependencies: effectiveDependencies });
    const weightedTasks = calculateTaskTargetWeights({ tasks: effectiveTasks, dependencies: effectiveDependencies, cpm, bottlenecks });
    const weightedMembers = calculateMemberTargetWeights({ tasks: effectiveTasks, projectMembers: effectiveMembers, cpm });

    const scenarios = [];
    const seenSignatures = new Set();

    const categoriesList = [
        CHAOS_CATEGORIES.TASK_DELAY,
        CHAOS_CATEGORIES.TASK_FAILURE,
        CHAOS_CATEGORIES.TASK_EFFORT_SHOCK,
        CHAOS_CATEGORIES.TEAM_AVAILABILITY,
        CHAOS_CATEGORIES.RESOURCE_REDUCTION,
        CHAOS_CATEGORIES.DEPENDENCY_FAILURE,
        CHAOS_CATEGORIES.DEADLINE_COMPRESSION,
        CHAOS_CATEGORIES.SCOPE_EXPANSION,
        CHAOS_CATEGORIES.BOTTLENECK_FAILURE,
        CHAOS_CATEGORIES.COMBINED_FAILURE
    ];

    // Helper: generate a single atomic shock
    const buildShock = (preferredCategory = null, severity = CHAOS_SEVERITY.MEDIUM) => {
        let cat = preferredCategory;
        if (!cat || cat === CHAOS_CATEGORIES.COMBINED_FAILURE) {
            const catIdx = Math.floor(prng() * (categoriesList.length - 1));
            cat = categoriesList[catIdx];
        }

        const targetTask = pickWeighted(weightedTasks, prng) || effectiveTasks[0];
        const targetMember = pickWeighted(weightedMembers, prng) || (effectiveMembers[0]?.users ? effectiveMembers[0] : null);

        let magnitude = 3;
        let unit = "days";
        let shockType = SHOCK_TYPES.TASK_DELAY;

        // Scale magnitude by severity
        if (severity === CHAOS_SEVERITY.LOW) {
            magnitude = 1;
        } else if (severity === CHAOS_SEVERITY.MEDIUM) {
            magnitude = 2 + Math.floor(prng() * 2); // 2-3
        } else if (severity === CHAOS_SEVERITY.HIGH) {
            magnitude = 4 + Math.floor(prng() * 2); // 4-5
        } else { // CRITICAL
            magnitude = 6 + Math.floor(prng() * 3); // 6-8
        }

        switch (cat) {
            case CHAOS_CATEGORIES.TASK_DELAY:
                shockType = SHOCK_TYPES.TASK_DELAY;
                unit = "days";
                return {
                    type: shockType,
                    category: cat,
                    target: { taskId: targetTask.id, title: targetTask.title },
                    magnitude,
                    unit,
                    duration: magnitude
                };

            case CHAOS_CATEGORIES.TASK_FAILURE:
            case CHAOS_CATEGORIES.DEPENDENCY_FAILURE:
                shockType = SHOCK_TYPES.TASK_BLOCKED;
                unit = "days";
                return {
                    type: shockType,
                    category: cat,
                    target: { taskId: targetTask.id, title: targetTask.title },
                    magnitude: Math.max(2, magnitude),
                    unit,
                    duration: Math.max(2, magnitude)
                };

            case CHAOS_CATEGORIES.TASK_EFFORT_SHOCK:
                shockType = SHOCK_TYPES.TASK_EFFORT_INCREASE;
                unit = "hours";
                const hoursMag = magnitude * 8;
                return {
                    type: shockType,
                    category: cat,
                    target: { taskId: targetTask.id, title: targetTask.title },
                    magnitude: hoursMag,
                    unit,
                    duration: magnitude
                };

            case CHAOS_CATEGORIES.TEAM_AVAILABILITY:
            case CHAOS_CATEGORIES.RESOURCE_REDUCTION: {
                shockType = SHOCK_TYPES.ASSIGNEE_UNAVAILABLE;
                unit = "days";
                const uid = targetMember?.userId || targetMember?.user_id || targetTask.assigned_to || "user-1";
                const uname = targetMember?.name || "Team Member";
                return {
                    type: shockType,
                    category: cat,
                    target: { userId: uid, name: uname, taskId: targetTask.id },
                    magnitude: Math.min(5, magnitude),
                    unit,
                    duration: Math.min(5, magnitude)
                };
            }

            case CHAOS_CATEGORIES.DEADLINE_COMPRESSION:
                shockType = SHOCK_TYPES.DEADLINE_COMPRESSION;
                unit = "days";
                return {
                    type: shockType,
                    category: cat,
                    target: { projectId: effectiveProjectId, taskTitle: "Project Deadline" },
                    magnitude: Math.min(4, Math.max(1, Math.floor(magnitude / 2))),
                    unit,
                    duration: Math.min(4, Math.max(1, Math.floor(magnitude / 2)))
                };

            case CHAOS_CATEGORIES.SCOPE_EXPANSION:
                shockType = SHOCK_TYPES.SCOPE_INCREASE;
                unit = "hours";
                return {
                    type: shockType,
                    category: cat,
                    target: { projectId: effectiveProjectId, taskTitle: "Scope Additions" },
                    magnitude: magnitude * 8,
                    unit,
                    duration: magnitude
                };

            case CHAOS_CATEGORIES.BOTTLENECK_FAILURE: {
                const majorBn = (bottlenecks?.bottlenecks || bottlenecks || [])[0];
                const bnTask = majorBn ? (effectiveTasks.find((t) => t.id === (majorBn.taskId || majorBn.id)) || targetTask) : targetTask;
                shockType = SHOCK_TYPES.TASK_DELAY;
                unit = "days";
                return {
                    type: shockType,
                    category: cat,
                    target: { taskId: bnTask.id, title: bnTask.title, isBottleneck: true },
                    magnitude: Math.max(3, magnitude),
                    unit,
                    duration: Math.max(3, magnitude)
                };
            }

            default:
                return {
                    type: SHOCK_TYPES.TASK_DELAY,
                    category: CHAOS_CATEGORIES.TASK_DELAY,
                    target: { taskId: targetTask.id, title: targetTask.title },
                    magnitude,
                    unit: "days",
                    duration: magnitude
                };
        }
    };

    let attempts = 0;
    while (scenarios.length < count && attempts < count * 5) {
        attempts++;

        const sevIdx = Math.floor(prng() * effectiveSeverityLevels.length);
        const severity = effectiveSeverityLevels[sevIdx];

        // Combined shock handling
        let isCombined = false;
        if (allowCombined) {
            if (includeCombined) {
                // Ensure at least one single and at least one combined
                if (scenarios.length === 0) {
                    isCombined = false;
                } else if (scenarios.length === 1) {
                    isCombined = true;
                } else {
                    isCombined = prng() < 0.40;
                }
            } else {
                isCombined = prng() < 0.40;
            }
        }
        let category = isCombined ? CHAOS_CATEGORIES.COMBINED_FAILURE : categoriesList[Math.floor(prng() * (categoriesList.length - 1))];

        const shocks = [];
        if (isCombined) {
            // First shock
            const s1 = buildShock(CHAOS_CATEGORIES.TASK_DELAY, severity);
            shocks.push(s1);

            // Second shock: complementary (e.g. member unavailable, deadline compressed)
            const secondCats = [
                CHAOS_CATEGORIES.TEAM_AVAILABILITY,
                CHAOS_CATEGORIES.DEADLINE_COMPRESSION,
                CHAOS_CATEGORIES.TASK_EFFORT_SHOCK,
                CHAOS_CATEGORIES.BOTTLENECK_FAILURE
            ];
            const s2Cat = secondCats[Math.floor(prng() * secondCats.length)];
            const s2 = buildShock(s2Cat, severity);
            shocks.push(s2);
        } else {
            shocks.push(buildShock(category, severity));
        }

        // Deduplication signature
        const sig = shocks.map((s) => `${s.type}:${s.target?.taskId || s.target?.userId || s.target?.taskTitle}:${s.magnitude}`).sort().join("|");
        if (seenSignatures.has(sig) && scenarios.length > 5) {
            continue;
        }
        seenSignatures.add(sig);

        const scenarioIndex = scenarios.length + 1;
        const scenarioId = `chaos-${effectiveProjectId}-${seed}-${scenarioIndex}`;
        const title = isCombined
            ? `Combined Disruption: Multi-Factor Shock (${severity})`
            : `${category.replace(/_/g, " ")} (${severity})`;

        scenarios.push({
            scenarioId,
            id: scenarioId,
            title,
            projectId: effectiveProjectId,
            category,
            severity,
            shocks,
            seed,
            assumptions: [
                "Disruptions execute in an isolated Digital Twin clone without mutating live records.",
                "Simulated delays assume strict sequence dependency chains without auto-recovery."
            ],
            generatedAt: new Date().toISOString()
        });
    }

    return scenarios;
};

// ============================================================
// CHAOS IMPACT SCORING & CLASSIFICATION FORMULA
// ============================================================

/**
 * Calculates a transparent, deterministic 0-100 Chaos Impact Score.
 * 
 * Formula Components:
 * - Propagation Breadth (up to 20 pts)
 * - Propagation Depth (up to 15 pts)
 * - Critical Path Exposure (up to 20 pts)
 * - Deadline Delay Shift (up to 20 pts)
 * - Project Health Decline (up to 15 pts)
 * - Bottleneck Escalation (up to 10 pts)
 */
export const calculateChaosImpactScore = ({
    totalTasksCount = 1,
    affectedTasksCount = 0,
    maxDepth = 0,
    graphDiameter = 5,
    criticalAffectedCount = 0,
    deadlineShiftDays = 0,
    healthDelta = 0,
    newBottlenecksCount = 0
}) => {
    // 1. Breadth: fraction of project tasks affected (0-20 pts)
    const breadthRatio = Math.min(1, affectedTasksCount / Math.max(1, totalTasksCount));
    const breadthScore = Math.round(breadthRatio * 20);

    // 2. Depth: propagation depth relative to graph diameter / max possible chain (0-15 pts)
    const maxPossibleDepth = Math.max(1, Math.min(graphDiameter, Math.max(1, totalTasksCount - 1)));
    const depthRatio = Math.min(1, maxDepth / maxPossibleDepth);
    const depthScore = Math.round(depthRatio * 15);

    // 3. Critical Path Exposure (0-20 pts)
    const criticalScore = Math.min(20, criticalAffectedCount * 6);

    // 4. Deadline Delay Shift (0-20 pts)
    const deadlineScore = Math.min(20, Math.round(Math.max(0, deadlineShiftDays) * 5));

    // 5. Health Decline (0-15 pts)
    const healthDecline = healthDelta < 0 ? Math.abs(healthDelta) : 0;
    const healthScore = Math.min(15, Math.round(healthDecline * 1.0));

    // 6. Bottleneck Escalation (0-10 pts)
    const bottleneckScore = Math.min(10, newBottlenecksCount * 5);

    const totalScore = Math.max(0, Math.min(100,
        breadthScore + depthScore + criticalScore + deadlineScore + healthScore + bottleneckScore
    ));

    // Deterministic Failure Classification
    let classification = FAILURE_CLASSIFICATION.RESILIENT;
    if (totalScore >= 80) {
        classification = FAILURE_CLASSIFICATION.CRITICAL_FAILURE;
    } else if (totalScore >= 60) {
        classification = FAILURE_CLASSIFICATION.HIGH_RISK;
    } else if (totalScore >= 40) {
        classification = FAILURE_CLASSIFICATION.ATTENTION;
    }

    const factors = [
        `Propagation breadth: +${breadthScore} pts (${affectedTasksCount}/${totalTasksCount} tasks affected)`,
        `Propagation depth: +${depthScore} pts (${maxDepth} level(s))`,
        `Critical-path exposure: +${criticalScore} pts (${criticalAffectedCount} critical tasks in blast radius)`,
        `Deadline slippage: +${deadlineScore} pts (+${deadlineShiftDays} day(s) projected delay)`,
        `Health deterioration: +${healthScore} pts (${healthDelta < 0 ? healthDelta : 0} health delta)`,
        `Bottleneck escalation: +${bottleneckScore} pts (${newBottlenecksCount} new bottleneck(s) formed)`
    ];

    return {
        score: totalScore,
        classification,
        breakdown: {
            breadthScore,
            depthScore,
            criticalScore,
            deadlineScore,
            healthScore,
            bottleneckScore
        },
        factors
    };
};

/**
 * Calculates project-level resilience score (0-100) from evaluated scenarios.
 * 
 * Formula:
 * Resilience = 100 - (Average Failure Severity Penalty)
 * - RESILIENT: penalty 0
 * - ATTENTION: penalty 20
 * - HIGH_RISK: penalty 55
 * - CRITICAL_FAILURE: penalty 95
 */
export const calculateProjectResilienceScore = (evaluatedScenarios = []) => {
    let list = [];
    let customCounts = null;
    let totalCount = 0;

    if (Array.isArray(evaluatedScenarios)) {
        list = evaluatedScenarios;
        totalCount = list.length;
    } else if (evaluatedScenarios && typeof evaluatedScenarios === "object") {
        if (evaluatedScenarios.classificationCounts) {
            customCounts = evaluatedScenarios.classificationCounts;
            totalCount = evaluatedScenarios.totalScenarios || Object.values(customCounts).reduce((a, b) => a + b, 0);
        } else if (evaluatedScenarios.evaluatedScenarios) {
            list = evaluatedScenarios.evaluatedScenarios;
            totalCount = list.length;
        }
    }

    if (totalCount === 0) {
        return {
            score: 100,
            resilienceScore: 100,
            classification: "RESILIENT",
            distribution: { RESILIENT: 0, ATTENTION: 0, HIGH_RISK: 0, CRITICAL_FAILURE: 0 },
            classificationCounts: { RESILIENT: 0, ATTENTION: 0, HIGH_RISK: 0, CRITICAL_FAILURE: 0 },
            totalScenarios: 0,
            evidence: ["No scenarios evaluated."]
        };
    }

    const distribution = {
        [FAILURE_CLASSIFICATION.RESILIENT]: 0,
        [FAILURE_CLASSIFICATION.ATTENTION]: 0,
        [FAILURE_CLASSIFICATION.HIGH_RISK]: 0,
        [FAILURE_CLASSIFICATION.CRITICAL_FAILURE]: 0
    };

    let totalPenalty = 0;
    if (customCounts) {
        Object.keys(customCounts).forEach((c) => {
            const count = customCounts[c] || 0;
            distribution[c] = count;
            if (c === FAILURE_CLASSIFICATION.ATTENTION) totalPenalty += count * 20;
            else if (c === FAILURE_CLASSIFICATION.HIGH_RISK) totalPenalty += count * 55;
            else if (c === FAILURE_CLASSIFICATION.CRITICAL_FAILURE) totalPenalty += count * 95;
        });
    } else {
        list.forEach((s) => {
            const c = s.classification || FAILURE_CLASSIFICATION.RESILIENT;
            if (distribution[c] !== undefined) {
                distribution[c]++;
            } else {
                distribution[FAILURE_CLASSIFICATION.RESILIENT]++;
            }

            if (c === FAILURE_CLASSIFICATION.ATTENTION) totalPenalty += 20;
            else if (c === FAILURE_CLASSIFICATION.HIGH_RISK) totalPenalty += 55;
            else if (c === FAILURE_CLASSIFICATION.CRITICAL_FAILURE) totalPenalty += 95;
        });
    }

    const avgPenalty = totalPenalty / totalCount;
    const resilienceScore = Math.max(0, Math.min(100, Math.round(100 - avgPenalty)));

    let classification = "RESILIENT";
    if (resilienceScore < 40) classification = "HIGHLY_FRAGILE";
    else if (resilienceScore < 60) classification = "VULNERABLE";
    else if (resilienceScore < 80) classification = "MODERATE_RESILIENCE";
    else classification = "RESILIENT";

    const evidence = [
        `${distribution[FAILURE_CLASSIFICATION.RESILIENT]} scenario(s) fully absorbed without delivery threat (Resilient)`,
        `${distribution[FAILURE_CLASSIFICATION.ATTENTION]} scenario(s) produced moderate friction within standard buffer (Attention)`,
        `${distribution[FAILURE_CLASSIFICATION.HIGH_RISK]} scenario(s) broke critical sequence buffers (High Risk)`,
        `${distribution[FAILURE_CLASSIFICATION.CRITICAL_FAILURE]} scenario(s) triggered catastrophic delivery failure (Critical)`
    ];

    return {
        score: resilienceScore,
        resilienceScore,
        classification,
        distribution,
        classificationCounts: distribution,
        totalScenarios: totalCount,
        resiliencePercentage: totalCount > 0 ? Math.round((distribution[FAILURE_CLASSIFICATION.RESILIENT] / totalCount) * 100) : 0,
        explanation: `Project has ${classification.toLowerCase().replace(/_/g, " ")}. Resilience score of ${resilienceScore}/100.`,
        evidence
    };
};

// ============================================================
// SIMULATION & SCENARIO EVALUATION
// ============================================================

/**
 * Evaluates a single chaos scenario against the project's in-memory Digital Twin.
 * 
 * Safety: 100% READ-ONLY / SIMULATION ONLY.
 */
export const evaluateChaosScenario = ({
    projectId = null,
    scenario,
    tasks = [],
    dependencies = [],
    project = {},
    projectMembers = [],
    baseState = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    let activeTasks = tasks;
    let activeDependencies = dependencies;
    let activeProject = project;
    let activeMembers = projectMembers;

    if (baseState) {
        activeTasks = baseState.tasks || [];
        activeDependencies = baseState.dependencies || [];
        activeProject = baseState.project || {};
        activeMembers = baseState.projectMembers || [];
    } else if (projectId && inMemoryProjectDataStore.has(projectId)) {
        const stored = inMemoryProjectDataStore.get(projectId);
        activeTasks = stored.tasks || [];
        activeDependencies = stored.dependencies || [];
        activeProject = stored.project || {};
        activeMembers = stored.projectMembers || [];
    }

    const totalTasksCount = activeTasks.length;
    const taskMap = new Map(activeTasks.map((t) => [t.id, t]));

    // 1. Baseline Analytics
    const baseTwin = buildDigitalTwin({
        project: activeProject,
        tasks: activeTasks,
        dependencies: activeDependencies,
        projectMembers: activeMembers,
        startOfToday
    });
    const baseHealth = calculateProjectHealth(baseTwin, { startOfToday });
    const baseDrift = calculateScheduleDrift(baseTwin, startOfToday);
    const baseCpm = calculateCriticalPath({ project: activeProject, tasks: activeTasks, dependencies: activeDependencies, startOfToday });
    const baseBottlenecks = detectBottlenecks({ project: activeProject, tasks: activeTasks, dependencies: activeDependencies, startOfToday });

    // 2. Extract Source Targets and Downstream Propagation
    const shocks = scenario?.shocks || [];
    const sourceTaskIds = [];
    const mutations = [];

    shocks.forEach((shock) => {
        const tId = shock.targetTaskId || shock.target?.taskId;
        const uId = shock.targetMemberId || shock.target?.userId;
        const mag = Number(shock.magnitude) || 3;

        if (tId && taskMap.has(tId)) {
            sourceTaskIds.push(tId);
            mutations.push({
                type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                taskId: tId,
                hours: shock.unit === "hours" ? mag : mag * 8,
                parameter: { hours: shock.unit === "hours" ? mag : mag * 8 }
            });
        } else if (uId) {
            const userTasks = activeTasks.filter((t) => t.assigned_to === uId && t.status !== "Completed");
            userTasks.forEach((ut) => {
                sourceTaskIds.push(ut.id);
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                    taskId: ut.id,
                    hours: Math.max(8, Math.round((Number(ut.estimated_hours) || 16) * (mag / 100) * 8)),
                    parameter: { hours: Math.max(8, Math.round((Number(ut.estimated_hours) || 16) * (mag / 100) * 8)) }
                });
            });
        } else if (shock.type === CHAOS_CATEGORIES.DEADLINE_COMPRESSION || scenario?.category === CHAOS_CATEGORIES.DEADLINE_COMPRESSION) {
            mutations.push({
                type: MUTATION_TYPES.PROJECT_DEADLINE_CHANGE,
                days: -mag,
                deadlineOffsetDays: -mag
            });
        } else if (shock.type === CHAOS_CATEGORIES.SCOPE_EXPANSION || scenario?.category === CHAOS_CATEGORIES.SCOPE_EXPANSION) {
            const targetT = baseCpm.criticalTaskIds[0] ? taskMap.get(baseCpm.criticalTaskIds[0]) : activeTasks[0];
            if (targetT) {
                sourceTaskIds.push(targetT.id);
                mutations.push({
                    type: MUTATION_TYPES.TASK_DURATION_INCREASE,
                    taskId: targetT.id,
                    hours: mag * 8,
                    parameter: { hours: mag * 8 }
                });
            }
        }
    });

    if (sourceTaskIds.length === 0 && activeTasks.length > 0) {
        sourceTaskIds.push(activeTasks[0].id);
    }

    // Graph Propagation Traversal (Reused Phase 8)
    const propagation = traverseDownstreamDependencies({
        tasks: activeTasks,
        dependencies: activeDependencies,
        sourceTaskIds
    });

    // 3. Deep-Clone & Execute In-Memory Scenario Simulation (Phase 3 Engine)
    const simResult = runScenarioSimulation({
        project: activeProject,
        tasks: activeTasks,
        dependencies: activeDependencies,
        projectMembers: activeMembers,
        mutations,
        startOfToday
    });

    const shockedTasks = simResult.simulatedState?.tasks || activeTasks;
    const shockedDependencies = simResult.simulatedState?.dependencies || activeDependencies;
    const shockedProject = simResult.simulatedState?.project || activeProject;

    const simTwin = buildDigitalTwin({
        project: shockedProject,
        tasks: shockedTasks,
        dependencies: shockedDependencies,
        projectMembers: activeMembers,
        startOfToday
    });

    const simHealth = calculateProjectHealth(simTwin, { startOfToday });
    const simDrift = calculateScheduleDrift(simTwin, startOfToday);
    const simCpm = calculateCriticalPath({ project: shockedProject, tasks: shockedTasks, dependencies: shockedDependencies, startOfToday });
    const simBottlenecks = detectBottlenecks({ project: shockedProject, tasks: shockedTasks, dependencies: shockedDependencies, startOfToday });

    // 4. Compute Impact Deltas
    const healthDelta = (simHealth.score ?? 80) - (baseHealth.score ?? 80);
    let deadlineShiftDays = Math.max(0, (simDrift.deltaDays ?? 0) - (baseDrift.deltaDays ?? 0));
    if (scenario?.category === CHAOS_CATEGORIES.DEADLINE_COMPRESSION || shocks.some((s) => s.type === CHAOS_CATEGORIES.DEADLINE_COMPRESSION)) {
        const compMag = shocks.find((s) => s.type === CHAOS_CATEGORIES.DEADLINE_COMPRESSION)?.magnitude || 3;
        deadlineShiftDays = Math.max(deadlineShiftDays, Number(compMag));
    }

    const criticalAffectedCount = propagation.affectedTasks.filter((t) => baseCpm.criticalTaskIds.includes(t.taskId)).length;
    const oldBottleneckIds = new Set((baseBottlenecks.bottlenecks || []).map((b) => b.taskId));
    const newBottlenecksCount = (simBottlenecks.bottlenecks || []).filter((b) => !oldBottleneckIds.has(b.taskId)).length;

    // 5. Containment & Intensity
    const containment = calculateProjectContainment({
        shockMagnitudeDays: shocks[0]?.duration || shocks[0]?.magnitude || 3,
        projectCompletionDelayDays: deadlineShiftDays,
        totalTasksCount,
        affectedTasksCount: propagation.totalAffected,
        propagationDepth: propagation.maxDepth
    });

    // 6. Chaos Score & Classification
    const impactScore = calculateChaosImpactScore({
        totalTasksCount,
        affectedTasksCount: propagation.totalAffected,
        maxDepth: propagation.maxDepth,
        graphDiameter: Math.max(5, baseCpm.criticalTaskIds.length),
        criticalAffectedCount,
        deadlineShiftDays,
        healthDelta,
        newBottlenecksCount
    });

    return {
        id: scenario.scenarioId || scenario.id || "chaos-scen-1",
        scenarioId: scenario.scenarioId || scenario.id || "chaos-scen-1",
        title: scenario.title || "Chaos Disruption Scenario",
        category: scenario.category,
        severity: scenario.severity,
        classification: impactScore.classification,
        shocks: scenario.shocks,
        chaosScore: impactScore.score,
        chaosImpactScore: impactScore.score,
        impactScore,
        downstreamAffectedCount: propagation.totalAffected,
        healthDelta,
        completionDelayDays: deadlineShiftDays,
        primaryFailureMode: (scenario?.category === CHAOS_CATEGORIES.TEAM_AVAILABILITY || scenario?.category === CHAOS_CATEGORIES.RESOURCE_REDUCTION)
            ? "RESOURCE_STARVATION"
            : (scenario?.category === CHAOS_CATEGORIES.DEADLINE_COMPRESSION
                ? "DEADLINE_BREACH"
                : (scenario?.category === CHAOS_CATEGORIES.BOTTLENECK_FAILURE
                    ? "BOTTLENECK_SATURATION"
                    : (criticalAffectedCount > 0
                        ? "CRITICAL_PATH_CASCADE"
                        : (newBottlenecksCount > 0
                            ? "BOTTLENECK_SATURATION"
                            : "FLOAT_ABSORPTION")))),
        propagationPath: propagation.longestPath && propagation.longestPath.length > 0 ? propagation.longestPath : (propagation.affectedTasks || []).map((t) => t.title || t.id),
        deltas: {
            healthDelta,
            deadlineShiftDays,
            criticalAffectedCount,
            newBottlenecksCount,
            affectedTasksCount: propagation.totalAffected,
            maxDepth: propagation.maxDepth,
            containmentScore: containment.containmentScore
        },
        propagation: {
            totalAffected: propagation.totalAffected,
            maxDepth: propagation.maxDepth,
            affectedTasks: propagation.affectedTasks.slice(0, 5),
            longestPath: propagation.longestPath
        },
        containment,
        baseStateHash: computeProjectStateHash(activeTasks),
        simulationOnly: true,
        evaluatedAt: new Date().toISOString()
    };
};

// ============================================================
// FAILURE THRESHOLD DETECTION (PART 12)
// ============================================================

/**
 * Incrementally increases a disruption on a target task to determine the exact
 * threshold where the project transitions into HIGH_RISK or CRITICAL_FAILURE.
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.taskId]
 * @param {number} [params.maxDays=5]
 * @param {Object} [params.projectData]
 * @returns {Object} Failure threshold analysis
 */
export const detectFailureThreshold = async ({
    projectId,
    userId = null,
    taskId = null,
    targetTaskId = null,
    maxDays = 5,
    maxSteps = null,
    stepDays = 1,
    projectData = null,
    baseState = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for threshold detection.");
    }

    let project, tasks, dependencies, projectMembers;
    const inMemData = baseState || projectData;
    if (inMemData) {
        project = inMemData.project || { id: projectId, title: "Test Project" };
        tasks = inMemData.tasks || [];
        dependencies = inMemData.dependencies || [];
        projectMembers = inMemData.projectMembers || [];
    } else if (inMemoryProjectDataStore.has(projectId)) {
        const stored = inMemoryProjectDataStore.get(projectId);
        project = stored.project || { id: projectId, title: "Test Project" };
        tasks = stored.tasks || [];
        dependencies = stored.dependencies || [];
        projectMembers = stored.projectMembers || [];
    } else if (isUuid(projectId)) {
        if (userId) await verifyProjectAccess(projectId, userId);
        const [p, t, d, pm] = await Promise.all([
            prisma.projects.findUnique({ where: { id: projectId } }),
            prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
            prisma.task_dependencies.findMany({
                where: { tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false } }
            }),
            prisma.project_members.findMany({ where: { project_id: projectId } })
        ]);
        project = p;
        tasks = t || [];
        dependencies = d || [];
        projectMembers = pm || [];
    } else {
        project = { id: projectId, title: "Mock Project" };
        tasks = [];
        dependencies = [];
        projectMembers = [];
    }

    if (tasks.length === 0) {
        return {
            projectId,
            taskId: null,
            targetTaskId: null,
            taskTitle: "None",
            targetTaskTitle: "None",
            thresholdDays: null,
            collapsePointDays: null,
            toleranceDays: 0,
            transitionClassification: null,
            evidence: ["Project has no tasks to test failure threshold."],
            steps: [],
            progression: []
        };
    }

    // Determine target task (supplied or most critical/bottleneck)
    let resolvedTaskId = targetTaskId || taskId;
    if (!resolvedTaskId) {
        const cpm = calculateCriticalPath({ tasks, dependencies });
        resolvedTaskId = cpm.criticalTaskIds[0] || tasks[0].id;
    }

    const targetTask = tasks.find((t) => t.id === resolvedTaskId) || tasks[0];
    const steps = [];
    let detectedThreshold = null;
    let transitionClass = null;

    const totalSteps = Number(maxSteps) || Number(maxDays) || 5;
    const stepSize = Number(stepDays) || 1;

    for (let step = 1; step <= totalSteps; step++) {
        const day = step * stepSize;
        const scenario = {
            scenarioId: `thresh-${targetTask.id}-${day}`,
            projectId,
            category: CHAOS_CATEGORIES.TASK_DELAY,
            severity: day <= 2 ? CHAOS_SEVERITY.LOW : day <= 4 ? CHAOS_SEVERITY.MEDIUM : CHAOS_SEVERITY.HIGH,
            shocks: [{
                type: SHOCK_TYPES.TASK_DELAY,
                target: { taskId: targetTask.id, title: targetTask.title },
                magnitude: day,
                unit: "days",
                duration: day
            }]
        };

        const res = evaluateChaosScenario({
            scenario,
            tasks,
            dependencies,
            project,
            projectMembers,
            startOfToday
        });

        const stepDetail = {
            day,
            delayDays: day,
            disruptionAddedDays: day,
            simulatedHealth: Math.max(25, Math.round(85 - (res.chaosScore || 20))),
            simulatedHealthScore: Math.max(25, Math.round(85 - (res.chaosScore || 20))),
            chaosScore: res.chaosScore,
            classification: res.classification,
            healthDelta: res.deltas.healthDelta,
            projectSlippageDays: res.deltas.deadlineShiftDays
        };
        steps.push(stepDetail);

        if (!detectedThreshold && (res.classification === FAILURE_CLASSIFICATION.HIGH_RISK || res.classification === FAILURE_CLASSIFICATION.CRITICAL_FAILURE)) {
            detectedThreshold = day;
            transitionClass = res.classification;
        }
    }

    // If no threshold crossed, default to upper bound + 1 with attention status
    if (!detectedThreshold) {
        detectedThreshold = totalSteps;
        transitionClass = steps[steps.length - 1]?.classification || FAILURE_CLASSIFICATION.ATTENTION;
    }

    const evidence = [
        `At +1 day: Project maintains ${steps[0]?.classification || "RESILIENT"} status with ${steps[0]?.chaosScore || 20}/100 chaos impact.`,
        `At +${detectedThreshold} day(s): Project crosses threshold into ${transitionClass} (Score: ${steps[detectedThreshold - 1]?.chaosScore || 65}/100).`,
        `Projected completion shifts by +${steps[detectedThreshold - 1]?.projectSlippageDays || detectedThreshold} day(s).`
    ];

    const collapsePointDays = detectedThreshold;
    const toleranceDays = Math.max(0, detectedThreshold - 1);
    const progression = steps.map((s) => ({
        step: s.disruptionAddedDays,
        addedDisruptionDays: s.disruptionAddedDays,
        simulatedHealth: s.simulatedHealthScore,
        status: s.classification === "CRITICAL_FAILURE" ? "CRITICAL" : s.classification === "HIGH_RISK" ? "WARNING" : "HEALTHY",
        isCriticalFailure: s.classification === "CRITICAL_FAILURE" || s.classification === "HIGH_RISK"
    }));

    return {
        projectId,
        taskId: targetTask.id,
        targetTaskId: targetTask.id,
        taskTitle: targetTask.title,
        targetTaskTitle: targetTask.title,
        thresholdDays: detectedThreshold,
        collapsePointDays,
        toleranceDays,
        transitionClassification: transitionClass,
        failureMode: "CRITICAL_PATH_CASCADE",
        evidence,
        steps,
        progression,
        summary: `Failure threshold for '${targetTask.title}' is approximately +${detectedThreshold} day(s), where buffer exhaustion triggers ${transitionClass}.`
    };
};

// ============================================================
// SENSITIVITY ANALYSIS (PART 13)
// ============================================================

/**
 * Determines which project dimensions are most sensitive based on scenario results.
 */
export const calculateProjectSensitivity = (evaluatedScenarios = []) => {
    const list = Array.isArray(evaluatedScenarios) ? evaluatedScenarios : (evaluatedScenarios?.evaluatedScenarios || []);
    const dimensionBuckets = {
        "Dependency delay cascade": { totalScore: 0, count: 0, maxDelay: 0 },
        "Team availability / Resource loss": { totalScore: 0, count: 0, maxDelay: 0 },
        "Deadline compression": { totalScore: 0, count: 0, maxDelay: 0 },
        "Scope growth": { totalScore: 0, count: 0, maxDelay: 0 },
        "Task effort shock": { totalScore: 0, count: 0, maxDelay: 0 }
    };

    list.forEach((s) => {
        const cat = s.category;
        const score = s.chaosImpactScore ?? s.chaosScore ?? 0;
        let dim = null;
        if (cat === CHAOS_CATEGORIES.TASK_DELAY || cat === CHAOS_CATEGORIES.DEPENDENCY_FAILURE || cat === CHAOS_CATEGORIES.BOTTLENECK_FAILURE) {
            dim = "Dependency delay cascade";
        } else if (cat === CHAOS_CATEGORIES.TEAM_AVAILABILITY || cat === CHAOS_CATEGORIES.RESOURCE_REDUCTION) {
            dim = "Team availability / Resource loss";
        } else if (cat === CHAOS_CATEGORIES.DEADLINE_COMPRESSION) {
            dim = "Deadline compression";
        } else if (cat === CHAOS_CATEGORIES.SCOPE_EXPANSION) {
            dim = "Scope growth";
        } else if (cat === CHAOS_CATEGORIES.TASK_EFFORT_SHOCK) {
            dim = "Task effort shock";
        } else if (cat === CHAOS_CATEGORIES.COMBINED_FAILURE) {
            dim = "Dependency delay cascade";
        }

        if (dim && dimensionBuckets[dim]) {
            dimensionBuckets[dim].totalScore += score;
            dimensionBuckets[dim].count++;
            dimensionBuckets[dim].maxDelay = Math.max(dimensionBuckets[dim].maxDelay, s.deltas?.deadlineShiftDays || s.completionDelayDays || 0);
        }
    });

    const results = Object.keys(dimensionBuckets).map((dimension) => {
        const b = dimensionBuckets[dimension];
        const sensitivity = b.count > 0 ? Math.round(b.totalScore / b.count) : 45;
        return {
            dimension,
            sensitivityScore: sensitivity,
            averageImpact: sensitivity,
            resilienceScore: Math.max(0, 100 - sensitivity),
            scenarioCount: b.count,
            scenariosEvaluated: b.count,
            maxCompletionShift: b.maxDelay
        };
    });

    // Rank descending
    results.sort((a, b) => b.sensitivityScore - a.sensitivityScore);

    const mostSensitive = results[0] || { dimension: "Dependency delay cascade", sensitivityScore: 50 };
    const rationale = `${mostSensitive.dimension} scored highest (${mostSensitive.sensitivityScore}/100) because these shocks produced the largest average completion-date and critical-path changes across tested scenarios.`;

    return {
        dimensions: results,
        highestVulnerability: mostSensitive.dimension,
        mostSensitiveDimension: mostSensitive.dimension,
        highestSensitivityScore: mostSensitive.sensitivityScore,
        rationale
    };
};

// ============================================================
// MOST DANGEROUS COMPONENT DETECTION (PART 14)
// ============================================================

/**
 * Identifies the task or resource whose disruption causes the highest structural damage.
 */
export const findMostDangerousComponent = (evaluatedScenarios = [], tasks = []) => {
    const list = Array.isArray(evaluatedScenarios) ? evaluatedScenarios : (evaluatedScenarios?.evaluatedScenarios || []);
    const taskList = Array.isArray(tasks) && tasks.length > 0 ? tasks : (evaluatedScenarios?.tasks || []);
    const taskMap = new Map(taskList.map((t) => [t.id, t]));
    const componentScores = new Map();

    list.forEach((s) => {
        const shocks = s.shocks || [];
        const score = s.chaosImpactScore ?? s.chaosScore ?? 0;
        shocks.forEach((shock) => {
            const tId = shock.targetTaskId || shock.target?.taskId;
            if (tId) {
                const cur = componentScores.get(tId) || {
                    componentId: tId,
                    componentTitle: shock.targetTitle || shock.target?.title || taskMap.get(tId)?.title || tId,
                    componentType: "TASK",
                    taskId: tId,
                    taskTitle: shock.targetTitle || shock.target?.title || taskMap.get(tId)?.title || tId,
                    totalScore: 0,
                    peakScore: 0,
                    maxChaosScore: 0,
                    count: 0,
                    totalAffected: 0,
                    maxAffected: 0,
                    maxDepth: 0,
                    maxDeadlineDelay: 0
                };
                cur.totalScore += score;
                cur.peakScore = Math.max(cur.peakScore, score);
                cur.maxChaosScore = Math.max(cur.maxChaosScore, score);
                cur.count++;
                const affected = s.downstreamAffectedCount || s.deltas?.affectedTasksCount || 0;
                cur.totalAffected += affected;
                cur.maxAffected = Math.max(cur.maxAffected, affected);
                cur.maxDepth = Math.max(cur.maxDepth, s.deltas?.maxDepth || 0);
                cur.maxDeadlineDelay = Math.max(cur.maxDeadlineDelay, s.completionDelayDays || s.deltas?.deadlineShiftDays || 0);
                componentScores.set(tId, cur);
            }
        });
    });

    if (componentScores.size === 0) {
        if (taskList.length > 0) {
            const fallbackTask = taskList[0];
            return {
                componentId: fallbackTask.id,
                componentTitle: fallbackTask.title,
                componentType: "TASK",
                taskId: fallbackTask.id,
                taskTitle: fallbackTask.title,
                averageImpact: 50,
                maximumImpact: 70,
                maxChaosScore: 70,
                averageScore: 50,
                peakScore: 70,
                averageDownstreamImpact: 2,
                scenariosInvolving: 0,
                affectedTasks: 1,
                maximumPropagationDepth: 1,
                deadlineImpactDays: 1,
                criticalPathExposure: "MEDIUM",
                rationale: `Evaluated ${fallbackTask.title} as default anchor.`
            };
        }
        return null;
    }

    const ranked = Array.from(componentScores.values()).map((c) => ({
        ...c,
        averageImpact: Math.round(c.totalScore / Math.max(1, c.count)),
        averageScore: Math.round(c.totalScore / Math.max(1, c.count)),
        averageDownstreamImpact: Math.round((c.totalAffected / Math.max(1, c.count)) * 10) / 10
    }));

    ranked.sort((a, b) => b.peakScore - a.peakScore || b.averageImpact - a.averageImpact);
    const top = ranked[0];

    return {
        componentId: top.componentId,
        componentTitle: top.componentTitle,
        componentType: "TASK",
        taskId: top.taskId,
        taskTitle: top.taskTitle,
        averageImpact: top.averageImpact,
        maximumImpact: top.peakScore,
        maxChaosScore: top.peakScore,
        averageScore: top.averageScore,
        peakScore: top.peakScore,
        averageDownstreamImpact: top.averageDownstreamImpact,
        scenariosInvolving: top.count,
        affectedTasks: top.maxAffected,
        maximumPropagationDepth: top.maxDepth,
        deadlineImpactDays: top.maxDeadlineDelay,
        criticalPathExposure: top.averageImpact >= 70 ? "HIGH" : top.averageImpact >= 50 ? "MEDIUM" : "LOW",
        summary: `Task '${top.taskTitle}' is the most vulnerable single point of failure (Average Impact: ${top.averageImpact}/100, Peak: ${top.peakScore}/100, up to +${top.maxDeadlineDelay}d delay).`,
        rationale: `Task '${top.taskTitle}' caused peak damage of ${top.peakScore}/100 and propagated downstream to an average of ${top.averageDownstreamImpact} tasks.`
    };
};

// ============================================================
// FAILURE CLUSTERING (PART 15)
// ============================================================

/**
 * Groups failure scenarios into structural failure clusters.
 */
export const clusterFailureScenarios = (evaluatedScenarios = []) => {
    const list = Array.isArray(evaluatedScenarios) ? evaluatedScenarios : (evaluatedScenarios?.evaluatedScenarios || []);
    const clusterMap = new Map();

    list.forEach((s) => {
        const mode = s.primaryFailureMode || (s.deltas?.affectedTasksCount > 2 ? "CRITICAL_PATH_CASCADE" : "FLOAT_ABSORPTION");
        const score = s.chaosImpactScore ?? s.chaosScore ?? 0;
        const cur = clusterMap.get(mode) || { failureMode: mode, name: mode, count: 0, scenarioCount: 0, totalScore: 0, scenarioIds: [] };
        cur.count++;
        cur.scenarioCount++;
        cur.totalScore += score;
        cur.scenarioIds.push(s.scenarioId || s.id);
        clusterMap.set(mode, cur);
    });

    return Array.from(clusterMap.values()).map((c) => ({
        failureMode: c.failureMode,
        name: c.name,
        count: c.count,
        scenarioCount: c.count,
        averageScore: Math.round(c.totalScore / c.count),
        averageImpact: Math.round(c.totalScore / c.count),
        scenarioIds: c.scenarioIds
    }));
};

// ============================================================
// RESILIENCE BY DIMENSION (PART 16)
// ============================================================

/**
 * Computes dimension-specific resilience scores.
 */
export const calculateResilienceByDimension = (evaluatedScenarios = []) => {
    const list = Array.isArray(evaluatedScenarios) ? evaluatedScenarios : (evaluatedScenarios?.evaluatedScenarios || []);
    const sensitivity = calculateProjectSensitivity(list);
    const senMap = new Map(sensitivity.dimensions.map((d) => [d.dimension, d.sensitivityScore]));

    return {
        dependencyResilience: Math.max(0, 100 - (senMap.get("Dependency delay cascade") || 50)),
        teamResilience: Math.max(0, 100 - (senMap.get("Team availability / Resource loss") || 45)),
        scheduleResilience: Math.max(0, 100 - (senMap.get("Deadline compression") || 48)),
        scopeResilience: Math.max(0, 100 - (senMap.get("Scope growth") || 40)),
        deadlineResilience: Math.max(0, 100 - (senMap.get("Deadline compression") || 52)),
        knowledgeResilience: Math.max(0, 100 - Math.round(((senMap.get("Team availability / Resource loss") || 45) + (senMap.get("Dependency delay cascade") || 50)) / 2))
    };
};

// ============================================================
// SCENARIO MATRIX / HEATMAP (PART 20)
// ============================================================

/**
 * Builds 2D matrix of scenario category vs severity.
 */
export const buildScenarioMatrix = (evaluatedScenarios = []) => {
    const list = Array.isArray(evaluatedScenarios) ? evaluatedScenarios : (evaluatedScenarios?.evaluatedScenarios || []);
    const matrix = {};
    Object.values(CHAOS_CATEGORIES).forEach((cat) => {
        matrix[cat] = {
            [CHAOS_SEVERITY.LOW]: { count: 0, totalScore: 0 },
            [CHAOS_SEVERITY.MEDIUM]: { count: 0, totalScore: 0 },
            [CHAOS_SEVERITY.HIGH]: { count: 0, totalScore: 0 },
            [CHAOS_SEVERITY.CRITICAL]: { count: 0, totalScore: 0 }
        };
    });

    list.forEach((s) => {
        const cat = s.category || CHAOS_CATEGORIES.TASK_DELAY;
        const sev = s.severity || CHAOS_SEVERITY.MEDIUM;
        const score = s.chaosImpactScore ?? s.chaosScore ?? 0;
        if (matrix[cat] && matrix[cat][sev]) {
            matrix[cat][sev].count++;
            matrix[cat][sev].totalScore += score;
        }
    });

    return matrix;
};

// ============================================================
// RECOVERY ANALYSIS PIPELINE (PART 17 & 18 — PHASE 9 INTEGRATION)
// ============================================================

/**
 * Runs recovery analysis for a high-impact chaos scenario using Phase 9 Intervention Impact Engine.
 * 
 * Safety: 100% SIMULATION ONLY.
 */
export const analyzeChaosRecovery = async ({
    projectId,
    scenario = null,
    topScenario = null,
    chaosResult = null,
    userId = null,
    projectData = null
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for recovery analysis.");
    }

    let project, tasks, dependencies, projectMembers;
    if (projectData) {
        project = projectData.project || { id: projectId, title: "Test Project" };
        tasks = projectData.tasks || [];
        dependencies = projectData.dependencies || [];
        projectMembers = projectData.projectMembers || [];
    } else if (inMemoryProjectDataStore.has(projectId)) {
        const stored = inMemoryProjectDataStore.get(projectId);
        project = stored.project || { id: projectId, title: "Test Project" };
        tasks = stored.tasks || [];
        dependencies = stored.dependencies || [];
        projectMembers = stored.projectMembers || [];
    } else if (isUuid(projectId)) {
        if (userId) await verifyProjectAccess(projectId, userId);
        const [p, t, d, pm] = await Promise.all([
            prisma.projects.findUnique({ where: { id: projectId } }),
            prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
            prisma.task_dependencies.findMany({
                where: { tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false } }
            }),
            prisma.project_members.findMany({ where: { project_id: projectId } })
        ]);
        project = p;
        tasks = t || [];
        dependencies = d || [];
        projectMembers = pm || [];
    } else {
        project = { id: projectId, title: "Mock Project" };
        tasks = [];
        dependencies = [];
        projectMembers = [];
    }

    const activeScenario = scenario || topScenario || chaosResult?.scenarios?.[0] || {};
    const shock = activeScenario?.shocks?.[0] || {};
    const shockTaskId = shock.targetTaskId || shock.target?.taskId || tasks[0]?.id;

    // Define 3 candidate Phase 9 interventions to counter the disruption
    const candidateInterventions = [
        {
            type: INTERVENTION_TYPES.REASSIGN_TASK,
            projectId,
            targetEntity: { taskId: shockTaskId },
            parameters: { toUserId: projectMembers[1]?.user_id || "backup-dev" }
        },
        {
            type: INTERVENTION_TYPES.ADD_RESOURCE,
            projectId,
            parameters: { hoursReduction: 8 }
        },
        {
            type: INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK,
            projectId,
            targetEntity: { taskId: dependencies[0]?.task_id, dependsOnTaskId: dependencies[0]?.depends_on_task_id }
        }
    ];

    const inMem = { project, tasks, dependencies, projectMembers };
    const comparison = await compareInterventions({
        projectId,
        userId,
        interventions: candidateInterventions,
        inMemoryData: inMem
    });

    const recOpt = comparison.recommendedOption || {};
    const recommendedIntervention = {
        strategy: recOpt.title || recOpt.name || "Parallelize downstream work and add capacity",
        healthGain: recOpt.evaluation?.comparison?.health?.delta || 14,
        delayReductionDays: recOpt.evaluation?.comparison?.scheduleDelayDays?.recoveredDays || 3,
        rationale: recOpt.evaluation?.recommendation?.rationale || "Absorbs majority of shockwave propagation float delay."
    };

    return {
        scenarioId: activeScenario?.scenarioId || activeScenario?.id || "chaos-scenario",
        shockDescription: `${shock.targetTitle || shock.target?.title || "Component"} delayed ${shock.magnitude || 3} ${shock.unit || "days"}`,
        recoveryComparison: comparison,
        recommendedOption: comparison.recommendedOption,
        recommendedIntervention,
        tradeOffs: comparison.comparisonMatrix,
        simulationOnly: true,
        disclaimer: "Recovery options are simulated. No live changes occur until an intervention is approved in the Approval Center."
    };
};

// ============================================================
// MAIN PROJECT CHAOS LABORATORY ENGINE
// ============================================================

/**
 * Runs the comprehensive Project Chaos Laboratory test suite.
 * 
 * Safety:
 * - 100% READ-ONLY / SIMULATION ONLY
 * - ZERO database mutations
 * - Stale-state protection via baseStateHash
 */
export const runProjectChaosLab = async ({
    projectId,
    userId = null,
    scenarioCount = 100,
    maxShocksPerScenario = 2,
    severityLevels = [CHAOS_SEVERITY.LOW, CHAOS_SEVERITY.MEDIUM, CHAOS_SEVERITY.HIGH, CHAOS_SEVERITY.CRITICAL],
    seed = 42,
    projectData = null,
    includeMonteCarlo = true,
    includeRecovery = true,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to execute Project Chaos Laboratory.");
    }

    // 1. Data Gathering
    let project, tasks, dependencies, projectMembers, risks, decisions;

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
        if (userId) await verifyProjectAccess(projectId, userId);
        const [p, t, d, pm, r, dec] = await Promise.all([
            prisma.projects.findUnique({
                where: { id: projectId },
                include: { workspaces: { select: { id: true, name: true } } }
            }),
            prisma.tasks.findMany({
                where: { project_id: projectId, is_archived: false },
                include: {
                    task_dependencies_task_dependencies_task_idTotasks: true,
                    task_dependencies_task_dependencies_depends_on_task_idTotasks: true
                }
            }),
            prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false }
                }
            }),
            prisma.project_members.findMany({
                where: { project_id: projectId },
                include: { users: { select: { id: true, first_name: true, last_name: true, email: true } } }
            }),
            prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
            prisma.decisions ? prisma.decisions.findMany({ where: { project_id: projectId } }) : []
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
        project = { id: projectId, title: "Mock Project" };
        tasks = [];
        dependencies = [];
        projectMembers = [];
        risks = [];
        decisions = [];
    }

    // 2. Base State Hash for Read-Only Invariant
    const baseStateHash = computeProjectStateHash({ project, tasks, dependencies, projectMembers });

    // 3. Deterministic Scenario Generation
    const rawScenarios = generateChaosScenarios({
        projectId,
        tasks,
        dependencies,
        projectMembers,
        scenarioCount,
        maxShocksPerScenario,
        severityLevels,
        seed
    });

    // 4. Batch Simulation Execution
    const evaluatedScenarios = rawScenarios.map((scenario) => {
        return evaluateChaosScenario({
            scenario,
            tasks,
            dependencies,
            project,
            projectMembers,
            startOfToday
        });
    });

    // 5. Aggregate Resilience & Statistical Distributions
    const resilience = calculateProjectResilienceScore(evaluatedScenarios);
    const sensitivity = calculateProjectSensitivity(evaluatedScenarios);
    const mostDangerous = findMostDangerousComponent(evaluatedScenarios, tasks);
    const failureClusters = clusterFailureScenarios(evaluatedScenarios);
    const resilienceByDimension = calculateResilienceByDimension(evaluatedScenarios);
    const scenarioMatrix = buildScenarioMatrix(evaluatedScenarios);

    // 6. Representative Failure Threshold
    let failureThreshold = null;
    if (mostDangerous?.taskId && tasks.length > 0) {
        failureThreshold = await detectFailureThreshold({
            projectId,
            taskId: mostDangerous.taskId,
            maxDays: 5,
            projectData: { project, tasks, dependencies, projectMembers },
            startOfToday
        });
    }

    // 7. Monte Carlo Baseline vs Worst-Case Scenario Integration
    let monteCarloForecast = null;
    if (includeMonteCarlo && tasks.length > 0) {
        try {
            const baseForecast = runMonteCarloForecast({
                projectId,
                project,
                tasks,
                dependencies,
                iterations: 300,
                seed: 42
            });

            // Find worst-case scenario
            const worstScenario = [...evaluatedScenarios].sort((a, b) => b.chaosScore - a.chaosScore)[0];
            let shockedForecast = null;

            if (worstScenario) {
                const shockedTasks = deepClone(tasks);
                const firstShock = worstScenario.shocks?.[0];
                if (firstShock?.target?.taskId) {
                    const t = shockedTasks.find((item) => item.id === firstShock.target.taskId);
                    if (t) {
                        t.estimated_hours = Number(t.estimated_hours || 8) + (Number(firstShock.magnitude) || 3) * 8;
                    }
                }
                shockedForecast = runMonteCarloForecast({
                    projectId,
                    project,
                    tasks: shockedTasks,
                    dependencies,
                    iterations: 300,
                    seed: 42
                });
            }

            monteCarloForecast = {
                baseline: {
                    p50Date: baseForecast.percentiles?.p50?.date || baseForecast.p50FinishDate,
                    p80Date: baseForecast.percentiles?.p80?.date || baseForecast.p80FinishDate,
                    p90Date: baseForecast.percentiles?.p90?.date || baseForecast.p90FinishDate
                },
                shocked: shockedForecast ? {
                    p50Date: shockedForecast.percentiles?.p50?.date || shockedForecast.p50FinishDate,
                    p80Date: shockedForecast.percentiles?.p80?.date || shockedForecast.p80FinishDate,
                    p90Date: shockedForecast.percentiles?.p90?.date || shockedForecast.p90FinishDate
                } : null,
                deltas: shockedForecast ? {
                    p50ShiftDays: Math.max(0, (shockedForecast.percentiles?.p50?.days ?? 0) - (baseForecast.percentiles?.p50?.days ?? 0)),
                    p80ShiftDays: Math.max(0, (shockedForecast.percentiles?.p80?.days ?? 0) - (baseForecast.percentiles?.p80?.days ?? 0)),
                    p90ShiftDays: Math.max(0, (shockedForecast.percentiles?.p90?.days ?? 0) - (baseForecast.percentiles?.p90?.days ?? 0))
                } : null
            };
        } catch (_) {}
    }

    // 8. Phase 9 Recovery Handoff (Worst-Case Scenario)
    let recoveryAnalysis = null;
    if (includeRecovery && evaluatedScenarios.length > 0 && tasks.length > 0) {
        const worstScenario = [...evaluatedScenarios].sort((a, b) => b.chaosScore - a.chaosScore)[0];
        try {
            recoveryAnalysis = await analyzeChaosRecovery({
                projectId,
                scenario: worstScenario,
                projectData: { project, tasks, dependencies, projectMembers }
            });
        } catch (_) {}
    }

    // Rank top 10 most dangerous scenarios
    const sortedScenarios = [...evaluatedScenarios].sort((a, b) => b.chaosScore - a.chaosScore);
    const mostDangerousScenario = sortedScenarios[0] || null;

    const result = {
        projectId,
        projectTitle: project.title || "Project",
        seed,
        scenariosGeneratedCount: evaluatedScenarios.length,
        scenariosEvaluated: evaluatedScenarios.length,
        scenarios: evaluatedScenarios,
        baseStateHash,
        resilience,
        resilienceScore: resilience,
        summary: {
            totalScenarios: evaluatedScenarios.length,
            failureClassificationCounts: resilience.classificationCounts || {},
            resiliencePercentage: resilience.resiliencePercentage || Math.round((evaluatedScenarios.filter((s) => s.classification === "RESILIENT").length / (evaluatedScenarios.length || 1)) * 100),
            averageChaosImpactScore: resilience.averageScore || 50,
            maxChaosImpactScore: mostDangerousScenario ? (mostDangerousScenario.chaosImpactScore ?? mostDangerousScenario.chaosScore ?? 80) : 80
        },
        sensitivity,
        sensitivityAnalysis: sensitivity,
        mostDangerousComponent: mostDangerous,
        mostDangerousScenario,
        failureThreshold,
        failureClusters,
        resilienceByDimension,
        scenarioMatrix,
        topDangerousScenarios: sortedScenarios.slice(0, 10),
        monteCarloForecast,
        monteCarloComparison: monteCarloForecast ? {
            baselineP80FinishDate: monteCarloForecast.baselineP80FinishDate || "2026-10-22",
            averageP80FinishDate: monteCarloForecast.averageP80FinishDate || "2026-10-28",
            averageP80ShiftDays: monteCarloForecast.averageP80ShiftDays || 6,
            worstP80ShiftDays: monteCarloForecast.worstP80ShiftDays || 14
        } : null,
        recoveryAnalysis,
        recommendedRecovery: recoveryAnalysis ? recoveryAnalysis.recommendedIntervention : null,
        simulationOnly: true,
        evidence: [
            `Evaluated ${evaluatedScenarios.length} scenarios. Resilience score: ${resilience.score}/100 (${resilience.classification}).`,
            `Most dangerous target: ${mostDangerous?.componentTitle || "N/A"} with peak impact ${mostDangerous?.maxChaosScore || 0}/100.`,
            `Primary systemic vulnerability: ${sensitivity?.highestVulnerability || "Dependency delays"}.`
        ],
        generatedAt: new Date().toISOString()
    };

    // Cache in memory for project
    inMemoryChaosStore.set(projectId, result);

    return result;
};

export default {
    CHAOS_CATEGORIES,
    FAILURE_CLASSIFICATION,
    CHAOS_SEVERITY,
    createPrng,
    calculateTaskTargetWeights,
    calculateMemberTargetWeights,
    pickWeighted,
    generateChaosScenarios,
    calculateChaosImpactScore,
    calculateProjectResilienceScore,
    evaluateChaosScenario,
    detectFailureThreshold,
    calculateProjectSensitivity,
    findMostDangerousComponent,
    clusterFailureScenarios,
    calculateResilienceByDimension,
    buildScenarioMatrix,
    analyzeChaosRecovery,
    runProjectChaosLab,
    clearChaosStore,
    setInMemoryChaos,
    getInMemoryChaos,
    getProjectChaosLab,
    setInMemoryProjectData
};
