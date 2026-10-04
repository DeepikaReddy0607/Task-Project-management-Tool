import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
    COUNTERFACTUAL_TYPES,
    EVIDENCE_QUALITY,
    selectHistoricalBaseline,
    runCounterfactualSimulation,
    compareCounterfactualBranches,
    getCounterfactualTimelineReplay,
    setInMemoryProjectData,
    clearCounterfactualStore
} from "../services/counterfactualTimeMachineService.js";
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
    formatCounterfactualReply,
    QUACKIE_CONTROL_MODES
} from "../services/quackieService.js";

describe("PHASE 12: Counterfactual Time Machine Adversarial Historical Intelligence Test Suite", () => {
    const PROJ_ID = "proj-counterfactual-test-12";
    const USER_DEV1 = "usr-dev1-cf";
    const USER_DEV2 = "usr-dev2-cf";
    const USER_LEAD = "usr-lead-cf";

    const sampleProject = {
        id: PROJ_ID,
        title: "Autonomous Vehicle Telemetry Pipeline",
        start_date: "2026-10-01T00:00:00.000Z",
        end_date: "2026-10-25T00:00:00.000Z",
        status: "In Progress"
    };

    const sampleTasks = [
        { id: "t1", title: "Ingestion Broker Configuration", status: "Completed", priority: "High", estimated_hours: 24, project_id: PROJ_ID, assigned_to: USER_DEV1, is_archived: false },
        { id: "t2", title: "Protobuf Decoder Optimization", status: "In Progress", priority: "Critical", estimated_hours: 32, project_id: PROJ_ID, assigned_to: USER_DEV1, is_archived: false },
        { id: "t3", title: "Spatial Indexing Grid", status: "To Do", priority: "Critical", estimated_hours: 40, project_id: PROJ_ID, assigned_to: USER_DEV2, is_archived: false },
        { id: "t4", title: "Safety Validation Suite", status: "To Do", priority: "High", estimated_hours: 24, project_id: PROJ_ID, assigned_to: USER_LEAD, is_archived: false },
        { id: "t5", title: "Regulatory Telemetry Certification", status: "To Do", priority: "Critical", estimated_hours: 16, project_id: PROJ_ID, assigned_to: USER_LEAD, is_archived: false }
    ];

    const sampleDependencies = [
        { task_id: "t2", depends_on_task_id: "t1" },
        { task_id: "t3", depends_on_task_id: "t2" },
        { task_id: "t4", depends_on_task_id: "t1" },
        { task_id: "t5", depends_on_task_id: "t3" },
        { task_id: "t5", depends_on_task_id: "t4" }
    ];

    const sampleMembers = [
        { id: "m1", user_id: USER_DEV1, project_id: PROJ_ID, users: { id: USER_DEV1, email: "dev1@auto.test", first_name: "Alice", last_name: "Engineer" } },
        { id: "m2", user_id: USER_DEV2, project_id: PROJ_ID, users: { id: USER_DEV2, email: "dev2@auto.test", first_name: "Bob", last_name: "Algorithm" } },
        { id: "m3", user_id: USER_LEAD, project_id: PROJ_ID, users: { id: USER_LEAD, email: "lead@auto.test", first_name: "Clara", last_name: "Architect" } }
    ];

    const baseProjectData = {
        project: sampleProject,
        tasks: sampleTasks,
        dependencies: sampleDependencies,
        projectMembers: sampleMembers
    };

    beforeEach(() => {
        clearCounterfactualStore();
        setInMemoryProjectData(PROJ_ID, baseProjectData);
    });

    // ============================================================
    // 1. ENUMS & CONSTANTS
    // ============================================================

    test("1. Counterfactual types and evidence quality enums are fully defined", () => {
        assert.strictEqual(Object.keys(COUNTERFACTUAL_TYPES).length, 14);
        assert.strictEqual(COUNTERFACTUAL_TYPES.EARLIER_COMPLETION, "EARLIER_COMPLETION");
        assert.strictEqual(COUNTERFACTUAL_TYPES.LATER_COMPLETION, "LATER_COMPLETION");
        assert.strictEqual(COUNTERFACTUAL_TYPES.ALTERNATIVE_ASSIGNMENT, "ALTERNATIVE_ASSIGNMENT");
        assert.strictEqual(COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY, "REMOVED_DEPENDENCY");
        assert.strictEqual(COUNTERFACTUAL_TYPES.RISK_ACTION_EARLIER, "RISK_ACTION_EARLIER");

        assert.strictEqual(EVIDENCE_QUALITY.STRONG_EVIDENCE, "STRONG_EVIDENCE");
        assert.strictEqual(EVIDENCE_QUALITY.INSUFFICIENT_EVIDENCE, "INSUFFICIENT_EVIDENCE");
    });

    // ============================================================
    // 2. HISTORICAL BASELINE SELECTION (NEVER FABRICATES HISTORY)
    // ============================================================

    test("2. selectHistoricalBaseline accurately reflects available baseline or reports insufficient evidence", async () => {
        // With explicit base data -> AVAILABLE with STRONG_EVIDENCE
        const available = await selectHistoricalBaseline({
            projectId: PROJ_ID,
            baseData: baseProjectData
        });
        assert.strictEqual(available.status, "AVAILABLE");
        assert.strictEqual(available.evidenceQuality, EVIDENCE_QUALITY.STRONG_EVIDENCE);
        assert.ok(available.baselineState);

        // For non-existent past timestamp with no recorded snapshot -> INSUFFICIENT_EVIDENCE
        const missing = await selectHistoricalBaseline({
            projectId: "non-existent-proj-999",
            referenceTimestamp: "2020-01-01T00:00:00.000Z"
        });
        assert.strictEqual(missing.status, "INSUFFICIENT_EVIDENCE");
        assert.strictEqual(missing.evidenceQuality, EVIDENCE_QUALITY.INSUFFICIENT_EVIDENCE);
        assert.strictEqual(missing.baselineState, null);
    });

    // ============================================================
    // 3. COUNTERFACTUAL SIMULATION & DELTAS (ZERO MUTATIONS)
    // ============================================================

    test("3. runCounterfactualSimulation for EARLIER_COMPLETION computes schedule deltas without mutating production state", async () => {
        const hashBefore = computeProjectStateHash(baseProjectData);

        const result = await runCounterfactualSimulation({
            projectId: PROJ_ID,
            scenario: {
                type: COUNTERFACTUAL_TYPES.EARLIER_COMPLETION,
                targetTaskId: "t2",
                deltaDays: 3
            },
            baseData: baseProjectData,
            startOfToday: new Date("2026-10-01T00:00:00.000Z")
        });

        const hashAfter = computeProjectStateHash(baseProjectData);
        assert.strictEqual(hashBefore, hashAfter, "Production state was mutated during counterfactual simulation!");

        assert.strictEqual(result.projectId, PROJ_ID);
        assert.strictEqual(result.scenarioType, COUNTERFACTUAL_TYPES.EARLIER_COMPLETION);
        assert.ok(result.divergencePoint);
        assert.strictEqual(result.divergencePoint.entityId, "t2");
        assert.ok(result.actualState);
        assert.ok(result.simulatedState);
        assert.ok(result.deltas);
        assert.ok(result.impactChain.length > 0);
        assert.ok(result.limitations.length > 0);
    });

    test("4. runCounterfactualSimulation for REMOVED_DEPENDENCY decouples critical path", async () => {
        const result = await runCounterfactualSimulation({
            projectId: PROJ_ID,
            scenario: {
                type: COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY,
                fromTaskId: "t2",
                toTaskId: "t3"
            },
            baseData: baseProjectData,
            startOfToday: new Date("2026-10-01T00:00:00.000Z")
        });

        assert.strictEqual(result.scenarioType, COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY);
        assert.ok(result.deltas);
        assert.strictEqual(result.divergencePoint.type, "DEPENDENCY_REMOVAL");
    });

    test("5. runCounterfactualSimulation for ALTERNATIVE_ASSIGNMENT shifts task ownership", async () => {
        const result = await runCounterfactualSimulation({
            projectId: PROJ_ID,
            scenario: {
                type: COUNTERFACTUAL_TYPES.ALTERNATIVE_ASSIGNMENT,
                targetTaskId: "t2",
                targetMemberId: USER_DEV2
            },
            baseData: baseProjectData,
            startOfToday: new Date("2026-10-01T00:00:00.000Z")
        });

        assert.strictEqual(result.scenarioType, COUNTERFACTUAL_TYPES.ALTERNATIVE_ASSIGNMENT);
        assert.ok(result.divergencePoint.description.includes("Reassigned"));
    });

    test("6. runCounterfactualSimulation for DIFFERENT_DEADLINE evaluates schedule feasibility", async () => {
        const result = await runCounterfactualSimulation({
            projectId: PROJ_ID,
            scenario: {
                type: COUNTERFACTUAL_TYPES.DIFFERENT_DEADLINE,
                deltaDays: 7
            },
            baseData: baseProjectData,
            startOfToday: new Date("2026-10-01T00:00:00.000Z")
        });

        assert.strictEqual(result.scenarioType, COUNTERFACTUAL_TYPES.DIFFERENT_DEADLINE);
        assert.ok(result.divergencePoint.description.includes("7 days"));
    });

    // ============================================================
    // 4. MULTI-BRANCH COMPARISON (BOUNDED TO 5 BRANCHES)
    // ============================================================

    test("7. compareCounterfactualBranches evaluates multiple alternative histories alongside actual baseline", async () => {
        const branches = [
            { type: COUNTERFACTUAL_TYPES.EARLIER_COMPLETION, targetTaskId: "t2", deltaDays: 2 },
            { type: COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY, fromTaskId: "t2", toTaskId: "t3" },
            { type: COUNTERFACTUAL_TYPES.ALTERNATIVE_ASSIGNMENT, targetTaskId: "t3", targetMemberId: USER_DEV1 }
        ];

        const comparison = await compareCounterfactualBranches({
            projectId: PROJ_ID,
            branches,
            baseData: baseProjectData,
            startOfToday: new Date("2026-10-01T00:00:00.000Z")
        });

        assert.strictEqual(comparison.branchesCount, 3);
        assert.strictEqual(comparison.comparisonRows.length, 4); // 1 baseline + 3 branches
        assert.strictEqual(comparison.comparisonRows[0].isBaseline, true);
        assert.strictEqual(comparison.comparisonRows[1].isBaseline, false);
    });

    // ============================================================
    // 5. DUAL-TRACK TIMELINE REPLAY GENERATOR
    // ============================================================

    test("8. getCounterfactualTimelineReplay constructs dual-track timeline with divergence point", async () => {
        const replay = await getCounterfactualTimelineReplay({
            projectId: PROJ_ID,
            scenario: {
                type: COUNTERFACTUAL_TYPES.EARLIER_COMPLETION,
                targetTaskId: "t2",
                deltaDays: 3
            },
            baseData: baseProjectData
        });

        assert.strictEqual(replay.projectId, PROJ_ID);
        assert.ok(Array.isArray(replay.actualTimeline));
        assert.ok(Array.isArray(replay.counterfactualTimeline));
        assert.ok(replay.divergencePoint);

        const divEvent = replay.counterfactualTimeline.find((e) => e.isDivergence);
        assert.ok(divEvent);
    });

    // ============================================================
    // 6. NATURAL LANGUAGE CONTROL & QUERY INTEGRATION
    // ============================================================

    test("9. parseNaturalLanguageQuery matches COUNTERFACTUAL intents", () => {
        const q1 = parseNaturalLanguageQuery("What would have happened if we finished task t2 3 days earlier?");
        assert.strictEqual(q1.intent, INTENTS.COUNTERFACTUAL_RUN);

        const q2 = parseNaturalLanguageQuery("Show actual versus what-if history");
        assert.strictEqual(q2.intent, INTENTS.COUNTERFACTUAL_COMPARE);
    });

    test("10. handleIntelligenceQuery executes COUNTERFACTUAL_RUN intent", async () => {
        const response = await handleIntelligenceQuery({
            query: "What if we finished task t2 3 days earlier?",
            projectId: PROJ_ID,
            context: { projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") }
        });

        assert.strictEqual(response.intent, INTENTS.COUNTERFACTUAL_RUN);
        assert.ok(["SUCCESS", "EXECUTED"].includes(response.status));
        assert.ok(response.data);
    });

    // ============================================================
    // 7. QUACKIE PERSONALITY INTEGRATION
    // ============================================================

    test("11. Quackie processes counterfactual query and formats response", async () => {
        const mockResult = {
            title: "Counterfactual: Earlier Completion (-3d)",
            divergencePoint: { description: "Completed t2 3 days earlier" },
            actualState: { p80Date: "2026-10-25T00:00:00.000Z", healthScore: 70 },
            simulatedState: { p80Date: "2026-10-22T00:00:00.000Z", healthScore: 78 },
            deltas: { scheduleDaysDelta: -3, healthDelta: 8, criticalPathChanged: true },
            evidenceQuality: EVIDENCE_QUALITY.STRONG_EVIDENCE
        };

        const reply = formatCounterfactualReply(mockResult);
        assert.ok(reply.includes("COUNTERFACTUAL TIME MACHINE ANALYSIS"));
        assert.ok(reply.includes("STRONG_EVIDENCE"));
        assert.ok(reply.includes("-3 day(s)") && reply.includes("Schedule Delta"));

        const quackieMsg = await processMessage({
            message: "Quackie, what would have happened if we finished earlier?",
            projectId: PROJ_ID,
            context: { projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") }
        });

        assert.strictEqual(quackieMsg.mode, QUACKIE_CONTROL_MODES.COUNTERFACTUAL);
        assert.ok(quackieMsg.reply.includes("COUNTERFACTUAL") || quackieMsg.reply.includes("🦆"));
    });
});
