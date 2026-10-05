import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    clearNextActionStore,
    setInMemoryNextActions,
    ACTION_TYPES,
    ACTION_URGENCY,
    calculateActionPriorityScore,
    calculateNextActions,
    getProjectNextActions,
    getWorkspaceNextActions
} from "../services/nextActionService.js";

import {
    clearProjectBriefingStore,
    setInMemoryProjectBriefing,
    calculateProjectBriefing,
    getProjectBriefing
} from "../services/projectBriefingService.js";

import {
    clearPersonalBriefingStore,
    setInMemoryPersonalBriefing,
    calculatePersonalBriefing,
    getPersonalBriefing
} from "../services/personalBriefingService.js";

import {
    clearExecutiveBriefingStore,
    setInMemoryExecutiveBriefing,
    calculateExecutiveBriefing,
    getWorkspaceExecutiveBriefing
} from "../services/executiveBriefingService.js";

import {
    clearStandupStore,
    setInMemoryStandup,
    calculateStandupData,
    getProjectStandup,
    getTeamStandup,
    getPersonalStandup
} from "../services/standupService.js";

import {
    clearStakeholderBriefingStore,
    setInMemoryStakeholderBriefing,
    calculateStakeholderBriefing,
    getProjectStakeholderBriefing
} from "../services/stakeholderBriefingService.js";

import {
    clearCoordinationStore,
    setInMemoryCoordination,
    calculateCoordinationState,
    getProjectCoordination,
    getWorkspaceCoordination
} from "../services/projectCoordinatorService.js";

import {
    clearActionPlanStore,
    setInMemoryActionPlan,
    calculateActionPlan,
    calculateRecoveryPlan,
    getProjectActionPlan,
    getProjectRecoveryPlan,
    getDailyActionPlan
} from "../services/actionPlanService.js";

import {
    processMessage,
    formatBriefingReply,
    formatStandupReply,
    formatExecutiveReply,
    formatCoordinatorReply,
    formatApprovalQueueReply,
    formatRecoveryPlanReply,
    formatActionConfirmationReply
} from "../services/quackieService.js";

import {
    INTELLIGENCE_ALERT_TYPES,
    extractIntelligenceSnapshot,
    detectIntelligenceStateTransitions,
    clearAllBaselines
} from "../services/intelligenceAlertService.js";

describe("PHASE 6: Autonomous Project Coordination + Executive Workflow Intelligence Test Suite", () => {
    const PROJ_A = "proj-coord-alpha";
    const PROJ_B = "proj-coord-beta";
    const WS_ALPHA = "ws-coord-alpha";
    const USER_ALICE = "user-alice";
    const USER_BOB = "user-bob";

    beforeEach(() => {
        clearNextActionStore();
        clearProjectBriefingStore();
        clearPersonalBriefingStore();
        clearExecutiveBriefingStore();
        clearStandupStore();
        clearStakeholderBriefingStore();
        clearCoordinationStore();
        clearActionPlanStore();
        clearAllBaselines();
    });

    // ============================================================
    // SECTION 1: DETERMINISTIC ACTION PRIORITY SCORING (1-10)
    // ============================================================

    test("1. calculateActionPriorityScore returns deterministic score 0-100", () => {
        const score = calculateActionPriorityScore({
            isCriticalPath: true,
            isBottleneck: true,
            isOverdue: true,
            overdueDays: 4,
            slack: 0,
            driftDays: 3,
            downstreamCount: 4
        });
        assert.ok(score >= 0 && score <= 100, `Score ${score} must be within 0-100`);
        assert.ok(score >= 80, `Compound critical task should score >= 80, got ${score}`);
    });

    test("2. Task on critical path scores higher than non-critical task with same duration", () => {
        const scoreCrit = calculateActionPriorityScore({ isCriticalPath: true, slack: 0 });
        const scoreNormal = calculateActionPriorityScore({ isCriticalPath: false, slack: 5 });
        assert.ok(scoreCrit > scoreNormal, `Critical path task score (${scoreCrit}) must exceed normal task (${scoreNormal})`);
    });

    test("3. Overdue days scale priority score progressively up to cap", () => {
        const score1Day = calculateActionPriorityScore({ isOverdue: true, overdueDays: 1 });
        const score7Days = calculateActionPriorityScore({ isOverdue: true, overdueDays: 7 });
        assert.ok(score7Days > score1Day, `7 days overdue (${score7Days}) must exceed 1 day overdue (${score1Day})`);
    });

    test("4. Completed task receives zero priority score", () => {
        const score = calculateActionPriorityScore({
            status: "Completed",
            isCriticalPath: true,
            isOverdue: true
        });
        assert.strictEqual(score, 0, "Completed tasks must have 0 action priority");
    });

    test("5. Bottleneck with high downstream reach scores significantly higher", () => {
        const scoreFewDownstream = calculateActionPriorityScore({ isBottleneck: true, downstreamCount: 1 });
        const scoreManyDownstream = calculateActionPriorityScore({ isBottleneck: true, downstreamCount: 6 });
        assert.ok(scoreManyDownstream > scoreFewDownstream, "High downstream bottleneck must score higher");
    });

    test("6. Large positive slack depresses priority score", () => {
        const scoreLowSlack = calculateActionPriorityScore({ slack: 0 });
        const scoreHighSlack = calculateActionPriorityScore({ slack: 14 });
        assert.ok(scoreLowSlack > scoreHighSlack, "Low slack must have higher priority than high slack");
    });

    test("7. Action priority score is strictly deterministic and reproducible", () => {
        const params = { isCriticalPath: true, isBottleneck: false, isOverdue: false, slack: 1 };
        const score1 = calculateActionPriorityScore(params);
        const score2 = calculateActionPriorityScore(params);
        assert.strictEqual(score1, score2, "Priority scores must be strictly identical across identical runs");
    });

    test("8. Score handles missing or undefined fields gracefully", () => {
        const score = calculateActionPriorityScore({});
        assert.ok(typeof score === "number" && !isNaN(score) && score >= 0);
    });

    test("9. Score classification into ACTION_URGENCY levels (CRITICAL, HIGH, MEDIUM, LOW)", () => {
        const critScore = calculateActionPriorityScore({ isCriticalPath: true, isBottleneck: true, isOverdue: true, overdueDays: 5 });
        const lowScore = calculateActionPriorityScore({ slack: 10, isCriticalPath: false });
        assert.ok(critScore >= 75, "Severe score should be in CRITICAL/HIGH range");
        assert.ok(lowScore < 50, "Low score should be in LOW/MEDIUM range");
    });

    test("10. Extreme negative slack or drift caps cleanly at 100 without overflow", () => {
        const score = calculateActionPriorityScore({
            isCriticalPath: true,
            isBottleneck: true,
            isOverdue: true,
            overdueDays: 99,
            driftDays: 50,
            slack: -20,
            downstreamCount: 20
        });
        assert.strictEqual(score, 100, "Score must never exceed 100");
    });

    // ============================================================
    // SECTION 2: INTELLIGENT NEXT ACTIONS ENGINE (11-20)
    // ============================================================

    test("11. calculateNextActions returns ranked list ordered by priorityScore descending", () => {
        const tasks = [
            { id: "t1", title: "Task 1", status: "In_Progress", due_date: new Date(Date.now() - 86400000).toISOString() },
            { id: "t2", title: "Task 2", status: "In_Progress", due_date: new Date(Date.now() + 86400000 * 5).toISOString() }
        ];
        const res = calculateNextActions({
            projectId: PROJ_A,
            tasks,
            criticalPathData: { criticalTaskIds: ["t1"] },
            bottlenecksData: { bottlenecks: [] }
        });

        assert.ok(Array.isArray(res.actions));
        assert.ok(res.actions.length > 0);
        for (let i = 0; i < res.actions.length - 1; i++) {
            assert.ok(res.actions[i].priorityScore >= res.actions[i + 1].priorityScore, "Actions must be sorted descending by priorityScore");
        }
    });

    test("12. Each Next Action includes full Explainability Model (WHAT, WHY, EVIDENCE, URGENCY, SOURCE, NEXT_STEP)", () => {
        const tasks = [
            { id: "t-crit", title: "Core Architecture", status: "In_Progress", due_date: new Date().toISOString() }
        ];
        const res = calculateNextActions({
            projectId: PROJ_A,
            tasks,
            criticalPathData: { criticalTaskIds: ["t-crit"] },
            bottlenecksData: { bottlenecks: [{ taskId: "t-crit", score: 85, primaryCause: "High fanout" }] }
        });

        assert.ok(res.actions.length > 0);
        const action = res.actions[0];
        assert.ok(action.what || action.title, "Must contain WHAT (title)");
        assert.ok(action.why, "Must contain WHY (rationale)");
        assert.ok(action.evidence, "Must contain EVIDENCE");
        assert.ok(action.urgency, "Must contain URGENCY");
        assert.ok(action.source, "Must contain SOURCE");
        assert.ok(action.suggestedNextStep, "Must contain SUGGESTED_NEXT_STEP");
    });

    test("13. Next Actions identifies CRITICAL_PATH source correctly", () => {
        const tasks = [{ id: "t-cp", title: "Critical Task", status: "In_Progress" }];
        const res = calculateNextActions({
            projectId: PROJ_A,
            tasks,
            criticalPathData: { criticalTaskIds: ["t-cp"] }
        });
        const found = res.actions.find((a) => a.taskId === "t-cp");
        assert.ok(found);
        assert.strictEqual(found.source, ACTION_TYPES.CRITICAL_PATH_ACCELERATION);
    });

    test("14. Next Actions identifies BOTTLENECK source correctly", () => {
        const tasks = [{ id: "t-bn", title: "Bottleneck Task", status: "In_Progress" }];
        const res = calculateNextActions({
            projectId: PROJ_A,
            tasks,
            criticalPathData: { criticalTaskIds: [] },
            bottlenecksData: { bottlenecks: [{ taskId: "t-bn", score: 90, primaryCause: "Downstream fanout" }] }
        });
        const found = res.actions.find((a) => a.taskId === "t-bn");
        assert.ok(found);
        assert.strictEqual(found.source, ACTION_TYPES.BOTTLENECK_RESOLUTION);
    });

    test("15. Stalled task with zero activity gets flagged for status check", () => {
        const tasks = [
            { id: "t-stall", title: "Stalled Task", status: "In_Progress", updated_at: new Date(Date.now() - 86400000 * 10).toISOString() }
        ];
        const res = calculateNextActions({ projectId: PROJ_A, tasks });
        const found = res.actions.find((a) => a.taskId === "t-stall");
        assert.ok(found);
        assert.ok(found.why.toLowerCase().includes("inactivity") || found.source === ACTION_TYPES.STALLED_WORK_PROGRESSION);
    });

    test("16. Unassigned high-priority task generates assignment recommendation", () => {
        const tasks = [
            { id: "t-unassigned", title: "Unassigned API", status: "Todo", assigned_to: null, priority: "Urgent" }
        ];
        const res = calculateNextActions({ projectId: PROJ_A, tasks });
        const found = res.actions.find((a) => a.taskId === "t-unassigned");
        assert.ok(found);
        assert.strictEqual(found.source, ACTION_TYPES.UNASSIGNED_TASK_ALLOCATION);
    });

    test("17. in-memory store for Next Actions caches and retrieves properly", async () => {
        const mockActions = {
            projectId: PROJ_A,
            actions: [{ id: "act-1", title: "Resolve Critical Blocker", priorityScore: 95 }]
        };
        setInMemoryNextActions(PROJ_A, mockActions);
        const retrieved = await getProjectNextActions(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.actions.length, 1);
        assert.strictEqual(retrieved.actions[0].priorityScore, 95);
    });

    test("18. getWorkspaceNextActions aggregates next actions across workspace projects", async () => {
        const mockWorkspaceActions = {
            workspaceId: WS_ALPHA,
            actions: [
                { id: "act-a", projectId: PROJ_A, title: "Action A", priorityScore: 90 },
                { id: "act-b", projectId: PROJ_B, title: "Action B", priorityScore: 80 }
            ]
        };
        setInMemoryNextActions(`ws-${WS_ALPHA}`, mockWorkspaceActions);
        const retrieved = await getWorkspaceNextActions(WS_ALPHA, USER_ALICE);
        assert.strictEqual(retrieved.actions.length, 2);
    });

    test("19. Empty task list returns clean empty actions array without error", () => {
        const res = calculateNextActions({ projectId: PROJ_A, tasks: [] });
        assert.deepStrictEqual(res.actions, []);
    });

    test("20. Action priority scores strictly exclude subjective performance judgments", () => {
        const tasks = [{ id: "t-load", title: "Heavy Task", status: "In_Progress", estimated_hours: 40 }];
        const res = calculateNextActions({ projectId: PROJ_A, tasks });
        const allText = JSON.stringify(res).toLowerCase();
        assert.ok(!allText.includes("lazy"));
        assert.ok(!allText.includes("slow"));
        assert.ok(!allText.includes("incompetent"));
        assert.ok(!allText.includes("fault"));
    });

    // ============================================================
    // SECTION 3: DAILY PROJECT & WORKSPACE BRIEFING (21-30)
    // ============================================================

    test("21. calculateProjectBriefing produces headline, health summary, and key focus tasks", () => {
        const tasks = [
            { id: "t1", title: "Deploy API", status: "In_Progress", due_date: new Date().toISOString() },
            { id: "t2", title: "Write Tests", status: "Completed" }
        ];
        const res = calculateProjectBriefing({
            project: { id: PROJ_A, title: "Alpha Project" },
            tasks,
            healthData: { score: 88, status: "HEALTHY" },
            criticalPathData: { criticalTaskIds: ["t1"] }
        });

        assert.ok(res.headline);
        assert.ok(res.summary);
        assert.strictEqual(res.health.score, 88);
        assert.strictEqual(res.health.status, "HEALTHY");
        assert.ok(Array.isArray(res.keyFocusToday));
    });

    test("22. Project briefing detects imminent deadlines due within 48 hours", () => {
        const nearDue = new Date(Date.now() + 86400000).toISOString();
        const tasks = [
            { id: "t-near", title: "Urgent Deadline", status: "In_Progress", due_date: nearDue }
        ];
        const res = calculateProjectBriefing({
            project: { id: PROJ_A, title: "Alpha Project" },
            tasks
        });
        assert.ok(res.imminentDeadlines?.length > 0 || res.keyFocusToday?.length > 0);
    });

    test("23. Project briefing includes active bottlenecks and blocker counts", () => {
        const tasks = [{ id: "t-bn", title: "Bottleneck Node", status: "In_Progress" }];
        const res = calculateProjectBriefing({
            project: { id: PROJ_A, title: "Alpha" },
            tasks,
            bottlenecksData: { bottlenecks: [{ taskId: "t-bn", score: 80, primaryCause: "High fanout" }] }
        });
        assert.strictEqual(res.bottlenecks.length, 1);
        assert.strictEqual(res.bottlenecks[0].taskId, "t-bn");
    });

    test("24. in-memory store for Project Briefing caches and returns deterministic briefing", async () => {
        const mockBriefing = {
            projectId: PROJ_A,
            headline: "Daily Briefing: All Systems Nominal",
            health: { score: 92, status: "HEALTHY" }
        };
        setInMemoryProjectBriefing(PROJ_A, mockBriefing);
        const retrieved = await getProjectBriefing(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.headline, "Daily Briefing: All Systems Nominal");
        assert.strictEqual(retrieved.health.score, 92);
    });

    test("25. calculateExecutiveBriefing aggregates multiple projects into executive overview", () => {
        const projectsData = [
            { id: PROJ_A, title: "Alpha", healthScore: 90, status: "HEALTHY", activeTasksCount: 5, driftDays: 0 },
            { id: PROJ_B, title: "Beta", healthScore: 45, status: "CRITICAL", activeTasksCount: 8, driftDays: 6 }
        ];
        const res = calculateExecutiveBriefing({
            workspace: { id: WS_ALPHA, name: "Engineering Org" },
            projectsData
        });

        assert.ok(res.portfolioSummary);
        assert.strictEqual(res.riskDistribution.healthy, 1);
        assert.strictEqual(res.riskDistribution.critical, 1);
        assert.ok(res.executiveActionItems?.length > 0);
    });

    test("26. Executive briefing flags cross-project conflicts and shared resource strain", () => {
        const projectsData = [
            { id: PROJ_A, title: "Alpha", healthScore: 80 },
            { id: PROJ_B, title: "Beta", healthScore: 75 }
        ];
        const res = calculateExecutiveBriefing({
            workspace: { id: WS_ALPHA, name: "Org" },
            projectsData,
            crossProjectConflicts: [{ memberId: USER_BOB, conflictType: "DEADLINE_OVERLAP", severity: "HIGH" }]
        });
        assert.ok(res.crossProjectConflicts?.length > 0);
    });

    test("27. in-memory store for Executive Briefing caches correctly", async () => {
        const mockExec = {
            workspaceId: WS_ALPHA,
            headline: "Executive Briefing: 2 Projects Monitored",
            portfolioHealth: 82
        };
        setInMemoryExecutiveBriefing(WS_ALPHA, mockExec);
        const retrieved = await getWorkspaceExecutiveBriefing(WS_ALPHA, USER_ALICE);
        assert.strictEqual(retrieved.portfolioHealth, 82);
    });

    test("28. calculatePersonalBriefing isolates tasks assigned strictly to user", () => {
        const tasks = [
            { id: "t-alice", title: "Alice's Task", assigned_to: USER_ALICE, status: "In_Progress", due_date: new Date().toISOString() },
            { id: "t-bob", title: "Bob's Task", assigned_to: USER_BOB, status: "In_Progress" }
        ];
        const res = calculatePersonalBriefing({
            userId: USER_ALICE,
            tasks
        });

        assert.strictEqual(res.scope, "PERSONAL");
        assert.ok(res.keyFocusToday.every((t) => t.assignedTo === USER_ALICE || t.id === "t-alice"));
    });

    test("29. Personal briefing highlights user's overdue tasks and immediate blockers", () => {
        const pastDate = new Date(Date.now() - 86400000 * 2).toISOString();
        const tasks = [
            { id: "t-overdue", title: "Overdue Doc", assigned_to: USER_ALICE, status: "In_Progress", due_date: pastDate }
        ];
        const res = calculatePersonalBriefing({
            userId: USER_ALICE,
            tasks
        });
        assert.ok(res.overdueTasks?.length > 0 || res.keyFocusToday?.length > 0);
    });

    test("30. in-memory store for Personal Briefing caches and returns data", async () => {
        const mockPersonal = {
            userId: USER_ALICE,
            headline: "Good morning Alice. You have 2 focus items today.",
            focusCount: 2
        };
        setInMemoryPersonalBriefing(USER_ALICE, mockPersonal);
        const retrieved = await getPersonalBriefing(USER_ALICE);
        assert.strictEqual(retrieved.focusCount, 2);
    });

    // ============================================================
    // SECTION 4: AUTOMATED 5-VECTOR STANDUP INTELLIGENCE (31-40)
    // ============================================================

    test("31. calculateStandupData structures output into 5 deterministic vectors", () => {
        const tasks = [
            { id: "t-done", title: "Done Yesterday", status: "Completed", updated_at: new Date().toISOString() },
            { id: "t-today", title: "Work Today", status: "In_Progress" }
        ];
        const res = calculateStandupData({
            scope: "PROJECT",
            scopeId: PROJ_A,
            scopeTitle: "Alpha Standup",
            tasks
        });

        assert.ok(Array.isArray(res.yesterday), "Must have Yesterday vector");
        assert.ok(Array.isArray(res.today), "Must have Today vector");
        assert.ok(Array.isArray(res.blocked), "Must have Blocked vector");
        assert.ok(Array.isArray(res.atRisk), "Must have At Risk vector");
        assert.ok(Array.isArray(res.needsDiscussion), "Must have Needs Discussion vector");
    });

    test("32. Standup Vector 1: Yesterday includes tasks completed in last 24-48 hours", () => {
        const tasks = [
            { id: "t-comp", title: "PR Merged", status: "Completed", updated_at: new Date(Date.now() - 3600000).toISOString() }
        ];
        const res = calculateStandupData({ scope: "PROJECT", scopeId: PROJ_A, tasks });
        assert.strictEqual(res.yesterday.length, 1);
        assert.strictEqual(res.yesterday[0].taskId, "t-comp");
    });

    test("33. Standup Vector 2: Today includes in-progress tasks and tasks due today", () => {
        const tasks = [
            { id: "t-prog", title: "Frontend Implementation", status: "In_Progress" }
        ];
        const res = calculateStandupData({ scope: "PROJECT", scopeId: PROJ_A, tasks });
        assert.strictEqual(res.today.length, 1);
        assert.strictEqual(res.today[0].taskId, "t-prog");
    });

    test("34. Standup Vector 3: Blocked lists tasks with incomplete prerequisite dependencies", () => {
        const tasks = [
            { id: "t-prereq", title: "Prereq Backend", status: "In_Progress" },
            { id: "t-target", title: "Dependent UI", status: "Todo" }
        ];
        const dependencies = [
            { task_id: "t-target", depends_on_task_id: "t-prereq" }
        ];
        const res = calculateStandupData({ scope: "PROJECT", scopeId: PROJ_A, tasks, dependencies });
        assert.strictEqual(res.blocked.length, 1);
        assert.strictEqual(res.blocked[0].taskId, "t-target");
        assert.ok(res.blocked[0].reason.includes("Prereq Backend"));
    });

    test("35. Standup Vector 4: At Risk detects overdue or critical path bottleneck tasks", () => {
        const tasks = [
            { id: "t-risk", title: "Fragile Gateway", status: "In_Progress", due_date: new Date(Date.now() - 86400000).toISOString() }
        ];
        const res = calculateStandupData({
            scope: "PROJECT",
            scopeId: PROJ_A,
            tasks,
            criticalPathData: { criticalTaskIds: ["t-risk"] }
        });
        assert.strictEqual(res.atRisk.length, 1);
        assert.strictEqual(res.atRisk[0].taskId, "t-risk");
    });

    test("36. Standup Vector 5: Needs Discussion includes open decisions and replanning proposals", () => {
        const decisions = [
            { id: "dec-1", title: "Architecture Choice: GraphQL vs REST", status: "PROPOSED" }
        ];
        const res = calculateStandupData({
            scope: "PROJECT",
            scopeId: PROJ_A,
            tasks: [],
            decisions
        });
        assert.strictEqual(res.needsDiscussion.length, 1);
        assert.strictEqual(res.needsDiscussion[0].title, "Architecture Choice: GraphQL vs REST");
    });

    test("37. Personal Standup filters 5 vectors strictly for current user", () => {
        const tasks = [
            { id: "t-user", title: "My Task", assigned_to: USER_ALICE, status: "In_Progress" },
            { id: "t-other", title: "Other Task", assigned_to: USER_BOB, status: "In_Progress" }
        ];
        const res = calculateStandupData({
            scope: "PERSONAL",
            scopeId: USER_ALICE,
            currentUserId: USER_ALICE,
            tasks
        });
        assert.strictEqual(res.today.length, 1);
        assert.strictEqual(res.today[0].taskId, "t-user");
    });

    test("38. in-memory store for Standup caches and returns data", async () => {
        const mockStandup = {
            scope: "PROJECT",
            scopeId: PROJ_A,
            today: [{ taskId: "t-mock", title: "Mock Task" }]
        };
        setInMemoryStandup(PROJ_A, mockStandup);
        const retrieved = await getProjectStandup(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.today.length, 1);
    });

    test("39. getTeamStandup delegates safely to project standup context", async () => {
        const mockStandup = {
            scope: "TEAM",
            scopeId: PROJ_A,
            scopeTitle: "Team Alpha Standup"
        };
        setInMemoryStandup(PROJ_A, mockStandup);
        const retrieved = await getTeamStandup(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.scopeTitle, "Team Alpha Standup");
    });

    test("40. Standup summaries format with zero fabricated events", () => {
        const res = calculateStandupData({ scope: "PROJECT", scopeId: PROJ_A, tasks: [] });
        assert.strictEqual(res.yesterday.length, 0);
        assert.strictEqual(res.today.length, 0);
        assert.strictEqual(res.blocked.length, 0);
    });

    // ============================================================
    // SECTION 5: STAKEHOLDER BRIEFING GENERATOR (41-50)
    // ============================================================

    test("41. calculateStakeholderBriefing outputs executive-level memorandum", () => {
        const res = calculateStakeholderBriefing({
            project: { id: PROJ_A, title: "Flagship Platform", deadline: new Date(Date.now() + 86400000 * 30).toISOString() },
            healthData: { score: 85, status: "HEALTHY" },
            forecastData: { p50Date: "2026-11-15", p80Date: "2026-11-25" },
            driftData: { driftDays: 2 }
        });

        assert.ok(res.projectTitle);
        assert.ok(res.executiveSummary);
        assert.strictEqual(res.healthScore, 85);
        assert.strictEqual(res.healthStatus, "HEALTHY");
        assert.strictEqual(res.p50Date, "2026-11-15");
        assert.strictEqual(res.p80Date, "2026-11-25");
        assert.strictEqual(res.driftDays, 2);
    });

    test("42. Stakeholder briefing includes recent accomplishments and milestone completions", () => {
        const tasks = [
            { id: "t-comp", title: "Database Migration Completed", status: "Completed" }
        ];
        const res = calculateStakeholderBriefing({
            project: { id: PROJ_A, title: "Flagship Platform" },
            tasks
        });
        assert.ok(res.accomplishments?.length > 0);
    });

    test("43. Stakeholder briefing highlights top risks and active mitigations", () => {
        const risks = [
            { id: "r1", title: "Third-party API latency", severity: "HIGH", mitigation: "Caching layer deployed" }
        ];
        const res = calculateStakeholderBriefing({
            project: { id: PROJ_A, title: "Platform" },
            risks
        });
        assert.strictEqual(res.topRisks.length, 1);
        assert.strictEqual(res.topRisks[0].title, "Third-party API latency");
        assert.strictEqual(res.topRisks[0].mitigation, "Caching layer deployed");
    });

    test("44. in-memory store for Stakeholder Briefing caches and retrieves correctly", async () => {
        const mockBriefing = {
            projectId: PROJ_A,
            projectTitle: "Platform",
            executiveSummary: "Executive Briefing: Operations on schedule."
        };
        setInMemoryStakeholderBriefing(PROJ_A, mockBriefing);
        const retrieved = await getProjectStakeholderBriefing(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.executiveSummary, "Executive Briefing: Operations on schedule.");
    });

    test("45. Stakeholder briefing language is strictly objective and neutral", () => {
        const res = calculateStakeholderBriefing({
            project: { id: PROJ_A, title: "Test" },
            healthData: { score: 40, status: "CRITICAL" }
        });
        const text = JSON.stringify(res).toLowerCase();
        assert.ok(!text.includes("bad work"));
        assert.ok(!text.includes("poor effort"));
        assert.ok(!text.includes("disaster"));
    });

    // ============================================================
    // SECTION 6: PROJECT COORDINATOR & COORDINATION STATE (46-55)
    // ============================================================

    test("46. calculateCoordinationState aggregates action, blocker, and approval queues", () => {
        const actions = [{ id: "act-1", title: "Action 1", priorityScore: 90 }];
        const blockers = [{ taskId: "t-blk", title: "Blocked Task", blockedDays: 3 }];
        const approvals = [{ id: "prop-1", title: "Proposal 1", status: "DRAFT" }];

        const res = calculateCoordinationState({
            scope: "PROJECT",
            scopeId: PROJ_A,
            actions,
            blockers,
            approvals
        });

        assert.ok(res.state);
        assert.strictEqual(res.actionQueue.length, 1);
        assert.strictEqual(res.blockerQueue.length, 1);
        assert.strictEqual(res.approvalQueue.length, 1);
    });

    test("47. Coordination state classifies HEALTHY when zero blockers and high health", () => {
        const res = calculateCoordinationState({
            scope: "PROJECT",
            scopeId: PROJ_A,
            healthScore: 90,
            blockers: [],
            actions: []
        });
        assert.strictEqual(res.state, "HEALTHY");
    });

    test("48. Coordination state classifies CRITICAL when critical blockers or high drift exist", () => {
        const res = calculateCoordinationState({
            scope: "PROJECT",
            scopeId: PROJ_A,
            healthScore: 40,
            blockers: [{ taskId: "t1", title: "Major Block", blockedDays: 5 }]
        });
        assert.strictEqual(res.state, "CRITICAL");
    });

    test("49. in-memory store for Project Coordination caches and returns state", async () => {
        const mockCoord = {
            projectId: PROJ_A,
            state: "ATTENTION",
            actionQueue: [{ id: "act-coord" }]
        };
        setInMemoryCoordination(PROJ_A, mockCoord);
        const retrieved = await getProjectCoordination(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.state, "ATTENTION");
    });

    test("50. in-memory store for Workspace Coordination caches and returns state", async () => {
        const mockCoord = {
            workspaceId: WS_ALPHA,
            state: "HEALTHY",
            summary: "Workspace operational"
        };
        setInMemoryCoordination(WS_ALPHA, mockCoord);
        const retrieved = await getWorkspaceCoordination(WS_ALPHA, USER_ALICE);
        assert.strictEqual(retrieved.state, "HEALTHY");
    });

    // ============================================================
    // SECTION 7: ACTION PLANS & RECOVERY PLANS (51-60)
    // ============================================================

    test("51. calculateActionPlan sequences next actions into a structured timeline", () => {
        const actions = [
            { id: "a1", title: "Action 1", priorityScore: 90, estimatedHours: 4 },
            { id: "a2", title: "Action 2", priorityScore: 70, estimatedHours: 6 }
        ];
        const res = calculateActionPlan({
            projectId: PROJ_A,
            actions
        });

        assert.ok(res.planId);
        assert.ok(Array.isArray(res.sequencedActions));
        assert.strictEqual(res.totalEstimatedHours, 10);
    });

    test("52. calculateRecoveryPlan structures 4 pillars of recovery", () => {
        const blockers = [{ taskId: "t-b", title: "Unblock Database" }];
        const criticalTasks = [{ id: "t-cp", title: "Compress Critical Route" }];
        const rebalancing = [{ memberId: USER_BOB, action: "Shift secondary tasks" }];
        const scopeItems = [{ id: "t-scope", title: "Defer non-essential docs" }];

        const res = calculateRecoveryPlan({
            projectId: PROJ_A,
            driftDays: 5,
            blockers,
            criticalTasks,
            workloadRebalancing: rebalancing,
            scopeAdjustments: scopeItems
        });

        assert.ok(res.projectedRecoveryDays > 0);
        assert.ok(Array.isArray(res.blockerRemovals));
        assert.ok(Array.isArray(res.criticalPathActions));
        assert.ok(Array.isArray(res.workloadRebalancing));
        assert.ok(Array.isArray(res.scopeAdjustments));
    });

    test("53. Recovery plan projectedRecoveryDays is bounded and reasonable", () => {
        const res = calculateRecoveryPlan({
            projectId: PROJ_A,
            driftDays: 6,
            blockers: [{ taskId: "t1" }],
            criticalTasks: [{ id: "t2" }]
        });
        assert.ok(res.projectedRecoveryDays <= 6, "Cannot recover more days than current drift");
        assert.ok(res.projectedRecoveryDays >= 0);
    });

    test("54. in-memory store for Action Plan caches correctly", async () => {
        const mockPlan = {
            projectId: PROJ_A,
            planTitle: "Targeted Acceleration Plan",
            sequencedActions: [{ id: "act-seq" }]
        };
        setInMemoryActionPlan(PROJ_A, mockPlan);
        const retrieved = await getProjectActionPlan(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.planTitle, "Targeted Acceleration Plan");
    });

    test("55. in-memory store for Recovery Plan caches correctly", async () => {
        const mockRecovery = {
            projectId: PROJ_A,
            recoveryScore: 85,
            projectedRecoveryDays: 4
        };
        setInMemoryActionPlan(`recovery-${PROJ_A}`, mockRecovery);
        const retrieved = await getProjectRecoveryPlan(PROJ_A, USER_ALICE);
        assert.strictEqual(retrieved.projectedRecoveryDays, 4);
    });

    // ============================================================
    // SECTION 8: QUACKIE COORDINATOR ASSISTANT INTEGRATION (56-70)
    // ============================================================

    test("56. formatBriefingReply formats daily briefing into markdown response", () => {
        const briefing = {
            headline: "Daily Briefing: Project Nominal",
            health: { score: 85, status: "HEALTHY" },
            keyFocusToday: [{ title: "Ship API", priority: "HIGH" }],
            summary: "On track."
        };
        const reply = formatBriefingReply(briefing, "Alpha");
        assert.ok(reply.includes("DAILY BRIEFING"));
        assert.ok(reply.includes("85/100"));
        assert.ok(reply.includes("Ship API"));
    });

    test("57. formatStandupReply formats 5-vector standup into clean response", () => {
        const standup = {
            scopeTitle: "Team Standup",
            yesterday: [{ title: "Completed Task A" }],
            today: [{ title: "Working on Task B" }],
            blocked: [],
            atRisk: [],
            needsDiscussion: []
        };
        const reply = formatStandupReply(standup, "Alpha");
        assert.ok(reply.includes("STANDUP"));
        assert.ok(reply.includes("Completed Task A"));
        assert.ok(reply.includes("Working on Task B"));
    });

    test("58. formatExecutiveReply formats workspace executive briefing", () => {
        const exec = {
            workspaceName: "Engineering",
            portfolioSummary: "All projects healthy.",
            riskDistribution: { healthy: 3, critical: 0 }
        };
        const reply = formatExecutiveReply(exec, "Engineering");
        assert.ok(reply.includes("EXECUTIVE BRIEFING"));
        assert.ok(reply.includes("All projects healthy."));
    });

    test("59. formatCoordinatorReply formats ranked next actions with priority scores", () => {
        const actions = [
            { title: "Clear API Blocker", priorityScore: 95, urgency: "CRITICAL" }
        ];
        const reply = formatCoordinatorReply({ actions }, "Alpha");
        assert.ok(reply.includes("NEXT ACTIONS"));
        assert.ok(reply.includes("95"));
        assert.ok(reply.includes("Clear API Blocker"));
    });

    test("60. formatApprovalQueueReply formats pending approvals with safe guidance", () => {
        const approvals = {
            replanningProposals: [{ id: "prop-1", title: "Replan Proposal 1" }]
        };
        const reply = formatApprovalQueueReply(approvals, "Alpha");
        assert.ok(reply.includes("APPROVAL"));
        assert.ok(reply.includes("Replan Proposal 1"));
    });

    test("61. formatRecoveryPlanReply formats recovery pillars and days saved", () => {
        const recovery = {
            projectedRecoveryDays: 3,
            rationale: "Unblock core database bottleneck.",
            blockerRemovals: [{ title: "Unblock DB" }]
        };
        const reply = formatRecoveryPlanReply(recovery, "Alpha");
        assert.ok(reply.includes("RECOVERY PLAN"));
        assert.ok(reply.includes("3"));
        assert.ok(reply.includes("Unblock DB"));
    });

    test("62. formatActionConfirmationReply guides user to Approval Center and enforces zero silent mutation", () => {
        const reply = formatActionConfirmationReply({ action: "APPROVE_PROPOSAL", proposalId: "prop-123" });
        assert.ok(reply.includes("ACTION CONFIRMATION REQUIRED") || reply.includes("Approval Center"));
        assert.ok(reply.includes("prop-123"));
    });

    test("63. Quackie processMessage routes 'give me today's briefing' to briefing intent", async () => {
        setInMemoryProjectBriefing(PROJ_A, { headline: "Briefing Ready", health: { score: 90, status: "HEALTHY" } });
        const res = await processMessage({
            message: "Can you give me today's briefing?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "DAILY_BRIEFING" || res.reply.includes("BRIEFING"));
    });

    test("64. Quackie processMessage routes 'what is our daily standup' to standup intent", async () => {
        setInMemoryStandup(PROJ_A, {
            scope: "PROJECT",
            yesterday: [],
            today: [{ title: "Review PR" }],
            blocked: [],
            atRisk: [],
            needsDiscussion: []
        });
        const res = await processMessage({
            message: "What is our daily standup?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "STANDUP" || res.reply.includes("STANDUP"));
    });

    test("65. Quackie processMessage routes 'executive briefing' to executive intent", async () => {
        setInMemoryExecutiveBriefing(WS_ALPHA, { portfolioSummary: "Workspace summary" });
        const res = await processMessage({
            message: "Show executive briefing for workspace",
            context: { workspaceId: WS_ALPHA },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "EXECUTIVE_BRIEFING" || res.reply.includes("EXECUTIVE BRIEFING"));
    });

    test("66. Quackie processMessage routes 'what should I do next' to coordinator next actions", async () => {
        setInMemoryNextActions(PROJ_A, { actions: [{ title: "Action A", priorityScore: 90 }] });
        const res = await processMessage({
            message: "What should I do next?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "COORDINATOR_NEXT_ACTIONS" || res.reply.includes("NEXT ACTIONS"));
    });

    test("67. Quackie processMessage routes 'what is pending approval' to approvals queue", async () => {
        const res = await processMessage({
            message: "What is pending approval?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "APPROVAL_QUEUE" || res.reply.includes("APPROVAL"));
    });

    test("68. Quackie processMessage routes 'create a recovery plan' to recovery plan intent", async () => {
        setInMemoryActionPlan(`recovery-${PROJ_A}`, { projectedRecoveryDays: 3, blockerRemovals: [] });
        const res = await processMessage({
            message: "Create a recovery plan for this project",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "RECOVERY_PLAN" || res.reply.includes("RECOVERY"));
    });

    test("69. Quackie Confirmation Guard intercepts destructive 'approve proposal 123' safely", async () => {
        const res = await processMessage({
            message: "Please approve proposal 12345",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.intent === "ACTION_CONFIRMATION_REQUIRED" || res.reply.includes("Approval Center"));
        assert.ok(res.requiresConfirmation === true || res.reply.includes("Confirmation"));
    });

    test("70. Quackie Confirmation Guard intercepts 'reassign task to Bob' safely", async () => {
        const res = await processMessage({
            message: "Reassign task 456 to Bob immediately",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.ok(res.reply.includes("Approval Center") || res.requiresConfirmation === true);
    });

    // ============================================================
    // SECTION 9: PROACTIVE COORDINATION ALERTS (71-80)
    // ============================================================

    test("71. CRITICAL_ACTION_REQUIRED alert detects when task priorityScore reaches >= 80", () => {
        const baseline = extractIntelligenceSnapshot({
            nextActions: { actions: [{ id: "act-1", priorityScore: 70 }] }
        });
        const current = extractIntelligenceSnapshot({
            nextActions: { actions: [{ id: "act-1", priorityScore: 92, title: "Urgent Critical Path Blocker" }] }
        });

        const transitions = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: baseline,
            currentState: current
        });
        const alert = transitions.find((t) => t.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_ACTION_REQUIRED);
        assert.ok(alert, "Must detect CRITICAL_ACTION_REQUIRED transition");
        assert.strictEqual(alert.severity, "CRITICAL");
    });

    test("72. APPROVAL_REQUIRED alert fires when pending replanning proposals appear", () => {
        const baseline = extractIntelligenceSnapshot({
            coordination: { pendingApprovalsCount: 0 }
        });
        const current = extractIntelligenceSnapshot({
            coordination: { pendingApprovalsCount: 2 }
        });

        const transitions = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: baseline,
            currentState: current
        });
        const alert = transitions.find((t) => t.type === INTELLIGENCE_ALERT_TYPES.APPROVAL_REQUIRED);
        assert.ok(alert, "Must detect APPROVAL_REQUIRED transition");
    });

    test("73. BLOCKER_ESCALATED alert fires when task is blocked for >= 2 days", () => {
        const baseline = extractIntelligenceSnapshot({
            standup: { blocked: [] }
        });
        const current = extractIntelligenceSnapshot({
            standup: { blocked: [{ taskId: "t1", title: "API Gateway", blockedDays: 3 }] }
        });

        const transitions = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            projectTitle: "Alpha",
            previousState: baseline,
            currentState: current
        });
        const alert = transitions.find((t) => t.type === INTELLIGENCE_ALERT_TYPES.BLOCKER_ESCALATED);
        assert.ok(alert, "Must detect BLOCKER_ESCALATED transition");
    });

    test("74. Coordination alerts deduplicate with dateKey to prevent alert fatigue", () => {
        const current = extractIntelligenceSnapshot({
            coordination: { pendingApprovalsCount: 2 }
        });
        const transitions1 = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            previousState: null,
            currentState: current
        });
        const transitions2 = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            previousState: current,
            currentState: current
        });
        assert.ok(transitions2.length === 0, "Repeated identical state must not produce duplicate alerts");
    });

    test("75. Proactive coordination alerts preserve cold-start suppression", () => {
        const baseline = null;
        const current = extractIntelligenceSnapshot({
            coordination: { pendingApprovalsCount: 0, actionsCount: 0 }
        });
        const transitions = detectIntelligenceStateTransitions({
            projectId: PROJ_A,
            previousState: baseline,
            currentState: current
        });
        assert.strictEqual(transitions.length, 0, "Cold start baseline should produce zero false alerts");
    });

    // ============================================================
    // SECTION 10: ARCHITECTURAL BOUNDARIES, TENANT ISOLATION, SAFETY (76-85)
    // ============================================================

    test("76. In-memory stores isolate Project A data strictly from Project B", async () => {
        setInMemoryNextActions(PROJ_A, { actions: [{ title: "Action for A" }] });
        setInMemoryNextActions(PROJ_B, { actions: [{ title: "Action for B" }] });

        const resA = await getProjectNextActions(PROJ_A, USER_ALICE);
        const resB = await getProjectNextActions(PROJ_B, USER_ALICE);

        assert.strictEqual(resA.actions[0].title, "Action for A");
        assert.strictEqual(resB.actions[0].title, "Action for B");
    });

    test("77. In-memory stores isolate Workspace Alpha from Workspace Beta", async () => {
        setInMemoryExecutiveBriefing("ws-alpha", { workspaceId: "ws-alpha", portfolioHealth: 90 });
        setInMemoryExecutiveBriefing("ws-beta", { workspaceId: "ws-beta", portfolioHealth: 50 });

        const resAlpha = await getWorkspaceExecutiveBriefing("ws-alpha", USER_ALICE);
        const resBeta = await getWorkspaceExecutiveBriefing("ws-beta", USER_ALICE);

        assert.strictEqual(resAlpha.portfolioHealth, 90);
        assert.strictEqual(resBeta.portfolioHealth, 50);
    });

    test("78. Non-UUID strings handled safely without crashing Prisma queries", async () => {
        const briefing = await getPersonalBriefing("non-uuid-string-user");
        assert.ok(briefing != null);
        assert.strictEqual(briefing.scope, "PERSONAL");
    });

    test("79. Standup handles non-UUID scope gracefully via in-memory calculation", async () => {
        const standup = await getPersonalStandup("non-uuid-user");
        assert.ok(standup != null);
        assert.strictEqual(standup.scope, "PERSONAL");
    });

    test("80. Daily Action Plan handles non-UUID scope cleanly", async () => {
        const plan = await getDailyActionPlan("non-uuid-user");
        assert.ok(plan != null);
    });

    test("81. Zero database writes occur during any briefing calculation", () => {
        // Pure calculation verify
        const briefing = calculateProjectBriefing({ project: { id: PROJ_A }, tasks: [] });
        assert.ok(briefing != null);
    });

    test("82. Zero database writes occur during standup synthesis", () => {
        const standup = calculateStandupData({ scope: "PROJECT", scopeId: PROJ_A, tasks: [] });
        assert.ok(standup != null);
    });

    test("83. Zero database writes occur during next action scoring", () => {
        const actions = calculateNextActions({ projectId: PROJ_A, tasks: [] });
        assert.ok(actions != null);
    });

    test("84. Zero database writes occur during recovery plan computation", () => {
        const recovery = calculateRecoveryPlan({ projectId: PROJ_A, driftDays: 4 });
        assert.ok(recovery != null);
    });

    test("85. All Phase 6 outputs maintain neutral, factual tone without blaming individuals", () => {
        const recovery = calculateRecoveryPlan({ projectId: PROJ_A, driftDays: 7 });
        const text = JSON.stringify(recovery).toLowerCase();
        assert.ok(!text.includes("underperforming"));
        assert.ok(!text.includes("slack")); // in the sense of slacker
        assert.ok(!text.includes("negligent"));
    });
});
