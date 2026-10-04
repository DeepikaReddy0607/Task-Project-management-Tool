import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
    CHAOS_CATEGORIES,
    FAILURE_CLASSIFICATION,
    CHAOS_SEVERITY,
    createPrng,
    calculateTaskTargetWeights,
    calculateMemberTargetWeights,
    generateChaosScenarios,
    calculateChaosImpactScore,
    calculateProjectResilienceScore,
    evaluateChaosScenario,
    detectFailureThreshold,
    calculateProjectSensitivity,
    findMostDangerousComponent,
    clusterFailureScenarios,
    calculateResilienceByDimension,
    buildScenarioMatrix,
    analyzeChaosRecovery,
    runProjectChaosLab,
    getProjectChaosLab,
    setInMemoryProjectData,
    clearChaosStore
} from "../services/projectChaosService.js";
import {
    computeProjectStateHash
} from "../services/scenarioSimulationService.js";
import {
    parseNaturalLanguageQuery,
    INTENTS
} from "../services/naturalLanguageControlService.js";
import {
    handleIntelligenceQuery
} from "../services/intelligenceQueryService.js";
import {
    processMessage,
    formatChaosReply,
    QUACKIE_CONTROL_MODES
} from "../services/quackieService.js";

describe("PHASE 10: Project Chaos / Failure Laboratory Test Suite", () => {
    const PROJ_ID = "proj-chaos-test-alpha";
    const USER_ALICE = "usr-alice-1";
    const USER_BOB = "usr-bob-2";
    const USER_CHARLIE = "usr-charlie-3";

    const sampleProject = {
        id: PROJ_ID,
        title: "Distributed Payment Platform",
        start_date: "2026-10-01T00:00:00.000Z",
        end_date: "2026-10-25T00:00:00.000Z",
        status: "In Progress"
    };

    const sampleTasks = [
        { id: "t1", title: "Architecture & Schema Design", status: "In Progress", priority: "Critical", estimated_hours: 24, project_id: PROJ_ID, assigned_to: USER_ALICE, is_archived: false },
        { id: "t2", title: "Core Ledger Service", status: "To Do", priority: "High", estimated_hours: 32, project_id: PROJ_ID, assigned_to: USER_ALICE, is_archived: false },
        { id: "t3", title: "API Gateway Integration", status: "To Do", priority: "High", estimated_hours: 24, project_id: PROJ_ID, assigned_to: USER_BOB, is_archived: false },
        { id: "t4", title: "Fraud Detection Module", status: "To Do", priority: "Medium", estimated_hours: 16, project_id: PROJ_ID, assigned_to: USER_CHARLIE, is_archived: false },
        { id: "t5", title: "End-to-End Stress Testing", status: "To Do", priority: "Critical", estimated_hours: 16, project_id: PROJ_ID, assigned_to: USER_BOB, is_archived: false }
    ];

    const sampleDependencies = [
        { task_id: "t2", depends_on_task_id: "t1" },
        { task_id: "t3", depends_on_task_id: "t2" },
        { task_id: "t4", depends_on_task_id: "t1" },
        { task_id: "t5", depends_on_task_id: "t3" },
        { task_id: "t5", depends_on_task_id: "t4" }
    ];

    const sampleMembers = [
        { id: "m1", user_id: USER_ALICE, project_id: PROJ_ID, users: { id: USER_ALICE, email: "alice@test.com", first_name: "Alice", last_name: "Smith" } },
        { id: "m2", user_id: USER_BOB, project_id: PROJ_ID, users: { id: USER_BOB, email: "bob@test.com", first_name: "Bob", last_name: "Jones" } },
        { id: "m3", user_id: USER_CHARLIE, project_id: PROJ_ID, users: { id: USER_CHARLIE, email: "charlie@test.com", first_name: "Charlie", last_name: "Brown" } }
    ];

    const baseProjectData = {
        project: sampleProject,
        tasks: sampleTasks,
        dependencies: sampleDependencies,
        projectMembers: sampleMembers
    };

    beforeEach(() => {
        clearChaosStore();
        setInMemoryProjectData(PROJ_ID, baseProjectData);
    });

    // ============================================================
    // A. DETERMINISTIC PRNG & SCENARIO GENERATOR
    // ============================================================

    test("1. createPrng returns deterministic sequence for same seed", () => {
        const prng1 = createPrng(12345);
        const prng2 = createPrng(12345);
        const seq1 = [prng1(), prng1(), prng1(), prng1()];
        const seq2 = [prng2(), prng2(), prng2(), prng2()];
        assert.deepStrictEqual(seq1, seq2);
    });

    test("2. createPrng returns different sequences for different seeds", () => {
        const prng1 = createPrng(12345);
        const prng2 = createPrng(99999);
        assert.notStrictEqual(prng1(), prng2());
    });

    test("3. generateChaosScenarios produces exact requested count", () => {
        const scenarios = generateChaosScenarios({
            baseData: baseProjectData,
            scenarioCount: 15,
            seed: 42
        });
        assert.strictEqual(scenarios.length, 15);
    });

    test("4. generateChaosScenarios is 100% reproducible across calls with same seed", () => {
        const scensA = generateChaosScenarios({
            baseData: baseProjectData,
            scenarioCount: 10,
            seed: 777
        });
        const scensB = generateChaosScenarios({
            baseData: baseProjectData,
            scenarioCount: 10,
            seed: 777
        });
        assert.deepStrictEqual(
            scensA.map((s) => s.title),
            scensB.map((s) => s.title)
        );
        assert.deepStrictEqual(
            scensA.map((s) => s.category),
            scensB.map((s) => s.category)
        );
    });

    test("5. generateChaosScenarios produces single and combined multi-shock scenarios", () => {
        const scenarios = generateChaosScenarios({
            baseData: baseProjectData,
            scenarioCount: 20,
            includeCombined: true,
            seed: 42
        });
        const hasCombined = scenarios.some((s) => s.category === CHAOS_CATEGORIES.COMBINED_FAILURE);
        const hasSingle = scenarios.some((s) => s.category !== CHAOS_CATEGORIES.COMBINED_FAILURE);
        assert.strictEqual(hasCombined, true);
        assert.strictEqual(hasSingle, true);
    });

    test("6. generateChaosScenarios respects severityRange filter", () => {
        const scenarios = generateChaosScenarios({
            baseData: baseProjectData,
            scenarioCount: 12,
            severityRange: [CHAOS_SEVERITY.HIGH, CHAOS_SEVERITY.CRITICAL],
            seed: 42
        });
        const allMatch = scenarios.every((s) => s.severity === CHAOS_SEVERITY.HIGH || s.severity === CHAOS_SEVERITY.CRITICAL);
        assert.strictEqual(allMatch, true);
    });

    test("7. calculateTaskTargetWeights weights critical and bottleneck tasks higher", () => {
        const weights = calculateTaskTargetWeights({
            tasks: sampleTasks,
            criticalTaskIds: new Set(["t1", "t2", "t3", "t5"]),
            bottleneckTaskIds: new Set(["t1"])
        });
        // t1 is both critical and bottleneck
        assert.ok(weights.t1 > weights.t4);
    });

    test("8. calculateMemberTargetWeights distributes weights across project members", () => {
        const weights = calculateMemberTargetWeights({
            members: sampleMembers,
            tasks: sampleTasks
        });
        assert.ok(weights[USER_ALICE] > 0);
        assert.ok(weights[USER_BOB] > 0);
        assert.ok(weights[USER_CHARLIE] > 0);
    });

    // ============================================================
    // B. READ-ONLY IMMUTABILITY & DIGITAL TWIN SIMULATION
    // ============================================================

    test("9. evaluateChaosScenario does NOT mutate underlying project data (SHA-256 state hash equality)", async () => {
        const hashBefore = computeProjectStateHash(sampleTasks);
        const scenario = {
            id: "scen-test-immut",
            category: CHAOS_CATEGORIES.TASK_DELAY,
            severity: CHAOS_SEVERITY.HIGH,
            shocks: [{ targetTaskId: "t1", type: "TASK_DELAY", magnitude: 5 }]
        };
        const res = await evaluateChaosScenario({
            projectId: PROJ_ID,
            scenario,
            baseState: baseProjectData
        });
        const hashAfter = computeProjectStateHash(sampleTasks);
        assert.strictEqual(hashBefore, hashAfter);
        assert.strictEqual(res.baseStateHash, hashBefore);
        assert.ok(res.chaosImpactScore >= 0);
    });

    test("10. evaluateChaosScenario calculates downstream propagation via shockwave logic", async () => {
        const scenario = {
            id: "scen-prop",
            category: CHAOS_CATEGORIES.TASK_DELAY,
            severity: CHAOS_SEVERITY.CRITICAL,
            shocks: [{ targetTaskId: "t1", targetTitle: "Architecture & Schema Design", type: "TASK_DELAY", magnitude: 6 }]
        };
        const res = await evaluateChaosScenario({
            projectId: PROJ_ID,
            scenario,
            baseState: baseProjectData
        });
        assert.ok(res.downstreamAffectedCount >= 3);
        assert.ok(Array.isArray(res.propagationPath));
        assert.ok(res.propagationPath.length >= 2);
    });

    test("11. evaluateChaosScenario evaluates TEAM_AVAILABILITY disruption", async () => {
        const scenario = {
            id: "scen-team",
            category: CHAOS_CATEGORIES.TEAM_AVAILABILITY,
            severity: CHAOS_SEVERITY.HIGH,
            shocks: [{ targetMemberId: USER_ALICE, targetTitle: "Alice Smith", type: "TEAM_AVAILABILITY", magnitude: 50 }]
        };
        const res = await evaluateChaosScenario({
            projectId: PROJ_ID,
            scenario,
            baseState: baseProjectData
        });
        assert.ok(res.chaosImpactScore > 0);
        assert.strictEqual(res.primaryFailureMode, "RESOURCE_STARVATION");
    });

    test("12. evaluateChaosScenario evaluates DEADLINE_COMPRESSION disruption", async () => {
        const scenario = {
            id: "scen-deadline",
            category: CHAOS_CATEGORIES.DEADLINE_COMPRESSION,
            severity: CHAOS_SEVERITY.HIGH,
            shocks: [{ targetTitle: "Project Completion Milestone", type: "DEADLINE_COMPRESSION", magnitude: 5 }]
        };
        const res = await evaluateChaosScenario({
            projectId: PROJ_ID,
            scenario,
            baseState: baseProjectData
        });
        assert.ok(res.chaosImpactScore > 0);
        assert.strictEqual(res.primaryFailureMode, "DEADLINE_BREACH");
    });

    // ============================================================
    // C. SCORING & RESILIENCE CALCULATION
    // ============================================================

    test("13. calculateChaosImpactScore returns 0-100 bounded score", () => {
        const scoreLow = calculateChaosImpactScore({
            totalTasksCount: 5,
            affectedTasksCount: 0,
            maxDepth: 0,
            criticalAffectedCount: 0,
            deadlineShiftDays: 0,
            healthDelta: 0,
            newBottlenecksCount: 0
        });
        const scoreHigh = calculateChaosImpactScore({
            totalTasksCount: 5,
            affectedTasksCount: 5,
            maxDepth: 4,
            criticalAffectedCount: 4,
            deadlineShiftDays: 10,
            healthDelta: -45,
            newBottlenecksCount: 2
        });
        assert.strictEqual(scoreLow.score, 0);
        assert.strictEqual(scoreHigh.score, 100);
    });

    test("14. calculateProjectResilienceScore maps high pass rates to RESILIENT", () => {
        const classificationCounts = {
            [FAILURE_CLASSIFICATION.RESILIENT]: 18,
            [FAILURE_CLASSIFICATION.ATTENTION]: 2,
            [FAILURE_CLASSIFICATION.HIGH_RISK]: 0,
            [FAILURE_CLASSIFICATION.CRITICAL_FAILURE]: 0
        };
        const res = calculateProjectResilienceScore({
            classificationCounts,
            totalScenarios: 20
        });
        assert.ok(res.score >= 80);
        assert.strictEqual(res.classification, "RESILIENT");
    });

    test("15. calculateProjectResilienceScore maps frequent critical failures to HIGHLY_FRAGILE", () => {
        const classificationCounts = {
            [FAILURE_CLASSIFICATION.RESILIENT]: 2,
            [FAILURE_CLASSIFICATION.ATTENTION]: 3,
            [FAILURE_CLASSIFICATION.HIGH_RISK]: 5,
            [FAILURE_CLASSIFICATION.CRITICAL_FAILURE]: 10
        };
        const res = calculateProjectResilienceScore({
            classificationCounts,
            totalScenarios: 20
        });
        assert.ok(res.score < 40);
        assert.strictEqual(res.classification, "HIGHLY_FRAGILE");
    });

    // ============================================================
    // D. FAILURE THRESHOLD & INCREMENTAL COLLAPSE
    // ============================================================

    test("16. detectFailureThreshold detects progressive collapse point", async () => {
        const threshold = await detectFailureThreshold({
            projectId: PROJ_ID,
            targetTaskId: "t1",
            stepDays: 1,
            maxSteps: 10,
            baseState: baseProjectData
        });
        assert.strictEqual(threshold.projectId, PROJ_ID);
        assert.strictEqual(threshold.targetTaskId, "t1");
        assert.ok(Array.isArray(threshold.progression));
        assert.strictEqual(threshold.progression.length, 10);
        assert.ok(threshold.toleranceDays >= 0);
    });

    test("17. detectFailureThreshold works without targetTaskId using project critical path", async () => {
        const threshold = await detectFailureThreshold({
            projectId: PROJ_ID,
            stepDays: 2,
            maxSteps: 5,
            baseState: baseProjectData
        });
        assert.ok(threshold.targetTaskTitle.length > 0);
        assert.strictEqual(threshold.progression.length, 5);
    });

    // ============================================================
    // E. SENSITIVITY & MOST DANGEROUS COMPONENT
    // ============================================================

    test("18. calculateProjectSensitivity ranks dimensions and computes highest vulnerability", () => {
        const evaluatedScenarios = [
            { category: CHAOS_CATEGORIES.TASK_DELAY, chaosImpactScore: 80 },
            { category: CHAOS_CATEGORIES.TASK_DELAY, chaosImpactScore: 70 },
            { category: CHAOS_CATEGORIES.TEAM_AVAILABILITY, chaosImpactScore: 30 },
            { category: CHAOS_CATEGORIES.SCOPE_EXPANSION, chaosImpactScore: 20 }
        ];
        const sensitivity = calculateProjectSensitivity({ evaluatedScenarios });
        assert.ok(Array.isArray(sensitivity.dimensions));
        assert.strictEqual(sensitivity.highestVulnerability, "Dependency delay cascade");
    });

    test("19. findMostDangerousComponent identifies element with maximum systemic damage", () => {
        const evaluatedScenarios = [
            {
                chaosImpactScore: 90,
                downstreamAffectedCount: 5,
                shocks: [{ targetTaskId: "t1", targetTitle: "Architecture Design" }]
            },
            {
                chaosImpactScore: 40,
                downstreamAffectedCount: 1,
                shocks: [{ targetTaskId: "t4", targetTitle: "Fraud Detection Module" }]
            }
        ];
        const dangerous = findMostDangerousComponent({
            evaluatedScenarios,
            tasks: sampleTasks
        });
        assert.strictEqual(dangerous.componentId, "t1");
        assert.strictEqual(dangerous.maxChaosScore, 90);
        assert.strictEqual(dangerous.componentType, "TASK");
    });

    test("20. clusterFailureScenarios groups by failure mode", () => {
        const evaluatedScenarios = [
            { id: "s1", primaryFailureMode: "CRITICAL_PATH_CASCADE", chaosImpactScore: 85 },
            { id: "s2", primaryFailureMode: "CRITICAL_PATH_CASCADE", chaosImpactScore: 75 },
            { id: "s3", primaryFailureMode: "RESOURCE_STARVATION", chaosImpactScore: 60 }
        ];
        const clusters = clusterFailureScenarios({ evaluatedScenarios });
        assert.strictEqual(clusters.length, 2);
        const cpmCluster = clusters.find((c) => c.failureMode === "CRITICAL_PATH_CASCADE");
        assert.strictEqual(cpmCluster.count, 2);
        assert.strictEqual(cpmCluster.averageScore, 80);
    });

    test("21. buildScenarioMatrix maps 10 categories across 4 severities", () => {
        const evaluatedScenarios = [
            { category: CHAOS_CATEGORIES.TASK_DELAY, severity: CHAOS_SEVERITY.HIGH, chaosImpactScore: 75 },
            { category: CHAOS_CATEGORIES.TASK_DELAY, severity: CHAOS_SEVERITY.CRITICAL, chaosImpactScore: 90 }
        ];
        const matrix = buildScenarioMatrix({ evaluatedScenarios });
        assert.ok(matrix[CHAOS_CATEGORIES.TASK_DELAY]);
        assert.strictEqual(matrix[CHAOS_CATEGORIES.TASK_DELAY][CHAOS_SEVERITY.HIGH].count, 1);
        assert.strictEqual(matrix[CHAOS_CATEGORIES.TASK_DELAY][CHAOS_SEVERITY.CRITICAL].count, 1);
        assert.strictEqual(matrix[CHAOS_CATEGORIES.TASK_DELAY][CHAOS_SEVERITY.LOW].count, 0);
    });

    // ============================================================
    // F. FULL LABORATORY ORCHESTRATION & PHASE 9 RECOVERY
    // ============================================================

    test("22. runProjectChaosLab executes full end-to-end laboratory run", async () => {
        const result = await runProjectChaosLab({
            projectId: PROJ_ID,
            scenarioCount: 15,
            seed: 42,
            includeCombined: true,
            includeMonteCarlo: true
        });

        assert.strictEqual(result.projectId, PROJ_ID);
        assert.strictEqual(result.scenariosEvaluated, 15);
        assert.ok(result.resilienceScore.score >= 0 && result.resilienceScore.score <= 100);
        assert.ok(result.summary.totalScenarios === 15);
        assert.ok(result.mostDangerousComponent);
        assert.ok(result.failureThreshold);
        assert.ok(result.sensitivityAnalysis);
        assert.ok(result.monteCarloComparison);
        assert.ok(result.recommendedRecovery);
        assert.ok(Array.isArray(result.evidence));
    });

    test("23. getProjectChaosLab retrieves cached laboratory results", async () => {
        await runProjectChaosLab({
            projectId: PROJ_ID,
            scenarioCount: 10,
            seed: 99
        });
        const retrieved = await getProjectChaosLab(PROJ_ID);
        assert.ok(retrieved);
        assert.strictEqual(retrieved.projectId, PROJ_ID);
        assert.strictEqual(retrieved.scenariosEvaluated, 10);
    });

    test("24. analyzeChaosRecovery evaluates candidate recovery interventions", async () => {
        const labRes = await runProjectChaosLab({
            projectId: PROJ_ID,
            scenarioCount: 10,
            seed: 42
        });
        const topScen = labRes.scenarios[0];
        const recovery = await analyzeChaosRecovery({
            projectId: PROJ_ID,
            chaosResult: labRes,
            topScenario: topScen
        });
        assert.ok(recovery.recommendedIntervention);
        assert.ok(recovery.recommendedIntervention.strategy);
        assert.ok(recovery.recommendedIntervention.healthGain >= 0);
    });

    // ============================================================
    // G. NATURAL LANGUAGE CONTROL INTEGRATION
    // ============================================================

    test("25. parseNaturalLanguageQuery parses 'try to break this project' into CHAOS_LAB_RUN", () => {
        const parsed = parseNaturalLanguageQuery("Try to break this project with 25 tests");
        assert.strictEqual(parsed.intent, INTENTS.CHAOS_LAB_RUN);
        assert.strictEqual(parsed.entities.count, 25);
    });

    test("26. parseNaturalLanguageQuery parses 'detect failure threshold' into FAILURE_THRESHOLD", () => {
        const parsed = parseNaturalLanguageQuery("Detect failure threshold for Architecture & Schema Design");
        assert.strictEqual(parsed.intent, INTENTS.FAILURE_THRESHOLD);
    });

    test("27. parseNaturalLanguageQuery parses 'find the weakest area' into PROJECT_SENSITIVITY", () => {
        const parsed = parseNaturalLanguageQuery("Find the weakest area and project sensitivity");
        assert.strictEqual(parsed.intent, INTENTS.PROJECT_SENSITIVITY);
    });

    test("28. parseNaturalLanguageQuery parses 'most dangerous task' into MOST_DANGEROUS_COMPONENT", () => {
        const parsed = parseNaturalLanguageQuery("What is the most dangerous task that could cause failure?");
        assert.strictEqual(parsed.intent, INTENTS.MOST_DANGEROUS_COMPONENT);
    });

    test("29. handleIntelligenceQuery executes CHAOS_LAB_RUN successfully", async () => {
        const res = await handleIntelligenceQuery({
            query: "Try to break this project",
            projectId: PROJ_ID,
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, INTENTS.CHAOS_LAB_RUN);
        assert.ok(res.explanation);
        assert.ok(res.explanation.summary.includes("Project Chaos Lab"));
    });

    test("30. handleIntelligenceQuery executes FAILURE_THRESHOLD successfully", async () => {
        const res = await handleIntelligenceQuery({
            query: "What is the failure threshold for this project?",
            projectId: PROJ_ID,
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, INTENTS.FAILURE_THRESHOLD);
        assert.ok(res.explanation);
        assert.ok(res.explanation.summary.includes("Failure threshold analysis"));
    });

    // ============================================================
    // H. QUACKIE INTENT ROUTING & FORMATTING
    // ============================================================

    test("31. formatChaosReply formats comprehensive text report with links", () => {
        const chaosResult = {
            scenariosEvaluated: 25,
            resilienceScore: { score: 72, classification: "MODERATE_RESILIENCE" },
            summary: {
                failureClassificationCounts: { CRITICAL_FAILURE: 2, HIGH_RISK: 4, ATTENTION: 7, RESILIENT: 12 },
                resiliencePercentage: 48
            },
            mostDangerousComponent: {
                componentTitle: "Core Ledger Service",
                componentType: "TASK",
                maxChaosScore: 86,
                averageDownstreamImpact: 5
            },
            sensitivityAnalysis: { highestVulnerability: "Dependency delay cascade" },
            failureThreshold: { collapsePointDays: 4, toleranceDays: 2 },
            recommendedRecovery: { strategy: "Add developer to critical path", healthGain: 12, delayReductionDays: 3 }
        };

        const reply = formatChaosReply(chaosResult);
        assert.ok(reply.includes("PROJECT CHAOS / FAILURE LABORATORY REPORT"));
        assert.ok(reply.includes("72/100"));
        assert.ok(reply.includes("Core Ledger Service"));
        assert.ok(reply.includes("Collapse Point: +4 day(s)"));
        assert.ok(reply.includes("[View Chaos Lab]"));
    });

    test("32. processMessage routes 'try to break this project' to QUACKIE_CONTROL_MODES.CHAOS", async () => {
        const quackieRes = await processMessage({
            message: "Try to break this project",
            userId: USER_ALICE,
            context: { projectId: PROJ_ID }
        });

        assert.strictEqual(quackieRes.mode, QUACKIE_CONTROL_MODES.CHAOS);
        assert.strictEqual(quackieRes.intent, "CHAOS_LAB_RUN");
        assert.ok(quackieRes.reply.includes("PROJECT CHAOS"));
        assert.ok(quackieRes.data);
    });

    test("33. processMessage routes 'detect failure threshold' to QUACKIE_CONTROL_MODES.CHAOS", async () => {
        const quackieRes = await processMessage({
            message: "Detect failure threshold for this project",
            userId: USER_ALICE,
            context: { projectId: PROJ_ID }
        });

        assert.strictEqual(quackieRes.mode, QUACKIE_CONTROL_MODES.CHAOS);
        assert.ok(quackieRes.reply.includes("Failure Threshold"));
    });
});
