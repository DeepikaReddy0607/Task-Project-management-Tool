/**
 * Task Dependency Controller (Phase 13)
 * 
 * Exposes REST endpoints for task dependency CRUD, validation,
 * and project graph visualization.
 */

import {
    createTaskDependency,
    deleteTaskDependency,
    getTaskDependencies,
    getProjectDependencyGraph
} from "../services/taskDependencyService.js";

/**
 * POST /api/tasks/:taskId/dependencies
 * Creates a new task dependency (taskId depends on dependsOnTaskId).
 */
export const createDependencyHandler = async (req, res) => {
    try {
        const taskId = req.params.taskId || req.body.taskId;
        const { dependsOnTaskId } = req.body;
        const userId = req.user?.id;

        if (!taskId || !dependsOnTaskId) {
            return res.status(400).json({
                error: "taskId and dependsOnTaskId are required",
                code: "INVALID_INPUT"
            });
        }

        const result = await createTaskDependency({
            taskId,
            dependsOnTaskId,
            userId
        });

        return res.status(201).json({
            success: true,
            message: "Dependency created successfully",
            data: result
        });
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            error: err.message,
            code: err.code || "DEPENDENCY_ERROR",
            cycle: err.cycle || undefined
        });
    }
};

/**
 * DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId
 * Removes a task dependency.
 */
export const deleteDependencyHandler = async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const dependsOnTaskId = req.params.dependsOnTaskId || req.body.dependsOnTaskId || req.query.dependsOnTaskId;
        const userId = req.user?.id;

        if (!taskId || !dependsOnTaskId) {
            return res.status(400).json({
                error: "taskId and dependsOnTaskId are required",
                code: "INVALID_INPUT"
            });
        }

        const result = await deleteTaskDependency({
            taskId,
            dependsOnTaskId,
            userId
        });

        return res.status(200).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            error: err.message,
            code: err.code || "DEPENDENCY_ERROR"
        });
    }
};

/**
 * GET /api/tasks/:taskId/dependencies
 * Retrieves structured dependency information for a task (Blocked By & Blocks).
 */
export const getTaskDependenciesHandler = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user?.id;

        const result = await getTaskDependencies({
            taskId,
            userId
        });

        return res.status(200).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            error: err.message,
            code: err.code || "DEPENDENCY_ERROR"
        });
    }
};

/**
 * GET /api/projects/:id/dependencies
 * Retrieves complete dependency graph for a project with CPM enrichment.
 */
export const getProjectDependenciesHandler = async (req, res) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const userId = req.user?.id;

        const result = await getProjectDependencyGraph({
            projectId,
            userId
        });

        return res.status(200).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            error: err.message,
            code: err.code || "DEPENDENCY_ERROR"
        });
    }
};

export default {
    createDependencyHandler,
    deleteDependencyHandler,
    getTaskDependenciesHandler,
    getProjectDependenciesHandler
};
