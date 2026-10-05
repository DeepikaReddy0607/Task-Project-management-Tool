import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
    extractIntelligenceSnapshot,
    detectIntelligenceStateTransitions,
    dispatchIntelligenceAlerts,
    scheduleProjectIntelligenceEvaluation,
    INTELLIGENCE_ALERT_TYPES,
    formatDateKey,
    getProjectBaseline,
    setProjectBaseline,
    clearAllBaselines
} from "../services/intelligenceAlertService.js";
import { BOTTLENECK_SEVERITIES } from "../services/bottleneckService.js";

describe("PHASE 1C: Proactive Project Intelligence Alerts Test Suite", () => {
    const fixedToday = new Date("2026-10-02T00:00:00.000Z");
    const testDateKey = "2026-10-02";

    beforeEach(() => {
        clearAllBaselines();
    });

    // ============================================================
    // 1. CRITICAL_PATH_CHANGED (Detectors 1 - 4)
    // ============================================================
    test("1. Critical path changes sequence (A->B to A->C) triggers CRITICAL_PATH_CHANGED alert with WARNING", () => {
        const prevCp = [
            { taskId: "task-A", title: "Task A" },
            { taskId: "task-B", title: "Task B" }
        ];
        const nextCp = [
            { taskId: "task-A", title: "Task A" },
            { taskId: "task-C", title: "Task C" }
        ];

        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A", "task-B"],
            criticalPath: prevCp,
            criticalTaskIds: new Set(["task-A", "task-B"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5, // Same duration
            criticalPathTaskIds: ["task-A", "task-C"],
            criticalPath: nextCp,
            criticalTaskIds: new Set(["task-A", "task-C"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-C", { id: "task-C", title: "Task C" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            projectTitle: "Alpha Launch",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const cpAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_PATH_CHANGED);
        assert.ok(cpAlert, "Expected CRITICAL_PATH_CHANGED alert");
        assert.equal(cpAlert.severity, "WARNING");
        assert.equal(cpAlert.dedupeKey, "cp-changed:proj-1:task-A,task-B:task-A,task-C");
        assert.ok(cpAlert.message.includes("Task A ➔ Task B ➔ Task A ➔ Task C"));
    });

    test("2. Critical path changes sequence AND duration increases triggers CRITICAL_PATH_CHANGED with HIGH severity", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 7, // Duration increased
            criticalPathTaskIds: ["task-A", "task-B"],
            criticalPath: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            criticalTaskIds: new Set(["task-A", "task-B"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            projectTitle: "Alpha Launch",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const cpAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_PATH_CHANGED);
        assert.ok(cpAlert);
        assert.equal(cpAlert.severity, "HIGH");
    });

    test("3. Unchanged critical path sequence does NOT trigger CRITICAL_PATH_CHANGED", () => {
        const state = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1", "task-2"],
            criticalPath: [
                { taskId: "task-1", title: "Task 1" },
                { taskId: "task-2", title: "Task 2" }
            ],
            criticalTaskIds: new Set(["task-1", "task-2"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-1", { id: "task-1", title: "Task 1" }],
                ["task-2", { id: "task-2", title: "Task 2" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState: state,
            currentState: state,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_PATH_CHANGED).length, 0);
    });

    test("4. Project with empty initial critical path does NOT fire CRITICAL_PATH_CHANGED", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 0,
            criticalPathTaskIds: [],
            criticalPath: [],
            criticalTaskIds: new Set(),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map()
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 3,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_PATH_CHANGED).length, 0);
    });

    // ============================================================
    // 2. NEW_CRITICAL_TASK (Detectors 5 - 7)
    // ============================================================
    test("5. Previously non-critical task becoming critical triggers NEW_CRITICAL_TASK", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B (Previously Non-Critical)" }]
            ])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 8,
            criticalPathTaskIds: ["task-A", "task-B"],
            criticalPath: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B (Previously Non-Critical)" }
            ],
            criticalTaskIds: new Set(["task-A", "task-B"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B (Previously Non-Critical)" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            projectTitle: "Beta",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const newCrit = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.NEW_CRITICAL_TASK);
        assert.ok(newCrit);
        assert.equal(newCrit.taskId, "task-B");
        assert.equal(newCrit.severity, "WARNING");
        assert.equal(newCrit.dedupeKey, `new-critical:proj-1:task-B:${testDateKey}`);
        assert.ok(newCrit.message.includes("Task B (Previously Non-Critical)"));
    });

    test("6. Task already critical in previous state does NOT trigger NEW_CRITICAL_TASK", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.NEW_CRITICAL_TASK).length, 0);
    });

    test("7. Non-critical task that remains non-critical does NOT trigger NEW_CRITICAL_TASK", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const currentState = {
            ...previousState,
            // Task B slack changed from 3 to 1, but still not 0 (not in criticalTaskIds)
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.NEW_CRITICAL_TASK).length, 0);
    });

    // ============================================================
    // 3. CRITICAL_TASK_OVERDUE (Detectors 8 - 10)
    // ============================================================
    test("8. Critical task transitioning from non-overdue to overdue triggers CRITICAL_TASK_OVERDUE with CRITICAL severity", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-crit"],
            criticalPath: [{ taskId: "task-crit", title: "Deploy Engine" }],
            criticalTaskIds: new Set(["task-crit"]),
            overdueCriticalTaskIds: new Set(), // Was not overdue
            bottlenecks: new Map(),
            tasksMap: new Map([["task-crit", { id: "task-crit", title: "Deploy Engine", due_date: "2026-10-05" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-crit"],
            criticalPath: [{ taskId: "task-crit", title: "Deploy Engine" }],
            criticalTaskIds: new Set(["task-crit"]),
            overdueCriticalTaskIds: new Set(["task-crit"]), // Now overdue!
            bottlenecks: new Map(),
            tasksMap: new Map([["task-crit", { id: "task-crit", title: "Deploy Engine", due_date: "2026-09-30" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const overdueAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_TASK_OVERDUE);
        assert.ok(overdueAlert);
        assert.equal(overdueAlert.severity, "CRITICAL");
        assert.equal(overdueAlert.taskId, "task-crit");
        assert.equal(overdueAlert.dedupeKey, `crit-overdue:proj-1:task-crit:${testDateKey}`);
        assert.ok(overdueAlert.message.includes("Deploy Engine"));
    });

    test("9. Non-critical task becoming overdue does NOT trigger CRITICAL_TASK_OVERDUE", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-crit"],
            criticalPath: [{ taskId: "task-crit", title: "Task Crit" }],
            criticalTaskIds: new Set(["task-crit"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-crit", { id: "task-crit", title: "Task Crit" }],
                ["task-side", { id: "task-side", title: "Side Task", due_date: "2026-10-05" }]
            ])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-crit"],
            criticalPath: [{ taskId: "task-crit", title: "Task Crit" }],
            criticalTaskIds: new Set(["task-crit"]), // task-side is NOT critical
            overdueCriticalTaskIds: new Set(), // only critical tasks are in overdueCriticalTaskIds
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-crit", { id: "task-crit", title: "Task Crit" }],
                ["task-side", { id: "task-side", title: "Side Task", due_date: "2026-09-30" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_TASK_OVERDUE).length, 0);
    });

    test("10. Already-overdue critical task does NOT re-trigger CRITICAL_TASK_OVERDUE in next transition", () => {
        const state = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-crit"],
            criticalPath: [{ taskId: "task-crit", title: "Task Crit" }],
            criticalTaskIds: new Set(["task-crit"]),
            overdueCriticalTaskIds: new Set(["task-crit"]), // Already overdue in both
            bottlenecks: new Map(),
            tasksMap: new Map([["task-crit", { id: "task-crit", title: "Task Crit" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState: state,
            currentState: state,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_TASK_OVERDUE).length, 0);
    });

    // ============================================================
    // 4. BOTTLENECK_ESCALATED (Detectors 11 - 13)
    // ============================================================
    test("11. Task bottleneck escalating from MEDIUM to HIGH triggers BOTTLENECK_ESCALATED with HIGH severity", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "MEDIUM", score: 45, directCount: 2 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "HIGH", score: 72, directCount: 4 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const escAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.BOTTLENECK_ESCALATED);
        assert.ok(escAlert);
        assert.equal(escAlert.severity, "HIGH");
        assert.equal(escAlert.taskId, "task-1");
        assert.equal(escAlert.dedupeKey, "bn-escalated:proj-1:task-1:MEDIUM:HIGH");
        assert.ok(escAlert.message.includes("MEDIUM to HIGH"));
        assert.ok(escAlert.message.includes("Score: 72"));
    });

    test("12. Task bottleneck escalating from HIGH to CRITICAL triggers BOTTLENECK_ESCALATED with CRITICAL severity", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "HIGH", score: 75, directCount: 3 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "CRITICAL", score: 92, directCount: 5 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const escAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.BOTTLENECK_ESCALATED);
        assert.ok(escAlert);
        assert.equal(escAlert.severity, "CRITICAL");
        assert.equal(escAlert.dedupeKey, "bn-escalated:proj-1:task-1:HIGH:CRITICAL");
    });

    test("13. Task bottleneck whose severity decreases or stays unchanged does NOT trigger escalation", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "HIGH", score: 75 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "MEDIUM", score: 40 }] // Decreased
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.BOTTLENECK_ESCALATED).length, 0);
    });

    // ============================================================
    // 5. NEW_MAJOR_BOTTLENECK (Detectors 14 - 16)
    // ============================================================
    test("14. Task newly emerging as a MEDIUM/HIGH bottleneck triggers NEW_MAJOR_BOTTLENECK", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-B", { taskId: "task-B", title: "Task B", severity: "LOW", score: 10 }] // Was LOW
            ]),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-B", { taskId: "task-B", title: "Task B", severity: "HIGH", score: 68, directCount: 3 }] // Now HIGH!
            ]),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const newMajor = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.NEW_MAJOR_BOTTLENECK);
        assert.ok(newMajor);
        assert.equal(newMajor.severity, "HIGH");
        assert.equal(newMajor.taskId, "task-B");
        assert.equal(newMajor.dedupeKey, "new-major-bn:proj-1:task-B:HIGH");
        assert.ok(newMajor.message.includes("emerged as a HIGH bottleneck"));
    });

    test("15. Task newly emerging with CRITICAL severity gets CRITICAL severity alert", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(), // Did not exist in bottlenecks
            tasksMap: new Map([["task-C", { id: "task-C", title: "Task C" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-C", { taskId: "task-C", title: "Task C", severity: "CRITICAL", score: 85, directCount: 4 }]
            ]),
            tasksMap: new Map([["task-C", { id: "task-C", title: "Task C" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const newCrit = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.NEW_MAJOR_BOTTLENECK);
        assert.ok(newCrit);
        assert.equal(newCrit.severity, "CRITICAL");
    });

    test("16. Existing major bottleneck escalating does NOT trigger NEW_MAJOR_BOTTLENECK", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "MEDIUM", score: 45 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 4,
            criticalPathTaskIds: ["task-1"],
            criticalPath: [{ taskId: "task-1", title: "Task 1" }],
            criticalTaskIds: new Set(["task-1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map([
                ["task-1", { taskId: "task-1", title: "Task 1", severity: "HIGH", score: 70 }]
            ]),
            tasksMap: new Map([["task-1", { id: "task-1", title: "Task 1" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.NEW_MAJOR_BOTTLENECK).length, 0);
        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.BOTTLENECK_ESCALATED).length, 1);
    });

    // ============================================================
    // 6. PROJECT_DURATION_INCREASED (Detectors 17 - 18)
    // ============================================================
    test("17. Projected project duration increasing triggers PROJECT_DURATION_INCREASED with HIGH severity", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 10,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 14, // +4 days
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            projectTitle: "Apollo Launch",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const durAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.PROJECT_DURATION_INCREASED);
        assert.ok(durAlert);
        assert.equal(durAlert.severity, "HIGH");
        assert.equal(durAlert.dedupeKey, "duration-inc:proj-1:10:14");
        assert.ok(durAlert.message.includes("increased by 4 days (from 10d to 14d)"));
    });

    test("18. Project duration remaining unchanged or decreasing does NOT trigger duration alert", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 10,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 8, // Decreased duration
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.filter((a) => a.type === INTELLIGENCE_ALERT_TYPES.PROJECT_DURATION_INCREASED).length, 0);
    });

    // ============================================================
    // 7. CYCLE_DETECTED (Detectors 19 - 21)
    // ============================================================
    test("19. Introducing a circular dependency triggers CYCLE_DETECTED with CRITICAL severity", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A", "task-B"],
            criticalPath: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            criticalTaskIds: new Set(["task-A", "task-B"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const currentState = {
            hasCycle: true,
            cycleNodeIds: ["task-A", "task-B"],
            cycleNodes: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            projectCriticalPathDays: 0,
            criticalPathTaskIds: [],
            criticalPath: [],
            criticalTaskIds: new Set(),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            projectTitle: "Platform Core",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        const cycleAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.CYCLE_DETECTED);
        assert.ok(cycleAlert);
        assert.equal(cycleAlert.severity, "CRITICAL");
        assert.equal(cycleAlert.dedupeKey, "cycle-detected:proj-1:task-A,task-B");
        assert.ok(cycleAlert.message.includes('"Task A", "Task B"'));
    });

    test("20. When a cycle is present, schedule alerts (critical path, duration, bottlenecks) are suppressed", () => {
        const previousState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const currentState = {
            hasCycle: true,
            cycleNodeIds: ["task-A", "task-B"],
            cycleNodes: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            projectCriticalPathDays: 0,
            criticalPathTaskIds: [],
            criticalPath: [],
            criticalTaskIds: new Set(),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map()
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState,
            currentState,
            dateKey: testDateKey
        });

        // Only CYCLE_DETECTED should be returned
        assert.equal(alerts.length, 1);
        assert.equal(alerts[0].type, INTELLIGENCE_ALERT_TYPES.CYCLE_DETECTED);
    });

    test("21. Existing cycle continuing does NOT re-trigger CYCLE_DETECTED", () => {
        const state = {
            hasCycle: true,
            cycleNodeIds: ["task-A", "task-B"],
            cycleNodes: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            projectCriticalPathDays: 0,
            criticalPathTaskIds: [],
            criticalPath: [],
            criticalTaskIds: new Set(),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map()
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState: state,
            currentState: state,
            dateKey: testDateKey
        });

        assert.equal(alerts.length, 0);
    });

    // ============================================================
    // 8. SYSTEM BEHAVIOR, DEBOUNCE & RECIPIENTS (Detectors 22 - 26)
    // ============================================================
    test("22. Baseline initialization (cold-start) returns 0 alerts to avoid alert blast", () => {
        const currentState = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["task-A", { id: "task-A", title: "Task A" }]])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-1",
            previousState: null, // First evaluation / cold start
            currentState,
            dateKey: testDateKey
        });

        assert.equal(alerts.length, 0);
    });

    test("23. Debounce mechanism coalesces multiple rapid updates for the same project", async () => {
        let executionCount = 0;
        const testProjectId = "proj-debounce-test";

        // Mock schedule with short debounce timer
        scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 50
        });
        scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 50
        });
        scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 50
        });

        // Wait 100ms for timer to expire
        await new Promise((resolve) => setTimeout(resolve, 80));

        // Baseline can be retrieved and clean up worked
        clearAllBaselines();
    });

    test("24. Project isolation: baseline updates to Project A do not affect Project B", () => {
        const stateA = {
            projectId: "proj-A",
            projectTitle: "Project A",
            hasCycle: false,
            projectCriticalPathDays: 10,
            criticalPathTaskIds: ["tA1"],
            criticalPath: [{ taskId: "tA1", title: "Task A1" }],
            criticalTaskIds: new Set(["tA1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["tA1", { id: "tA1", title: "Task A1" }]])
        };

        const stateB = {
            projectId: "proj-B",
            projectTitle: "Project B",
            hasCycle: false,
            projectCriticalPathDays: 20,
            criticalPathTaskIds: ["tB1"],
            criticalPath: [{ taskId: "tB1", title: "Task B1" }],
            criticalTaskIds: new Set(["tB1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["tB1", { id: "tB1", title: "Task B1" }]])
        };

        setProjectBaseline("proj-A", stateA);
        setProjectBaseline("proj-B", stateB);

        assert.equal(getProjectBaseline("proj-A").projectCriticalPathDays, 10);
        assert.equal(getProjectBaseline("proj-B").projectCriticalPathDays, 20);

        // Update Project A only
        const updatedA = { ...stateA, projectCriticalPathDays: 15 };
        setProjectBaseline("proj-A", updatedA);

        assert.equal(getProjectBaseline("proj-A").projectCriticalPathDays, 15);
        assert.equal(getProjectBaseline("proj-B").projectCriticalPathDays, 20);
    });

    test("25. Recipient resolution includes manager, project members, and assigned task owner without duplicates", async () => {
        const mockPrisma = {
            projects: {
                findUnique: async () => ({
                    id: "proj-multi",
                    title: "Multi Recipient Project",
                    manager_id: "mgr-1",
                    project_members: [
                        { user_id: "mem-1" },
                        { user_id: "mem-2" },
                        { user_id: "mgr-1" } // Duplicate manager in members
                    ]
                })
            },
            notifications: {
                findFirst: async () => null,
                create: async ({ data }) => ({
                    id: `notif-${data.user_id}`,
                    ...data,
                    created_at: new Date()
                })
            }
        };

        const alerts = [
            {
                type: INTELLIGENCE_ALERT_TYPES.NEW_CRITICAL_TASK,
                severity: "WARNING",
                title: "New Critical Task",
                message: 'Task "Core API" is critical',
                projectId: "proj-multi",
                taskId: "task-assigned",
                dedupeKey: "new-critical:proj-multi:task-assigned:2026-10-02",
                targetTask: {
                    id: "task-assigned",
                    assigned_to: "dev-assigned" // Dedicated task assignee
                }
            }
        ];

        const dispatched = await dispatchIntelligenceAlerts({
            projectId: "proj-multi",
            alerts,
            prismaClient: mockPrisma,
            createAlert: async (data) => ({ id: `notif-${data.userId}`, ...data })
        });

        // mgr-1, mem-1, mem-2, dev-assigned = 4 unique recipients
        assert.equal(dispatched.length, 4);
    });

    test("26. extractIntelligenceSnapshot builds accurate pure state from CPM and Bottleneck engines", () => {
        const project = { id: "p-snap", title: "Snapshot Project", start_date: "2026-10-01" };
        const tasks = [
            { id: "t1", title: "Task 1", estimated_hours: 16, status: "In Progress", is_archived: false },
            { id: "t2", title: "Task 2", estimated_hours: 8, status: "To Do", is_archived: false }
        ];
        const dependencies = [{ task_id: "t2", depends_on_task_id: "t1" }];

        const snapshot = extractIntelligenceSnapshot({
            project,
            tasks,
            dependencies,
            startOfToday: fixedToday
        });

        assert.equal(snapshot.hasCycle, false);
        assert.equal(snapshot.projectCriticalPathDays, 3); // 2d + 1d
        assert.deepEqual(snapshot.criticalPathTaskIds, ["t1", "t2"]);
        assert.ok(snapshot.criticalTaskIds.has("t1"));
        assert.ok(snapshot.criticalTaskIds.has("t2"));
        assert.equal(snapshot.tasksMap.size, 2);
    });

    // ============================================================
    // 9. DEPENDENCY EVENT EMISSION & INTELLIGENCE HOOKS (Detectors 27 - 34)
    // ============================================================
    test("27. dependency.created triggers project intelligence evaluation", async () => {
        const testProjectId = "proj-dep-create-test";

        const { processEventForAlerts } = await import("../services/quackieAlertService.js");
        await processEventForAlerts({
            type: "dependency.created",
            projectId: testProjectId,
            taskId: "t1",
            data: {
                dependencyId: "dep-1",
                projectId: testProjectId,
                taskId: "t1",
                dependsOnTaskId: "t2"
            }
        });

        const timer = scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 50
        });
        assert.ok(timer);
        clearAllBaselines();
    });

    test("28. dependency.updated triggers project intelligence evaluation", async () => {
        const testProjectId = "proj-dep-update-test";
        const { processEventForAlerts } = await import("../services/quackieAlertService.js");
        await processEventForAlerts({
            type: "dependency.updated",
            projectId: testProjectId,
            taskId: "t1",
            data: {
                dependencyId: "dep-1",
                projectId: testProjectId,
                taskId: "t1",
                dependsOnTaskId: "t3"
            }
        });

        const timer = scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 50
        });
        assert.ok(timer);
        clearAllBaselines();
    });

    test("29. dependency.deleted triggers project intelligence evaluation", async () => {
        const testProjectId = "proj-dep-delete-test";
        const { processEventForAlerts } = await import("../services/quackieAlertService.js");
        await processEventForAlerts({
            type: "dependency.deleted",
            projectId: testProjectId,
            taskId: "t1",
            data: {
                dependencyId: "dep-1",
                projectId: testProjectId,
                taskId: "t1",
                dependsOnTaskId: "t2"
            }
        });

        const timer = scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 50
        });
        assert.ok(timer);
        clearAllBaselines();
    });

    test("30. dependency event for Project A cannot evaluate Project B", async () => {
        const projectA = "proj-A-iso";
        const projectB = "proj-B-iso";

        setProjectBaseline(projectA, {
            projectId: projectA,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["tA1"],
            criticalPath: [{ taskId: "tA1", title: "Task A1" }],
            criticalTaskIds: new Set(["tA1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["tA1", { id: "tA1", title: "Task A1" }]])
        });

        setProjectBaseline(projectB, {
            projectId: projectB,
            projectCriticalPathDays: 10,
            criticalPathTaskIds: ["tB1"],
            criticalPath: [{ taskId: "tB1", title: "Task B1" }],
            criticalTaskIds: new Set(["tB1"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([["tB1", { id: "tB1", title: "Task B1" }]])
        });

        const { processEventForAlerts } = await import("../services/quackieAlertService.js");
        await processEventForAlerts({
            type: "dependency.created",
            projectId: projectA,
            taskId: "tA1",
            data: {
                projectId: projectA,
                taskId: "tA1",
                dependsOnTaskId: "tA2"
            }
        });

        const baselineB = getProjectBaseline(projectB);
        assert.equal(baselineB.projectCriticalPathDays, 10);
        assert.deepEqual(baselineB.criticalPathTaskIds, ["tB1"]);
        clearAllBaselines();
    });

    test("31. dependency event with unchanged intelligence produces no alert", () => {
        const stateBefore = {
            hasCycle: false,
            projectCriticalPathDays: 2,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const stateAfter = {
            hasCycle: false,
            projectCriticalPathDays: 2,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-dep-noop",
            previousState: stateBefore,
            currentState: stateAfter,
            dateKey: testDateKey
        });

        assert.equal(alerts.length, 0);
    });

    test("32. dependency change causing critical-path change produces CRITICAL_PATH_CHANGED", () => {
        const stateBefore = {
            hasCycle: false,
            projectCriticalPathDays: 3,
            criticalPathTaskIds: ["task-A"],
            criticalPath: [{ taskId: "task-A", title: "Task A" }],
            criticalTaskIds: new Set(["task-A"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const stateAfter = {
            hasCycle: false,
            projectCriticalPathDays: 6,
            criticalPathTaskIds: ["task-A", "task-B"],
            criticalPath: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            criticalTaskIds: new Set(["task-A", "task-B"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-dep-cp",
            projectTitle: "Dependency Project",
            previousState: stateBefore,
            currentState: stateAfter,
            dateKey: testDateKey
        });

        const cpAlert = alerts.find((a) => a.type === INTELLIGENCE_ALERT_TYPES.CRITICAL_PATH_CHANGED);
        assert.ok(cpAlert);
        assert.equal(cpAlert.severity, "HIGH");
    });

    test("33. dependency change causing cycle produces CYCLE_DETECTED", () => {
        const stateBefore = {
            hasCycle: false,
            projectCriticalPathDays: 5,
            criticalPathTaskIds: ["task-A", "task-B"],
            criticalPath: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            criticalTaskIds: new Set(["task-A", "task-B"]),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const stateAfter = {
            hasCycle: true,
            cycleNodeIds: ["task-A", "task-B"],
            cycleNodes: [
                { taskId: "task-A", title: "Task A" },
                { taskId: "task-B", title: "Task B" }
            ],
            projectCriticalPathDays: 0,
            criticalPathTaskIds: [],
            criticalPath: [],
            criticalTaskIds: new Set(),
            overdueCriticalTaskIds: new Set(),
            bottlenecks: new Map(),
            tasksMap: new Map([
                ["task-A", { id: "task-A", title: "Task A" }],
                ["task-B", { id: "task-B", title: "Task B" }]
            ])
        };

        const alerts = detectIntelligenceStateTransitions({
            projectId: "proj-dep-cycle",
            projectTitle: "Cycle Project",
            previousState: stateBefore,
            currentState: stateAfter,
            dateKey: testDateKey
        });

        assert.equal(alerts.length, 1);
        assert.equal(alerts[0].type, INTELLIGENCE_ALERT_TYPES.CYCLE_DETECTED);
        assert.equal(alerts[0].severity, "CRITICAL");
    });

    test("34. rapid dependency events are still coalesced by existing 400ms debounce", async () => {
        const testProjectId = "proj-dep-debounce";

        scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 60
        });
        scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 60
        });
        scheduleProjectIntelligenceEvaluation({
            projectId: testProjectId,
            debounceMs: 60
        });

        await new Promise((resolve) => setTimeout(resolve, 90));
        clearAllBaselines();
    });
});
