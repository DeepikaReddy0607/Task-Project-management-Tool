import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { calculateCriticalPath } from "./criticalPathService.js";
import { detectBottlenecks } from "./bottleneckService.js";
import { calculateNextActions } from "./nextActionService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { calculateScopeIntelligence } from "./scopeIntelligenceService.js";
import { calculateResourcePressureScore } from "./resourceConflictService.js";
import { listProjectProposals } from "./projectReplanningService.js";

const inMemoryBriefingStore = new Map();

export const clearProjectBriefingStore = () => {
    inMemoryBriefingStore.clear();
};

export const setInMemoryProjectBriefing = (projectId, briefing) => {
    inMemoryBriefingStore.set(projectId, briefing);
};

/**
 * Pure in-memory calculation of the Daily Project Briefing.
 */
export const calculateProjectBriefing = ({
    project = {},
    tasks = [],
    dependencies = [],
    risks = [],
    decisions = [],
    proposals = [],
    healthSnapshots = [],
    healthData = null,
    criticalPathData = null,
    activityLogs = [],
    forecast = null,
    scope = null,
    bottlenecksData = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const today = new Date(startOfToday);
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");
    const completedTasks = activeTasks.filter((t) => t.status === "Completed");

    const twoDaysFromNow = new Date(today.getTime() + 48 * 60 * 60 * 1000);
    const imminentDeadlines = incompleteTasks.filter(
        (t) => t.due_date && new Date(t.due_date) <= twoDaysFromNow
    );

    // 1. Critical Path & Bottlenecks
    const cpm = criticalPathData || calculateCriticalPath({ project, tasks: activeTasks, dependencies, startOfToday });
    const criticalTaskIds = new Set(cpm.criticalTaskIds || []);
    const bottlenecks = detectBottlenecks({ project, tasks: activeTasks, dependencies, startOfToday });
    const bList = bottlenecksData?.bottlenecks || bottlenecks.majorBottlenecks || bottlenecks.bottleneckTasks || [];

    // 2. Health & Trend
    let healthScore = 100;
    let healthStatus = "HEALTHY";
    let healthTrend = "STABLE";

    if (healthData) {
        healthScore = healthData.score ?? healthData.healthScore ?? 100;
        healthStatus = healthData.status ?? healthData.healthStatus ?? "HEALTHY";
        if (healthData.trend || healthData.healthTrend) {
            healthTrend = healthData.trend || healthData.healthTrend;
        }
    } else if (healthSnapshots && healthSnapshots.length > 0) {
        const sorted = [...healthSnapshots].sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
        const latest = sorted[0];
        healthScore = latest.health_score;
        healthStatus = latest.health_status;
        if (sorted.length > 1) {
            const prev = sorted[1];
            if (latest.health_score > prev.health_score + 3) healthTrend = "IMPROVING";
            else if (latest.health_score < prev.health_score - 3) healthTrend = "DEGRADING";
        }
    } else {
        // Derive basic health score
        const overdueCount = incompleteTasks.filter((t) => t.due_date && new Date(t.due_date) < today).length;
        if (overdueCount > 3 || cpm.hasCycle) {
            healthScore = 45;
            healthStatus = "CRITICAL";
        } else if (overdueCount > 0) {
            healthScore = 65;
            healthStatus = "AT_RISK";
        }
    }

    // 3. Monte Carlo Forecast
    const fc = forecast || runMonteCarloForecast({
        projectId: project.id || "proj",
        project,
        tasks: activeTasks,
        dependencies,
        iterations: 200
    });

    // 4. Scope Intelligence
    const projId = project.id || project.projectId || "proj-default";
    const sc = scope || calculateScopeIntelligence({
        projectId: projId,
        project,
        currentTasks: activeTasks
    });

    // 5. Intelligent Next Actions
    const rawNextActions = calculateNextActions({
        project,
        tasks: activeTasks,
        dependencies,
        risks,
        decisions,
        proposals,
        forecast: fc,
        health: { healthScore, healthStatus, healthTrend },
        scopeIntelligence: sc,
        startOfToday
    });
    const nextActions = Array.isArray(rawNextActions) ? rawNextActions : (rawNextActions.actions || []);

    // 6. Blockers Identification
    // A task is blocked if any of its prerequisite dependencies are incomplete
    const taskMap = new Map();
    activeTasks.forEach((t) => taskMap.set(t.id, t));

    const prereqMap = new Map();
    (dependencies || []).forEach((d) => {
        if (!prereqMap.has(d.task_id)) {
            prereqMap.set(d.task_id, []);
        }
        prereqMap.get(d.task_id).push(d.depends_on_task_id);
    });

    const blockers = [];
    incompleteTasks.forEach((t) => {
        const prereqIds = prereqMap.get(t.id) || [];
        const incompletePrereqs = prereqIds
            .map((pId) => taskMap.get(pId))
            .filter((p) => p && p.status !== "Completed");

        if (incompletePrereqs.length > 0) {
            const isCrit = criticalTaskIds.has(t.id);
            blockers.push({
                taskId: t.id,
                taskTitle: t.title,
                assignedTo: t.assigned_to || null,
                isCriticalPath: isCrit,
                blockedByCount: incompletePrereqs.length,
                blockedBy: incompletePrereqs.map((p) => ({
                    id: p.id,
                    title: p.title,
                    status: p.status,
                    assignedTo: p.assigned_to || null
                })),
                impact: isCrit
                    ? "Critical path blocked; directly delaying project target end date."
                    : "Non-critical path blocked; consuming available schedule slack.",
                recommendedReview: `Prioritize unblocking prerequisite task: ${incompletePrereqs[0].title}`
            });
        }
    });

    // 7. Top Priorities (up to 4 highest priority next actions)
    const topPriorities = nextActions.slice(0, 4);

    // 8. Open Risks (sorted Critical, High, Medium, Low)
    const severityRank = { Critical: 4, CRITICAL: 4, High: 3, HIGH: 3, Medium: 2, MEDIUM: 2, Low: 1, LOW: 1 };
    const openRisks = (risks || [])
        .filter((r) => r.status === "Open" || r.status === "OPEN")
        .sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

    // 9. Pending Decisions
    const pendingDecisions = (decisions || []).filter(
        (d) => d.status === "Proposed" || d.status === "PROPOSED"
    );

    // 10. Pending Proposals
    const pendingProposals = (proposals || []).filter(
        (p) => p.status === "PROPOSED" || p.status === "Pending"
    );

    // 11. Resource Pressure Summary
    const memberTasks = new Map();
    incompleteTasks.forEach((t) => {
        if (t.assigned_to) {
            if (!memberTasks.has(t.assigned_to)) {
                memberTasks.set(t.assigned_to, []);
            }
            memberTasks.get(t.assigned_to).push(t);
        }
    });

    const resourcePressure = [];
    memberTasks.forEach((mTasks, userId) => {
        const estHours = mTasks.reduce((sum, t) => sum + (Number(t.estimated_hours) || 0), 0);
        const critCount = mTasks.filter((t) => criticalTaskIds.has(t.id)).length;
        const overCount = mTasks.filter((t) => t.due_date && new Date(t.due_date) < today).length;
        const score = calculateResourcePressureScore({
            activeTasksCount: mTasks.length,
            estimatedHours: estHours,
            criticalTasksCount: critCount,
            overdueTasksCount: overCount
        });
        if (score.level === "HIGH" || score.level === "CRITICAL" || score.level === "ELEVATED") {
            resourcePressure.push({
                userId,
                score: score.score,
                level: score.level,
                activeTasksCount: mTasks.length,
                estimatedHours: estHours,
                criticalTasksCount: critCount,
                overdueTasksCount: overCount
            });
        }
    });
    resourcePressure.sort((a, b) => b.score - a.score);

    // 12. Changes Since Yesterday
    const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const recentActivity = (activityLogs || []).filter((log) => new Date(log.created_at) >= oneDayAgo);
    const recentlyCompleted = completedTasks.filter((t) => t.updated_at && new Date(t.updated_at) >= oneDayAgo);

    const changes = [];
    if (recentlyCompleted.length > 0) {
        changes.push(`${recentlyCompleted.length} task(s) completed in the last 24 hours: ${recentlyCompleted.map((t) => t.title).slice(0, 3).join(", ")}${recentlyCompleted.length > 3 ? "..." : ""}`);
    }
    recentActivity.forEach((log) => {
        changes.push(log.description || `${log.action_type} on ${log.entity_type || "item"}`);
    });
    if (changes.length === 0) {
        changes.push("No significant project changes require attention.");
    }

    const focusItems = topPriorities.length > 0 ? topPriorities : imminentDeadlines.map((t) => ({
        id: t.id,
        title: t.title,
        priority: "HIGH",
        urgency: "HIGH",
        why: "Task due within 48 hours."
    }));

    return {
        headline: `Daily Briefing: ${project.title || "Project Nominal"}`,
        projectId: project.id || "unknown",
        projectTitle: project.title || "Untitled Project",
        generatedAt: new Date().toISOString(),
        period: "Last 24 hours",
        summary: `Daily briefing for ${project.title || "Project"}: Health index ${healthScore}/100 (${healthStatus}). ${incompleteTasks.length} active tasks, ${blockers.length} blockers.`,
        health: {
            score: healthScore,
            status: healthStatus,
            trend: healthTrend
        },
        keyFocusToday: focusItems,
        imminentDeadlines,
        bottlenecks: bList,
        projectStatus: {
            healthScore,
            healthStatus,
            healthTrend,
            plannedEndDate: project.end_date ? new Date(project.end_date).toISOString().split("T")[0] : null,
            p50FinishDate: fc.p50FinishDate || null,
            p80FinishDate: fc.p80FinishDate || null,
            p90FinishDate: fc.p90FinishDate || null,
            deadlineProbability: fc.deadlineProbability,
            expectedDelayDays: fc.expectedDelayDays || 0,
            criticalTasksCount: criticalTaskIds.size,
            bottlenecksCount: (bottlenecks.majorBottlenecks || []).length
        },
        topPriorities: focusItems.length > 0 ? focusItems : [{
            id: "priority-none",
            title: "No high-priority actions detected.",
            why: "All project tasks are currently progressing within acceptable baseline limits.",
            urgency: "LOW",
            priorityScore: 0
        }],
        blockers: blockers.length > 0 ? blockers : [],
        blockersNotice: blockers.length === 0 ? "No active blockers detected." : undefined,
        risks: openRisks.map((r) => ({
            id: r.id,
            title: r.title,
            severity: r.severity,
            probability: r.probability,
            mitigationPlan: r.mitigation_plan || "None documented"
        })),
        decisions: pendingDecisions.map((d) => ({
            id: d.id,
            decision: d.decision,
            reason: d.reason,
            status: d.status,
            decisionDate: d.decision_date ? new Date(d.decision_date).toISOString().split("T")[0] : null
        })),
        replanning: pendingProposals.map((p) => ({
            id: p.id,
            strategy: p.strategy,
            summary: p.summary,
            status: p.status,
            createdAt: p.createdAt
        })),
        resourcePressure,
        nextActions,
        changes,
        disclaimer: "Briefing items originate from actual TaskFlow project state and deterministic intelligence engines."
    };
};

/**
 * Retrieve Daily Project Briefing from database or in-memory store.
 */
export const getProjectBriefing = async (projectId, userId) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryBriefingStore.has(projectId)) {
        return inMemoryBriefingStore.get(projectId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        return calculateProjectBriefing({ project: { id: projectId, title: "Test Project" } });
    }

    await verifyProjectAccess(projectId, userId);

    const [project, tasks, dependencies, risks, decisions, snapshots, activityLogs, proposals] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
            }
        }),
        prisma.risks.findMany({ where: { project_id: projectId, status: "Open" } }),
        prisma.decisions.findMany({ where: { project_id: projectId } }),
        prisma.project_health_snapshots.findMany({
            where: { project_id: projectId },
            orderBy: { captured_at: "desc" },
            take: 5
        }),
        prisma.activity_logs.findMany({
            where: { entity_id: projectId },
            orderBy: { created_at: "desc" },
            take: 20
        }),
        listProjectProposals(projectId, userId).catch(() => [])
    ]);

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    const briefing = calculateProjectBriefing({
        project,
        tasks,
        dependencies,
        risks,
        decisions,
        proposals,
        healthSnapshots: snapshots,
        activityLogs
    });

    return briefing;
};
