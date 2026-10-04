import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import {
    buildDependencyGraph,
    detectCycles,
    calculateTaskDurationDays
} from "./criticalPathService.js";

/**
 * In-memory test store for Monte Carlo forecasts and mock project graphs.
 */
const inMemoryForecastStore = new Map();
const inMemoryProjectDataStore = new Map();

export const clearForecastStore = () => {
    inMemoryForecastStore.clear();
    inMemoryProjectDataStore.clear();
};

export const setInMemoryForecast = (projectId, data) => {
    inMemoryForecastStore.set(projectId, data);
};

export const setInMemoryProjectData = (projectId, { project, tasks, dependencies }) => {
    inMemoryProjectDataStore.set(projectId, {
        project: project || { id: projectId, title: "Test Project" },
        tasks: tasks || [],
        dependencies: dependencies || []
    });
};

/**
 * 32-bit Mulberry32 PRNG for deterministic, reproducible simulations.
 */
export const createPrng = (seedVal = 123456789) => {
    let s = (typeof seedVal === "number" ? seedVal : hashStringToSeed(String(seedVal))) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const hashStringToSeed = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
};

/**
 * Helper to add days to a Date object deterministically (UTC).
 */
export const addDaysToDate = (date, days) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + Math.round(days));
    return d.toISOString().split("T")[0];
};

/**
 * Sample a duration from triangular distribution (min, mode, max).
 */
export const sampleTriangular = (min, mode, max, prng) => {
    if (min === max) return min;
    const u = prng();
    const f = (mode - min) / (max - min);
    if (u < f) {
        return Math.round(min + Math.sqrt(u * (max - min) * (mode - min)));
    }
    return Math.round(max - Math.sqrt((1 - u) * (max - min) * (max - mode)));
};

/**
 * Derive duration distribution parameters for a task.
 * If historical task duration samples exist, derives bounds from them.
 * Otherwise uses deterministic fallback uncertainty factor.
 */
export const getTaskDurationDistribution = (task, historicalSamples = null) => {
    const baseDuration = Math.max(1, calculateTaskDurationDays(task));

    if (Array.isArray(historicalSamples) && historicalSamples.length >= 3) {
        const sorted = [...historicalSamples].sort((a, b) => a - b);
        const min = Math.max(1, sorted[0]);
        const max = Math.max(min, sorted[sorted.length - 1]);
        const mode = Math.max(min, Math.min(max, Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)));
        return { min, mode, max, isFallback: false, sampleCount: historicalSamples.length };
    }

    // Conservative deterministic fallback: 0.8x min, 1.0x mode, 1.5x max
    const min = Math.max(1, Math.round(baseDuration * 0.8));
    const mode = baseDuration;
    const max = Math.max(mode, Math.round(baseDuration * 1.5));

    return { min, mode, max, isFallback: true, sampleCount: 0 };
};

/**
 * Core Monte Carlo schedule forecasting engine.
 * Pure, in-memory, read-only.
 */
export const runMonteCarloForecast = (arg1, arg2 = {}) => {
    let projectId, project, tasks, dependencies, iterations, seed, historicalSamplesMap, startOfToday;
    if (typeof arg1 === "string") {
        projectId = arg1;
        if (inMemoryForecastStore.has(projectId)) {
            return inMemoryForecastStore.get(projectId);
        }
        project = arg2.inMemoryData?.project || null;
        tasks = arg2.inMemoryData?.tasks || [];
        dependencies = arg2.inMemoryData?.dependencies || [];
        iterations = arg2.iterations || arg2.runs || 1000;
        seed = arg2.seed !== undefined ? arg2.seed : null;
        historicalSamplesMap = arg2.historicalSamplesMap || null;
        startOfToday = arg2.startOfToday || getStartOfTodayUtc();
    } else if (arg1 && typeof arg1 === "object") {
        projectId = arg1.projectId;
        if (inMemoryForecastStore.has(projectId)) {
            return inMemoryForecastStore.get(projectId);
        }
        project = arg1.project || null;
        tasks = arg1.tasks || [];
        dependencies = arg1.dependencies || [];
        iterations = arg1.iterations || arg1.runs || 1000;
        seed = arg1.seed !== undefined ? arg1.seed : null;
        historicalSamplesMap = arg1.historicalSamplesMap || null;
        startOfToday = arg1.startOfToday || getStartOfTodayUtc();
    } else {
        throw new Error("Project ID is required for Monte Carlo forecast");
    }

    if (!projectId) {
        throw new Error("Project ID is required for Monte Carlo forecast");
    }

    const itCount = Number(iterations);
    if (!Number.isInteger(itCount) || itCount <= 0 || itCount > 100000) {
        throw new Error("Iterations must be a positive integer between 1 and 100,000");
    }

    const prng = seed !== null && seed !== undefined ? createPrng(seed) : Math.random;

    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const incompleteTasks = activeTasks.filter((t) => t.status !== "Completed");

    const projectDeadline = project?.end_date ? new Date(project.end_date) : null;
    const projectStartDate = project?.start_date ? new Date(project.start_date) : startOfToday;
    const baseDate = startOfToday > projectStartDate ? startOfToday : projectStartDate;

    // Build Graph & check cycles
    const graph = buildDependencyGraph(activeTasks, dependencies);
    const cycleCheck = detectCycles(graph);

    if (cycleCheck.hasCycle) {
        return {
            projectId,
            status: "CYCLE",
            iterations: itCount,
            simulationRuns: 0,
            seed,
            hasCycle: true,
            error: "Dependency graph contains circular dependencies; cannot forecast schedule",
            baselineFinishDate: null,
            p50FinishDate: null,
            p80FinishDate: null,
            p90FinishDate: null,
            percentiles: null,
            uncertaintySpread: null,
            deadline: projectDeadline ? projectDeadline.toISOString().split("T")[0] : null,
            deadlineProbability: null,
            expectedDelayDays: 0,
            probabilityDistribution: [],
            histogram: [],
            confidence: "None",
            uncertainty: "Unforecastable (Cycle detected)",
            pathVolatility: 1,
            dominantPath: [],
            dominantPathProbability: 0,
            uniquePathsCount: 0,
            taskCriticalProbabilities: {},
            disclaimer: "Monte Carlo schedule forecasts are probabilistic estimates based on stochastic sampling. Unforecastable due to circular dependencies.",
            assumptions: [],
            limitations: ["Circular dependencies present in project DAG."]
        };
    }

    const { topologicalOrder } = cycleCheck;

    // Handle empty or 100% completed project
    if (activeTasks.length === 0 || incompleteTasks.length === 0) {
        const isZeroTasks = activeTasks.length === 0;
        const finishDateStr = baseDate.toISOString().split("T")[0];
        const dlStr = projectDeadline ? projectDeadline.toISOString().split("T")[0] : null;
        let dlProb = null;
        if (projectDeadline) {
            dlProb = finishDateStr <= dlStr ? 1.0 : 0.0;
        }

        const hist = [{ date: finishDateStr, count: isZeroTasks ? 0 : itCount, probability: 100, percentage: 100 }];

        return {
            projectId,
            status: isZeroTasks ? "EMPTY" : "SUCCESS",
            iterations: isZeroTasks ? 0 : itCount,
            simulationRuns: isZeroTasks ? 0 : itCount,
            seed,
            hasCycle: false,
            baselineFinishDate: finishDateStr,
            p50FinishDate: finishDateStr,
            p80FinishDate: finishDateStr,
            p90FinishDate: finishDateStr,
            percentiles: {
                p50: { days: 0, date: finishDateStr },
                p80: { days: 0, date: finishDateStr },
                p90: { days: 0, date: finishDateStr }
            },
            deadline: dlStr,
            deadlineProbability: dlProb,
            expectedDelayDays: 0,
            probabilityDistribution: hist,
            histogram: hist,
            uncertaintySpread: { spreadDays: 0, uncertaintyLevel: "LOW" },
            confidence: "High",
            uncertainty: "Narrow forecast",
            pathVolatility: 0,
            taskCriticalProbabilities: {},
            dominantPath: [],
            dominantPathProbability: 0,
            uniquePathsCount: 0,
            disclaimer: "Monte Carlo schedule forecasts are probabilistic estimates based on stochastic sampling and assumptions. They do not constitute an absolute guarantee of project completion dates.",
            inputs: {
                totalTasks: activeTasks.length,
                incompleteTasks: 0,
                dependencies: graph.edges.length,
                historicalDurationSamples: 0,
                uncertaintyModel: isZeroTasks ? "No tasks" : "All tasks completed"
            },
            assumptions: ["All active tasks completed or project has no tasks."],
            limitations: []
        };
    }

    // Precompute duration distribution parameters for incomplete tasks
    const taskDistributions = new Map();
    let fallbackCount = 0;
    let empiricalCount = 0;

    activeTasks.forEach((t) => {
        if (t.status === "Completed") {
            taskDistributions.set(t.id, { min: 0, mode: 0, max: 0, isCompleted: true });
        } else {
            const hist = historicalSamplesMap?.get?.(t.id) || null;
            const dist = getTaskDurationDistribution(t, hist);
            taskDistributions.set(t.id, dist);
            if (dist.isFallback) fallbackCount++;
            else empiricalCount++;
        }
    });

    // Run Monte Carlo Iterations
    const simulatedDurations = new Float64Array(itCount);
    const criticalTaskAppearances = new Map();
    activeTasks.forEach((t) => criticalTaskAppearances.set(t.id, 0));
    const pathSignatures = new Map();

    const earlyFinish = new Map();
    const earlyStart = new Map();
    const sampledDurations = new Map();

    for (let iter = 0; iter < itCount; iter++) {
        // Sample durations
        topologicalOrder.forEach((id) => {
            const dist = taskDistributions.get(id);
            if (dist.isCompleted) {
                sampledDurations.set(id, 0);
            } else {
                sampledDurations.set(id, sampleTriangular(dist.min, dist.mode, dist.max, prng));
            }
        });

        // Forward pass
        topologicalOrder.forEach((id) => {
            const preds = graph.reverseAdjacencyList.get(id) || [];
            let maxPredEF = 0;
            preds.forEach((pId) => {
                const ef = earlyFinish.get(pId) || 0;
                if (ef > maxPredEF) maxPredEF = ef;
            });

            const dur = sampledDurations.get(id) || 0;
            const es = maxPredEF;
            const ef = es + dur;
            earlyStart.set(id, es);
            earlyFinish.set(id, ef);
        });

        // Project duration for this iteration
        let maxEF = 0;
        topologicalOrder.forEach((id) => {
            const ef = earlyFinish.get(id) || 0;
            if (ef > maxEF) maxEF = ef;
        });
        simulatedDurations[iter] = maxEF;

        // Backward pass to find critical path in this iteration
        const lateFinish = new Map();
        const lateStart = new Map();
        for (let i = topologicalOrder.length - 1; i >= 0; i--) {
            const id = topologicalOrder[i];
            const succs = graph.adjacencyList.get(id) || [];
            let minSuccLS = maxEF;
            succs.forEach((sId) => {
                const ls = lateStart.get(sId);
                if (ls !== undefined && ls < minSuccLS) {
                    minSuccLS = ls;
                }
            });
            const dur = sampledDurations.get(id) || 0;
            lateFinish.set(id, minSuccLS);
            lateStart.set(id, minSuccLS - dur);
        }

        // Identify critical tasks in this run
        const runCriticalTasks = [];
        topologicalOrder.forEach((id) => {
            const es = earlyStart.get(id) || 0;
            const ls = lateStart.get(id) || 0;
            if (es === ls && (sampledDurations.get(id) || 0) > 0) {
                criticalTaskAppearances.set(id, (criticalTaskAppearances.get(id) || 0) + 1);
                runCriticalTasks.push(id);
            }
        });

        const sig = runCriticalTasks.sort().join("->");
        if (sig) {
            pathSignatures.set(sig, (pathSignatures.get(sig) || 0) + 1);
        }
    }

    // Sort durations to calculate percentiles
    simulatedDurations.sort();

    const p50Days = simulatedDurations[Math.min(itCount - 1, Math.floor(itCount * 0.5))];
    const p80Days = simulatedDurations[Math.min(itCount - 1, Math.floor(itCount * 0.8))];
    const p90Days = simulatedDurations[Math.min(itCount - 1, Math.floor(itCount * 0.9))];

    // Baseline calculation (deterministic single-pass with mode durations)
    let baselineDays = 0;
    topologicalOrder.forEach((id) => {
        const preds = graph.reverseAdjacencyList.get(id) || [];
        let maxPredEF = 0;
        preds.forEach((pId) => {
            const ef = earlyFinish.get(pId) || 0;
            if (ef > maxPredEF) maxPredEF = ef;
        });
        const dist = taskDistributions.get(id);
        const dur = dist.isCompleted ? 0 : dist.mode;
        const ef = maxPredEF + dur;
        earlyFinish.set(id, ef);
        if (ef > baselineDays) baselineDays = ef;
    });

    const baselineFinishDate = addDaysToDate(baseDate, baselineDays);
    const p50FinishDate = addDaysToDate(baseDate, p50Days);
    const p80FinishDate = addDaysToDate(baseDate, p80Days);
    const p90FinishDate = addDaysToDate(baseDate, p90Days);

    // Deadline Probability
    let deadlineProbability = null;
    let expectedDelayDays = 0;
    let deadlineStr = null;

    if (projectDeadline && !isNaN(projectDeadline.getTime())) {
        deadlineStr = projectDeadline.toISOString().split("T")[0];
        const daysToDeadline = Math.round((projectDeadline.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));

        let runsMeetingDeadline = 0;
        let totalDelay = 0;
        for (let i = 0; i < itCount; i++) {
            const d = simulatedDurations[i];
            if (d <= daysToDeadline) {
                runsMeetingDeadline++;
            } else {
                totalDelay += (d - daysToDeadline);
            }
        }
        deadlineProbability = Number((runsMeetingDeadline / itCount).toFixed(4));
        expectedDelayDays = Number((totalDelay / itCount).toFixed(1));
    }

    // Probability Distribution (10 discrete histogram buckets)
    const minDur = simulatedDurations[0];
    const maxDur = simulatedDurations[itCount - 1];
    const bucketCount = Math.min(10, Math.max(1, Math.round(maxDur - minDur) + 1));
    const bucketSize = (maxDur - minDur) / bucketCount || 1;
    const probabilityDistribution = [];

    for (let b = 0; b < bucketCount; b++) {
        const bStart = minDur + b * bucketSize;
        const bEnd = b === bucketCount - 1 ? maxDur + 0.001 : minDur + (b + 1) * bucketSize;
        let count = 0;
        for (let i = 0; i < itCount; i++) {
            if (simulatedDurations[i] >= bStart && simulatedDurations[i] < bEnd) {
                count++;
            }
        }
        const midDay = Math.round((bStart + bEnd) / 2);
        probabilityDistribution.push({
            bucketIndex: b,
            days: midDay,
            date: addDaysToDate(baseDate, midDay),
            count,
            probability: Number(((count / itCount) * 100).toFixed(1)),
            percentage: Number(((count / itCount) * 100).toFixed(1))
        });
    }

    // Uncertainty Spread (P90 - P50)
    const spreadDays = Math.round(p90Days - p50Days);
    const uncertaintyLevel = spreadDays < 7 ? "LOW" : spreadDays <= 14 ? "MEDIUM" : "HIGH";
    const uncertaintySpread = {
        spreadDays,
        uncertaintyLevel
    };

    let uncertainty = "Moderate uncertainty";
    let confidence = "Medium";
    if (spreadDays <= 3) {
        uncertainty = "Narrow forecast";
        confidence = "High";
    } else if (spreadDays > 7) {
        uncertainty = "High uncertainty";
        confidence = "Low";
    }

    const percentiles = {
        p50: { days: Math.round(p50Days), date: p50FinishDate },
        p80: { days: Math.round(p80Days), date: p80FinishDate },
        p90: { days: Math.round(p90Days), date: p90FinishDate }
    };

    // Path Volatility & Dominant Path
    let dominantPathSig = "";
    let dominantPathCount = 0;
    pathSignatures.forEach((cnt, sig) => {
        if (cnt > dominantPathCount) {
            dominantPathCount = cnt;
            dominantPathSig = sig;
        }
    });

    const uniquePathsCount = pathSignatures.size;
    const dominantPathProb = itCount > 0 ? Number(((dominantPathCount / itCount) * 100).toFixed(1)) : 0;
    const pathVolatility = Number((1 - (dominantPathCount / (itCount || 1))).toFixed(2));

    // Task Critical Probabilities
    const taskCriticalProbabilities = {};
    criticalTaskAppearances.forEach((appearances, tId) => {
        taskCriticalProbabilities[tId] = Number(((appearances / itCount) * 100).toFixed(1));
    });

    // Assumptions and Limitations
    const assumptions = [
        "Incomplete tasks execute along verified dependency DAG without parallel resource throttling.",
        "Durations modeled with 3-point bounded triangular uncertainty distributions.",
        "Tasks proceed on full calendar days based on estimated working hours."
    ];

    const limitations = [];
    if (fallbackCount > 0) {
        limitations.push(`Used conservative fallback duration distributions (0.8x-1.5x) for ${fallbackCount} task(s) lacking historical duration samples.`);
    }
    if (!projectDeadline) {
        limitations.push("Project deadline has not been set; deadline probability cannot be evaluated.");
    }

    return {
        projectId,
        status: "SUCCESS",
        iterations: itCount,
        simulationRuns: itCount,
        seed,
        hasCycle: false,
        baselineFinishDate,
        p50FinishDate,
        p80FinishDate,
        p90FinishDate,
        percentiles,
        uncertaintySpread,
        deadline: deadlineStr,
        deadlineProbability,
        expectedDelayDays,
        probabilityDistribution,
        histogram: probabilityDistribution,
        confidence,
        uncertainty,
        pathVolatility,
        dominantPath: dominantPathSig ? dominantPathSig.split("->") : [],
        dominantPathProbability: dominantPathProb,
        uniquePathsCount,
        taskCriticalProbabilities,
        disclaimer: "Monte Carlo schedule forecasts are probabilistic estimates based on stochastic sampling and historical models. They do not constitute an absolute guarantee of project completion dates.",
        inputs: {
            totalTasks: activeTasks.length,
            incompleteTasks: incompleteTasks.length,
            dependencies: graph.edges.length,
            historicalDurationSamples: empiricalCount,
            uncertaintyModel: empiricalCount > 0 ? "Hybrid empirical & bounded triangular" : "Deterministic bounded triangular fallback"
        },
        assumptions,
        limitations
    };
};

/**
 * Retrieve or compute Monte Carlo schedule forecast for a project.
 */
export const getProjectForecast = async (projectId, userId = null, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required");
    }

    // Check in-memory store (useful for tests)
    if (inMemoryForecastStore.has(projectId)) {
        return inMemoryForecastStore.get(projectId);
    }

    if (inMemoryProjectDataStore.has(projectId)) {
        const mockData = inMemoryProjectDataStore.get(projectId);
        const result = runMonteCarloForecast({
            projectId,
            project: mockData.project,
            tasks: mockData.tasks,
            dependencies: mockData.dependencies,
            iterations: options.iterations || 1000,
            seed: options.seed
        });
        return result;
    }

    // Production database lookup
    if (userId) {
        await verifyProjectAccess(projectId, userId);
    }

    const isUuid = typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isUuid) {
        const err = new Error("Project not found");
        err.statusCode = 404;
        throw err;
    }

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
        include: { workspaces: { select: { name: true } } }
    });

    if (!project) {
        const err = new Error("Project not found");
        err.statusCode = 404;
        throw err;
    }

    const [tasks, dependencies] = await Promise.all([
        prisma.tasks.findMany({
            where: { project_id: projectId, is_archived: false },
            include: {
                task_dependencies_task_dependencies_task_idTotasks: true,
                task_dependencies_task_dependencies_depends_on_task_idTotasks: true
            }
        }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
            }
        })
    ]);

    const result = runMonteCarloForecast({
        projectId,
        project,
        tasks,
        dependencies,
        iterations: options.iterations || 10000,
        seed: options.seed
    });

    return result;
};

export const clearMonteCarloStore = clearForecastStore;
export const mulberry32 = createPrng;
export const boundedTriangularDuration = (min, mode, max, prngOrVal) => {
    if (typeof prngOrVal === "number") {
        return sampleTriangular(min, mode, max, () => prngOrVal);
    }
    return sampleTriangular(min, mode, max, prngOrVal);
};

