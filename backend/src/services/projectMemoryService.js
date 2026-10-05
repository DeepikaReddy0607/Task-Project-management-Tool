import prisma from "../config/prisma.js";
import { getProjectHealthHistory } from "./projectHistoryService.js";
import { getProjectTimeline } from "./projectTimelineService.js";
import { getProjectDecisionIntelligence } from "./decisionIntelligenceService.js";
import { listProjectProposals } from "./projectReplanningService.js";

/**
 * Project Memory Engine aggregates recorded project history, health snapshots, timeline events,
 * decisions, risks, and replanning records into structured historical intelligence.
 * Detects recurring bottlenecks, recurring overdue tasks, recurring drift, and dependency patterns.
 */
export const getProjectMemory = async (projectId, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required for Project Memory");
    }

    const { from, to } = options;

    // 1. Fetch Health History & Snapshots
    const healthHistory = await getProjectHealthHistory(projectId, { from, to, limit: 100, order: "asc" });

    // 2. Fetch Timeline Events
    const timeline = await getProjectTimeline(projectId, { from, to, limit: 200, order: "asc" });

    // 3. Fetch Decisions
    const decisionData = await getProjectDecisionIntelligence(projectId, { from, to });

    // 4. Fetch Replanning Proposals & Executions
    let proposals = [];
    try {
        proposals = await listProjectProposals(projectId);
    } catch {
        proposals = [];
    }

    // 5. Fetch Project Tasks & Risks
    let tasks = [];
    let risks = [];
    let project = null;

    try {
        if (prisma) {
            project = await prisma.projects.findUnique({
                where: { id: projectId },
                select: { id: true, title: true, start_date: true, end_date: true, status: true, priority: true }
            });

            tasks = await prisma.tasks.findMany({
                where: { project_id: projectId },
                select: { id: true, title: true, status: true, due_date: true, assigned_to: true, priority: true }
            });

            risks = await prisma.risks.findMany({
                where: { project_id: projectId },
                select: { id: true, title: true, severity: true, probability: true, status: true }
            });
        }
    } catch {
        // Fall back to memory
    }

    // Determine analysis period
    const startPeriod = from
        ? new Date(from)
        : healthHistory.snapshots[0]?.captured_at || project?.start_date || new Date();
    const endPeriod = to
        ? new Date(to)
        : healthHistory.snapshots.slice(-1)[0]?.captured_at || project?.end_date || new Date();

    // ============================================================
    // RECURRING PATTERN DETECTION
    // ============================================================

    // A. Recurring Overdue Tasks
    const overdueCounts = new Map(); // taskId -> { id, title, count }
    for (const ev of timeline.events) {
        if (
            ev.type === "TASK_OVERDUE" ||
            (ev.entityType === "Task" && /overdue/i.test(ev.description || ev.title))
        ) {
            const taskId = ev.entityId || ev.metadata?.taskId || "unknown";
            const taskTitle = ev.title || tasks.find((t) => t.id === taskId)?.title || "Untitled Task";
            const existing = overdueCounts.get(taskId) || { id: taskId, title: taskTitle, count: 0 };
            existing.count += 1;
            overdueCounts.set(taskId, existing);
        }
    }

    const recurringOverdueTasks = Array.from(overdueCounts.values())
        .filter((t) => t.count >= 1)
        .sort((a, b) => b.count - a.count)
        .map((t) => ({
            taskId: t.id,
            taskTitle: t.title,
            overdueOccurrences: t.count,
            evidence: `${t.title} was recorded as overdue in ${t.count} separate historical snapshots/events.`
        }));

    // B. Recurring Bottlenecks
    const bottleneckCounts = new Map(); // taskId -> { id, title, count, highestSeverity, onCriticalPath }
    for (const ev of timeline.events) {
        if (
            ev.type === "BOTTLENECK_ESCALATED" ||
            ev.type === "BOTTLENECK_DETECTED" ||
            /bottleneck/i.test(ev.description || ev.title)
        ) {
            const taskId = ev.entityId || ev.metadata?.taskId || "unknown";
            const taskTitle = ev.title || tasks.find((t) => t.id === taskId)?.title || "Task";
            const sev = ev.severity || "MEDIUM";
            const existing = bottleneckCounts.get(taskId) || {
                id: taskId,
                title: taskTitle,
                count: 0,
                highestSeverity: sev,
                criticalPathOccurrences: 0
            };
            existing.count += 1;
            if (sev === "CRITICAL" || (sev === "HIGH" && existing.highestSeverity !== "CRITICAL")) {
                existing.highestSeverity = sev;
            }
            if (ev.metadata?.onCriticalPath) {
                existing.criticalPathOccurrences += 1;
            }
            bottleneckCounts.set(taskId, existing);
        }
    }

    const recurringBottlenecks = Array.from(bottleneckCounts.values())
        .sort((a, b) => b.count - a.count)
        .map((b) => ({
            taskId: b.id,
            taskTitle: b.title,
            occurrenceCount: b.count,
            highestSeverity: b.highestSeverity,
            criticalPathOccurrences: b.criticalPathOccurrences,
            evidence: `Recorded as a bottleneck in ${b.count} events, with highest severity of ${b.highestSeverity}.`
        }));

    // C. Recurring Schedule Drift
    const driftHistory = healthHistory.snapshots.map((s) => ({
        timestamp: s.captured_at,
        driftDays: s.schedule_drift_days,
        projectedEndDate: s.projected_end_date
    }));

    const maxRecordedDrift = driftHistory.length > 0 ? Math.max(...driftHistory.map((d) => d.driftDays)) : 0;
    const driftEventsCount = driftHistory.filter((d) => d.driftDays > 0).length;

    // Check if recovery occurred (drift decreased from a previous higher value)
    let recoveredDays = 0;
    for (let i = 1; i < driftHistory.length; i++) {
        const drop = driftHistory[i - 1].driftDays - driftHistory[i].driftDays;
        if (drop > 0) {
            recoveredDays += drop;
        }
    }

    // D. Recurring Dependency Issues
    const dependencyEvents = timeline.events.filter((e) => e.entityType === "Dependency");
    const recurringDependencyIssues = dependencyEvents.length >= 3
        ? [
              {
                  type: "DEPENDENCY_CHURN",
                  count: dependencyEvents.length,
                  evidence: `Recorded ${dependencyEvents.length} dependency alterations during the analyzed period.`
              }
          ]
        : [];

    // ============================================================
    // MAJOR EVENTS, RECORDED FACTS & DERIVED INSIGHTS
    // ============================================================
    const majorEvents = timeline.events.filter(
        (e) => e.severity === "CRITICAL" || e.severity === "HIGH" || e.type.includes("APPROVED") || e.type.includes("EXECUTED")
    );

    const recordedFacts = [
        `Recorded ${healthHistory.totalSnapshots} historical health snapshots.`,
        `Recorded ${timeline.total} timeline events and ${decisionData.totalDecisions} documented decisions.`,
        `Maximum recorded schedule drift was ${maxRecordedDrift} days.`
    ];

    if (recurringOverdueTasks.length > 0) {
        recordedFacts.push(`${recurringOverdueTasks.length} tasks were recorded overdue across historical records.`);
    }

    const derivedInsights = [];
    if (healthHistory.trend === "DECLINING") {
        derivedInsights.push("Project health demonstrated a net declining trend across the recorded timeline.");
    } else if (healthHistory.trend === "IMPROVING") {
        derivedInsights.push("Project health demonstrated a net improving trend across the recorded timeline.");
    } else {
        derivedInsights.push("Project health maintained relative stability across the recorded timeline.");
    }

    if (recoveredDays > 0) {
        derivedInsights.push(`Project recovered ${recoveredDays} days of projected delay across historical intervals.`);
    }

    const temporalAssociations = decisionData.decisions
        .filter((d) => d.impact?.subsequentEventsWindow?.length > 0)
        .map((d) => ({
            decisionId: d.id,
            decisionTitle: d.decision,
            observation: d.impact.temporalObservation
        }));

    return {
        projectId,
        period: {
            start: startPeriod,
            end: endPeriod
        },
        healthSummary: {
            currentHealth: healthHistory.currentHealth,
            previousHealth: healthHistory.previousHealth,
            scoreDelta: healthHistory.scoreDelta,
            trend: healthHistory.trend,
            historicalMin: healthHistory.historicalMin,
            historicalMax: healthHistory.historicalMax,
            averageHealth: healthHistory.averageHealth
        },
        majorEvents: majorEvents.slice(0, 15),
        recurringPatterns: {
            overdueTasks: recurringOverdueTasks,
            bottlenecks: recurringBottlenecks,
            scheduleDrift: {
                totalOccurrences: driftEventsCount,
                maxRecordedDriftDays: maxRecordedDrift,
                recoveredDays,
                history: driftHistory
            },
            dependencyIssues: recurringDependencyIssues
        },
        decisions: decisionData.decisions,
        risks: risks.map((r) => ({
            id: r.id,
            title: r.title,
            severity: r.severity,
            status: r.status
        })),
        replanningActions: proposals.map((p) => ({
            proposalId: p.proposalId,
            strategy: p.strategy,
            status: p.status,
            createdAt: p.createdAt
        })),
        recordedFacts,
        derivedInsights,
        temporalAssociations
    };
};
