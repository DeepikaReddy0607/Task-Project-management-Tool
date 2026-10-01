import prisma from "../config/prisma.js";


// Create a comment on a task
const createComment = async (
    taskId,
    userId,
    content
) => {

    // Find task and its project
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    workspace_id: true
                }
            }
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }


    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: task.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }


    // Create comment
    const comment = await prisma.comments.create({
        data: {
            task_id: taskId,
            user_id: userId,
            content: content.trim()
        },
        include: {
            users: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return comment;
};


// Get all comments for a task
const getTaskComments = async (
    taskId,
    userId
) => {

    // Find task and project
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    workspace_id: true
                }
            }
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }


    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: task.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }


    // Get comments
    const comments = await prisma.comments.findMany({
        where: {
            task_id: taskId
        },
        orderBy: {
            created_at: "asc"
        },
        include: {
            users: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return comments;
};


// Update own comment
const updateComment = async (
    commentId,
    userId,
    content
) => {

    // Find comment
    const comment = await prisma.comments.findUnique({
        where: {
            id: commentId
        }
    });

    if (!comment) {
        throw new Error("Comment not found");
    }


    // Only comment owner can edit
    if (comment.user_id !== userId) {
        throw new Error(
            "You can only edit your own comments"
        );
    }


    // Update comment
    const updatedComment =
        await prisma.comments.update({
            where: {
                id: commentId
            },
            data: {
                content: content.trim(),
                updated_at: new Date()
            },
            include: {
                users: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true
                    }
                }
            }
        });

    return updatedComment;
};


// Delete own comment
const deleteComment = async (
    commentId,
    userId
) => {

    // Find comment
    const comment = await prisma.comments.findUnique({
        where: {
            id: commentId
        }
    });

    if (!comment) {
        throw new Error("Comment not found");
    }


    // Only comment owner can delete
    if (comment.user_id !== userId) {
        throw new Error(
            "You can only delete your own comments"
        );
    }


    // Delete comment
    await prisma.comments.delete({
        where: {
            id: commentId
        }
    });

    return true;
};


export {
    createComment,
    getTaskComments,
    updateComment,
    deleteComment
};