import {
    createTask,
    getProjectTasks,
    getTask,
    updateTask,
    assignTask,
    archiveTask,
    getMyTasks,
    updateTaskStatus
} from "../services/taskService.js";
import { prioritizeTasks } from "../services/taskPriorityService.js";
import { emitRealtimeEvent } from "../socket.js";


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
            assignedTo
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
            assignedTo
        );

        emitRealtimeEvent({
            type: "task.created",
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
            req.user.userId
        );

        return res.status(200).json({
            message: "Tasks retrieved successfully",
            tasks
        });

    } catch (error) {

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

        emitRealtimeEvent({
            type: "task.updated",
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

        emitRealtimeEvent({
            type: "task.assigned",
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

        emitRealtimeEvent({
            type: "task.archived",
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

const getMine = async (req, res, next) => {
    try {

        const tasks = await getMyTasks(
            req.user.userId
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

        emitRealtimeEvent({
            type: "task.status_changed",
            projectId: task.project_id,
            taskId: task.id,
            userId: task.assigned_to,
            changes: { status: status.trim() },
            data: task
        });

        return res.status(200).json({
            message: "Task status updated successfully",
            task
        });

    } catch (error) {

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
    archive,
    getMine,
    updateStatus,
    getPrioritized
};