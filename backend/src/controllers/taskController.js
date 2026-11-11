import {
    createTask,
    getProjectTasks,
    getTask,
    updateTask,
    assignTask,
    deleteTask,
    archiveTask,
    restoreTask,
    duplicateTask,
    getMyTasks,
    updateTaskStatus
} from "../services/taskService.js";
import { prioritizeTasks } from "../services/taskPriorityService.js";
import { emitRealtimeEvent } from "../socket.js";
import { createActivity } from "../services/activityService.js";


const create = async (req, res, next) => {
    try {

        const {
            projectId
        } = req.params;

        const {
            title,
            description,
            priority,
            status,
            startDate,
            dueDate,
            estimatedHours,
            assignedTo,
            workspaceId
        } = req.body;


        // Validate project ID
        if (!projectId) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }


        // Validate title
        if (!title || !title.trim()) {
            return res.status(400).json({
                message: "Task title is required"
            });
        }


        const resolvedWorkspaceId = workspaceId || req.query.workspaceId || null;

        const task = await createTask(
            projectId,
            req.user.userId,
            title.trim(),
            description,
            priority,
            status,
            startDate,
            dueDate,
            estimatedHours,
            assignedTo,
            resolvedWorkspaceId
        );

        const eventWorkspaceId = task.projects?.workspace_id || task.workspace_id || resolvedWorkspaceId;
        if (eventWorkspaceId) {
            try {
                await createActivity({
                    workspaceId: eventWorkspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_CREATED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Created task "${task.title}"`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task creation:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.created",
            workspaceId: eventWorkspaceId,
            projectId: task.project_id || projectId,
            taskId: task.id,
            userId: task.assigned_to || req.user.userId,
            data: task
        });

        return res.status(201).json({
            message: "Task created successfully",
            task
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Assigned user is not a member of the project") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task priority") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (
            error.message ===
            "Assigned user is not a member of the project"
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getAll = async (req, res, next) => {
    try {

        const {
            projectId
        } = req.params;

        if (!projectId) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const tasks = await getProjectTasks(
            projectId,
            req.user.userId,
            { page: req.query.page, limit: req.query.limit, archived: req.query.archived === "true" || req.query.isArchived === "true", workspaceId: req.query.workspaceId }
        );

        return res.status(200).json({
            message: "Tasks retrieved successfully",
            tasks,
            pagination: tasks.pagination
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Assigned user is not a member of the project") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task priority") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getOne = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }

        const task = await getTask(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Task retrieved successfully",
            task
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Task not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const update = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }

        // Validate title if provided
        if (
            req.body.title !== undefined &&
            (!req.body.title || !req.body.title.trim())
        ) {
            return res.status(400).json({
                message: "Task title cannot be empty"
            });
        }

        const task = await updateTask(
            id,
            req.user.userId,
            req.body
        );

        const workspaceId = task.projects?.workspace_id || task.workspace_id;
        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_UPDATED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Updated task "${task.title}"`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task update:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.updated",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: task.assigned_to || req.user.userId,
            changes: req.body,
            data: task
        });

        return res.status(200).json({
            message: "Task updated successfully",
            task
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Assigned user is not a member of the project") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task priority") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Task not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const assign = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        const {
            assignedTo
        } = req.body;

        if (!id) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }

        if (!assignedTo) {
            return res.status(400).json({
                message: "Assigned user ID is required"
            });
        }

        const task = await assignTask(
            id,
            req.user.userId,
            assignedTo
        );

        const workspaceId = task.projects?.workspace_id || task.workspace_id;
        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_ASSIGNED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Assigned task "${task.title}" to user ${assignedTo}`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task assign:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.assigned",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: assignedTo,
            changes: { assignedTo },
            data: task
        });

        return res.status(200).json({
            message: "Task assigned successfully",
            task
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Task not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "User not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        if (
            error.message ===
            "Assigned user is not a member of the project"
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const archive = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }

        const task = await archiveTask(
            id,
            req.user.userId
        );

        const workspaceId = task.projects?.workspace_id || task.workspace_id;
        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_ARCHIVED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Archived task "${task.title}"`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task archive:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.archived",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: req.user.userId,
            data: task
        });

        return res.status(200).json({
            message: "Task archived successfully",
            task
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Task not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        if (error.message === "Task is already archived") {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const restore = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Task ID is required" });
        }

        const task = await restoreTask(id, req.user.userId);
        const workspaceId = task.projects?.workspace_id || task.workspace_id;

        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_RESTORED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Restored task "${task.title}"`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task restore:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.restored",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: req.user.userId,
            data: task
        });

        return res.status(200).json({
            message: "Task restored successfully",
            task
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error.message === "Task not found") {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === "Workspace access denied") {
            return res.status(403).json({ message: error.message });
        }
        if (error.message === "Task is not archived") {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("Cannot restore task while its parent project is archived")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Task ID is required" });
        }

        const result = await deleteTask(id, req.user.userId);

        emitRealtimeEvent({
            type: "task.deleted",
            workspaceId: result.workspaceId,
            projectId: result.projectId,
            taskId: id,
            userId: req.user.userId,
            data: result
        });

        return res.status(200).json({
            message: "Task deleted successfully",
            task: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error.message === "Task not found") {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === "Project access denied" || error.message === "Workspace access denied") {
            return res.status(403).json({ message: error.message });
        }
        next(error);
    }
};

const duplicate = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Task ID is required" });
        }

        const task = await duplicateTask(id, req.user.userId);
        const workspaceId = task.projects?.workspace_id || task.workspace_id;

        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_CREATED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Duplicated task "${task.title}"`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task duplicate:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.created",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: req.user.userId,
            data: task
        });

        return res.status(201).json({
            message: "Task duplicated successfully",
            task
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error.message === "Task not found") {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === "Workspace access denied") {
            return res.status(403).json({ message: error.message });
        }
        next(error);
    }
};

const getMine = async (req, res, next) => {
    try {

        const { archived, workspaceId, projectId, assignedTo } = req.query;

        const tasks = await getMyTasks(
            req.user.userId,
            { archived, workspaceId, projectId, assignedTo }
        );

        return res.status(200).json({
            message: "My tasks retrieved successfully",
            tasks
        });

    } catch (error) {
        next(error);
    }
};

const updateStatus = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        const {
            status
        } = req.body;

        if (!id) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }

        if (!status || !status.trim()) {
            return res.status(400).json({
                message: "Task status is required"
            });
        }

        const task = await updateTaskStatus(
            id,
            req.user.userId,
            status.trim()
        );

        const workspaceId = task.projects?.workspace_id || task.workspace_id;
        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_STATUS_CHANGED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: `Changed task "${task.title}" status to ${status.trim()}`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task status change:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.status_updated",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: task.assigned_to || req.user.userId,
            oldStatus: task.oldStatus,
            newStatus: status.trim(),
            changes: { status: status.trim() },
            data: task
        });

        return res.status(200).json({
            message: "Task status updated successfully",
            task
        });

    } catch (error) {

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "Task not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        if (error.message === "Invalid task status") {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getPrioritized = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { projectId, limit, context, taskId } = req.query;

        const result = await prioritizeTasks({
            userId,
            projectId: projectId || null,
            taskId: taskId || null,
            context: context || "my-tasks",
            limit: limit ? parseInt(limit, 10) : null
        });

        return res.status(200).json(result);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        next(error);
    }
};

export {
    create,
    getAll,
    getOne,
    update,
    assign,
    remove,
    archive,
    restore,
    duplicate,
    getMine,
    updateStatus,
    getPrioritized
};