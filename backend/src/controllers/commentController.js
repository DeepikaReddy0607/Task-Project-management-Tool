import {
    createComment,
    getTaskComments,
    updateComment,
    deleteComment
} from "../services/commentService.js";


// Create comment
const create = async (req, res, next) => {
    try {

        const {
            taskId
        } = req.params;

        const {
            content
        } = req.body;


        // Validate task ID
        if (!taskId) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }


        // Validate comment content
        if (!content || !content.trim()) {
            return res.status(400).json({
                message: "Comment content is required"
            });
        }


        const comment = await createComment(
            taskId,
            req.user.userId,
            content.trim()
        );


        return res.status(201).json({
            message: "Comment added successfully",
            comment
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


// Get comments for a task
const getAll = async (req, res, next) => {
    try {

        const {
            taskId
        } = req.params;


        // Validate task ID
        if (!taskId) {
            return res.status(400).json({
                message: "Task ID is required"
            });
        }


        const comments = await getTaskComments(
            taskId,
            req.user.userId
        );


        return res.status(200).json({
            message: "Comments retrieved successfully",
            comments
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


// Update own comment
const update = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        const {
            content
        } = req.body;


        // Validate comment ID
        if (!id) {
            return res.status(400).json({
                message: "Comment ID is required"
            });
        }


        // Validate content
        if (!content || !content.trim()) {
            return res.status(400).json({
                message: "Comment content is required"
            });
        }


        const comment = await updateComment(
            id,
            req.user.userId,
            content.trim()
        );


        return res.status(200).json({
            message: "Comment updated successfully",
            comment
        });

    } catch (error) {

        if (error.message === "Comment not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message ===
            "You can only edit your own comments"
        ) {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};


// Delete own comment
const remove = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;


        // Validate comment ID
        if (!id) {
            return res.status(400).json({
                message: "Comment ID is required"
            });
        }


        await deleteComment(
            id,
            req.user.userId
        );


        return res.status(200).json({
            message: "Comment deleted successfully"
        });

    } catch (error) {

        if (error.message === "Comment not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message ===
            "You can only delete your own comments"
        ) {
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
    update,
    remove
};