import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    createDecision,
    getProjectDecisions,
    getDecisionById,
    updateDecision,
    deleteDecision,
    supersedeDecision,
    compareExpectedVsObserved,
    getDecisionIntelligenceDetails,
    clearDecisionLogStore,
    DECISION_CATEGORIES,
    DECISION_STATUSES,
    EVIDENCE_QUALITY,
    normalizeCategory,
    normalizeStatus
} from "../services/decisionLogService.js";

import {
    clearDecisionStore,
    addInMemoryDecision,
    getProjectDecisionIntelligence
} from "../services/decisionIntelligenceService.js";

import {
    clearSnapshotStore,
    captureHealthSnapshot
} from "../services/projectHistoryService.js";

import {
    clearTimelineStore,
    addTimelineEvent
} from "../services/projectTimelineService.js";

import { getProjectMemory } from "../services/projectMemoryService.js";
import { replayProjectPointInTime } from "../services/projectReplayService.js";
import { runProjectDiagnosis } from "../services/projectDiagnosisService.js";
import {
    clearAutopsyStore,
    setInMemoryProject,
    runProjectAutopsy
} from "../services/projectAutopsyService.js";

import {
    parseNaturalLanguageQuery,
    INTENTS,
    INTENT_CATEGORIES
} from "../services/naturalLanguageControlService.js";

import { handleIntelligenceQuery } from "../services/intelligenceQueryService.js";
import { processMessage } from "../services/quackieService.js";

describe("PHASE 14: Project Decision Log & Intelligence Integration Test Suite", () => {
    const PROJ_A = "proj-alpha-14";
    const PROJ_B = "proj-beta-14";
    const USER_ALICE = "user-alice";
    const USER_BOB = "user-bob";

    beforeEach(() => {
        clearSnapshotStore();
        clearTimelineStore();
        clearDecisionStore();
        clearDecisionLogStore();
        clearAutopsyStore();
    });

    // ============================================================
    // PART A: CREATION & VALIDATION
    // ============================================================

    test("1. createDecision: records structured project decision with complete context", async () => {
        const dec = await createDecision({
            projectId: PROJ_A,
            title: "Adopt PostgreSQL for relational metadata",
            rationale: "Requires strong ACID transactions and complex indexing",
            category: "TECHNICAL",
            alternatives: ["PostgreSQL", "MongoDB", "DynamoDB"],
            expectedConsequences: ["Strict schema enforcement", "Slightly higher memory overhead"],
            tags: ["database", "backend", "architecture"],
            relatedTasks: ["task-db-setup"],
            relatedRisks: ["risk-db-scale"],
            ownerId: USER_ALICE,
            userId: USER_ALICE
        });

        assert.ok(dec.id);
        assert.equal(dec.projectId, PROJ_A);
        assert.equal(dec.title, "Adopt PostgreSQL for relational metadata");
        assert.equal(dec.decision, "Adopt PostgreSQL for relational metadata");
        assert.equal(dec.rationale, "Requires strong ACID transactions and complex indexing");
        assert.equal(dec.category, "TECHNICAL");
        assert.equal(dec.status, "ACTIVE");
        assert.equal(dec.alternatives.length, 3);
        assert.equal(dec.expectedConsequences.length, 2);
        assert.deepEqual(dec.tags, ["database", "backend", "architecture"]);
        assert.deepEqual(dec.relatedTasks, ["task-db-setup"]);
        assert.deepEqual(dec.relatedRisks, ["risk-db-scale"]);
        assert.equal(dec.ownerId, USER_ALICE);
    });

    test("2. createDecision validation: throws 400 error when title or projectId is missing", async () => {
        await assert.rejects(
            async () => {
                await createDecision({ projectId: null, title: "Valid Title" });
            },
            { message: /Project ID is required/ }
        );

        await assert.rejects(
            async () => {
                await createDecision({ projectId: PROJ_A, title: "" });
            },
            { message: /Decision title is required/ }
        );
    });

    // ============================================================
    // PART B: READING & PAGINATION
    // ============================================================

    test("3. getProjectDecisions: retrieves decisions with bounded pagination and summary", async () => {
        for (let i = 1; i <= 5; i++) {
            await createDecision({
                projectId: PROJ_A,
                title: `Decision ${i}`,
                category: i % 2 === 0 ? "SCHEDULE" : "TECHNICAL",
                status: i === 5 ? "SUPERSEDED" : "ACTIVE",
                decisionDate: new Date(Date.now() - i * 1000 * 60)
            });
        }

        const res = await getProjectDecisions(PROJ_A, { page: 1, limit: 3 });
        assert.equal(res.decisions.length, 3);
        assert.equal(res.pagination.total, 5);
        assert.equal(res.pagination.page, 1);
        assert.equal(res.pagination.limit, 3);
        assert.equal(res.pagination.totalPages, 2);
        assert.equal(res.summary.total, 5);
        assert.equal(res.summary.active, 4);
        assert.equal(res.summary.superseded, 1);

        const page2 = await getProjectDecisions(PROJ_A, { page: 2, limit: 3 });
        assert.equal(page2.decisions.length, 2);
    });

    test("4. getDecisionById: retrieves single decision by ID and verifies project boundary", async () => {
        const created = await createDecision({
            projectId: PROJ_A,
            title: "Unique Architecture Decision",
            rationale: "Micro-frontends"
        });

        const fetched = await getDecisionById(PROJ_A, created.id);
        assert.equal(fetched.id, created.id);
        assert.equal(fetched.title, "Unique Architecture Decision");

        // Cross-project boundary rejection
        await assert.rejects(
            async () => {
                await getDecisionById(PROJ_B, created.id);
            },
            { message: /not found in project/ }
        );
    });

    // ============================================================
    // PART C & D: UPDATING & DELETION
    // ============================================================

    test("5. updateDecision: modifies decision fields while maintaining historical metadata", async () => {
        const created = await createDecision({
            projectId: PROJ_A,
            title: "Original Decision",
            rationale: "Initial thoughts"
        });

        const updated = await updateDecision(PROJ_A, created.id, {
            title: "Updated Decision Policy",
            rationale: "Refined architectural justification",
            category: "ARCHITECTURE",
            tags: ["architecture", "v2"]
        }, USER_ALICE);

        assert.equal(updated.title, "Updated Decision Policy");
        assert.equal(updated.rationale, "Refined architectural justification");
        assert.equal(updated.category, "ARCHITECTURE");
        assert.deepEqual(updated.tags, ["architecture", "v2"]);
    });

    test("6. deleteDecision: deletes record and ensures it no longer appears in queries", async () => {
        const created = await createDecision({
            projectId: PROJ_A,
            title: "Ephemeral Decision"
        });

        const delRes = await deleteDecision(PROJ_A, created.id, USER_ALICE);
        assert.equal(delRes.success, true);
        assert.equal(delRes.decisionId, created.id);

        await assert.rejects(
            async () => {
                await getDecisionById(PROJ_A, created.id);
            },
            { message: /not found in project/ }
        );
    });

    // ============================================================
    // PART E, F & 24: SUPERSEDING & DECISION CHAIN
    // ============================================================

    test("7. supersedeDecision: preserves old decision as SUPERSEDED and links to new ACTIVE decision", async () => {
        const dec1 = await createDecision({
            projectId: PROJ_A,
            title: "Policy v1: Deploy every 4 weeks",
            category: "PROCESS",
            rationale: "Safe cadence"
        });

        const res = await supersedeDecision(PROJ_A, dec1.id, {
            title: "Policy v2: Continuous deployment with feature flags",
            rationale: "Accelerate cycle time safely",
            category: "PROCESS",
            expectedConsequences: ["Faster feedback loop"]
        }, USER_ALICE);

        assert.equal(res.previousDecision.id, dec1.id);
        assert.equal(res.previousDecision.status, "SUPERSEDED");
        assert.equal(res.previousDecision.supersededBy, res.newDecision.id);

        assert.equal(res.newDecision.status, "ACTIVE");
        assert.equal(res.newDecision.supersedesId, dec1.id);
        assert.equal(res.newDecision.title, "Policy v2: Continuous deployment with feature flags");

        // Verify decision chain
        const details = await getDecisionIntelligenceDetails(PROJ_A, res.newDecision.id);
        assert.ok(details.decisionChain.length >= 2);
        assert.equal(details.decisionChain[0].id, res.newDecision.id);
        assert.equal(details.decisionChain[1].id, dec1.id);
    });

    // ============================================================
    // PART G & H: FILTERING & SEARCH
    // ============================================================

    test("8. filtering & search: filters by category, status, tags, and full text search", async () => {
        await createDecision({
            projectId: PROJ_A,
            title: "Switch to weekly sprints",
            category: "SCHEDULE",
            status: "ACTIVE",
            tags: ["agile", "schedule"]
        });

        await createDecision({
            projectId: PROJ_A,
            title: "Refactor legacy authentication module",
            category: "TECHNICAL",
            status: "CLOSED",
            tags: ["security", "auth"]
        });

        // Filter by category
        const scheduleOnly = await getProjectDecisions(PROJ_A, { category: "SCHEDULE" });
        assert.equal(scheduleOnly.decisions.length, 1);
        assert.equal(scheduleOnly.decisions[0].category, "SCHEDULE");

        // Filter by status
        const closedOnly = await getProjectDecisions(PROJ_A, { status: "CLOSED" });
        assert.equal(closedOnly.decisions.length, 1);
        assert.equal(closedOnly.decisions[0].status, "CLOSED");

        // Filter by tag
        const securityTag = await getProjectDecisions(PROJ_A, { tag: "security" });
        assert.equal(securityTag.decisions.length, 1);
        assert.equal(securityTag.decisions[0].title, "Refactor legacy authentication module");

        // Search text
        const searchRes = await getProjectDecisions(PROJ_A, { search: "authentication" });
        assert.equal(searchRes.decisions.length, 1);
        assert.equal(searchRes.decisions[0].title, "Refactor legacy authentication module");
    });

    // ============================================================
    // PART J & 18: DECISION INTELLIGENCE & EXPECTED VS OBSERVED
    // ============================================================

    test("9. compareExpectedVsObserved: evaluates longitudinal telemetry against stated expectations without causal claims", () => {
        const decision = {
            id: "dec-100",
            expectedConsequences: [
                "Reduce schedule delay by prioritizing API work",
                "Improve overall project health score",
                "Reduce team bottleneck friction"
            ]
        };

        const impact = {
            beforeState: { healthScore: 70, scheduleDriftDays: 5, bottleneckCount: 3 },
            afterState: { healthScore: 82, scheduleDriftDays: 2, bottleneckCount: 1 },
            deltas: { healthDelta: 12, driftDelta: -3, bottleneckDelta: -2 },
            subsequentEventsWindow: [
                { id: "ev-1", title: "API Tests Completed" },
                { id: "ev-2", title: "Milestone Verified" }
            ]
        };

        const comparison = compareExpectedVsObserved(decision, impact);

        assert.equal(comparison.expectedCount, 3);
        assert.equal(comparison.evidenceQuality, EVIDENCE_QUALITY.STRONG);
        assert.equal(comparison.isCausal, false);
        assert.match(comparison.causalityDisclaimer, /Temporal association reflects chronologically subsequent events/);

        // Verification of observations
        assert.equal(comparison.comparisons[0].observationStatus, "FAVORABLE_TREND");
        assert.match(comparison.comparisons[0].observedObservation, /drift decreased by 3 days/);

        assert.equal(comparison.comparisons[1].observationStatus, "FAVORABLE_TREND");
        assert.match(comparison.comparisons[1].observedObservation, /health improved by \+12/);

        assert.equal(comparison.comparisons[2].observationStatus, "FAVORABLE_TREND");
        assert.match(comparison.comparisons[2].observedObservation, /bottlenecks reduced by 2/);
    });

    test("10. compareExpectedVsObserved: handles insufficient telemetry data gracefully", () => {
        const decision = {
            id: "dec-101",
            expectedConsequences: ["Reduce deployment lag"]
        };

        const comparison = compareExpectedVsObserved(decision, {
            beforeState: null,
            afterState: null,
            deltas: { healthDelta: null, driftDelta: null, bottleneckDelta: null },
            subsequentEventsWindow: []
        });

        assert.equal(comparison.evidenceQuality, EVIDENCE_QUALITY.INSUFFICIENT);
        assert.equal(comparison.comparisons[0].observationStatus, "OBSERVATION_PENDING");
        assert.match(comparison.comparisons[0].observedObservation, /Insufficient longitudinal data/);
    });

    test("11. getDecisionIntelligenceDetails: retrieves full impact analysis and counterfactual handoff link", async () => {
        // Capture a health snapshot
        await captureHealthSnapshot({
            projectId: PROJ_A,
            healthData: { healthScore: 75, healthStatus: "WATCH", scheduleDriftDays: 2, bottleneckCount: 1, criticalTaskCount: 2 }
        });

        const dec = await createDecision({
            projectId: PROJ_A,
            title: "Reorder sprint deliverables",
            expectedConsequences: ["Improve schedule alignment"],
            relatedTasks: ["task-a1"]
        });

        const details = await getDecisionIntelligenceDetails(PROJ_A, dec.id);
        assert.ok(details.decision);
        assert.ok(details.impact);
        assert.ok(details.expectedVsObserved);
        assert.ok(details.counterfactualHandoff);
        assert.equal(details.counterfactualHandoff.counterfactualType, "ALTERNATIVE_DECISION");
        assert.equal(details.counterfactualHandoff.targetTaskId, "task-a1");
    });

    // ============================================================
    // PART K, L, M & N: INTEGRATION WITH MEMORY, REPLAY, DIAGNOSIS, AUTOPSY
    // ============================================================

    test("12. Project Memory integration: includes decisions and temporal observations in project memory", async () => {
        await createDecision({
            projectId: PROJ_A,
            title: "Authorized overtime to clear critical bottleneck",
            rationale: "Sprint deadline commitment"
        });

        const memory = await getProjectMemory(PROJ_A);
        assert.ok(memory.decisions);
        assert.ok(memory.decisions.length >= 1);
        assert.equal(memory.decisions[0].title, "Authorized overtime to clear critical bottleneck");
    });

    test("13. Project Replay integration: point-in-time replay includes decisions recorded around timestamp", async () => {
        await captureHealthSnapshot({
            projectId: PROJ_A,
            healthData: { healthScore: 80, healthStatus: "HEALTHY", scheduleDriftDays: 0, bottleneckCount: 0, criticalTaskCount: 1 }
        });

        const decTime = new Date("2026-10-02T12:00:00Z");
        await createDecision({
            projectId: PROJ_A,
            title: "Shifted QA phase before UAT",
            decisionDate: decTime
        });

        const replay = await replayProjectPointInTime(PROJ_A, decTime.toISOString());
        assert.ok(replay.decisionsAround);
        assert.ok(replay.decisionsAround.some((d) => d.decision === "Shifted QA phase before UAT" || d.title === "Shifted QA phase before UAT"));
    });

    test("14. Project Diagnosis integration: detects DECISION_VOLATILITY on frequent superseding", async () => {
        // Create 2 superseded decisions
        const d1 = await createDecision({ projectId: PROJ_A, title: "Policy A", status: "SUPERSEDED" });
        const d2 = await createDecision({ projectId: PROJ_A, title: "Policy B", status: "SUPERSEDED" });
        await createDecision({ projectId: PROJ_A, title: "Policy C", status: "ACTIVE" });

        const diag = await runProjectDiagnosis(PROJ_A);
        assert.ok(diag.diagnoses.some((d) => d.type === "DECISION_VOLATILITY"));
    });

    test("15. Project Autopsy integration: retrospective includes recorded decision counts and summaries", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        await createDecision({ projectId: PROJ_A, title: "Major Architecture Milestone" });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.ok(autopsy.decisions);
        assert.ok(autopsy.decisions.totalDecisionsRecorded >= 1);
        assert.ok(autopsy.decisions.decisionsList.some((d) => d.title === "Major Architecture Milestone"));
    });

    // ============================================================
    // PART P & 43: NATURAL LANGUAGE & ZERO SILENT MUTATION
    // ============================================================

    test("16. Natural Language: parses decision queries to INTENTS.DECISIONS", () => {
        const q1 = parseNaturalLanguageQuery("What decisions were made?");
        assert.equal(q1.intent, INTENTS.DECISIONS);

        const q2 = parseNaturalLanguageQuery("Show project decisions");
        assert.equal(q2.intent, INTENTS.DECISIONS);

        const q3 = parseNaturalLanguageQuery("Which decisions were superseded?");
        assert.equal(q3.intent, INTENTS.DECISIONS);
    });

    test("17. Natural Language: decision creation parses to PREPARE_DECISION and NEVER mutates silently", async () => {
        const query = parseNaturalLanguageQuery("Record a decision that we use PostgreSQL");
        assert.equal(query.intent, INTENTS.PREPARE_DECISION);
        assert.equal(query.intentCategory, INTENT_CATEGORIES.ACTION_PREPARATION);

        // Verify handling produces a proposal requiring explicit confirmation
        const result = await handleIntelligenceQuery({
            query: "Record a decision that we use PostgreSQL",
            projectId: PROJ_A,
            userId: USER_ALICE
        });

        assert.equal(result.data.status, "PROPOSED");
        assert.equal(result.data.requiresConfirmation, true);
        assert.match(result.data.warning, /Explicit user confirmation is required/);

        // Verify ZERO silent writes to the project Decision Log
        const log = await getProjectDecisions(PROJ_A);
        assert.equal(log.decisions.length, 0);
    });

    // ============================================================
    // PART Q: QUACKIE INTELLIGENCE & SAFETY CONFIRMATION GUARD
    // ============================================================

    test("18. Quackie: processes decision questions and intercepts decision creation requests safely", async () => {
        await createDecision({
            projectId: PROJ_A,
            title: "Approve 2-week sprint cadence",
            category: "SCHEDULE"
        });

        // 1. Querying decisions
        const queryReply = await processMessage({
            message: "What decisions were made?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(queryReply.reply);
        assert.match(queryReply.reply, /Decision Intelligence/);
        assert.match(queryReply.reply, /Approve 2-week sprint cadence/);

        // 2. Intercepting creation safely (Zero silent mutation guard)
        const createAttempt = await processMessage({
            message: "Record a decision that we move authentication before frontend",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.equal(createAttempt.requiresConfirmation, true);
        assert.equal(createAttempt.meta?.safetyGuard, true);
        assert.match(createAttempt.reply, /Explicit Confirmation Required/);

        // Verify no silent write occurred
        const allDecisions = await getProjectDecisions(PROJ_A);
        assert.equal(allDecisions.decisions.length, 1); // only the initial one exists
    });

    // ============================================================
    // PART S & T: PROJECT ISOLATION & ENUM INTEGRITY
    // ============================================================

    test("19. Project isolation: Project A decisions do not leak into Project B", async () => {
        await createDecision({ projectId: PROJ_A, title: "Secret Decision A" });
        await createDecision({ projectId: PROJ_B, title: "Secret Decision B" });

        const listA = await getProjectDecisions(PROJ_A);
        const listB = await getProjectDecisions(PROJ_B);

        assert.equal(listA.decisions.length, 1);
        assert.equal(listA.decisions[0].title, "Secret Decision A");

        assert.equal(listB.decisions.length, 1);
        assert.equal(listB.decisions[0].title, "Secret Decision B");
    });

    test("20. Enum normalizers: normalizes categories and statuses gracefully", () => {
        assert.equal(normalizeCategory("technical"), "TECHNICAL");
        assert.equal(normalizeCategory("Architecture"), "ARCHITECTURE");
        assert.equal(normalizeCategory("non_existent_category"), "OTHER");
        assert.equal(normalizeCategory(null), "OTHER");

        assert.equal(normalizeStatus("active"), "ACTIVE");
        assert.equal(normalizeStatus("superseded"), "SUPERSEDED");
        assert.equal(normalizeStatus("approved"), "ACTIVE");
        assert.equal(normalizeStatus("random_status"), "ACTIVE");
    });
});
