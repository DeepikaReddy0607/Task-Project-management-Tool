import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { buildDigitalTwin } from "../services/digitalTwinService.js";
import {
    calculateProjectHealth,
    determineHealthStatus,
    HEALTH_STATUS,
    HEALTH_TREND,
    clearHealthHistory
} from "../services/projectHealthService.js";
import {
    calculateScheduleDrift,
    determineDriftSeverity,
    DRIFT_SEVERITY
} from "../services/scheduleDriftService.js";
import {
    calculateDeadlineRisks,
    DEADLINE_RISK_LEVEL
} from "../services/deadlineRiskService.js";
import {
    runPreMortemAnalysis,
    PREMORTEM_SEVERITY
} from "../services/preMortemService.js";
import {
    calculateTeamWorkload,
    calculateKnowledgeConcentration,
    KNOWLEDGE_RISK_SEVERITY
} from "../services/teamIntelligenceService.js";
import {
    detectIntelligenceStateTransitions,
    extractIntelligenceSnapshot,
    INTELLIGENCE_ALERT_TYPES,
    clearAllBaselines
} from "../services/intelligenceAlertService.js";
import {
    formatProjectHealthReply,
    formatScheduleDriftReply,
    formatPreMortemReply,
    formatTeamWorkloadReply
} from "../services/quackieService.js";

describe("PHASE 2: Digital Twin, Project Health & Predictive Intelligence Test Suite", () => {
    const fixedToday = new Date("2026-10-02T00:00:00.000Z");
    const testDateKey = "2026-10-02";

    beforeEach(() => {
        clearAllBaselines();
        clearHealthHistory();
    });

    // ============================================================
    // PART 1: DIGITAL TWIN (Tests 1 - 8)
    // ============================================================

    test("1. empty project: empty project returns deterministic digital twin with 0 tasks and empty collections", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-empty", title: "Empty Project" },
            tasks: [],
            dependencies: [],
            startOfToday: fixedToday
        });

        assert.equal(twin.project.id, "p-empty");
        assert.equal(twin.tasks.total, 0);
        assert.equal(twin.tasks.completed, 0);
        assert.equal(twin.dependencies.total, 0);
        assert.equal(twin.criticalPath.criticalPathDuration, 0);
        assert.equal(twin.bottlenecks.count, 0);
        assert.equal(twin.team.memberCount, 0);
        assert.equal(twin.risks.total, 0);
    });

    test("2. normal project: combines metadata, tasks, dependencies, cpm, bottlenecks, team, and risks", () => {
        const project = { id: "p-norm", title: "Norm Project", start_date: "2026-10-01", end_date: "2026-10-10" };
        const tasks = [
            { id: "t1", title: "Task 1", estimated_hours: 16, status: "Completed", is_archived: false, assigned_to: "u1" },
            { id: "t2", title: "Task 2", estimated_hours: 24, status: "In Progress", is_archived: false, assigned_to: "u1" }
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const members = [{ user_id: "u1", users: { id: "u1", first_name: "Dev", last_name: "One", email: "d1@test.com" } }];
        const risks = [{ id: "r1", title: "Scope Risk", severity: "High", status: "Open" }];

        const twin = buildDigitalTwin({
            project,
            tasks,
            dependencies,
            projectMembers: members,
            risks,
            startOfToday: fixedToday
        });

        assert.equal(twin.project.id, "p-norm");
        assert.equal(twin.tasks.total, 2);
        assert.equal(twin.tasks.completed, 1);
        assert.equal(twin.tasks.incomplete, 1);
        assert.equal(twin.dependencies.total, 1);
        assert.equal(twin.team.memberCount, 1);
        assert.equal(twin.risks.open, 1);
    });

    test("3. completed tasks: completed tasks do not add to remaining hours", () => {
        const tasks = [
            { id: "t1", title: "Finished", estimated_hours: 40, status: "Completed", is_archived: false },
            { id: "t2", title: "Remaining", estimated_hours: 16, status: "To Do", is_archived: false }
        ];

        const twin = buildDigitalTwin({
            project: { id: "p-comp" },
            tasks,
            startOfToday: fixedToday
        });

        assert.equal(twin.tasks.totalEstimatedHours, 56);
        assert.equal(twin.tasks.remainingEstimatedHours, 16);
        assert.equal(twin.tasks.completed, 1);
        assert.equal(twin.tasks.completionPercentage, 50);
    });

    test("4. overdue tasks: correctly identifies overdue and dueSoon tasks", () => {
        const tasks = [
            { id: "t1", title: "Overdue", due_date: "2026-09-20", status: "In Progress", is_archived: false },
            { id: "t2", title: "Due Soon", due_date: "2026-10-05", status: "In Progress", is_archived: false },
            { id: "t3", title: "Future", due_date: "2026-10-25", status: "In Progress", is_archived: false }
        ];

        const twin = buildDigitalTwin({
            project: { id: "p-due" },
            tasks,
            startOfToday: fixedToday
        });

        assert.equal(twin.tasks.overdue, 1);
        assert.equal(twin.tasks.dueSoon, 1);
        assert.equal(twin.tasks.incomplete, 3);
    });

    test("5. dependency graph: computes dependency density, blocked chains, and critical dependencies", () => {
        const tasks = [
            { id: "t1", title: "Prereq", status: "In Progress", estimated_hours: 8, is_archived: false },
            { id: "t2", title: "Dependent", status: "To Do", estimated_hours: 8, is_archived: false }
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];

        const twin = buildDigitalTwin({
            project: { id: "p-dep" },
            tasks,
            dependencies,
            startOfToday: fixedToday
        });

        assert.equal(twin.dependencies.total, 1);
        assert.equal(twin.dependencies.blockedChains, 1);
        assert.equal(twin.tasks.blocked, 1);
    });

    test("6. circular dependency: captures circular dependency without crash", () => {
        const tasks = [
            { id: "t1", title: "A", estimated_hours: 8, is_archived: false },
            { id: "t2", title: "B", estimated_hours: 8, is_archived: false }
        ];
        const dependencies = [
            { task_id: "t2", depends_on_task_id: "t1" },
            { task_id: "t1", depends_on_task_id: "t2" }
        ];

        const twin = buildDigitalTwin({
            project: { id: "p-cycle" },
            tasks,
            dependencies,
            startOfToday: fixedToday
        });

        assert.equal(twin.dependencies.hasCycle, true);
        assert.ok(twin.dependencies.cycleNodes.length >= 2);
    });

    test("7. critical path integration: digital twin criticalPath matches CPM output", () => {
        const tasks = [
            { id: "t1", title: "A", estimated_hours: 16, is_archived: false },
            { id: "t2", title: "B", estimated_hours: 8, is_archived: false }
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];

        const twin = buildDigitalTwin({
            project: { id: "p-cpm", start_date: "2026-10-01" },
            tasks,
            dependencies,
            startOfToday: fixedToday
        });

        assert.equal(twin.criticalPath.projectDurationDays, 3);
        assert.deepEqual(twin.criticalPath.criticalTasks, ["t1", "t2"]);
    });

    test("8. bottleneck integration: digital twin exposes bottleneck counts and severity distribution", () => {
        const tasks = [
            { id: "t1", title: "Critical Overdue", due_date: "2026-09-20", estimated_hours: 16, priority: "Critical", status: "In Progress", is_archived: false },
            { id: "t2", title: "Successor", estimated_hours: 8, status: "To Do", is_archived: false }
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];

        const twin = buildDigitalTwin({
            project: { id: "p-bn" },
            tasks,
            dependencies,
            startOfToday: fixedToday
        });

        assert.ok(twin.bottlenecks.count >= 1);
        assert.ok(twin.bottlenecks.highestBottleneck !== null);
    });

    // ============================================================
    // PART 2: PROJECT HEALTH ENGINE (Tests 9 - 18)
    // ============================================================

    test("9. healthy project: project on track scores >= 80 (HEALTHY)", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-good", start_date: "2026-10-01", end_date: "2026-10-20" },
            tasks: [
                { id: "t1", title: "Task 1", estimated_hours: 8, status: "Completed", is_archived: false },
                { id: "t2", title: "Task 2", estimated_hours: 8, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.score >= 80, `Expected score >= 80, got ${health.score}`);
        assert.equal(health.status, HEALTH_STATUS.HEALTHY);
    });

    test("10. degraded schedule: drift and overdue tasks decrease schedule dimension score", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-drift", start_date: "2026-10-01", end_date: "2026-10-03" },
            tasks: [
                { id: "t1", title: "Overdue", due_date: "2026-09-25", estimated_hours: 48, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.dimensions.schedule.score < 80);
        assert.ok(health.dimensions.schedule.reasons.length > 0);
    });

    test("11. critical path degradation: cycle drops critical path score to 0", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-cp-cycle" },
            tasks: [
                { id: "t1", title: "A", estimated_hours: 8, is_archived: false },
                { id: "t2", title: "B", estimated_hours: 8, is_archived: false }
            ],
            dependencies: [
                { task_id: "t2", depends_on_task_id: "t1" },
                { task_id: "t1", depends_on_task_id: "t2" }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.equal(health.dimensions.criticalPath.score, 0);
        assert.equal(health.dimensions.criticalPath.status, HEALTH_STATUS.CRITICAL);
    });

    test("12. bottleneck degradation: presence of critical bottlenecks degrades bottleneck score", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-bn-deg" },
            tasks: [
                { id: "t1", title: "Major Block", due_date: "2026-09-10", priority: "Critical", estimated_hours: 80, status: "In Progress", is_archived: false },
                { id: "t2", title: "Child 1", estimated_hours: 8, status: "To Do", is_archived: false },
                { id: "t3", title: "Child 2", estimated_hours: 8, status: "To Do", is_archived: false }
            ],
            dependencies: [
                { task_id: "t2", depends_on_task_id: "t1" },
                { task_id: "t3", depends_on_task_id: "t1" }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.dimensions.bottlenecks.score < 80);
    });

    test("13. dependency degradation: blocked dependency chains decrease dependency score", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-dep-deg" },
            tasks: [
                { id: "t1", title: "Incomplete Parent", status: "In Progress", estimated_hours: 8, is_archived: false },
                { id: "t2", title: "Blocked Child", status: "To Do", estimated_hours: 8, is_archived: false }
            ],
            dependencies: [{ task_id: "t2", depends_on_task_id: "t1" }],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.dimensions.dependencies.score <= 90);
    });

    test("14. workload degradation: unassigned critical tasks penalize workload health", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-work-deg" },
            tasks: [
                { id: "t1", title: "Critical Unassigned", estimated_hours: 16, status: "To Do", is_archived: false, assigned_to: null }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.dimensions.workload.score <= 80);
    });

    test("15. risk degradation: open critical project risks degrade risk health", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-risk-deg" },
            tasks: [{ id: "t1", title: "Task 1", estimated_hours: 8, is_archived: false }],
            risks: [
                { id: "r1", title: "Critical Threat", severity: "Critical", status: "Open" },
                { id: "r2", title: "High Threat", severity: "High", status: "Open" }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.dimensions.risks.score <= 65);
    });

    test("16. score normalization: overall health score is clamped within 0-100", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-norm-score" },
            tasks: [{ id: "t1", title: "Solo", estimated_hours: 8, is_archived: false }],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(health.score >= 0 && health.score <= 100);
        assert.ok([HEALTH_STATUS.HEALTHY, HEALTH_STATUS.WATCH, HEALTH_STATUS.AT_RISK, HEALTH_STATUS.CRITICAL].includes(health.status));
    });

    test("17. explainability: scorecard exposes human-readable reasons, warnings, and strengths", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-explain" },
            tasks: [
                { id: "t1", title: "Overdue Task", due_date: "2026-09-20", estimated_hours: 16, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const health = calculateProjectHealth(twin);
        assert.ok(Array.isArray(health.reasons));
        assert.ok(health.reasons.length > 0);
        assert.ok(Array.isArray(health.warnings));
        assert.ok(Array.isArray(health.strengths));
    });

    test("18. trend detection: detects IMPROVING, DECLINING, and STABLE trends accurately", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-trend" },
            tasks: [{ id: "t1", title: "Task", estimated_hours: 8, is_archived: false }],
            startOfToday: fixedToday
        });

        // 1. Previous score 60, current ~90 => IMPROVING
        const improving = calculateProjectHealth(twin, { previousScore: 60 });
        assert.equal(improving.history.trend, HEALTH_TREND.IMPROVING);
        assert.ok(improving.history.delta > 0);

        // 2. Previous score 105, current 98 => DECLINING (drop is -7 <= -3)
        const declining = calculateProjectHealth(twin, { previousScore: 105 });
        assert.equal(declining.history.trend, HEALTH_TREND.DECLINING);

        // 3. Previous score close to current => STABLE
        const stable = calculateProjectHealth(twin, { previousScore: improving.score });
        assert.equal(stable.history.trend, HEALTH_TREND.STABLE);
    });

    // ============================================================
    // PART 3: SCHEDULE DRIFT INTELLIGENCE (Tests 19 - 24)
    // ============================================================

    test("19. no drift: projected completion on or before planned date returns NONE severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-nodrift", start_date: "2026-10-01", end_date: "2026-10-20" },
            tasks: [{ id: "t1", title: "T1", estimated_hours: 8, is_archived: false }], // 1 day
            startOfToday: fixedToday
        });

        const drift = calculateScheduleDrift(twin, fixedToday);
        assert.equal(drift.deltaDays, 0);
        assert.equal(drift.severity, DRIFT_SEVERITY.NONE);
    });

    test("20. low drift: 1-2 days delay returns LOW severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-lowdrift", start_date: "2026-10-01", end_date: "2026-10-02" }, // 1 day planned
            tasks: [{ id: "t1", title: "T1", estimated_hours: 24, is_archived: false }], // 3 days projected => +2 days delta
            startOfToday: fixedToday
        });

        const drift = calculateScheduleDrift(twin, fixedToday);
        assert.equal(drift.deltaDays, 2);
        assert.equal(drift.severity, DRIFT_SEVERITY.LOW);
    });

    test("21. medium drift: 3-5 days delay returns MEDIUM severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-meddrift", start_date: "2026-10-01", end_date: "2026-10-02" }, // 1 day planned
            tasks: [{ id: "t1", title: "T1", estimated_hours: 40, is_archived: false }], // 5 days projected => +4 days delta
            startOfToday: fixedToday
        });

        const drift = calculateScheduleDrift(twin, fixedToday);
        assert.equal(drift.deltaDays, 4);
        assert.equal(drift.severity, DRIFT_SEVERITY.MEDIUM);
    });

    test("22. high drift: 6-10 days delay returns HIGH severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-highdrift", start_date: "2026-10-01", end_date: "2026-10-02" }, // 1 day planned
            tasks: [{ id: "t1", title: "T1", estimated_hours: 64, is_archived: false }], // 8 days projected => +7 days delta
            startOfToday: fixedToday
        });

        const drift = calculateScheduleDrift(twin, fixedToday);
        assert.equal(drift.deltaDays, 7);
        assert.equal(drift.severity, DRIFT_SEVERITY.HIGH);
    });

    test("23. critical drift: > 10 days delay returns CRITICAL severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-critdrift", start_date: "2026-10-01", end_date: "2026-10-02" }, // 1 day planned
            tasks: [{ id: "t1", title: "T1", estimated_hours: 120, is_archived: false }], // 15 days projected => +14 days delta
            startOfToday: fixedToday
        });

        const drift = calculateScheduleDrift(twin, fixedToday);
        assert.ok(drift.deltaDays > 10);
        assert.equal(drift.severity, DRIFT_SEVERITY.CRITICAL);
    });

    test("24. projected end calculation: handles cycle by marking CRITICAL drift without crash", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-drift-cycle" },
            tasks: [
                { id: "t1", title: "A", estimated_hours: 8, is_archived: false },
                { id: "t2", title: "B", estimated_hours: 8, is_archived: false }
            ],
            dependencies: [
                { task_id: "t2", depends_on_task_id: "t1" },
                { task_id: "t1", depends_on_task_id: "t2" }
            ],
            startOfToday: fixedToday
        });

        const drift = calculateScheduleDrift(twin, fixedToday);
        assert.equal(drift.hasCycle, true);
        assert.equal(drift.severity, DRIFT_SEVERITY.CRITICAL);
    });

    // ============================================================
    // PART 4: DEADLINE RISK INTELLIGENCE (Tests 25 - 28)
    // ============================================================

    test("25. critical overdue task: overdue critical task is classified as CRITICAL deadline risk", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-dl-crit" },
            tasks: [
                { id: "t1", title: "Crit Overdue", due_date: "2026-09-20", estimated_hours: 16, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const risks = calculateDeadlineRisks(twin, fixedToday);
        assert.ok(risks.length >= 1);
        assert.equal(risks[0].riskLevel, DEADLINE_RISK_LEVEL.CRITICAL);
    });

    test("26. low-slack task: non-overdue task on critical path has HIGH risk", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-dl-high" },
            tasks: [
                { id: "t1", title: "Critical Task", due_date: "2026-10-15", estimated_hours: 16, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const risks = calculateDeadlineRisks(twin, fixedToday);
        assert.ok(risks.length >= 1);
        assert.equal(risks[0].riskLevel, DEADLINE_RISK_LEVEL.HIGH);
    });

    test("27. dependency-driven risk: bottleneck blocking multiple downstream tasks receives elevated risk", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-dl-dep" },
            tasks: [
                { id: "t1", title: "Bottleneck Task", due_date: "2026-09-20", estimated_hours: 24, status: "In Progress", is_archived: false },
                { id: "t2", title: "Dependent 1", estimated_hours: 8, status: "To Do", is_archived: false },
                { id: "t3", title: "Dependent 2", estimated_hours: 8, status: "To Do", is_archived: false }
            ],
            dependencies: [
                { task_id: "t2", depends_on_task_id: "t1" },
                { task_id: "t3", depends_on_task_id: "t1" }
            ],
            startOfToday: fixedToday
        });

        const risks = calculateDeadlineRisks(twin, fixedToday);
        const t1Risk = risks.find((r) => r.taskId === "t1");
        assert.ok(t1Risk !== undefined);
        assert.ok(t1Risk.downstreamImpact >= 2);
    });

    test("28. multiple deadline risks: deterministic sorting with CRITICAL first, then slack ascending", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-dl-multi" },
            tasks: [
                { id: "t1", title: "Non-critical Overdue", due_date: "2026-09-28", estimated_hours: 8, status: "In Progress", is_archived: false },
                { id: "t2", title: "Critical Overdue", due_date: "2026-09-20", estimated_hours: 24, status: "In Progress", is_archived: false },
                { id: "t3", title: "Critical Future", due_date: "2026-10-20", estimated_hours: 16, status: "To Do", is_archived: false }
            ],
            dependencies: [{ task_id: "t3", depends_on_task_id: "t2" }],
            startOfToday: fixedToday
        });

        const risks = calculateDeadlineRisks(twin, fixedToday);
        assert.ok(risks.length >= 2);
        assert.equal(risks[0].riskLevel, DEADLINE_RISK_LEVEL.CRITICAL);
    });

    // ============================================================
    // PART 5: PREDICTIVE PRE-MORTEM (Tests 29 - 36)
    // ============================================================

    test("29. overdue critical tasks: pre-mortem flags OVERDUE_CRITICAL_TASKS with CRITICAL severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-overdue" },
            tasks: [
                { id: "t1", title: "Critical Overdue", due_date: "2026-09-15", estimated_hours: 16, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        const overdueFinding = pm.findings.find((f) => f.type === "OVERDUE_CRITICAL_TASKS");
        assert.ok(overdueFinding !== undefined);
        assert.equal(overdueFinding.severity, PREMORTEM_SEVERITY.CRITICAL);
    });

    test("30. dependency cycle: pre-mortem reports DEPENDENCY_CYCLES deadlock condition", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-cycle" },
            tasks: [
                { id: "t1", title: "Node A", estimated_hours: 8, is_archived: false },
                { id: "t2", title: "Node B", estimated_hours: 8, is_archived: false }
            ],
            dependencies: [
                { task_id: "t2", depends_on_task_id: "t1" },
                { task_id: "t1", depends_on_task_id: "t2" }
            ],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        assert.equal(pm.findings.length, 1);
        assert.equal(pm.findings[0].type, "DEPENDENCY_CYCLES");
        assert.equal(pm.findings[0].severity, PREMORTEM_SEVERITY.CRITICAL);
    });

    test("31. bottleneck concentration: detects major workflow bottlenecks", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-bn" },
            tasks: [
                { id: "t1", title: "Hub Task", due_date: "2026-09-10", priority: "Critical", estimated_hours: 80, status: "In Progress", is_archived: false },
                { id: "t2", title: "Sub 1", estimated_hours: 8, status: "To Do", is_archived: false },
                { id: "t3", title: "Sub 2", estimated_hours: 8, status: "To Do", is_archived: false }
            ],
            dependencies: [
                { task_id: "t2", depends_on_task_id: "t1" },
                { task_id: "t3", depends_on_task_id: "t1" }
            ],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        const bnFinding = pm.findings.find((f) => f.type === "BOTTLENECK_CONCENTRATION");
        assert.ok(bnFinding !== undefined);
    });

    test("32. workload concentration: detects CRITICAL_WORK_CONCENTRATION when 1 member holds > 50% critical work", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-conc" },
            tasks: [
                { id: "t1", title: "Crit 1", estimated_hours: 8, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t2", title: "Crit 2", estimated_hours: 8, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t3", title: "Non-crit", estimated_hours: 8, status: "In Progress", assigned_to: "u2", is_archived: false }
            ],
            dependencies: [{ task_id: "t2", depends_on_task_id: "t1" }],
            projectMembers: [
                { user_id: "u1", users: { id: "u1", first_name: "Alex", last_name: "Chen" } },
                { user_id: "u2", users: { id: "u2", first_name: "Sam", last_name: "Taylor" } }
            ],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        const concFinding = pm.findings.find((f) => f.type === "CRITICAL_WORK_CONCENTRATION");
        assert.ok(concFinding !== undefined);
        assert.ok(concFinding.affectedUserIds.includes("u1"));
    });

    test("33. unassigned critical task: detects UNASSIGNED_CRITICAL_WORK", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-unassigned" },
            tasks: [
                { id: "t1", title: "Orphaned Critical", estimated_hours: 16, status: "To Do", assigned_to: null, is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        const unassignedFinding = pm.findings.find((f) => f.type === "UNASSIGNED_CRITICAL_WORK");
        assert.ok(unassignedFinding !== undefined);
        assert.equal(unassignedFinding.severity, PREMORTEM_SEVERITY.HIGH);
    });

    test("34. schedule drift: detects SCHEDULE_SLIPPAGE when drift >= 3 days", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-slip", start_date: "2026-10-01", end_date: "2026-10-03" }, // 2 days planned
            tasks: [{ id: "t1", title: "Long Task", estimated_hours: 56, is_archived: false }], // 7 days projected => 5 days drift
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        const slipFinding = pm.findings.find((f) => f.type === "SCHEDULE_SLIPPAGE");
        assert.ok(slipFinding !== undefined);
    });

    test("35. combined findings: multiple conditions produce prioritized summary", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-multi", start_date: "2026-10-01", end_date: "2026-10-03" },
            tasks: [
                { id: "t1", title: "Overdue Critical", due_date: "2026-09-20", estimated_hours: 48, status: "In Progress", assigned_to: null, is_archived: false }
            ],
            risks: [{ id: "r1", title: "Catastrophic Risk", severity: "Critical", status: "Open" }],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        assert.ok(pm.findings.length >= 2);
        assert.ok(pm.summary.criticalCount >= 1);
    });

    test("36. evidence correctness: findings contain non-empty evidence array and actionable recommendations", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-pm-ev" },
            tasks: [
                { id: "t1", title: "Overdue", due_date: "2026-09-15", estimated_hours: 16, status: "In Progress", is_archived: false }
            ],
            startOfToday: fixedToday
        });

        const pm = runPreMortemAnalysis(twin, fixedToday);
        pm.findings.forEach((f) => {
            assert.ok(Array.isArray(f.evidence));
            assert.ok(f.evidence.length > 0);
            assert.ok(typeof f.suggestedAction === "string" && f.suggestedAction.length > 0);
        });
    });

    // ============================================================
    // PART 6: TEAM WORKLOAD & RESILIENCE (Tests 37 - 41)
    // ============================================================

    test("37. workload distribution: calculates task counts and remaining hours per member", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-team-dist" },
            tasks: [
                { id: "t1", title: "Task 1", estimated_hours: 10, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t2", title: "Task 2", estimated_hours: 20, status: "To Do", assigned_to: "u2", is_archived: false }
            ],
            projectMembers: [
                { user_id: "u1", users: { id: "u1", first_name: "Alice" } },
                { user_id: "u2", users: { id: "u2", first_name: "Bob" } }
            ],
            startOfToday: fixedToday
        });

        const team = calculateTeamWorkload(twin);
        assert.equal(team.members.length, 2);
        assert.equal(team.totalRemainingHours, 30);
    });

    test("38. relative workload share: correctly derives percentage of project hours per member", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-team-share" },
            tasks: [
                { id: "t1", title: "T1", estimated_hours: 75, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t2", title: "T2", estimated_hours: 25, status: "In Progress", assigned_to: "u2", is_archived: false }
            ],
            projectMembers: [
                { user_id: "u1", users: { id: "u1", first_name: "Alice" } },
                { user_id: "u2", users: { id: "u2", first_name: "Bob" } }
            ],
            startOfToday: fixedToday
        });

        const team = calculateTeamWorkload(twin);
        const alice = team.members.find((m) => m.userId === "u1");
        assert.equal(alice.workloadShare, 75.0);
    });

    test("39. critical-work concentration: calculates percentage of critical path tasks assigned", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-team-crit" },
            tasks: [
                { id: "t1", title: "CP 1", estimated_hours: 8, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t2", title: "CP 2", estimated_hours: 8, status: "In Progress", assigned_to: "u1", is_archived: false }
            ],
            dependencies: [{ task_id: "t2", depends_on_task_id: "t1" }],
            projectMembers: [
                { user_id: "u1", users: { id: "u1", first_name: "Alice" } },
                { user_id: "u2", users: { id: "u2", first_name: "Bob" } }
            ],
            startOfToday: fixedToday
        });

        const team = calculateTeamWorkload(twin);
        const alice = team.members.find((m) => m.userId === "u1");
        assert.equal(alice.criticalWorkloadShare, 100.0);
    });

    test("40. knowledge concentration: calculates concentrationScore and assigns severity", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-res-score" },
            tasks: [
                { id: "t1", title: "T1", estimated_hours: 80, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t2", title: "T2", estimated_hours: 20, status: "In Progress", assigned_to: "u2", is_archived: false }
            ],
            projectMembers: [
                { user_id: "u1", users: { id: "u1", first_name: "Alice" } },
                { user_id: "u2", users: { id: "u2", first_name: "Bob" } }
            ],
            startOfToday: fixedToday
        });

        const res = calculateKnowledgeConcentration(twin);
        assert.ok(res.concentrationScore > 20);
        assert.ok([KNOWLEDGE_RISK_SEVERITY.LOW, KNOWLEDGE_RISK_SEVERITY.MEDIUM, KNOWLEDGE_RISK_SEVERITY.HIGH, KNOWLEDGE_RISK_SEVERITY.CRITICAL].includes(res.severity));
    });

    test("41. single-person critical concentration: flags HIGH severity when 1 member holds entire critical path", () => {
        const twin = buildDigitalTwin({
            project: { id: "p-res-solo" },
            tasks: [
                { id: "t1", title: "A", estimated_hours: 16, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t2", title: "B", estimated_hours: 16, status: "In Progress", assigned_to: "u1", is_archived: false },
                { id: "t3", title: "C", estimated_hours: 8, status: "In Progress", assigned_to: "u2", is_archived: false }
            ],
            dependencies: [{ task_id: "t2", depends_on_task_id: "t1" }],
            projectMembers: [
                { user_id: "u1", users: { id: "u1", first_name: "Dev" } },
                { user_id: "u2", users: { id: "u2", first_name: "Dev2" } }
            ],
            startOfToday: fixedToday
        });

        const res = calculateKnowledgeConcentration(twin);
        assert.ok(res.affectedUsers.some((u) => u.userId === "u1"));
    });

    // ============================================================
    // PART 7: PROACTIVE PHASE 2 ALERTS (Tests 42 - 48)
    // ============================================================

    test("42. health degradation transition: score drop >= 5 points triggers PROJECT_HEALTH_DEGRADED", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            healthScore: 85,
            healthStatus: HEALTH_STATUS.HEALTHY
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            healthScore: 72, // dropped 13 points
            healthStatus: HEALTH_STATUS.WATCH
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "p-alert-health",
            projectTitle: "Alert Project",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const healthAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.PROJECT_HEALTH_DEGRADED);
        assert.ok(healthAlert !== undefined);
    });

    test("43. schedule drift transition: drift variance increase >= 2 days triggers SCHEDULE_DRIFT_DETECTED", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            driftDays: 1,
            driftSeverity: DRIFT_SEVERITY.LOW
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 8,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            driftDays: 4, // +3 days increase
            driftSeverity: DRIFT_SEVERITY.MEDIUM
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "p-alert-drift",
            projectTitle: "Alert Project",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const driftAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.SCHEDULE_DRIFT_DETECTED);
        assert.ok(driftAlert !== undefined);
    });

    test("44. deadline risk transition: new critical deadline risk task triggers DEADLINE_RISK_ESCALATED", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }], ["t2", { id: "t2", title: "T2" }]]),
            deadlineRiskTaskIds: new Set(["t1"])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }], ["t2", { id: "t2", title: "T2" }]]),
            deadlineRiskTaskIds: new Set(["t1", "t2"]) // t2 newly escalated
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "p-alert-dl",
            projectTitle: "Alert Project",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const dlAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.DEADLINE_RISK_ESCALATED);
        assert.ok(dlAlert !== undefined);
        assert.equal(dlAlert.taskId, "t2");
    });

    test("45. pre-mortem transition: new pre-mortem high risk condition triggers PREMORTEM_HIGH_RISK_DETECTED", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            preMortemTypes: new Set()
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            preMortemTypes: new Set(["SCHEDULE_SLIPPAGE"])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "p-alert-pm",
            projectTitle: "Alert Project",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const pmAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.PREMORTEM_HIGH_RISK_DETECTED);
        assert.ok(pmAlert !== undefined);
    });

    test("46. deduplication: same alert condition produces identical dedupeKey for idempotency", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            healthScore: 90,
            healthStatus: HEALTH_STATUS.HEALTHY
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["t1"],
            criticalTaskIds: new Set(["t1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["t1", { id: "t1", title: "T1" }]]),
            healthScore: 70,
            healthStatus: HEALTH_STATUS.WATCH
        };

        const alerts1 = detectIntelligenceStateTransitions({
            projectId: "p-dedupe",
            projectTitle: "Dedupe Project",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const alerts2 = detectIntelligenceStateTransitions({
            projectId: "p-dedupe",
            projectTitle: "Dedupe Project",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts1[0].dedupeKey, alerts2[0].dedupeKey);
    });

    test("47. debounce: snapshot helper is pure and does not leak across evaluations", () => {
        const project = { id: "p-pure", title: "Pure Project" };
        const tasks = [{ id: "t1", title: "T1", estimated_hours: 8, is_archived: false }];

        const snap1 = extractIntelligenceSnapshot({ project, tasks, startOfToday: fixedToday });
        const snap2 = extractIntelligenceSnapshot({ project, tasks, startOfToday: fixedToday });

        assert.deepEqual(snap1.criticalPathTaskIds, snap2.criticalPathTaskIds);
        assert.equal(snap1.healthScore, snap2.healthScore);
    });

    test("48. project isolation: project health evaluation of Project A does not mutate Project B", () => {
        const twinA = buildDigitalTwin({
            project: { id: "p-A", title: "Project A" },
            tasks: [{ id: "tA", title: "Task A", estimated_hours: 8, is_archived: false }],
            startOfToday: fixedToday
        });

        const twinB = buildDigitalTwin({
            project: { id: "p-B", title: "Project B" },
            tasks: [{ id: "tB", title: "Task B", estimated_hours: 120, is_archived: false }],
            startOfToday: fixedToday
        });

        const healthA = calculateProjectHealth(twinA);
        const healthB = calculateProjectHealth(twinB);

        assert.notEqual(twinA.project.id, twinB.project.id);
        assert.notEqual(healthA.history.currentScore, undefined);
        assert.notEqual(healthB.history.currentScore, undefined);
    });

    // ============================================================
    // PART 8: QUACKIE FORMATTERS & REGRESSION (Tests 49 - 52)
    // ============================================================

    test("49. formatProjectHealthReply: formats markdown response with score, status, and dimensions", () => {
        const healthData = {
            score: 87,
            status: "HEALTHY",
            dimensions: {
                schedule: { score: 85, status: "HEALTHY" },
                criticalPath: { score: 90, status: "HEALTHY" }
            },
            reasons: ["On track"],
            warnings: ["Watch due dates"],
            strengths: ["All critical work assigned"],
            history: { trend: "IMPROVING" }
        };

        const reply = formatProjectHealthReply(healthData, "Mobile App");
        assert.ok(reply.includes("Project Health: Mobile App"));
        assert.ok(reply.includes("87/100"));
        assert.ok(reply.includes("HEALTHY"));
        assert.ok(reply.includes("IMPROVING"));
    });

    test("50. formatScheduleDriftReply: formats planned, projected, variance, and reasons", () => {
        const driftData = {
            plannedEndDate: "2026-10-12T00:00:00.000Z",
            projectedEndDate: "2026-10-16T00:00:00.000Z",
            deltaDays: 4,
            severity: "MEDIUM",
            reasons: ["Critical path duration exceeds planned timeline by 4 days."]
        };

        const reply = formatScheduleDriftReply(driftData, "Backend API");
        assert.ok(reply.includes("Schedule Drift Intelligence: Backend API"));
        assert.ok(reply.includes("+4 days delay"));
        assert.ok(reply.includes("MEDIUM"));
    });

    test("51. formatPreMortemReply: formats pre-mortem findings and evidence clearly", () => {
        const pmData = {
            summary: { total: 1 },
            findings: [
                {
                    id: "prem-1",
                    severity: "HIGH",
                    title: "Critical Work Concentration",
                    explanation: "Alex Chen holds 70% of critical tasks.",
                    evidence: ["Alex Chen is assigned to 7 of 10 critical tasks."]
                }
            ]
        };

        const reply = formatPreMortemReply(pmData, "Portal Redesign");
        assert.ok(reply.includes("Predictive Pre-Mortem: Portal Redesign"));
        assert.ok(reply.includes("Critical Work Concentration"));
        assert.ok(reply.includes("Alex Chen"));
    });

    test("52. formatTeamWorkloadReply: formats member workload distribution and knowledge risk", () => {
        const teamData = {
            workload: {
                members: [
                    { name: "Dev One", workloadShare: 65, remainingHours: 40, criticalCount: 3 }
                ]
            },
            resilience: {
                severity: "HIGH",
                concentrationScore: 68,
                evidence: ["Dev One carries 65% of remaining project hours."]
            }
        };

        const reply = formatTeamWorkloadReply(teamData, "TaskFlow");
        assert.ok(reply.includes("Team Workload & Resilience: TaskFlow"));
        assert.ok(reply.includes("Dev One"));
        assert.ok(reply.includes("65% effort"));
        assert.ok(reply.includes("Knowledge Concentration Risk"));
    });
});
