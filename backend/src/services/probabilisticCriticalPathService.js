import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { runMonteCarloForecast, getProjectForecast } from "./monteCarloForecastService.js";
import { detectBottlenecks } from "./bottleneckService.js";

const inMemoryProbabilisticStore = new Map();

export const clearProbabilisticCriticalPathStore = () => {
    inMemoryProbabilisticStore.clear();
};

export const setInMemoryProbabilisticCriticalPath = (projectId, data) => {
    inMemoryProbabilisticStore.set(projectId, data);
};

/**
 * Calculates probabilistic critical path metrics for a project.
 * Uses Monte Carlo simulation results to calculate per-task critical path appearance
 * probabilities, dominant paths, path volatility, and high-impact tasks.
 */
export const calculateProbabilisticCriticalPath = async ({
    projectId,
    project = null,
    tasks = [],
    dependencies = [],
    iterations = 5000,
    seed = null,
    forecastResult = null
}) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    // Check test store
    if (inMemoryProbabilisticStore.has(projectId)) {
        return inMemoryProbabilisticStore.get(projectId);
    }

    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const taskMap = new Map();
    activeTasks.forEach((t) => taskMap.set(t.id, t));

    // Obtain or execute Monte Carlo simulation
    const forecast = forecastResult || runMonteCarloForecast({
        projectId,
        project,
        tasks: activeTasks,
        dependencies,
        iterations,
        seed
    });

    if (forecast.hasCycle) {
        return {
            projectId,
            hasCycle: true,
            error: forecast.error,
            taskProbabilities: [],
            dominantPath: [],
            dominantPathProbability: 0,
            uniquePathsCount: 0,
            pathVolatility: 0,
            highImpactTasks: [],
            disclaimer: "Deterministic probabilistic analysis based on simulated iterations without guarantees."
        };
    }

    const { taskCriticalProbabilities = {}, dominantPath = [], dominantPathProbability = 0, uniquePathsCount = 0, pathVolatility = 0 } = forecast;

    // Structure task probabilities
    const taskProbabilities = activeTasks.map((t) => {
        const prob = taskCriticalProbabilities[t.id] ?? 0;
        return {
            taskId: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            assignedTo: t.assigned_to || null,
            criticalPathProbability: prob,
            isCurrentlyCompleted: t.status === "Completed",
            appearanceClassification: prob >= 70 ? "HIGH" : prob >= 30 ? "MODERATE" : "LOW"
        };
    });

    // Sort descending by probability
    taskProbabilities.sort((a, b) => b.criticalPathProbability - a.criticalPathProbability);

    // Calculate bottlenecks for downstream impact context
    let bottlenecks = [];
    try {
        const bottleneckRes = detectBottlenecks({
            project,
            tasks: activeTasks,
            dependencies
        });
        bottlenecks = bottleneckRes?.bottlenecks || [];
    } catch {
        bottlenecks = [];
    }
    const bottleneckMap = new Map();
    bottlenecks.forEach((b) => bottleneckMap.set(b.taskId, b));

    // Identify High-Impact Tasks:
    // Criteria: criticalPathProbability >= 30% OR (criticalPathProbability > 0 AND high downstream bottleneck score)
    const highImpactTasks = taskProbabilities
        .filter((tp) => !tp.isCurrentlyCompleted && tp.criticalPathProbability > 0)
        .map((tp) => {
            const b = bottleneckMap.get(tp.taskId);
            const downstreamBlocked = b?.downstreamImpact?.transitiveCount || 0;
            const bottleneckScore = b?.score || 0;
            const reasons = [];

            if (tp.criticalPathProbability >= 50) {
                reasons.push(`High critical-path probability (${tp.criticalPathProbability}% of simulated runs).`);
            } else if (tp.criticalPathProbability >= 20) {
                reasons.push(`Moderate critical-path presence (${tp.criticalPathProbability}% of simulated runs).`);
            }

            if (downstreamBlocked > 0) {
                reasons.push(`Blocks ${downstreamBlocked} downstream dependent task(s).`);
            }

            if (bottleneckScore >= 60) {
                reasons.push(`Identified as a major operational bottleneck (Score: ${bottleneckScore}/100).`);
            }

            return {
                taskId: tp.taskId,
                title: tp.title,
                priority: tp.priority,
                criticalPathProbability: tp.criticalPathProbability,
                downstreamBlockedTasks: downstreamBlocked,
                bottleneckScore,
                impactLevel: tp.criticalPathProbability >= 60 || bottleneckScore >= 70 ? "HIGH" : "MEDIUM",
                evidence: reasons.join(" ")
            };
        })
        .sort((a, b) => (b.criticalPathProbability + b.bottleneckScore) - (a.criticalPathProbability + a.bottleneckScore))
        .slice(0, 10);

    return {
        projectId,
        hasCycle: false,
        totalTasks: activeTasks.length,
        iterations: forecast.iterations,
        taskProbabilities,
        dominantPath,
        dominantPathProbability,
        uniquePathsCount,
        pathVolatility,
        highImpactTasks,
        disclaimer: "Task critical path probabilities represent simulated iteration frequencies under duration uncertainty. They do not constitute guaranteed outcomes."
    };
};

/**
 * Endpoint-level retriever with access control.
 */
export const getProbabilisticCriticalPath = async (projectId, userId = null, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    if (inMemoryProbabilisticStore.has(projectId)) {
        return inMemoryProbabilisticStore.get(projectId);
    }

    if (userId) {
        await verifyProjectAccess(projectId, userId);
    }

    const forecast = await getProjectForecast(projectId, userId, options);

    const [project, tasks, dependencies] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
            }
        })
    ]);

    return calculateProbabilisticCriticalPath({
        projectId,
        project,
        tasks,
        dependencies,
        forecastResult: forecast
    });
};
