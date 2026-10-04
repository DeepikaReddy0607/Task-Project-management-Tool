import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";

// ============================================================
// CONSTANTS & STATUS TIERS
// ============================================================

export const HEALTH_STATUS = Object.freeze({
    HEALTHY: "HEALTHY",
    WATCH: "WATCH",
    AT_RISK: "AT_RISK",
    CRITICAL: "CRITICAL"
});

export const HEALTH_TREND = Object.freeze({
    IMPROVING: "IMPROVING",
    STABLE: "STABLE",
    DECLINING: "DECLINING"
});

export const DIMENSION_WEIGHTS = Object.freeze({
    schedule: 0.20,
    criticalPath: 0.20,
    execution: 0.15,
    bottlenecks: 0.15,
    dependencies: 0.10,
    workload: 0.10,
    risks: 0.10
});

// In-memory project health history map
const healthHistoryMap = new Map();

/**
 * Determine health status tier from numeric score (0-100).
 * 
 * @param {number} score 
 * @returns {string} Status enum
 */
export const determineHealthStatus = (score) => {
    if (score >= 80) return HEALTH_STATUS.HEALTHY;
    if (score >= 65) return HEALTH_STATUS.WATCH;
    if (score >= 50) return HEALTH_STATUS.AT_RISK;
    return HEALTH_STATUS.CRITICAL;
};

/**
 * Reset or clear health history (useful for tests).
 */
export const clearHealthHistory = (projectId = null) => {
    if (projectId) {
        healthHistoryMap.delete(projectId);
    } else {
        healthHistoryMap.clear();
    }
};

/**
 * Pure deterministic calculation of project health score and dimension breakdowns.
 * 
 * @param {Object} digitalTwin Structured digital twin output
 * @param {Object} [options]
 * @param {number|null} [options.previousScore] Optional explicit previous score for trend
 * @returns {Object} Full explainable project health scorecard
 */
export const calculateProjectHealth = (digitalTwin, options = {}) => {
    if (!digitalTwin) {
        return {
            score: 100,
            status: HEALTH_STATUS.HEALTHY,
            dimensions: {},
            reasons: ["No project data available."],
            warnings: [],
            strengths: ["Project has no recorded defects."],
            history: { currentScore: 100, previousScore: 100, delta: 0, trend: HEALTH_TREND.STABLE }
        };
    }

    const { project, tasks, dependencies, criticalPath, bottlenecks, team, risks } = digitalTwin;
    const reasons = [];
    const warnings = [];
    const strengths = [];

    // ========================================================
    // 1. SCHEDULE HEALTH (Weight: 20%)
    // ========================================================
    let scheduleScore = 100;
    const scheduleReasons = [];
    const driftDays = Math.max(0, (project?.projectedDurationDays || 0) - (project?.plannedDurationDays || 0));

    if (driftDays > 0) {
        const driftPenalty = Math.min(60, driftDays * 10);
        scheduleScore -= driftPenalty;
        scheduleReasons.push(`Projected duration exceeds planned schedule by ${driftDays} day${driftDays > 1 ? "s" : ""}.`);
        warnings.push(`Schedule drift: +${driftDays} day${driftDays > 1 ? "s" : ""} over planned schedule.`);
    }

    if (tasks?.overdue > 0) {
        const overdueRatio = tasks.incomplete > 0 ? tasks.overdue / tasks.incomplete : 1;
        const overduePenalty = Math.min(40, Math.round(overdueRatio * 40));
        scheduleScore -= overduePenalty;
        scheduleReasons.push(`${tasks.overdue} task${tasks.overdue > 1 ? "s are" : " is"} currently overdue.`);
        warnings.push(`${tasks.overdue} overdue task${tasks.overdue > 1 ? "s require" : " requires"} urgent resolution.`);
    }

    if (scheduleScore >= 90) {
        scheduleReasons.push("Project timeline and milestones are on track with zero overdue tasks.");
        strengths.push("Schedule is executing strictly according to planned timeline.");
    }
    scheduleScore = Math.max(0, Math.min(100, Math.round(scheduleScore)));

    // ========================================================
    // 2. CRITICAL PATH HEALTH (Weight: 20%)
    // ========================================================
    let criticalPathScore = 100;
    const criticalPathReasons = [];

    if (criticalPath?.hasCycle) {
        criticalPathScore = 0;
        criticalPathReasons.push("Dependency cycle detected. Critical path calculations are blocked.");
        warnings.push("Circular dependency deadlocks the schedule!");
    } else {
        // Overdue critical tasks penalty
        const overdueCriticalCount = (criticalPath?.criticalTasks || []).filter((id) => {
            const memberOverdue = (team?.members || []).some((m) => m.overdueCount > 0);
            return tasks?.overdue > 0 && memberOverdue;
        }).length;

        // If tasks.overdue > 0 and critical tasks exist
        let estimatedOverdueCritical = 0;
        if (tasks?.overdue > 0 && (criticalPath?.criticalTasks || []).length > 0) {
            // Count from bottlenecks or direct overdue count
            estimatedOverdueCritical = Math.min(tasks.overdue, (criticalPath.criticalTasks || []).length);
        }

        if (estimatedOverdueCritical > 0) {
            const penalty = Math.min(60, estimatedOverdueCritical * 25);
            criticalPathScore -= penalty;
            criticalPathReasons.push(`${estimatedOverdueCritical} critical path task${estimatedOverdueCritical > 1 ? "s are" : " is"} overdue.`);
            warnings.push("Overdue work is directly sitting on the critical path.");
        }

        if ((criticalPath?.criticalTasks || []).length === 0 && (tasks?.total || 0) > 0) {
            criticalPathReasons.push("All tasks have slack or are completed.");
        } else if (criticalPathScore >= 90) {
            criticalPathReasons.push("Critical path is unblocked with healthy progression.");
            strengths.push("Critical path tasks are advancing without delay.");
        }
    }
    criticalPathScore = Math.max(0, Math.min(100, Math.round(criticalPathScore)));

    // ========================================================
    // 3. EXECUTION HEALTH (Weight: 15%)
    // ========================================================
    let executionScore = 100;
    const executionReasons = [];

    if (tasks?.incomplete > 0) {
        if (tasks.overdue > 0) {
            const overdueRatio = tasks.overdue / tasks.incomplete;
            const penalty = Math.min(50, Math.round(overdueRatio * 50));
            executionScore -= penalty;
            executionReasons.push(`${Math.round(overdueRatio * 100)}% of pending tasks are overdue.`);
        }
        if (tasks.blocked > 0) {
            const blockedRatio = tasks.blocked / tasks.incomplete;
            const penalty = Math.min(30, Math.round(blockedRatio * 30));
            executionScore -= penalty;
            executionReasons.push(`${tasks.blocked} task${tasks.blocked > 1 ? "s are" : " is"} blocked waiting on prerequisites.`);
            warnings.push(`${tasks.blocked} task${tasks.blocked > 1 ? "s are" : " is"} blocked by unfinished dependencies.`);
        }
    }

    if (tasks?.completed > 0 && tasks.total > 0 && executionScore >= 85) {
        executionReasons.push(`Task completion rate is at ${tasks.completionPercentage}%.`);
        strengths.push(`${tasks.completionPercentage}% of project tasks are already completed.`);
    } else if (executionScore >= 90) {
        executionReasons.push("All active tasks are proceeding smoothly without blockers.");
    }
    executionScore = Math.max(0, Math.min(100, Math.round(executionScore)));

    // ========================================================
    // 4. BOTTLENECK HEALTH (Weight: 15%)
    // ========================================================
    let bottleneckScore = 100;
    const bottleneckReasons = [];
    const bnDist = bottlenecks?.distribution || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    const bnPenalty = (bnDist.CRITICAL * 30) + (bnDist.HIGH * 18) + (bnDist.MEDIUM * 8) + (bnDist.LOW * 2);
    if (bnPenalty > 0) {
        bottleneckScore -= Math.min(85, bnPenalty);
        if (bnDist.CRITICAL > 0) {
            bottleneckReasons.push(`${bnDist.CRITICAL} CRITICAL bottleneck${bnDist.CRITICAL > 1 ? "s" : ""} severely obstructing downstream progress.`);
            warnings.push(`High bottleneck pressure: ${bnDist.CRITICAL} critical bottleneck(s).`);
        }
        if (bnDist.HIGH > 0) {
            bottleneckReasons.push(`${bnDist.HIGH} HIGH bottleneck${bnDist.HIGH > 1 ? "s" : ""} delaying dependent chains.`);
        }
    } else {
        bottleneckReasons.push("No significant bottlenecks detected across the dependency network.");
        strengths.push("Zero major workflow bottlenecks detected.");
    }
    bottleneckScore = Math.max(0, Math.min(100, Math.round(bottleneckScore)));

    // ========================================================
    // 5. DEPENDENCY HEALTH (Weight: 10%)
    // ========================================================
    let dependencyScore = 100;
    const dependencyReasons = [];

    if (dependencies?.hasCycle) {
        dependencyScore = 0;
        dependencyReasons.push("Circular dependencies create an unresolvable graph cycle.");
    } else {
        if (dependencies?.blockedChains > 0) {
            const penalty = Math.min(50, dependencies.blockedChains * 10);
            dependencyScore -= penalty;
            dependencyReasons.push(`${dependencies.blockedChains} dependency chain${dependencies.blockedChains > 1 ? "s are" : " is"} currently blocked.`);
        }
        if (dependencyScore >= 90) {
            dependencyReasons.push("Dependency graph is well-structured with clean topological flow.");
            strengths.push("Clean dependency flow with zero structural defects.");
        }
    }
    dependencyScore = Math.max(0, Math.min(100, Math.round(dependencyScore)));

    // ========================================================
    // 6. WORKLOAD HEALTH (Weight: 10%)
    // ========================================================
    let workloadScore = 100;
    const workloadReasons = [];

    if (team?.unassignedCriticalCount > 0) {
        const penalty = Math.min(50, team.unassignedCriticalCount * 25);
        workloadScore -= penalty;
        workloadReasons.push(`${team.unassignedCriticalCount} critical path task${team.unassignedCriticalCount > 1 ? "s have" : " has"} no assigned owner.`);
        warnings.push("Critical tasks lack assigned owners.");
    }

    // Check workload concentration
    const members = team?.members || [];
    if (members.length > 1) {
        const totalRemaining = members.reduce((sum, m) => sum + (m.remainingHours || 0), 0);
        const maxMemberHours = Math.max(...members.map((m) => m.remainingHours || 0), 0);
        if (totalRemaining > 0 && (maxMemberHours / totalRemaining) > 0.60) {
            workloadScore -= 20;
            const topMember = members.find((m) => m.remainingHours === maxMemberHours);
            workloadReasons.push(`High workload concentration: ${topMember?.name || "One member"} holds ${Math.round((maxMemberHours / totalRemaining) * 100)}% of remaining project hours.`);
            warnings.push("Workload is heavily concentrated on a single team member.");
        }
    }

    if (workloadScore >= 90) {
        workloadReasons.push("Workload is balanced across project members with all critical tasks assigned.");
        strengths.push("Workload is evenly distributed across team members.");
    }
    workloadScore = Math.max(0, Math.min(100, Math.round(workloadScore)));

    // ========================================================
    // 7. RISK HEALTH (Weight: 10%)
    // ========================================================
    let riskScore = 100;
    const riskReasons = [];
    const rDist = risks?.distribution || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    const riskPenalty = (rDist.CRITICAL * 30) + (rDist.HIGH * 15) + (rDist.MEDIUM * 5);
    if (riskPenalty > 0) {
        riskScore -= Math.min(80, riskPenalty);
        if (rDist.CRITICAL > 0) {
            riskReasons.push(`${rDist.CRITICAL} CRITICAL open risk${rDist.CRITICAL > 1 ? "s" : ""} recorded for this project.`);
            warnings.push(`${rDist.CRITICAL} critical project risk(s) require active mitigation.`);
        }
        if (rDist.HIGH > 0) {
            riskReasons.push(`${rDist.HIGH} HIGH open risk${rDist.HIGH > 1 ? "s" : ""} require attention.`);
        }
    } else {
        riskScore = 100;
        riskReasons.push("No open critical or high project risks.");
        strengths.push("Project risk register has no active high-severity items.");
    }
    riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

    // ========================================================
    // COMPOSITE HEALTH SCORE
    // ========================================================
    let weightedSum =
        (scheduleScore * DIMENSION_WEIGHTS.schedule) +
        (criticalPathScore * DIMENSION_WEIGHTS.criticalPath) +
        (executionScore * DIMENSION_WEIGHTS.execution) +
        (bottleneckScore * DIMENSION_WEIGHTS.bottlenecks) +
        (dependencyScore * DIMENSION_WEIGHTS.dependencies) +
        (workloadScore * DIMENSION_WEIGHTS.workload) +
        (riskScore * DIMENSION_WEIGHTS.risks);

    let finalScore = Math.round(weightedSum);

    // If there is a cycle, cap maximum score at 40 (CRITICAL)
    if (criticalPath?.hasCycle || dependencies?.hasCycle) {
        finalScore = Math.min(40, finalScore);
    }

    finalScore = Math.max(0, Math.min(100, finalScore));
    const status = determineHealthStatus(finalScore);

    // Collect all negative reasons into top-level reasons
    if (scheduleReasons.length > 0 && scheduleScore < 80) reasons.push(...scheduleReasons);
    if (criticalPathReasons.length > 0 && criticalPathScore < 80) reasons.push(...criticalPathReasons);
    if (bottleneckReasons.length > 0 && bottleneckScore < 80) reasons.push(...bottleneckReasons);
    if (executionReasons.length > 0 && executionScore < 80) reasons.push(...executionReasons);
    if (workloadReasons.length > 0 && workloadScore < 80) reasons.push(...workloadReasons);
    if (riskReasons.length > 0 && riskScore < 80) reasons.push(...riskReasons);
    if (reasons.length === 0) {
        reasons.push("Project health is robust across all evaluated operational dimensions.");
    }

    // ========================================================
    // HEALTH HISTORY & TREND
    // ========================================================
    const projectId = project?.id || "unknown";
    let previousScore = options.previousScore !== undefined ? options.previousScore : null;

    if (previousScore === null && healthHistoryMap.has(projectId)) {
        const historyRecord = healthHistoryMap.get(projectId);
        previousScore = historyRecord.score;
    }

    let delta = 0;
    let trend = HEALTH_TREND.STABLE;

    if (previousScore !== null) {
        delta = finalScore - previousScore;
        if (delta >= 3) {
            trend = HEALTH_TREND.IMPROVING;
        } else if (delta <= -3) {
            trend = HEALTH_TREND.DECLINING;
        } else {
            trend = HEALTH_TREND.STABLE;
        }
    }

    // Record to in-memory map
    healthHistoryMap.set(projectId, {
        score: finalScore,
        status,
        timestamp: new Date().toISOString()
    });

    return {
        score: finalScore,
        status,
        dimensions: {
            schedule: {
                score: scheduleScore,
                status: determineHealthStatus(scheduleScore),
                weight: DIMENSION_WEIGHTS.schedule,
                reasons: scheduleReasons
            },
            criticalPath: {
                score: criticalPathScore,
                status: determineHealthStatus(criticalPathScore),
                weight: DIMENSION_WEIGHTS.criticalPath,
                reasons: criticalPathReasons
            },
            execution: {
                score: executionScore,
                status: determineHealthStatus(executionScore),
                weight: DIMENSION_WEIGHTS.execution,
                reasons: executionReasons
            },
            bottlenecks: {
                score: bottleneckScore,
                status: determineHealthStatus(bottleneckScore),
                weight: DIMENSION_WEIGHTS.bottlenecks,
                reasons: bottleneckReasons
            },
            dependencies: {
                score: dependencyScore,
                status: determineHealthStatus(dependencyScore),
                weight: DIMENSION_WEIGHTS.dependencies,
                reasons: dependencyReasons
            },
            workload: {
                score: workloadScore,
                status: determineHealthStatus(workloadScore),
                weight: DIMENSION_WEIGHTS.workload,
                reasons: workloadReasons
            },
            risks: {
                score: riskScore,
                status: determineHealthStatus(riskScore),
                weight: DIMENSION_WEIGHTS.risks,
                reasons: riskReasons
            }
        },
        reasons,
        warnings: warnings.slice(0, 5),
        strengths: strengths.slice(0, 5),
        history: {
            currentScore: finalScore,
            previousScore: previousScore !== null ? previousScore : finalScore,
            delta,
            trend
        }
    };
};

/**
 * Fetches database records and computes project health for a user.
 * 
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<Object>} Project health scorecard
 */
export const getProjectHealth = async (projectId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const digitalTwin = await buildDigitalTwinFromDb(projectId, userId);
    return calculateProjectHealth(digitalTwin);
};

// Internal helper for fetching
export const buildDigitalTwinFromDb = async (projectId, userId) => {
    const { getProjectDigitalTwin } = await import("./digitalTwinService.js");
    return getProjectDigitalTwin(projectId, userId);
};

export default {
    HEALTH_STATUS,
    HEALTH_TREND,
    DIMENSION_WEIGHTS,
    determineHealthStatus,
    calculateProjectHealth,
    getProjectHealth,
    clearHealthHistory
};
