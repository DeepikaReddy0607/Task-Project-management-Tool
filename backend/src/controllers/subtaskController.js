import {
    createSubtask,
    getTaskSubtasks,
    getSubtask,
    updateSubtask,
    updateSubtaskStatus,
    deleteSubtask
} from "../services/subtaskService.js";


const create = async (req, res, next) => {
    try {

        const {
            taskId
        } = req.params;

        const {
            title,
            description,
            status,
            dueDate,
            assignedTo
        } = req.body;


        // Validate task ID
        if (!taskId) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }


        // Validate title
        if (!title || !title.trim()) {
            return res.status(400).json({
                message: "Subtask title is required"
            });
        }


        const subtask = await createSubtask(
            taskId,
            req.user.userId,
            title.trim(),
            description,
            status,
            dueDate,
            assignedTo
        );


        return res.status(201).json({
            message: "Subtask created successfully",
            subtask
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
            taskId
        } = req.params;

        if (!taskId) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }

        const subtasks = await getTaskSubtasks(
            taskId,
            req.user.userId
        );

        return res.status(200).json({
            message: "Subtasks retrieved successfully",
            subtasks
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

const getOne = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Subtask ID is required"
            });
        }

        const subtask = await getSubtask(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Subtask retrieved successfully",
            subtask
        });

    } catch (error) {

        if (error.message === "Subtask not found") {
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
                message: "Subtask ID is required"
            });
        }

        if (
            req.body.title !== undefined &&
            (!req.body.title || !req.body.title.trim())
        ) {
            return res.status(400).json({
                message: "Subtask title cannot be empty"
            });
        }

        const subtask = await updateSubtask(
            id,
            req.user.userId,
            req.body
        );

        return res.status(200).json({
            message: "Subtask updated successfully",
            subtask
        });

    } catch (error) {

        if (error.message === "Subtask not found") {
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
                message: "Subtask ID is required"
            });
        }

        if (!status || !status.trim()) {
            return res.status(400).json({
                message: "Subtask status is required"
            });
        }

        const subtask = await updateSubtaskStatus(
            id,
            req.user.userId,
            status.trim()
        );

        return res.status(200).json({
            message: "Subtask status updated successfully",
            subtask
        });

    } catch (error) {

        if (error.message === "Subtask not found") {
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

const remove = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Subtask ID is required"
            });
        }

        await deleteSubtask(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Subtask deleted successfully"
        });

    } catch (error) {

        if (error.message === "Subtask not found") {
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

export {
    create,
    getAll,
    getOne,
    update,
    updateStatus,
    remove
};