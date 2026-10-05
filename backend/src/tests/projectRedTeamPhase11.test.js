import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
    RED_TEAM_CATEGORIES,
    RED_TEAM_SEVERITY,
    EVIDENCE_CONFIDENCE,
    CHALLENGE_METHODS,
    calculateRedTeamExposureScore,
    challengeEstimateRealism,
    challengeDeadlineRealism,
    challengeDependencyFragility,
    challengeResourceConcentration,
    challengeKnowledgeConcentration,
    challengeCriticalPathFragility,
    challengeBottleneckFragility,
    challengeScopeFragility,
    challengeRecoveryFragility,
    challengeRiskCoverage,
    challengeDecisionFragility,
    challengeHealthInconsistency,
    challengeCapacityAssumption,
    challengeResilienceGap,
    runProjectRedTeam,
    getProjectRedTeam,
    validateFindingWithChaos,
    setInMemoryProjectData,
    clearRedTeamStore
} from "../services/projectRedTeamService.js";
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
    formatRedTeamReply,
    QUACKIE_CONTROL_MODES
} from "../services/quackieService.js";

describe("PHASE 11: Project Red Team Adversarial Intelligence Test Suite", () => {
    const PROJ_ID = "proj-redteam-test-11";
    const USER_ALICE = "usr-alice-rt";
    const USER_BOB = "usr-bob-rt";
    const USER_CHARLIE = "usr-charlie-rt";

    const sampleProject = {
        id: PROJ_ID,
        title: "Enterprise Core Banking Migration",
        start_date: "2026-10-01T00:00:00.000Z",
        end_date: "2026-10-20T00:00:00.000Z",
        status: "In Progress"
    };

    const sampleTasks = [
        { id: "t1", title: "Legacy Core Decoupling", status: "In Progress", priority: "Critical", estimated_hours: 40, project_id: PROJ_ID, assigned_to: USER_ALICE, is_archived: false, created_at: "2026-10-01T00:00:00.000Z" },
        { id: "t2", title: "Transaction Isolation Engine", status: "To Do", priority: "High", estimated_hours: 32, project_id: PROJ_ID, assigned_to: USER_ALICE, is_archived: false, created_at: "2026-10-01T00:00:00.000Z" },
        { id: "t3", title: "Kafka Event Synchronization", status: "To Do", priority: "High", estimated_hours: 24, project_id: PROJ_ID, assigned_to: USER_ALICE, is_archived: false, created_at: "2026-10-01T00:00:00.000Z" },
        { id: "t4", title: "Regulatory Compliance Audit", status: "To Do", priority: "Medium", estimated_hours: 16, project_id: PROJ_ID, assigned_to: USER_BOB, is_archived: false, created_at: "2026-10-01T00:00:00.000Z" },
        { id: "t5", title: "Cutover Dry Run", status: "To Do", priority: "Critical", estimated_hours: 20, project_id: PROJ_ID, assigned_to: USER_CHARLIE, is_archived: false, created_at: "2026-10-01T00:00:00.000Z" }
    ];

    const sampleDependencies = [
        { task_id: "t2", depends_on_task_id: "t1" },
        { task_id: "t3", depends_on_task_id: "t2" },
        { task_id: "t4", depends_on_task_id: "t1" },
        { task_id: "t5", depends_on_task_id: "t3" },
        { task_id: "t5", depends_on_task_id: "t4" }
    ];

    const sampleMembers = [
        { id: "m1", user_id: USER_ALICE, project_id: PROJ_ID, users: { id: USER_ALICE, email: "alice@bank.test", first_name: "Alice", last_name: "Dev" } },
        { id: "m2", user_id: USER_BOB, project_id: PROJ_ID, users: { id: USER_BOB, email: "bob@bank.test", first_name: "Bob", last_name: "Sec" } },
        { id: "m3", user_id: USER_CHARLIE, project_id: PROJ_ID, users: { id: USER_CHARLIE, email: "charlie@bank.test", first_name: "Charlie", last_name: "Ops" } }
    ];

    const sampleRisks = [
        { id: "r1", title: "Regulatory Delay", severity: "HIGH", probability: "HIGH", project_id: PROJ_ID, status: "OPEN" }
    ];

    const sampleDecisions = [
        { id: "d1", title: "Direct Kafka integration over batch processing", status: "APPROVED", impact: "High real-time synchronization dependency", project_id: PROJ_ID }
    ];

    const baseProjectData = {
        project: sampleProject,
        tasks: sampleTasks,
        dependencies: sampleDependencies,
        projectMembers: sampleMembers,
        risks: sampleRisks,
        decisions: sampleDecisions
    };

    beforeEach(() => {
        clearRedTeamStore();
        setInMemoryProjectData(PROJ_ID, baseProjectData);
    });

    // ============================================================
    // 1. ENUMS & CONSTANTS
    // ============================================================

    test("1. Red Team categories, severities, and methods are defined and complete", () => {
        assert.strictEqual(Object.keys(RED_TEAM_CATEGORIES).length, 14);
        assert.strictEqual(RED_TEAM_CATEGORIES.ESTIMATE_REALISM, "ESTIMATE_REALISM");
        assert.strictEqual(RED_TEAM_CATEGORIES.RESILIENCE_GAP, "RESILIENCE_GAP");

        assert.strictEqual(RED_TEAM_SEVERITY.CRITICAL, "CRITICAL");
        assert.strictEqual(RED_TEAM_SEVERITY.HIGH, "HIGH");
        assert.strictEqual(RED_TEAM_SEVERITY.MEDIUM, "MEDIUM");

        assert.strictEqual(EVIDENCE_CONFIDENCE.STRONG_EVIDENCE, "STRONG_EVIDENCE");
        assert.strictEqual(CHALLENGE_METHODS.THRESHOLD_TESTING, "THRESHOLD_TESTING");
    });

    // ============================================================
    // 2. EXPOSURE SCORING FORMULA
    // ============================================================

    test("2. calculateRedTeamExposureScore produces explainable 0-100 score and classification", () => {
        // Zero findings -> Low exposure
        const cleanScore = calculateRedTeamExposureScore({ findings: [], cpm: null, deadlineRisk: null });
        assert.strictEqual(cleanScore.score, 0);
        assert.strictEqual(cleanScore.classification, "LOW_EXPOSURE");

        // High exposure scenario
        const mockFindings = [
            { category: RED_TEAM_CATEGORIES.DEADLINE_REALISM, severity: RED_TEAM_SEVERITY.CRITICAL },
            { category: RED_TEAM_CATEGORIES.CRITICAL_PATH_FRAGILITY, severity: RED_TEAM_SEVERITY.CRITICAL },
            { category: RED_TEAM_CATEGORIES.RESOURCE_CONCENTRATION, severity: RED_TEAM_SEVERITY.HIGH },
            { category: RED_TEAM_CATEGORIES.KNOWLEDGE_CONCENTRATION, severity: RED_TEAM_SEVERITY.HIGH },
            { category: RED_TEAM_CATEGORIES.ESTIMATE_REALISM, severity: RED_TEAM_SEVERITY.MEDIUM }
        ];

        const calculated = calculateRedTeamExposureScore({
            findings: mockFindings,
            cpm: { criticalTaskIds: ["t1", "t2", "t3", "t5"] },
            deadlineRisk: { isDeadlineBreached: true }
        });

        assert.ok(calculated.score >= 50, `Expected score >= 50, got ${calculated.score}`);
        assert.ok(calculated.breakdown.criticalFindingsScore > 0);
        assert.ok(calculated.breakdown.highFindingsScore > 0);
        assert.ok(calculated.breakdown.deadlineRiskScore > 0);
        assert.ok(calculated.breakdown.concentrationScore > 0);
    });

    // ============================================================
    // 3. ADVERSARIAL CHALLENGE GENERATION (14 CATEGORIES)
    // ============================================================

    test("3. challengeEstimateRealism identifies unestimated or under-estimated tasks", () => {
        const tasksWithUnestimated = [
            ...sampleTasks,
            { id: "t_no_est", title: "Unestimated Migration Task", estimated_hours: 0, status: "To Do", is_archived: false }
        ];
        const findings = challengeEstimateRealism({
            tasks: tasksWithUnestimated,
            dependencies: sampleDependencies,
            cpm: { criticalTaskIds: ["t1", "t2"] },
            startOfToday: "2026-10-01T00:00:00.000Z",
            projectId: PROJ_ID
        });

        assert.ok(findings.length > 0);
        const unestFinding = findings.find((f) => f.title.includes("Zero or Missing Work Estimate"));
        assert.ok(unestFinding, "Expected finding for zero or missing estimate");
        assert.strictEqual(unestFinding.category, RED_TEAM_CATEGORIES.ESTIMATE_REALISM);
    });

    test("4. challengeDeadlineRealism flags impossible project deadlines", () => {
        // Project ends on Oct 5, but CPM takes 15 days
        const tightProject = { ...sampleProject, end_date: "2026-10-05T00:00:00.000Z" };
        const findings = challengeDeadlineRealism({
            project: tightProject,
            tasks: sampleTasks,
            dependencies: sampleDependencies,
            cpm: { criticalPathDurationDays: 15, criticalTaskIds: ["t1", "t2", "t3", "t5"] },
            startOfToday: "2026-10-01T00:00:00.000Z",
            projectId: PROJ_ID
        });

        assert.ok(findings.length > 0);
        const deadlineFinding = findings.find((f) => f.category === RED_TEAM_CATEGORIES.DEADLINE_REALISM);
        assert.ok(deadlineFinding);
        assert.strictEqual(deadlineFinding.severity, RED_TEAM_SEVERITY.CRITICAL);
    });

    test("5. challengeDependencyFragility detects high fanout and serial chains", () => {
        const complexDeps = [
            { task_id: "t2", depends_on_task_id: "t1" },
            { task_id: "t3", depends_on_task_id: "t1" },
            { task_id: "t4", depends_on_task_id: "t1" },
            { task_id: "t5", depends_on_task_id: "t1" }
        ];
        const findings = challengeDependencyFragility({
            tasks: sampleTasks,
            dependencies: complexDeps,
            cpm: { criticalTaskIds: ["t1"] },
            projectId: PROJ_ID
        });

        assert.ok(findings.length > 0);
        const fanoutFinding = findings.find((f) => f.title.includes("High Downstream Fanout"));
        assert.ok(fanoutFinding);
        assert.strictEqual(fanoutFinding.category, RED_TEAM_CATEGORIES.DEPENDENCY_FRAGILITY);
    });

    test("6. challengeResourceConcentration detects workload saturation on single user", () => {
        // Alice has t1 (40h), t2 (32h), t3 (24h) = 96h of 132h total (72%)
        const findings = challengeResourceConcentration({
            tasks: sampleTasks,
            projectMembers: sampleMembers,
            cpm: { criticalTaskIds: ["t1", "t2", "t3"] },
            bottlenecks: [],
            projectId: PROJ_ID
        });

        assert.ok(findings.length > 0);
        const concentrationFinding = findings.find((f) => f.category === RED_TEAM_CATEGORIES.RESOURCE_CONCENTRATION);
        assert.ok(concentrationFinding);
        assert.ok(concentrationFinding.description.includes("Alice"));
    });

    test("7. challengeKnowledgeConcentration identifies critical tasks without redundancy", () => {
        const findings = challengeKnowledgeConcentration({
            tasks: sampleTasks,
            projectMembers: sampleMembers,
            cpm: { criticalTaskIds: ["t1", "t2", "t3", "t5"] },
            projectId: PROJ_ID
        });

        assert.ok(findings.length > 0);
        const islandFinding = findings.find((f) => f.category === RED_TEAM_CATEGORIES.KNOWLEDGE_CONCENTRATION);
        assert.ok(islandFinding);
    });

    test("8. challengeCriticalPathFragility detects zero-slack critical chain fragility", () => {
        const findings = challengeCriticalPathFragility({
            tasks: sampleTasks,
            dependencies: sampleDependencies,
            cpm: { criticalTaskIds: ["t1", "t2", "t3", "t5"], criticalPathDurationDays: 14 },
            projectId: PROJ_ID
        });

        assert.ok(findings.length > 0);
        const cpFinding = findings.find((f) => f.category === RED_TEAM_CATEGORIES.CRITICAL_PATH_FRAGILITY);
        assert.ok(cpFinding);
    });

    test("9. challengeRiskCoverage and challengeDecisionFragility assess unhedged exposures", () => {
        const riskFindings = challengeRiskCoverage({
            tasks: sampleTasks,
            dependencies: sampleDependencies,
            risks: sampleRisks,
            bottlenecks: [],
            cpm: { criticalTaskIds: ["t1", "t2", "t3"] },
            projectId: PROJ_ID
        });
        assert.ok(Array.isArray(riskFindings));

        const decisionFindings = challengeDecisionFragility({
            decisions: sampleDecisions,
            projectId: PROJ_ID
        });
        assert.ok(decisionFindings.length > 0);
        assert.strictEqual(decisionFindings[0].category, RED_TEAM_CATEGORIES.DECISION_FRAGILITY);
    });

    // ============================================================
    // 4. FULL RED TEAM ORCHESTRATION & STATE IMMUTABILITY
    // ============================================================

    test("10. runProjectRedTeam executes complete adversarial analysis with zero mutations", async () => {
        const hashBefore = computeProjectStateHash(baseProjectData);

        const report = await runProjectRedTeam({
            projectId: PROJ_ID,
            baseData: baseProjectData,
            startOfToday: new Date("2026-10-01T00:00:00.000Z")
        });

        const hashAfter = computeProjectStateHash(baseProjectData);
        assert.strictEqual(hashBefore, hashAfter, "Production project state was mutated during Red Team analysis!");

        assert.strictEqual(report.projectId, PROJ_ID);
        assert.ok(report.findings.length > 0);
        assert.ok(report.exposureScore.score >= 0 && report.exposureScore.score <= 100);
        assert.ok(report.topVulnerabilities.length <= 5);
        assert.strictEqual(report.readOnlyVerified, true);
    });

    test("11. runProjectRedTeam produces identical deterministic findings on repeat runs", async () => {
        const run1 = await runProjectRedTeam({ projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") });
        const run2 = await runProjectRedTeam({ projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") });

        assert.strictEqual(run1.findingsCount, run2.findingsCount);
        assert.strictEqual(run1.exposureScore.score, run2.exposureScore.score);
        assert.strictEqual(run1.stateHash, run2.stateHash);
        assert.deepStrictEqual(run1.findings.map(f => f.findingId), run2.findings.map(f => f.findingId));
    });

    test("12. getProjectRedTeam retrieves cached analysis report", async () => {
        await runProjectRedTeam({ projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") });
        const cached = await getProjectRedTeam(PROJ_ID);

        assert.ok(cached);
        assert.strictEqual(cached.projectId, PROJ_ID);
    });

    // ============================================================
    // 5. CHAOS LAB VALIDATION HANDOFF
    // ============================================================

    test("13. validateFindingWithChaos validates a specific finding using targeted Chaos Lab simulation", async () => {
        const report = await runProjectRedTeam({ projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") });
        const targetFinding = report.findings[0];
        assert.ok(targetFinding);

        const validation = await validateFindingWithChaos({
            projectId: PROJ_ID,
            findingId: targetFinding.findingId,
            baseData: baseProjectData
        });

        assert.strictEqual(validation.findingId, targetFinding.findingId);
        assert.ok(["CONFIRMED_HIGH_RISK", "MONITORED_RESILIENT"].includes(validation.validationStatus));
        assert.ok(typeof validation.chaosScore === "number");
        assert.ok(validation.chaosEvaluation);
    });

    // ============================================================
    // 6. NATURAL-LANGUAGE CONTROL & QUACKIE INTEGRATION
    // ============================================================

    test("14. parseNaturalLanguageQuery parses Red Team queries", () => {
        const parsed1 = parseNaturalLanguageQuery("Run a Red Team analysis on this project");
        assert.strictEqual(parsed1.intent, INTENTS.RED_TEAM_RUN);

        const parsed2 = parseNaturalLanguageQuery("Challenge our project assumptions and find weaknesses");
        assert.strictEqual(parsed2.intent, INTENTS.CHALLENGE_ASSUMPTION);
    });

    test("15. handleIntelligenceQuery handles RED_TEAM_RUN intent", async () => {
        const response = await handleIntelligenceQuery({
            query: "Run red team assessment",
            projectId: PROJ_ID,
            context: { projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") }
        });

        assert.strictEqual(response.intent, INTENTS.RED_TEAM_RUN);
        assert.ok(["SUCCESS", "EXECUTED"].includes(response.status));
        assert.ok(response.data.exposureScore);
        assert.ok(response.data.findings.length > 0);
    });

    test("16. Quackie processes RED_TEAM queries and formats replies with personality", async () => {
        const reply = formatRedTeamReply({
            exposureScore: { score: 65, classification: "HIGH_EXPOSURE" },
            findingsCount: 4,
            topVulnerabilities: [
                { title: "Single point of failure on Alice", severity: "HIGH", assumedReality: "Alice never leaves", contrarianView: "Alice is overloaded", exposureLevel: 75 }
            ]
        });

        assert.ok(reply.includes("RED TEAM ADVERSARIAL REPORT"));
        assert.ok(reply.includes("HIGH_EXPOSURE"));
        assert.ok(reply.includes("Single point of failure"));

        const quackieMsg = await processMessage({
            message: "Quackie, run the red team on our schedule",
            projectId: PROJ_ID,
            context: { projectId: PROJ_ID, baseData: baseProjectData, startOfToday: new Date("2026-10-01T00:00:00.000Z") }
        });

        assert.strictEqual(quackieMsg.mode, QUACKIE_CONTROL_MODES.RED_TEAM);
        assert.ok(quackieMsg.reply.includes("RED TEAM ADVERSARIAL REPORT") || quackieMsg.reply.includes("🦆"));
    });
});
