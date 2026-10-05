/**
 * Explanation Engine (Phase 7)
 * 
 * Converts deterministic intelligence outputs into structured, explainable narratives.
 * 
 * Invariants:
 * - 100% explainable and traceable to recorded evidence
 * - Explicitly lists contributing factors, affected entities, recommendations, and limitations
 * - Does not invent unsupported causal relationships
 */

import { buildEvidenceItem, EVIDENCE_SOURCE_TYPES, EVIDENCE_SEVERITY } from "./intelligenceEvidenceService.js";

/**
 * Explains Project Health status and breakdown.
 */
export const explainHealth = ({
    healthData = {},
    driftData = null,
    bottlenecksData = null,
    criticalPathData = null,
    projectId = "proj"
}) => {
    const score = healthData.score ?? healthData.healthScore ?? 100;
    const status = healthData.status ?? healthData.healthStatus ?? (score >= 75 ? "HEALTHY" : score >= 50 ? "AT_RISK" : "CRITICAL");
    const driftDays = driftData?.driftDays ?? healthData.metrics?.scheduleDriftDays ?? 0;
    const bottlenecks = bottlenecksData?.bottlenecks || bottlenecksData?.majorBottlenecks || [];

    const findings = [];
    const contributingFactors = [];
    const evidence = [];
    const affectedEntities = [];
    const recommendations = [];
    const limitations = [
        "Health score is a synthesized metric based on current task statuses, drift, and bottleneck counts.",
        "Does not account for external stakeholder dependencies unrecorded in TaskFlow."
    ];

    evidence.push(buildEvidenceItem({
        sourceType: EVIDENCE_SOURCE_TYPES.HEALTH,
        sourceId: `health-${projectId}`,
        projectId,
        metric: "Health Score",
        value: `${score}/100`,
        explanation: `Evaluated status: ${status}`,
        severity: status === "CRITICAL" ? EVIDENCE_SEVERITY.CRITICAL : status === "AT_RISK" ? EVIDENCE_SEVERITY.HIGH : EVIDENCE_SEVERITY.LOW
    }));

    if (status === "HEALTHY") {
        findings.push("Project execution is nominal with zero critical schedule friction.");
        contributingFactors.push("Low or zero schedule drift");
        contributingFactors.push("Active tasks progressing within planned duration");
        recommendations.push({
            action: "Maintain Velocity",
            why: "Execution velocity matches planned project timeline.",
            urgency: "LOW"
        });
    } else {
        if (driftDays > 0) {
            findings.push(`Schedule drift has accumulated to ${driftDays} day(s) beyond baseline.`);
            contributingFactors.push(`Schedule drift of ${driftDays} days`);
            evidence.push(buildEvidenceItem({
                sourceType: EVIDENCE_SOURCE_TYPES.SCHEDULE_DRIFT,
                sourceId: `drift-${projectId}`,
                projectId,
                metric: "Schedule Drift",
                value: `${driftDays} days`,
                explanation: `Delivery milestone has shifted by ${driftDays} days.`,
                severity: driftDays > 5 ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.HIGH
            }));
            recommendations.push({
                action: "Review Schedule Baseline or Trigger Replanning",
                why: `Accumulated drift of ${driftDays} day(s) threatens target delivery milestone.`,
                urgency: driftDays > 5 ? "CRITICAL" : "HIGH"
            });
        }

        if (bottlenecks.length > 0) {
            findings.push(`${bottlenecks.length} operational bottleneck(s) are obstructing downstream progress.`);
            contributingFactors.push(`${bottlenecks.length} active bottlenecks`);
            bottlenecks.forEach((b) => {
                affectedEntities.push({
                    type: "TASK",
                    id: b.taskId || b.id,
                    name: b.title || `Task ${b.taskId || b.id}`
                });
            });
            recommendations.push({
                action: "Alleviate Identified Bottlenecks",
                why: "Bottlenecks exert cascading delay drag on multiple dependent workstreams.",
                urgency: "HIGH"
            });
        }
    }

    const summary = status === "HEALTHY"
        ? `Project health is HEALTHY (${score}/100) with no immediate delivery risks detected.`
        : `Project health is ${status} (${score}/100) primarily due to ${contributingFactors.join(" and ")}.`;

    return {
        summary,
        findings,
        evidence,
        contributingFactors,
        affectedEntities,
        recommendations,
        limitations
    };
};

/**
 * Explains Deadline Risk across project tasks.
 */
export const explainDeadlineRisk = ({
    deadlineRiskData = {},
    forecastData = null,
    projectId = "proj"
}) => {
    const atRisk = deadlineRiskData.atRiskTasks || deadlineRiskData.tasksAtRisk || [];
    const p80 = forecastData?.p80FinishDate || "N/A";
    const expectedDelay = forecastData?.expectedDelayDays || 0;

    const findings = [];
    const contributingFactors = [];
    const evidence = [];
    const affectedEntities = [];
    const recommendations = [];
    const limitations = [
        "Deadline risk projections assume remaining task duration follows historical distribution.",
        "Unforeseen scope additions will increase probability of miss."
    ];

    if (atRisk.length === 0 && expectedDelay === 0) {
        findings.push("All tasks are currently projected to complete before their respective deadlines.");
        recommendations.push({
            action: "Continue Current Plan",
            why: "All milestones projected on or before committed dates.",
            urgency: "LOW"
        });
    } else {
        findings.push(`${atRisk.length} task(s) currently exceed the target completion threshold.`);
        if (expectedDelay > 0) {
            findings.push(`Monte Carlo forecast projects an expected delay of ${expectedDelay} day(s) with 80% confidence date ${p80}.`);
            contributingFactors.push(`Statistical completion delay of ${expectedDelay} days`);
        }
        atRisk.forEach((t) => {
            affectedEntities.push({
                type: "TASK",
                id: t.taskId || t.id,
                name: t.title || `Task ${t.taskId || t.id}`
            });
            evidence.push(buildEvidenceItem({
                sourceType: EVIDENCE_SOURCE_TYPES.DEADLINE_RISK,
                sourceId: `risk-${t.taskId || t.id}`,
                projectId,
                taskId: t.taskId || t.id,
                metric: "Deadline Probability",
                value: t.riskLevel || "HIGH",
                explanation: t.reason || "Low completion probability before committed date.",
                severity: EVIDENCE_SEVERITY.HIGH
            }));
        });
        recommendations.push({
            action: "Compress Critical Chain or Adjust Commitments",
            why: "Mitigates deadline exposure before committed delivery dates expire.",
            urgency: "HIGH"
        });
    }

    const summary = atRisk.length === 0
        ? "No critical deadline risks detected across active project milestones."
        : `Identified ${atRisk.length} task(s) exhibiting elevated deadline risk.`;

    return {
        summary,
        findings,
        evidence,
        contributingFactors,
        affectedEntities,
        recommendations,
        limitations
    };
};

/**
 * Explains why a specific task is classified as a bottleneck.
 */
export const explainBottleneck = ({
    bottleneck = {},
    task = {},
    downstreamTasks = [],
    projectId = "proj"
}) => {
    const taskId = task.id || bottleneck.taskId || "unknown-task";
    const title = task.title || bottleneck.title || `Task ${taskId}`;
    const score = bottleneck.score ?? 85;
    const fanout = downstreamTasks.length || bottleneck.blockedTasksCount || 1;

    const findings = [
        `Task '${title}' has a bottleneck score of ${score}/100.`,
        `Directly blocks ${fanout} downstream dependent task(s).`
    ];
    const contributingFactors = [
        `High downstream fanout (${fanout} tasks dependent)`,
        task.status === "In_Progress" ? "In-progress execution duration" : "Incomplete prerequisite state"
    ];
    const evidence = [
        buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.BOTTLENECK,
            sourceId: `bottleneck-${taskId}`,
            projectId,
            taskId,
            metric: "Bottleneck Score",
            value: score,
            explanation: `Task '${title}' blocks ${fanout} downstream task(s).`,
            severity: score >= 80 ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.HIGH
        })
    ];
    const affectedEntities = [
        { type: "TASK", id: taskId, name: title }
    ];
    downstreamTasks.forEach((dt) => {
        affectedEntities.push({
            type: "TASK",
            id: dt.id,
            name: dt.title || `Task ${dt.id}`
        });
    });

    const recommendations = [
        {
            action: `Prioritize completion of '${title}'`,
            why: `Unblocks ${fanout} dependent workstream(s) immediately.`,
            urgency: "HIGH"
        },
        {
            action: "Inspect Dependency Deserialization",
            why: "Evaluate whether downstream tasks can start in parallel with partial completion.",
            urgency: "MEDIUM"
        }
    ];

    const limitations = [
        "Bottleneck identification is structural based on the dependency graph.",
        "Does not capture ad-hoc communication dependencies not mapped in TaskFlow."
    ];

    const summary = `Task '${title}' is a bottleneck because it holds ${fanout} downstream dependent task(s) and scores ${score}/100 on structural friction.`;

    return {
        summary,
        findings,
        evidence,
        contributingFactors,
        affectedEntities,
        recommendations,
        limitations
    };
};

/**
 * Explains why tasks sit on the Critical Path.
 */
export const explainCriticalPath = ({
    criticalPathData = {},
    projectId = "proj"
}) => {
    const criticalTasks = criticalPathData.criticalTasks || criticalPathData.criticalTaskIds || [];
    const count = Array.isArray(criticalTasks) ? criticalTasks.length : 0;
    const duration = criticalPathData.durationDays ?? criticalPathData.criticalPathDurationDays ?? "N/A";

    const findings = [
        `The critical path comprises ${count} sequential task(s) with zero schedule slack.`,
        `Total critical path duration is ${duration} day(s). Any 1-day delay on these tasks causes a 1:1 delay to the project completion date.`
    ];
    const contributingFactors = [
        "Zero total float (slack = 0)",
        "End-to-end dependency sequence defining earliest project finish date"
    ];
    const evidence = [
        buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH,
            sourceId: `cpm-${projectId}`,
            projectId,
            metric: "Critical Path Task Count",
            value: count,
            explanation: `Sequence contains ${count} tasks with 0 days slack.`,
            severity: EVIDENCE_SEVERITY.INFO
        })
    ];
    const affectedEntities = (Array.isArray(criticalTasks) ? criticalTasks : []).map((t) => ({
        type: "TASK",
        id: typeof t === "object" ? t.id : t,
        name: typeof t === "object" ? (t.title || t.id) : `Task ${t}`
    }));

    const recommendations = [
        {
            action: "Protect Critical Path Tasks from Disruption",
            why: "Any delay directly slips project milestone delivery.",
            urgency: "HIGH"
        }
    ];

    const limitations = [
        "Critical path is deterministic based on current estimates and active dependencies.",
        "Tasks may shift onto or off the critical path as task completions and replanning occur."
    ];

    const summary = `Critical path consists of ${count} task(s) totaling ${duration} day(s). All tasks on this sequence have 0 slack and require priority focus.`;

    return {
        summary,
        findings,
        evidence,
        contributingFactors,
        affectedEntities,
        recommendations,
        limitations
    };
};

/**
 * Generic Explanation Builder for arbitrary intelligence topics.
 */
export const buildExplanation = ({
    topic = "INTELLIGENCE",
    summary = "",
    findings = [],
    evidence = [],
    contributingFactors = [],
    affectedEntities = [],
    recommendations = [],
    limitations = []
}) => {
    return {
        topic,
        summary: summary || "Intelligence explanation generated from verified system metrics.",
        findings: Array.isArray(findings) ? findings : [String(findings)],
        evidence: Array.isArray(evidence) ? evidence : [],
        contributingFactors: Array.isArray(contributingFactors) ? contributingFactors : [],
        affectedEntities: Array.isArray(affectedEntities) ? affectedEntities : [],
        recommendations: Array.isArray(recommendations) ? recommendations : [],
        limitations: Array.isArray(limitations) ? limitations : ["Analysis derived purely from persisted project records."]
    };
};
