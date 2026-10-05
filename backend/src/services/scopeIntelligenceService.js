import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";

const inMemoryScopeStore = new Map();

export const clearScopeStore = () => {
    inMemoryScopeStore.clear();
};

export const setInMemoryScopeData = (projectId, data) => {
    inMemoryScopeStore.set(projectId, data);
};

/**
 * Calculates Scope Creep Intelligence for a project.
 * Derives scope baseline, measures net growth and change frequency, detects scope pressure
 * in relation to schedule drift, and identifies significant scope events.
 */
export const calculateScopeIntelligence = ({
    projectId,
    project = null,
    currentTasks = [],
    timelineEvents = [],
    snapshots = []
}) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryScopeStore.has(projectId)) {
        return inMemoryScopeStore.get(projectId);
    }

    const activeTasks = (currentTasks || []).filter((t) => !t.is_archived);
    const currentTaskCount = activeTasks.length;

    // 1. Establish Scope Baseline
    let baselineTaskCount = currentTaskCount;
    let baselineSource = "Current active task count (no prior snapshots or audit history recorded)";
    let baselineDate = project?.created_at ? new Date(project.created_at) : new Date();

    // Check earliest recorded snapshot
    if (Array.isArray(snapshots) && snapshots.length > 0) {
        const sortedSnaps = [...snapshots].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
        const earliest = sortedSnaps[0];
        if (earliest) {
            baselineTaskCount = earliest.metadata?.totalTasks ?? earliest.metadata?.taskCount ?? earliest.critical_task_count ?? baselineTaskCount;
            baselineDate = new Date(earliest.captured_at);
            baselineSource = `Earliest recorded health snapshot (${baselineDate.toISOString().split("T")[0]})`;
        }
    } else if (Array.isArray(timelineEvents) && timelineEvents.length > 0) {
        // Approximate baseline from task creation events
        const taskCreatedEvents = timelineEvents.filter((e) => e.type === "TASK_CREATED" || e.action_type === "CREATE_TASK");
        if (taskCreatedEvents.length > 0) {
            const sortedEvents = [...taskCreatedEvents].sort((a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime());
            baselineDate = new Date(sortedEvents[0].timestamp || sortedEvents[0].created_at);
            baselineSource = `Earliest recorded task creation activity (${baselineDate.toISOString().split("T")[0]})`;
        }
    } else if (Array.isArray(activeTasks) && activeTasks.length > 0 && activeTasks.some((t) => t.created_at)) {
        const sorted = [...activeTasks].filter((t) => t.created_at).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (sorted.length > 0) {
            const earliestTime = new Date(project?.created_at || sorted[0].created_at).getTime();
            const baselineTasks = sorted.filter((t) => new Date(t.created_at).getTime() - earliestTime <= 48 * 3600 * 1000);
            if (baselineTasks.length < activeTasks.length) {
                baselineTaskCount = baselineTasks.length;
                baselineDate = new Date(earliestTime);
                baselineSource = "Initial creation window (tasks created within 48h of project start)";
            }
        }
    }

    // 2. Count Added and Removed Tasks
    let tasksAdded = 0;
    let tasksRemoved = 0;
    const taskAddEvents = [];

    (timelineEvents || []).forEach((ev) => {
        const type = (ev.type || ev.action_type || "").toUpperCase();
        if (type.includes("TASK_CREATE") || type === "TASK_CREATED") {
            tasksAdded++;
            taskAddEvents.push(ev);
        } else if (type.includes("TASK_DELETE") || type.includes("TASK_ARCHIVE") || type === "TASK_DELETED") {
            tasksRemoved++;
        }
    });

    // If no explicit timeline events, derive from baseline vs current
    if (tasksAdded === 0 && currentTaskCount > baselineTaskCount) {
        tasksAdded = currentTaskCount - baselineTaskCount;
    } else if (tasksAdded === 0 && tasksRemoved === 0) {
        tasksAdded = 0;
        tasksRemoved = 0;
    }

    const netScopeGrowth = currentTaskCount - baselineTaskCount;
    const percentageGrowth = baselineTaskCount > 0
        ? Number(((netScopeGrowth / baselineTaskCount) * 100).toFixed(1))
        : 0;

    // 3. Scope Change Frequency (changes per week/month)
    const projectStart = project?.start_date ? new Date(project.start_date) : baselineDate;
    const now = new Date();
    const elapsedWeeks = Math.max(1, Math.round((now.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24 * 7)));
    const totalScopeChanges = tasksAdded + tasksRemoved;
    const changeFrequencyPerWeek = Number((totalScopeChanges / elapsedWeeks).toFixed(2));

    // Scope Volatility (ratio of churn to current size)
    const scopeVolatility = currentTaskCount > 0
        ? Number((totalScopeChanges / currentTaskCount).toFixed(2))
        : 0;

    // 4. Detect Scope Events
    const scopeEvents = [];

    // Burst detection: >= 3 tasks added within 48 hours
    if (taskAddEvents.length >= 3) {
        scopeEvents.push({
            type: "BURST_ADDITIONS",
            severity: "MEDIUM",
            description: `Detected burst additions of ${taskAddEvents.length} tasks added to project scope.`,
            count: taskAddEvents.length
        });
    }

    // Late scope growth: tasks added near or past deadline
    if (project?.end_date) {
        const deadline = new Date(project.end_date);
        const lateAdds = taskAddEvents.filter((e) => {
            const evDate = new Date(e.timestamp || e.created_at || now);
            const daysToDl = (deadline.getTime() - evDate.getTime()) / (1000 * 60 * 60 * 24);
            return daysToDl <= 7;
        });

        if (lateAdds.length > 0) {
            scopeEvents.push({
                type: "LATE_SCOPE_ADDITIONS",
                severity: "HIGH",
                description: `${lateAdds.length} task(s) added within 7 days of the scheduled deadline.`,
                count: lateAdds.length
            });
        }
    }

    if (percentageGrowth >= 50) {
        scopeEvents.push({
            type: "HIGH_SCOPE_EXPANSION",
            severity: "HIGH",
            description: `Net scope has expanded by ${percentageGrowth}% over baseline.`,
            count: netScopeGrowth
        });
    }

    // 5. Scope Pressure Analysis (correlated with schedule drift and health)
    const driftDays = project?.schedule_drift_days || 0;
    const healthScore = project?.health_score ?? null;

    let pressureLevel = "LOW";
    let pressureExplanation = "Scope growth is within sustainable thresholds.";

    if (percentageGrowth >= 30 && driftDays > 3) {
        pressureLevel = "HIGH";
        pressureExplanation = `Scope expanded by ${percentageGrowth}% while schedule drift recorded ${driftDays} days delay during the same operational period.`;
    } else if (percentageGrowth >= 20 || driftDays > 0) {
        pressureLevel = "MEDIUM";
        pressureExplanation = `Scope grew by ${percentageGrowth}% with ${driftDays} days schedule drift observed.`;
    }

    if (percentageGrowth >= 50 && driftDays >= 5) {
        pressureLevel = "CRITICAL";
        pressureExplanation = `Substantial scope expansion (+${percentageGrowth}%) coincides with critical schedule drift of ${driftDays} days.`;
    }

    return {
        projectId,
        baseline: {
            taskCount: baselineTaskCount,
            source: baselineSource,
            establishedAt: baselineDate.toISOString()
        },
        current: {
            taskCount: currentTaskCount,
            activeCount: activeTasks.length,
            completedCount: activeTasks.filter((t) => t.status === "Completed").length
        },
        netGrowthPercentage: percentageGrowth,
        scopePressure: pressureLevel,
        changeFrequency: { changesPerWeek: changeFrequencyPerWeek, changesPerMonth: Number((changeFrequencyPerWeek * 4).toFixed(1)) },
        scopeEvents,
        metrics: {
            tasksAdded,
            tasksRemoved,
            netScopeGrowth,
            percentageGrowth,
            changeFrequencyPerWeek,
            scopeVolatility
        },
        pressure: {
            level: pressureLevel,
            explanation: pressureExplanation,
            correlatedScheduleDriftDays: driftDays,
            disclaimer: "Scope and schedule observations reflect concurrent chronological measurements without asserting direct causation."
        },
        events: scopeEvents
    };
};

/**
 * Endpoint-level retriever with database integration.
 */
export const getProjectScopeIntelligence = async (projectId, optionsOrUserId = null) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryScopeStore.has(projectId)) {
        return inMemoryScopeStore.get(projectId);
    }

    const options = typeof optionsOrUserId === "object" && optionsOrUserId !== null ? optionsOrUserId : { userId: optionsOrUserId };
    const userId = options.userId || null;
    const inMemoryData = options.inMemoryData || null;

    if (inMemoryData) {
        return calculateScopeIntelligence({
            projectId,
            project: inMemoryData.project,
            currentTasks: inMemoryData.tasks || inMemoryData.currentTasks || [],
            snapshots: inMemoryData.snapshots || [],
            timelineEvents: inMemoryData.timelineEvents || inMemoryData.activityLogs || []
        });
    }

    if (userId) {
        await verifyProjectAccess(projectId, userId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        const error = new Error("Project access denied");
        error.statusCode = 403;
        throw error;
    }

    const [project, currentTasks, snapshots, activityLogs] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.project_health_snapshots
            ? prisma.project_health_snapshots.findMany({
                  where: { project_id: projectId },
                  orderBy: { captured_at: "asc" },
                  take: 10
              })
            : Promise.resolve([]),
        prisma.activity_logs
            ? prisma.activity_logs.findMany({
                  where: { entity_type: "Task" },
                  orderBy: { created_at: "asc" },
                  take: 100
              })
            : Promise.resolve([])
    ]);

    return calculateScopeIntelligence({
        projectId,
        project,
        currentTasks,
        snapshots,
        timelineEvents: activityLogs
    });
};

export const clearScopeIntelligenceStore = clearScopeStore;
export const setInMemoryScopeIntelligence = setInMemoryScopeData;

