import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth, HEALTH_STATUS } from "./projectHealthService.js";

const inMemoryPortfolioStore = new Map();

export const clearPortfolioStore = () => {
    inMemoryPortfolioStore.clear();
};

export const setInMemoryPortfolioData = (workspaceId, data) => {
    inMemoryPortfolioStore.set(workspaceId, data);
};

/**
 * Calculates Portfolio Intelligence & Risk Map across authorized projects in a workspace.
 */
export const calculatePortfolioIntelligence = ({
    workspaceId,
    projects = [],
    tasks = [],
    dependencies = [],
    members = [],
    risks = [],
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (inMemoryPortfolioStore.has(workspaceId)) {
        return inMemoryPortfolioStore.get(workspaceId);
    }

    const activeProjects = (projects || []).filter((p) => !p.is_archived);
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const activeRisks = (risks || []).filter((r) => r.status !== "Closed" && r.status !== "Mitigated");

    if (activeProjects.length === 0) {
        return {
            workspaceId,
            totalProjects: 0,
            portfolioHealthScore: 100,
            portfolioStatus: HEALTH_STATUS.HEALTHY,
            distribution: { HEALTHY: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0 },
            projects: [],
            riskConcentration: {
                projectsUnderPressureCount: 0,
                highRiskProjectsRatio: 0,
                criticalProjects: [],
                sharedBottlenecksCount: 0,
                deadlinePressureCount: 0,
                observations: ["No active projects available for portfolio intelligence."]
            },
            disclaimer: "Portfolio metrics aggregate authorized project states within the current workspace."
        };
    }

    // Index entities by projectId
    const tasksByProject = new Map();
    const depsByProject = new Map();
    const membersByProject = new Map();
    const risksByProject = new Map();

    activeProjects.forEach((p) => {
        tasksByProject.set(p.id, []);
        depsByProject.set(p.id, []);
        membersByProject.set(p.id, []);
        risksByProject.set(p.id, []);
    });

    activeTasks.forEach((t) => {
        if (tasksByProject.has(t.project_id)) {
            tasksByProject.get(t.project_id).push(t);
        }
    });

    (dependencies || []).forEach((d) => {
        // Look up project from task
        const t = activeTasks.find((item) => item.id === d.task_id);
        if (t && depsByProject.has(t.project_id)) {
            depsByProject.get(t.project_id).push(d);
        }
    });

    (members || []).forEach((m) => {
        if (membersByProject.has(m.project_id)) {
            membersByProject.get(m.project_id).push(m);
        }
    });

    activeRisks.forEach((r) => {
        if (risksByProject.has(r.project_id)) {
            risksByProject.get(r.project_id).push(r);
        }
    });

    // Evaluate each project
    const projectVectors = [];
    let totalWeightedHealth = 0;
    let totalWeight = 0;
    const distribution = { HEALTHY: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0 };
    let deadlinePressureCount = 0;
    let highUncertaintyCount = 0;

    activeProjects.forEach((project) => {
        const pTasks = tasksByProject.get(project.id) || [];
        const pDeps = depsByProject.get(project.id) || [];
        const pMembers = membersByProject.get(project.id) || [];
        const pRisks = risksByProject.get(project.id) || [];

        const twin = buildDigitalTwin({
            project,
            tasks: pTasks,
            dependencies: pDeps,
            projectMembers: pMembers,
            risks: pRisks,
            startOfToday
        });

        const health = calculateProjectHealth(twin);
        const score = Number.isFinite(project.healthScore)
            ? project.healthScore
            : (health.score ?? health.healthScore ?? 100);
        let status;
        if (Number.isFinite(project.healthScore)) {
            if (score >= 80) status = "HEALTHY";
            else if (score >= 65) status = "WATCH";
            else if (score >= 50) status = "AT_RISK";
            else status = "CRITICAL";
        } else {
            status = health.status ?? health.healthStatus;
            if (!status) {
                if (score >= 80) status = "HEALTHY";
                else if (score >= 65) status = "WATCH";
                else if (score >= 50) status = "AT_RISK";
                else status = "CRITICAL";
            }
        }

        distribution[status] = (distribution[status] || 0) + 1;

        // Weighting by active tasks count (minimum weight 1)
        const weight = Math.max(1, pTasks.filter((t) => t.status !== "Completed").length);
        totalWeightedHealth += score * weight;
        totalWeight += weight;

        // Dimension Pressures
        const deadlinePressure = (health.dimensions?.schedule ?? 100) < 65 ? "HIGH" : (health.dimensions?.schedule ?? 100) < 80 ? "MEDIUM" : "LOW";
        const bottleneckPressure = (health.dimensions?.bottlenecks ?? 100) < 60 ? "HIGH" : (health.dimensions?.bottlenecks ?? 100) < 80 ? "MEDIUM" : "LOW";
        const dependencyPressure = (health.dimensions?.dependencies ?? 100) < 60 ? "HIGH" : "LOW";
        const workloadPressure = (health.dimensions?.workload ?? 100) < 60 ? "HIGH" : "LOW";
        const riskPressure = (health.dimensions?.risks ?? 100) < 60 ? "HIGH" : "LOW";

        if (deadlinePressure === "HIGH") deadlinePressureCount++;

        projectVectors.push({
            id: project.id,
            projectId: project.id,
            title: project.title,
            priority: project.priority,
            status: project.status,
            healthScore: score,
            healthStatus: status,
            riskStatus: status,
            trend: health.trend || "STABLE",
            activeTasksCount: pTasks.filter((t) => t.status !== "Completed").length,
            totalTasksCount: pTasks.length,
            deadlinePressure,
            bottleneckPressure,
            dependencyPressure,
            workloadPressure,
            riskPressure,
            riskVectors: {
                schedule: deadlinePressure,
                bottleneck: bottleneckPressure,
                dependency: dependencyPressure,
                workload: workloadPressure,
                risk: riskPressure
            },
            dimensions: health.dimensions || {},
            criticalTasksCount: twin.tasks?.critical || 0
        });
    });

    const portfolioHealthScore = totalWeight > 0
        ? Math.round(totalWeightedHealth / totalWeight)
        : 100;

    let portfolioStatus = HEALTH_STATUS.HEALTHY;
    if (portfolioHealthScore < 50) portfolioStatus = HEALTH_STATUS.CRITICAL;
    else if (portfolioHealthScore < 65) portfolioStatus = HEALTH_STATUS.AT_RISK;
    else if (portfolioHealthScore < 80) portfolioStatus = HEALTH_STATUS.WATCH;

    // Risk Concentration Observations
    const criticalProjects = projectVectors.filter((p) => p.healthStatus === "CRITICAL" || p.healthStatus === "AT_RISK");
    const projectsUnderPressureCount = criticalProjects.length;
    const highRiskRatio = Number(((projectsUnderPressureCount / activeProjects.length) * 100).toFixed(1));

    const observations = [];
    if (projectsUnderPressureCount > 0) {
        observations.push(`${projectsUnderPressureCount} of ${activeProjects.length} (${highRiskRatio}%) active projects are currently at risk or in critical condition.`);
    } else {
        observations.push("All evaluated projects are operating within healthy or watch status bounds.");
    }

    if (deadlinePressureCount > 0) {
        observations.push(`${deadlinePressureCount} project(s) exhibit high deadline scheduling pressure.`);
    }

    return {
        workspaceId,
        totalProjects: activeProjects.length,
        portfolioHealthScore,
        portfolioStatus,
        distribution,
        riskDistribution: distribution,
        projects: projectVectors,
        riskConcentration: observations,
        riskConcentrationDetails: {
            projectsUnderPressureCount,
            highRiskProjectsRatio: highRiskRatio,
            criticalProjects: criticalProjects.map((p) => ({ id: p.projectId, title: p.title, score: p.healthScore })),
            deadlinePressureCount,
            observations
        },
        disclaimer: "Portfolio metrics aggregate authorized project states within the current workspace."
    };
};

/**
 * Endpoint-level retriever with strict workspace authorization.
 */
export const getPortfolioIntelligence = async (workspaceId, userId) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (inMemoryPortfolioStore.has(workspaceId)) {
        return inMemoryPortfolioStore.get(workspaceId);
    }

    // Verify workspace access
    const isUuid = typeof workspaceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId);
    if (!isUuid) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    const membership = await prisma.workspace_members.findFirst({
        where: { workspace_id: workspaceId, user_id: userId }
    });

    if (!membership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    // Fetch projects user is authorized to see
    const projects = await prisma.projects.findMany({
        where: { workspace_id: workspaceId, is_archived: false },
        include: { project_members: { select: { user_id: true } } }
    });

    const authorized = projects.filter((p) =>
        membership.workspace_role === "Owner" ||
        membership.workspace_role === "Admin" ||
        p.manager_id === userId ||
        p.project_members.some((m) => m.user_id === userId)
    );

    const projectIds = authorized.map((p) => p.id);

    const [tasks, dependencies, members, risks] = await Promise.all([
        prisma.tasks.findMany({
            where: { project_id: { in: projectIds }, is_archived: false },
            include: {
                users_tasks_assigned_toTousers: { select: { id: true, first_name: true, last_name: true } }
            }
        }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: { in: projectIds }, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: { in: projectIds }, is_archived: false }
            }
        }),
        prisma.project_members.findMany({
            where: { project_id: { in: projectIds } }
        }),
        prisma.risks.findMany({
            where: { project_id: { in: projectIds } }
        })
    ]);

    return calculatePortfolioIntelligence({
        workspaceId,
        projects: authorized,
        tasks,
        dependencies,
        members,
        risks
    });
};

export const getWorkspacePortfolioIntelligence = getPortfolioIntelligence;
export const getPortfolioRiskMap = getPortfolioIntelligence;

