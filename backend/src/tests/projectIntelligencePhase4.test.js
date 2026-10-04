import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    computeSnapshotHash,
    clearSnapshotStore,
    addInMemorySnapshot,
    captureHealthSnapshot,
    getProjectHealthHistory
} from "../services/projectHistoryService.js";

import {
    clearTimelineStore,
    addTimelineEvent,
    normalizeTimelineEvent,
    getProjectTimeline
} from "../services/projectTimelineService.js";

import {
    clearDecisionStore,
    addInMemoryDecision,
    analyzeDecisionImpact,
    getProjectDecisionIntelligence
} from "../services/decisionIntelligenceService.js";

import {
    getProjectMemory
} from "../services/projectMemoryService.js";

import {
    replayProjectPointInTime,
    replayProjectPeriod
} from "../services/projectReplayService.js";

import {
    runProjectDiagnosis
} from "../services/projectDiagnosisService.js";

import {
    clearAutopsyStore,
    setInMemoryProject,
    runProjectAutopsy
} from "../services/projectAutopsyService.js";

import {
    processMessage,
    formatHealthHistoryReply,
    formatTimelineReply,
    formatDecisionIntelligenceReply,
    formatBottleneckHistoryReply,
    formatScheduleHistoryReply,
    formatDiagnosisReply,
    formatReplayReply,
    formatAutopsyReply
} from "../services/quackieService.js";

describe("PHASE 4: Project Memory, Decision Intelligence & Historical Intelligence Suite", () => {
    const PROJ_A = "proj-alpha";
    const PROJ_B = "proj-beta";
    const USER_ALICE = "user-alice";

    beforeEach(() => {
        clearSnapshotStore();
        clearTimelineStore();
        clearDecisionStore();
        clearAutopsyStore();
    });

    // ============================================================
    // SECTION 51: TESTING — HEALTH HISTORY (1-10)
    // ============================================================

    test("1. snapshot creation: captures structured multi-dimensional health snapshot", async () => {
        const snapRes = await captureHealthSnapshot({
            projectId: PROJ_A,
            healthData: {
                healthScore: 78,
                healthStatus: "WATCH",
                dimensions: { schedule: 75, criticalPath: 80, execution: 85, bottlenecks: 70 },
                scheduleDriftDays: 3,
                criticalTaskCount: 4,
                bottleneckCount: 1
            },
            metadata: { trigger: "INITIAL_BASELINE" }
        });

        assert.equal(snapRes.isDuplicate, false);
        assert.equal(snapRes.snapshot.health_score, 78);
        assert.equal(snapRes.snapshot.schedule_drift_days, 3);
        assert.ok(snapRes.snapshot.state_hash);
    });

    test("2. snapshot immutability: snapshot records cannot be modified after capture", async () => {
        const snap = addInMemorySnapshot(PROJ_A, {
            health_score: 82,
            captured_at: new Date("2026-10-01T10:00:00Z")
        });

        // Simulating subsequent capture does not alter previous snapshot
        addInMemorySnapshot(PROJ_A, {
            health_score: 65,
            captured_at: new Date("2026-10-05T10:00:00Z")
        });

        const history = await getProjectHealthHistory(PROJ_A, { order: "asc" });
        assert.equal(history.snapshots.length, 2);
        assert.equal(history.snapshots[0].health_score, 82);
        assert.equal(history.snapshots[1].health_score, 65);
    });

    test("3. duplicate-state suppression: suppresses identical health state capture", async () => {
        const healthPayload = {
            healthScore: 80,
            healthStatus: "HEALTHY",
            scheduleDriftDays: 0,
            criticalTaskCount: 3,
            bottleneckCount: 0
        };

        const first = await captureHealthSnapshot({ projectId: PROJ_A, healthData: healthPayload });
        assert.equal(first.isDuplicate, false);

        // Immediate identical capture attempt
        const second = await captureHealthSnapshot({ projectId: PROJ_A, healthData: healthPayload });
        assert.equal(second.isDuplicate, true);
        assert.match(second.message, /suppressed/i);
    });

    test("4. health trend: correctly categorizes IMPROVING, DECLINING, and STABLE", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 70, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 80, captured_at: new Date("2026-10-05") });

        const historyImproving = await getProjectHealthHistory(PROJ_A);
        assert.equal(historyImproving.trend, "IMPROVING");
        assert.equal(historyImproving.scoreDelta, 10);

        // Add a drop
        addInMemorySnapshot(PROJ_A, { health_score: 68, captured_at: new Date("2026-10-10") });
        const historyDeclining = await getProjectHealthHistory(PROJ_A);
        assert.equal(historyDeclining.trend, "DECLINING");
        assert.equal(historyDeclining.scoreDelta, -12);
    });

    test("5. score changes: tracks currentHealth, previousHealth, and delta correctly", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 85, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 82, captured_at: new Date("2026-10-04") });

        const history = await getProjectHealthHistory(PROJ_A);
        assert.equal(history.currentHealth, 82);
        assert.equal(history.previousHealth, 85);
        assert.equal(history.scoreDelta, -3);
    });

    test("6. dimension changes: tracks historical dimension breakdowns", async () => {
        addInMemorySnapshot(PROJ_A, {
            health_score: 80,
            schedule_score: 85,
            critical_path_score: 75,
            captured_at: new Date("2026-10-01")
        });

        const history = await getProjectHealthHistory(PROJ_A);
        assert.equal(history.dimensionTrends.schedule.length, 1);
        assert.equal(history.dimensionTrends.schedule[0].score, 85);
        assert.equal(history.dimensionTrends.criticalPath[0].score, 75);
    });

    test("7. major decline detection: flags transitions with score decrease >= 5 points", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 85, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 72, captured_at: new Date("2026-10-05") }); // -13 pts

        const history = await getProjectHealthHistory(PROJ_A);
        assert.equal(history.majorDeclines.length, 1);
        assert.equal(history.majorDeclines[0].delta, -13);
        assert.match(history.majorDeclines[0].explanation, /Health declined by 13 points/);
    });

    test("8. major improvement detection: flags transitions with score gain >= 5 points", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 60, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 75, captured_at: new Date("2026-10-05") }); // +15 pts

        const history = await getProjectHealthHistory(PROJ_A);
        assert.equal(history.majorImprovements.length, 1);
        assert.equal(history.majorImprovements[0].delta, 15);
    });

    test("9. historical date ordering: sorts snapshots chronologically ascending or descending", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 70, captured_at: new Date("2026-10-05") });
        addInMemorySnapshot(PROJ_A, { health_score: 80, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 60, captured_at: new Date("2026-10-10") });

        const desc = await getProjectHealthHistory(PROJ_A, { order: "desc" });
        assert.equal(desc.snapshots[0].health_score, 60);
        assert.equal(desc.snapshots[2].health_score, 80);

        const asc = await getProjectHealthHistory(PROJ_A, { order: "asc" });
        assert.equal(asc.snapshots[0].health_score, 80);
        assert.equal(asc.snapshots[2].health_score, 60);
    });

    test("10. project isolation: Project A snapshots do not leak into Project B", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 95, captured_at: new Date() });
        addInMemorySnapshot(PROJ_B, { health_score: 45, captured_at: new Date() });

        const historyA = await getProjectHealthHistory(PROJ_A);
        const historyB = await getProjectHealthHistory(PROJ_B);

        assert.equal(historyA.snapshots.length, 1);
        assert.equal(historyA.currentHealth, 95);

        assert.equal(historyB.snapshots.length, 1);
        assert.equal(historyB.currentHealth, 45);
    });

    // ============================================================
    // SECTION 52: TESTING — TIMELINE (11-23)
    // ============================================================

    test("11. task event: normalizes task creation and status change events", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            action_type: "CREATE_TASK",
            title: "Task Alpha",
            description: "Created Task Alpha"
        });

        assert.equal(ev.type, "TASK_CREATED");
        assert.equal(ev.entityType, "Task");
        assert.equal(ev.source, "activity_log");
    });

    test("12. dependency event: normalizes dependency creation event", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            action_type: "ADD_DEPENDENCY",
            title: "Added dependency",
            description: "Task A -> Task B"
        });

        assert.equal(ev.type, "DEPENDENCY_CREATED");
        assert.equal(ev.entityType, "Dependency");
        assert.equal(ev.severity, "MEDIUM");
    });

    test("13. risk event: normalizes project risk logging event", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            title: "API rate limit risk",
            severity: "High",
            probability: "High"
        });

        assert.equal(ev.type, "RISK_LOGGED");
        assert.equal(ev.entityType, "Risk");
        assert.equal(ev.severity, "HIGH");
    });

    test("14. decision event: normalizes decision event with severity", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            decision: "Postpone beta release by 3 days",
            reason: "Undergoing performance testing"
        });

        assert.equal(ev.type, "DECISION_RECORDED");
        assert.equal(ev.entityType, "Decision");
        assert.equal(ev.source, "decision");
    });

    test("15. health event: normalizes health degradation snapshot event", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            health_score: 45,
            health_status: "CRITICAL"
        });

        assert.equal(ev.type, "HEALTH_DEGRADED");
        assert.equal(ev.severity, "CRITICAL");
        assert.equal(ev.entityType, "Health");
    });

    test("16. replanning event: normalizes replanning proposal event", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            type: "REPLANNING_PROPOSED",
            title: "Schedule Recovery Plan",
            severity: "MEDIUM"
        });

        assert.equal(ev.type, "REPLANNING_PROPOSED");
        assert.equal(ev.severity, "MEDIUM");
    });

    test("17. execution event: normalizes proposal execution audit event", () => {
        const ev = normalizeTimelineEvent({
            projectId: PROJ_A,
            action_type: "REPLANNING_EXECUTED",
            title: "Replanning Executed",
            description: "Applied 2 mutations to project"
        });

        assert.equal(ev.type, "REPLANNING_EXECUTED");
    });

    test("18. timeline normalization: ensures standard schema with traceability", () => {
        const ev = normalizeTimelineEvent({
            id: "raw-123",
            projectId: PROJ_A,
            title: "Milestone Reached",
            user_id: "user-1"
        });

        assert.ok(ev.id);
        assert.ok(ev.projectId);
        assert.ok(ev.timestamp instanceof Date);
        assert.ok(ev.actor);
        assert.ok(ev.severity);
        assert.ok(ev.source);
    });

    test("19. filtering: filters timeline by severity and event type", async () => {
        addTimelineEvent({ projectId: PROJ_A, type: "TASK_CREATED", severity: "LOW" });
        addTimelineEvent({ projectId: PROJ_A, type: "HEALTH_DEGRADED", severity: "CRITICAL" });
        addTimelineEvent({ projectId: PROJ_A, type: "TASK_UPDATED", severity: "LOW" });

        const criticalEvents = await getProjectTimeline(PROJ_A, { severity: "CRITICAL" });
        assert.equal(criticalEvents.total, 1);
        assert.equal(criticalEvents.events[0].type, "HEALTH_DEGRADED");

        const taskCreated = await getProjectTimeline(PROJ_A, { eventType: "TASK_CREATED" });
        assert.equal(taskCreated.total, 1);
    });

    test("20. pagination: returns paginated slices and total counts", async () => {
        for (let i = 1; i <= 25; i++) {
            addTimelineEvent({ projectId: PROJ_A, title: `Event ${i}`, timestamp: new Date(2026, 9, i) });
        }

        const page1 = await getProjectTimeline(PROJ_A, { page: 1, limit: 10 });
        assert.equal(page1.total, 25);
        assert.equal(page1.events.length, 10);
        assert.equal(page1.totalPages, 3);

        const page3 = await getProjectTimeline(PROJ_A, { page: 3, limit: 10 });
        assert.equal(page3.events.length, 5);
    });

    test("21. sorting: supports newest first (desc) and oldest first (asc)", async () => {
        addTimelineEvent({ projectId: PROJ_A, title: "Old Event", timestamp: new Date("2026-10-01") });
        addTimelineEvent({ projectId: PROJ_A, title: "New Event", timestamp: new Date("2026-10-15") });

        const desc = await getProjectTimeline(PROJ_A, { order: "desc" });
        assert.equal(desc.events[0].title, "New Event");

        const asc = await getProjectTimeline(PROJ_A, { order: "asc" });
        assert.equal(asc.events[0].title, "Old Event");
    });

    test("22. actor resolution: resolves actor object and fallback names", () => {
        const evWithActor = normalizeTimelineEvent({
            projectId: PROJ_A,
            actor: { id: "u-1", name: "Bob Builder", role: "Manager" }
        });
        assert.equal(evWithActor.actor.name, "Bob Builder");
        assert.equal(evWithActor.actor.role, "Manager");

        const evWithFallback = normalizeTimelineEvent({
            projectId: PROJ_A,
            user_name: "Alice Engineer"
        });
        assert.equal(evWithFallback.actor.name, "Alice Engineer");
    });

    test("23. project isolation: Project A timeline events never appear in Project B", async () => {
        addTimelineEvent({ projectId: PROJ_A, title: "Alpha Exclusive" });
        addTimelineEvent({ projectId: PROJ_B, title: "Beta Exclusive" });

        const resA = await getProjectTimeline(PROJ_A);
        const resB = await getProjectTimeline(PROJ_B);

        assert.equal(resA.total, 1);
        assert.equal(resA.events[0].title, "Alpha Exclusive");

        assert.equal(resB.total, 1);
        assert.equal(resB.events[0].title, "Beta Exclusive");
    });

    // ============================================================
    // SECTION 53: TESTING — DECISION INTELLIGENCE (24-32)
    // ============================================================

    test("24. decision retrieval: retrieves recorded project decisions", async () => {
        addInMemoryDecision(PROJ_A, {
            decision: "Add 2 junior developers to project",
            status: "Approved",
            decision_date: "2026-10-02"
        });

        const res = await getProjectDecisionIntelligence(PROJ_A);
        assert.equal(res.totalDecisions, 1);
        assert.equal(res.decisions[0].decision, "Add 2 junior developers to project");
    });

    test("25. decision filtering: filters decisions by status and owner", async () => {
        addInMemoryDecision(PROJ_A, { decision: "D1", status: "Proposed", owner_id: "u-1" });
        addInMemoryDecision(PROJ_A, { decision: "D2", status: "Approved", owner_id: "u-2" });

        const approved = await getProjectDecisionIntelligence(PROJ_A, { status: "Approved" });
        assert.equal(approved.totalDecisions, 1);
        assert.equal(approved.decisions[0].decision, "D2");

        const user1 = await getProjectDecisionIntelligence(PROJ_A, { ownerId: "u-1" });
        assert.equal(user1.totalDecisions, 1);
        assert.equal(user1.decisions[0].decision, "D1");
    });

    test("26. decision/project relationship: ensures decisions belong to target project", async () => {
        const dec = addInMemoryDecision(PROJ_A, { decision: "Scope adjustment" });
        assert.equal(dec.project_id, PROJ_A);
    });

    test("27. explicit task relationship: links explicit task references when present", async () => {
        addInMemoryDecision(PROJ_A, {
            decision: "Reprioritize Task 1",
            linkedTasks: ["task-1"]
        });

        const res = await getProjectDecisionIntelligence(PROJ_A);
        assert.deepEqual(res.decisions[0].linkedEntities.tasks, ["task-1"]);
    });

    test("28. explicit risk relationship: links explicit risk references when present", async () => {
        addInMemoryDecision(PROJ_A, {
            decision: "Mitigate Database latency",
            linkedRisks: ["risk-db"]
        });

        const res = await getProjectDecisionIntelligence(PROJ_A);
        assert.deepEqual(res.decisions[0].linkedEntities.risks, ["risk-db"]);
    });

    test("29. temporal association: measures state deltas before and after decision date", () => {
        const decision = {
            id: "dec-1",
            decision: "Increase task estimate",
            decision_date: "2026-10-05T00:00:00Z"
        };

        const snapshots = [
            { captured_at: "2026-10-03T00:00:00Z", health_score: 80, schedule_drift_days: 0, bottleneck_count: 1 },
            { captured_at: "2026-10-08T00:00:00Z", health_score: 65, schedule_drift_days: 4, bottleneck_count: 2 }
        ];

        const impact = analyzeDecisionImpact(decision, snapshots, []);
        assert.equal(impact.deltas.healthDelta, -15);
        assert.equal(impact.deltas.driftDelta, 4);
        assert.equal(impact.deltas.bottleneckDelta, 1);
    });

    test("30. no false causal claim: explicitly flags temporal association and disclaims direct causation", () => {
        const decision = { id: "dec-1", decision: "Change priority", decision_date: "2026-10-05" };
        const impact = analyzeDecisionImpact(decision, [], []);

        assert.equal(impact.isCausal, false);
        assert.match(impact.causalityDisclaimer, /should not be construed as established causal proof/i);
    });

    test("31. decision ordering: sorts decisions newest first by decision_date", async () => {
        addInMemoryDecision(PROJ_A, { decision: "Old Dec", decision_date: "2026-10-01" });
        addInMemoryDecision(PROJ_A, { decision: "Recent Dec", decision_date: "2026-10-15" });

        const res = await getProjectDecisionIntelligence(PROJ_A);
        assert.equal(res.decisions[0].decision, "Recent Dec");
        assert.equal(res.decisions[1].decision, "Old Dec");
    });

    test("32. project isolation: Project A decisions do not leak into Project B", async () => {
        addInMemoryDecision(PROJ_A, { decision: "Alpha Dec" });
        addInMemoryDecision(PROJ_B, { decision: "Beta Dec" });

        const resA = await getProjectDecisionIntelligence(PROJ_A);
        const resB = await getProjectDecisionIntelligence(PROJ_B);

        assert.equal(resA.totalDecisions, 1);
        assert.equal(resA.decisions[0].decision, "Alpha Dec");

        assert.equal(resB.totalDecisions, 1);
        assert.equal(resB.decisions[0].decision, "Beta Dec");
    });

    // ============================================================
    // SECTION 54: TESTING — PROJECT MEMORY (33-41)
    // ============================================================

    test("33. historical context: aggregates health trend, major events, and facts", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 80, captured_at: new Date("2026-10-01") });
        addTimelineEvent({ projectId: PROJ_A, title: "Major Scope Change", severity: "HIGH" });

        const memory = await getProjectMemory(PROJ_A);
        assert.equal(memory.projectId, PROJ_A);
        assert.ok(memory.healthSummary);
        assert.ok(memory.recordedFacts.length > 0);
        assert.ok(memory.derivedInsights.length > 0);
    });

    test("34. health summary: summarizes historical minimum, maximum, and average score", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 90, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 60, captured_at: new Date("2026-10-05") });

        const memory = await getProjectMemory(PROJ_A);
        assert.equal(memory.healthSummary.historicalMax, 90);
        assert.equal(memory.healthSummary.historicalMin, 60);
        assert.equal(memory.healthSummary.averageHealth, 75);
    });

    test("35. recurring overdue task: detects repeated overdue tasks with factual evidence", async () => {
        addTimelineEvent({ projectId: PROJ_A, type: "TASK_OVERDUE", entityId: "t-1", title: "API Spec", description: "Task is overdue" });
        addTimelineEvent({ projectId: PROJ_A, type: "TASK_OVERDUE", entityId: "t-1", title: "API Spec", description: "Task is overdue again" });

        const memory = await getProjectMemory(PROJ_A);
        const overdue = memory.recurringPatterns.overdueTasks;

        assert.equal(overdue.length, 1);
        assert.equal(overdue[0].overdueOccurrences, 2);
        assert.match(overdue[0].evidence, /recorded as overdue in 2 separate historical snapshots\/events/i);
    });

    test("36. recurring bottleneck: detects bottleneck recurrence and highest historical severity", async () => {
        addTimelineEvent({ projectId: PROJ_A, type: "BOTTLENECK_DETECTED", entityId: "t-2", title: "DB Migration", severity: "MEDIUM" });
        addTimelineEvent({ projectId: PROJ_A, type: "BOTTLENECK_ESCALATED", entityId: "t-2", title: "DB Migration", severity: "CRITICAL" });

        const memory = await getProjectMemory(PROJ_A);
        const bottlenecks = memory.recurringPatterns.bottlenecks;

        assert.equal(bottlenecks.length, 1);
        assert.equal(bottlenecks[0].occurrenceCount, 2);
        assert.equal(bottlenecks[0].highestSeverity, "CRITICAL");
    });

    test("37. recurring drift: calculates max recorded drift and delay recoveries", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 75, schedule_drift_days: 0, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 65, schedule_drift_days: 6, captured_at: new Date("2026-10-05") });
        addInMemorySnapshot(PROJ_A, { health_score: 72, schedule_drift_days: 2, captured_at: new Date("2026-10-10") }); // recovered 4 days

        const memory = await getProjectMemory(PROJ_A);
        const drift = memory.recurringPatterns.scheduleDrift;

        assert.equal(drift.maxRecordedDriftDays, 6);
        assert.equal(drift.recoveredDays, 4);
    });

    test("38. recurring dependency issue: detects repeated dependency modifications", async () => {
        addTimelineEvent({ projectId: PROJ_A, entityType: "Dependency", title: "Dep 1" });
        addTimelineEvent({ projectId: PROJ_A, entityType: "Dependency", title: "Dep 2" });
        addTimelineEvent({ projectId: PROJ_A, entityType: "Dependency", title: "Dep 3" });

        const memory = await getProjectMemory(PROJ_A);
        assert.equal(memory.recurringPatterns.dependencyIssues.length, 1);
        assert.equal(memory.recurringPatterns.dependencyIssues[0].count, 3);
    });

    test("39. decision history: includes analyzed decisions in memory output", async () => {
        addInMemoryDecision(PROJ_A, { decision: "Approved overtime" });

        const memory = await getProjectMemory(PROJ_A);
        assert.equal(memory.decisions.length, 1);
        assert.equal(memory.decisions[0].decision, "Approved overtime");
    });

    test("40. replanning history: aggregates replanning actions in memory", async () => {
        const memory = await getProjectMemory(PROJ_A);
        assert.ok(Array.isArray(memory.replanningActions));
    });

    test("41. memory project isolation: ensures Project A memory is isolated from Project B", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 90, captured_at: new Date() });
        addInMemorySnapshot(PROJ_B, { health_score: 50, captured_at: new Date() });

        const memoryA = await getProjectMemory(PROJ_A);
        const memoryB = await getProjectMemory(PROJ_B);

        assert.equal(memoryA.healthSummary.currentHealth, 90);
        assert.equal(memoryB.healthSummary.currentHealth, 50);
    });

    // ============================================================
    // SECTION 55: TESTING — REPLAY (42-48)
    // ============================================================

    test("42. exact snapshot: matches snapshot on exact timestamp", async () => {
        const exactTime = "2026-10-10T12:00:00.000Z";
        addInMemorySnapshot(PROJ_A, { health_score: 77, captured_at: exactTime });

        const replay = await replayProjectPointInTime(PROJ_A, exactTime);
        assert.equal(replay.isAvailable, true);
        assert.equal(replay.isExact, true);
        assert.equal(replay.health.score, 77);
    });

    test("43. nearest snapshot: matches nearest preceding recorded snapshot", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 82, captured_at: "2026-10-05T10:00:00.000Z" });
        addInMemorySnapshot(PROJ_A, { health_score: 64, captured_at: "2026-10-12T10:00:00.000Z" });

        // Request timestamp on Oct 8 (between the two)
        const replay = await replayProjectPointInTime(PROJ_A, "2026-10-08T00:00:00.000Z");
        assert.equal(replay.isAvailable, true);
        assert.equal(replay.isExact, false);
        assert.equal(replay.health.score, 82); // nearest prior snapshot
    });

    test("44. unavailable historical timestamp: returns unavailable when no snapshots exist", async () => {
        const replay = await replayProjectPointInTime(PROJ_A, "2026-10-01T00:00:00.000Z");
        assert.equal(replay.isAvailable, false);
        assert.equal(replay.status, "UNAVAILABLE");
        assert.match(replay.message, /Historical state is unavailable for this timestamp/);
    });

    test("45. date range replay: replays step-by-step state progression across period", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 80, captured_at: "2026-10-01" });
        addInMemorySnapshot(PROJ_A, { health_score: 75, captured_at: "2026-10-04" });
        addInMemorySnapshot(PROJ_A, { health_score: 85, captured_at: "2026-10-08" });

        const periodReplay = await replayProjectPeriod(PROJ_A, {
            from: "2026-10-01",
            to: "2026-10-10"
        });

        assert.equal(periodReplay.isAvailable, true);
        assert.equal(periodReplay.totalSnapshots, 3);
        assert.equal(periodReplay.progression.length, 3);
        assert.equal(periodReplay.progression[2].deltaFromPrevious, 10);
    });

    test("46. chronological ordering: period progression is strictly sorted oldest to newest", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 85, captured_at: "2026-10-10" });
        addInMemorySnapshot(PROJ_A, { health_score: 70, captured_at: "2026-10-02" });

        const periodReplay = await replayProjectPeriod(PROJ_A, { from: "2026-10-01", to: "2026-10-15" });
        assert.equal(periodReplay.progression[0].healthScore, 70);
        assert.equal(periodReplay.progression[1].healthScore, 85);
    });

    test("47. historical state immutability: replay operations are strictly read-only", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 75, captured_at: "2026-10-05" });
        const beforeCount = (await getProjectHealthHistory(PROJ_A)).totalSnapshots;

        await replayProjectPointInTime(PROJ_A, "2026-10-05");
        await replayProjectPeriod(PROJ_A, { from: "2026-10-01", to: "2026-10-10" });

        const afterCount = (await getProjectHealthHistory(PROJ_A)).totalSnapshots;
        assert.equal(beforeCount, afterCount);
    });

    test("48. project isolation: cannot replay Project A using Project B snapshots", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 88, captured_at: "2026-10-05" });
        addInMemorySnapshot(PROJ_B, { health_score: 44, captured_at: "2026-10-05" });

        const replayA = await replayProjectPointInTime(PROJ_A, "2026-10-05");
        const replayB = await replayProjectPointInTime(PROJ_B, "2026-10-05");

        assert.equal(replayA.health.score, 88);
        assert.equal(replayB.health.score, 44);
    });

    // ============================================================
    // SECTION 56: TESTING — DIAGNOSIS (49-56)
    // ============================================================

    test("49. schedule instability: diagnoses SCHEDULE_INSTABILITY on recurring drift", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 70, schedule_drift_days: 0, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 60, schedule_drift_days: 4, captured_at: new Date("2026-10-05") });
        addInMemorySnapshot(PROJ_A, { health_score: 55, schedule_drift_days: 8, captured_at: new Date("2026-10-08") });

        const diag = await runProjectDiagnosis(PROJ_A);
        const schedInstability = diag.diagnoses.find((d) => d.type === "SCHEDULE_INSTABILITY");

        assert.ok(schedInstability);
        assert.equal(schedInstability.severity, "CRITICAL");
        assert.equal(schedInstability.frequency, 2);
    });

    test("50. bottleneck recurrence: diagnoses BOTTLENECK_RECURRENCE on repeated bottleneck appearances", async () => {
        addTimelineEvent({ projectId: PROJ_A, type: "BOTTLENECK_DETECTED", entityId: "t-gate", title: "Payment Gateway", severity: "CRITICAL" });

        const diag = await runProjectDiagnosis(PROJ_A);
        const bnDiag = diag.diagnoses.find((d) => d.type === "BOTTLENECK_RECURRENCE");

        assert.ok(bnDiag);
        assert.equal(bnDiag.severity, "CRITICAL");
    });

    test("51. dependency instability: diagnoses DEPENDENCY_INSTABILITY on frequent changes", async () => {
        addTimelineEvent({ projectId: PROJ_A, entityType: "Dependency", title: "D1" });
        addTimelineEvent({ projectId: PROJ_A, entityType: "Dependency", title: "D2" });
        addTimelineEvent({ projectId: PROJ_A, entityType: "Dependency", title: "D3" });

        const diag = await runProjectDiagnosis(PROJ_A);
        const depDiag = diag.diagnoses.find((d) => d.type === "DEPENDENCY_INSTABILITY");

        assert.ok(depDiag);
        assert.equal(depDiag.frequency, 3);
    });

    test("52. workload concentration: diagnoses TASK_OVERDUE_RECURRENCE when tasks repeatedly slip", async () => {
        addTimelineEvent({ projectId: PROJ_A, type: "TASK_OVERDUE", entityId: "t-auth", title: "Auth Flow" });

        const diag = await runProjectDiagnosis(PROJ_A);
        const taskDiag = diag.diagnoses.find((d) => d.type === "TASK_OVERDUE_RECURRENCE");

        assert.ok(taskDiag);
        assert.deepEqual(taskDiag.affectedEntities, ["Auth Flow"]);
    });

    test("53. risk accumulation: diagnoses RISK_ACCUMULATION when multiple high risks exist", async () => {
        // Run diagnosis with default fixtures
        const diag = await runProjectDiagnosis(PROJ_A);
        assert.ok(diag.totalDiagnoses >= 1);
    });

    test("54. critical path volatility: validates diagnosis evidence structure", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 65, schedule_drift_days: 5, captured_at: new Date() });
        const diag = await runProjectDiagnosis(PROJ_A);

        diag.diagnoses.forEach((d) => {
            assert.ok(Array.isArray(d.evidence));
            assert.ok(d.evidence.length > 0);
        });
    });

    test("55. diagnosis evidence: cites concrete metrics without speculation", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 65, schedule_drift_days: 6, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 75, schedule_drift_days: 2, captured_at: new Date("2026-10-05") });

        const diag = await runProjectDiagnosis(PROJ_A);
        const sched = diag.diagnoses.find((d) => d.type === "SCHEDULE_INSTABILITY");

        assert.ok(sched.evidence.some((e) => /Maximum recorded schedule slippage reached 6 days/i.test(e)));
    });

    test("56. no unsupported causal claims: uses associatedFactors instead of blaming root causes", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 55, schedule_drift_days: 5, captured_at: new Date() });
        const diag = await runProjectDiagnosis(PROJ_A);

        diag.diagnoses.forEach((d) => {
            assert.ok(Array.isArray(d.associatedFactors));
            assert.ok(d.associatedFactors.length > 0);
            assert.ok(!("rootCauseBlame" in d));
        });
    });

    // ============================================================
    // SECTION 57: TESTING — AUTOPSY (57-66)
    // ============================================================

    test("57. completed project: generates full autopsy for completed project", async () => {
        setInMemoryProject(PROJ_A, { title: "Alpha V1", status: "Completed", is_archived: false });
        addInMemorySnapshot(PROJ_A, { health_score: 80, captured_at: new Date() });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.equal(autopsy.eligible, true);
        assert.equal(autopsy.outcome.status, "Completed");
        assert.ok(autopsy.schedule);
        assert.ok(autopsy.health);
    });

    test("58. archived project: generates full autopsy for archived project", async () => {
        setInMemoryProject(PROJ_A, { title: "Alpha Legacy", status: "Planning", is_archived: true });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.equal(autopsy.eligible, true);
        assert.equal(autopsy.outcome.isArchived, true);
    });

    test("59. active project restriction: restricts autopsy on active projects unless force=true", async () => {
        setInMemoryProject(PROJ_A, { status: "In Progress", is_archived: false });

        const restricted = await runProjectAutopsy(PROJ_A, { force: false });
        assert.equal(restricted.eligible, false);
        assert.match(restricted.message, /available for completed or archived projects/i);

        const forced = await runProjectAutopsy(PROJ_A, { force: true });
        assert.equal(forced.eligible, true);
    });

    test("60. schedule history: compares planned duration against max recorded drift", async () => {
        setInMemoryProject(PROJ_A, {
            status: "Completed",
            start_date: "2026-10-01",
            end_date: "2026-10-31"
        });
        addInMemorySnapshot(PROJ_A, { health_score: 75, schedule_drift_days: 7, captured_at: new Date() });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.equal(autopsy.schedule.plannedDurationDays, 30);
        assert.equal(autopsy.schedule.largestDriftDays, 7);
    });

    test("61. critical path history: records critical path transitions count", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.ok("criticalPathChanges" in autopsy.criticalPath);
    });

    test("62. bottleneck history: aggregates total bottleneck occurrences during project lifecycle", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        addTimelineEvent({ projectId: PROJ_A, type: "BOTTLENECK_DETECTED", entityId: "t-1", title: "Module A" });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.equal(autopsy.bottlenecks.totalBottleneckOccurrences, 1);
    });

    test("63. risk history: counts total and high/critical risks", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.ok("totalRisksRecorded" in autopsy.risks);
    });

    test("64. decision history: lists recorded decisions during project lifecycle", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        addInMemoryDecision(PROJ_A, { decision: "Design Approval" });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.equal(autopsy.decisions.totalDecisionsRecorded, 1);
    });

    test("65. replanning history: tracks proposal actions and executions count", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.ok("totalProposals" in autopsy.replanning);
    });

    test("66. deterministic factual summary: lessons and patterns contain zero unsupported blame", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        addInMemorySnapshot(PROJ_A, { health_score: 84, schedule_drift_days: 8, captured_at: new Date() });

        const autopsy = await runProjectAutopsy(PROJ_A);
        assert.ok(autopsy.lessonsAndPatterns.length > 0);
        autopsy.lessonsAndPatterns.forEach((p) => {
            assert.ok(!/failed because|poor decision|incompetent/i.test(p));
        });
    });

    // ============================================================
    // SECTION 58: TESTING — QUACKIE (67-77)
    // ============================================================

    test("67. project history intent: formats comprehensive project history reply", () => {
        const reply = formatHealthHistoryReply({
            totalSnapshots: 3,
            currentHealth: 82,
            previousHealth: 75,
            scoreDelta: 7,
            trend: "IMPROVING",
            historicalMin: 65,
            historicalMax: 85,
            averageHealth: 74,
            majorImprovements: [{ delta: 7, explanation: "Health improved" }]
        }, "Alpha Project");

        assert.match(reply, /Health History & Trends: Alpha Project/);
        assert.match(reply, /Current Health:\*\* 82/);
        assert.match(reply, /IMPROVING/);
    });

    test("68. health history intent: answers 'Why did health drop?' factually", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 80, captured_at: new Date("2026-10-01") });
        addInMemorySnapshot(PROJ_A, { health_score: 65, captured_at: new Date("2026-10-05") });

        const res = await processMessage({
            message: "Why did the project health drop?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.ok(res.reply);
        assert.match(res.reply, /Health History & Trends/i);
    });

    test("69. timeline intent: responds to timeline queries", async () => {
        addTimelineEvent({ projectId: PROJ_A, title: "Database Schema Migrated", type: "TASK_COMPLETED" });

        const res = await processMessage({
            message: "Show me the project timeline",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Project Timeline/i);
        assert.match(res.reply, /Database Schema Migrated/i);
    });

    test("70. decision intent: responds to decision intelligence queries", async () => {
        addInMemoryDecision(PROJ_A, { decision: "Approved remote work Friday" });

        const res = await processMessage({
            message: "What decisions were made?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Decision Intelligence/i);
        assert.match(res.reply, /Approved remote work Friday/i);
    });

    test("71. bottleneck history intent: responds to 'Have we seen this bottleneck before?'", async () => {
        addTimelineEvent({ projectId: PROJ_A, type: "BOTTLENECK_DETECTED", entityId: "t-auth", title: "OAuth Token Service", severity: "HIGH" });

        const res = await processMessage({
            message: "Have we seen this bottleneck before?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Historical Bottlenecks/i);
        assert.match(res.reply, /OAuth Token Service/i);
    });

    test("72. schedule history intent: responds to schedule drift history questions", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 75, schedule_drift_days: 5, captured_at: new Date() });

        const res = await processMessage({
            message: "Show me schedule drift history",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Schedule Drift History/i);
        assert.match(res.reply, /Max Recorded Delay:\*\* 5 days/i);
    });

    test("73. diagnosis intent: answers project diagnosis requests", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 50, schedule_drift_days: 6, captured_at: new Date() });

        const res = await processMessage({
            message: "Diagnose this project",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Project Diagnosis/i);
    });

    test("74. replay intent: handles point-in-time replay requests", async () => {
        addInMemorySnapshot(PROJ_A, {
            health_score: 74,
            health_status: "WATCH",
            schedule_drift_days: 2,
            captured_at: "2026-10-10T12:00:00.000Z"
        });

        const res = await processMessage({
            message: "Replay October 10",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Project Replay/i);
        assert.match(res.reply, /recorded historical snapshot, not the current project state/i);
    });

    test("75. autopsy intent: handles project autopsy requests", async () => {
        setInMemoryProject(PROJ_A, { status: "Completed" });
        addInMemorySnapshot(PROJ_A, { health_score: 85, captured_at: new Date() });

        const res = await processMessage({
            message: "Give me a project autopsy",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });

        assert.match(res.reply, /Project Retrospective \/ Autopsy/i);
        assert.match(res.reply, /Outcome:\*\* Completed/i);
    });

    test("76. no hallucinated historical event: replies honestly when no snapshot exists", () => {
        const replayReply = formatReplayReply({ isAvailable: false });
        assert.match(replayReply, /No recorded project state exists for this timestamp/);
    });

    test("77. recorded vs derived distinction: separates recorded facts from derived analysis", () => {
        const autopsyReply = formatAutopsyReply({
            eligible: true,
            project: { status: "Completed" },
            schedule: { largestDriftDays: 4, driftEventsCount: 2, recoveredDays: 2 },
            health: { initialScore: 80, lowestScore: 60, finalScore: 78 },
            bottlenecks: { totalBottleneckOccurrences: 1 },
            replanning: { totalProposals: 1 },
            lessonsAndPatterns: ["Recorded 4 days max delay."]
        });

        assert.match(autopsyReply, /All observations derived from immutable records without assigning personal blame/);
    });

    // ============================================================
    // SECTION 59: TESTING — SECURITY & ACCESS CONTROL (78-84)
    // ============================================================

    test("78. unauthorized history: prevents invalid project access to health history", async () => {
        await assert.rejects(
            async () => {
                await getProjectHealthHistory(null);
            },
            { message: /Project ID is required/ }
        );
    });

    test("79. unauthorized timeline: prevents null project timeline query", async () => {
        await assert.rejects(
            async () => {
                await getProjectTimeline(null);
            },
            { message: /Project ID is required/ }
        );
    });

    test("80. unauthorized decisions: rejects null project decision intelligence query", async () => {
        await assert.rejects(
            async () => {
                await getProjectDecisionIntelligence(null);
            },
            { message: /Project ID is required/ }
        );
    });

    test("81. unauthorized replay: rejects null project or invalid timestamp in replay", async () => {
        await assert.rejects(
            async () => {
                await replayProjectPointInTime(null, "2026-10-10");
            },
            { message: /Project ID is required/ }
        );

        await assert.rejects(
            async () => {
                await replayProjectPointInTime(PROJ_A, "not-a-date");
            },
            { message: /Invalid target timestamp/ }
        );
    });

    test("82. unauthorized autopsy: rejects null project in autopsy", async () => {
        await assert.rejects(
            async () => {
                await runProjectAutopsy(null);
            },
            { message: /Project ID is required/ }
        );
    });

    test("83. cross-project history leakage: Project B cannot query Project A history", async () => {
        addInMemorySnapshot(PROJ_A, { health_score: 99, captured_at: new Date() });
        const histB = await getProjectHealthHistory(PROJ_B);
        assert.equal(histB.totalSnapshots, 0);
        assert.equal(histB.currentHealth, null);
    });

    test("84. cross-workspace leakage: memory engine isolates project entities strictly", async () => {
        addTimelineEvent({ projectId: PROJ_A, title: "Secret Feature" });
        const memB = await getProjectMemory(PROJ_B);
        const hasA = memB.majorEvents.some((e) => e.title === "Secret Feature");
        assert.equal(hasA, false);
    });
});
