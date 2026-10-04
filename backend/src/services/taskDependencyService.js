/**
 * Task Dependency Management Service (Phase 13)
 * 
 * Authoritative, production-grade service for task dependency relationships in TaskFlow.
 * 
 * Core Invariants:
 * - Clear semantic convention: "Task A depends on Task B" means B -> A.
 *   - Task B is the PREREQUISITE (must finish before A).
 *   - Task A is BLOCKED BY Task B.
 *   - Task B BLOCKS Task A.
 * - Centralized server-side validation via validateDependency()
 * - Strictly prevents self-dependencies (A -> A)
 * - Strictly prevents cross-project dependencies
 * - Strictly prevents duplicate dependencies
 * - Strictly prevents circular dependencies using deterministic Kahn's algorithm
 * - Disallows dependencies involving archived tasks
 * - Enforces authentication and project access authorization
 * - Invalidates all downstream intelligence caches upon mutation
 * - Emits standardized real-time socket events
 */

import prisma from "../config/prisma.js";
import { emitRealtimeEvent } from "../socket.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import {
    buildDependencyGraph,
    detectCycles,
    calculateCriticalPath,
    calculateTaskDurationDays
} from "./criticalPathService.js";
import { clearShockwaveStore } from "./dependencyShockwaveService.js";
import { clearChaosStore } from "./projectChaosService.js";
import { clearRedTeamStore } from "./projectRedTeamService.js";
import { clearCounterfactualStore } from "./counterfactualTimeMachineService.js";

/**
 * Invalidates cached intelligence state across all Phase 1-12 engines.
 * Called automatically whenever project dependency structure mutates.
 * 
 * @param {string} projectId 
 */
export const invalidateProjectIntelligenceCache = (projectId) => {
    try {
        if (typeof clearShockwaveStore === "function") clearShockwaveStore();
        if (typeof clearChaosStore === "function") clearChaosStore();
        if (typeof clearRedTeamStore === "function") clearRedTeamStore();
        if (typeof clearCounterfactualStore === "function") clearCounterfactualStore();
    } catch (err) {
        console.warn("Notice: intelligence cache invalidation encountered non-fatal error:", err.message);
    }
};

/**
 * Emits a standardized real-time event for dependency mutations.
 */
export const emitDependencyRealtimeEvent = async ({
    type,
    projectId = null,
    taskId = null,
    dependsOnTaskId = null,
    userId = null,
    prismaClient = prisma
}) => {
    let resolvedProjectId = projectId;

    if (!resolvedProjectId && taskId) {
        try {
            const task = await prismaClient.tasks.findUnique({
                where: { id: taskId },
                select: { project_id: true }
            });
            resolvedProjectId = task?.project_id || null;
        } catch (err) {
            console.warn("Failed to resolve project for dependency event:", err.message);
        }
    }

    const payload = {
        type,
        projectId: resolvedProjectId,
        taskId,
        userId,
        data: {
            projectId: resolvedProjectId,
            taskId,
            dependsOnTaskId
        }
    };

    emitRealtimeEvent(payload);
    return payload;
};

/**
 * Centralized, authoritative server-side validation for dependency addition.
 * 
 * Checks:
 * 1. Required parameters
 * 2. Self-dependency (A cannot depend on A)
 * 3. Existence of both tasks
 * 4. Active state (neither task can be archived)
 * 5. Cross-project check (both tasks must belong to the same project)
 * 6. Authorization (user must have access to project)
 * 7. Duplicate dependency check
 * 8. Circular dependency detection via Kahn's algorithm
 * 
 * @param {Object} params
 * @param {string} params.taskId - Downstream / dependent task ID (the task that will be blocked)
 * @param {string} params.dependsOnTaskId - Upstream / prerequisite task ID (the task that blocks)
 * @param {string} [params.userId] - Optional user ID for authorization verification
 * @param {Object} [params.prismaClient] - Prisma client instance
 * @returns {Promise<Object>} Validation result with resolved tasks and project info
 */
export const validateDependency = async ({
    taskId,
    dependsOnTaskId,
    userId = null,
    prismaClient = prisma
}) => {
    if (!taskId || !dependsOnTaskId) {
        const error = new Error("taskId and dependsOnTaskId are required");
        error.statusCode = 400;
        error.code = "INVALID_INPUT";
        throw error;
    }

    // 1. Self-dependency check
    if (taskId === dependsOnTaskId) {
        const error = new Error("A task cannot depend on itself");
        error.statusCode = 400;
        error.code = "SELF_DEPENDENCY";
        throw error;
    }

    // 2. Fetch both tasks
    const [task, dependsOnTask] = await Promise.all([
        prismaClient.tasks.findUnique({
            where: { id: taskId },
            select: { id: true, title: true, project_id: true, status: true, is_archived: true }
        }),
        prismaClient.tasks.findUnique({
            where: { id: dependsOnTaskId },
            select: { id: true, title: true, project_id: true, status: true, is_archived: true }
        })
    ]);

    if (!task) {
        const error = new Error(`Task not found: ${taskId}`);
        error.statusCode = 404;
        error.code = "TASK_NOT_FOUND";
        throw error;
    }

    if (!dependsOnTask) {
        const error = new Error(`Prerequisite task not found: ${dependsOnTaskId}`);
        error.statusCode = 404;
        error.code = "TASK_NOT_FOUND";
        throw error;
    }

    // 3. Disallow archived tasks
    if (task.is_archived || dependsOnTask.is_archived) {
        const error = new Error("Cannot create dependencies involving archived tasks");
        error.statusCode = 400;
        error.code = "ARCHIVED_TASK";
        throw error;
    }

    // 4. Cross-project check
    if (task.project_id !== dependsOnTask.project_id) {
        const error = new Error("Cross-project dependencies are not supported. Tasks must belong to the same project.");
        error.statusCode = 400;
        error.code = "CROSS_PROJECT_DEPENDENCY";
        throw error;
    }

    // 5. Authorization check
    if (userId) {
        await verifyProjectAccess(task.project_id, userId);
    }

    // 6. Duplicate check
    const existing = await prismaClient.task_dependencies.findUnique({
        where: {
            task_id_depends_on_task_id: {
                task_id: taskId,
                depends_on_task_id: dependsOnTaskId
            }
        }
    });

    if (existing) {
        const error = new Error("Dependency already exists");
        error.statusCode = 409;
        error.code = "DEPENDENCY_EXISTS";
        throw error;
    }

    // 7. Circular dependency check via Kahn's algorithm
    const projectTasks = await prismaClient.tasks.findMany({
        where: {
            project_id: task.project_id,
            is_archived: false
        },
        select: { id: true, is_archived: true }
    });

    const projectDependencies = await prismaClient.task_dependencies.findMany({
        where: {
            tasks_task_dependencies_task_idTotasks: {
                project_id: task.project_id
            }
        },
        select: {
            task_id: true,
            depends_on_task_id: true
        }
    });

    // Simulate candidate edge: depends_on_task_id (from) -> task_id (to)
    const simulatedDependencies = [
        ...projectDependencies,
        { task_id: taskId, depends_on_task_id: dependsOnTaskId }
    ];

    const graph = buildDependencyGraph(projectTasks, simulatedDependencies);
    const cycleResult = detectCycles(graph);

    if (cycleResult.hasCycle) {
        const cycle = cycleResult.cycleNodes && cycleResult.cycleNodes.length > 0
            ? cycleResult.cycleNodes
            : [dependsOnTaskId, taskId];

        const error = new Error("Circular dependency detected. Adding this dependency would create a cycle in the project graph.");
        error.statusCode = 409;
        error.code = "DEPENDENCY_CYCLE";
        error.cycle = cycle;
        throw error;
    }

    return {
        valid: true,
        task,
        dependsOnTask,
        projectId: task.project_id
    };
};

/**
 * Creates a task dependency with authoritative validation and event notification.
 * 
 * In TaskFlow schema:
 * task_id depends on depends_on_task_id.
 * 
 * @param {Object} params
 * @param {string} params.taskId - The dependent task ID
 * @param {string} params.dependsOnTaskId - The prerequisite task ID
 * @param {string} [params.userId] - Optional initiating user ID
 * @param {Object} [params.prismaClient] - Prisma client instance
 * @returns {Promise<Object>} Created dependency record
 */
export const createTaskDependency = async ({
    taskId,
    dependsOnTaskId,
    userId = null,
    prismaClient = prisma
}) => {
    // 1. Authoritative validation
    const validation = await validateDependency({
        taskId,
        dependsOnTaskId,
        userId,
        prismaClient
    });

    // 2. Persist dependency
    const dependency = await prismaClient.task_dependencies.create({
        data: {
            task_id: taskId,
            depends_on_task_id: dependsOnTaskId
        }
    });

    // 3. Invalidate intelligence caches for the project
    invalidateProjectIntelligenceCache(validation.projectId);

    // 4. Emit real-time event
    await emitDependencyRealtimeEvent({
        type: "dependency.created",
        projectId: validation.projectId,
        taskId,
        dependsOnTaskId,
        userId,
        prismaClient
    });

    return {
        dependency,
        task: validation.task,
        dependsOnTask: validation.dependsOnTask,
        projectId: validation.projectId
    };
};

/**
 * Deletes a task dependency and flushes intelligence caches.
 * 
 * @param {Object} params
 * @param {string} params.taskId - Dependent task ID
 * @param {string} params.dependsOnTaskId - Prerequisite task ID
 * @param {string} [params.userId] - Initiating user ID
 * @param {Object} [params.prismaClient] - Prisma client instance
 * @returns {Promise<Object>} Success status
 */
export const deleteTaskDependency = async ({
    taskId,
    dependsOnTaskId,
    userId = null,
    prismaClient = prisma
}) => {
    if (!taskId || !dependsOnTaskId) {
        const error = new Error("taskId and dependsOnTaskId are required");
        error.statusCode = 400;
        error.code = "INVALID_INPUT";
        throw error;
    }

    const existing = await prismaClient.task_dependencies.findUnique({
        where: {
            task_id_depends_on_task_id: {
                task_id: taskId,
                depends_on_task_id: dependsOnTaskId
            }
        }
    });

    if (!existing) {
        const error = new Error("Dependency not found");
        error.statusCode = 404;
        error.code = "DEPENDENCY_NOT_FOUND";
        throw error;
    }

    const task = await prismaClient.tasks.findUnique({
        where: { id: taskId },
        select: { id: true, project_id: true }
    });

    if (userId && task?.project_id) {
        await verifyProjectAccess(task.project_id, userId);
    }

    await prismaClient.task_dependencies.delete({
        where: {
            task_id_depends_on_task_id: {
                task_id: taskId,
                depends_on_task_id: dependsOnTaskId
            }
        }
    });

    const projectId = task?.project_id || null;
    if (projectId) {
        invalidateProjectIntelligenceCache(projectId);
    }

    await emitDependencyRealtimeEvent({
        type: "dependency.deleted",
        projectId,
        taskId,
        dependsOnTaskId,
        userId,
        prismaClient
    });

    return {
        success: true,
        message: "Dependency removed successfully",
        taskId,
        dependsOnTaskId,
        projectId
    };
};

/**
 * Retrieves dependencies for a specific task.
 * 
 * Distinguishes clearly between:
 * - "BLOCKED BY" (Prerequisites): Upstream tasks that must finish before this task can start
 * - "BLOCKS" (Dependents): Downstream tasks that cannot start until this task finishes
 * 
 * @param {Object} params
 * @param {string} params.taskId
 * @param {string} [params.userId]
 * @param {Object} [params.prismaClient]
 * @returns {Promise<Object>} Structured dependency overview
 */
export const getTaskDependencies = async ({
    taskId,
    userId = null,
    prismaClient = prisma
}) => {
    if (!taskId) {
        const error = new Error("taskId is required");
        error.statusCode = 400;
        error.code = "INVALID_INPUT";
        throw error;
    }

    const task = await prismaClient.tasks.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            project_id: true,
            is_archived: true,
            due_date: true
        }
    });

    if (!task) {
        const error = new Error(`Task not found: ${taskId}`);
        error.statusCode = 404;
        error.code = "TASK_NOT_FOUND";
        throw error;
    }

    if (userId) {
        await verifyProjectAccess(task.project_id, userId);
    }

    // 1. Upstream prerequisites: tasks where task_id === taskId
    const blockedByRecords = await prismaClient.task_dependencies.findMany({
        where: { task_id: taskId },
        include: {
            tasks_task_dependencies_depends_on_task_idTotasks: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    due_date: true,
                    start_date: true,
                    assigned_to: true,
                    is_archived: true,
                    users_tasks_assigned_toTousers: {
                        select: { id: true, first_name: true, last_name: true }
                    }
                }
            }
        }
    });

    // 2. Downstream dependents: tasks where depends_on_task_id === taskId
    const blocksRecords = await prismaClient.task_dependencies.findMany({
        where: { depends_on_task_id: taskId },
        include: {
            tasks_task_dependencies_task_idTotasks: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    due_date: true,
                    start_date: true,
                    assigned_to: true,
                    is_archived: true,
                    users_tasks_assigned_toTousers: {
                        select: { id: true, first_name: true, last_name: true }
                    }
                }
            }
        }
    });

    const isCompleted = (status) => status === "Completed" || status === "Done";

    const blockedBy = blockedByRecords
        .map((r) => {
            const t = r.tasks_task_dependencies_depends_on_task_idTotasks;
            if (!t) return null;
            const completed = isCompleted(t.status);
            return {
                id: t.id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                dueDate: t.due_date,
                startDate: t.start_date,
                isCompleted: completed,
                isBlocking: !completed,
                isArchived: t.is_archived,
                assignedTo: t.users_tasks_assigned_toTousers
                    ? {
                          id: t.users_tasks_assigned_toTousers.id,
                          name: `${t.users_tasks_assigned_toTousers.first_name || ""} ${t.users_tasks_assigned_toTousers.last_name || ""}`.trim()
                      }
                    : null
            };
        })
        .filter(Boolean);

    const blocks = blocksRecords
        .map((r) => {
            const t = r.tasks_task_dependencies_task_idTotasks;
            if (!t) return null;
            const completed = isCompleted(t.status);
            return {
                id: t.id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                dueDate: t.due_date,
                startDate: t.start_date,
                isCompleted: completed,
                isArchived: t.is_archived,
                assignedTo: t.users_tasks_assigned_toTousers
                    ? {
                          id: t.users_tasks_assigned_toTousers.id,
                          name: `${t.users_tasks_assigned_toTousers.first_name || ""} ${t.users_tasks_assigned_toTousers.last_name || ""}`.trim()
                      }
                    : null
            };
        })
        .filter(Boolean);

    const activeBlockers = blockedBy.filter((t) => t.isBlocking);
    const isBlocked = activeBlockers.length > 0;

    return {
        taskId: task.id,
        taskTitle: task.title,
        taskStatus: task.status,
        projectId: task.project_id,
        isBlocked,
        blockingCount: activeBlockers.length,
        blockedBy,
        blocks,
        summary: {
            prerequisitesCount: blockedBy.length,
            dependentsCount: blocks.length,
            activeBlockersCount: activeBlockers.length,
            completedPrerequisitesCount: blockedBy.length - activeBlockers.length
        }
    };
};

/**
 * Retrieves the complete project dependency graph, enriched with Critical Path
 * analysis, blocker counts, cycle detection status, and summary metrics.
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.userId]
 * @param {Object} [params.prismaClient]
 * @returns {Promise<Object>} Complete project graph representation
 */
export const getProjectDependencyGraph = async ({
    projectId,
    userId = null,
    prismaClient = prisma
}) => {
    if (!projectId) {
        const error = new Error("projectId is required");
        error.statusCode = 400;
        error.code = "INVALID_INPUT";
        throw error;
    }

    if (userId) {
        await verifyProjectAccess(projectId, userId);
    }

    const project = await prismaClient.projects.findUnique({
        where: { id: projectId },
        select: { id: true, title: true, status: true, start_date: true, end_date: true }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        error.code = "PROJECT_NOT_FOUND";
        throw error;
    }

    const tasks = await prismaClient.tasks.findMany({
        where: { project_id: projectId, is_archived: false },
        select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            start_date: true,
            due_date: true,
            estimated_hours: true,
            assigned_to: true,
            is_archived: true,
            users_tasks_assigned_toTousers: {
                select: { id: true, first_name: true, last_name: true }
            }
        }
    });

    const dependencies = await prismaClient.task_dependencies.findMany({
        where: {
            tasks_task_dependencies_task_idTotasks: {
                project_id: projectId
            }
        },
        select: {
            task_id: true,
            depends_on_task_id: true
        }
    });

    // Compute Critical Path
    const cpmResult = calculateCriticalPath({
        project,
        tasks,
        dependencies
    });

    const criticalTaskIds = new Set(cpmResult.criticalTaskIds || []);
    const isCompleted = (status) => status === "Completed" || status === "Done";

    // Build prerequisite map
    const prereqMap = new Map();
    dependencies.forEach((d) => {
        if (!prereqMap.has(d.task_id)) prereqMap.set(d.task_id, []);
        prereqMap.get(d.task_id).push(d.depends_on_task_id);
    });

    const taskById = new Map(tasks.map((t) => [t.id, t]));

    const nodes = tasks.map((t) => {
        const prereqIds = prereqMap.get(t.id) || [];
        const hasIncompletePrereq = prereqIds.some((pId) => {
            const pTask = taskById.get(pId);
            return pTask && !isCompleted(pTask.status);
        });

        const blocksCount = dependencies.filter((d) => d.depends_on_task_id === t.id).length;

        return {
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            startDate: t.start_date,
            dueDate: t.due_date,
            durationDays: calculateTaskDurationDays(t),
            isCritical: criticalTaskIds.has(t.id),
            isBlocked: hasIncompletePrereq,
            blockedByCount: prereqIds.length,
            blocksCount,
            assignedTo: t.users_tasks_assigned_toTousers
                ? `${t.users_tasks_assigned_toTousers.first_name || ""} ${t.users_tasks_assigned_toTousers.last_name || ""}`.trim()
                : null
        };
    });

    const edges = dependencies
        .filter((d) => taskById.has(d.task_id) && taskById.has(d.depends_on_task_id))
        .map((d) => ({
            from: d.depends_on_task_id,
            to: d.task_id,
            isCritical: criticalTaskIds.has(d.depends_on_task_id) && criticalTaskIds.has(d.task_id)
        }));

    return {
        projectId,
        projectTitle: project.title,
        nodes,
        edges,
        hasCycles: cpmResult.hasCycle || false,
        cycleNodes: cpmResult.cycleNodes || [],
        stats: {
            totalTasks: nodes.length,
            totalDependencies: edges.length,
            criticalTasksCount: criticalTaskIds.size,
            blockedTasksCount: nodes.filter((n) => n.isBlocked).length,
            projectDurationDays: cpmResult.projectDurationDays || 0
        }
    };
};

export default {
    validateDependency,
    createTaskDependency,
    deleteTaskDependency,
    getTaskDependencies,
    getProjectDependencyGraph,
    invalidateProjectIntelligenceCache,
    emitDependencyRealtimeEvent
};
