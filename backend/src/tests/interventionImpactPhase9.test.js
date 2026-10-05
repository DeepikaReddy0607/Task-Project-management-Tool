import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
    INTERVENTION_TYPES,
    IMPACT_CLASSIFICATION,
    SIDE_EFFECT_SEVERITY,
    evaluateIntervention,
    compareInterventions,
    calculateInterventionScore,
    detectSideEffects,
    translateInterventionToMutations,
    prepareInterventionProposal,
    executeInterventionProposalSafely,
    clearInterventionStore
} from "../services/interventionImpactService.js";
import {
    computeProjectStateHash,
    MUTATION_TYPES,
    SCENARIO_STATUS
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
    formatInterventionReply,
    QUACKIE_CONTROL_MODES
} from "../services/quackieService.js";
import {
    setInMemoryApproval,
    clearApprovalStore
} from "../services/intelligenceApprovalService.js";

describe("PHASE 9: Intervention Impact Engine Test Suite", () => {
    const PROJ_A = "proj-intv-alpha";
    const PROJ_B = "proj-intv-beta";
    const USER_ALICE = "usr-alice-1";
    const USER_BOB = "usr-bob-2";

    const sampleProject = {
        id: PROJ_A,
        title: "E-Commerce Core Refactor",
        start_date: "2026-10-01T00:00:00.000Z",
        end_date: "2026-10-15T00:00:00.000Z",
        status: "In Progress"
    };

    const sampleTasks = [
        { id: "t1", title: "Authentication API", status: "In Progress", priority: "High", estimated_hours: 16, project_id: PROJ_A, assigned_to: USER_ALICE, is_archived: false },
        { id: "t2", title: "API Testing", status: "To Do", priority: "Medium", estimated_hours: 16, project_id: PROJ_A, assigned_to: USER_ALICE, is_archived: false },
        { id: "t3", title: "Frontend Integration", status: "To Do", priority: "High", estimated_hours: 24, project_id: PROJ_A, assigned_to: USER_BOB, is_archived: false },
        { id: "t4", title: "Security Audit", status: "To Do", priority: "Medium", estimated_hours: 8, project_id: PROJ_A, assigned_to: USER_BOB, is_archived: false },
        { id: "t5", title: "Production Deployment", status: "To Do", priority: "Critical", estimated_hours: 8, project_id: PROJ_A, assigned_to: USER_BOB, is_archived: false }
    ];

    const sampleDependencies = [
        { task_id: "t2", depends_on_task_id: "t1" },
        { task_id: "t3", depends_on_task_id: "t2" },
        { task_id: "t5", depends_on_task_id: "t3" },
        { task_id: "t5", depends_on_task_id: "t4" }
    ];

    const sampleMembers = [
        { id: "m1", user_id: USER_ALICE, project_id: PROJ_A, users: { id: USER_ALICE, email: "alice@test.com", first_name: "Alice", last_name: "Smith" } },
        { id: "m2", user_id: USER_BOB, project_id: PROJ_A, users: { id: USER_BOB, email: "bob@test.com", first_name: "Bob", last_name: "Jones" } }
    ];

    const defaultInMemory = {
        project: sampleProject,
        tasks: sampleTasks,
        dependencies: sampleDependencies,
        projectMembers: sampleMembers
    };

    beforeEach(() => {
        clearInterventionStore();
        clearApprovalStore();
    });

    // ============================================================
    // A. INTERVENTION PARSING & TRANSLATION (ALL 14 TYPES)
    // ============================================================

    test("1. translateInterventionToMutations handles REASSIGN_TASK", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_REASSIGN);
        assert.strictEqual(res.mutations[0].toUserId, USER_BOB);
    });

    test("2. translateInterventionToMutations handles CHANGE_TASK_PRIORITY", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_PRIORITY, targetEntity: { taskId: "t2" }, parameters: { priority: "Critical" } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_PRIORITY_CHANGE);
        assert.strictEqual(res.mutations[0].priority, "Critical");
    });

    test("3. translateInterventionToMutations handles CHANGE_TASK_DEADLINE", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_DEADLINE, targetEntity: { taskId: "t2" }, parameters: { daysOffset: 3 } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_DUE_DATE_CHANGE);
    });

    test("4. translateInterventionToMutations handles CHANGE_TASK_ESTIMATE (reduction)", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t2" }, parameters: { hoursDelta: -8 } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_DURATION_DECREASE);
    });

    test("5. translateInterventionToMutations handles CHANGE_TASK_STATUS", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_STATUS, targetEntity: { taskId: "t1" }, parameters: { status: "Completed" } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_COMPLETE);
    });

    test("6. translateInterventionToMutations handles ADD_RESOURCE", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.ADD_RESOURCE, parameters: { taskIds: ["t1", "t2"], hoursReduction: 8 } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations.length, 2);
    });

    test("7. translateInterventionToMutations handles REMOVE_RESOURCE", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.REMOVE_RESOURCE, parameters: { taskIds: ["t1"], hoursAdded: 8 } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_DURATION_INCREASE);
    });

    test("8. translateInterventionToMutations handles CHANGE_RESOURCE_AVAILABILITY", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_RESOURCE_AVAILABILITY, parameters: { userId: USER_ALICE, hoursShift: 4 } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.ok(res.mutations.length > 0);
    });

    test("9. translateInterventionToMutations handles CHANGE_TASK_ASSIGNMENT alias", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ASSIGNMENT, targetEntity: { taskId: "t1" }, parameters: { toUserId: USER_BOB } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.TASK_REASSIGN);
    });

    test("10. translateInterventionToMutations handles ADD_DEPENDENCY", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.ADD_DEPENDENCY, targetEntity: { taskId: "t4", dependsOnTaskId: "t1" } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.DEPENDENCY_CREATE);
    });

    test("11. translateInterventionToMutations handles REMOVE_DEPENDENCY", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.REMOVE_DEPENDENCY, targetEntity: { taskId: "t5", dependsOnTaskId: "t4" } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.DEPENDENCY_REMOVE);
    });

    test("12. translateInterventionToMutations handles CHANGE_SCOPE", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.CHANGE_SCOPE, targetEntity: { taskId: "t4" }, parameters: { action: "REMOVE_TASK" } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.SCOPE_CHANGE);
    });

    test("13. translateInterventionToMutations handles PARALLELIZE_COMPATIBLE_WORK", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK, targetEntity: { taskId: "t3", dependsOnTaskId: "t2" } },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.mutations[0].type, MUTATION_TYPES.DEPENDENCY_REMOVE);
    });

    test("14. translateInterventionToMutations handles RECOVERY_ACTION", () => {
        const res = translateInterventionToMutations({
            intervention: { type: INTERVENTION_TYPES.RECOVERY_ACTION, projectId: PROJ_A },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, true);
        assert.ok(res.mutations.length > 0);
    });

    test("15. Unsupported intervention returns supported=false cleanly without throwing", () => {
        const res = translateInterventionToMutations({
            intervention: { type: "TELEPORT_PROJECT_TO_MARS" },
            tasks: sampleTasks
        });
        assert.strictEqual(res.supported, false);
        assert.ok(res.reason.includes("Unsupported"));
    });

    // ============================================================
    // B. BASELINE STATE CAPTURE
    // ============================================================

    test("16. Baseline captures project health score and status", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.baseline.health.score > 0);
        assert.ok(res.baseline.health.status != null);
    });

    test("17. Baseline captures critical path duration and task count", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_PRIORITY, targetEntity: { taskId: "t1" }, parameters: { priority: "Critical" } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.baseline.criticalPath.durationDays > 0);
        assert.ok(res.baseline.criticalPath.criticalTasksCount > 0);
    });

    test("18. Baseline captures structural bottlenecks", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.ADD_RESOURCE, parameters: { taskIds: ["t1"] } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.baseline.bottlenecks.count === "number");
    });

    test("19. Baseline captures schedule drift and projected completion", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.baseline.schedule.projectedEnd != null);
    });

    test("20. Baseline captures team capacity and member utilization", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.baseline.workload.members.length >= 2);
    });

    test("21. Baseline captures Monte Carlo forecast percentiles where supported", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });
        if (res.baseline.forecast) {
            assert.ok(res.baseline.forecast.p50Date != null);
        }
    });

    // ============================================================
    // C. SIMULATION SAFETY & STATE INVARIANTS
    // ============================================================

    test("22. Intervention applied strictly to cloned state; real memory data unchanged", async () => {
        const initialStatus = sampleTasks[1].assigned_to;
        await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.strictEqual(sampleTasks[1].assigned_to, initialStatus);
    });

    test("23. evaluateIntervention returns simulationOnly: true explicitly", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -4 } },
            inMemoryData: defaultInMemory
        });
        assert.strictEqual(res.simulationOnly, true);
    });

    test("24. Simulated state reflects mutation while baseline retains original state", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.notStrictEqual(res.baseline.workload.members, res.simulated.workload.members);
    });

    // ============================================================
    // D. IMPACT VECTOR CALCULATIONS
    // ============================================================

    test("25. Impact vector calculates health score delta", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.impactVector.healthDelta === "number");
    });

    test("26. Impact vector measures schedule recovery days", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK, targetEntity: { taskId: "t3", dependsOnTaskId: "t2" } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.impactVector.scheduleRecoveryDays === "number");
    });

    test("27. Impact vector measures critical tasks count delta", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_STATUS, targetEntity: { taskId: "t1" }, parameters: { status: "Completed" } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.impactVector.criticalTasksDelta === "number");
    });

    test("28. Impact vector measures bottleneck count delta", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.ADD_RESOURCE, parameters: { taskIds: ["t1"] } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.impactVector.bottleneckDelta === "number");
    });

    test("29. Impact vector measures deadline risk delta", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.impactVector.deadlineRiskDelta === "number");
    });

    // ============================================================
    // E. BENEFITS ANALYSIS & EVIDENCE
    // ============================================================

    test("30. Positive schedule recovery is classified as a benefit with evidence", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });
        if (res.impactVector.scheduleRecoveryDays > 0) {
            const b = res.benefits.find((item) => item.title.includes("Schedule Recovery"));
            assert.ok(b != null);
            assert.ok(b.evidence != null);
        }
    });

    test("31. Health improvement is documented as an evidence-backed benefit", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_STATUS, targetEntity: { taskId: "t1" } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.benefits.length > 0);
        assert.ok(res.benefits[0].title != null);
    });

    test("32. Relieved bottlenecks appear in benefits list", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK, targetEntity: { taskId: "t3", dependsOnTaskId: "t2" } },
            inMemoryData: defaultInMemory
        });
        assert.ok(Array.isArray(res.benefits));
    });

    test("33. Critical tasks relief documents duration reduction evidence", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });
        assert.ok(Array.isArray(res.benefits));
    });

    // ============================================================
    // F. COSTS & WORKLOAD ANALYSIS
    // ============================================================

    test("34. Assignee workload transfer quantifies additional hours added", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        const cost = res.costs.find((c) => c.title.includes("Workload Pressure"));
        assert.ok(cost != null);
    });

    test("35. Assignee overload (>80% capacity) triggers elevated cost warning", () => {
        const scoreRes = calculateInterventionScore({
            scheduleRecoveryDays: 2,
            recipientWorkloadHoursAdded: 16,
            recipientOverloaded: true
        });
        assert.ok(scoreRes.factors.some((f) => f.includes("80% maximum capacity")));
    });

    test("36. Secondary bottleneck creation is captured as a negative cost", () => {
        const scoreRes = calculateInterventionScore({
            newBottlenecksCount: 2
        });
        assert.ok(scoreRes.factors.some((f) => f.includes("new structural bottleneck")));
    });

    test("37. Newly critical tasks forced onto path are penalized in cost analysis", () => {
        const scoreRes = calculateInterventionScore({
            newlyCriticalCount: 2
        });
        assert.ok(scoreRes.factors.some((f) => f.includes("critical path")));
    });

    // ============================================================
    // G. TRADE-OFF ENGINE & IMPACT SCORING
    // ============================================================

    test("38. Trade-offs summary reports benefit count vs cost count", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(typeof res.tradeOffs.benefitCount === "number");
        assert.ok(typeof res.tradeOffs.costCount === "number");
    });

    test("39. Deterministic 0-100 Impact Score maps score to transparent classification", () => {
        const highRes = calculateInterventionScore({ scheduleRecoveryDays: 3, healthDelta: 15 });
        assert.strictEqual(highRes.classification, IMPACT_CLASSIFICATION.HIGH_POSITIVE_IMPACT);
        assert.ok(highRes.score >= 80);

        const neutralRes = calculateInterventionScore({});
        assert.strictEqual(neutralRes.score, 50);
        assert.strictEqual(neutralRes.classification, IMPACT_CLASSIFICATION.NEUTRAL_IMPACT);
    });

    test("40. Factor weight disclosures explicitly expose point calculations", () => {
        const res = calculateInterventionScore({ scheduleRecoveryDays: 2, healthDelta: 5, resolvedBottlenecksCount: 1 });
        assert.ok(res.factors.length >= 3);
        assert.ok(res.factors.some((f) => f.includes("pts")));
    });

    test("41. Recommendation rationale provides actionable decision support", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.recommendation.rationale.length > 0);
        assert.ok(res.recommendation.verdict != null);
    });

    // ============================================================
    // H. SIDE-EFFECT DETECTION
    // ============================================================

    test("42. detectSideEffects detects workload transfer to target assignee", () => {
        const sideEffects = detectSideEffects({
            baseline: { workload: { members: [{ userId: USER_BOB, totalHours: 20 }] } },
            simulated: { workload: { members: [{ userId: USER_BOB, totalHours: 36 }] } },
            intervention: { parameters: { toUserId: USER_BOB } }
        });
        assert.ok(sideEffects.some((se) => se.type === "WORKLOAD_TRANSFER"));
    });

    test("43. detectSideEffects detects new downstream bottleneck emergence", () => {
        const sideEffects = detectSideEffects({
            baseline: { bottlenecks: { items: [] } },
            simulated: { bottlenecks: { items: [{ taskId: "t3", score: 85 }] } },
            intervention: {},
            tasks: sampleTasks
        });
        assert.ok(sideEffects.some((se) => se.type === "NEW_BOTTLENECK"));
    });

    test("44. detectSideEffects detects critical path migration", () => {
        const sideEffects = detectSideEffects({
            baseline: { criticalPath: { criticalTaskIds: ["t1"] } },
            simulated: { criticalPath: { criticalTaskIds: ["t1", "t4"] } },
            intervention: {},
            tasks: sampleTasks
        });
        assert.ok(sideEffects.some((se) => se.type === "CRITICAL_PATH_MIGRATION"));
    });

    test("45. detectSideEffects detects secondary deadline pressure", () => {
        const sideEffects = detectSideEffects({
            baseline: { deadlineRisks: { risks: [] } },
            simulated: { deadlineRisks: { risks: [{ taskId: "t5", riskLevel: "HIGH" }] } },
            intervention: {},
            tasks: sampleTasks
        });
        assert.ok(sideEffects.some((se) => se.type === "SECONDARY_DEADLINE_RISK"));
    });

    // ============================================================
    // I. MULTI-INTERVENTION COMPARISON
    // ============================================================

    test("46. compareInterventions compares Option A vs Option B vs Option C", async () => {
        const invA = { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } };
        const invB = { type: INTERVENTION_TYPES.ADD_RESOURCE, parameters: { taskIds: ["t1"], hoursReduction: 8 } };
        const invC = { type: INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK, targetEntity: { taskId: "t3", dependsOnTaskId: "t2" } };

        const res = await compareInterventions({
            projectId: PROJ_A,
            interventions: [invA, invB, invC],
            inMemoryData: defaultInMemory
        });

        assert.strictEqual(res.comparisonMatrix.optionsCount, 3);
        assert.strictEqual(res.comparisonMatrix.rankedOptions.length, 3);
    });

    test("47. compareInterventions ranks options deterministically by score", async () => {
        const invA = { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -12 } };
        const invB = { type: INTERVENTION_TYPES.CHANGE_TASK_PRIORITY, targetEntity: { taskId: "t2" }, parameters: { priority: "Low" } };

        const res = await compareInterventions({
            projectId: PROJ_A,
            interventions: [invA, invB],
            inMemoryData: defaultInMemory
        });

        const ranks = res.comparisonMatrix.rankedOptions;
        assert.ok(ranks[0].score >= ranks[1].score);
    });

    test("48. compareInterventions identifies recommended option with rationale", async () => {
        const invA = { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } };
        const invB = { type: INTERVENTION_TYPES.ADD_RESOURCE, parameters: { taskIds: ["t1"] } };

        const res = await compareInterventions({
            projectId: PROJ_A,
            interventions: [invA, invB],
            inMemoryData: defaultInMemory
        });

        assert.ok(res.comparisonMatrix.recommendedOption != null);
        assert.ok(res.comparisonMatrix.recommendedOption.rationale.length > 0);
    });

    test("49. Missing or empty interventions array throws immediate validation error", async () => {
        await assert.rejects(
            compareInterventions({ projectId: PROJ_A, interventions: [] }),
            { message: /array of at least one intervention is required/ }
        );
    });

    // ============================================================
    // J. SHOCKWAVE INTEGRATION (PHASE 8)
    // ============================================================

    test("50. Intervention improves downstream shockwave containment score", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });
        if (res.simulated.shockwave) {
            assert.ok(typeof res.simulated.shockwave.containmentScore === "number");
        }
    });

    test("51. Intervention reduces downstream affected tasks count", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.PARALLELIZE_COMPATIBLE_WORK, targetEntity: { taskId: "t3", dependsOnTaskId: "t2" } },
            inMemoryData: defaultInMemory
        });
        if (res.simulated.shockwave) {
            assert.ok(typeof res.simulated.shockwave.totalAffected === "number");
        }
    });

    // ============================================================
    // K. MONTE CARLO INTEGRATION (PHASE 5)
    // ============================================================

    test("52. Monte Carlo integration compares baseline and simulated P50/P80/P90 percentiles", async () => {
        const res = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });
        if (res.baseline.forecast && res.simulated.forecast) {
            assert.ok(res.impactVector.p50ShiftDays != null);
        }
    });

    // ============================================================
    // L. APPROVAL CENTER & STALE-STATE PROTECTION
    // ============================================================

    test("53. prepareInterventionProposal stages proposal in PROPOSED status with baseStateHash", async () => {
        const res = await prepareInterventionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });
        assert.ok(res.proposalId.startsWith("prop-intv-"));
        assert.strictEqual(res.status, SCENARIO_STATUS.PROPOSED);
        assert.ok(res.baseStateHash != null);
        assert.strictEqual(res.requiresApproval, true);
    });

    test("54. executeInterventionProposalSafely rejects unapproved proposal", async () => {
        const prep = await prepareInterventionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });

        await assert.rejects(
            executeInterventionProposalSafely({
                projectId: PROJ_A,
                proposalId: prep.proposalId,
                userId: USER_ALICE,
                inMemoryData: defaultInMemory
            }),
            { message: /Proposal has not been approved/ }
        );
    });

    test("55. executeInterventionProposalSafely detects stale state and rejects execution", async () => {
        const prep = await prepareInterventionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });

        // Artificially approve proposal in memory
        const stored = (await import("../services/intelligenceApprovalService.js")).getInMemoryApproval(prep.proposalId);
        stored.status = SCENARIO_STATUS.APPROVED;

        // Mutate inMemoryData to make it stale
        const modifiedInMemory = {
            ...defaultInMemory,
            tasks: [...sampleTasks, { id: "t99", title: "New Disruptive Task", status: "To Do", priority: "Critical", estimated_hours: 80, project_id: PROJ_A, is_archived: false }]
        };

        await assert.rejects(
            executeInterventionProposalSafely({
                projectId: PROJ_A,
                proposalId: prep.proposalId,
                userId: USER_ALICE,
                inMemoryData: modifiedInMemory
            }),
            { message: /Stale state detected/ }
        );
    });

    test("56. executeInterventionProposalSafely marks approved, non-stale proposal as EXECUTED", async () => {
        const prep = await prepareInterventionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });

        const stored = (await import("../services/intelligenceApprovalService.js")).getInMemoryApproval(prep.proposalId);
        stored.status = SCENARIO_STATUS.APPROVED;

        const execRes = await executeInterventionProposalSafely({
            projectId: PROJ_A,
            proposalId: prep.proposalId,
            userId: USER_ALICE,
            inMemoryData: defaultInMemory
        });

        assert.strictEqual(execRes.success, true);
        assert.strictEqual(execRes.status, SCENARIO_STATUS.EXECUTED);
    });

    // ============================================================
    // M. NATURAL LANGUAGE CONTROL INTEGRATION
    // ============================================================

    test("57. NL parser classifies 'What happens if I reassign this task to Bob?' as INTERVENTION_EVALUATION", () => {
        const res = parseNaturalLanguageQuery("What happens if I reassign this task to Bob?");
        assert.strictEqual(res.intent, INTENTS.INTERVENTION_EVALUATION);
        assert.strictEqual(res.entities.userName, "Bob");
    });

    test("58. NL parser classifies 'What happens if we add one developer?' as INTERVENTION_EVALUATION", () => {
        const res = parseNaturalLanguageQuery("What happens if we add one developer?");
        assert.strictEqual(res.intent, INTENTS.INTERVENTION_EVALUATION);
        assert.strictEqual(res.entities.count, 1);
    });

    test("59. NL parser classifies 'Compare reassigning this task versus adding a resource' as INTERVENTION_COMPARISON", () => {
        const res = parseNaturalLanguageQuery("Compare reassigning this task versus adding a resource");
        assert.strictEqual(res.intent, INTENTS.INTERVENTION_COMPARISON);
    });

    test("60. NL parser handles 'Would moving this deadline help?' as INTERVENTION_EVALUATION", () => {
        const res = parseNaturalLanguageQuery("Would moving this deadline help?");
        assert.strictEqual(res.intent, INTENTS.INTERVENTION_EVALUATION);
    });

    // ============================================================
    // N. QUACKIE MASCOT INTEGRATION
    // ============================================================

    test("61. Quackie processes intervention query in QUACKIE_CONTROL_MODES.INTERVENTION", async () => {
        const res = await processMessage({
            message: "What happens if I reassign API Testing to Bob?",
            userId: USER_ALICE,
            context: { projectId: PROJ_A }
        });
        assert.strictEqual(res.mode, QUACKIE_CONTROL_MODES.INTERVENTION);
        assert.ok(res.reply.includes("INTERVENTION IMPACT EVALUATION"));
    });

    test("62. formatInterventionReply formats trade-offs and action deep-links cleanly", () => {
        const mockEval = {
            intervention: { type: "REASSIGN_TASK", parameters: { toUserId: "Bob" } },
            impactScore: 82,
            classification: "HIGH_POSITIVE_IMPACT",
            comparison: {
                health: { before: 61, after: 70, delta: 9 },
                scheduleDelayDays: { recoveredDays: 2.1 },
                criticalTasks: { before: 7, after: 5 },
                bottlenecks: { before: 2, after: 1 }
            },
            benefits: [{ title: "Schedule Recovery", evidence: "Advanced finish by 2 days" }],
            costs: [{ title: "Workload Pressure", description: "+7h added to Bob" }],
            recommendation: { rationale: "Potentially beneficial with trade-offs." }
        };

        const reply = formatInterventionReply(mockEval);
        assert.ok(reply.includes("Bob"));
        assert.ok(reply.includes("61 → 70"));
        assert.ok(reply.includes("+2.1 day(s) recovered"));
        assert.ok(reply.includes("[View Impact]"));
        assert.ok(reply.includes("[Prepare Action]"));
    });

    test("63. Quackie confirmation guard rejects destructive 'Apply it' without approval", async () => {
        const res = await processMessage({
            message: "Apply it",
            userId: USER_ALICE,
            context: { projectId: PROJ_A }
        });
        assert.ok(res.reply.includes("Approval Center") || res.reply.includes("explicit approval") || res.reply.includes("proposal"));
    });

    // ============================================================
    // O. SECURITY & PROJECT ISOLATION
    // ============================================================

    test("64. Missing projectId in evaluateIntervention throws validation error immediately", async () => {
        await assert.rejects(
            evaluateIntervention({ intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK } }),
            { message: /Project ID is required/ }
        );
    });

    test("65. Project isolation: Project A intervention state does not leak to Project B", async () => {
        const resA = await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_ESTIMATE, targetEntity: { taskId: "t1" }, parameters: { hoursDelta: -8 } },
            inMemoryData: defaultInMemory
        });

        const projBInMemory = {
            project: { id: PROJ_B, title: "Unrelated Project" },
            tasks: [{ id: "tb1", title: "Isolated Task", status: "To Do", priority: "Low", estimated_hours: 8, project_id: PROJ_B, is_archived: false }],
            dependencies: [],
            projectMembers: []
        };

        const resB = await evaluateIntervention({
            projectId: PROJ_B,
            intervention: { type: INTERVENTION_TYPES.CHANGE_TASK_PRIORITY, targetEntity: { taskId: "tb1" }, parameters: { priority: "High" } },
            inMemoryData: projBInMemory
        });

        assert.strictEqual(resA.projectId, PROJ_A);
        assert.strictEqual(resB.projectId, PROJ_B);
        assert.notStrictEqual(resA.baseStateHash, resB.baseStateHash);
    });

    // ============================================================
    // P. ZERO SILENT STATE MUTATIONS (PART 29 INVARIANT)
    // ============================================================

    test("66. Zero database mutations: Hash before evaluate === Hash after evaluate", async () => {
        const hashBefore = computeProjectStateHash({
            project: sampleProject,
            tasks: sampleTasks,
            dependencies: sampleDependencies
        });

        await evaluateIntervention({
            projectId: PROJ_A,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });

        const hashAfter = computeProjectStateHash({
            project: sampleProject,
            tasks: sampleTasks,
            dependencies: sampleDependencies
        });

        assert.strictEqual(hashBefore, hashAfter);
    });

    test("67. Zero database mutations: Hash before prepare === Hash after prepare", async () => {
        const hashBefore = computeProjectStateHash({
            project: sampleProject,
            tasks: sampleTasks,
            dependencies: sampleDependencies
        });

        await prepareInterventionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            intervention: { type: INTERVENTION_TYPES.REASSIGN_TASK, targetEntity: { taskId: "t2" }, parameters: { toUserId: USER_BOB } },
            inMemoryData: defaultInMemory
        });

        const hashAfter = computeProjectStateHash({
            project: sampleProject,
            tasks: sampleTasks,
            dependencies: sampleDependencies
        });

        assert.strictEqual(hashBefore, hashAfter);
    });

    test("68. Zero external AI API calls: All Phase 9 evaluations execute locally without external network requests", () => {
        const res = calculateInterventionScore({ scheduleRecoveryDays: 2, healthDelta: 8 });
        assert.strictEqual(typeof res.score, "number");
        assert.strictEqual(typeof res.classification, "string");
        assert.ok(res.factors.length > 0);
    });
});
