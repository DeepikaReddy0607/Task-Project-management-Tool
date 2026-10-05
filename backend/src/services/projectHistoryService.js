import crypto from "crypto";
import prisma from "../config/prisma.js";

// In-memory fallback and test store
const inMemorySnapshots = new Map(); // projectId -> Array<snapshot>

export const computeSnapshotHash = (data) => {
    const payload = JSON.stringify({
        healthScore: data.health_score ?? data.healthScore,
        healthStatus: data.health_status ?? data.healthStatus,
        scheduleScore: data.schedule_score ?? data.scheduleScore ?? data.dimensions?.schedule,
        criticalPathScore: data.critical_path_score ?? data.criticalPathScore ?? data.dimensions?.criticalPath,
        executionScore: data.execution_score ?? data.executionScore ?? data.dimensions?.execution,
        bottleneckScore: data.bottleneck_score ?? data.bottleneckScore ?? data.dimensions?.bottlenecks,
        dependencyScore: data.dependency_score ?? data.dependencyScore ?? data.dimensions?.dependencies,
        workloadScore: data.workload_score ?? data.workloadScore ?? data.dimensions?.workload,
        riskScore: data.risk_score ?? data.riskScore ?? data.dimensions?.risks,
        scheduleDriftDays: data.schedule_drift_days ?? data.scheduleDriftDays ?? 0,
        criticalTaskCount: data.critical_task_count ?? data.criticalTaskCount ?? 0,
        bottleneckCount: data.bottleneck_count ?? data.bottleneckCount ?? 0,
        deadlineRiskCount: data.deadline_risk_count ?? data.deadlineRiskCount ?? 0,
        openRiskCount: data.open_risk_count ?? data.openRiskCount ?? 0
    });
    return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
};

export const clearSnapshotStore = () => {
    inMemorySnapshots.clear();
};

export const addInMemorySnapshot = (projectId, snapshot) => {
    if (!inMemorySnapshots.has(projectId)) {
        inMemorySnapshots.set(projectId, []);
    }
    const list = inMemorySnapshots.get(projectId);
    const enriched = {
        id: snapshot.id || `snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        project_id: projectId,
        captured_at: snapshot.captured_at ? new Date(snapshot.captured_at) : new Date(),
        health_score: Number(snapshot.health_score ?? snapshot.healthScore ?? 0),
        health_status: String(snapshot.health_status ?? snapshot.healthStatus ?? "ON_TRACK"),
        schedule_score: snapshot.schedule_score ?? snapshot.scheduleScore ?? snapshot.dimensions?.schedule ?? null,
        critical_path_score: snapshot.critical_path_score ?? snapshot.criticalPathScore ?? snapshot.dimensions?.criticalPath ?? null,
        execution_score: snapshot.execution_score ?? snapshot.executionScore ?? snapshot.dimensions?.execution ?? null,
        bottleneck_score: snapshot.bottleneck_score ?? snapshot.bottleneckScore ?? snapshot.dimensions?.bottlenecks ?? null,
        dependency_score: snapshot.dependency_score ?? snapshot.dependencyScore ?? snapshot.dimensions?.dependencies ?? null,
        workload_score: snapshot.workload_score ?? snapshot.workloadScore ?? snapshot.dimensions?.workload ?? null,
        risk_score: snapshot.risk_score ?? snapshot.riskScore ?? snapshot.dimensions?.risks ?? null,
        projected_end_date: snapshot.projected_end_date ? new Date(snapshot.projected_end_date) : null,
        schedule_drift_days: Number(snapshot.schedule_drift_days ?? snapshot.scheduleDriftDays ?? 0),
        critical_task_count: Number(snapshot.critical_task_count ?? snapshot.criticalTaskCount ?? 0),
        bottleneck_count: Number(snapshot.bottleneck_count ?? snapshot.bottleneckCount ?? 0),
        deadline_risk_count: Number(snapshot.deadline_risk_count ?? snapshot.deadlineRiskCount ?? 0),
        open_risk_count: Number(snapshot.open_risk_count ?? snapshot.openRiskCount ?? 0),
        state_hash: snapshot.state_hash || computeSnapshotHash(snapshot),
        metadata: snapshot.metadata || {}
    };
    list.push(enriched);
    // Keep sorted by captured_at ascending in internal list
    list.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    return enriched;
};

/**
 * Capture a new immutable project health snapshot.
 * Suppresses identical duplicate states unless force = true.
 */
export const captureHealthSnapshot = async ({
    projectId,
    healthData,
    metadata = {},
    force = false
}) => {
    if (!projectId) {
        throw new Error("Project ID is required to capture snapshot");
    }

    const stateHash = computeSnapshotHash(healthData);

    // Check latest snapshot for this project to suppress duplicates
    const latestInMemory = inMemorySnapshots.get(projectId)?.slice(-1)[0];
    if (!force && latestInMemory && latestInMemory.state_hash === stateHash) {
        return {
            snapshot: latestInMemory,
            isDuplicate: true,
            message: "Snapshot suppressed: identical project health state already recorded"
        };
    }

    const record = {
        id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        project_id: projectId,
        captured_at: new Date(),
        health_score: Number(healthData.health_score ?? healthData.healthScore ?? healthData.score ?? 0),
        health_status: String(healthData.health_status ?? healthData.healthStatus ?? healthData.status ?? "ON_TRACK"),
        schedule_score: healthData.dimensions?.schedule ?? healthData.schedule_score ?? null,
        critical_path_score: healthData.dimensions?.criticalPath ?? healthData.critical_path_score ?? null,
        execution_score: healthData.dimensions?.execution ?? healthData.execution_score ?? null,
        bottleneck_score: healthData.dimensions?.bottlenecks ?? healthData.bottleneck_score ?? null,
        dependency_score: healthData.dimensions?.dependencies ?? healthData.dependency_score ?? null,
        workload_score: healthData.dimensions?.workload ?? healthData.workload_score ?? null,
        risk_score: healthData.dimensions?.risks ?? healthData.risk_score ?? null,
        projected_end_date: healthData.projected_end_date || healthData.projectedEndDate ? new Date(healthData.projected_end_date || healthData.projectedEndDate) : null,
        schedule_drift_days: Number(healthData.schedule_drift_days ?? healthData.scheduleDriftDays ?? healthData.driftDays ?? 0),
        critical_task_count: Number(healthData.critical_task_count ?? healthData.criticalTaskCount ?? 0),
        bottleneck_count: Number(healthData.bottleneck_count ?? healthData.bottleneckCount ?? 0),
        deadline_risk_count: Number(healthData.deadline_risk_count ?? healthData.deadlineRiskCount ?? 0),
        open_risk_count: Number(healthData.open_risk_count ?? healthData.openRiskCount ?? 0),
        state_hash: stateHash,
        metadata: metadata || {}
    };

    // Store in-memory
    addInMemorySnapshot(projectId, record);

    // Also persist to PostgreSQL if available
    try {
        if (prisma?.project_health_snapshots) {
            const dbCreated = await prisma.project_health_snapshots.create({
                data: {
                    project_id: projectId,
                    health_score: record.health_score,
                    health_status: record.health_status,
                    schedule_score: record.schedule_score,
                    critical_path_score: record.critical_path_score,
                    execution_score: record.execution_score,
                    bottleneck_score: record.bottleneck_score,
                    dependency_score: record.dependency_score,
                    workload_score: record.workload_score,
                    risk_score: record.risk_score,
                    projected_end_date: record.projected_end_date,
                    schedule_drift_days: record.schedule_drift_days,
                    critical_task_count: record.critical_task_count,
                    bottleneck_count: record.bottleneck_count,
                    deadline_risk_count: record.deadline_risk_count,
                    open_risk_count: record.open_risk_count,
                    state_hash: record.state_hash,
                    metadata: record.metadata
                }
            });
            record.id = dbCreated.id;
        }
    } catch {
        // In-memory fallback is active
    }

    return {
        snapshot: record,
        isDuplicate: false,
        message: "Project health snapshot recorded successfully"
    };
};

/**
 * Retrieve persistent health history, trends, score transitions, and dimension shifts.
 */
export const getProjectHealthHistory = async (projectId, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required to fetch health history");
    }

    const { from, to, limit = 50, order = "desc" } = options;

    let snapshots = [];

    // First try querying Prisma DB
    try {
        if (prisma?.project_health_snapshots) {
            const whereClause = { project_id: projectId };
            if (from || to) {
                whereClause.captured_at = {};
                if (from) whereClause.captured_at.gte = new Date(from);
                if (to) whereClause.captured_at.lte = new Date(to);
            }

            const dbRows = await prisma.project_health_snapshots.findMany({
                where: whereClause,
                orderBy: { captured_at: order === "asc" ? "asc" : "desc" },
                take: Number(limit)
            });

            if (dbRows && dbRows.length > 0) {
                snapshots = dbRows.map((r) => ({
                    ...r,
                    captured_at: new Date(r.captured_at)
                }));
            }
        }
    } catch {
        // Fall back to in-memory snapshots
    }

    // Fallback to in-memory
    if (snapshots.length === 0) {
        let memList = inMemorySnapshots.get(projectId) ? [...inMemorySnapshots.get(projectId)] : [];
        if (from) {
            const fromTime = new Date(from).getTime();
            memList = memList.filter((s) => new Date(s.captured_at).getTime() >= fromTime);
        }
        if (to) {
            const toTime = new Date(to).getTime();
            memList = memList.filter((s) => new Date(s.captured_at).getTime() <= toTime);
        }
        memList.sort((a, b) => {
            const diff = new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime();
            return order === "asc" ? diff : -diff;
        });
        snapshots = memList.slice(0, Number(limit));
    }

    if (snapshots.length === 0) {
        return {
            projectId,
            totalSnapshots: 0,
            snapshots: [],
            currentHealth: null,
            previousHealth: null,
            scoreDelta: 0,
            trend: "STABLE",
            historicalMin: null,
            historicalMax: null,
            averageHealth: null,
            majorDeclines: [],
            majorImprovements: [],
            dimensionTrends: {
                schedule: [],
                criticalPath: [],
                execution: [],
                bottlenecks: [],
                dependencies: [],
                workload: [],
                risks: []
            },
            message: "No historical snapshots have been recorded for this project."
        };
    }

    // Chronological order for trend analysis
    const chronological = [...snapshots].sort(
        (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );

    const scores = chronological.map((s) => s.health_score);
    const historicalMin = Math.min(...scores);
    const historicalMax = Math.max(...scores);
    const averageHealth = Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length);

    const latest = chronological[chronological.length - 1];
    const previous = chronological.length > 1 ? chronological[chronological.length - 2] : null;
    const scoreDelta = previous ? latest.health_score - previous.health_score : 0;

    let trend = "STABLE";
    if (scoreDelta >= 4) {
        trend = "IMPROVING";
    } else if (scoreDelta <= -4) {
        trend = "DECLINING";
    }

    // Detect major declines (drop >= 5 points) and major improvements (rise >= 5 points)
    const majorDeclines = [];
    const majorImprovements = [];

    for (let i = 1; i < chronological.length; i++) {
        const prev = chronological[i - 1];
        const curr = chronological[i];
        const delta = curr.health_score - prev.health_score;

        const dimensionDeltas = {
            schedule: (curr.schedule_score ?? 0) - (prev.schedule_score ?? 0),
            criticalPath: (curr.critical_path_score ?? 0) - (prev.critical_path_score ?? 0),
            execution: (curr.execution_score ?? 0) - (prev.execution_score ?? 0),
            bottlenecks: (curr.bottleneck_score ?? 0) - (prev.bottleneck_score ?? 0),
            dependencies: (curr.dependency_score ?? 0) - (prev.dependency_score ?? 0),
            workload: (curr.workload_score ?? 0) - (prev.workload_score ?? 0),
            risks: (curr.risk_score ?? 0) - (prev.risk_score ?? 0)
        };

        if (delta <= -5) {
            majorDeclines.push({
                fromTimestamp: prev.captured_at,
                toTimestamp: curr.captured_at,
                previousScore: prev.health_score,
                currentScore: curr.health_score,
                delta,
                driftChange: curr.schedule_drift_days - prev.schedule_drift_days,
                dimensionDeltas,
                explanation: `Health declined by ${Math.abs(delta)} points (from ${prev.health_score} to ${curr.health_score}) after recorded project state changes.`
            });
        } else if (delta >= 5) {
            majorImprovements.push({
                fromTimestamp: prev.captured_at,
                toTimestamp: curr.captured_at,
                previousScore: prev.health_score,
                currentScore: curr.health_score,
                delta,
                dimensionDeltas,
                explanation: `Health improved by ${delta} points (from ${prev.health_score} to ${curr.health_score}) following recorded progress.`
            });
        }
    }

    const dimensionTrends = {
        schedule: chronological.map((s) => ({ timestamp: s.captured_at, score: s.schedule_score })),
        criticalPath: chronological.map((s) => ({ timestamp: s.captured_at, score: s.critical_path_score })),
        execution: chronological.map((s) => ({ timestamp: s.captured_at, score: s.execution_score })),
        bottlenecks: chronological.map((s) => ({ timestamp: s.captured_at, score: s.bottleneck_score })),
        dependencies: chronological.map((s) => ({ timestamp: s.captured_at, score: s.dependency_score })),
        workload: chronological.map((s) => ({ timestamp: s.captured_at, score: s.workload_score })),
        risks: chronological.map((s) => ({ timestamp: s.captured_at, score: s.risk_score }))
    };

    return {
        projectId,
        totalSnapshots: snapshots.length,
        snapshots: order === "desc" ? [...snapshots] : chronological,
        currentHealth: latest.health_score,
        previousHealth: previous ? previous.health_score : null,
        scoreDelta,
        trend,
        historicalMin,
        historicalMax,
        averageHealth,
        majorDeclines,
        majorImprovements,
        dimensionTrends
    };
};
