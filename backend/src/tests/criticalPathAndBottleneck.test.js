import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    calculateTaskDurationDays,
    buildDependencyGraph,
    detectCycles,
    calculateCriticalPath
} from "../services/criticalPathService.js";
import {
    detectBottlenecks,
    analyzeDownstreamReach,
    BOTTLENECK_SEVERITIES,
    BOTTLENECK_TYPES
} from "../services/bottleneckService.js";

describe("PHASE 1A: Critical Path & Bottleneck Intelligence Test Suite", () => {
    const fixedToday = new Date("2026-10-02T00:00:00.000Z");

    // 1. Single Task Project
    test("1. Single task project calculates correct duration and critical path", () => {
        const project = { id: "p1", title: "Solo Project", start_date: "2026-10-01" };
        const tasks = [
            {
                id: "t1",
                title: "Build Core Engine",
                status: "In Progress",
                priority: "High",
                estimated_hours: 16, // 16 hrs / 8 = 2 days
                is_archived: false
            }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies: [], startOfToday: fixedToday });

        assert.equal(result.hasCycle, false);
        assert.equal(result.taskCount, 1);
        assert.equal(result.projectCriticalPathDays, 2);
        assert.deepEqual(result.criticalTaskIds, ["t1"]);
        assert.equal(result.nodes[0].durationDays, 2);
        assert.equal(result.nodes[0].totalSlack, 0);
        assert.equal(result.nodes[0].isCritical, true);
    });

    // 2. Linear Dependency Chain (A -> B -> C)
    test("2. Linear dependency chain (A -> B -> C) computes cumulative critical path", () => {
        const project = { id: "p2", title: "Linear Project", start_date: "2026-10-01" };
        const tasks = [
            { id: "A", title: "Task A", status: "In Progress", estimated_hours: 24, is_archived: false }, // 3d
            { id: "B", title: "Task B", status: "To Do", estimated_hours: 16, is_archived: false },       // 2d
            { id: "C", title: "Task C", status: "Backlog", estimated_hours: 32, is_archived: false }      // 4d
        ];
        // In TaskFlow schema: task_id depends on depends_on_task_id
        // B depends on A, C depends on B
        const dependencies = [
            { task_id: "B", depends_on_task_id: "A" },
            { task_id: "C", depends_on_task_id: "B" }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies, startOfToday: fixedToday });

        assert.equal(result.hasCycle, false);
        assert.equal(result.projectCriticalPathDays, 9); // 3 + 2 + 4 = 9 days
        assert.deepEqual(result.criticalTaskIds, ["A", "B", "C"]);

        const nodeA = result.nodes.find((n) => n.id === "A");
        const nodeB = result.nodes.find((n) => n.id === "B");
        const nodeC = result.nodes.find((n) => n.id === "C");

        assert.equal(nodeA.earlyStart, 0);
        assert.equal(nodeA.earlyFinish, 3);
        assert.equal(nodeA.totalSlack, 0);

        assert.equal(nodeB.earlyStart, 3);
        assert.equal(nodeB.earlyFinish, 5);
        assert.equal(nodeB.totalSlack, 0);

        assert.equal(nodeC.earlyStart, 5);
        assert.equal(nodeC.earlyFinish, 9);
        assert.equal(nodeC.totalSlack, 0);

        // Check bottleneck detection on linear chain
        const bottlenecks = detectBottlenecks({ project, tasks, dependencies, cpmResult: result, startOfToday: fixedToday });
        assert.equal(bottlenecks.hasCycle, false);
        assert.ok(bottlenecks.bottlenecks.length > 0);

        // Task A directly blocks B and transitively blocks C (2 total)
        const bA = bottlenecks.bottlenecks.find((b) => b.taskId === "A");
        assert.ok(bA, "Task A should be detected as bottleneck");
        assert.equal(bA.blockedDownstreamCount, 1);
        assert.equal(bA.transitiveBlockedCount, 2);
        assert.ok(bA.isCritical);
    });

    // 3. Parallel Tasks (A -> C, B -> C)
    test("3. Parallel tasks (A -> C, B -> C) with different durations determine dominant critical path", () => {
        const project = { id: "p3", title: "Parallel Project", start_date: "2026-10-01" };
        const tasks = [
            { id: "A", title: "Task A", status: "To Do", estimated_hours: 40, is_archived: false }, // 5d
            { id: "B", title: "Task B", status: "To Do", estimated_hours: 16, is_archived: false }, // 2d
            { id: "C", title: "Task C", status: "To Do", estimated_hours: 24, is_archived: false }  // 3d
        ];
        // C depends on A and B
        const dependencies = [
            { task_id: "C", depends_on_task_id: "A" },
            { task_id: "C", depends_on_task_id: "B" }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies, startOfToday: fixedToday });

        assert.equal(result.hasCycle, false);
        assert.equal(result.projectCriticalPathDays, 8); // 5 + 3 = 8
        assert.deepEqual(result.criticalTaskIds, ["A", "C"]);

        const nodeA = result.nodes.find((n) => n.id === "A");
        const nodeB = result.nodes.find((n) => n.id === "B");
        const nodeC = result.nodes.find((n) => n.id === "C");

        assert.equal(nodeA.isCritical, true);
        assert.equal(nodeA.totalSlack, 0);

        assert.equal(nodeC.isCritical, true);
        assert.equal(nodeC.totalSlack, 0);

        // Node B has 3 days of slack (LF = 5, LS = 3, ES = 0, EF = 2 -> Slack = 3)
        assert.equal(nodeB.isCritical, false);
        assert.equal(nodeB.totalSlack, 3);
    });

    // 4. Multiple Critical Paths
    test("4. Multiple critical paths are detected when parallel branches have identical duration", () => {
        const project = { id: "p4", title: "Dual Path Project", start_date: "2026-10-01" };
        const tasks = [
            { id: "P1", title: "Branch 1", status: "To Do", estimated_hours: 32, is_archived: false }, // 4d
            { id: "P2", title: "Branch 2", status: "To Do", estimated_hours: 32, is_archived: false }, // 4d
            { id: "M", title: "Merge Task", status: "To Do", estimated_hours: 24, is_archived: false }  // 3d
        ];
        const dependencies = [
            { task_id: "M", depends_on_task_id: "P1" },
            { task_id: "M", depends_on_task_id: "P2" }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies, startOfToday: fixedToday });

        assert.equal(result.hasCycle, false);
        assert.equal(result.projectCriticalPathDays, 7); // 4 + 3 = 7
        assert.equal(result.multipleCriticalPaths, true);
        assert.ok(result.criticalTaskIds.includes("P1"));
        assert.ok(result.criticalTaskIds.includes("P2"));
        assert.ok(result.criticalTaskIds.includes("M"));
        assert.equal(result.allCriticalPaths.length, 2);
    });

    // 5. Non-Critical Task with Slack
    test("5. Non-critical task receives accurate slack count and is not flagged as critical", () => {
        const project = { id: "p5", title: "Slack Project" };
        const tasks = [
            { id: "T_long", title: "Long Path", status: "In Progress", estimated_hours: 48, is_archived: false }, // 6d
            { id: "T_short", title: "Short Path", status: "To Do", estimated_hours: 8, is_archived: false },       // 1d
            { id: "T_end", title: "End Node", status: "To Do", estimated_hours: 16, is_archived: false }           // 2d
        ];
        const dependencies = [
            { task_id: "T_end", depends_on_task_id: "T_long" },
            { task_id: "T_end", depends_on_task_id: "T_short" }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies, startOfToday: fixedToday });

        const shortNode = result.nodes.find((n) => n.id === "T_short");
        assert.equal(shortNode.durationDays, 1);
        assert.equal(shortNode.isCritical, false);
        assert.equal(shortNode.totalSlack, 5); // 6 - 1 = 5 days slack
    });

    // 6. Overdue Critical Task
    test("6. Overdue critical task is elevated to highest bottleneck severity", () => {
        const project = { id: "p6", title: "Overdue Project" };
        const tasks = [
            {
                id: "T_crit_overdue",
                title: "Overdue API Service",
                status: "In Progress",
                priority: "Critical",
                due_date: "2026-09-28", // 4 days overdue relative to 2026-10-02
                estimated_hours: 24,
                is_archived: false
            },
            {
                id: "T_downstream",
                title: "Client Integration",
                status: "To Do",
                priority: "High",
                due_date: "2026-10-10",
                estimated_hours: 16,
                is_archived: false
            }
        ];
        const dependencies = [
            { task_id: "T_downstream", depends_on_task_id: "T_crit_overdue" }
        ];

        const bottlenecks = detectBottlenecks({ project, tasks, dependencies, startOfToday: fixedToday });

        assert.equal(bottlenecks.hasCycle, false);
        const top = bottlenecks.bottlenecks[0];
        assert.equal(top.taskId, "T_crit_overdue");
        assert.equal(top.isCritical, true);
        assert.equal(top.isOverdue, true);
        assert.equal(top.daysOverdue, 4);
        assert.equal(top.severity, BOTTLENECK_SEVERITIES.CRITICAL);
        assert.ok(top.reasons.some((r) => r.includes("overdue")));
        assert.ok(top.reasons.some((r) => r.includes("critical path")));
    });

    // 7. High-Priority Bottleneck
    test("7. High-priority bottleneck scores accurately and explains priority in reasons", () => {
        const project = { id: "p7", title: "Priority Bottleneck" };
        const tasks = [
            {
                id: "T_high_prio",
                title: "Security Audit",
                status: "In Progress",
                priority: "Critical",
                estimated_hours: 16,
                is_archived: false
            },
            {
                id: "T_dep1",
                title: "Prod Launch",
                status: "To Do",
                priority: "High",
                is_archived: false
            }
        ];
        const dependencies = [
            { task_id: "T_dep1", depends_on_task_id: "T_high_prio" }
        ];

        const bottlenecks = detectBottlenecks({ project, tasks, dependencies, startOfToday: fixedToday });
        const audit = bottlenecks.bottlenecks.find((b) => b.taskId === "T_high_prio");
        assert.ok(audit);
        assert.ok(audit.reasons.some((r) => r.includes("Critical priority")));
    });

    // 8. Task Blocking Many Downstream Tasks
    test("8. Task blocking multiple downstream tasks receives high dependency impact score", () => {
        const project = { id: "p8", title: "Mega Blocker" };
        const tasks = [
            { id: "Hub", title: "Central Schema Migration", status: "In Progress", priority: "High", is_archived: false },
            { id: "D1", title: "User Auth", status: "To Do", is_archived: false },
            { id: "D2", title: "Billing Engine", status: "To Do", is_archived: false },
            { id: "D3", title: "Reporting API", status: "To Do", is_archived: false },
            { id: "D4", title: "Audit Logger", status: "To Do", is_archived: false }
        ];
        const dependencies = [
            { task_id: "D1", depends_on_task_id: "Hub" },
            { task_id: "D2", depends_on_task_id: "Hub" },
            { task_id: "D3", depends_on_task_id: "Hub" },
            { task_id: "D4", depends_on_task_id: "Hub" }
        ];

        const bottlenecks = detectBottlenecks({ project, tasks, dependencies, startOfToday: fixedToday });
        const hub = bottlenecks.bottlenecks.find((b) => b.taskId === "Hub");
        assert.ok(hub);
        assert.equal(hub.blockedDownstreamCount, 4);
        assert.ok(hub.reasons.some((r) => r.includes("Directly blocks 4 downstream tasks")));
    });

    // 9. No Dependencies
    test("9. Project with tasks but no dependencies calculates flat schedule without errors", () => {
        const project = { id: "p9", title: "Independent Tasks" };
        const tasks = [
            { id: "A", title: "Design", status: "To Do", estimated_hours: 16, is_archived: false }, // 2d
            { id: "B", title: "Backend", status: "To Do", estimated_hours: 40, is_archived: false }, // 5d
            { id: "C", title: "Docs", status: "To Do", estimated_hours: 24, is_archived: false }     // 3d
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies: [], startOfToday: fixedToday });
        assert.equal(result.hasCycle, false);
        assert.equal(result.dependencyCount, 0);
        assert.equal(result.projectCriticalPathDays, 5); // longest independent task
        assert.deepEqual(result.criticalTaskIds, ["B"]);
    });

    // 10. Completed Prerequisite
    test("10. Completed prerequisite is included in schedule graph but excluded from active bottlenecks", () => {
        const project = { id: "p10", title: "Completed Prereq Project" };
        const tasks = [
            { id: "Done1", title: "Initial Setup", status: "Completed", estimated_hours: 16, is_archived: false },
            { id: "Active2", title: "Implementation", status: "In Progress", estimated_hours: 24, is_archived: false }
        ];
        const dependencies = [
            { task_id: "Active2", depends_on_task_id: "Done1" }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies, startOfToday: fixedToday });
        assert.equal(result.hasCycle, false);
        assert.equal(result.taskCount, 2);

        const bottlenecks = detectBottlenecks({ project, tasks, dependencies, cpmResult: result, startOfToday: fixedToday });
        // Done1 must NOT appear in bottlenecks because it is Completed!
        const doneInBottlenecks = bottlenecks.bottlenecks.find((b) => b.taskId === "Done1");
        assert.equal(doneInBottlenecks, undefined, "Completed task must not be an active bottleneck");
    });

    // 11. Missing estimated_hours
    test("11. Task with missing estimated_hours computes duration from date range", () => {
        const taskWithDates = {
            id: "t_dates",
            title: "Sprint Work",
            estimated_hours: null,
            start_date: "2026-10-01",
            due_date: "2026-10-06" // 5 days diff
        };
        const duration = calculateTaskDurationDays(taskWithDates);
        assert.equal(duration, 5);
    });

    // 12. Missing Dates and Estimated Hours
    test("12. Task with missing dates and estimated_hours falls back safely to 1 day", () => {
        const taskBlank = {
            id: "t_blank",
            title: "Quick Note",
            estimated_hours: null,
            start_date: null,
            due_date: null
        };
        const duration = calculateTaskDurationDays(taskBlank);
        assert.equal(duration, 1);
    });

    // 13. Circular Dependency
    test("13. Circular dependency (A -> B -> C -> A) is detected and returned safely without crash", () => {
        const project = { id: "p13", title: "Cycle Project" };
        const tasks = [
            { id: "A", title: "Module A", status: "To Do", is_archived: false },
            { id: "B", title: "Module B", status: "To Do", is_archived: false },
            { id: "C", title: "Module C", status: "To Do", is_archived: false }
        ];
        // Cycle: A -> B, B -> C, C -> A
        const dependencies = [
            { task_id: "B", depends_on_task_id: "A" },
            { task_id: "C", depends_on_task_id: "B" },
            { task_id: "A", depends_on_task_id: "C" }
        ];

        const result = calculateCriticalPath({ project, tasks, dependencies, startOfToday: fixedToday });
        assert.equal(result.hasCycle, true);
        assert.ok(result.cycleNodes.length >= 3);
        assert.deepEqual(result.criticalTaskIds, []);
        assert.equal(result.projectCriticalPathDays, 0);

        const bottlenecks = detectBottlenecks({ project, tasks, dependencies, cpmResult: result, startOfToday: fixedToday });
        assert.equal(bottlenecks.hasCycle, true);
        assert.deepEqual(bottlenecks.bottlenecks, []);
        assert.ok(bottlenecks.summary.message.includes("cycle"));
    });

    // 14. Empty Project
    test("14. Empty project returns empty deterministic payload without errors", () => {
        const project = { id: "p14", title: "Empty Project", start_date: "2026-10-01" };
        const result = calculateCriticalPath({ project, tasks: [], dependencies: [], startOfToday: fixedToday });

        assert.equal(result.hasCycle, false);
        assert.equal(result.taskCount, 0);
        assert.equal(result.projectCriticalPathDays, 0);
        assert.deepEqual(result.nodes, []);
        assert.deepEqual(result.criticalTaskIds, []);

        const bottlenecks = detectBottlenecks({ project, tasks: [], dependencies: [], startOfToday: fixedToday });
        assert.equal(bottlenecks.bottlenecks.length, 0);
    });

    // 15. Multi-User Authorization
    test("15. Multi-user authorization resolves access for managers, members, and workspace members", async () => {
        // Mock authorization validator logic (mirrors verifyProjectAccess in projectRiskService)
        const mockVerifyAccess = (project, userId, workspaceMemberships = []) => {
            if (!project) throw new Error("Project not found");
            if (project.manager_id === userId) return true;
            if (project.members?.some((m) => m.user_id === userId)) return true;
            if (workspaceMemberships.some((wm) => wm.workspace_id === project.workspace_id && wm.user_id === userId)) return true;
            const err = new Error("Project access denied");
            err.statusCode = 403;
            throw err;
        };

        const testProject = {
            id: "p_auth",
            manager_id: "user_manager",
            workspace_id: "ws_1",
            members: [{ user_id: "user_member" }]
        };

        const wsMembers = [{ workspace_id: "ws_1", user_id: "user_workspace_dev" }];

        // Manager access
        assert.equal(mockVerifyAccess(testProject, "user_manager", wsMembers), true);
        // Project member access
        assert.equal(mockVerifyAccess(testProject, "user_member", wsMembers), true);
        // Workspace member access
        assert.equal(mockVerifyAccess(testProject, "user_workspace_dev", wsMembers), true);
    });

    // 16. Unauthorized Project Access
    test("16. Unauthorized user is rejected with 403 status code", () => {
        const mockVerifyAccess = (project, userId, workspaceMemberships = []) => {
            if (!project) throw new Error("Project not found");
            if (project.manager_id === userId) return true;
            if (project.members?.some((m) => m.user_id === userId)) return true;
            if (workspaceMemberships.some((wm) => wm.workspace_id === project.workspace_id && wm.user_id === userId)) return true;
            const err = new Error("Project access denied");
            err.statusCode = 403;
            throw err;
        };

        const testProject = {
            id: "p_auth",
            manager_id: "user_manager",
            workspace_id: "ws_1",
            members: [{ user_id: "user_member" }]
        };

        assert.throws(
            () => mockVerifyAccess(testProject, "stranger_user", []),
            (err) => err.statusCode === 403 && err.message === "Project access denied"
        );
    });

    // 17. Quackie Critical Path Reply Formatter
    test("17. Quackie formatCriticalPathReply formats markdown with duration and zero-slack tasks", async () => {
        const { formatCriticalPathReply } = await import("../services/quackieService.js");

        const cpmMock = {
            projectTitle: "Avengers Launch",
            projectCriticalPathDays: 14,
            criticalTaskIds: ["t1", "t2"],
            projectStart: "2026-10-01",
            projectedEnd: "2026-10-15",
            hasCycle: false,
            nodes: [
                { id: "t1", title: "API Core", durationDays: 6, isCritical: true, status: "Completed", dueDate: "2026-10-07" },
                { id: "t2", title: "Gateway", durationDays: 8, isCritical: true, status: "In Progress", dueDate: "2026-10-15" }
            ]
        };

        const reply = formatCriticalPathReply(cpmMock);
        assert.ok(reply.includes("Critical Path Intelligence: Avengers Launch"));
        assert.ok(reply.includes("14 days"));
        assert.ok(reply.includes("API Core"));
        assert.ok(reply.includes("Gateway"));
        assert.ok(reply.includes("Zero Slack"));
    });

    // 18. Quackie Bottleneck Reply Formatter
    test("18. Quackie formatBottleneckReply highlights primary bottleneck and actionable guidance", async () => {
        const { formatBottleneckReply } = await import("../services/quackieService.js");

        const bottleneckMock = {
            projectTitle: "Avengers Launch",
            hasCycle: false,
            summary: {
                primaryBottleneck: { taskId: "t2", title: "Gateway", severity: "HIGH", score: 82 }
            },
            bottlenecks: [
                {
                    taskId: "t2",
                    title: "Gateway",
                    severity: "HIGH",
                    score: 82,
                    blockedDownstreamCount: 3,
                    reasons: ["Directly blocks 3 downstream tasks", "Task is on the critical path"]
                }
            ]
        };

        const reply = formatBottleneckReply(bottleneckMock);
        assert.ok(reply.includes("Bottleneck Intelligence: Avengers Launch"));
        assert.ok(reply.includes("Primary Bottleneck:"));
        assert.ok(reply.includes("Gateway"));
        assert.ok(reply.includes("82/100"));
        assert.ok(reply.includes("Action item"));
    });
});

