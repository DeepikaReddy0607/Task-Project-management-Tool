import { getProjectScenario, runScenarioSimulation } from "./scenarioSimulationService.js";
import { getProjectDigitalTwin } from "./digitalTwinService.js";
import { verifyProjectAccess } from "./projectRiskService.js";

/**
 * Compares baseline project intelligence against one or more simulated scenarios.
 * 
 * Invariants:
 * - Purely factual, transparent side-by-side comparison
 * - Zero arbitrary "winner" declarations
 * - Exposes schedule, health, critical-path, bottleneck, and workload trade-offs
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.userId
 * @param {Array<string>} [params.scenarioIds] List of scenario IDs to compare
 * @param {Array<Object>} [params.scenarios] Direct list of already-simulated scenarios
 * @returns {Promise<Object>} Factual multi-scenario comparison matrix
 */
export const compareProjectScenarios = async ({
    projectId,
    userId,
    scenarioIds = [],
    scenarios = []
}) => {
    // 1. Verify project access
    await verifyProjectAccess(projectId, userId);

    // 2. Fetch baseline Digital Twin and compute baseline metrics
    const baselineTwin = await getProjectDigitalTwin(projectId, userId);
    const baseline = {
        name: "Current Baseline",
        scenarioId: "baseline",
        projectedEnd: baselineTwin.project.projectedDurationDays
            ? new Date(new Date(baselineTwin.project.startDate || Date.now()).getTime() + baselineTwin.criticalPath.projectDurationDays * 24 * 60 * 60 * 1000).toISOString()
            : null,
        plannedEnd: baselineTwin.project.endDate,
        plannedDurationDays: baselineTwin.project.plannedDurationDays,
        projectedDurationDays: baselineTwin.criticalPath.projectDurationDays,
        scheduleVarianceDays: Math.max(0, baselineTwin.criticalPath.projectDurationDays - baselineTwin.project.plannedDurationDays),
        healthScore: null, // Will populate below
        healthStatus: null,
        criticalTasksCount: (baselineTwin.criticalPath.criticalTasks || []).length,
        bottlenecksCount: baselineTwin.bottlenecks.count,
        majorBottlenecksCount: baselineTwin.bottlenecks.majorBottlenecksCount,
        deadlineRisksCount: 0,
        workloadConcentrationScore: 0,
        hasCycle: baselineTwin.criticalPath.hasCycle,
        mutationsCount: 0,
        warningsCount: 0
    };

    // Run a zero-mutation simulation on baseline to get exact standard metrics structure
    const baselineSim = runScenarioSimulation({
        project: baselineTwin.project,
        tasks: baselineTwin.tasks.items || [],
        dependencies: baselineTwin.dependencies,
        baseDigitalTwin: baselineTwin,
        mutations: []
    });

    baseline.projectedEnd = baselineSim.baseline.projectedEnd;
    baseline.scheduleVarianceDays = baselineSim.baseline.scheduleVarianceDays;
    baseline.healthScore = baselineSim.baseline.healthScore;
    baseline.healthStatus = baselineSim.baseline.healthStatus;
    baseline.deadlineRisksCount = baselineSim.baseline.deadlineRisksCount;
    baseline.workloadConcentrationScore = baselineSim.baseline.workloadConcentrationScore;

    // 3. Resolve target scenarios
    const candidateScenarios = [...scenarios];
    for (const sId of scenarioIds) {
        try {
            const fetched = await getProjectScenario(projectId, sId, userId);
            if (fetched && !candidateScenarios.some((s) => s.scenarioId === sId)) {
                candidateScenarios.push(fetched);
            }
        } catch {
            // Ignore missing scenarios
        }
    }

    // 4. Build comparison matrix rows
    const matrix = buildScenarioComparisonMatrix({ baseline, scenarios: candidateScenarios });

    return {
        projectId,
        ...matrix
    };
};

/**
 * Pure helper to build a scenario comparison matrix synchronously.
 */
export const buildScenarioComparisonMatrix = ({ baseline, scenarios = [] }) => {
    const scenarioRows = scenarios.map((scen, idx) => {
        const state = scen.simulatedState || (scen.scenario) || (scen.metrics) || {};
        const delta = scen.delta || scen.deltaAgainstBaseline || {};
        const mutations = scen.mutations || [];

        return {
            scenarioId: scen.scenarioId || `scenario_${idx + 1}`,
            name: scen.name || `Scenario ${idx + 1}`,
            description: scen.description || "",
            status: scen.status || "SIMULATED",
            mutationsCount: mutations.length,
            mutationsSummary: mutations.map((m) => `${m.type} (task: ${m.taskId || "N/A"})`),
            metrics: {
                projectedEnd: state.projectedEnd || null,
                scheduleVarianceDays: state.scheduleVarianceDays !== undefined ? state.scheduleVarianceDays : 0,
                healthScore: state.healthScore !== undefined ? state.healthScore : 0,
                healthStatus: state.healthStatus || "UNKNOWN",
                criticalTasksCount: state.criticalTasksCount !== undefined ? state.criticalTasksCount : 0,
                bottlenecksCount: state.bottlenecksCount !== undefined ? state.bottlenecksCount : 0,
                majorBottlenecksCount: state.majorBottlenecksCount !== undefined ? state.majorBottlenecksCount : 0,
                deadlineRisksCount: state.deadlineRisksCount !== undefined ? state.deadlineRisksCount : 0,
                workloadConcentrationScore: state.workloadConcentrationScore !== undefined ? state.workloadConcentrationScore : 0,
                hasCycle: Boolean(state.hasCycle),
                warningsCount: (scen.warnings || []).length
            },
            deltaAgainstBaseline: {
                scheduleVarianceDays: delta.scheduleVarianceDays !== undefined ? delta.scheduleVarianceDays : ((state.scheduleVarianceDays || 0) - (baseline?.scheduleVarianceDays || 0)),
                healthScore: delta.healthScoreDelta !== undefined ? delta.healthScoreDelta : ((state.healthScore || 0) - (baseline?.healthScore || 0)),
                criticalTasks: delta.criticalTasksDelta !== undefined ? delta.criticalTasksDelta : ((state.criticalTasksCount || 0) - (baseline?.criticalTasksCount || 0)),
                bottlenecks: delta.bottlenecksDelta !== undefined ? delta.bottlenecksDelta : ((state.bottlenecksCount || 0) - (baseline?.bottlenecksCount || 0)),
                deadlineRisks: delta.deadlineRisksDelta !== undefined ? delta.deadlineRisksDelta : ((state.deadlineRisksCount || 0) - (baseline?.deadlineRisksCount || 0)),
                workloadConcentration: delta.workloadConcentrationDelta !== undefined ? delta.workloadConcentrationDelta : ((state.workloadConcentrationScore || 0) - (baseline?.workloadConcentrationScore || 0))
            },
            warnings: scen.warnings || [],
            affectedTasksCount: (scen.affectedTasks || []).length
        };
    });

    return {
        comparedAt: new Date().toISOString(),
        totalScenarios: scenarioRows.length,
        baseline: baseline || {},
        scenarios: scenarioRows,
        tradeOffSummary: {
            leastDelay: scenarioRows.reduce((best, curr) => {
                if (!best || curr.metrics.scheduleVarianceDays < best.metrics.scheduleVarianceDays) return curr;
                return best;
            }, null)?.name || "Baseline",
            highestHealth: scenarioRows.reduce((best, curr) => {
                if (!best || curr.metrics.healthScore > best.metrics.healthScore) return curr;
                return best;
            }, null)?.name || "Baseline",
            fewestBottlenecks: scenarioRows.reduce((best, curr) => {
                if (!best || curr.metrics.bottlenecksCount < best.metrics.bottlenecksCount) return curr;
                return best;
            }, null)?.name || "Baseline"
        }
    };
};

/**
 * Pure wrapper for scenario comparison.
 */
export const compareScenarios = ({ baselineState, baseline, scenarios = [] }) => {
    return buildScenarioComparisonMatrix({ baseline: baselineState || baseline, scenarios });
};
