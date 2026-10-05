import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { deepClone } from "./scenarioSimulationService.js";
import { calculatePortfolioIntelligence } from "./portfolioIntelligenceService.js";

/**
 * Pure, in-memory Portfolio What-If Simulator.
 * Simulates cross-project impacts of resource unavailability, project deadline shifts,
 * scope additions, or task delays across multiple projects.
 * 
 * Strict Guarantees:
 * - 100% read-only
 * - Zero database writes
 * - Zero realtime event emissions
 * - Zero notifications or activity logs generated
 */
export const simulatePortfolioScenario = ({
    workspaceId,
    scenarioType, // 'RESOURCE_UNAVAILABLE' | 'PROJECT_DEADLINE_CHANGE' | 'SCOPE_GROWTH' | 'TASK_DELAY' | 'TASK_DURATION_CHANGE'
    params = {}, // { userId, days, projectId, delayDays, taskCount, taskId }
    projectsData = [], // Array of { project, tasks, dependencies, members, risks }
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required for portfolio simulation");
    }

    if (!scenarioType) {
        throw new Error("Scenario type is required");
    }

    // 1. Calculate Baseline Portfolio
    const baselineProjects = projectsData.map((pd) => deepClone(pd.project));
    const baselineTasks = projectsData.flatMap((pd) => deepClone(pd.tasks || []));
    const baselineDeps = projectsData.flatMap((pd) => deepClone(pd.dependencies || []));
    const baselineMembers = projectsData.flatMap((pd) => deepClone(pd.members || []));
    const baselineRisks = projectsData.flatMap((pd) => deepClone(pd.risks || []));

    const baselinePortfolio = calculatePortfolioIntelligence({
        workspaceId,
        projects: baselineProjects,
        tasks: baselineTasks,
        dependencies: baselineDeps,
        members: baselineMembers,
        risks: baselineRisks,
        startOfToday
    });

    // 2. Clone state for simulation
    const simulatedProjectsData = deepClone(projectsData);
    const affectedProjectIds = new Set();

    // 3. Apply Scenario Mutations
    switch (scenarioType) {
        case "RESOURCE_UNAVAILABLE": {
            const targetUserId = params.userId;
            const unavailDays = Math.max(1, Math.round(Number(params.days) || 5));

            if (!targetUserId) {
                throw new Error("Target user ID is required for RESOURCE_UNAVAILABLE scenario");
            }

            simulatedProjectsData.forEach((pd) => {
                let affectedInProject = false;
                (pd.tasks || []).forEach((t) => {
                    if (t.assigned_to === targetUserId && t.status !== "Completed" && !t.is_archived) {
                        t.estimated_hours = Number(t.estimated_hours || 0) + (unavailDays * 8);
                        affectedInProject = true;
                    }
                });
                if (affectedInProject) {
                    affectedProjectIds.add(pd.project.id);
                }
            });
            break;
        }

        case "PROJECT_DEADLINE_CHANGE": {
            const targetProjectId = params.projectId;
            const shiftDays = Number(params.days) || 0;

            simulatedProjectsData.forEach((pd) => {
                if (pd.project.id === targetProjectId && pd.project.end_date) {
                    const d = new Date(pd.project.end_date);
                    d.setUTCDate(d.getUTCDate() + shiftDays);
                    pd.project.end_date = d.toISOString();
                    affectedProjectIds.add(pd.project.id);
                }
            });
            break;
        }

        case "SCOPE_GROWTH": {
            const targetProjectId = params.projectId;
            const addCount = params.taskCount ? Math.max(1, Math.round(Number(params.taskCount))) : Math.max(1, Math.round(((params.growthPercentage || 10) / 100) * 10));

            simulatedProjectsData.forEach((pd) => {
                if (!targetProjectId || pd.project.id === targetProjectId) {
                    for (let i = 1; i <= addCount; i++) {
                        (pd.tasks || (pd.tasks = [])).push({
                            id: `synth-task-${Date.now()}-${i}`,
                            project_id: pd.project.id,
                            title: `Simulated Scope Task ${i}`,
                            status: "Backlog",
                            priority: "Medium",
                            estimated_hours: 16,
                            is_archived: false,
                            due_date: pd.project.end_date
                        });
                    }
                    affectedProjectIds.add(pd.project.id);
                }
            });
            break;
        }

        case "TASK_DELAY": {
            const targetTaskId = params.taskId;
            const delayDays = Math.max(1, Math.round(Number(params.delayDays) || 3));

            simulatedProjectsData.forEach((pd) => {
                const targetTask = (pd.tasks || []).find((t) => t.id === targetTaskId);
                if (targetTask) {
                    targetTask.estimated_hours = Number(targetTask.estimated_hours || 0) + (delayDays * 8);
                    if (targetTask.due_date) {
                        const d = new Date(targetTask.due_date);
                        d.setUTCDate(d.getUTCDate() + delayDays);
                        targetTask.due_date = d.toISOString();
                    }
                    affectedProjectIds.add(pd.project.id);
                }
            });
            break;
        }

        default:
            throw new Error(`Unsupported portfolio scenario type: ${scenarioType}`);
    }

    // 4. Calculate Simulated Portfolio
    const simulatedProjects = simulatedProjectsData.map((pd) => pd.project);
    const simulatedTasks = simulatedProjectsData.flatMap((pd) => pd.tasks || []);
    const simulatedDeps = simulatedProjectsData.flatMap((pd) => pd.dependencies || []);
    const simulatedMembers = simulatedProjectsData.flatMap((pd) => pd.members || []);
    const simulatedRisks = simulatedProjectsData.flatMap((pd) => pd.risks || []);

    const simulatedPortfolio = calculatePortfolioIntelligence({
        workspaceId,
        projects: simulatedProjects,
        tasks: simulatedTasks,
        dependencies: simulatedDeps,
        members: simulatedMembers,
        risks: simulatedRisks,
        startOfToday
    });

    // 5. Compare Projects & Build Delta
    const baselineProjectMap = new Map();
    baselinePortfolio.projects.forEach((p) => baselineProjectMap.set(p.projectId, p));

    const affectedProjects = [];
    const unaffectedProjects = [];

    simulatedPortfolio.projects.forEach((simP) => {
        const baseP = baselineProjectMap.get(simP.projectId);
        const healthDelta = baseP ? simP.healthScore - baseP.healthScore : 0;
        const isAffected = affectedProjectIds.has(simP.projectId);

        const projectComparison = {
            projectId: simP.projectId,
            title: simP.title,
            baselineHealthScore: baseP ? baseP.healthScore : null,
            simulatedHealthScore: simP.healthScore,
            healthScoreDelta: healthDelta,
            baselineStatus: baseP ? baseP.healthStatus : null,
            simulatedStatus: simP.healthStatus,
            isDirectlyAffected: isAffected,
            deltaDays: isAffected ? (params.days || params.delayDays || 4) : 0
        };

        if (isAffected || healthDelta !== 0) {
            affectedProjects.push(projectComparison);
        } else {
            unaffectedProjects.push(projectComparison);
        }
    });

    const portfolioHealthDelta = simulatedPortfolio.portfolioHealthScore - baselinePortfolio.portfolioHealthScore;

    return {
        workspaceId,
        scenarioType,
        parameters: params,
        baselineHealthScore: baselinePortfolio.portfolioHealthScore,
        simulatedHealthScore: simulatedPortfolio.portfolioHealthScore,
        deltaHealthScore: portfolioHealthDelta,
        baseline: {
            portfolioHealthScore: baselinePortfolio.portfolioHealthScore,
            portfolioStatus: baselinePortfolio.portfolioStatus,
            totalProjects: baselinePortfolio.totalProjects
        },
        simulated: {
            portfolioHealthScore: simulatedPortfolio.portfolioHealthScore,
            portfolioStatus: simulatedPortfolio.portfolioStatus,
            totalProjects: simulatedPortfolio.totalProjects
        },
        delta: {
            portfolioHealthDelta,
            affectedProjectsCount: affectedProjects.length,
            unaffectedProjectsCount: unaffectedProjects.length
        },
        affectedProjects,
        unaffectedProjects,
        disclaimer: "This is a simulated scenario. No live project data has been modified."
    };
};
