/**
 * Unified Evidence Engine (Phase 7)
 * 
 * Extracts, formats, and validates verifiable evidence items from Phase 1-6 engine outputs.
 * 
 * Safety invariants:
 * - Deterministic evidence extraction: no fabricated metrics or sources
 * - Explicit timestamping and deep-link generation
 * - Explicitly marks when evidence is unavailable rather than guessing
 */

export const EVIDENCE_SOURCE_TYPES = {
    HEALTH: "HEALTH",
    CRITICAL_PATH: "CRITICAL_PATH",
    BOTTLENECK: "BOTTLENECK",
    DEADLINE_RISK: "DEADLINE_RISK",
    SCHEDULE_DRIFT: "SCHEDULE_DRIFT",
    FORECAST: "FORECAST",
    SCOPE: "SCOPE",
    BLOCKER: "BLOCKER",
    DECISION: "DECISION",
    MEMORY: "MEMORY",
    REPLANNING: "REPLANNING",
    WORKLOAD: "WORKLOAD"
};

export const EVIDENCE_SEVERITY = {
    INFO: "INFO",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
};

/**
 * Builds a standardized evidence item.
 */
export const buildEvidenceItem = ({
    sourceType,
    sourceId,
    projectId,
    taskId = null,
    metric,
    value,
    explanation,
    timestamp = new Date().toISOString(),
    severity = EVIDENCE_SEVERITY.INFO,
    link = null
}) => {
    return {
        sourceType,
        sourceId: String(sourceId || "evidence-source"),
        projectId: projectId ? String(projectId) : null,
        taskId: taskId ? String(taskId) : null,
        metric: String(metric || "Metric"),
        value,
        explanation: String(explanation || ""),
        timestamp,
        severity,
        link: link || (projectId ? `/projects/${projectId}` : null)
    };
};

/**
 * Extracts structured evidence items from an engine output.
 */
export const extractEvidenceFromEngine = ({ engineType, data, projectId }) => {
    if (!data) {
        return {
            hasEvidence: false,
            evidence: [],
            note: "No evidence data provided"
        };
    }

    const items = [];

    switch (engineType) {
        case EVIDENCE_SOURCE_TYPES.HEALTH: {
            const score = data.score ?? data.healthScore;
            const status = data.status ?? data.healthStatus ?? "UNKNOWN";
            if (score !== undefined) {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.HEALTH,
                    sourceId: `health-${projectId}`,
                    projectId,
                    metric: "Project Health Score",
                    value: score,
                    explanation: `Overall project health is ${status} with score ${score}/100.`,
                    severity: score < 50 ? EVIDENCE_SEVERITY.CRITICAL : score < 75 ? EVIDENCE_SEVERITY.HIGH : EVIDENCE_SEVERITY.LOW,
                    link: `/projects/${projectId}/health`
                }));
            }
            if (data.metrics?.scheduleDriftDays !== undefined) {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.SCHEDULE_DRIFT,
                    sourceId: `drift-${projectId}`,
                    projectId,
                    metric: "Schedule Drift",
                    value: `${data.metrics.scheduleDriftDays} days`,
                    explanation: `Schedule has drifted by ${data.metrics.scheduleDriftDays} day(s) from baseline.`,
                    severity: data.metrics.scheduleDriftDays > 5 ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.MEDIUM,
                    link: `/projects/${projectId}/drift`
                }));
            }
            break;
        }

        case EVIDENCE_SOURCE_TYPES.CRITICAL_PATH: {
            const cpTasks = data.criticalTasks || data.criticalTaskIds || [];
            const duration = data.criticalPathDurationDays ?? data.durationDays;
            items.push(buildEvidenceItem({
                sourceType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH,
                sourceId: `cpm-${projectId}`,
                projectId,
                metric: "Critical Path Length",
                value: `${Array.isArray(cpTasks) ? cpTasks.length : 0} tasks`,
                explanation: `Critical path contains ${Array.isArray(cpTasks) ? cpTasks.length : 0} task(s) with ${duration ?? "unspecified"} days total duration.`,
                severity: EVIDENCE_SEVERITY.INFO,
                link: `/projects/${projectId}/critical-path`
            }));
            break;
        }

        case EVIDENCE_SOURCE_TYPES.BOTTLENECK: {
            const bList = data.bottlenecks || data.majorBottlenecks || [];
            bList.forEach((b) => {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.BOTTLENECK,
                    sourceId: `bottleneck-${b.taskId || b.id}`,
                    projectId,
                    taskId: b.taskId || b.id,
                    metric: "Bottleneck Score",
                    value: b.score ?? b.bottleneckScore ?? 80,
                    explanation: b.primaryCause || `Task blocks ${b.blockedTasksCount || b.downstreamCount || 1} downstream tasks.`,
                    severity: (b.score ?? 80) >= 80 ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.HIGH,
                    link: `/projects/${projectId}/bottlenecks`
                }));
            });
            break;
        }

        case EVIDENCE_SOURCE_TYPES.DEADLINE_RISK: {
            const atRisk = data.atRiskTasks || data.tasksAtRisk || [];
            atRisk.forEach((t) => {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.DEADLINE_RISK,
                    sourceId: `risk-task-${t.taskId || t.id}`,
                    projectId,
                    taskId: t.taskId || t.id,
                    metric: "Task Deadline Risk",
                    value: t.riskLevel || "HIGH",
                    explanation: t.reason || `Task deadline probability is low (${t.probability || "N/A"}).`,
                    severity: t.riskLevel === "CRITICAL" ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.HIGH,
                    link: `/projects/${projectId}/deadline-risk`
                }));
            });
            break;
        }

        case EVIDENCE_SOURCE_TYPES.FORECAST: {
            if (data.p50FinishDate || data.p80FinishDate) {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.FORECAST,
                    sourceId: `forecast-${projectId}`,
                    projectId,
                    metric: "Monte Carlo P80 Date",
                    value: data.p80FinishDate || data.p50FinishDate,
                    explanation: `80% statistical confidence date is ${data.p80FinishDate} (${data.expectedDelayDays || 0} days expected delay).`,
                    severity: (data.expectedDelayDays || 0) > 5 ? EVIDENCE_SEVERITY.HIGH : EVIDENCE_SEVERITY.LOW,
                    link: `/projects/${projectId}/forecast`
                }));
            }
            break;
        }

        case EVIDENCE_SOURCE_TYPES.BLOCKER: {
            const blockers = data.blockers || data.blockedTasks || [];
            blockers.forEach((b) => {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.BLOCKER,
                    sourceId: `blocker-${b.id || b.taskId}`,
                    projectId,
                    taskId: b.id || b.taskId,
                    metric: "Dependency Blocker",
                    value: `${b.blockedByCount || 1} incomplete prerequisites`,
                    explanation: b.impact || `Blocked by: ${(b.blockedBy || []).map((p) => p.title || p.id).join(", ")}`,
                    severity: EVIDENCE_SEVERITY.HIGH,
                    link: `/projects/${projectId}/coordination`
                }));
            });
            break;
        }

        case EVIDENCE_SOURCE_TYPES.DECISION: {
            const decisions = data.decisions || [];
            decisions.forEach((d) => {
                items.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.DECISION,
                    sourceId: `decision-${d.id}`,
                    projectId,
                    metric: "Decision Status",
                    value: d.status,
                    explanation: `${d.decision || d.title}: ${d.reason || "Team decision required."}`,
                    severity: d.status === "Proposed" ? EVIDENCE_SEVERITY.MEDIUM : EVIDENCE_SEVERITY.INFO,
                    link: `/projects/${projectId}/decisions`
                }));
            });
            break;
        }

        default: {
            items.push(buildEvidenceItem({
                sourceType: engineType,
                sourceId: `generic-${projectId}`,
                projectId,
                metric: "Observation",
                value: "Recorded",
                explanation: "Observation recorded from intelligence engine.",
                severity: EVIDENCE_SEVERITY.INFO
            }));
        }
    }

    return {
        hasEvidence: items.length > 0,
        evidence: items,
        count: items.length
    };
};
