import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { calculateCriticalPath } from "./criticalPathService.js";
import { detectBottlenecks, BOTTLENECK_SEVERITIES } from "./bottleneckService.js";
import { createProactiveAlert, ALERT_SEVERITY } from "./quackieAlertService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth } from "./projectHealthService.js";
import { calculateScheduleDrift } from "./scheduleDriftService.js";
import { calculateDeadlineRisks } from "./deadlineRiskService.js";
import { runPreMortemAnalysis } from "./preMortemService.js";
import { calculateKnowledgeConcentration } from "./teamIntelligenceService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { getProjectScopeIntelligence } from "./scopeIntelligenceService.js";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================
export const INTELLIGENCE_ALERT_TYPES = Object.freeze({
    CRITICAL_PATH_CHANGED: "CRITICAL_PATH_CHANGED",
    NEW_CRITICAL_TASK: "NEW_CRITICAL_TASK",
    CRITICAL_TASK_OVERDUE: "CRITICAL_TASK_OVERDUE",
    BOTTLENECK_ESCALATED: "BOTTLENECK_ESCALATED",
    NEW_MAJOR_BOTTLENECK: "NEW_MAJOR_BOTTLENECK",
    PROJECT_DURATION_INCREASED: "PROJECT_DURATION_INCREASED",
    CYCLE_DETECTED: "CYCLE_DETECTED",
    // Phase 2 Alert Types
    SCHEDULE_DRIFT_DETECTED: "SCHEDULE_DRIFT_DETECTED",
    PROJECT_HEALTH_DEGRADED: "PROJECT_HEALTH_DEGRADED",
    PROJECT_HEALTH_CRITICAL: "PROJECT_HEALTH_CRITICAL",
    DEADLINE_RISK_ESCALATED: "DEADLINE_RISK_ESCALATED",
    PREMORTEM_HIGH_RISK_DETECTED: "PREMORTEM_HIGH_RISK_DETECTED",
    WORKLOAD_CONCENTRATION_DETECTED: "WORKLOAD_CONCENTRATION_DETECTED",
    KNOWLEDGE_CONCENTRATION_DETECTED: "KNOWLEDGE_CONCENTRATION_DETECTED",
    // Phase 3 Alert Types
    REPLANNING_OPPORTUNITY_DETECTED: "REPLANNING_OPPORTUNITY_DETECTED",
    DEADLINE_RECOVERY_AVAILABLE: "DEADLINE_RECOVERY_AVAILABLE",
    PROPOSAL_STALE: "PROPOSAL_STALE",
    // Phase 5 Alert Types
    FORECAST_DEADLINE_PROBABILITY_DROP: "FORECAST_DEADLINE_PROBABILITY_DROP",
    HIGH_FORECAST_UNCERTAINTY: "HIGH_FORECAST_UNCERTAINTY",
    RESOURCE_CONFLICT_DETECTED: "RESOURCE_CONFLICT_DETECTED",
    PORTFOLIO_RISK_ESCALATED: "PORTFOLIO_RISK_ESCALATED",
    SCOPE_PRESSURE_ESCALATED: "SCOPE_PRESSURE_ESCALATED",
    // Phase 6 Alert Types
    CRITICAL_ACTION_REQUIRED: "CRITICAL_ACTION_REQUIRED",
    APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
    BLOCKER_ESCALATED: "BLOCKER_ESCALATED",
    DAILY_BRIEFING_READY: "DAILY_BRIEFING_READY"
});

export const BOTTLENECK_SEVERITY_ORDER = Object.freeze({
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4
});

// In-memory project baseline state cache & debounce timers
const projectBaselines = new Map();
const debounceTimers = new Map();

/**
 * Format a date as YYYY-MM-DD for dedupe keys (UTC)
 */
export const formatDateKey = (date = new Date()) => {
    if (!date) return new Date().toISOString().slice(0, 10);
    return new Date(date).toISOString().slice(0, 10);
};

/**
 * Baseline cache helpers
 */
export const getProjectBaseline = (projectId) => projectBaselines.get(projectId) || null;
export const setProjectBaseline = (projectId, state) => projectBaselines.set(projectId, state);
export const clearProjectBaseline = (projectId) => projectBaselines.delete(projectId);
export const clearAllBaselines = () => {
    projectBaselines.clear();
    debounceTimers.forEach((timer) => clearTimeout(timer));
    debounceTimers.clear();
};

/**
 * Compute an in-memory snapshot of a project's CPM & bottleneck state.
 * Pure deterministic transformation without side effects.
 */
export const extractIntelligenceSnapshot = ({
    project = null,
    tasks = [],
    dependencies = null,
    cpmResult = null,
    bottleneckResult = null,
    forecastResult = null,
    scopeResult = null,
    resourceResult = null,
    portfolioResult = null,
    nextActionsResult = null,
    coordinationResult = null,
    standupResult = null,
    nextActions = null,
    coordination = null,
    standup = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const effNextActions = nextActionsResult || nextActions;
    const effCoordination = coordinationResult || coordination;
    const effStandup = standupResult || standup;
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const projectId = project?.id || activeTasks[0]?.project_id || "unknown-project";
    const projectTitle = project?.title || "Project";

    // 1. Calculate CPM
    const cpm = cpmResult || calculateCriticalPath({
        project,
        tasks: activeTasks,
        dependencies,
        startOfToday
    });

    const tasksMap = new Map();
    activeTasks.forEach((t) => tasksMap.set(t.id, t));

    // Handle Cycle
    if (cpm.hasCycle) {
        const cycleNodeIds = [...(cpm.cycleNodes || [])]
            .map((n) => (typeof n === "string" ? n : n.taskId))
            .sort();
        const cycleNodes = cycleNodeIds.map((id) => {
            const task = tasksMap.get(id);
            return {
                taskId: id,
                title: task?.title || id
            };
        });

        return {
            projectId,
            projectTitle,
            hasCycle: true,
            cycleNodeIds,
            cycleNodes,
            projectCriticalPathDays: 0,
            criticalPathTaskIds: [],
            criticalPath: [],
            criticalTaskIds: new Set(),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap,
            healthScore: 0,
            healthStatus: "CRITICAL",
            driftDays: 0,
            driftSeverity: "CRITICAL",
            deadlineRiskTaskIds: new Set(),
            preMortemTypes: new Set(["DEPENDENCY_CYCLES"]),
            workloadConcentratedUserIds: new Set(),
            forecastDeadlineProbability: 0.0,
            forecastUncertainty: "HIGH",
            scopePressure: "CRITICAL",
            highPressureUserIds: new Set(),
            portfolioRiskStatus: "CRITICAL",
            hasCriticalAction: false,
            hasPendingApprovals: false,
            blockedCriticalTaskIds: new Set()
        };
    }

    // 2. Calculate Bottlenecks
    const bottlenecksData = bottleneckResult || detectBottlenecks({
        project,
        tasks: activeTasks,
        dependencies,
        cpmResult: cpm,
        startOfToday
    });

    const rawCp = cpm.criticalPath || [];
    const criticalPathTaskIds = rawCp.map((item) =>
        typeof item === "string" ? item : item.taskId || item.id
    );
    const criticalPath = criticalPathTaskIds.map((id) => {
        const t = tasksMap.get(id);
        return {
            taskId: id,
            title: t?.title || id
        };
    });
    const criticalTaskIds = new Set(cpm.criticalTaskIds || []);

    // Overdue critical tasks
    const overdueCriticalTaskIds = new Set();
    criticalTaskIds.forEach((taskId) => {
        const task = tasksMap.get(taskId);
        if (task && task.status !== "Completed" && task.due_date) {
            const due = new Date(task.due_date);
            if (due < startOfToday) {
                overdueCriticalTaskIds.add(taskId);
            }
        }
    });

    // Bottlenecks map
    const bottlenecksMap = new Map();
    (bottlenecksData.bottlenecks || []).forEach((bn) => {
        bottlenecksMap.set(bn.taskId, {
            taskId: bn.taskId,
            title: bn.title,
            severity: bn.severity,
            score: bn.score,
            isCritical: bn.isCritical,
            directCount: bn.reach?.directCount ?? bn.blockedTasksCount ?? 0,
            transitiveCount: bn.reach?.transitiveCount ?? 0
        });
    });

    const digitalTwin = buildDigitalTwin({
        project,
        tasks: activeTasks,
        dependencies,
        cpmResult: cpm,
        bottleneckResult: bottlenecksData,
        startOfToday
    });

    const health = calculateProjectHealth(digitalTwin);
    const drift = calculateScheduleDrift(digitalTwin, startOfToday);
    const deadlineRisks = calculateDeadlineRisks(digitalTwin, startOfToday);
    const preMortem = runPreMortemAnalysis(digitalTwin, startOfToday);
    const resilience = calculateKnowledgeConcentration(digitalTwin);

    const deadlineRiskTaskIds = new Set(
        deadlineRisks
            .filter((r) => r.riskLevel === "CRITICAL" || r.riskLevel === "HIGH")
            .map((r) => r.taskId)
    );

    const preMortemTypes = new Set(
        (preMortem.findings || [])
            .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
            .map((f) => f.type)
    );

    const workloadConcentratedUserIds = new Set(
        (resilience.affectedUsers || []).map((u) => u.userId)
    );

    return {
        projectId,
        projectTitle,
        hasCycle: false,
        cycleNodeIds: [],
        cycleNodes: [],
        projectCriticalPathDays: cpm.projectCriticalPathDays || 0,
        criticalPathTaskIds,
        criticalPath,
        criticalTaskIds,
        overdueCriticalTaskIds,
        bottlenecks: bottlenecksMap,
        tasksMap,
        healthScore: health.score,
        healthStatus: health.status,
        driftDays: drift.deltaDays,
        driftSeverity: drift.severity,
        deadlineRiskTaskIds,
        preMortemTypes,
        workloadConcentratedUserIds,
        forecastDeadlineProbability: forecastResult?.deadlineProbability ?? 1.0,
        forecastUncertainty: forecastResult?.uncertaintySpread?.uncertaintyLevel || "LOW",
        scopePressure: scopeResult?.scopePressure || "LOW",
        highPressureUserIds: new Set((resourceResult?.members || []).filter((m) => (m.pressureScore ?? 0) >= 75).map((m) => m.userId || m.id)),
        portfolioRiskStatus: portfolioResult?.riskStatus || null,
        hasCriticalAction: (effNextActions?.actions || []).some((a) => (a.priorityScore ?? 0) >= 80) || Boolean(effCoordination?.hasCriticalAction),
        hasPendingApprovals: ((effCoordination?.pendingApprovalsCount ?? (effCoordination?.approvalQueue?.length || 0)) > 0) || Boolean(effCoordination?.hasPendingApprovals),
        blockedCriticalTaskIds: new Set(
            (effStandup?.blocked || []).map((b) => b.taskId || b.id)
        )
    };
};

/**
 * Pure state transition detector.
 * Compares previousState and currentState, evaluating the 7 deterministic change detectors.
 * Returns an array of raw alert descriptors.
 */
export const detectIntelligenceStateTransitions = ({
    projectId,
    projectTitle = "Project",
    previousState = null,
    currentState = null,
    dateKey = formatDateKey()
}) => {
    if (!currentState) return [];
    if (!previousState) {
        // Cold-start / baseline initialization: no alerts to prevent historic blast
        return [];
    }

    const alerts = [];
    const projId = projectId || currentState.projectId;
    const projTitle = projectTitle || currentState.projectTitle || "Project";

    // -------------------------------------------------------------
    // DETECTOR 7: CYCLE_DETECTED
    // Transition from hasCycle: false -> hasCycle: true
    // -------------------------------------------------------------
    if (!previousState.hasCycle && currentState.hasCycle) {
        const cycleHash = (currentState.cycleNodeIds || []).join(",");
        const cycleTitles = (currentState.cycleNodes || [])
            .map((n) => `"${n.title}"`)
            .join(", ") || "multiple tasks";

        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.CYCLE_DETECTED,
            severity: ALERT_SEVERITY.CRITICAL,
            title: "Circular Dependency Detected",
            message: `Circular dependency detected in "${projTitle}" involving task(s): ${cycleTitles}. Schedule calculations are blocked.`,
            projectId: projId,
            taskId: currentState.cycleNodeIds?.[0] || null,
            dedupeKey: `cycle-detected:${projId}:${cycleHash}`,
            targetTask: currentState.tasksMap.get(currentState.cycleNodeIds?.[0]) || null
        });

        // When a cycle exists, schedule and bottleneck algorithms are blocked
        return alerts;
    }

    // If current state has a cycle, suppress schedule alerts
    if (currentState.hasCycle) {
        return alerts;
    }

    // -------------------------------------------------------------
    // DETECTOR 1: CRITICAL_PATH_CHANGED
    // Sequence of tasks on critical path changed
    // -------------------------------------------------------------
    const prevCpIds = previousState.criticalPathTaskIds || [];
    const currCpIds = currentState.criticalPathTaskIds || [];

    if (
        !previousState.hasCycle &&
        prevCpIds.length > 0 &&
        currCpIds.length > 0 &&
        prevCpIds.join(",") !== currCpIds.join(",")
    ) {
        const prevHash = prevCpIds.join(",");
        const newHash = currCpIds.join(",");
        const prevPathSummary = (previousState.criticalPath || []).map((n) => n.title).join(" ➔ ") || prevHash;
        const newPathSummary = (currentState.criticalPath || []).map((n) => n.title).join(" ➔ ") || newHash;

        const durationIncreased = currentState.projectCriticalPathDays > previousState.projectCriticalPathDays;

        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.CRITICAL_PATH_CHANGED,
            severity: durationIncreased ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.WARNING,
            title: "Critical Path Changed",
            message: `Critical path for project "${projTitle}" changed: ${prevPathSummary} ➔ ${newPathSummary}`,
            projectId: projId,
            taskId: null,
            dedupeKey: `cp-changed:${projId}:${prevHash}:${newHash}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 6: PROJECT_DURATION_INCREASED
    // Projected completion days increases
    // -------------------------------------------------------------
    if (
        !previousState.hasCycle &&
        previousState.projectCriticalPathDays > 0 &&
        currentState.projectCriticalPathDays > previousState.projectCriticalPathDays
    ) {
        const prevDur = previousState.projectCriticalPathDays;
        const newDur = currentState.projectCriticalPathDays;
        const diff = newDur - prevDur;

        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.PROJECT_DURATION_INCREASED,
            severity: ALERT_SEVERITY.HIGH,
            title: "Project Duration Increased",
            message: `Projected completion for "${projTitle}" increased by ${diff} day${diff > 1 ? "s" : ""} (from ${prevDur}d to ${newDur}d).`,
            projectId: projId,
            taskId: null,
            dedupeKey: `duration-inc:${projId}:${prevDur}:${newDur}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 2: NEW_CRITICAL_TASK
    // Task was not critical in previous state, now critical (slack 0)
    // -------------------------------------------------------------
    currentState.criticalTaskIds.forEach((taskId) => {
        if (!previousState.criticalTaskIds.has(taskId)) {
            const task = currentState.tasksMap.get(taskId);
            const taskTitle = task?.title || taskId;

            alerts.push({
                type: INTELLIGENCE_ALERT_TYPES.NEW_CRITICAL_TASK,
                severity: ALERT_SEVERITY.WARNING,
                title: "New Critical Task",
                message: `Task "${taskTitle}" is now on the critical path with zero slack.`,
                projectId: projId,
                taskId,
                dedupeKey: `new-critical:${projId}:${taskId}:${dateKey}`,
                targetTask: task || null
            });
        }
    });

    // -------------------------------------------------------------
    // DETECTOR 3: CRITICAL_TASK_OVERDUE
    // Critical task transitions from non-overdue to overdue
    // -------------------------------------------------------------
    currentState.overdueCriticalTaskIds.forEach((taskId) => {
        if (!previousState.overdueCriticalTaskIds.has(taskId)) {
            const task = currentState.tasksMap.get(taskId);
            const taskTitle = task?.title || taskId;

            alerts.push({
                type: INTELLIGENCE_ALERT_TYPES.CRITICAL_TASK_OVERDUE,
                severity: ALERT_SEVERITY.CRITICAL,
                title: "Critical Task Overdue",
                message: `Critical task "${taskTitle}" is overdue! This is directly delaying the project completion date.`,
                projectId: projId,
                taskId,
                dedupeKey: `crit-overdue:${projId}:${taskId}:${dateKey}`,
                targetTask: task || null
            });
        }
    });

    // -------------------------------------------------------------
    // DETECTOR 4 & 5: BOTTLENECK ESCALATION & NEW MAJOR BOTTLENECK
    // -------------------------------------------------------------
    currentState.bottlenecks.forEach((currBn, taskId) => {
        const prevBn = previousState.bottlenecks.get(taskId);
        const task = currentState.tasksMap.get(taskId);
        const taskTitle = task?.title || currBn.title || taskId;

        const isMajorCurr =
            currBn.severity === BOTTLENECK_SEVERITIES.MEDIUM ||
            currBn.severity === BOTTLENECK_SEVERITIES.HIGH ||
            currBn.severity === BOTTLENECK_SEVERITIES.CRITICAL;

        if (isMajorCurr) {
            if (!prevBn || prevBn.severity === BOTTLENECK_SEVERITIES.LOW) {
                // DETECTOR 5: NEW_MAJOR_BOTTLENECK
                const blockedCount = currBn.directCount || currBn.transitiveCount || 1;
                const notifSev =
                    currBn.severity === BOTTLENECK_SEVERITIES.CRITICAL
                        ? ALERT_SEVERITY.CRITICAL
                        : currBn.severity === BOTTLENECK_SEVERITIES.HIGH
                        ? ALERT_SEVERITY.HIGH
                        : ALERT_SEVERITY.WARNING;

                alerts.push({
                    type: INTELLIGENCE_ALERT_TYPES.NEW_MAJOR_BOTTLENECK,
                    severity: notifSev,
                    title: "New Bottleneck Detected",
                    message: `Task "${taskTitle}" has emerged as a ${currBn.severity} bottleneck blocking ${blockedCount} downstream task${blockedCount === 1 ? "" : "s"}.`,
                    projectId: projId,
                    taskId,
                    dedupeKey: `new-major-bn:${projId}:${taskId}:${currBn.severity}`,
                    targetTask: task || null
                });
            } else {
                // DETECTOR 4: BOTTLENECK_ESCALATED
                const prevRank = BOTTLENECK_SEVERITY_ORDER[prevBn.severity] || 0;
                const currRank = BOTTLENECK_SEVERITY_ORDER[currBn.severity] || 0;

                if (currRank > prevRank) {
                    const notifSev =
                        currBn.severity === BOTTLENECK_SEVERITIES.CRITICAL
                            ? ALERT_SEVERITY.CRITICAL
                            : ALERT_SEVERITY.HIGH;

                    alerts.push({
                        type: INTELLIGENCE_ALERT_TYPES.BOTTLENECK_ESCALATED,
                        severity: notifSev,
                        title: "Bottleneck Escalated",
                        message: `Task "${taskTitle}" bottleneck escalated from ${prevBn.severity} to ${currBn.severity} (Score: ${currBn.score}).`,
                        projectId: projId,
                        taskId,
                        dedupeKey: `bn-escalated:${projId}:${taskId}:${prevBn.severity}:${currBn.severity}`,
                        targetTask: task || null
                    });
                }
            }
        }
    });

    // -------------------------------------------------------------
    // DETECTOR 8: SCHEDULE_DRIFT_DETECTED
    // Variance in days increases by >= 2 days or enters HIGH/CRITICAL
    // -------------------------------------------------------------
    if (
        !currentState.hasCycle &&
        currentState.driftDays !== undefined &&
        currentState.driftDays > 0
    ) {
        const prevDrift = previousState.driftDays || 0;
        const driftDiff = currentState.driftDays - prevDrift;
        const severityEscalated =
            (currentState.driftSeverity === "HIGH" || currentState.driftSeverity === "CRITICAL") &&
            previousState.driftSeverity !== currentState.driftSeverity;

        if (driftDiff >= 2 || severityEscalated) {
            alerts.push({
                type: INTELLIGENCE_ALERT_TYPES.SCHEDULE_DRIFT_DETECTED,
                severity: currentState.driftSeverity === "CRITICAL" ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
                title: "Schedule Drift Detected",
                message: `Project "${projTitle}" schedule has drifted by ${currentState.driftDays} days past the planned deadline.`,
                projectId: projId,
                taskId: null,
                dedupeKey: `drift-detected:${projId}:${currentState.driftDays}:${dateKey}`,
                targetTask: null
            });
        }
    }

    // -------------------------------------------------------------
    // DETECTOR 9: PROJECT_HEALTH_DEGRADED
    // Score dropped by >= 5 points
    // -------------------------------------------------------------
    if (
        previousState.healthScore !== undefined &&
        currentState.healthScore !== undefined &&
        (previousState.healthScore - currentState.healthScore) >= 5
    ) {
        const drop = previousState.healthScore - currentState.healthScore;
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.PROJECT_HEALTH_DEGRADED,
            severity: currentState.healthStatus === "CRITICAL" ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
            title: "Project Health Degraded",
            message: `Project "${projTitle}" health score dropped by ${drop} points (from ${previousState.healthScore} to ${currentState.healthScore} — ${currentState.healthStatus}).`,
            projectId: projId,
            taskId: null,
            dedupeKey: `health-degraded:${projId}:${previousState.healthScore}:${currentState.healthScore}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 10: PROJECT_HEALTH_CRITICAL
    // Project transitioned into CRITICAL health tier
    // -------------------------------------------------------------
    if (
        currentState.healthStatus === "CRITICAL" &&
        previousState.healthStatus !== "CRITICAL"
    ) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.PROJECT_HEALTH_CRITICAL,
            severity: ALERT_SEVERITY.CRITICAL,
            title: "Project Health Critical",
            message: `Project "${projTitle}" health has entered CRITICAL status (Score: ${currentState.healthScore}/100). Immediate intervention required.`,
            projectId: projId,
            taskId: null,
            dedupeKey: `health-critical:${projId}:${currentState.healthScore}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 11: DEADLINE_RISK_ESCALATED
    // New tasks flagged as critical/high deadline risk
    // -------------------------------------------------------------
    if (currentState.deadlineRiskTaskIds && previousState.deadlineRiskTaskIds) {
        currentState.deadlineRiskTaskIds.forEach((taskId) => {
            if (!previousState.deadlineRiskTaskIds.has(taskId)) {
                const task = currentState.tasksMap.get(taskId);
                const taskTitle = task?.title || taskId;
                alerts.push({
                    type: INTELLIGENCE_ALERT_TYPES.DEADLINE_RISK_ESCALATED,
                    severity: ALERT_SEVERITY.HIGH,
                    title: "Deadline Risk Escalated",
                    message: `Task "${taskTitle}" is now directly endangering the project deadline.`,
                    projectId: projId,
                    taskId,
                    dedupeKey: `deadline-risk:${projId}:${taskId}:${dateKey}`,
                    targetTask: task || null
                });
            }
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 12: PREMORTEM_HIGH_RISK_DETECTED
    // New high/critical pre-mortem condition detected
    // -------------------------------------------------------------
    if (currentState.preMortemTypes && previousState.preMortemTypes) {
        currentState.preMortemTypes.forEach((condType) => {
            if (!previousState.preMortemTypes.has(condType) && condType !== "DEPENDENCY_CYCLES") {
                alerts.push({
                    type: INTELLIGENCE_ALERT_TYPES.PREMORTEM_HIGH_RISK_DETECTED,
                    severity: ALERT_SEVERITY.HIGH,
                    title: "High Pre-Mortem Risk Detected",
                    message: `Predictive pre-mortem identified a high-risk failure condition in "${projTitle}": ${condType.replace(/_/g, " ")}.`,
                    projectId: projId,
                    taskId: null,
                    dedupeKey: `premortem-risk:${projId}:${condType}:${dateKey}`,
                    targetTask: null
                });
            }
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 13: WORKLOAD_CONCENTRATION_DETECTED
    // High critical work concentration on a team member
    // -------------------------------------------------------------
    if (currentState.workloadConcentratedUserIds && previousState.workloadConcentratedUserIds) {
        currentState.workloadConcentratedUserIds.forEach((userId) => {
            if (!previousState.workloadConcentratedUserIds.has(userId)) {
                alerts.push({
                    type: INTELLIGENCE_ALERT_TYPES.WORKLOAD_CONCENTRATION_DETECTED,
                    severity: ALERT_SEVERITY.WARNING,
                    title: "Workload Concentration Detected",
                    message: `High concentration of critical path responsibilities detected on team member in "${projTitle}".`,
                    projectId: projId,
                    taskId: null,
                    dedupeKey: `workload-conc:${projId}:${userId}:${dateKey}`,
                    targetTask: null
                });
            }
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 14: REPLANNING_OPPORTUNITY_DETECTED
    // Triggered when schedule drift crosses threshold (>= 3 days)
    // or project health drops into AT_RISK or CRITICAL (< 60)
    // -------------------------------------------------------------
    const currDrift = currentState.driftDays || 0;
    const prevDrift = previousState.driftDays || 0;
    const currHealth = currentState.healthScore !== undefined ? currentState.healthScore : 100;
    const prevHealth = previousState.healthScore !== undefined ? previousState.healthScore : 100;

    const driftTriggered = currDrift >= 3 && prevDrift < 3;
    const healthTriggered = currHealth < 60 && prevHealth >= 60;

    if (!currentState.hasCycle && (driftTriggered || healthTriggered)) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.REPLANNING_OPPORTUNITY_DETECTED,
            severity: ALERT_SEVERITY.INFO,
            title: "Replanning Opportunity Available",
            message: `Schedule delay detected in "${projTitle}". Intelligent replanning options are available to recover the deadline.`,
            projectId: projId,
            taskId: null,
            dedupeKey: `replanning-opp:${projId}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 15: FORECAST_DEADLINE_PROBABILITY_DROP
    // Probability of meeting deadline drops significantly (prev >= 0.70 and curr < 0.60, or drops by >= 0.25)
    // -------------------------------------------------------------
    const prevProb = previousState.forecastDeadlineProbability !== undefined ? previousState.forecastDeadlineProbability : 1.0;
    const currProb = currentState.forecastDeadlineProbability !== undefined ? currentState.forecastDeadlineProbability : 1.0;
    if ((prevProb >= 0.70 && currProb < 0.60) || (prevProb - currProb >= 0.25)) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.FORECAST_DEADLINE_PROBABILITY_DROP,
            severity: currProb < 0.40 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
            title: "Forecast Deadline Probability Drop",
            message: `Monte Carlo forecast probability of meeting deadline for "${projTitle}" dropped from ${Math.round(prevProb * 100)}% to ${Math.round(currProb * 100)}%.`,
            projectId: projId,
            taskId: null,
            dedupeKey: `forecast-drop:${projId}:${Math.round(currProb * 100)}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 16: HIGH_FORECAST_UNCERTAINTY
    // Uncertainty transitions to HIGH
    // -------------------------------------------------------------
    if (
        currentState.forecastUncertainty === "HIGH" &&
        previousState.forecastUncertainty !== "HIGH"
    ) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.HIGH_FORECAST_UNCERTAINTY,
            severity: ALERT_SEVERITY.WARNING,
            title: "High Forecast Uncertainty",
            message: `Completion forecast for "${projTitle}" shows wide variance and high uncertainty spread.`,
            projectId: projId,
            taskId: null,
            dedupeKey: `forecast-uncertainty:${projId}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 17: SCOPE_PRESSURE_ESCALATED
    // Scope pressure transitions to HIGH or CRITICAL
    // -------------------------------------------------------------
    const isHighScopeCurr = currentState.scopePressure === "HIGH" || currentState.scopePressure === "CRITICAL";
    const isHighScopePrev = previousState.scopePressure === "HIGH" || previousState.scopePressure === "CRITICAL";
    if (isHighScopeCurr && !isHighScopePrev) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.SCOPE_PRESSURE_ESCALATED,
            severity: currentState.scopePressure === "CRITICAL" ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
            title: "Scope Pressure Escalated",
            message: `Scope growth rate in "${projTitle}" has escalated to ${currentState.scopePressure} pressure.`,
            projectId: projId,
            taskId: null,
            dedupeKey: `scope-escalated:${projId}:${currentState.scopePressure}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 18: RESOURCE_CONFLICT_DETECTED
    // High resource pressure / conflict detected on team members
    // -------------------------------------------------------------
    if (currentState.highPressureUserIds && previousState.highPressureUserIds) {
        currentState.highPressureUserIds.forEach((userId) => {
            if (!previousState.highPressureUserIds.has(userId)) {
                alerts.push({
                    type: INTELLIGENCE_ALERT_TYPES.RESOURCE_CONFLICT_DETECTED,
                    severity: ALERT_SEVERITY.HIGH,
                    title: "Resource Conflict Detected",
                    message: `High resource pressure or cross-project schedule conflict detected for team member in "${projTitle}".`,
                    projectId: projId,
                    taskId: null,
                    dedupeKey: `resource-conflict:${projId}:${userId}:${dateKey}`,
                    targetTask: null
                });
            }
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 19: PORTFOLIO_RISK_ESCALATED
    // Project escalated to AT_RISK or CRITICAL in portfolio risk
    // -------------------------------------------------------------
    const currRisk = currentState.portfolioRiskStatus;
    const prevRisk = previousState.portfolioRiskStatus;
    const isElevated = currRisk === "AT_RISK" || currRisk === "CRITICAL";
    const wasElevated = prevRisk === "AT_RISK" || prevRisk === "CRITICAL";
    if (isElevated && !wasElevated && currRisk) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.PORTFOLIO_RISK_ESCALATED,
            severity: currRisk === "CRITICAL" ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
            title: "Portfolio Risk Escalated",
            message: `Project "${projTitle}" has escalated to ${currRisk} in the portfolio risk matrix.`,
            projectId: projId,
            taskId: null,
            dedupeKey: `portfolio-escalated:${projId}:${currRisk}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 20: CRITICAL_ACTION_REQUIRED
    // Immediate high-priority action becomes required (score >= 85)
    // -------------------------------------------------------------
    if (currentState.hasCriticalAction && !previousState.hasCriticalAction) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.CRITICAL_ACTION_REQUIRED,
            severity: ALERT_SEVERITY.CRITICAL,
            title: "Critical Action Required",
            message: `A high-priority coordination action is urgently required for project "${projTitle}".`,
            projectId: projId,
            taskId: null,
            dedupeKey: `critical-action:${projId}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 21: APPROVAL_REQUIRED
    // Replanning proposal or decision transitions into pending approval
    // -------------------------------------------------------------
    if (currentState.hasPendingApprovals && !previousState.hasPendingApprovals) {
        alerts.push({
            type: INTELLIGENCE_ALERT_TYPES.APPROVAL_REQUIRED,
            severity: ALERT_SEVERITY.HIGH,
            title: "Approval Required",
            message: `A new replanning proposal or decision requires review and confirmation for "${projTitle}".`,
            projectId: projId,
            taskId: null,
            dedupeKey: `approval-required:${projId}:${dateKey}`,
            targetTask: null
        });
    }

    // -------------------------------------------------------------
    // DETECTOR 22: BLOCKER_ESCALATED
    // A critical path task becomes newly blocked by unfinished dependencies
    // -------------------------------------------------------------
    if (currentState.blockedCriticalTaskIds && previousState.blockedCriticalTaskIds) {
        currentState.blockedCriticalTaskIds.forEach((taskId) => {
            if (!previousState.blockedCriticalTaskIds.has(taskId)) {
                const task = currentState.tasksMap?.get(taskId);
                const taskTitle = task?.title || taskId;
                alerts.push({
                    type: INTELLIGENCE_ALERT_TYPES.BLOCKER_ESCALATED,
                    severity: ALERT_SEVERITY.CRITICAL,
                    title: "Critical Blocker Escalated",
                    message: `Critical path task "${taskTitle}" in "${projTitle}" is blocked by prerequisite dependencies.`,
                    projectId: projId,
                    taskId,
                    dedupeKey: `blocker-escalated:${projId}:${taskId}:${dateKey}`,
                    targetTask: task || null
                });
            }
        });
    }

    return alerts;
};

/**
 * Resolves recipients and dispatches alerts via createProactiveAlert.
 */
export const dispatchIntelligenceAlerts = async ({
    projectId,
    alerts = [],
    prismaClient = prisma,
    createAlert = createProactiveAlert
}) => {
    if (!alerts || alerts.length === 0 || !projectId) return [];

    // Fetch project manager and project members
    const project = await prismaClient.projects.findUnique({
        where: { id: projectId },
        select: {
            id: true,
            title: true,
            manager_id: true,
            project_members: { select: { user_id: true } }
        }
    });

    if (!project) return [];

    const baseRecipients = new Set();
    if (project.manager_id) baseRecipients.add(project.manager_id);
    (project.project_members || []).forEach((m) => {
        if (m.user_id) baseRecipients.add(m.user_id);
    });

    const emittedAlerts = [];

    for (const alert of alerts) {
        const recipients = new Set(baseRecipients);
        if (alert.targetTask?.assigned_to) {
            recipients.add(alert.targetTask.assigned_to);
        }

        for (const userId of recipients) {
            try {
                const emitted = await createAlert({
                    userId,
                    type: alert.type,
                    severity: alert.severity,
                    title: alert.title,
                    message: alert.message,
                    projectId: alert.projectId,
                    taskId: alert.taskId,
                    dedupeKey: alert.dedupeKey,
                    actionable: true
                });
                if (emitted) {
                    emittedAlerts.push(emitted);
                }
            } catch (err) {
                console.warn(`Failed to dispatch alert ${alert.type} to user ${userId}:`, err.message);
            }
        }
    }

    return emittedAlerts;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Evaluates intelligence alerts for a given project against the established baseline.
 */
export const evaluateProjectIntelligenceAlerts = async ({
    projectId,
    previousBaseline = null,
    startOfToday = getStartOfTodayUtc(),
    persist = true,
    prismaClient = prisma,
    createAlert = createProactiveAlert
}) => {
    if (!projectId) return [];

    // If using real PostgreSQL Prisma, validate UUID format to avoid syntax errors
    if (prismaClient === prisma && !UUID_REGEX.test(projectId)) {
        return [];
    }

    try {
        const project = await prismaClient.projects.findUnique({
            where: { id: projectId },
            include: {
                project_members: { select: { user_id: true } }
            }
        });

        if (!project || project.is_archived) return [];

        const [tasks, dependencies] = await Promise.all([
            prismaClient.tasks.findMany({
                where: { project_id: projectId, is_archived: false },
                include: {
                    users_tasks_assigned_toTousers: {
                        select: { id: true, first_name: true, last_name: true, email: true }
                    }
                }
            }),
            prismaClient.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                    tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
                }
            })
        ]);

        let forecastResult = null;
        let scopeResult = null;
        try {
            forecastResult = await runMonteCarloForecast(projectId, {
                runs: 200,
                inMemoryData: { project, tasks, dependencies }
            });
        } catch (_) {}
        try {
            scopeResult = await getProjectScopeIntelligence(projectId, {
                inMemoryData: { project, tasks }
            });
        } catch (_) {}

        const currentState = extractIntelligenceSnapshot({
            project,
            tasks,
            dependencies,
            forecastResult,
            scopeResult,
            startOfToday
        });

        const prev = previousBaseline || getProjectBaseline(projectId);

        // Always update baseline in cache
        setProjectBaseline(projectId, currentState);

        if (!prev) {
            // Cold-start: baseline established without historic blast
            return [];
        }

        const alerts = detectIntelligenceStateTransitions({
            projectId,
            projectTitle: project.title,
            previousState: prev,
            currentState,
            dateKey: formatDateKey(startOfToday)
        });

        if (persist && alerts.length > 0) {
            await dispatchIntelligenceAlerts({
                projectId,
                alerts,
                prismaClient
            });
        }

        return alerts;
    } catch (err) {
        console.error("evaluateProjectIntelligenceAlerts error:", err);
        return [];
    }
};

/**
 * Schedules debounced evaluation for a project (default 400ms).
 * Coalesces rapid successive events on the same project.
 */
export const scheduleProjectIntelligenceEvaluation = ({
    projectId,
    debounceMs = 400
}) => {
    if (!projectId) return null;

    if (debounceTimers.has(projectId)) {
        clearTimeout(debounceTimers.get(projectId));
    }

    const timer = setTimeout(async () => {
        debounceTimers.delete(projectId);
        try {
            await evaluateProjectIntelligenceAlerts({ projectId });
        } catch (err) {
            console.warn(`Debounced alert evaluation error for project ${projectId}:`, err.message);
        }
    }, debounceMs);

    debounceTimers.set(projectId, timer);
    return timer;
};

export default {
    INTELLIGENCE_ALERT_TYPES,
    BOTTLENECK_SEVERITY_ORDER,
    formatDateKey,
    getProjectBaseline,
    setProjectBaseline,
    clearProjectBaseline,
    clearAllBaselines,
    extractIntelligenceSnapshot,
    detectIntelligenceStateTransitions,
    dispatchIntelligenceAlerts,
    evaluateProjectIntelligenceAlerts,
    scheduleProjectIntelligenceEvaluation
};
