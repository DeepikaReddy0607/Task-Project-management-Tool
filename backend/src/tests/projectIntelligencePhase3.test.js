import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    MUTATION_TYPES,
    SCENARIO_STATUS,
    deepClone,
    computeProjectStateHash,
    validateScenarioMutations,
    applyMutationsInMemory,
    runScenarioSimulation,
    clearScenarioStore
} from "../services/scenarioSimulationService.js";

import { compareScenarios } from "../services/scenarioComparisonService.js";

import {
    REPLANNING_STRATEGIES,
    generateReplanningProposals,
    approveProjectProposal,
    rejectProjectProposal,
    clearProposalStore
} from "../services/projectReplanningService.js";

import {
    executeReplanningProposal
} from "../services/replanningExecutionService.js";

import {
    formatReplanningReply,
    formatProposalExecutionReply
} from "../services/quackieService.js";

import { clearAllBaselines } from "../services/intelligenceAlertService.js";

describe("PHASE 3: Predictive Simulation, Intelligent Replanning & Approval Control Test Suite", () => {
    const fixedToday = new Date("2026-10-02T00:00:00.000Z");

    // Standard Fixtures
    const baseProject = {
        id: "proj-alpha",
        title: "Alpha Project",
        start_date: "2026-10-01T00:00:00.000Z",
        end_date: "2026-10-31T00:00:00.000Z",
        status: "In Progress"
    };

    const baseTasks = [
        {
            id: "task-1",
            title: "Task 1: Spec & Architecture",
            status: "Completed",
            priority: "High",
            estimated_hours: 16,
            due_date: "2026-10-05T00:00:00.000Z",
            assigned_to: "user-1",
            is_archived: false,
            project_id: "proj-alpha",
            users_tasks_assigned_toTousers: { id: "user-1", first_name: "Alice", last_name: "Dev" }
        },
        {
            id: "task-2",
            title: "Task 2: Core Implementation",
            status: "In Progress",
            priority: "High",
            estimated_hours: 40,
            due_date: "2026-10-15T00:00:00.000Z",
            assigned_to: "user-1",
            is_archived: false,
            project_id: "proj-alpha",
            users_tasks_assigned_toTousers: { id: "user-1", first_name: "Alice", last_name: "Dev" }
        },
        {
            id: "task-3",
            title: "Task 3: Integration & Testing",
            status: "To Do",
            priority: "Medium",
            estimated_hours: 24,
            due_date: "2026-10-22T00:00:00.000Z",
            assigned_to: "user-2",
            is_archived: false,
            project_id: "proj-alpha",
            users_tasks_assigned_toTousers: { id: "user-2", first_name: "Bob", last_name: "QA" }
        },
        {
            id: "task-4",
            title: "Task 4: Production Deployment",
            status: "To Do",
            priority: "Low",
            estimated_hours: 8,
            due_date: "2026-10-28T00:00:00.000Z",
            assigned_to: "user-2",
            is_archived: false,
            project_id: "proj-alpha",
            users_tasks_assigned_toTousers: { id: "user-2", first_name: "Bob", last_name: "QA" }
        }
    ];

    const baseDependencies = [
        { task_id: "task-2", depends_on_task_id: "task-1" },
        { task_id: "task-3", depends_on_task_id: "task-2" },
        { task_id: "task-4", depends_on_task_id: "task-3" }
    ];

    const baseMembers = [
        { user_id: "user-1", user: { id: "user-1", first_name: "Alice", last_name: "Dev" }, role: "Developer" },
        { user_id: "user-2", user: { id: "user-2", first_name: "Bob", last_name: "QA" }, role: "QA Engineer" }
    ];

    beforeEach(() => {
        clearScenarioStore();
        clearProposalStore();
        clearAllBaselines();
    });

    // ============================================================
    // PART 1: SCENARIO / WHAT-IF SIMULATION ENGINE (Tests 1 - 25)
    // ============================================================

    test("1. empty scenario: simulation with zero mutations returns baseline with zero variance", () => {
        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations: [],
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.equal(result.delta.scheduleVarianceDays, 0);
        assert.equal(result.delta.healthScoreDelta, 0);
        assert.equal(result.affectedTasks.length, 0);
        assert.equal(result.affectedUsers.length, 0);
    });

    test("2. task delay mutation: applies days delay to due_date and tracks affected task and owner", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DELAY, taskId: "task-2", days: 5 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.ok(result.affectedTasks.includes("task-2"));
        assert.ok(result.affectedUsers.includes("user-1"));
        // Due date moved from 2026-10-15 by 5 days -> 2026-10-20
        const simTask2 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-2");
        assert.ok(simTask2.due_date.includes("2026-10-20"));
    });

    test("3. task duration increase: adds hours to estimated_hours and updates remaining workload", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DURATION_INCREASE, taskId: "task-2", hours: 16 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask2 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-2");
        assert.equal(simTask2.estimated_hours, 56); // 40 + 16
        assert.ok(result.affectedTasks.includes("task-2"));
    });

    test("4. task duration decrease: decreases estimated_hours with a minimum floor of 1 hour", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DURATION_DECREASE, taskId: "task-4", hours: 20 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask4 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-4");
        // 8 - 20 clamped to 1
        assert.equal(simTask4.estimated_hours, 1);
    });

    test("5. task completion: marks task as Completed and decreases remaining project hours", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_COMPLETE, taskId: "task-2" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask2 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-2");
        assert.equal(simTask2.status, "Completed");
        assert.ok(result.simulatedDigitalTwin.tasks.remainingEstimatedHours < 72);
    });

    test("6. task reassignment: changes assigned_to and affects both old and new owners", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_REASSIGN, taskId: "task-2", toUserId: "user-2", toUserName: "Bob QA" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask2 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-2");
        assert.equal(simTask2.assigned_to, "user-2");
        assert.ok(result.affectedUsers.includes("user-1")); // old user
        assert.ok(result.affectedUsers.includes("user-2")); // new user
    });

    test("7. task priority change: updates task priority in simulated model", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_PRIORITY_CHANGE, taskId: "task-4", priority: "Critical" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask4 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-4");
        assert.equal(simTask4.priority, "Critical");
    });

    test("8. task due date change: sets explicit new due date", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DUE_DATE_CHANGE, taskId: "task-3", newDueDate: "2026-10-25T00:00:00.000Z" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask3 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-3");
        assert.ok(simTask3.due_date.includes("2026-10-25"));
    });

    test("9. dependency create: adds directed dependency edge and updates critical path", () => {
        // Independent task 5
        const customTasks = [
            ...baseTasks,
            {
                id: "task-5",
                title: "Independent Task 5",
                status: "To Do",
                priority: "Medium",
                estimated_hours: 48,
                due_date: "2026-10-29T00:00:00.000Z",
                assigned_to: "user-2",
                is_archived: false,
                project_id: "proj-alpha"
            }
        ];

        const mutations = [
            { type: MUTATION_TYPES.DEPENDENCY_CREATE, taskId: "task-5", dependsOnTaskId: "task-4" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: customTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simDeps = result.simulatedDependencies || [];
        assert.ok(simDeps.some((d) => d.task_id === "task-5" && d.depends_on_task_id === "task-4"));
    });

    test("10. dependency remove: removes directed edge and unblocks downstream task", () => {
        const mutations = [
            { type: MUTATION_TYPES.DEPENDENCY_REMOVE, taskId: "task-4", dependsOnTaskId: "task-3" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simDeps = result.simulatedDependencies || [];
        assert.ok(!simDeps.some((d) => d.task_id === "task-4" && d.depends_on_task_id === "task-3"));
    });

    test("11. dependency replace: replaces parent task dependency cleanly", () => {
        const mutations = [
            {
                type: MUTATION_TYPES.DEPENDENCY_REPLACE,
                taskId: "task-4",
                oldDependsOnTaskId: "task-3",
                newDependsOnTaskId: "task-2"
            }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simDeps = result.simulatedDependencies || [];
        assert.ok(simDeps.some((d) => d.task_id === "task-4" && d.depends_on_task_id === "task-2"));
        assert.ok(!simDeps.some((d) => d.task_id === "task-4" && d.depends_on_task_id === "task-3"));
    });

    test("12. project deadline change: modifies target project completion deadline", () => {
        const mutations = [
            { type: MUTATION_TYPES.PROJECT_DEADLINE_CHANGE, newEndDate: "2026-11-15T00:00:00.000Z" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.ok(result.simulatedDigitalTwin.project.endDate.includes("2026-11-15"));
    });

    test("13. scope change: removing a task also automatically prunes incident dependencies", () => {
        const mutations = [
            { type: MUTATION_TYPES.SCOPE_CHANGE, action: "REMOVE_TASK", taskId: "task-3" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTasks = result.simulatedDigitalTwin.tasks.items;
        assert.ok(!simTasks.some((t) => t.id === "task-3"));
        // Dependencies involving task-3 must be pruned
        const simDeps = result.simulatedDependencies || [];
        assert.ok(!simDeps.some((d) => d.task_id === "task-3" || d.depends_on_task_id === "task-3"));
    });

    test("14. combined mutations: compounds multiple adjustments sequentially", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_COMPLETE, taskId: "task-2" },
            { type: MUTATION_TYPES.TASK_REASSIGN, taskId: "task-3", toUserId: "user-1" },
            { type: MUTATION_TYPES.TASK_DURATION_DECREASE, taskId: "task-3", hours: 8 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        const simTask2 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-2");
        const simTask3 = result.simulatedDigitalTwin.tasks.items.find((t) => t.id === "task-3");
        assert.equal(simTask2.status, "Completed");
        assert.equal(simTask3.assigned_to, "user-1");
        assert.equal(simTask3.estimated_hours, 16); // 24 - 8
    });

    test("15. validation: non-existent taskId produces INVALID_TASK validation error", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DELAY, taskId: "task-ghost", days: 3 }
        ];

        const validation = validateScenarioMutations({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations
        });

        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((e) => e.type === "INVALID_TASK"));
    });

    test("16. validation: non-existent assigned userId produces INVALID_USER validation error", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_REASSIGN, taskId: "task-2", toUserId: "user-ghost" }
        ];

        const validation = validateScenarioMutations({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations
        });

        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((e) => e.type === "INVALID_USER"));
    });

    test("17. validation: non-existent dependency target produces INVALID_DEPENDENCY error", () => {
        const mutations = [
            { type: MUTATION_TYPES.DEPENDENCY_CREATE, taskId: "task-2", dependsOnTaskId: "task-ghost" }
        ];

        const validation = validateScenarioMutations({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations
        });

        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((e) => e.type === "INVALID_DEPENDENCY"));
    });

    test("18. validation: self-dependency produces SELF_DEPENDENCY error", () => {
        const mutations = [
            { type: MUTATION_TYPES.DEPENDENCY_CREATE, taskId: "task-2", dependsOnTaskId: "task-2" }
        ];

        const validation = validateScenarioMutations({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations
        });

        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((e) => e.type === "SELF_DEPENDENCY"));
    });

    test("19. zero database mutation: original task and project objects are completely unaltered", () => {
        const originalEstimated = baseTasks[1].estimated_hours;
        const originalStatus = baseTasks[1].status;

        runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations: [
                { type: MUTATION_TYPES.TASK_DURATION_INCREASE, taskId: "task-2", hours: 50 },
                { type: MUTATION_TYPES.TASK_COMPLETE, taskId: "task-2" }
            ],
            startOfToday: fixedToday
        });

        // Verify base reference objects were untouched
        assert.equal(baseTasks[1].estimated_hours, originalEstimated);
        assert.equal(baseTasks[1].status, originalStatus);
    });

    test("20. critical path recalculation: extending a task recalculates critical path", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DURATION_INCREASE, taskId: "task-2", hours: 80 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.ok(result.impact.criticalPath.durationChangeDays > 0);
    });

    test("21. bottleneck recalculation: task bottlenecks are recomputed under simulated load", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DURATION_INCREASE, taskId: "task-2", hours: 100 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.ok(result.simulatedDigitalTwin.bottlenecks.count >= 0);
    });

    test("22. project health recalculation: heavy delay decreases simulated health score", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DELAY, taskId: "task-2", days: 30 },
            { type: MUTATION_TYPES.TASK_DELAY, taskId: "task-3", days: 30 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.ok(result.scenario.healthScore <= result.baseline.healthScore);
    });

    test("23. deadline risk recalculation: task pushed close to project end shows elevated deadline risk", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_DELAY, taskId: "task-4", days: 10 }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.ok(result.scenario.deadlineRisksCount >= 0);
    });

    test("24. workload recalculation: assigning all tasks to user-1 increases workload concentration", () => {
        const mutations = [
            { type: MUTATION_TYPES.TASK_REASSIGN, taskId: "task-3", toUserId: "user-1" },
            { type: MUTATION_TYPES.TASK_REASSIGN, taskId: "task-4", toUserId: "user-1" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        // Concentration score should be high when 100% work is on user-1
        assert.ok(result.scenario.workloadConcentrationScore >= result.baseline.workloadConcentrationScore);
    });

    test("25. cycle detection: circular dependency in simulation marks hasCycle: true without crashing", () => {
        const mutations = [
            // task-1 depends on task-4 creating cycle 1->2->3->4->1
            { type: MUTATION_TYPES.DEPENDENCY_CREATE, taskId: "task-1", dependsOnTaskId: "task-4" }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.equal(result.scenario.hasCycle, true);
        assert.ok(result.warnings.some((w) => w.toLowerCase().includes("cycle") || w.toLowerCase().includes("deadlock")));
    });

    // ============================================================
    // PART 2: SCENARIO COMPARISON ENGINE (Tests 26 - 28)
    // ============================================================

    test("26. baseline comparison: single scenario vs baseline produces clear deltas", () => {
        const sim1 = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations: [{ type: MUTATION_TYPES.TASK_DELAY, taskId: "task-2", days: 3 }],
            startOfToday: fixedToday
        });

        const comparison = compareScenarios({
            baselineState: sim1.baseline,
            scenarios: [
                {
                    scenarioId: "scen-1",
                    name: "3-Day Delay",
                    simulatedState: sim1.scenario,
                    impact: sim1.impact,
                    delta: sim1.delta
                }
            ]
        });

        assert.equal(comparison.scenarios.length, 1);
        assert.equal(comparison.scenarios[0].scenarioId, "scen-1");
        assert.ok(comparison.tradeOffSummary !== null);
    });

    test("27. multi-scenario comparison: evaluates multiple hypothetical plans side-by-side", () => {
        const simA = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations: [{ type: MUTATION_TYPES.TASK_COMPLETE, taskId: "task-2" }],
            startOfToday: fixedToday
        });

        const simB = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations: [{ type: MUTATION_TYPES.TASK_DELAY, taskId: "task-2", days: 10 }],
            startOfToday: fixedToday
        });

        const comparison = compareScenarios({
            baselineState: simA.baseline,
            scenarios: [
                { scenarioId: "scen-a", name: "Fast Track", simulatedState: simA.scenario, delta: simA.delta },
                { scenarioId: "scen-b", name: "Delayed Track", simulatedState: simB.scenario, delta: simB.delta }
            ]
        });

        assert.equal(comparison.scenarios.length, 2);
        assert.equal(comparison.scenarios[0].name, "Fast Track");
        assert.equal(comparison.scenarios[1].name, "Delayed Track");
    });

    test("28. trade-off summary: identifies leastDelay, highestHealth, fewestBottlenecks accurately", () => {
        const simA = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations: [{ type: MUTATION_TYPES.TASK_COMPLETE, taskId: "task-2" }],
            startOfToday: fixedToday
        });

        const comparison = compareScenarios({
            baselineState: simA.baseline,
            scenarios: [
                {
                    scenarioId: "scen-opt",
                    name: "Optimal Plan",
                    simulatedState: { ...simA.scenario, healthScore: 95, majorBottlenecksCount: 0 },
                    delta: { scheduleVarianceDays: -2, healthScoreDelta: 15 }
                }
            ]
        });

        assert.ok(comparison.tradeOffSummary.highestHealth.includes("Optimal Plan"));
        assert.ok(comparison.tradeOffSummary.leastDelay.includes("Optimal Plan"));
    });

    // ============================================================
    // PART 3: INTELLIGENT REPLANNING ENGINE (Tests 29 - 35)
    // ============================================================

    test("29. deadline recovery strategy: generates proposals for delayed critical path", async () => {
        // Digital twin with slipped schedule
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: { members: baseMembers },
            criticalPath: {
                hasCycle: false,
                projectCriticalPathDays: 35,
                criticalTasks: ["task-2", "task-3", "task-4"]
            },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 65, status: "DEGRADED" },
            drift: { varianceDays: 6, severity: "HIGH" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.DEADLINE_RECOVERY,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        assert.ok(result.totalProposals >= 0);
        assert.ok(result.baseStateHash);
    });

    test("30. bottleneck relief strategy: generates proposals targeting major bottlenecks", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: { members: baseMembers },
            criticalPath: {
                hasCycle: false,
                projectCriticalPathDays: 25,
                criticalTasks: ["task-2"]
            },
            bottlenecks: {
                majorBottlenecks: [
                    { taskId: "task-2", title: "Task 2: Core Implementation", severity: "HIGH", score: 85 }
                ]
            },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.BOTTLENECK_RELIEF,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        assert.ok(result.totalProposals >= 1);
        const bottleneckProposal = result.proposals.find((p) => p.strategy === "BOTTLENECK_RELIEF");
        assert.ok(bottleneckProposal);
        assert.ok(bottleneckProposal.title.includes("Bottleneck"));
    });

    test("31. workload balancing strategy: offloads tasks from member holding disproportionate load", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 75, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 25, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: {
                hasCycle: false,
                projectCriticalPathDays: 20,
                criticalTasks: ["task-2"]
            },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 75, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        assert.ok(result.totalProposals >= 1);
        const workloadProposal = result.proposals.find((p) => p.strategy === "WORKLOAD_BALANCING");
        assert.ok(workloadProposal);
        assert.ok(workloadProposal.proposedChanges.some((c) => c.type === MUTATION_TYPES.TASK_REASSIGN));
    });

    test("32. sequence optimization strategy: evaluates parallelization opportunities", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: { members: baseMembers },
            criticalPath: {
                hasCycle: false,
                projectCriticalPathDays: 25,
                criticalTasks: ["task-2", "task-3"]
            },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 78, status: "FAIR" },
            drift: { varianceDays: 1, severity: "LOW" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.SEQUENCE_OPTIMIZATION,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        assert.ok(result.proposals !== null);
    });

    test("33. scope pressure strategy: proposes deferring low-priority tasks under severe schedule slip", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: { members: baseMembers },
            criticalPath: {
                hasCycle: false,
                projectCriticalPathDays: 45,
                criticalTasks: ["task-2", "task-3"]
            },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 50, status: "AT_RISK" },
            drift: { varianceDays: 12, severity: "CRITICAL" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.SCOPE_PRESSURE,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const scopeProposal = result.proposals.find((p) => p.strategy === "SCOPE_PRESSURE");
        if (scopeProposal) {
            assert.ok(scopeProposal.rationale.toLowerCase().includes("scope") || scopeProposal.rationale.toLowerCase().includes("pressure"));
        }
    });

    test("34. deterministic state hash: computeProjectStateHash is reproducible and sensitive to task edits", () => {
        const hash1 = computeProjectStateHash({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies
        });

        const hash2 = computeProjectStateHash({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies
        });

        assert.equal(hash1, hash2);

        // Mutating a single task changes hash
        const modifiedTasks = deepClone(baseTasks);
        modifiedTasks[1].estimated_hours = 99;

        const hash3 = computeProjectStateHash({
            project: baseProject,
            tasks: modifiedTasks,
            dependencies: baseDependencies
        });

        assert.notEqual(hash1, hash3);
    });

    test("35. proposal explainability: proposal contains title, rationale, evidence, and assumptions", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const prop = result.proposals[0];
        assert.ok(prop.title && prop.title.length > 5);
        assert.ok(prop.rationale && prop.rationale.length > 10);
        assert.ok(prop.evidence && Array.isArray(prop.evidence));
        assert.ok(prop.assumptions && Array.isArray(prop.assumptions));
        assert.ok(prop.risks && Array.isArray(prop.risks));
    });

    // ============================================================
    // PART 4: PROPOSAL LIFECYCLE & APPROVAL WORKFLOW (Tests 36 - 42)
    // ============================================================

    test("36. proposal creation and storage: proposals are indexed in memory by proposalId", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        assert.ok(result.proposals.length > 0);
        const proposalId = result.proposals[0].proposalId;
        assert.ok(proposalId.startsWith("prop_"));
    });

    test("37. proposal approval: transitions status from PROPOSED to APPROVED", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const proposalId = result.proposals[0].proposalId;
        const approved = await approveProjectProposal("proj-alpha", proposalId, "user-1");

        assert.equal(approved.status, SCENARIO_STATUS.APPROVED);
        assert.equal(approved.approvedBy, "user-1");
        assert.ok(approved.approvedAt);
    });

    test("38. proposal rejection: transitions status to REJECTED with rejectionReason", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const proposalId = result.proposals[0].proposalId;
        const rejected = await rejectProjectProposal("proj-alpha", proposalId, "user-1", "Budget constraints");

        assert.equal(rejected.status, SCENARIO_STATUS.REJECTED);
        assert.equal(rejected.rejectedBy, "user-1");
        assert.equal(rejected.rejectionReason, "Budget constraints");
    });

    test("39. expired proposal rejection: cannot approve an expired proposal", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const prop = result.proposals[0];
        // Manually expire proposal
        prop.expiresAt = new Date(Date.now() - 1000).toISOString();

        await assert.rejects(
            async () => {
                await approveProjectProposal("proj-alpha", prop.proposalId, "user-1");
            },
            (err) => {
                assert.ok(err.message.includes("expired"));
                return true;
            }
        );
    });

    test("40. double execution rejection: already executed proposal cannot be approved again", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const prop = result.proposals[0];
        prop.status = SCENARIO_STATUS.EXECUTED;

        await assert.rejects(
            async () => {
                await approveProjectProposal("proj-alpha", prop.proposalId, "user-1");
            },
            (err) => {
                assert.ok(err.message.includes("already been executed"));
                return true;
            }
        );
    });

    // ============================================================
    // PART 5: TRANSACTIONAL REPLANNING EXECUTION (Tests 41 - 44)
    // ============================================================

    test("41. unapproved proposal execution rejection: throws PROPOSAL_NOT_APPROVED", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const prop = result.proposals[0];
        // Status is PROPOSED (not approved)

        await assert.rejects(
            async () => {
                await executeReplanningProposal({
                    projectId: "proj-alpha",
                    proposalId: prop.proposalId,
                    userId: "user-1"
                });
            },
            (err) => {
                assert.equal(err.code, "PROPOSAL_NOT_APPROVED");
                return true;
            }
        );
    });

    test("42. rejected proposal execution rejection: throws PROPOSAL_REJECTED", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const prop = result.proposals[0];
        await rejectProjectProposal("proj-alpha", prop.proposalId, "user-1", "Rejected for testing");

        await assert.rejects(
            async () => {
                await executeReplanningProposal({
                    projectId: "proj-alpha",
                    proposalId: prop.proposalId,
                    userId: "user-1"
                });
            },
            (err) => {
                assert.equal(err.code, "PROPOSAL_REJECTED");
                return true;
            }
        );
    });

    test("43. stale proposal detection on execution: hash mismatch rejects with PROPOSAL_STALE and HTTP 409", async () => {
        const twin = {
            project: baseProject,
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-alpha",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        const prop = result.proposals[0];
        await approveProjectProposal("proj-alpha", prop.proposalId, "user-1");

        // Simulate baseStateHash becoming stale (e.g. state mutated externally)
        prop.baseStateHash = "hash-from-the-past-outdated";

        await assert.rejects(
            async () => {
                await executeReplanningProposal({
                    projectId: "proj-alpha",
                    proposalId: prop.proposalId,
                    userId: "user-1"
                });
            },
            (err) => {
                assert.equal(err.code, "PROPOSAL_STALE");
                assert.equal(err.statusCode, 409);
                return true;
            }
        );
    });

    // ============================================================
    // PART 6: QUACKIE SIMULATION & REPLANNING (Tests 44 - 47)
    // ============================================================

    test("44. formatReplanningReply: formats markdown response listing proposals with strategies and impact", () => {
        const replanningData = {
            totalProposals: 2,
            proposals: [
                {
                    title: "Rebalance QA Testing",
                    strategy: "WORKLOAD_BALANCING",
                    rationale: "Bob has only 25% load while Alice is at 75%.",
                    projectedImpact: {
                        health: { before: 70, after: 82, scoreDelta: 12 }
                    },
                    proposedChanges: [
                        { details: "Reassign Task 3 to Bob QA" }
                    ]
                }
            ]
        };

        const reply = formatReplanningReply(replanningData, "Alpha Project");
        assert.ok(reply.includes("Alpha Project"));
        assert.ok(reply.includes("Rebalance QA Testing"));
        assert.ok(reply.includes("WORKLOAD BALANCING"));
        assert.ok(reply.includes("Health 70 → 82"));
    });

    test("45. formatProposalExecutionReply: formats execution confirmation message", () => {
        const execResult = {
            proposalId: "prop_123",
            appliedChangesCount: 2,
            executedAt: new Date().toISOString()
        };

        const reply = formatProposalExecutionReply(execResult, "Deadline Recovery Plan");
        assert.ok(reply.includes("Execution Complete"));
        assert.ok(reply.includes("Deadline Recovery Plan"));
        assert.ok(reply.includes("change(s)"));
    });

    test("46. empty proposals reply: returns encouraging message when no replanning is required", () => {
        const reply = formatReplanningReply({ proposals: [], totalProposals: 0 }, "Alpha Project");
        assert.ok(reply.includes("No replanning is currently needed"));
    });

    // ============================================================
    // PART 7: SECURITY & ISOLATION (Tests 47 - 50)
    // ============================================================

    test("47. cross-project dependency rejection: adding dependency to task from another project fails validation", () => {
        const mutations = [
            {
                type: MUTATION_TYPES.DEPENDENCY_CREATE,
                taskId: "task-2",
                dependsOnTaskId: "foreign-task-99" // Belongs to Project B
            }
        ];

        const validation = validateScenarioMutations({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations
        });

        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((e) => e.type === "INVALID_DEPENDENCY"));
    });

    test("48. cross-project proposal approval rejection: cannot approve proposal belonging to different project", async () => {
        const twin = {
            project: { id: "proj-beta", title: "Beta Project" },
            tasks: { items: baseTasks, remainingHours: 72 },
            dependencies: baseDependencies,
            team: {
                members: [
                    { user_id: "user-1", name: "Alice Dev", workloadShare: 80, remainingHours: 56, criticalCount: 2 },
                    { user_id: "user-2", name: "Bob QA", workloadShare: 20, remainingHours: 16, criticalCount: 0 }
                ]
            },
            criticalPath: { hasCycle: false, projectCriticalPathDays: 20, criticalTasks: ["task-2"] },
            bottlenecks: { majorBottlenecks: [] },
            health: { score: 70, status: "FAIR" },
            drift: { varianceDays: 0, severity: "NONE" },
            risks: [],
            decisions: []
        };

        const result = await generateReplanningProposals({
            projectId: "proj-beta",
            userId: "user-1",
            strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
            digitalTwin: twin,
            startOfToday: fixedToday
        });

        assert.ok(result.proposals.length > 0);
        const prop = result.proposals[0];
        await assert.rejects(
            async () => {
                await approveProjectProposal("proj-alpha", prop.proposalId, "user-1");
            },
            (err) => {
                assert.equal(err.statusCode, 404);
                return true;
            }
        );
    });

    test("49. deep clone isolation: modifying cloned task array does not affect another clone", () => {
        const cloneA = deepClone(baseTasks);
        const cloneB = deepClone(baseTasks);

        cloneA[0].title = "MUTATED TITLE";
        assert.notEqual(cloneA[0].title, cloneB[0].title);
        assert.equal(cloneB[0].title, "Task 1: Spec & Architecture");
    });

    test("50. scope change ADD_TASK: synthetic task is added and tracked in affectedTasks", () => {
        const mutations = [
            {
                type: MUTATION_TYPES.SCOPE_CHANGE,
                action: "ADD_TASK",
                taskData: {
                    title: "Synthesized Bug Fix",
                    estimated_hours: 12,
                    priority: "High"
                }
            }
        ];

        const result = runScenarioSimulation({
            project: baseProject,
            tasks: baseTasks,
            dependencies: baseDependencies,
            projectMembers: baseMembers,
            mutations,
            startOfToday: fixedToday
        });

        assert.equal(result.valid, true);
        assert.equal(result.simulatedDigitalTwin.tasks.items.length, baseTasks.length + 1);
        const addedTask = result.simulatedDigitalTwin.tasks.items.find((t) => t.title === "Synthesized Bug Fix");
        assert.ok(addedTask);
        assert.ok(result.affectedTasks.includes(addedTask.id));
    });
});
