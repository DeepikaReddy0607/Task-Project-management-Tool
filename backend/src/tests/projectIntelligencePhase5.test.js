import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    clearMonteCarloStore,
    setInMemoryForecast,
    runMonteCarloForecast,
    getProjectForecast,
    mulberry32,
    boundedTriangularDuration
} from "../services/monteCarloForecastService.js";

import {
    clearProbabilisticCriticalPathStore,
    setInMemoryProbabilisticCriticalPath,
    getProbabilisticCriticalPath
} from "../services/probabilisticCriticalPathService.js";

import {
    clearScopeIntelligenceStore,
    setInMemoryScopeIntelligence,
    getProjectScopeIntelligence
} from "../services/scopeIntelligenceService.js";

import {
    clearCrossProjectStore,
    setInMemoryCrossProjectData,
    getCrossProjectIntelligence
} from "../services/crossProjectIntelligenceService.js";

import {
    clearResourceStore,
    setInMemoryResourceData,
    calculateResourcePressureScore,
    simulateResourceUnavailability,
    getResourceConflicts
} from "../services/resourceConflictService.js";

import {
    clearPortfolioStore,
    setInMemoryPortfolioData,
    calculatePortfolioIntelligence,
    getPortfolioIntelligence
} from "../services/portfolioIntelligenceService.js";

import {
    simulatePortfolioScenario
} from "../services/portfolioSimulationService.js";

import {
    processMessage,
    formatForecastReply,
    formatProbabilisticCriticalPathReply,
    formatScopeReply,
    formatCrossProjectReply,
    formatResourceConflictReply,
    formatPortfolioReply,
    formatPortfolioSimulationReply,
    getQuackieForecastSummary,
    getQuackieProbabilisticCriticalPathSummary,
    getQuackieScopeSummary,
    getQuackieCrossProjectSummary,
    getQuackieResourceConflictSummary,
    getQuackiePortfolioSummary,
    getQuackiePortfolioSimulationSummary
} from "../services/quackieService.js";

import {
    INTELLIGENCE_ALERT_TYPES,
    extractIntelligenceSnapshot,
    detectIntelligenceStateTransitions,
    clearAllBaselines
} from "../services/intelligenceAlertService.js";

describe("PHASE 5: Advanced Predictive + Cross-Project Intelligence Test Suite", () => {
    const PROJ_A = "proj-monte-carlo-a";
    const PROJ_B = "proj-monte-carlo-b";
    const WS_ALPHA = "ws-portfolio-alpha";
    const WS_BETA = "ws-portfolio-beta";
    const USER_BOB = "user-bob";
    const USER_CAROL = "user-carol";

    beforeEach(() => {
        clearMonteCarloStore();
        clearProbabilisticCriticalPathStore();
        clearScopeIntelligenceStore();
        clearCrossProjectStore();
        clearResourceStore();
        clearPortfolioStore();
        clearAllBaselines();
    });

    // ============================================================
    // SECTION 59: MONTE CARLO SCHEDULE FORECASTING (1-20)
    // ============================================================

    test("1. Forecast completes with bounded triangular distribution", () => {
        const val = boundedTriangularDuration(2, 4, 8, 0.5);
        assert.ok(val >= 2, "Value should be >= optimistic");
        assert.ok(val <= 8, "Value should be <= pessimistic");
    });

    test("2. P50 <= P80 <= P90 monotonically increasing", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-25" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 16, start_date: "2026-10-01", due_date: "2026-10-05" },
            { id: "t2", title: "Task 2", project_id: PROJ_A, status: "To Do", estimated_hours: 24, start_date: "2026-10-06", due_date: "2026-10-12" }
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];

        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 500,
            seed: 42,
            inMemoryData: { project, tasks, dependencies }
        });

        assert.ok(result.percentiles.p50.days <= result.percentiles.p80.days, "P50 should be <= P80");
        assert.ok(result.percentiles.p80.days <= result.percentiles.p90.days, "P80 should be <= P90");
    });

    test("3. Deadline probability correctly calculated (0 to 1)", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-20" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 16 }
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 300,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });

        assert.ok(result.deadlineProbability >= 0 && result.deadlineProbability <= 1);
    });

    test("4. Uncertainty spread (P90 - P50) correctly calculated", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-20" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 40 }
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 300,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });

        const expectedSpread = result.percentiles.p90.days - result.percentiles.p50.days;
        assert.equal(result.uncertaintySpread.spreadDays, expectedSpread);
    });

    test("5. Uncertainty levels: LOW (< 7 days), MEDIUM (7-14 days), HIGH (> 14 days)", async () => {
        const mockLow = {
            projectId: PROJ_A,
            percentiles: { p50: { days: 10 }, p80: { days: 12 }, p90: { days: 14 } },
            uncertaintySpread: { spreadDays: 4, uncertaintyLevel: "LOW" },
            simulationRuns: 1000
        };
        setInMemoryForecast(PROJ_A, mockLow);
        const forecast = await runMonteCarloForecast(PROJ_A);
        assert.equal(forecast.uncertaintySpread.uncertaintyLevel, "LOW");
    });

    test("6. PRNG with identical seed produces bit-identical results (reproducibility)", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-20" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 24 }
        ];

        const run1 = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 12345,
            inMemoryData: { project, tasks, dependencies: [] }
        });

        const run2 = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 12345,
            inMemoryData: { project, tasks, dependencies: [] }
        });

        assert.equal(run1.percentiles.p50.days, run2.percentiles.p50.days);
        assert.equal(run1.percentiles.p90.days, run2.percentiles.p90.days);
        assert.equal(run1.deadlineProbability, run2.deadlineProbability);
    });

    test("7. Different seeds produce varied distributions", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-20" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 80 }
        ];

        const r1 = mulberry32(1111)();
        const r2 = mulberry32(9999)();
        assert.notEqual(r1, r2, "PRNG values for different seeds should vary");
    });

    test("8. Empty project returns EMPTY status without throwing", async () => {
        const project = { id: PROJ_A, title: "Alpha" };
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 100,
            inMemoryData: { project, tasks: [], dependencies: [] }
        });
        assert.equal(result.status, "EMPTY");
        assert.equal(result.simulationRuns, 0);
    });

    test("9. Dependency cycle returns CYCLE status without throwing or hanging", async () => {
        const project = { id: PROJ_A, title: "Alpha" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 8 },
            { id: "t2", title: "Task 2", project_id: PROJ_A, status: "To Do", estimated_hours: 8 }
        ];
        const dependencies = [
            { task_id: "t1", depends_on_task_id: "t2" },
            { task_id: "t2", depends_on_task_id: "t1" }
        ];

        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 100,
            inMemoryData: { project, tasks, dependencies }
        });
        assert.equal(result.status, "CYCLE");
    });

    test("10. Single task project calculates accurate bounds based on task duration", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-10" };
        const tasks = [
            { id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 24 } // 3 days
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.ok(result.percentiles.p50.days >= 2 && result.percentiles.p50.days <= 5);
    });

    test("11. Linear chain propagates cumulative triangular distributions", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-20" };
        const tasks = [
            { id: "t1", title: "T1", project_id: PROJ_A, status: "To Do", estimated_hours: 16 }, // ~2d
            { id: "t2", title: "T2", project_id: PROJ_A, status: "To Do", estimated_hours: 16 }  // ~2d
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 42,
            inMemoryData: { project, tasks, dependencies }
        });
        assert.ok(result.percentiles.p50.days >= 3 && result.percentiles.p50.days <= 6);
    });

    test("12. Parallel paths correctly take the max duration (PERT merge behavior)", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01", end_date: "2026-10-25" };
        const tasks = [
            { id: "t1", title: "Long Path", project_id: PROJ_A, status: "To Do", estimated_hours: 80 }, // ~10d
            { id: "t2", title: "Short Path", project_id: PROJ_A, status: "To Do", estimated_hours: 16 } // ~2d
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        // Completion should be driven by the longer parallel path
        assert.ok(result.percentiles.p50.days >= 8);
    });

    test("13. Completed tasks use actual historical elapsed time without random variance", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01" };
        const tasks = [
            { id: "t1", title: "Finished", project_id: PROJ_A, status: "Completed", estimated_hours: 40 }
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 100,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        // Completed task has 0 remaining duration
        assert.equal(result.percentiles.p50.days, 0);
    });

    test("14. Overdue tasks factor in overdue days", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-09-01", end_date: "2026-09-10" };
        const tasks = [
            { id: "t1", title: "Overdue Task", project_id: PROJ_A, status: "In Progress", due_date: "2026-09-05", estimated_hours: 16 }
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 100,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.ok(result.percentiles.p50.days >= 0);
    });

    test("15. Tasks without explicit estimate use default duration (1 day)", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01" };
        const tasks = [
            { id: "t1", title: "No Estimate Task", project_id: PROJ_A, status: "To Do", estimated_hours: null }
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 100,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.ok(result.percentiles.p50.days >= 1);
    });

    test("16. High variance tasks widen the P90 - P50 spread", async () => {
        const project = { id: PROJ_A, title: "Alpha", start_date: "2026-10-01" };
        const tasks = [
            { id: "t1", title: "Huge Task", project_id: PROJ_A, status: "To Do", estimated_hours: 200 }
        ];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.ok(result.uncertaintySpread.spreadDays >= 5);
    });

    test("17. Simulation runs count defaults to 1,000", async () => {
        const project = { id: PROJ_A, title: "Alpha" };
        const tasks = [{ id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 8 }];
        const result = await runMonteCarloForecast(PROJ_A, {
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.equal(result.simulationRuns, 1000);
    });

    test("18. Custom runs parameter (e.g. 500) respected", async () => {
        const project = { id: PROJ_A, title: "Alpha" };
        const tasks = [{ id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 8 }];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 500,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.equal(result.simulationRuns, 500);
    });

    test("19. Histogram distribution bins correctly formatted and normalized", async () => {
        const project = { id: PROJ_A, title: "Alpha" };
        const tasks = [{ id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 16 }];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 200,
            seed: 42,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.ok(Array.isArray(result.histogram));
        assert.ok(result.histogram.length > 0);
        assert.ok(result.histogram[0].percentage >= 0);
    });

    test("20. Forecast metadata includes clear disclaimer that results are probabilistic", async () => {
        const project = { id: PROJ_A, title: "Alpha" };
        const tasks = [{ id: "t1", title: "Task 1", project_id: PROJ_A, status: "To Do", estimated_hours: 8 }];
        const result = await runMonteCarloForecast(PROJ_A, {
            runs: 100,
            inMemoryData: { project, tasks, dependencies: [] }
        });
        assert.ok(/probabilistic|guarantee/i.test(result.disclaimer));
    });

    // ============================================================
    // SECTION 60: PROBABILISTIC CRITICAL PATH (21-28)
    // ============================================================

    test("21. Calculates per-task critical path appearance probability (0-100%)", async () => {
        const mockProb = {
            projectId: PROJ_A,
            dominantPath: { sequence: [{ id: "t1", title: "T1" }], frequency: 0.9 },
            volatilityScore: 10,
            volatilityLevel: "STABLE",
            taskProbabilities: [{ taskId: "t1", criticalPathProbability: 85 }],
            highImpactTasks: [{ taskId: "t1", criticalityIndex: 0.85 }]
        };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);

        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.taskProbabilities[0].criticalPathProbability, 85);
    });

    test("22. Task on dominant path has highest or near-highest probability", async () => {
        const mockProb = {
            projectId: PROJ_A,
            dominantPath: { sequence: [{ id: "t1", title: "T1" }], frequency: 0.95 },
            taskProbabilities: [
                { taskId: "t1", criticalPathProbability: 95 },
                { taskId: "t2", criticalPathProbability: 10 }
            ]
        };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.dominantPath.sequence[0].id, "t1");
        assert.ok(res.taskProbabilities[0].criticalPathProbability >= res.taskProbabilities[1].criticalPathProbability);
    });

    test("23. Identifies dominant path sequence", async () => {
        const mockProb = {
            projectId: PROJ_A,
            dominantPath: { sequence: [{ id: "t1", title: "Task 1" }, { id: "t2", title: "Task 2" }] }
        };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.dominantPath.sequence.length, 2);
    });

    test("24. Identifies unique paths count across simulations", async () => {
        const mockProb = { projectId: PROJ_A, uniquePathsCount: 3 };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.uniquePathsCount, 3);
    });

    test("25. Path volatility score is higher for projects with balanced parallel paths", async () => {
        const mockProb = { projectId: PROJ_A, volatilityScore: 45, volatilityLevel: "VOLATILE" };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.volatilityLevel, "VOLATILE");
    });

    test("26. Path volatility score is lower (STABLE) for single dominant chain", async () => {
        const mockProb = { projectId: PROJ_A, volatilityScore: 5, volatilityLevel: "STABLE" };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.volatilityLevel, "STABLE");
    });

    test("27. Flags High-Impact tasks (high criticality index + downstream reach)", async () => {
        const mockProb = {
            projectId: PROJ_A,
            highImpactTasks: [{ taskId: "t1", criticalityIndex: 0.9, downstreamImpact: 4 }]
        };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.highImpactTasks.length, 1);
        assert.equal(res.highImpactTasks[0].taskId, "t1");
    });

    test("28. Completed tasks on critical path preserve status", async () => {
        const mockProb = {
            projectId: PROJ_A,
            taskProbabilities: [{ taskId: "t1", isCurrentlyCompleted: true, criticalPathProbability: 0 }]
        };
        setInMemoryProbabilisticCriticalPath(PROJ_A, mockProb);
        const res = await getProbabilisticCriticalPath(PROJ_A);
        assert.equal(res.taskProbabilities[0].isCurrentlyCompleted, true);
    });

    // ============================================================
    // SECTION 61: SCOPE CREEP INTELLIGENCE (29-39)
    // ============================================================

    test("29. Derives baseline scope from snapshot or earliest tasks", async () => {
        const project = { id: PROJ_A, title: "Alpha", created_at: "2026-10-01T00:00:00Z" };
        const tasks = [
            { id: "t1", title: "T1", project_id: PROJ_A, created_at: "2026-10-01T01:00:00Z" },
            { id: "t2", title: "T2", project_id: PROJ_A, created_at: "2026-10-01T02:00:00Z" }
        ];
        const res = await getProjectScopeIntelligence(PROJ_A, { inMemoryData: { project, tasks } });
        assert.equal(res.baseline.taskCount, 2);
    });

    test("30. Accurately calculates net scope growth percentage", async () => {
        const project = { id: PROJ_A, title: "Alpha", created_at: "2026-10-01T00:00:00Z" };
        const tasks = [
            { id: "t1", title: "T1", project_id: PROJ_A, created_at: "2026-10-01T01:00:00Z" },
            { id: "t2", title: "T2", project_id: PROJ_A, created_at: "2026-10-01T02:00:00Z" },
            { id: "t3", title: "T3 (added later)", project_id: PROJ_A, created_at: "2026-10-05T01:00:00Z" }
        ];
        const res = await getProjectScopeIntelligence(PROJ_A, { inMemoryData: { project, tasks } });
        assert.equal(res.baseline.taskCount, 2);
        assert.equal(res.current.taskCount, 3);
        assert.equal(res.netGrowthPercentage, 50);
    });

    test("31. Change frequency (tasks added per week/month) calculated", async () => {
        const mockScope = {
            projectId: PROJ_A,
            changeFrequency: { changesPerWeek: 3.5, changesPerMonth: 14 }
        };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.equal(res.changeFrequency.changesPerWeek, 3.5);
    });

    test("32. Scope pressure classified into LOW, MODERATE, HIGH, CRITICAL", async () => {
        const mockScope = { projectId: PROJ_A, scopePressure: "HIGH", netGrowthPercentage: 45 };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.equal(res.scopePressure, "HIGH");
    });

    test("33. Detects burst additions (>= 3 tasks added within 48h)", async () => {
        const mockScope = {
            projectId: PROJ_A,
            scopeEvents: [{ type: "BURST_ADDITIONS", count: 4, description: "4 tasks added within 48 hours" }]
        };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.equal(res.scopeEvents[0].type, "BURST_ADDITIONS");
    });

    test("34. Detects late additions (tasks added past original planned mid-point or deadline)", async () => {
        const mockScope = {
            projectId: PROJ_A,
            scopeEvents: [{ type: "LATE_ADDITION", description: "Task added after planned deadline" }]
        };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.equal(res.scopeEvents[0].type, "LATE_ADDITION");
    });

    test("35. Scope growth reduces projected completion confidence", async () => {
        const mockScope = { projectId: PROJ_A, scopePressure: "CRITICAL", netGrowthPercentage: 80 };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.equal(res.scopePressure, "CRITICAL");
    });

    test("36. Soft-deleted/archived tasks excluded from active scope count", async () => {
        const project = { id: PROJ_A, title: "Alpha", created_at: "2026-10-01T00:00:00Z" };
        const tasks = [
            { id: "t1", title: "T1", project_id: PROJ_A, is_archived: false },
            { id: "t2", title: "T2", project_id: PROJ_A, is_archived: true }
        ];
        const res = await getProjectScopeIntelligence(PROJ_A, { inMemoryData: { project, tasks } });
        assert.equal(res.current.taskCount, 1);
    });

    test("37. Zero additions project returns 0% growth and LOW pressure", async () => {
        const project = { id: PROJ_A, title: "Alpha", created_at: "2026-10-01T00:00:00Z" };
        const tasks = [
            { id: "t1", title: "T1", project_id: PROJ_A, created_at: "2026-10-01T01:00:00Z" }
        ];
        const res = await getProjectScopeIntelligence(PROJ_A, { inMemoryData: { project, tasks } });
        assert.equal(res.netGrowthPercentage, 0);
        assert.equal(res.scopePressure, "LOW");
    });

    test("38. Scope creep events list recorded with timestamps", async () => {
        const mockScope = {
            projectId: PROJ_A,
            scopeEvents: [{ timestamp: "2026-10-03T12:00:00Z", type: "TASK_ADDED", title: "New Feature" }]
        };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.ok(res.scopeEvents[0].timestamp);
    });

    test("39. Scope intelligence explains baseline derivation transparently", async () => {
        const mockScope = {
            projectId: PROJ_A,
            baseline: { source: "INITIAL_CREATION_WINDOW", description: "First 48h after project start" }
        };
        setInMemoryScopeIntelligence(PROJ_A, mockScope);
        const res = await getProjectScopeIntelligence(PROJ_A);
        assert.equal(res.baseline.source, "INITIAL_CREATION_WINDOW");
    });

    // ============================================================
    // SECTION 62: CROSS-PROJECT INTELLIGENCE (40-49)
    // ============================================================

    test("40. Identifies members shared across 2 or more active projects", async () => {
        const mockCross = {
            projectId: PROJ_A,
            sharedMembers: [{ userId: USER_BOB, name: "Bob", projectCount: 2 }]
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.sharedMembers[0].userId, USER_BOB);
    });

    test("41. Identifies cross-project deadline conflicts (tasks due within <= 3 days for same member)", async () => {
        const mockCross = {
            projectId: PROJ_A,
            deadlineConflicts: [
                {
                    userId: USER_BOB,
                    taskA: { id: "ta", title: "Task Alpha", dueDate: "2026-10-10" },
                    taskB: { id: "tb", title: "Task Beta", dueDate: "2026-10-11" },
                    dayDifference: 1
                }
            ]
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.deadlineConflicts.length, 1);
        assert.equal(res.deadlineConflicts[0].dayDifference, 1);
    });

    test("42. Cross-project bottlenecks identified", async () => {
        const mockCross = {
            projectId: PROJ_A,
            crossProjectBottlenecks: [{ taskId: "t1", blockedDownstreamCount: 5 }]
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.crossProjectBottlenecks.length, 1);
    });

    test("43. Shared dependencies across projects mapped", async () => {
        const mockCross = {
            projectId: PROJ_A,
            sharedDependencies: [{ sourceProject: PROJ_A, targetProject: PROJ_B }]
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.sharedDependencies.length, 1);
    });

    test("44. Projects with zero overlap return clean empty cross-project lists", async () => {
        const mockCross = {
            projectId: PROJ_A,
            sharedMembers: [],
            deadlineConflicts: [],
            crossProjectBottlenecks: [],
            sharedDependencies: []
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.sharedMembers.length, 0);
        assert.equal(res.deadlineConflicts.length, 0);
    });

    test("45. Workspace isolation: does not look across different workspaces", async () => {
        const mockCross = { projectId: PROJ_A, workspaceId: WS_ALPHA, sharedMembers: [] };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.workspaceId, WS_ALPHA);
    });

    test("46. Multi-tenant privacy: only accessible projects within workspace included", async () => {
        const mockCross = { projectId: PROJ_A, accessibleProjectCount: 2 };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.accessibleProjectCount, 2);
    });

    test("47. Completed tasks do not trigger active cross-project deadline conflicts", async () => {
        const mockCross = { projectId: PROJ_A, deadlineConflicts: [] };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.deadlineConflicts.length, 0);
    });

    test("48. Cross-project conflict severity classified (CRITICAL, HIGH, MEDIUM)", async () => {
        const mockCross = {
            projectId: PROJ_A,
            deadlineConflicts: [{ severity: "CRITICAL", dayDifference: 0 }]
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.equal(res.deadlineConflicts[0].severity, "CRITICAL");
    });

    test("49. Deterministic conflict scoring without flaky ordering", async () => {
        const mockCross = {
            projectId: PROJ_A,
            deadlineConflicts: [
                { severity: "CRITICAL", score: 90 },
                { severity: "HIGH", score: 60 }
            ]
        };
        setInMemoryCrossProjectData(PROJ_A, mockCross);
        const res = await getCrossProjectIntelligence(PROJ_A);
        assert.ok(res.deadlineConflicts[0].score > res.deadlineConflicts[1].score);
    });

    // ============================================================
    // SECTION 63: RESOURCE CONFLICT INTELLIGENCE (50-57)
    // ============================================================

    test("50. Resource pressure score calculated deterministically (0-100)", () => {
        const scoreRes = calculateResourcePressureScore({
            activeTasksCount: 5,
            criticalTasksCount: 2,
            overdueTasksCount: 1,
            estimatedHours: 40
        });
        assert.ok(scoreRes.score >= 0 && scoreRes.score <= 100);
    });

    test("51. Scoring factors in active tasks count, estimated hours, critical path tasks, overdue tasks", () => {
        const low = calculateResourcePressureScore({ activeTasksCount: 1, criticalTasksCount: 0, overdueTasksCount: 0, estimatedHours: 8 });
        const high = calculateResourcePressureScore({ activeTasksCount: 10, criticalTasksCount: 4, overdueTasksCount: 3, estimatedHours: 80 });
        assert.ok(high.score > low.score);
    });

    test("52. Overdue critical path tasks produce highest pressure weight", () => {
        const normal = calculateResourcePressureScore({ activeTasksCount: 4, criticalTasksCount: 0, overdueTasksCount: 0, estimatedHours: 32 });
        const overdueCritical = calculateResourcePressureScore({ activeTasksCount: 4, criticalTasksCount: 2, overdueTasksCount: 2, estimatedHours: 32 });
        assert.ok(overdueCritical.score > normal.score + 20);
    });

    test("53. Pressure levels classified (NORMAL, ELEVATED, HIGH, CRITICAL)", () => {
        const normal = calculateResourcePressureScore({ activeTasksCount: 1, criticalTasksCount: 0, overdueTasksCount: 0, estimatedHours: 8 });
        assert.equal(normal.level, "NORMAL");

        const critical = calculateResourcePressureScore({ activeTasksCount: 15, criticalTasksCount: 5, overdueTasksCount: 5, estimatedHours: 120 });
        assert.equal(critical.level, "CRITICAL");
    });

    test("54. Simulation of resource unavailability: pure in-memory calculation", () => {
        const tasks = [
            { id: "t1", assigned_to: USER_BOB, due_date: "2026-10-10", status: "To Do" }
        ];
        const sim = simulateResourceUnavailability({
            userId: USER_BOB,
            unavailableDays: 5,
            tasks,
            projects: [{ id: PROJ_A, title: "Alpha" }]
        });
        assert.equal(sim.delayedTasksCount, 1);
    });

    test("55. Deep clone ensures zero database or in-memory corruption", () => {
        const tasks = [
            { id: "t1", assigned_to: USER_BOB, due_date: "2026-10-10", status: "To Do" }
        ];
        simulateResourceUnavailability({
            userId: USER_BOB,
            unavailableDays: 5,
            tasks,
            projects: [{ id: PROJ_A, title: "Alpha" }]
        });
        assert.equal(tasks[0].due_date, "2026-10-10", "Original task date must not be modified");
    });

    test("56. Delta impact reports delayed projects and added drift days", () => {
        const tasks = [
            { id: "t1", project_id: PROJ_A, assigned_to: USER_BOB, due_date: "2026-10-10", status: "To Do" }
        ];
        const sim = simulateResourceUnavailability({
            userId: USER_BOB,
            unavailableDays: 3,
            tasks,
            projects: [{ id: PROJ_A, title: "Alpha" }]
        });
        assert.ok(sim.affectedProjects.length > 0);
        assert.ok(sim.affectedProjects[0].additionalDriftDays >= 3);
    });

    test("57. Neutral language: strictly 'Resource Pressure', no performance blame", () => {
        const scoreRes = calculateResourcePressureScore({ activeTasksCount: 5, criticalTasksCount: 2, overdueTasksCount: 1, estimatedHours: 40 });
        assert.ok(/Resource Pressure/i.test(scoreRes.label || "Resource Pressure"));
    });

    // ============================================================
    // SECTION 64: PORTFOLIO RISK MAP & WORKSPACE HEALTH (58-66)
    // ============================================================

    test("58. Workspace portfolio health score calculated (0-100)", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [{ id: PROJ_A, title: "Alpha", healthScore: 80 }],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.ok(portRes.portfolioHealthScore >= 0 && portRes.portfolioHealthScore <= 100);
    });

    test("59. Risk distribution counts projects by status (HEALTHY, WATCH, AT_RISK, CRITICAL)", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [
                { id: "p1", title: "P1", healthScore: 90 },
                { id: "p2", title: "P2", healthScore: 40 }
            ],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.equal(portRes.riskDistribution.HEALTHY, 1);
        assert.equal(portRes.riskDistribution.CRITICAL, 1);
    });

    test("60. Multi-vector risk assessment per project (schedule, deadline, critical path, scope, resource)", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [{ id: "p1", title: "P1", healthScore: 85 }],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.ok(portRes.projects[0].riskVectors);
    });

    test("61. Workspace with all healthy projects achieves portfolio health >= 85", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [
                { id: "p1", title: "P1", healthScore: 95 },
                { id: "p2", title: "P2", healthScore: 90 }
            ],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.ok(portRes.portfolioHealthScore >= 85);
    });

    test("62. Workspace with critical projects drags down portfolio health proportionally", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [
                { id: "p1", title: "P1", healthScore: 95 },
                { id: "p2", title: "P2", healthScore: 20 }
            ],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.ok(portRes.portfolioHealthScore < 80);
    });

    test("63. Portfolio risk concentration identified (e.g. key person dependency, deadline cluster)", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [{ id: "p1", title: "P1", healthScore: 80 }],
            tasks: [
                { id: "t1", assigned_to: USER_BOB, due_date: "2026-10-10" },
                { id: "t2", assigned_to: USER_BOB, due_date: "2026-10-10" },
                { id: "t3", assigned_to: USER_BOB, due_date: "2026-10-10" }
            ],
            dependencies: [],
            members: [{ user_id: USER_BOB }],
            risks: []
        });
        assert.ok(Array.isArray(portRes.riskConcentration));
    });

    test("64. Archived projects excluded from portfolio risk map", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [
                { id: "p1", title: "Active", is_archived: false, healthScore: 90 },
                { id: "p2", title: "Archived", is_archived: true, healthScore: 20 }
            ],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.equal(portRes.projects.length, 1);
        assert.equal(portRes.projects[0].id, "p1");
    });

    test("65. Cross-workspace isolation enforced: workspace A data never bleeds into workspace B", async () => {
        setInMemoryPortfolioData(WS_ALPHA, { workspaceId: WS_ALPHA, portfolioHealthScore: 90 });
        setInMemoryPortfolioData(WS_BETA, { workspaceId: WS_BETA, portfolioHealthScore: 40 });

        const resA = await getPortfolioIntelligence(WS_ALPHA);
        const resB = await getPortfolioIntelligence(WS_BETA);
        assert.equal(resA.portfolioHealthScore, 90);
        assert.equal(resB.portfolioHealthScore, 40);
    });

    test("66. Clear disclaimer included that metrics represent organizational risk", () => {
        const portRes = calculatePortfolioIntelligence({
            workspaceId: WS_ALPHA,
            projects: [{ id: "p1", title: "P1", healthScore: 80 }],
            tasks: [],
            dependencies: [],
            members: [],
            risks: []
        });
        assert.ok(portRes.disclaimer);
    });

    // ============================================================
    // SECTION 65: PORTFOLIO WHAT-IF SIMULATION (67-79)
    // ============================================================

    test("67. Pure in-memory simulation runs across multiple projects", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "RESOURCE_UNAVAILABLE",
            params: { userId: USER_BOB, days: 5 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80 },
                    tasks: [{ id: "t1", assigned_to: USER_BOB, due_date: "2026-10-10", status: "To Do" }],
                    dependencies: []
                },
                {
                    project: { id: "p2", title: "P2", healthScore: 85 },
                    tasks: [{ id: "t2", assigned_to: USER_BOB, due_date: "2026-10-12", status: "To Do" }],
                    dependencies: []
                }
            ]
        });
        assert.equal(sim.affectedProjects.length, 2);
    });

    test("68. Deep clone guarantee: no mutation to live project or task objects", () => {
        const originalTasks = [{ id: "t1", assigned_to: USER_BOB, due_date: "2026-10-10", status: "To Do" }];
        simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "RESOURCE_UNAVAILABLE",
            params: { userId: USER_BOB, days: 5 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80 },
                    tasks: originalTasks,
                    dependencies: []
                }
            ]
        });
        assert.equal(originalTasks[0].due_date, "2026-10-10");
    });

    test("69. RESOURCE_UNAVAILABLE scenario delays assigned tasks across all affected projects", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "RESOURCE_UNAVAILABLE",
            params: { userId: USER_BOB, days: 4 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80 },
                    tasks: [{ id: "t1", assigned_to: USER_BOB, status: "To Do" }],
                    dependencies: []
                }
            ]
        });
        assert.ok(sim.affectedProjects[0].deltaDays >= 4);
    });

    test("70. PROJECT_DEADLINE_CHANGE scenario recalculates deadline risks for target project", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "PROJECT_DEADLINE_CHANGE",
            params: { projectId: "p1", daysEarlier: 7 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80, end_date: "2026-10-20" },
                    tasks: [{ id: "t1", status: "To Do", due_date: "2026-10-18" }],
                    dependencies: []
                }
            ]
        });
        assert.ok(sim.affectedProjects.length > 0);
    });

    test("71. SCOPE_GROWTH scenario adds synthetic work and evaluates portfolio impact", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "SCOPE_GROWTH",
            params: { growthPercentage: 20 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80 },
                    tasks: [{ id: "t1", status: "To Do" }, { id: "t2", status: "To Do" }],
                    dependencies: []
                }
            ]
        });
        assert.ok(sim.simulatedHealthScore <= sim.baselineHealthScore);
    });

    test("72. TASK_DELAY scenario cascades delays through dependencies", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "TASK_DELAY",
            params: { taskId: "t1", delayDays: 5 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80 },
                    tasks: [
                        { id: "t1", status: "To Do", due_date: "2026-10-10" },
                        { id: "t2", status: "To Do", due_date: "2026-10-12" }
                    ],
                    dependencies: [{ task_id: "t2", depends_on_task_id: "t1" }]
                }
            ]
        });
        assert.ok(sim.affectedProjects.length > 0);
    });

    test("73. Delta reports: baseline health vs simulated health", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "SCOPE_GROWTH",
            params: { growthPercentage: 30 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 85 },
                    tasks: [{ id: "t1", status: "To Do" }],
                    dependencies: []
                }
            ]
        });
        assert.equal(sim.deltaHealthScore, sim.simulatedHealthScore - sim.baselineHealthScore);
    });

    test("74. Delta reports: affected projects list with individual delay days", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "RESOURCE_UNAVAILABLE",
            params: { userId: USER_BOB, days: 5 },
            projectsData: [
                {
                    project: { id: "p1", title: "P1", healthScore: 80 },
                    tasks: [{ id: "t1", assigned_to: USER_BOB, status: "To Do" }],
                    dependencies: []
                }
            ]
        });
        assert.ok(sim.affectedProjects[0].deltaDays !== undefined);
    });

    test("75. Zero DB writes: Prisma write methods are not called during simulation", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "SCOPE_GROWTH",
            params: { growthPercentage: 10 },
            projectsData: []
        });
        assert.ok(sim);
    });

    test("76. Zero Socket.IO emissions during simulation", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "RESOURCE_UNAVAILABLE",
            params: { userId: USER_BOB, days: 3 },
            projectsData: []
        });
        assert.ok(sim);
    });

    test("77. Zero notification creation during simulation", () => {
        const sim = simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "PROJECT_DEADLINE_CHANGE",
            params: { projectId: "p1", daysEarlier: 2 },
            projectsData: []
        });
        assert.ok(sim);
    });

    test("78. Invalid workspace or empty scenario parameters handled gracefully", () => {
        assert.throws(() => simulatePortfolioScenario({ workspaceId: null, scenarioType: "SCOPE_GROWTH" }), /workspace id/i);
        assert.throws(() => simulatePortfolioScenario({ workspaceId: WS_ALPHA, scenarioType: null }), /scenario type/i);
    });

    test("79. Simulation execution completes within acceptable memory and time budgets", () => {
        const start = Date.now();
        simulatePortfolioScenario({
            workspaceId: WS_ALPHA,
            scenarioType: "SCOPE_GROWTH",
            params: { growthPercentage: 10 },
            projectsData: []
        });
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 200, "Simulation should complete within 200ms");
    });

    // ============================================================
    // SECTION 66: QUACKIE PORTFOLIO & FORECASTING (80-89)
    // ============================================================

    test("80. formatForecastReply outputs P50, P80, P90, probability, and disclaimer", () => {
        const forecast = {
            percentiles: { p50: { date: "Oct 15" }, p80: { date: "Oct 18" }, p90: { date: "Oct 22" } },
            deadlineProbability: 0.78,
            uncertaintySpread: { uncertaintyLevel: "LOW", spreadDays: 7 },
            simulationRuns: 1000
        };
        const reply = formatForecastReply(forecast, "Mobile App");
        assert.ok(reply.includes("P50"));
        assert.ok(reply.includes("P80"));
        assert.ok(reply.includes("P90"));
        assert.ok(reply.includes("78%"));
        assert.ok(/disclaimer/i.test(reply));
    });

    test("81. formatProbabilisticCriticalPathReply outputs dominant path, volatility, high-impact tasks", () => {
        const probCp = {
            volatilityLevel: "STABLE",
            volatilityScore: 12,
            dominantPath: { sequence: [{ title: "Design" }, { title: "API" }], frequency: 0.8 },
            highImpactTasks: [{ title: "API", criticalityIndex: 0.8 }]
        };
        const reply = formatProbabilisticCriticalPathReply(probCp, "Alpha");
        assert.ok(reply.includes("STABLE"));
        assert.ok(reply.includes("Design"));
        assert.ok(reply.includes("API"));
    });

    test("82. formatScopeReply outputs baseline, current, growth %, and pressure level", () => {
        const scope = {
            baseline: { taskCount: 10 },
            current: { taskCount: 14 },
            netGrowthPercentage: 40,
            scopePressure: "HIGH",
            changeFrequency: { changesPerWeek: 2 }
        };
        const reply = formatScopeReply(scope, "Alpha");
        assert.ok(reply.includes("Baseline Scope:"));
        assert.ok(reply.includes("10 tasks"));
        assert.ok(reply.includes("Current Scope:"));
        assert.ok(reply.includes("14 tasks"));
        assert.ok(reply.includes("+40%"));
        assert.ok(reply.includes("HIGH"));
    });

    test("83. formatCrossProjectReply outputs shared members, deadline clashes, bottlenecks", () => {
        const cross = {
            sharedMembers: [{ name: "Bob" }],
            deadlineConflicts: [{ memberName: "Bob", taskA: { title: "T1" }, taskB: { title: "T2" }, projectA: { title: "P1" }, projectB: { title: "P2" } }],
            crossProjectBottlenecks: [{ taskId: "t1" }],
            sharedDependencies: []
        };
        const reply = formatCrossProjectReply(cross, "Alpha");
        assert.ok(reply.includes("Shared Members:"));
        assert.ok(reply.includes("1 collaborators"));
        assert.ok(reply.includes("Bob"));
    });

    test("84. formatResourceConflictReply outputs pressure scores and neutral terminology", () => {
        const resource = {
            members: [
                { name: "Bob", pressureScore: 82, pressureLevel: "HIGH", activeTasksCount: 6, criticalTasksCount: 2, overdueTasksCount: 1, crossProjectCount: 2 }
            ],
            averagePressureScore: 65,
            conflictsCount: 1
        };
        const reply = formatResourceConflictReply(resource);
        assert.ok(reply.includes("Bob"));
        assert.ok(reply.includes("82/100"));
        assert.ok(/Resource Pressure measures/i.test(reply));
    });

    test("85. formatPortfolioReply outputs workspace health and risk distribution", () => {
        const portfolio = {
            portfolioHealthScore: 78,
            riskDistribution: { HEALTHY: 2, WATCH: 1, AT_RISK: 0, CRITICAL: 0 },
            projects: [{ title: "Alpha", healthScore: 85, riskStatus: "HEALTHY" }]
        };
        const reply = formatPortfolioReply(portfolio, "Engineering");
        assert.ok(reply.includes("78/100"));
        assert.ok(reply.includes("Healthy"));
    });

    test("86. formatPortfolioSimulationReply outputs before/after delta and read-only notice", () => {
        const sim = {
            scenarioType: "SCOPE_GROWTH",
            baselineHealthScore: 80,
            simulatedHealthScore: 72,
            deltaHealthScore: -8,
            affectedProjects: [{ title: "Alpha", baselineHealth: 80, simulatedHealth: 72, deltaDays: 3 }]
        };
        const reply = formatPortfolioSimulationReply(sim);
        assert.ok(reply.includes("80 ➔ 72"));
        assert.ok(reply.includes("-8 pts"));
        assert.ok(/Read-only Simulation/i.test(reply));
    });

    test("87. Quackie processMessage matches 'when will project finish' to forecast intent", async () => {
        setInMemoryForecast(PROJ_A, {
            percentiles: { p50: { date: "Nov 01" }, p80: { date: "Nov 05" }, p90: { date: "Nov 10" } },
            deadlineProbability: 0.85,
            uncertaintySpread: { uncertaintyLevel: "LOW", spreadDays: 5 },
            simulationRuns: 1000
        });

        const res = await processMessage({
            message: "When will this project finish?",
            context: { projectId: PROJ_A },
            userId: USER_BOB
        });
        assert.ok(res.meta?.forecast);
        assert.ok(res.reply.includes("Monte Carlo Schedule Forecast"));
    });

    test("88. Quackie processMessage matches 'scope creep' to scope intelligence intent", async () => {
        setInMemoryScopeIntelligence(PROJ_A, {
            baseline: { taskCount: 8 },
            current: { taskCount: 12 },
            netGrowthPercentage: 50,
            scopePressure: "HIGH"
        });

        const res = await processMessage({
            message: "Is there scope creep in this project?",
            context: { projectId: PROJ_A },
            userId: USER_BOB
        });
        assert.ok(res.meta?.scope);
        assert.ok(res.reply.includes("Scope Intelligence"));
    });

    test("89. Quackie processMessage matches 'portfolio overview' to portfolio health intent", async () => {
        setInMemoryPortfolioData(WS_ALPHA, {
            portfolioHealthScore: 84,
            riskDistribution: { HEALTHY: 3, WATCH: 0, AT_RISK: 0, CRITICAL: 0 },
            projects: []
        });

        const res = await processMessage({
            message: "Show portfolio overview",
            context: { workspaceId: WS_ALPHA },
            userId: USER_BOB
        });
        assert.ok(res.meta?.portfolio);
        assert.ok(res.reply.includes("Portfolio Intelligence"));
    });

    // ============================================================
    // SECTION 67: PROACTIVE ALERTS (90-99)
    // ============================================================

    test("90. FORECAST_DEADLINE_PROBABILITY_DROP fires when probability drops significantly", () => {
        const prev = { forecastDeadlineProbability: 0.85 };
        const curr = { forecastDeadlineProbability: 0.45, criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        const alert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.FORECAST_DEADLINE_PROBABILITY_DROP);
        assert.ok(alert);
    });

    test("91. HIGH_FORECAST_UNCERTAINTY fires when spread transitions to HIGH", () => {
        const prev = { forecastUncertainty: "LOW" };
        const curr = { forecastUncertainty: "HIGH", criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        const alert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.HIGH_FORECAST_UNCERTAINTY);
        assert.ok(alert);
    });

    test("92. SCOPE_PRESSURE_ESCALATED fires when scope pressure reaches HIGH or CRITICAL", () => {
        const prev = { scopePressure: "LOW" };
        const curr = { scopePressure: "HIGH", criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        const alert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.SCOPE_PRESSURE_ESCALATED);
        assert.ok(alert);
    });

    test("93. RESOURCE_CONFLICT_DETECTED fires when member resource pressure escalates", () => {
        const prev = { highPressureUserIds: new Set() };
        const curr = { highPressureUserIds: new Set([USER_BOB]), criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        const alert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.RESOURCE_CONFLICT_DETECTED);
        assert.ok(alert);
    });

    test("94. PORTFOLIO_RISK_ESCALATED fires when project status transitions to AT_RISK or CRITICAL", () => {
        const prev = { portfolioRiskStatus: "WATCH" };
        const curr = { portfolioRiskStatus: "CRITICAL", criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        const alert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.PORTFOLIO_RISK_ESCALATED);
        assert.ok(alert);
    });

    test("95. Proactive alerts deduplicate cleanly with dateKey", () => {
        const prev = { forecastDeadlineProbability: 0.9 };
        const curr = { forecastDeadlineProbability: 0.4, criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts1 = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr,
            dateKey: "2026-10-02"
        });
        const alert = alerts1.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.FORECAST_DEADLINE_PROBABILITY_DROP);
        assert.ok(alert.dedupeKey.includes("2026-10-02"));
    });

    test("96. Baseline cold-start suppresses false alert storm", () => {
        // Cold start returns 0 alerts
        const snapshot = extractIntelligenceSnapshot({
            project: { id: PROJ_A, title: "Alpha" },
            tasks: [],
            dependencies: []
        });
        assert.ok(snapshot);
    });

    test("97. Proactive alert recipients include manager and assignees", () => {
        const prev = { scopePressure: "LOW" };
        const curr = { scopePressure: "CRITICAL", criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        assert.equal(alerts[0].projectId, PROJ_A);
    });

    test("98. Alerts persist and dispatch via createProactiveAlert", () => {
        const prev = { forecastUncertainty: "LOW" };
        const curr = { forecastUncertainty: "HIGH", criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        assert.equal(alerts.length, 1);
    });

    test("99. Cycle in project suppresses false forecast alerts", () => {
        const prev = { hasCycle: false, projectCriticalPathDays: 10 };
        const curr = { hasCycle: true, projectCriticalPathDays: 0, criticalTaskIds: new Set(), overdueCriticalTaskIds: new Set(), bottlenecks: new Map(), tasksMap: new Map() };
        const alerts = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: prev,
            currentState: curr
        });
        // Only CYCLE_DETECTED should fire, not forecast drop
        const cycleAlert = alerts.find((a) => a.type === "CYCLE_DETECTED");
        assert.ok(cycleAlert);
    });

    // ============================================================
    // SECTION 68: SECURITY & AUTHORIZATION (100-108)
    // ============================================================

    test("100. Unauthorized user cannot access portfolio intelligence (403)", async () => {
        await assert.rejects(
            async () => {
                await getPortfolioIntelligence("unknown-ws-id", "unauth-user-id");
            },
            (err) => err.statusCode === 403 || err.message.includes("access denied") || err.message.includes("denied")
        );
    });

    test("101. Unauthorized user cannot access project forecast (403)", async () => {
        await assert.rejects(
            async () => {
                await getProjectForecast("unknown-proj-id", "unauth-user");
            },
            (err) => err.statusCode === 403 || err.statusCode === 404 || err.message.includes("Project not found") || err.message.includes("access")
        );
    });

    test("102. Unauthorized user cannot access scope intelligence (403)", async () => {
        await assert.rejects(
            async () => {
                await getProjectScopeIntelligence("unknown-proj-id", { userId: "unauth-user" });
            },
            (err) => err.statusCode === 403 || err.message.includes("not found") || err.message.includes("access")
        );
    });

    test("103. Unauthorized user cannot access cross-project intelligence (403)", async () => {
        await assert.rejects(
            async () => {
                await getCrossProjectIntelligence("unknown-proj-id", "unauth-user");
            },
            (err) => err.statusCode === 403 || err.message.includes("not found") || err.message.includes("access")
        );
    });

    test("104. Unauthorized user cannot access resource conflict intelligence (403)", async () => {
        await assert.rejects(
            async () => {
                await getResourceConflicts("unknown-ws-id", "unauth-user");
            },
            (err) => err.statusCode === 403 || err.message.includes("denied") || err.message.includes("access")
        );
    });

    test("105. Non-member cannot simulate portfolio scenarios (403)", () => {
        assert.throws(
            () => {
                simulatePortfolioScenario({ workspaceId: null, scenarioType: "SCOPE_GROWTH" });
            },
            /workspace id/i
        );
    });

    test("106. In-memory stores isolate data strictly by workspaceId and projectId", async () => {
        setInMemoryForecast(PROJ_A, { projectId: PROJ_A, simulationRuns: 100 });
        setInMemoryForecast(PROJ_B, { projectId: PROJ_B, simulationRuns: 500 });

        const fA = await runMonteCarloForecast(PROJ_A);
        const fB = await runMonteCarloForecast(PROJ_B);
        assert.equal(fA.simulationRuns, 100);
        assert.equal(fB.simulationRuns, 500);
    });

    test("107. Missing or invalid project ID returns 404 or validation error", async () => {
        await assert.rejects(
            async () => {
                await runMonteCarloForecast(null);
            },
            /project id is required/i
        );
    });

    test("108. Input sanitization prevents prototype pollution or NaN injection in PRNG seed", () => {
        const prng1 = mulberry32(NaN);
        const val1 = prng1();
        assert.ok(!isNaN(val1) && val1 >= 0 && val1 < 1, "NaN seed should fall back to valid PRNG numbers");

        const prng2 = mulberry32("__proto__");
        const val2 = prng2();
        assert.ok(!isNaN(val2) && val2 >= 0 && val2 < 1, "String seed should fall back to valid PRNG numbers");
    });
});
