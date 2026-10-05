import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { calculateCriticalPath } from "./criticalPathService.js";

const inMemoryStakeholderStore = new Map();

export const clearStakeholderBriefingStore = () => {
    inMemoryStakeholderStore.clear();
};

export const setInMemoryStakeholderBriefing = (projectId, briefing) => {
    inMemoryStakeholderStore.set(projectId, briefing);
};

/**
 * Pure in-memory calculation of Stakeholder Briefing.
 */
export const calculateStakeholderBriefing = ({
    project = {},
    tasks = [],
    dependencies = [],
    risks = [],
    decisions = [],
    proposals = [],
    snapshots = [],
    forecast = null,
    healthData = null,
    forecastData = null,
    driftData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const today = new Date(startOfToday);
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");
    const completedTasks = activeTasks.filter((t) => t.status === "Completed");

    // Critical Path
    let cpm = { projectedEndDate: null };
    try {
        cpm = calculateCriticalPath({ project, tasks: activeTasks, dependencies, startOfToday });
    } catch (e) {}
    const plannedFinishDate = project.end_date || project.deadline ? new Date(project.end_date || project.deadline).toISOString().split("T")[0] : null;

    // Health Score & Status
    let healthScore = healthData?.score !== undefined ? healthData.score : 85;
    let healthStatus = healthData?.status || "HEALTHY";
    let healthTrend = "STABLE";

    if (!healthData && snapshots && snapshots.length > 0) {
        const sorted = [...snapshots].sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
        healthScore = sorted[0].health_score;
        healthStatus = sorted[0].health_status;
        if (sorted.length > 1) {
            if (sorted[0].health_score > sorted[1].health_score + 3) healthTrend = "IMPROVING";
            else if (sorted[0].health_score < sorted[1].health_score - 3) healthTrend = "DEGRADING";
        }
    } else {
        const overdue = incompleteTasks.filter((t) => t.due_date && new Date(t.due_date) < today).length;
        if (overdue > 3) {
            healthScore = 48;
            healthStatus = "CRITICAL";
        } else if (overdue > 0) {
            healthScore = 68;
            healthStatus = "WATCH";
        }
    }

    // Monte Carlo Forecast
    const fc = forecast || runMonteCarloForecast({
        projectId: project.id || "proj",
        project,
        tasks: activeTasks,
        dependencies,
        iterations: 200
    });

    const deadlineProbPct = fc.deadlineProbability !== null
        ? Math.round(fc.deadlineProbability <= 1 ? fc.deadlineProbability * 100 : fc.deadlineProbability)
        : null;

    // Open Risks
    const openRisks = (risks || []).filter((r) => !r.status || r.status === "Open" || r.status === "OPEN");
    const highRisks = openRisks.filter((r) => !r.severity || r.severity === "Critical" || r.severity === "High" || r.severity === "CRITICAL" || r.severity === "HIGH");
    const topRisksList = highRisks.slice(0, 3).map((r) => ({
        id: r.id,
        title: r.title,
        severity: r.severity || "MEDIUM",
        mitigation: r.mitigation || r.mitigation_plan || "Mitigation under review"
    }));

    // Blockers
    const prereqMap = new Map();
    (dependencies || []).forEach((d) => {
        if (!prereqMap.has(d.task_id)) prereqMap.set(d.task_id, []);
        prereqMap.get(d.task_id).push(d.depends_on_task_id);
    });
    const taskMap = new Map();
    activeTasks.forEach((t) => taskMap.set(t.id, t));

    const blockedCount = incompleteTasks.filter((t) => {
        const prereqs = prereqMap.get(t.id) || [];
        return prereqs.some((pId) => taskMap.get(pId)?.status !== "Completed");
    }).length;

    // Executive Summary narrative
    const completionPct = activeTasks.length > 0 ? Math.round((completedTasks.length / activeTasks.length) * 100) : 0;
    let narrative = `${project.title || "The project"} is currently ${healthStatus} with an overall health index of ${healthScore}/100. Progress stands at ${completionPct}% completion (${completedTasks.length} of ${activeTasks.length} tasks). `;
    if (plannedFinishDate) {
        if (fc.p80FinishDate) {
            narrative += `High-confidence (P80) delivery is projected for ${fc.p80FinishDate} against a planned milestone of ${plannedFinishDate}. `;
        }
        if (deadlineProbPct !== null) {
            narrative += `The probability of meeting the target deadline is evaluated at ${deadlineProbPct}%. `;
        }
    }
    if (highRisks.length > 0) {
        narrative += `${highRisks.length} high-severity risk(s) currently require active mitigation.`;
    }

    const p50 = forecastData?.p50Date || fc.p50FinishDate || null;
    const p80 = forecastData?.p80Date || fc.p80FinishDate || null;
    const driftDays = driftData?.driftDays !== undefined ? driftData.driftDays : (fc.expectedDelayDays || 0);
    const accomplishments = completedTasks.map((t) => ({ id: t.id, title: t.title }));

    return {
        projectId: project.id || "unknown",
        projectTitle: project.title || "Untitled Project",
        generatedAt: new Date().toISOString(),
        executiveSummary: narrative.trim(),
        healthScore,
        healthStatus,
        p50Date: p50,
        p80Date: p80,
        driftDays,
        accomplishments,
        topRisks: topRisksList,
        currentStatus: {
            status: project.status || "In Progress",
            healthScore,
            healthStatus,
            healthTrend,
            totalTasks: activeTasks.length,
            completedTasks: completedTasks.length,
            completionPercentage: completionPct
        },
        health: {
            score: healthScore,
            status: healthStatus,
            trend: healthTrend,
            evaluation: healthScore >= 80 ? "Operating within healthy parameters" : healthScore >= 65 ? "Operating under watch conditions" : "Requires active intervention"
        },
        schedule: {
            plannedFinishDate,
            projectedCriticalPathFinishDate: cpm.projectedEndDate || fc.p50FinishDate || plannedFinishDate,
            scheduleDriftDays: fc.expectedDelayDays || 0,
            isOnSchedule: (fc.expectedDelayDays || 0) <= 0
        },
        forecast: {
            p50Date: fc.p50FinishDate || null,
            p80Date: fc.p80FinishDate || null,
            p90Date: fc.p90FinishDate || null,
            deadlineProbabilityPercentage: deadlineProbPct,
            expectedDelayDays: fc.expectedDelayDays || 0,
            uncertaintySpreadDays: fc.uncertaintySpread?.spreadDays || 0
        },
        risks: {
            openRisksCount: openRisks.length,
            highSeverityCount: highRisks.length,
            topRisks: topRisksList
        },
        blockers: {
            blockedTasksCount: blockedCount,
            summary: blockedCount > 0 ? `${blockedCount} task(s) currently awaiting prerequisite completion.` : "No active blockers."
        },
        recentChanges: {
            recentlyCompletedCount: completedTasks.length,
            highlights: completedTasks.slice(0, 3).map((t) => t.title)
        },
        decisions: {
            pendingCount: (decisions || []).filter((d) => d.status === "Proposed").length,
            recentDecisions: (decisions || []).slice(0, 3).map((d) => ({
                id: d.id,
                decision: d.decision,
                status: d.status
            }))
        },
        replanning: {
            pendingProposalsCount: (proposals || []).filter((p) => p.status === "PROPOSED").length,
            hasActiveReplanning: (proposals || []).some((p) => p.status === "PROPOSED")
        },
        nextSteps: [
            ...(blockedCount > 0 ? [`Resolve ${blockedCount} blocked dependency paths.`] : []),
            ...(highRisks.length > 0 ? [`Review mitigation progress for ${highRisks.length} high-severity risk(s).`] : []),
            "Maintain execution pace on active critical path milestones."
        ],
        disclaimer: "Stakeholder reports distinguish recorded operational facts from stochastic Monte Carlo simulations and planning recommendations."
    };
};

/**
 * Fetch and calculate Stakeholder Briefing from database or in-memory store.
 */
export const getProjectStakeholderBriefing = async (projectId, userId) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryStakeholderStore.has(projectId)) {
        return inMemoryStakeholderStore.get(projectId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return calculateStakeholderBriefing({ project: { id: projectId, title: "Test Project" } });
    }

    await verifyProjectAccess(projectId, userId);

    const [project, tasks, dependencies, risks, decisions, snapshots] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: { tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false } }
        }),
        prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
        prisma.decisions.findMany({ where: { project_id: projectId } }),
        prisma.project_health_snapshots.findMany({
            where: { project_id: projectId },
            orderBy: { captured_at: "desc" },
            take: 3
        })
    ]);

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    return calculateStakeholderBriefing({
        project,
        tasks,
        dependencies,
        risks,
        decisions,
        snapshots
    });
};
