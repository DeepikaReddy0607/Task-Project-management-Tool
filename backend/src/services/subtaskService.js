import prisma from "../config/prisma.js";

const VALID_SUBTASK_STATUSES = [
    "To Do",
    "In Progress",
    "Done"
];

const createSubtask = async (
    taskId,
    userId,
    title,
    description,
    status,
    dueDate,
    assignedTo
) => {

    // Find the parent task and its project/workspace
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
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

    // If assigning the subtask, verify that the user
    // belongs to the same project
    if (assignedTo) {

        const assignedMember =
            await prisma.project_members.findUnique({
                where: {
                    project_id_user_id: {
                        project_id: task.project_id,
                        user_id: assignedTo
                    }
                }
            });

        if (!assignedMember) {
            throw new Error(
                "Assigned user is not a member of the project"
            );
        }
    }

    const resolvedStatus = status || "To Do";
    if (!VALID_SUBTASK_STATUSES.includes(resolvedStatus)) {
        const error = new Error("Invalid subtask status");
        error.statusCode = 400;
        throw error;
    }

    const subtask = await prisma.subtasks.create({
        data: {
            task_id: taskId,
            title,
            description: description || null,
            status: resolvedStatus,
            due_date: dueDate
                ? new Date(dueDate)
                : null,
        },
        include: {
            tasks: {
                select: {
                    id: true,
                    title: true,
                    project_id: true
                }
            }
        }
    });

    return subtask;
};

const getTaskSubtasks = async (
    taskId,
    userId
) => {

    // Find the parent task and its project/workspace
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: {
                select: {
                    id: true,
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

    // Get all subtasks belonging to the task
    const subtasks = await prisma.subtasks.findMany({
    where: {
        task_id: taskId
    },
    orderBy: {
        created_at: "asc"
    }
});

    return subtasks;
};

const getSubtask = async (
    subtaskId,
    userId
) => {

    // Find the subtask and its parent task/project/workspace
    const subtask = await prisma.subtasks.findUnique({
        where: {
            id: subtaskId
        },
        include: {
            tasks: {
                include: {
                    projects: {
                        select: {
                            id: true,
                            workspace_id: true
                        }
                    }
                }
            },
        }
    });

    if (!subtask) {
        throw new Error("Subtask not found");
    }

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: subtask.tasks.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    return subtask;
};

const updateSubtask = async (
    subtaskId,
    userId,
    data
) => {

    // Find the subtask and its parent task/project/workspace
    const existingSubtask = await prisma.subtasks.findUnique({
        where: {
            id: subtaskId
        },
        include: {
            tasks: {
                include: {
                    projects: {
                        select: {
                            id: true,
                            workspace_id: true
                        }
                    }
                }
            }
        }
    });

    if (!existingSubtask) {
        throw new Error("Subtask not found");
    }

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id:
                        existingSubtask.tasks.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    // If assigning the subtask, verify project membership
    if (data.assignedTo !== undefined && data.assignedTo !== null) {

        const assignedMember =
            await prisma.project_members.findUnique({
                where: {
                    project_id_user_id: {
                        project_id:
                            existingSubtask.tasks.project_id,
                        user_id: data.assignedTo
                    }
                }
            });

        if (!assignedMember) {
            throw new Error(
                "Assigned user is not a member of the project"
            );
        }
    }

    const updateData = {};

    if (data.title !== undefined) {
        updateData.title = data.title.trim();
    }

    if (data.description !== undefined) {
        updateData.description = data.description;
    }

    if (data.status !== undefined) {
        if (!VALID_SUBTASK_STATUSES.includes(data.status)) {
            const error = new Error("Invalid subtask status");
            error.statusCode = 400;
            throw error;
        }
        updateData.status = data.status;
    }

    if (data.dueDate !== undefined) {
        updateData.due_date = data.dueDate
            ? new Date(data.dueDate)
            : null;
    }

    const subtask = await prisma.subtasks.update({
        where: {
            id: subtaskId
        },
        data: updateData,
        include: {
            tasks: {
                select: {
                    id: true,
                    title: true,
                    project_id: true
                }
            }
        }
    });

    return subtask;
};

const updateSubtaskStatus = async (
    subtaskId,
    userId,
    status
) => {

    if (!status || !VALID_SUBTASK_STATUSES.includes(status)) {
        const error = new Error("Invalid subtask status");
        error.statusCode = 400;
        throw error;
    }

    // Find subtask and parent task/project/workspace
    const existingSubtask = await prisma.subtasks.findUnique({
        where: {
            id: subtaskId
        },
        include: {
            tasks: {
                include: {
                    projects: {
                        select: {
                            id: true,
                            workspace_id: true
                        }
                    }
                }
            }
        }
    });

    if (!existingSubtask) {
        throw new Error("Subtask not found");
    }

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id:
                        existingSubtask.tasks.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    const subtask = await prisma.subtasks.update({
        where: {
            id: subtaskId
        },
        data: {
            status
        },
        include: {
            tasks: {
                select: {
                    id: true,
                    title: true,
                    project_id: true
                }
            }
        }
    });

    return subtask;
};

const deleteSubtask = async (
    subtaskId,
    userId
) => {

    // Find the subtask and its parent task/project/workspace
    const existingSubtask = await prisma.subtasks.findUnique({
        where: {
            id: subtaskId
        },
        include: {
            tasks: {
                include: {
                    projects: {
                        select: {
                            id: true,
                            workspace_id: true
                        }
                    }
                }
            }
        }
    });

    if (!existingSubtask) {
        throw new Error("Subtask not found");
    }

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id:
                        existingSubtask.tasks.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    await prisma.subtasks.delete({
        where: {
            id: subtaskId
        }
    });

    return {
        id: subtaskId,
        taskId: existingSubtask.task_id,
        projectId: existingSubtask.tasks?.projects?.id,
        workspaceId: existingSubtask.tasks?.projects?.workspace_id
    };
};

export {
    VALID_SUBTASK_STATUSES,
    createSubtask,
    getTaskSubtasks,
    getSubtask,
    updateSubtask,
    updateSubtaskStatus,
    deleteSubtask
};