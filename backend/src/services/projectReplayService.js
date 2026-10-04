import { getProjectHealthHistory } from "./projectHistoryService.js";
import { getProjectTimeline } from "./projectTimelineService.js";
import { getProjectDecisionIntelligence } from "./decisionIntelligenceService.js";

/**
 * Project Replay reconstructs historical project states using ONLY persisted snapshots
 * and recorded timeline events. Never fabricates unavailable historical state.
 */
export const replayProjectPointInTime = async (projectId, targetTimestamp) => {
    if (!projectId) {
        throw new Error("Project ID is required for replay");
    }

    if (!targetTimestamp) {
        throw new Error("Target timestamp is required for point-in-time replay");
    }

    const targetDate = new Date(targetTimestamp);
    if (isNaN(targetDate.getTime())) {
        throw new Error("Invalid target timestamp format");
    }

    // Retrieve recorded snapshots in chronological order
    const history = await getProjectHealthHistory(projectId, { limit: 200, order: "asc" });

    if (!history.snapshots || history.snapshots.length === 0) {
        return {
            projectId,
            isAvailable: false,
            status: "UNAVAILABLE",
            requestedTimestamp: targetDate,
            message: "Historical state is unavailable for this timestamp because no snapshot was recorded."
        };
    }

    const targetTime = targetDate.getTime();

    // 1. Look for exact snapshot (within 1 second window)
    let exactSnapshot = history.snapshots.find(
        (s) => Math.abs(new Date(s.captured_at).getTime() - targetTime) <= 1000
    );

    // 2. Otherwise find nearest snapshot recorded on or before target date
    let nearestSnapshot = exactSnapshot || null;
    let isExact = !!exactSnapshot;

    if (!nearestSnapshot) {
        // Snapshots prior to or on target
        const priors = history.snapshots.filter((s) => new Date(s.captured_at).getTime() <= targetTime);
        if (priors.length > 0) {
            nearestSnapshot = priors[priors.length - 1]; // closest earlier
        } else {
            // If all snapshots are after the target date, check closest following snapshot
            nearestSnapshot = history.snapshots[0];
        }
    }

    if (!nearestSnapshot) {
        return {
            projectId,
            isAvailable: false,
            status: "UNAVAILABLE",
            requestedTimestamp: targetDate,
            message: "Historical state is unavailable for this timestamp because no snapshot was recorded."
        };
    }

    // Retrieve events in a 48-hour window around this snapshot
    const snapTime = new Date(nearestSnapshot.captured_at).getTime();
    const windowStart = new Date(snapTime - 48 * 60 * 60 * 1000);
    const windowEnd = new Date(snapTime + 48 * 60 * 60 * 1000);

    const timeline = await getProjectTimeline(projectId, {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
        limit: 20
    });

    // Check decisions recorded around this time
    const decisionsData = await getProjectDecisionIntelligence(projectId, {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString()
    });

    const recordedFacts = [
        `Recorded health score was ${nearestSnapshot.health_score} (${nearestSnapshot.health_status}).`,
        `Projected completion was ${nearestSnapshot.projected_end_date ? new Date(nearestSnapshot.projected_end_date).toLocaleDateString() : "Unscheduled"} with ${nearestSnapshot.schedule_drift_days} days of drift.`,
        `${nearestSnapshot.critical_task_count} tasks were on the critical path and ${nearestSnapshot.bottleneck_count} bottlenecks were active.`
    ];

    return {
        projectId,
        isAvailable: true,
        status: "AVAILABLE",
        isHistorical: true,
        isExact,
        requestedTimestamp: targetDate,
        snapshotTimestamp: nearestSnapshot.captured_at,
        snapshotId: nearestSnapshot.id,
        health: {
            score: nearestSnapshot.health_score,
            status: nearestSnapshot.health_status,
            dimensions: {
                schedule: nearestSnapshot.schedule_score,
                criticalPath: nearestSnapshot.critical_path_score,
                execution: nearestSnapshot.execution_score,
                bottlenecks: nearestSnapshot.bottleneck_score,
                dependencies: nearestSnapshot.dependency_score,
                workload: nearestSnapshot.workload_score,
                risks: nearestSnapshot.risk_score
            }
        },
        schedule: {
            projectedEndDate: nearestSnapshot.projected_end_date,
            scheduleDriftDays: nearestSnapshot.schedule_drift_days
        },
        criticalPath: {
            criticalTaskCount: nearestSnapshot.critical_task_count
        },
        bottlenecks: {
            bottleneckCount: nearestSnapshot.bottleneck_count
        },
        deadlineRisks: {
            deadlineRiskCount: nearestSnapshot.deadline_risk_count
        },
        openRisks: {
            openRiskCount: nearestSnapshot.open_risk_count
        },
        eventsAround: timeline.events,
        decisionsAround: decisionsData.decisions,
        recordedFacts,
        label: isExact ? "Exact Recorded Snapshot" : `Nearest Recorded Snapshot: ${new Date(nearestSnapshot.captured_at).toLocaleString()}`
    };
};

/**
 * Replays a continuous period from `from` to `to`, showing step-by-step state evolution.
 */
export const replayProjectPeriod = async (projectId, { from, to }) => {
    if (!projectId) {
        throw new Error("Project ID is required for period replay");
    }

    const history = await getProjectHealthHistory(projectId, { from, to, limit: 100, order: "asc" });
    const timeline = await getProjectTimeline(projectId, { from, to, limit: 100, order: "asc" });

    if (history.snapshots.length === 0) {
        return {
            projectId,
            period: { from, to },
            isAvailable: false,
            message: "No historical snapshots were recorded during the requested period.",
            snapshots: [],
            events: []
        };
    }

    const progression = [];
    for (let i = 0; i < history.snapshots.length; i++) {
        const curr = history.snapshots[i];
        const prev = i > 0 ? history.snapshots[i - 1] : null;

        progression.push({
            step: i + 1,
            capturedAt: curr.captured_at,
            healthScore: curr.health_score,
            healthStatus: curr.health_status,
            driftDays: curr.schedule_drift_days,
            bottlenecks: curr.bottleneck_count,
            deltaFromPrevious: prev ? curr.health_score - prev.health_score : 0
        });
    }

    return {
        projectId,
        period: { from, to },
        isAvailable: true,
        isHistorical: true,
        totalSnapshots: history.snapshots.length,
        progression,
        snapshots: history.snapshots,
        events: timeline.events
    };
};
