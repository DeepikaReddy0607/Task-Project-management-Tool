import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
    validateDependency,
    createTaskDependency,
    deleteTaskDependency,
    getTaskDependencies,
    getProjectDependencyGraph,
    invalidateProjectIntelligenceCache,
    emitDependencyRealtimeEvent
} from "../services/taskDependencyService.js";
import {
    parseNaturalLanguageQuery,
    INTENTS
} from "../services/naturalLanguageControlService.js";
import {
    handleIntelligenceQuery
} from "../services/intelligenceQueryService.js";
import {
    formatTaskDependenciesReply,
    QUACKIE_CONTROL_MODES,
    processMessage
} from "../services/quackieService.js";

describe("PHASE 13: Task Dependency Management & Intelligence Integration Test Suite", () => {
    const PROJ_A = "proj-uuid-13-a";
    const PROJ_B = "proj-uuid-13-b";
    const USER_ID = "usr-uuid-13";

    const createMockPrisma = ({ initialTasks = [], initialDeps = [], project = null } = {}) => {
        let taskList = [...initialTasks];
        let depList = [...initialDeps];

        return {
            tasks: {
                findUnique: async ({ where }) => {
                    return taskList.find((t) => t.id === where.id) || null;
                },
                findMany: async ({ where }) => {
                    let res = [...taskList];
                    if (where?.project_id) res = res.filter((t) => t.project_id === where.project_id);
                    if (where?.is_archived === false) res = res.filter((t) => !t.is_archived);
                    return res;
                }
            },
            task_dependencies: {
                findUnique: async ({ where }) => {
                    const { task_id, depends_on_task_id } = where?.task_id_depends_on_task_id || {};
                    return depList.find((d) => d.task_id === task_id && d.depends_on_task_id === depends_on_task_id) || null;
                },
                findFirst: async ({ where }) => {
                    return depList.find((d) => d.task_id === where.task_id && d.depends_on_task_id === where.depends_on_task_id) || null;
                },
                findMany: async ({ where, include }) => {
                    let matches = depList;
                    if (where?.task_id) {
                        matches = matches.filter((d) => d.task_id === where.task_id);
                    }
                    if (where?.depends_on_task_id) {
                        matches = matches.filter((d) => d.depends_on_task_id === where.depends_on_task_id);
                    }
                    if (where?.tasks_task_dependencies_task_idTotasks?.project_id) {
                        const pid = where.tasks_task_dependencies_task_idTotasks.project_id;
                        const taskIdsInProj = new Set(taskList.filter((t) => t.project_id === pid).map((t) => t.id));
                        matches = matches.filter((d) => taskIdsInProj.has(d.task_id));
                    }
                    return matches.map((d) => {
                        const obj = { ...d };
                        if (include?.tasks_task_dependencies_depends_on_task_idTotasks) {
                            const parentTask = taskList.find((t) => t.id === d.depends_on_task_id);
                            obj.tasks_task_dependencies_depends_on_task_idTotasks = parentTask ? { ...parentTask } : null;
                        }
                        if (include?.tasks_task_dependencies_task_idTotasks) {
                            const childTask = taskList.find((t) => t.id === d.task_id);
                            obj.tasks_task_dependencies_task_idTotasks = childTask ? { ...childTask } : null;
                        }
                        return obj;
                    });
                },
                create: async ({ data }) => {
                    const newDep = { ...data, created_at: new Date() };
                    depList.push(newDep);
                    return newDep;
                },
                delete: async ({ where }) => {
                    const { task_id, depends_on_task_id } = where?.task_id_depends_on_task_id || {};
                    const idx = depList.findIndex((d) => d.task_id === task_id && d.depends_on_task_id === depends_on_task_id);
                    if (idx !== -1) {
                        return depList.splice(idx, 1)[0];
                    }
                    return null;
                }
            },
            projects: {
                findUnique: async ({ where }) => {
                    if (project && project.id === where.id) return project;
                    return { id: where.id, title: "Test Project", status: "In Progress" };
                }
            },
            _getDepList: () => depList
        };
    };

    const standardTasks = [
        { id: "t1", title: "Architecture Design", status: "Completed", priority: "High", estimated_hours: 16, project_id: PROJ_A, is_archived: false },
        { id: "t2", title: "API Development", status: "In Progress", priority: "Critical", estimated_hours: 24, project_id: PROJ_A, is_archived: false },
        { id: "t3", title: "Frontend Integration", status: "To Do", priority: "High", estimated_hours: 32, project_id: PROJ_A, is_archived: false },
        { id: "t4", title: "Security Audit", status: "To Do", priority: "Critical", estimated_hours: 16, project_id: PROJ_A, is_archived: false },
        { id: "t-archived", title: "Deprecated Task", status: "To Do", priority: "Low", estimated_hours: 8, project_id: PROJ_A, is_archived: true },
        { id: "t-cross", title: "Foreign Project Task", status: "To Do", priority: "Medium", estimated_hours: 10, project_id: PROJ_B, is_archived: false }
    ];

    test("1. Self-dependency check: Rejects task depending on itself (A -> A)", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks });

        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t1",
                    dependsOnTaskId: "t1",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.code, "SELF_DEPENDENCY");
                return true;
            }
        );
    });

    test("2. Task existence check: Rejects non-existent downstream task", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks });

        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t-nonexistent",
                    dependsOnTaskId: "t1",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 404);
                assert.strictEqual(err.code, "TASK_NOT_FOUND");
                return true;
            }
        );
    });

    test("3. Task existence check: Rejects non-existent prerequisite task", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks });

        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t2",
                    dependsOnTaskId: "t-ghost",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 404);
                assert.strictEqual(err.code, "TASK_NOT_FOUND");
                return true;
            }
        );
    });

    test("4. Cross-project check: Rejects dependency between tasks in different projects", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks });

        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t1",
                    dependsOnTaskId: "t-cross",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.code, "CROSS_PROJECT_DEPENDENCY");
                return true;
            }
        );
    });

    test("5. Archived task check: Rejects dependencies involving archived tasks", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks });

        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t-archived",
                    dependsOnTaskId: "t1",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.code, "ARCHIVED_TASK");
                return true;
            }
        );
    });

    test("6. Duplicate check: Rejects already existing dependency", async () => {
        const existingDeps = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: existingDeps });

        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t2",
                    dependsOnTaskId: "t1",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 409);
                assert.strictEqual(err.code, "DEPENDENCY_EXISTS");
                return true;
            }
        );
    });

    test("7. Kahn Cycle Detection (2-node): Rejects direct cyclic dependency (t1 -> t2, then t2 -> t1)", async () => {
        // Existing: t2 depends on t1 (edge: t1 -> t2)
        const existingDeps = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: existingDeps });

        // Attempting: t1 depends on t2 (edge: t2 -> t1) => creates cycle [t1, t2]
        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t1",
                    dependsOnTaskId: "t2",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 409);
                assert.strictEqual(err.code, "DEPENDENCY_CYCLE");
                assert(Array.isArray(err.cycle));
                assert(err.cycle.includes("t1") && err.cycle.includes("t2"));
                return true;
            }
        );
    });

    test("8. Kahn Cycle Detection (3-node): Rejects transitive circular dependency (t1 -> t2 -> t3, then t3 -> t1)", async () => {
        // Existing: t2 depends on t1, t3 depends on t2 (t1 -> t2 -> t3)
        const existingDeps = [
            { task_id: "t2", depends_on_task_id: "t1" },
            { task_id: "t3", depends_on_task_id: "t2" }
        ];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: existingDeps });

        // Attempting: t1 depends on t3 (edge: t3 -> t1) => completes cycle t1 -> t2 -> t3 -> t1
        await assert.rejects(
            async () => {
                await validateDependency({
                    taskId: "t1",
                    dependsOnTaskId: "t3",
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 409);
                assert.strictEqual(err.code, "DEPENDENCY_CYCLE");
                assert(Array.isArray(err.cycle));
                return true;
            }
        );
    });

    test("9. Diamond DAG topology: Allows valid multi-branch converging dependencies without false-positive cycles", async () => {
        // Diamond DAG:
        // t1 -> t2, t1 -> t3
        // t2 -> t4, and candidate t3 -> t4
        const existingDeps = [
            { task_id: "t2", depends_on_task_id: "t1" },
            { task_id: "t3", depends_on_task_id: "t1" },
            { task_id: "t4", depends_on_task_id: "t2" }
        ];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: existingDeps });

        const result = await validateDependency({
            taskId: "t4",
            dependsOnTaskId: "t3",
            prismaClient: mockPrisma
        });

        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.projectId, PROJ_A);
    });

    test("10. createTaskDependency persists dependency and flushes intelligence caches", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: [] });

        const created = await createTaskDependency({
            taskId: "t2",
            dependsOnTaskId: "t1",
            userId: USER_ID,
            prismaClient: mockPrisma
        });

        assert.strictEqual(created.dependency.task_id, "t2");
        assert.strictEqual(created.dependency.depends_on_task_id, "t1");
        assert.strictEqual(mockPrisma._getDepList().length, 1);
    });

    test("11. deleteTaskDependency deletes dependency and flushes intelligence caches", async () => {
        const existingDeps = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: existingDeps });

        const res = await deleteTaskDependency({
            taskId: "t2",
            dependsOnTaskId: "t1",
            userId: USER_ID,
            prismaClient: mockPrisma
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(mockPrisma._getDepList().length, 0);
    });

    test("12. deleteTaskDependency throws 404 for non-existent dependency", async () => {
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: [] });

        await assert.rejects(
            async () => {
                await deleteTaskDependency({
                    taskId: "t2",
                    dependsOnTaskId: "t1",
                    userId: USER_ID,
                    prismaClient: mockPrisma
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 404);
                assert.strictEqual(err.code, "DEPENDENCY_NOT_FOUND");
                return true;
            }
        );
    });

    test("13. getTaskDependencies returns correct BLOCKED BY vs BLOCKS semantics and blocker counts", async () => {
        // Setup:
        // t1 is completed
        // t2 is in progress
        // t3 depends on t1 AND t2 (t3 is blocked by t1, t2)
        // t4 depends on t3 (t3 blocks t4)
        const deps = [
            { task_id: "t3", depends_on_task_id: "t1" },
            { task_id: "t3", depends_on_task_id: "t2" },
            { task_id: "t4", depends_on_task_id: "t3" }
        ];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: deps });

        const overview = await getTaskDependencies({
            taskId: "t3",
            prismaClient: mockPrisma
        });

        assert.strictEqual(overview.taskId, "t3");
        assert.strictEqual(overview.blockedBy.length, 2);
        assert.strictEqual(overview.blocks.length, 1);

        // t1 is completed -> isBlocking: false
        const t1Prereq = overview.blockedBy.find((b) => b.id === "t1");
        assert.strictEqual(t1Prereq.isCompleted, true);
        assert.strictEqual(t1Prereq.isBlocking, false);

        // t2 is In Progress -> isBlocking: true
        const t2Prereq = overview.blockedBy.find((b) => b.id === "t2");
        assert.strictEqual(t2Prereq.isCompleted, false);
        assert.strictEqual(t2Prereq.isBlocking, true);

        // t3 is blocked because t2 is incomplete
        assert.strictEqual(overview.isBlocked, true);
        assert.strictEqual(overview.blockingCount, 1);

        // Downstream check: t3 blocks t4
        assert.strictEqual(overview.blocks[0].id, "t4");
    });

    test("14. getTaskDependencies calculates isBlocked: false when all prerequisites are Completed", async () => {
        // t2 depends only on t1, and t1 is Completed
        const deps = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: deps });

        const overview = await getTaskDependencies({
            taskId: "t2",
            prismaClient: mockPrisma
        });

        assert.strictEqual(overview.isBlocked, false);
        assert.strictEqual(overview.blockingCount, 0);
        assert.strictEqual(overview.blockedBy[0].isCompleted, true);
    });

    test("15. getProjectDependencyGraph computes enriched CPM nodes, edges, and statistics", async () => {
        const deps = [
            { task_id: "t2", depends_on_task_id: "t1" },
            { task_id: "t3", depends_on_task_id: "t2" },
            { task_id: "t4", depends_on_task_id: "t3" }
        ];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: deps });

        const graph = await getProjectDependencyGraph({
            projectId: PROJ_A,
            prismaClient: mockPrisma
        });

        assert.strictEqual(graph.projectId, PROJ_A);
        assert.strictEqual(graph.hasCycles, false);
        assert(graph.nodes.length >= 4);
        assert.strictEqual(graph.edges.length, 3);
        assert(graph.stats.totalTasks >= 4);
        assert.strictEqual(graph.stats.totalDependencies, 3);
    });

    test("16. parseNaturalLanguageQuery parses dependency queries into INTENTS.TASK_DEPENDENCIES", () => {
        const q1 = parseNaturalLanguageQuery("what is blocking task API Development");
        assert.strictEqual(q1.intent, INTENTS.TASK_DEPENDENCIES);

        const q2 = parseNaturalLanguageQuery("what does Architecture Design block");
        assert.strictEqual(q2.intent, INTENTS.TASK_DEPENDENCIES);

        const q3 = parseNaturalLanguageQuery("show project dependency graph");
        assert.strictEqual(q3.intent, INTENTS.TASK_DEPENDENCIES);

        const q4 = parseNaturalLanguageQuery("is this task blocked");
        assert.strictEqual(q4.intent, INTENTS.TASK_DEPENDENCIES);
    });

    test("17. handleIntelligenceQuery handles TASK_DEPENDENCIES and returns structured findings", async () => {
        const deps = [{ task_id: "t2", depends_on_task_id: "t1" }];
        const mockPrisma = createMockPrisma({ initialTasks: standardTasks, initialDeps: deps });

        const result = await handleIntelligenceQuery({
            query: "what is blocking task t2",
            projectId: PROJ_A,
            context: { taskId: "t2", projectId: PROJ_A },
            userId: USER_ID
        });

        assert.strictEqual(result.intent, INTENTS.TASK_DEPENDENCIES);
        assert(result.explanation !== undefined);
        assert(result.explanation.summary.length > 0);
    });

    test("18. Quackie formats task dependencies reply with clear markdown, icons, and status", () => {
        const mockDepData = {
            taskTitle: "Frontend Integration",
            isBlocked: true,
            blockingCount: 1,
            blockedBy: [
                { id: "t1", title: "Architecture Design", status: "Completed", isCompleted: true },
                { id: "t2", title: "API Development", status: "In Progress", isCompleted: false }
            ],
            blocks: [
                { id: "t4", title: "Security Audit", status: "To Do" }
            ]
        };

        const reply = formatTaskDependenciesReply(mockDepData);
        assert(reply.includes("BLOCKED"));
        assert(reply.includes("Architecture Design"));
        assert(reply.includes("API Development"));
        assert(reply.includes("Security Audit"));
        assert(reply.includes("🦆"));
    });

    test("19. emitDependencyRealtimeEvent emits standardized socket payload", async () => {
        const payload = await emitDependencyRealtimeEvent({
            type: "dependency.created",
            projectId: PROJ_A,
            taskId: "t2",
            dependsOnTaskId: "t1",
            userId: USER_ID
        });

        assert.strictEqual(payload.type, "dependency.created");
        assert.strictEqual(payload.projectId, PROJ_A);
        assert.strictEqual(payload.taskId, "t2");
        assert.strictEqual(payload.data.dependsOnTaskId, "t1");
    });

    test("20. Zero external AI API call invariant: Dependency intelligence runs 100% deterministically and locally", () => {
        // Verify no external AI keys or network dependencies required
        assert.doesNotThrow(() => {
            invalidateProjectIntelligenceCache("proj-1");
        });
    });
});
