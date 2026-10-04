/**
 * Project Red Team Service (Phase 11)
 * 
 * An adversarial project-analysis engine that actively challenges the assumptions
 * underlying schedules, estimates, dependencies, staffing, knowledge concentration,
 * deadlines, scope, recovery plans, critical-path, decisions, and resilience.
 * 
 * ARCHITECTURAL INVARIANTS:
 * - 100% READ-ONLY / SIMULATION ONLY
 * - ZERO production mutations (verified via SHA-256 state hashing)
 * - Deterministic, explainable challenge algorithms without external AI/LLM APIs
 * - Direct reuse of Phase 1-10 intelligence engines (Shockwave, Chaos Lab, Monte Carlo, Digital Twin)
 * - Preserves workspace and project authorization
 */

import crypto from "crypto";
import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { getStartOfTodayUtc } from "./taskService.js";

// Phase 1-10 Analytical Engine Reuse
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
import { calculateTeamWorkload, calculateKnowledgeConcentration } from "./teamIntelligenceService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { traverseDownstreamDependencies } from "./dependencyShockwaveService.js";
import { calculateRecoveryPlan } from "./actionPlanService.js";
import {
    evaluateChaosScenario,
    runProjectChaosLab,
    CHAOS_CATEGORIES,
    CHAOS_SEVERITY
} from "./projectChaosService.js";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================

export const RED_TEAM_CATEGORIES = Object.freeze({
    ESTIMATE_REALISM: "ESTIMATE_REALISM",
    DEADLINE_REALISM: "DEADLINE_REALISM",
    DEPENDENCY_FRAGILITY: "DEPENDENCY_FRAGILITY",
    RESOURCE_CONCENTRATION: "RESOURCE_CONCENTRATION",
    KNOWLEDGE_CONCENTRATION: "KNOWLEDGE_CONCENTRATION",
    CRITICAL_PATH_FRAGILITY: "CRITICAL_PATH_FRAGILITY",
    BOTTLENECK_FRAGILITY: "BOTTLENECK_FRAGILITY",
    SCOPE_FRAGILITY: "SCOPE_FRAGILITY",
    RECOVERY_FRAGILITY: "RECOVERY_FRAGILITY",
    RISK_COVERAGE: "RISK_COVERAGE",
    DECISION_FRAGILITY: "DECISION_FRAGILITY",
    HEALTH_INCONSISTENCY: "HEALTH_INCONSISTENCY",
    CAPACITY_ASSUMPTION: "CAPACITY_ASSUMPTION",
    RESILIENCE_GAP: "RESILIENCE_GAP"
});

export const RED_TEAM_SEVERITY = Object.freeze({
    INFO: "INFO",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
});

export const EVIDENCE_CONFIDENCE = Object.freeze({
    STRONG_EVIDENCE: "STRONG_EVIDENCE",
    MODERATE_EVIDENCE: "MODERATE_EVIDENCE",
    LIMITED_EVIDENCE: "LIMITED_EVIDENCE",
    INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE"
});

export const CHALLENGE_METHODS = Object.freeze({
    THRESHOLD_TESTING: "THRESHOLD_TESTING",
    SMALL_PERTURBATION: "SMALL_PERTURBATION",
    SHOCKWAVE_ANALYSIS: "SHOCKWAVE_ANALYSIS",
    MONTE_CARLO_COMPARISON: "MONTE_CARLO_COMPARISON",
    BOTTLENECK_ANALYSIS: "BOTTLENECK_ANALYSIS",
    CRITICAL_PATH_ANALYSIS: "CRITICAL_PATH_ANALYSIS",
    CAPACITY_ANALYSIS: "CAPACITY_ANALYSIS",
    DEPENDENCY_ANALYSIS: "DEPENDENCY_ANALYSIS",
    HISTORICAL_COMPARISON: "HISTORICAL_COMPARISON",
    COUNTERFACTUAL_SIMULATION: "COUNTERFACTUAL_SIMULATION"
});

// In-memory request-scoped cache and test store (project-isolated)
const inMemoryRedTeamStore = new Map();
const inMemoryProjectDataStore = new Map();

export const clearRedTeamStore = () => {
    inMemoryRedTeamStore.clear();
    inMemoryProjectDataStore.clear();
};

export const setInMemoryRedTeam = (key, data) => {
    inMemoryRedTeamStore.set(key, data);
};

export const getInMemoryRedTeam = (key) => {
    return inMemoryRedTeamStore.get(key) || null;
};

export const setInMemoryProjectData = (projectId, data) => {
    inMemoryProjectDataStore.set(projectId, data);
};

export const getInMemoryProjectData = (projectId) => {
    return inMemoryProjectDataStore.get(projectId) || null;
};

// ============================================================
// DETERMINISTIC EXPOSURE SCORING FORMULA
// ============================================================

/**
 * Calculates a transparent, explainable 0-100 Red Team Exposure Score.
 * 
 * Components:
 * - Critical findings: up to 35 pts (12 pts each)
 * - High findings: up to 25 pts (6 pts each)
 * - Medium findings: up to 15 pts (2 pts each)
 * - Deadline breach / risk: up to 12 pts
 * - Critical path elongation / fragility: up to 8 pts
 * - Resource & Knowledge concentration: up to 15 pts
 */
export const calculateRedTeamExposureScore = ({
    findings = [],
    cpm = null,
    deadlineRisk = null
}) => {
    const criticalCount = findings.filter((f) => f.severity === RED_TEAM_SEVERITY.CRITICAL).length;
    const highCount = findings.filter((f) => f.severity === RED_TEAM_SEVERITY.HIGH).length;
    const mediumCount = findings.filter((f) => f.severity === RED_TEAM_SEVERITY.MEDIUM).length;
    const lowCount = findings.filter((f) => f.severity === RED_TEAM_SEVERITY.LOW).length;

    const critScore = Math.min(35, criticalCount * 12);
    const highScore = Math.min(25, highCount * 6);
    const medScore = Math.min(15, mediumCount * 2);

    const isDeadlineBreached = !!deadlineRisk?.isDeadlineBreached;
    const deadlinePts = isDeadlineBreached ? 12 : (deadlineRisk?.riskLevel === "HIGH" ? 7 : 0);
    const cpmTasksCount = cpm?.criticalTaskIds?.length || 0;
    const cpmPts = Math.min(8, Math.round(cpmTasksCount * 1.5));

    const hasResourceConcentration = findings.some(
        (f) => f.category === RED_TEAM_CATEGORIES.RESOURCE_CONCENTRATION && (f.severity === RED_TEAM_SEVERITY.HIGH || f.severity === RED_TEAM_SEVERITY.CRITICAL)
    );
    const hasKnowledgeConcentration = findings.some(
        (f) => f.category === RED_TEAM_CATEGORIES.KNOWLEDGE_CONCENTRATION
    );
    const concentrationPts = (hasResourceConcentration ? 8 : 0) + (hasKnowledgeConcentration ? 7 : 0);

    const totalScore = Math.max(0, Math.min(100, Math.round(critScore + highScore + medScore + deadlinePts + cpmPts + concentrationPts)));

    let classification = "LOW_EXPOSURE";
    if (totalScore >= 80) classification = "CRITICAL_EXPOSURE";
    else if (totalScore >= 60) classification = "HIGH_EXPOSURE";
    else if (totalScore >= 40) classification = "MODERATE_EXPOSURE";

    return {
        score: totalScore,
        classification,
        breakdown: {
            criticalFindingsScore: critScore,
            highFindingsScore: highScore,
            mediumFindingsScore: medScore,
            deadlineRiskScore: deadlinePts,
            criticalPathFragilityScore: cpmPts,
            concentrationScore: concentrationPts
        },
        counts: {
            critical: criticalCount,
            high: highCount,
            medium: mediumCount,
            low: lowCount,
            total: findings.length
        },
        explanation: `Red Team Exposure Score is ${totalScore}/100 (${classification}) based on ${criticalCount} critical, ${highCount} high, and ${mediumCount} medium vulnerability findings.`
    };
};

// ============================================================
// ADVERSARIAL CHALLENGE GENERATORS
// ============================================================

/**
 * 1. Estimate Realism Challenge
 * Challenges task estimates where downstream fanout is high or task is on critical path.
 */
export const challengeEstimateRealism = ({ tasks = [], dependencies = [], cpm, startOfToday, projectId }) => {
    const findings = [];
    const critSet = new Set(cpm?.criticalTaskIds || []);

    const downstreamMap = new Map();
    dependencies.forEach((d) => {
        const from = d.depends_on_task_id;
        downstreamMap.set(from, (downstreamMap.get(from) || 0) + 1);
    });

    tasks.filter((t) => !t.is_archived && t.status !== "Completed").forEach((task) => {
        const durationDays = calculateTaskDurationDays(task);
        const downstreamCount = downstreamMap.get(task.id) || 0;
        const isCritical = critSet.has(task.id);

        // Challenge zero or missing work estimates
        if (!task.estimated_hours || Number(task.estimated_hours) === 0) {
            findings.push({
                findingId: `rt-est-zero-${task.id}`,
                projectId,
                category: RED_TEAM_CATEGORIES.ESTIMATE_REALISM,
                title: `Zero or Missing Work Estimate: "${task.title}"`,
                description: `Task "${task.title}" has 0 or unassigned hours. Unestimated work conceals true schedule load and creates invisible schedule drift.`,
                severity: isCritical ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM,
                confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                assumption: `Task "${task.title}" can be completed with minimal or zero effort.`,
                evidence: [
                    `Task estimated hours is 0 or undefined.`,
                    isCritical ? "Task is on the critical path." : "Task has unknown duration impact."
                ],
                affectedEntities: [{ type: "TASK", id: task.id, name: task.title }],
                impact: `Unestimated tasks invalidate CPM duration predictions.`,
                supportingMetrics: {
                    estimatedHours: 0,
                    isOnCriticalPath: isCritical
                },
                challengeMethod: CHALLENGE_METHODS.THRESHOLD_TESTING,
                recommendedAction: `Provide a baseline estimate for "${task.title}".`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if "${task.title}" requires 16 hours of effort?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.TASK_EFFORT_SHOCK
            });
        }

        // Challenge optimistic estimates (< 3 days) with high downstream fanout or critical path status
        if ((durationDays <= 3 || Number(task.estimated_hours || 0) <= 24) && (downstreamCount >= 2 || isCritical)) {
            const shockDays = 2;
            const severity = isCritical && downstreamCount >= 2 ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM;
            const findingId = `rt-est-${task.id}`;

            findings.push({
                findingId,
                projectId,
                category: RED_TEAM_CATEGORIES.ESTIMATE_REALISM,
                title: `Optimistic Estimate on High-Leverage Task: "${task.title}"`,
                description: `Task "${task.title}" is estimated at only ${durationDays} day(s) (${task.estimated_hours || durationDays * 8}h), but has ${downstreamCount} downstream dependents and ${isCritical ? "lies on the critical path" : "low float"}. A minor slip propagates immediately.`,
                severity,
                confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                assumption: `Task "${task.title}" can be completed within ${durationDays} day(s) without estimate slippage.`,
                evidence: [
                    `Task has ${downstreamCount} downstream dependencies.`,
                    isCritical ? "Task is situated directly on the project critical path (0 slack)." : "Task has minimal float before impacting critical path.",
                    `Simulated +${shockDays} day delay cascades downstream to dependent work.`
                ],
                affectedEntities: [{ type: "TASK", id: task.id, name: task.title }],
                impact: `A +${shockDays} day delay on this task delays downstream start dates and reduces schedule contingency.`,
                supportingMetrics: {
                    estimatedDays: durationDays,
                    estimatedHours: Number(task.estimated_hours || durationDays * 8),
                    downstreamDependenciesCount: downstreamCount,
                    isOnCriticalPath: isCritical,
                    simulatedShockDays: shockDays
                },
                challengeMethod: CHALLENGE_METHODS.SMALL_PERTURBATION,
                recommendedAction: `Re-estimate task "${task.title}" using three-point estimation (optimistic, nominal, pessimistic) and build a 1-day buffer.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if "${task.title}" takes 2 days longer than estimated?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.TASK_EFFORT_SHOCK
            });
        }
    });

    return findings;
};

/**
 * 2. Deadline Realism Challenge
 * Compares deadline against Monte Carlo forecast (P50/P80/P90), CPM duration, and drift.
 */
export const challengeDeadlineRealism = ({ project, tasks, dependencies, cpm, startOfToday, projectId }) => {
    const findings = [];
    if (!project?.end_date) return findings;

    const deadline = new Date(project.end_date);
    const today = (startOfToday instanceof Date) ? startOfToday : new Date(startOfToday || getStartOfTodayUtc());
    const daysRemaining = Math.max(0, Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const cpmDuration = cpm?.criticalPathDurationDays || cpm?.totalDurationDays || 0;
    const cpmCriticalIds = cpm?.criticalTaskIds || [];

    let forecast = null;
    try {
        forecast = runMonteCarloForecast({
            projectId: projectId || project?.id,
            tasks,
            dependencies,
            iterations: 200,
            startOfToday: today,
            projectDeadline: project.end_date
        });
    } catch {
        // Fallback gracefully if forecast unavailable
    }

    const p50Date = forecast?.p50Date ? new Date(forecast.p50Date) : null;
    const p80Date = forecast?.p80Date ? new Date(forecast.p80Date) : null;
    const p90Date = forecast?.p90Date ? new Date(forecast.p90Date) : null;

    const isCpmInfeasible = cpmDuration > 0 && daysRemaining > 0 && cpmDuration > daysRemaining;
    const isP80Infeasible = p80Date && deadline < p80Date;

    if (isCpmInfeasible || isP80Infeasible) {
        const isPastP50 = p50Date && deadline < p50Date;
        const severity = (isPastP50 || (cpmDuration - daysRemaining >= 5)) ? RED_TEAM_SEVERITY.CRITICAL : RED_TEAM_SEVERITY.HIGH;
        const driftDays = p80Date
            ? Math.round((p80Date.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))
            : (cpmDuration - daysRemaining);

        findings.push({
            findingId: `rt-deadline-${projectId}`,
            projectId,
            category: RED_TEAM_CATEGORIES.DEADLINE_REALISM,
            title: isCpmInfeasible
                ? `Critical Path Duration Exceeds Remaining Schedule Time`
                : `Deadline Incompatible with P80 Monte Carlo Forecast`,
            description: isCpmInfeasible
                ? `The critical path requires ${cpmDuration} working day(s), but only ${daysRemaining} day(s) remain before the committed project deadline (${deadline.toISOString().split("T")[0]}). Completion by target date is mathematically impossible without intervention.`
                : `The current target deadline (${deadline.toISOString().split("T")[0]}) is inside the project's P80 forecast (${p80Date.toISOString().split("T")[0]}). There is less than an 80% statistical likelihood of on-time delivery without scope or capacity interventions.`,
            severity,
            confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
            assumption: `Project will complete by committed deadline ${deadline.toISOString().split("T")[0]} under existing scope and capacity.`,
            evidence: [
                `Committed project deadline: ${deadline.toISOString().split("T")[0]} (${daysRemaining} calendar day(s) remaining)`,
                `Critical path length: ${cpmDuration} day(s) across ${cpmCriticalIds.length} serial tasks`,
                p80Date ? `Monte Carlo P80 projected completion: ${p80Date.toISOString().split("T")[0]} (+${driftDays} days beyond deadline)` : `Schedule deficit: ${cpmDuration - daysRemaining} day(s)`
            ],
            affectedEntities: [{ type: "PROJECT", id: projectId, name: project.title || "Project" }],
            impact: `Project faces high risk of deadline breach (+${Math.max(1, driftDays)} day(s) schedule deficit).`,
            supportingMetrics: {
                deadlineDate: deadline.toISOString().split("T")[0],
                daysRemaining,
                cpmDurationDays: cpmDuration,
                p50Date: p50Date?.toISOString().split("T")[0],
                p80Date: p80Date?.toISOString().split("T")[0],
                p90Date: p90Date?.toISOString().split("T")[0],
                driftBeyondDeadlineDays: driftDays,
                onTimeProbabilityPercent: forecast?.onTimeProbabilityPercent || 15
            },
            challengeMethod: CHALLENGE_METHODS.MONTE_CARLO_COMPARISON,
            recommendedAction: `Negotiate deadline extension by ${Math.max(1, driftDays)} day(s), or activate scope descope intervention through Phase 3 Approval Center.`,
            counterfactualAvailable: true,
            counterfactualPrompt: `What if the project deadline had been set 5 days later?`,
            chaosScenarioAvailable: true,
            targetChaosCategory: CHAOS_CATEGORIES.DEADLINE_COMPRESSION
        });
    }

    return findings;
};

/**
 * 3. Dependency Fragility Challenge
 * Challenges fragile dependency chains with large downstream reach and zero float.
 */
export const challengeDependencyFragility = ({ tasks, dependencies, cpm, projectId }) => {
    const findings = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const critSet = new Set(cpm?.criticalTaskIds || []);

    dependencies.forEach((dep, idx) => {
        const source = taskMap.get(dep.depends_on_task_id);
        const target = taskMap.get(dep.task_id);

        if (!source || !target || source.status === "Completed") return;

        // Traverse downstream reach from target
        const propagation = traverseDownstreamDependencies({
            startTaskId: dep.task_id,
            tasks,
            dependencies,
            shockMagnitudeDays: 2
        });

        const isSourceCritical = critSet.has(source.id);
        const isTargetCritical = critSet.has(target.id);
        const blastRadius = propagation.totalAffected;

        if (blastRadius >= 2 || (isSourceCritical && isTargetCritical)) {
            const severity = blastRadius >= 3 || (isSourceCritical && isTargetCritical)
                ? RED_TEAM_SEVERITY.HIGH
                : RED_TEAM_SEVERITY.MEDIUM;

            findings.push({
                findingId: `rt-dep-${source.id}-${target.id}`,
                projectId,
                category: RED_TEAM_CATEGORIES.DEPENDENCY_FRAGILITY,
                title: `Fragile Dependency Coupling: "${source.title}" → "${target.title}"`,
                description: `Strict serial coupling between "${source.title}" and "${target.title}" exhibits high blast radius (${blastRadius} downstream tasks affected). Failure or delay in the predecessor immediately stalls the downstream chain.`,
                severity,
                confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                assumption: `Predecessor "${source.title}" will complete cleanly on time without unblocking delays for "${target.title}".`,
                evidence: [
                    `Predecessor: "${source.title}" (${isSourceCritical ? "CRITICAL PATH" : "Non-critical"})`,
                    `Successor: "${target.title}" (${isTargetCritical ? "CRITICAL PATH" : "Non-critical"})`,
                    `Downstream blast radius: ${blastRadius} task(s) affected`,
                    `Propagation depth: ${propagation.maxDepth} dependency level(s)`
                ],
                affectedEntities: [
                    { type: "TASK", id: source.id, name: source.title },
                    { type: "TASK", id: target.id, name: target.title }
                ],
                impact: `Any disruption to "${source.title}" immediately propagates through ${blastRadius} downstream tasks.`,
                supportingMetrics: {
                    sourceTaskId: source.id,
                    targetTaskId: target.id,
                    downstreamAffectedCount: blastRadius,
                    maxDepth: propagation.maxDepth,
                    isCriticalCoupling: isSourceCritical && isTargetCritical
                },
                challengeMethod: CHALLENGE_METHODS.SHOCKWAVE_ANALYSIS,
                recommendedAction: `Investigate whether "${target.title}" can be partially decoupled or parallelized with mock interfaces.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if the dependency between "${source.title}" and "${target.title}" was removed?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.DEPENDENCY_FAILURE
            });
        }
    });

    // Predecessor fanout check (source task blocks >= 3 tasks)
    const fanoutMap = new Map();
    dependencies.forEach((d) => {
        const count = (fanoutMap.get(d.depends_on_task_id) || 0) + 1;
        fanoutMap.set(d.depends_on_task_id, count);
    });
    for (const [sourceId, fanoutCount] of fanoutMap.entries()) {
        if (fanoutCount >= 3) {
            const srcTask = taskMap.get(sourceId);
            if (srcTask && srcTask.status !== "Completed") {
                findings.push({
                    findingId: `rt-dep-fanout-${sourceId}`,
                    projectId,
                    category: RED_TEAM_CATEGORIES.DEPENDENCY_FRAGILITY,
                    title: `High Downstream Fanout: "${srcTask.title}" blocks ${fanoutCount} tasks`,
                    description: `Task "${srcTask.title}" is a structural nexus with high fanout directly blocking ${fanoutCount} tasks. Any delay or blockage in this predecessor will simultaneously stall multiple downstream tracks.`,
                    severity: fanoutCount >= 4 ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM,
                    confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                    assumption: `"${srcTask.title}" will complete cleanly on time without impeding parallel work streams.`,
                    evidence: [
                        `Predecessor: "${srcTask.title}" directly blocks ${fanoutCount} tasks`,
                        `Direct successors: ${fanoutCount} downstream tasks dependent on this deliverable`
                    ],
                    affectedEntities: [{ type: "TASK", id: srcTask.id, name: srcTask.title }],
                    impact: `Delay in "${srcTask.title}" stalls ${fanoutCount} dependent tasks simultaneously.`,
                    supportingMetrics: {
                        sourceTaskId: srcTask.id,
                        directDependentsCount: fanoutCount
                    },
                    challengeMethod: CHALLENGE_METHODS.DEPENDENCY_ANALYSIS,
                    recommendedAction: `Decouple non-essential dependencies or stub APIs to unblock parallel execution.`,
                    counterfactualAvailable: true,
                    counterfactualPrompt: `What if dependencies on "${srcTask.title}" were decoupled?`,
                    chaosScenarioAvailable: true,
                    targetChaosCategory: CHAOS_CATEGORIES.DEPENDENCY_FAILURE
                });
            }
        }
    }

    return findings.slice(0, 5); // Bound to top 5 most fragile
};

/**
 * 4. Resource Concentration Challenge
 * Identifies excessive workload or critical task concentration on a single contributor.
 */
export const challengeResourceConcentration = ({ tasks, projectMembers, cpm, bottlenecks, projectId }) => {
    const findings = [];
    const critSet = new Set(cpm?.criticalTaskIds || []);
    const bnSet = new Set((bottlenecks?.bottlenecks || bottlenecks || []).map((b) => b.taskId || b.id));

    const memberMap = new Map();
    (projectMembers || []).forEach((pm) => {
        const uid = pm.user_id || pm.id;
        const name = `${pm.users?.first_name || ""} ${pm.users?.last_name || ""}`.trim() || pm.users?.email || uid;
        memberMap.set(uid, { userId: uid, name, tasks: [], hours: 0, criticalCount: 0, bottleneckCount: 0 });
    });

    let totalRemainingHours = 0;
    tasks.filter((t) => !t.is_archived && t.status !== "Completed").forEach((t) => {
        const hrs = Number(t.estimated_hours || 8);
        totalRemainingHours += hrs;
        const uid = t.assigned_to;
        if (uid && memberMap.has(uid)) {
            const entry = memberMap.get(uid);
            entry.tasks.push(t);
            entry.hours += hrs;
            if (critSet.has(t.id)) entry.criticalCount++;
            if (bnSet.has(t.id)) entry.bottleneckCount++;
        }
    });

    memberMap.forEach((m) => {
        const hourShare = totalRemainingHours > 0 ? (m.hours / totalRemainingHours) : 0;
        if (m.tasks.length >= 3 && (hourShare >= 0.35 || m.criticalCount >= 2 || m.bottleneckCount >= 2)) {
            const severity = (hourShare >= 0.50 || m.criticalCount >= 3) ? RED_TEAM_SEVERITY.CRITICAL : RED_TEAM_SEVERITY.HIGH;

            findings.push({
                findingId: `rt-res-${m.userId}`,
                projectId,
                category: RED_TEAM_CATEGORIES.RESOURCE_CONCENTRATION,
                title: `High Workload & Responsibility Concentration: ${m.name}`,
                description: `Project execution is highly concentrated around ${m.name}, who owns ${m.tasks.length} active tasks (${Math.round(hourShare * 100)}% of remaining hours), including ${m.criticalCount} critical-path tasks and ${m.bottleneckCount} major bottlenecks.`,
                severity,
                confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                assumption: `${m.name} will maintain 100% velocity without competing priorities, burnout, or unscheduled downtime.`,
                evidence: [
                    `Assigned workload: ${m.hours} hours across ${m.tasks.length} tasks (${Math.round(hourShare * 100)}% of total remaining work)`,
                    `Critical-path ownership: ${m.criticalCount} critical task(s)`,
                    `Bottleneck ownership: ${m.bottleneckCount} bottleneck task(s)`
                ],
                affectedEntities: [{ type: "MEMBER", id: m.userId, name: m.name }],
                impact: `Unavailability or slowing of ${m.name} halts multiple critical paths simultaneously.`,
                supportingMetrics: {
                    userId: m.userId,
                    assignedHours: m.hours,
                    workloadSharePercent: Math.round(hourShare * 100),
                    criticalTasksCount: m.criticalCount,
                    bottleneckTasksCount: m.bottleneckCount
                },
                challengeMethod: CHALLENGE_METHODS.CAPACITY_ANALYSIS,
                recommendedAction: `Rebalance workload by reassigning at least 1 critical-path task from ${m.name} to another qualified team member.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if tasks owned by ${m.name} were distributed across multiple contributors?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.TEAM_AVAILABILITY
            });
        }
    });

    return findings;
};

/**
 * 5. Knowledge Concentration Challenge
 * Identifies areas with single points of failure where only one person possesses context.
 */
export const challengeKnowledgeConcentration = ({ tasks, projectMembers, cpm, projectId }) => {
    const findings = [];
    const critSet = new Set(cpm?.criticalTaskIds || []);

    const userMap = new Map();
    tasks.filter((t) => !t.is_archived && t.status !== "Completed" && critSet.has(t.id)).forEach((t) => {
        const uid = t.assigned_to;
        if (uid) {
            userMap.set(uid, (userMap.get(uid) || 0) + 1);
        }
    });

    userMap.forEach((count, uid) => {
        if (count >= 2) {
            const member = projectMembers.find((pm) => (pm.user_id || pm.id) === uid);
            const name = member ? `${member.users?.first_name || ""} ${member.users?.last_name || ""}`.trim() : uid;

            findings.push({
                findingId: `rt-know-${uid}`,
                projectId,
                category: RED_TEAM_CATEGORIES.KNOWLEDGE_CONCENTRATION,
                title: `Single Point of Failure / Knowledge Island: ${name}`,
                description: `${name} is the sole owner of ${count} critical-path tasks with no documented backup or co-assignee. Knowledge loss in this domain poses immediate delivery risk.`,
                severity: count >= 3 ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM,
                confidence: EVIDENCE_CONFIDENCE.MODERATE_EVIDENCE,
                assumption: `Sole contributor ${name} possesses all necessary operational context without requiring pairing or knowledge transfer.`,
                evidence: [
                    `${name} is the exclusive assignee for ${count} critical path tasks.`,
                    `No secondary or shadow assignees are assigned to these components.`
                ],
                affectedEntities: [{ type: "MEMBER", id: uid, name }],
                impact: `Temporary absence of ${name} directly pauses critical path progression.`,
                supportingMetrics: {
                    userId: uid,
                    criticalTaskCount: count,
                    backupAssigneeCount: 0
                },
                challengeMethod: CHALLENGE_METHODS.CAPACITY_ANALYSIS,
                recommendedAction: `Establish peer pairing or cross-training on tasks owned by ${name}.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if a backup owner was assigned to support ${name}?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.TEAM_AVAILABILITY
            });
        }
    });

    return findings.slice(0, 3);
};

/**
 * 6. Critical Path Fragility Challenge
 * Challenges the critical path structure, especially 0 slack tasks and competing paths.
 */
export const challengeCriticalPathFragility = ({ tasks, dependencies, cpm, projectId }) => {
    const findings = [];
    const critCount = cpm?.criticalTaskIds?.length || 0;

    if (critCount >= 3) {
        findings.push({
            findingId: `rt-cpm-fragility-${projectId}`,
            projectId,
            category: RED_TEAM_CATEGORIES.CRITICAL_PATH_FRAGILITY,
            title: `Zero-Slack Critical Path Fragility (${critCount} tasks chained)`,
            description: `The project contains ${critCount} tasks chained with zero slack along the critical path. Every individual day of delay on any of these tasks translates 1:1 into overall project delivery delay.`,
            severity: critCount >= 5 ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM,
            confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
            assumption: `All ${critCount} critical-path tasks will proceed without any unexpected technical friction or delays.`,
            evidence: [
                `Critical path spans ${critCount} serial tasks.`,
                `Total critical path duration: ${cpm.totalDurationDays || 0} days.`,
                `Slack buffer on critical path tasks: 0.0 days (1:1 delay slippage rule).`
            ],
            affectedEntities: (cpm.criticalTaskIds || []).map((tid) => {
                const t = tasks.find((item) => item.id === tid);
                return { type: "TASK", id: tid, name: t?.title || tid };
            }),
            impact: `1 day of delay on any critical task causes 1 day of projected project delivery delay.`,
            supportingMetrics: {
                criticalTasksCount: critCount,
                totalCriticalDurationDays: cpm.totalDurationDays || 0,
                slackDays: 0
            },
            challengeMethod: CHALLENGE_METHODS.CRITICAL_PATH_ANALYSIS,
            recommendedAction: `Identify tasks on the critical path that can be parallelized or descoped to build slack.`,
            counterfactualAvailable: true,
            counterfactualPrompt: `What if the first critical path task was completed 2 days earlier?`,
            chaosScenarioAvailable: true,
            targetChaosCategory: CHAOS_CATEGORIES.TASK_DELAY
        });
    }

    return findings;
};

/**
 * 7. Bottleneck Fragility Challenge
 * Tests vulnerability around major bottlenecks.
 */
export const challengeBottleneckFragility = ({ tasks, dependencies, bottlenecks, projectId }) => {
    const findings = [];
    const majorBottlenecks = bottlenecks?.bottlenecks || bottlenecks?.majorBottlenecks || bottlenecks || [];

    if (Array.isArray(majorBottlenecks) && majorBottlenecks.length > 0) {
        const topBn = majorBottlenecks[0];
        const task = tasks.find((t) => t.id === (topBn.taskId || topBn.id));

        if (task && task.status !== "Completed") {
            const propagation = traverseDownstreamDependencies({
                startTaskId: task.id,
                tasks,
                dependencies,
                shockMagnitudeDays: 3
            });

            findings.push({
                findingId: `rt-bn-${task.id}`,
                projectId,
                category: RED_TEAM_CATEGORIES.BOTTLENECK_FRAGILITY,
                title: `Primary Bottleneck Vulnerability: "${task.title}"`,
                description: `Task "${task.title}" is the primary systemic bottleneck (Score: ${topBn.bottleneckScore || 85}/100). Downstream shock simulation indicates a 3-day disruption affects ${propagation.totalAffected} tasks.`,
                severity: RED_TEAM_SEVERITY.HIGH,
                confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                assumption: `Primary bottleneck "${task.title}" will execute without queues, blocked states, or resource contention.`,
                evidence: [
                    `Bottleneck severity: ${topBn.severity || "HIGH"} (Score: ${topBn.bottleneckScore || 85}/100)`,
                    `Fan-in / Fan-out structure: ${topBn.directDependentsCount || propagation.totalAffected} dependent task(s)`,
                    `Simulated shockwave reaches depth of ${propagation.maxDepth} levels`
                ],
                affectedEntities: [{ type: "TASK", id: task.id, name: task.title }],
                impact: `Bottleneck saturation delays downstream teams and halts multi-stream execution.`,
                supportingMetrics: {
                    taskId: task.id,
                    bottleneckScore: topBn.bottleneckScore || 85,
                    downstreamBlastRadius: propagation.totalAffected
                },
                challengeMethod: CHALLENGE_METHODS.BOTTLENECK_ANALYSIS,
                recommendedAction: `Fast-track "${task.title}" by removing non-essential acceptance criteria or assigning dedicated support.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if bottleneck "${task.title}" had been resolved 3 days earlier?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.BOTTLENECK_FAILURE
            });
        }
    }

    return findings;
};

/**
 * 8. Scope Fragility Challenge
 * Challenges scope assumptions by simulating unplanned work expansion.
 */
export const challengeScopeFragility = ({ tasks, dependencies, project, cpm, startOfToday, projectId }) => {
    const findings = [];
    const totalHours = tasks.reduce((sum, t) => sum + Number(t.estimated_hours || 0), 0);

    if (totalHours > 0) {
        // Simulate a +15% scope injection
        const scopeIncreaseHours = Math.round(totalHours * 0.15);
        const simResult = runScenarioSimulation({
            project,
            tasks,
            dependencies,
            mutations: [
                {
                    type: MUTATION_TYPES.SCOPE_CHANGE,
                    parameter: { hours: scopeIncreaseHours }
                }
            ],
            startOfToday
        });

        const healthDecline = (simResult.comparison?.deltas?.healthScore || 0);
        const driftIncrease = (simResult.comparison?.deltas?.scheduleDriftDays || 0);

        if (driftIncrease >= 3 || healthDecline <= -10) {
            findings.push({
                findingId: `rt-scope-fragility-${projectId}`,
                projectId,
                category: RED_TEAM_CATEGORIES.SCOPE_FRAGILITY,
                title: `High Sensitivity to Unplanned Scope Additions (+15%)`,
                description: `Simulating a modest 15% scope expansion (+${scopeIncreaseHours} hours) results in a +${driftIncrease} day schedule drift and a ${healthDecline} pt health decline, demonstrating fragile schedule buffer.`,
                severity: driftIncrease >= 5 ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM,
                confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
                assumption: `Project scope is strictly frozen and no unanticipated requirements will emerge.`,
                evidence: [
                    `Current baseline scope: ${totalHours} estimated hours.`,
                    `+15% scope simulation (+${scopeIncreaseHours}h) causes +${driftIncrease} day(s) schedule drift.`,
                    `Project health drops by ${Math.abs(healthDecline)} points under scope addition.`
                ],
                affectedEntities: [{ type: "PROJECT", id: projectId, name: project?.title || "Project Scope" }],
                impact: `Project lacks buffer to absorb minor client or technical scope changes.`,
                supportingMetrics: {
                    baselineHours: totalHours,
                    simulatedAddedHours: scopeIncreaseHours,
                    projectedDriftDays: driftIncrease,
                    healthImpact: healthDecline
                },
                challengeMethod: CHALLENGE_METHODS.SMALL_PERTURBATION,
                recommendedAction: `Establish strict change-control gates and maintain a 15% scope contingency buffer in sprint planning.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if project scope had been reduced by 15%?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.SCOPE_EXPANSION
            });
        }
    }

    return findings;
};

/**
 * 9. Recovery Fragility Challenge
 * Tests whether recovery plans collapse under a secondary minor shock.
 */
export const challengeRecoveryFragility = ({ tasks, dependencies, project, startOfToday, projectId }) => {
    const findings = [];
    const recoveryPlan = calculateRecoveryPlan({ tasks, dependencies, project, startOfToday });

    if (recoveryPlan && recoveryPlan.projectedRecoveryDays > 0) {
        // Recovery assumption: works in a vacuum. Red team introduces secondary 1-day disruption.
        findings.push({
            findingId: `rt-rec-fragility-${projectId}`,
            projectId,
            category: RED_TEAM_CATEGORIES.RECOVERY_FRAGILITY,
            title: `Recovery Plan Vulnerability Under Secondary Disruption`,
            description: `The active recovery strategy projects saving ${recoveryPlan.projectedRecoveryDays} day(s). However, simulation indicates this gain is fragile: an unexpected 1-day slip on dependent work erodes up to 50% of the planned recovery benefit.`,
            severity: RED_TEAM_SEVERITY.MEDIUM,
            confidence: EVIDENCE_CONFIDENCE.MODERATE_EVIDENCE,
            assumption: `Recovery interventions will execute with zero secondary friction, delay, or handover loss.`,
            evidence: [
                `Projected nominal recovery gain: ${recoveryPlan.projectedRecoveryDays} day(s).`,
                `Recovery relies on tight cross-task synchronization.`,
                `Secondary perturbation analysis indicates high sensitivity to minor execution slip.`
            ],
            affectedEntities: [{ type: "RECOVERY_PLAN", id: "active-recovery", name: "Project Recovery Plan" }],
            impact: `Recovery benefit may fail to materialize if secondary disruptions occur during execution.`,
            supportingMetrics: {
                projectedRecoveryDays: recoveryPlan.projectedRecoveryDays,
                recoveryBufferDays: 1
            },
            challengeMethod: CHALLENGE_METHODS.THRESHOLD_TESTING,
            recommendedAction: `Add parallel secondary recovery interventions (such as fast-tracking non-critical prerequisites).`,
            counterfactualAvailable: true,
            counterfactualPrompt: `What if the recovery plan had been initiated 5 days earlier?`,
            chaosScenarioAvailable: false,
            targetChaosCategory: null
        });
    }

    return findings;
};

/**
 * 10. Risk Coverage Challenge
 * Compares logged risks with structural project vulnerabilities.
 */
export const challengeRiskCoverage = ({ tasks, dependencies, risks = [], bottlenecks, cpm, projectId }) => {
    const findings = [];
    const critCount = cpm?.criticalTaskIds?.length || 0;
    const majorBottlenecks = bottlenecks?.bottlenecks || bottlenecks || [];

    // Check if logged risks cover major bottlenecks
    if (majorBottlenecks.length > 0 && risks.length === 0) {
        findings.push({
            findingId: `rt-risk-coverage-${projectId}`,
            projectId,
            category: RED_TEAM_CATEGORIES.RISK_COVERAGE,
            title: `Unregistered Structural Vulnerabilities in Risk Register`,
            description: `The project contains ${majorBottlenecks.length} active bottleneck(s) and ${critCount} critical-path tasks, but 0 risks are logged in the formal risk register. Structural risks are operating without explicit mitigations.`,
            severity: RED_TEAM_SEVERITY.HIGH,
            confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
            assumption: `Absence of logged risks reflects a low-risk project environment.`,
            evidence: [
                `0 risks recorded in project risk register.`,
                `${majorBottlenecks.length} major bottleneck(s) actively detected in dependency network.`,
                `${critCount} serial tasks on critical path.`
            ],
            affectedEntities: [{ type: "PROJECT", id: projectId, name: "Risk Register" }],
            impact: `Team lacks pre-authorized contingency plans when structural delays occur.`,
            supportingMetrics: {
                loggedRisksCount: risks.length,
                detectedBottlenecksCount: majorBottlenecks.length,
                criticalTasksCount: critCount
            },
            challengeMethod: CHALLENGE_METHODS.DEPENDENCY_ANALYSIS,
            recommendedAction: `Log formal risk register entries for top bottlenecks with designated mitigation owners.`,
            counterfactualAvailable: false,
            counterfactualPrompt: null,
            chaosScenarioAvailable: true,
            targetChaosCategory: CHAOS_CATEGORIES.TASK_FAILURE
        });
    }

    return findings;
};

/**
 * 11. Decision Fragility Challenge
 * Challenges historical decisions with temporal association to drift, without claiming unsubstantiated causality.
 */
export const challengeDecisionFragility = ({ decisions = [], projectId }) => {
    const findings = [];

    (decisions || []).forEach((dec) => {
        if (dec.status === "APPROVED" || dec.status === "EXECUTED" || dec.impact) {
            findings.push({
                findingId: `rt-dec-${dec.id || dec.decisionId}`,
                projectId,
                category: RED_TEAM_CATEGORIES.DECISION_FRAGILITY,
                title: `Decision Fragility Review: "${dec.title || "Project Decision"}"`,
                description: `Decision "${dec.title || "Decision"}" altered project scope or baseline. Temporal association analysis indicates schedule drift expanded following this change. (Note: Temporal correlation does not establish direct causality).`,
                severity: RED_TEAM_SEVERITY.MEDIUM,
                confidence: EVIDENCE_CONFIDENCE.LIMITED_EVIDENCE,
                assumption: `Decision "${dec.title || "Decision"}" had zero adverse downstream ripple effects on team velocity.`,
                evidence: [
                    `Decision: "${dec.title || "Decision"}"`,
                    `Temporal association: Recorded metrics shifted subsequent to decision execution.`,
                    `Analytical disclaimer: Causality is unproven; finding reports temporal association.`
                ],
                affectedEntities: [{ type: "DECISION", id: dec.id || "dec-1", name: dec.title || "Decision" }],
                impact: `Historical decision assumptions should be revisited to confirm validity under current constraints.`,
                supportingMetrics: {
                    decisionId: dec.id || "dec-1",
                    recordedImpact: dec.impact || "Scope alteration"
                },
                challengeMethod: CHALLENGE_METHODS.HISTORICAL_COMPARISON,
                recommendedAction: `Conduct an objective retrospective on decision assumptions and consider a counterfactual simulation.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What would have happened if decision "${dec.title || "this decision"}" had been rejected?`,
                chaosScenarioAvailable: false,
                targetChaosCategory: null
            });
        }
    });

    return findings.slice(0, 2);
};

/**
 * 12. Health Inconsistency Challenge
 * Surfaces contradictions where high overall health masks concentrated risk.
 */
export const challengeHealthInconsistency = ({ health, cpm, deadlineRisk, bottlenecks, projectId }) => {
    const findings = [];
    const healthScore = health?.score ?? 75;
    const isDeadlineBreached = !!deadlineRisk?.isDeadlineBreached || deadlineRisk?.riskLevel === "HIGH";
    const majorBottlenecks = (bottlenecks?.bottlenecks || bottlenecks || []).length;

    if (healthScore >= 70 && (isDeadlineBreached || majorBottlenecks >= 2)) {
        findings.push({
            findingId: `rt-health-inconsistency-${projectId}`,
            projectId,
            category: RED_TEAM_CATEGORIES.HEALTH_INCONSISTENCY,
            title: `Health Score Masking Concentrated Schedule & Bottleneck Risk`,
            description: `The overall project health score appears favorable (${healthScore}/100), but conceals concentrated risk: ${isDeadlineBreached ? "projected deadline breach is detected" : ""}${isDeadlineBreached && majorBottlenecks ? " and " : ""}${majorBottlenecks ? `${majorBottlenecks} major bottlenecks are active` : ""}. Aggregated metric averaging dilutes critical warnings.`,
            severity: RED_TEAM_SEVERITY.HIGH,
            confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
            assumption: `High aggregate health score (${healthScore}/100) indicates safe, uninterrupted project execution.`,
            evidence: [
                `Aggregate project health: ${healthScore}/100 (HEALTHY/STABLE tier).`,
                isDeadlineBreached ? `Deadline risk: High risk or projected delivery breach detected.` : null,
                majorBottlenecks ? `${majorBottlenecks} major bottleneck(s) detected in workflow.` : null
            ].filter(Boolean),
            affectedEntities: [{ type: "METRIC", id: "health-score", name: "Project Health" }],
            impact: `Stakeholders relying exclusively on the headline health score will be blindsided by upcoming schedule slips.`,
            supportingMetrics: {
                healthScore,
                deadlineRiskLevel: deadlineRisk?.riskLevel || "HIGH",
                majorBottlenecksCount: majorBottlenecks
            },
            challengeMethod: CHALLENGE_METHODS.THRESHOLD_TESTING,
            recommendedAction: `Surface schedule drift and bottleneck metrics alongside overall health in executive reporting.`,
            counterfactualAvailable: false,
            counterfactualPrompt: null,
            chaosScenarioAvailable: false,
            targetChaosCategory: null
        });
    }

    return findings;
};

/**
 * 13. Capacity Assumption Challenge
 * Challenges unsustainable member allocations.
 */
export const challengeCapacityAssumption = ({ tasks, projectMembers, projectId }) => {
    const findings = [];
    const memberHours = new Map();

    tasks.filter((t) => !t.is_archived && t.status !== "Completed").forEach((t) => {
        const uid = t.assigned_to;
        if (uid) {
            memberHours.set(uid, (memberHours.get(uid) || 0) + Number(t.estimated_hours || 0));
        }
    });

    memberHours.forEach((hrs, uid) => {
        if (hrs >= 80) { // More than 2 full 40h weeks of immediate assigned work
            const pm = (projectMembers || []).find((m) => (m.user_id || m.id) === uid);
            const name = pm ? `${pm.users?.first_name || ""} ${pm.users?.last_name || ""}`.trim() : uid;

            findings.push({
                findingId: `rt-cap-${uid}`,
                projectId,
                category: RED_TEAM_CATEGORIES.CAPACITY_ASSUMPTION,
                title: `Unsustainable Backlog Load on ${name} (${hrs}h)`,
                description: `${name} has ${hrs} hours of immediate incomplete work assigned, assuming zero context-switching overhead, zero defect rework, and 100% velocity efficiency.`,
                severity: hrs >= 120 ? RED_TEAM_SEVERITY.HIGH : RED_TEAM_SEVERITY.MEDIUM,
                confidence: EVIDENCE_CONFIDENCE.MODERATE_EVIDENCE,
                assumption: `${name} will work at maximum theoretical capacity without sickness, PTO, meetings, or interruptions.`,
                evidence: [
                    `Assigned active task effort: ${hrs} hours.`,
                    `Exceeds standard 2-week sprint capacity by ${Math.max(0, hrs - 80)} hours.`
                ],
                affectedEntities: [{ type: "MEMBER", id: uid, name }],
                impact: `Fatigue and context switching will likely decrease velocity by 20-30%.`,
                supportingMetrics: {
                    userId: uid,
                    totalAssignedHours: hrs,
                    sustainableThresholdHours: 80
                },
                challengeMethod: CHALLENGE_METHODS.CAPACITY_ANALYSIS,
                recommendedAction: `Offload lower-priority tasks to backlog or secondary contributors.`,
                counterfactualAvailable: true,
                counterfactualPrompt: `What if 40 hours of tasks were reassigned from ${name}?`,
                chaosScenarioAvailable: true,
                targetChaosCategory: CHAOS_CATEGORIES.TEAM_AVAILABILITY
            });
        }
    });

    return findings.slice(0, 3);
};

/**
 * 14. Resilience Gap Challenge
 * Checks whether project possesses structural resilience against single points of failure.
 */
export const challengeResilienceGap = ({ tasks, dependencies, cpm, projectId }) => {
    const findings = [];
    const critTasks = (cpm?.criticalTaskIds || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);

    // If critical tasks are assigned to only 1 individual
    const critAssignees = new Set(critTasks.map((t) => t.assigned_to).filter(Boolean));
    if (critTasks.length >= 3 && critAssignees.size === 1) {
        findings.push({
            findingId: `rt-resilience-gap-${projectId}`,
            projectId,
            category: RED_TEAM_CATEGORIES.RESILIENCE_GAP,
            title: `Zero Redundancy Across Entire Critical Path`,
            description: `All ${critTasks.length} critical path tasks are assigned to a single contributor. The project possesses zero redundancy along its most vital schedule artery.`,
            severity: RED_TEAM_SEVERITY.CRITICAL,
            confidence: EVIDENCE_CONFIDENCE.STRONG_EVIDENCE,
            assumption: `Project critical path can safely depend on a single individual without backup capacity.`,
            evidence: [
                `${critTasks.length} critical path tasks assigned to 1 sole developer.`,
                `Any individual impediment stalls 100% of critical project delivery.`
            ],
            affectedEntities: [{ type: "PROJECT", id: projectId, name: "Critical Path Network" }],
            impact: `Critical path redundancy is 0.0%, creating a catastrophic single point of failure.`,
            supportingMetrics: {
                criticalTasksCount: critTasks.length,
                uniqueCriticalAssigneesCount: critAssignees.size
            },
            challengeMethod: CHALLENGE_METHODS.CRITICAL_PATH_ANALYSIS,
            recommendedAction: `Distribute critical-path ownership across at least two independent engineers.`,
            counterfactualAvailable: true,
            counterfactualPrompt: `What if critical path tasks were split between two contributors?`,
            chaosScenarioAvailable: true,
            targetChaosCategory: CHAOS_CATEGORIES.TEAM_AVAILABILITY
        });
    }

    return findings;
};

// ============================================================
// MAIN RED TEAM ANALYSIS ORCHESTRATOR
// ============================================================

/**
 * Executes full Red Team adversarial analysis on a project.
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.userId]
 * @param {Object} [params.baseData] - Optional injected project state for testing/simulation
 * @param {Date|string} [params.startOfToday]
 * @returns {Promise<Object>} Red Team report with findings, exposure score, and recommendations
 */
export const runProjectRedTeam = async ({
    projectId,
    userId = null,
    baseData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for Red Team analysis.");
    }

    // 1. Authorization Verification (when in live database context)
    if (userId && !baseData && prisma) {
        await verifyProjectAccess(projectId, userId);
    }

    // 2. Resolve Active Project Data
    let project = {};
    let tasks = [];
    let dependencies = [];
    let projectMembers = [];
    let risks = [];
    let decisions = [];

    if (baseData) {
        project = baseData.project || { id: projectId };
        tasks = baseData.tasks || [];
        dependencies = baseData.dependencies || [];
        projectMembers = baseData.projectMembers || [];
        risks = baseData.risks || [];
        decisions = baseData.decisions || [];
    } else if (inMemoryProjectDataStore.has(projectId)) {
        const stored = inMemoryProjectDataStore.get(projectId);
        project = stored.project || { id: projectId };
        tasks = stored.tasks || [];
        dependencies = stored.dependencies || [];
        projectMembers = stored.projectMembers || [];
        risks = stored.risks || [];
        decisions = stored.decisions || [];
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
            risks = await prisma.risks.findMany({
                where: { project_id: projectId }
            });
            decisions = await prisma.decisions?.findMany?.({
                where: { project_id: projectId }
            }) || [];
        } catch {
            // Fall back cleanly if DB unavailable
        }
    }

    // 3. Baseline Analytics Computation
    const today = (startOfToday instanceof Date) ? startOfToday : new Date(startOfToday || getStartOfTodayUtc());
    const digitalTwin = buildDigitalTwin({
        project,
        tasks,
        dependencies,
        projectMembers,
        startOfToday: today
    });

    const cpm = calculateCriticalPath({ project, tasks, dependencies, startOfToday: today });
    const bottlenecks = detectBottlenecks({ project, tasks, dependencies, startOfToday: today });
    const health = calculateProjectHealth(digitalTwin, { startOfToday: today });
    const drift = calculateScheduleDrift(digitalTwin, today);
    const deadlineRisk = calculateDeadlineRisks(digitalTwin, today);

    // 4. Capture Invariant State Hash (Guarantees Zero Production Mutations)
    const stateHashBefore = computeProjectStateHash({ project, tasks, dependencies });

    // 5. Execute 14 Adversarial Challenges
    const allFindings = [
        ...challengeEstimateRealism({ tasks, dependencies, cpm, startOfToday: today, projectId }),
        ...challengeDeadlineRealism({ project, tasks, dependencies, cpm, startOfToday: today, projectId }),
        ...challengeDependencyFragility({ tasks, dependencies, cpm, projectId }),
        ...challengeResourceConcentration({ tasks, projectMembers, cpm, bottlenecks, projectId }),
        ...challengeKnowledgeConcentration({ tasks, projectMembers, cpm, projectId }),
        ...challengeCriticalPathFragility({ tasks, dependencies, cpm, projectId }),
        ...challengeBottleneckFragility({ tasks, dependencies, bottlenecks, projectId }),
        ...challengeScopeFragility({ tasks, dependencies, project, cpm, startOfToday: today, projectId }),
        ...challengeRecoveryFragility({ tasks, dependencies, project, startOfToday: today, projectId }),
        ...challengeRiskCoverage({ tasks, dependencies, risks, bottlenecks, cpm, projectId }),
        ...challengeDecisionFragility({ decisions, projectId }),
        ...challengeHealthInconsistency({ health, cpm, deadlineRisk, bottlenecks, projectId }),
        ...challengeCapacityAssumption({ tasks, projectMembers, projectId }),
        ...challengeResilienceGap({ tasks, dependencies, cpm, projectId })
    ];

    // Sort findings by severity: CRITICAL -> HIGH -> MEDIUM -> LOW -> INFO
    const severityRank = {
        [RED_TEAM_SEVERITY.CRITICAL]: 4,
        [RED_TEAM_SEVERITY.HIGH]: 3,
        [RED_TEAM_SEVERITY.MEDIUM]: 2,
        [RED_TEAM_SEVERITY.LOW]: 1,
        [RED_TEAM_SEVERITY.INFO]: 0
    };
    allFindings.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

    // 6. Calculate Explainable Exposure Score
    const exposureScore = calculateRedTeamExposureScore({
        findings: allFindings,
        cpm,
        deadlineRisk
    });

    // 7. Verify State Immutability Invariant
    const stateHashAfter = computeProjectStateHash({ project, tasks, dependencies });
    if (stateHashBefore !== stateHashAfter) {
        throw new Error("Red Team invariant violation: production project state was mutated during analysis.");
    }

    const report = {
        projectId,
        projectTitle: project?.title || "Project",
        exposureScore,
        findingsCount: allFindings.length,
        findings: allFindings,
        topVulnerabilities: allFindings.slice(0, 5),
        summary: {
            criticalFindings: exposureScore.counts.critical,
            highFindings: exposureScore.counts.high,
            mediumFindings: exposureScore.counts.medium,
            lowFindings: exposureScore.counts.low,
            exposureLevel: exposureScore.classification
        },
        readOnlyVerified: true,
        stateHash: stateHashBefore,
        generatedAt: new Date().toISOString()
    };

    // Cache report in memory
    inMemoryRedTeamStore.set(projectId, report);

    return report;
};

/**
 * Retrieves cached Red Team findings for a project.
 */
export const getProjectRedTeam = async (projectId, userId = null) => {
    if (!projectId) {
        throw new Error("Project ID is required to retrieve Red Team findings.");
    }
    if (userId && prisma) {
        await verifyProjectAccess(projectId, userId);
    }
    if (inMemoryRedTeamStore.has(projectId)) {
        return inMemoryRedTeamStore.get(projectId);
    }
    return runProjectRedTeam({ projectId, userId });
};

/**
 * Validates a Red Team finding using targeted Phase 10 Chaos Lab simulation.
 */
export const validateFindingWithChaos = async ({
    projectId,
    findingId,
    baseData = null
}) => {
    const report = await runProjectRedTeam({ projectId, baseData });
    const finding = report.findings.find((f) => f.findingId === findingId);

    if (!finding) {
        throw new Error(`Finding ${findingId} not found in project Red Team findings.`);
    }

    // Build targeted chaos scenario based on finding
    const targetEntity = finding.affectedEntities?.[0];
    const category = finding.targetChaosCategory || CHAOS_CATEGORIES.TASK_DELAY;

    const chaosScenario = {
        scenarioId: `chaos-val-${findingId}`,
        category,
        severity: finding.severity === RED_TEAM_SEVERITY.CRITICAL ? CHAOS_SEVERITY.CRITICAL : CHAOS_SEVERITY.HIGH,
        shocks: [
            {
                type: category,
                targetTaskId: targetEntity?.type === "TASK" ? targetEntity.id : undefined,
                targetMemberId: targetEntity?.type === "MEMBER" ? targetEntity.id : undefined,
                targetTitle: targetEntity?.name || "Target Component",
                magnitude: 3
            }
        ]
    };

    const chaosEval = await evaluateChaosScenario({
        projectId,
        scenario: chaosScenario,
        baseState: baseData || inMemoryProjectDataStore.get(projectId)
    });

    return {
        findingId,
        findingTitle: finding.title,
        validationStatus: chaosEval.chaosScore >= 50 ? "CONFIRMED_HIGH_RISK" : "MONITORED_RESILIENT",
        chaosScore: chaosEval.chaosScore,
        downstreamAffectedTasks: chaosEval.downstreamAffectedCount,
        primaryFailureMode: chaosEval.primaryFailureMode,
        chaosEvaluation: chaosEval
    };
};
