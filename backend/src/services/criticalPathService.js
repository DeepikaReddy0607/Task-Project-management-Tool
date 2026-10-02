import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";

/**
 * Calculates task duration in integer days.
 * 
 * Deterministic resolution:
 * 1. If estimated_hours > 0:
 *    durationDays = max(1, ceil(estimated_hours / 8))
 * 2. Else if start_date and due_date exist:
 *    durationDays = max(1, difference between dates in days)
 * 3. Otherwise:
 *    durationDays = 1
 * 
 * @param {Object} task
 * @returns {number} durationDays
 */
export const calculateTaskDurationDays = (task) => {
    if (!task) return 1;

    // 1. If estimated_hours > 0
    const hours = Number(task.estimated_hours || 0);
    if (hours > 0) {
        return Math.max(1, Math.ceil(hours / 8));
    }

    // 2. Else if start_date and due_date exist
    if (task.start_date && task.due_date) {
        const start = new Date(task.start_date);
        const due = new Date(task.due_date);
        if (!isNaN(start.getTime()) && !isNaN(due.getTime())) {
            const diffMs = due.getTime() - start.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            return Math.max(1, diffDays);
        }
    }

    // 3. Otherwise default to 1 day
    return 1;
};

/**
 * Builds an in-memory directed graph from active tasks and their dependencies.
 * 
 * In TaskFlow schema:
 * task_dependencies table:
 * - task_id = dependent / downstream task
 * - depends_on_task_id = prerequisite / upstream task
 * 
 * Scheduled flow edge:
 * depends_on_task_id (from) -> task_id (to)
 * 
 * Archived tasks are ignored.
 * Completed tasks are kept in graph because they may be prerequisites for incomplete tasks.
 * 
 * @param {Array<Object>} tasks
 * @param {Array<Object>} [explicitDependencies] Optional explicit dependency array [{ task_id, depends_on_task_id }]
 * @returns {{
 *   nodes: Map<string, Object>,
 *   adjacencyList: Map<string, Array<string>>,
 *   reverseAdjacencyList: Map<string, Array<string>>,
 *   inDegree: Map<string, number>,
 *   edges: Array<{ from: string, to: string }>
 * }}
 */
export const buildDependencyGraph = (tasks = [], explicitDependencies = null) => {
    const nodes = new Map();
    const adjacencyList = new Map();
    const reverseAdjacencyList = new Map();
    const inDegree = new Map();
    const edges = [];

    // Filter out archived tasks
    const activeTasks = tasks.filter((t) => !t.is_archived);

    activeTasks.forEach((t) => {
        nodes.set(t.id, t);
        adjacencyList.set(t.id, []);
        reverseAdjacencyList.set(t.id, []);
        inDegree.set(t.id, 0);
    });

    const addEdge = (fromId, toId) => {
        // Both nodes must exist in the active graph
        if (nodes.has(fromId) && nodes.has(toId) && fromId !== toId) {
            // Prevent duplicate edges
            const currentSuccessors = adjacencyList.get(fromId);
            if (!currentSuccessors.includes(toId)) {
                currentSuccessors.push(toId);
                reverseAdjacencyList.get(toId).push(fromId);
                inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
                edges.push({ from: fromId, to: toId });
            }
        }
    };

    if (Array.isArray(explicitDependencies)) {
        // Use explicit dependencies list
        explicitDependencies.forEach((dep) => {
            const fromId = dep.depends_on_task_id;
            const toId = dep.task_id;
            if (fromId && toId) {
                addEdge(fromId, toId);
            }
        });
    } else {
        // Extract dependencies embedded in task records
        activeTasks.forEach((t) => {
            // 1. Upstream dependencies: tasks that this task depends on
            const upstream = t.task_dependencies_task_dependencies_task_idTotasks || [];
            upstream.forEach((d) => {
                const fromId = d.depends_on_task_id || d.tasks_task_dependencies_depends_on_task_idTotasks?.id;
                if (fromId) {
                    addEdge(fromId, t.id);
                }
            });

            // 2. Downstream dependencies: tasks that depend on this task
            const downstream = t.task_dependencies_task_dependencies_depends_on_task_idTotasks || [];
            downstream.forEach((d) => {
                const toId = d.task_id || d.tasks_task_dependencies_task_idTotasks?.id;
                if (toId) {
                    addEdge(t.id, toId);
                }
            });
        });
    }

    return {
        nodes,
        adjacencyList,
        reverseAdjacencyList,
        inDegree,
        edges
    };
};

/**
 * Detects circular dependencies deterministically using Kahn's algorithm.
 * 
 * If graph has cycles:
 * returns { hasCycle: true, cycleNodes: [...] }
 * 
 * If graph is a DAG:
 * returns { hasCycle: false, topologicalOrder: [...] }
 * 
 * @param {Object} graph
 * @returns {{ hasCycle: boolean, topologicalOrder?: Array<string>, cycleNodes?: Array<string> }}
 */
export const detectCycles = ({ nodes, adjacencyList, inDegree }) => {
    const localInDegree = new Map();
    nodes.forEach((_, id) => {
        localInDegree.set(id, inDegree.get(id) || 0);
    });

    const queue = [];
    nodes.forEach((_, id) => {
        if (localInDegree.get(id) === 0) {
            queue.push(id);
        }
    });

    // Deterministic tie-breaker: sort initial queue by ID
    queue.sort();

    const topologicalOrder = [];

    while (queue.length > 0) {
        const u = queue.shift();
        topologicalOrder.push(u);

        const successors = adjacencyList.get(u) || [];
        // Sort successors deterministically
        const sortedSuccessors = [...successors].sort();

        sortedSuccessors.forEach((v) => {
            const currentDegree = localInDegree.get(v) - 1;
            localInDegree.set(v, currentDegree);
            if (currentDegree === 0) {
                queue.push(v);
            }
        });
    }

    if (topologicalOrder.length < nodes.size) {
        // Cycle detected: collect nodes that still have in-degree > 0
        const cycleNodes = [];
        nodes.forEach((_, id) => {
            if (localInDegree.get(id) > 0) {
                cycleNodes.push(id);
            }
        });
        cycleNodes.sort();

        return {
            hasCycle: true,
            cycleNodes,
            topologicalOrder: []
        };
    }

    return {
        hasCycle: false,
        cycleNodes: [],
        topologicalOrder
    };
};

/**
 * Helper to add days to a Date object deterministically (UTC).
 */
const addDays = (date, days) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/**
 * Computes Critical Path Method (CPM) for a project graph.
 * 
 * Forward Pass:
 * - ES = max(predecessor EF), default 0
 * - EF = ES + durationDays
 * 
 * Backward Pass:
 * - LF = min(successor LS), default projectDuration
 * - LS = LF - durationDays
 * 
 * Total Slack:
 * - Slack = LS - ES (=== LF - EF)
 * - isCritical = (Slack === 0)
 * 
 * @param {Object} params
 * @param {Object} params.project Project model object
 * @param {Array<Object>} params.tasks Array of task objects
 * @param {Array<Object>} [params.dependencies] Optional explicit dependency array
 * @param {Date} [params.startOfToday]
 * @returns {Object} CPM analysis result
 */
export const calculateCriticalPath = ({
    project = null,
    tasks = [],
    dependencies = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const projectId = project?.id || (activeTasks[0]?.project_id ?? "unknown-project");
    const projectTitle = project?.title || "Project";

    // 1. Build Dependency DAG
    const graph = buildDependencyGraph(activeTasks, dependencies);

    // 2. Cycle Detection
    const cycleCheck = detectCycles(graph);
    if (cycleCheck.hasCycle) {
        return {
            projectId,
            projectTitle,
            hasCycle: true,
            cycleNodes: cycleCheck.cycleNodes.map((id) => {
                const node = graph.nodes.get(id);
                return {
                    taskId: id,
                    title: node?.title || id,
                    status: node?.status || "Unknown"
                };
            }),
            taskCount: activeTasks.length,
            dependencyCount: graph.edges.length,
            projectCriticalPathDays: 0,
            criticalTaskIds: [],
            criticalPath: [],
            multipleCriticalPaths: false,
            projectStart: null,
            projectedEnd: null,
            nodes: [],
            edges: graph.edges,
            error: "Dependency graph contains a circular dependency (cycle)"
        };
    }

    // 3. Handle Empty Project
    if (activeTasks.length === 0) {
        return {
            projectId,
            projectTitle,
            hasCycle: false,
            cycleNodes: [],
            taskCount: 0,
            dependencyCount: 0,
            projectCriticalPathDays: 0,
            criticalTaskIds: [],
            criticalPath: [],
            multipleCriticalPaths: false,
            projectStart: project?.start_date ? new Date(project.start_date).toISOString().slice(0, 10) : startOfToday.toISOString().slice(0, 10),
            projectedEnd: project?.start_date ? new Date(project.start_date).toISOString().slice(0, 10) : startOfToday.toISOString().slice(0, 10),
            nodes: [],
            edges: []
        };
    }

    const { topologicalOrder } = cycleCheck;
    const durations = new Map();
    const earlyStart = new Map();
    const earlyFinish = new Map();
    const lateStart = new Map();
    const lateFinish = new Map();
    const totalSlack = new Map();
    const isCritical = new Map();

    // Compute durations
    topologicalOrder.forEach((id) => {
        const task = graph.nodes.get(id);
        durations.set(id, calculateTaskDurationDays(task));
    });

    // 4. Forward Pass: compute Early Start (ES) and Early Finish (EF)
    topologicalOrder.forEach((id) => {
        const predecessors = graph.reverseAdjacencyList.get(id) || [];
        let maxPredecessorEF = 0;
        predecessors.forEach((pId) => {
            const pEF = earlyFinish.get(pId) || 0;
            if (pEF > maxPredecessorEF) {
                maxPredecessorEF = pEF;
            }
        });

        const es = maxPredecessorEF;
        const dur = durations.get(id);
        const ef = es + dur;

        earlyStart.set(id, es);
        earlyFinish.set(id, ef);
    });

    // Total project duration = max EF of all nodes
    let projectCriticalPathDays = 0;
    topologicalOrder.forEach((id) => {
        const ef = earlyFinish.get(id) || 0;
        if (ef > projectCriticalPathDays) {
            projectCriticalPathDays = ef;
        }
    });

    // 5. Backward Pass: compute Late Finish (LF) and Late Start (LS)
    // Traverse in reverse topological order
    for (let i = topologicalOrder.length - 1; i >= 0; i--) {
        const id = topologicalOrder[i];
        const successors = graph.adjacencyList.get(id) || [];

        let minSuccessorLS = projectCriticalPathDays;
        if (successors.length > 0) {
            minSuccessorLS = Infinity;
            successors.forEach((sId) => {
                const sLS = lateStart.get(sId);
                if (sLS < minSuccessorLS) {
                    minSuccessorLS = sLS;
                }
            });
        }

        const lf = minSuccessorLS;
        const dur = durations.get(id);
        const ls = lf - dur;

        lateFinish.set(id, lf);
        lateStart.set(id, ls);

        // 6. Slack calculation
        const es = earlyStart.get(id);
        const slack = Math.max(0, ls - es);
        totalSlack.set(id, slack);

        const critical = slack === 0;
        isCritical.set(id, critical);
    }

    // 7. Determine Baseline Dates
    let baseDate;
    if (project?.start_date && !isNaN(new Date(project.start_date).getTime())) {
        baseDate = new Date(project.start_date);
    } else {
        baseDate = startOfToday;
    }

    const projectStartFormatted = baseDate.toISOString().slice(0, 10);
    const projectedEndFormatted = addDays(baseDate, projectCriticalPathDays);

    // 8. Construct Node Details
    const nodeResults = topologicalOrder.map((id) => {
        const task = graph.nodes.get(id);
        const dur = durations.get(id);
        const es = earlyStart.get(id);
        const ef = earlyFinish.get(id);
        const ls = lateStart.get(id);
        const lf = lateFinish.get(id);
        const slack = totalSlack.get(id);
        const critical = isCritical.get(id);

        const assignee = task.users_tasks_assigned_toTousers;

        return {
            taskId: id,
            id,
            title: task.title,
            status: task.status,
            priority: task.priority || "Medium",
            isArchived: task.is_archived || false,
            estimatedHours: task.estimated_hours ? Number(task.estimated_hours) : null,
            durationDays: dur,
            earlyStart: es,
            earlyFinish: ef,
            lateStart: ls,
            lateFinish: lf,
            totalSlack: slack,
            isCritical: critical,
            earlyStartDate: addDays(baseDate, es),
            earlyFinishDate: addDays(baseDate, ef),
            lateStartDate: addDays(baseDate, ls),
            lateFinishDate: addDays(baseDate, lf),
            dueDate: task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : null,
            assignee: assignee ? {
                id: assignee.id,
                name: `${assignee.first_name || ""} ${assignee.last_name || ""}`.trim() || assignee.email
            } : null
        };
    });

    // 9. Extract Critical Task IDs and Paths
    const criticalTaskIds = nodeResults
        .filter((n) => n.isCritical)
        .map((n) => n.taskId);

    // Build critical paths from critical task DAG
    const criticalSet = new Set(criticalTaskIds);
    const criticalSources = criticalTaskIds.filter((id) => {
        const preds = graph.reverseAdjacencyList.get(id) || [];
        return preds.filter((p) => criticalSet.has(p)).length === 0;
    });

    const allCriticalPaths = [];
    const findPaths = (currentId, currentPath) => {
        const nextSuccessors = (graph.adjacencyList.get(currentId) || []).filter(
            (sId) => criticalSet.has(sId) && earlyFinish.get(currentId) === earlyStart.get(sId)
        );

        if (nextSuccessors.length === 0) {
            allCriticalPaths.push([...currentPath, currentId]);
            return;
        }

        nextSuccessors.forEach((succId) => {
            findPaths(succId, [...currentPath, currentId]);
        });
    };

    criticalSources.forEach((srcId) => {
        findPaths(srcId, []);
    });

    // Deterministic selection of primary critical path (longest, then sorted by IDs)
    allCriticalPaths.sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return a.join(",").localeCompare(b.join(","));
    });

    const primaryCriticalPath = allCriticalPaths[0] || criticalTaskIds;
    const multipleCriticalPaths = allCriticalPaths.length > 1;

    return {
        projectId,
        projectTitle,
        hasCycle: false,
        cycleNodes: [],
        taskCount: activeTasks.length,
        dependencyCount: graph.edges.length,
        projectCriticalPathDays,
        criticalTaskIds,
        criticalPath: primaryCriticalPath,
        allCriticalPaths: multipleCriticalPaths ? allCriticalPaths : [primaryCriticalPath],
        multipleCriticalPaths,
        projectStart: projectStartFormatted,
        projectedEnd: projectedEndFormatted,
        nodes: nodeResults,
        edges: graph.edges,
        graph
    };
};

/**
 * Fetches live project data from database and computes Critical Path.
 * READ-ONLY: Never mutates database records.
 * 
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getProjectCriticalPath = async (projectId, userId) => {
    // 1. Verify user project access
    const project = await verifyProjectAccess(projectId, userId);

    // 2. Fetch project tasks and dependencies in single efficient queries
    const [tasks, dependencies] = await Promise.all([
        prisma.tasks.findMany({
            where: {
                project_id: projectId,
                is_archived: false
            },
            include: {
                users_tasks_assigned_toTousers: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                }
            }
        }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: {
                    project_id: projectId,
                    is_archived: false
                },
                tasks_task_dependencies_depends_on_task_idTotasks: {
                    project_id: projectId,
                    is_archived: false
                }
            }
        })
    ]);

    const startOfToday = getStartOfTodayUtc();

    return calculateCriticalPath({
        project,
        tasks,
        dependencies,
        startOfToday
    });
};

export default {
    calculateTaskDurationDays,
    buildDependencyGraph,
    detectCycles,
    calculateCriticalPath,
    getProjectCriticalPath
};
