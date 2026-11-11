import prisma from "../config/prisma.js";
import { checkProjectAccess } from "./projectService.js";

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

    if (task.is_archived) {
        const error = new Error("Cannot add a subtask to an archived task");
        error.statusCode = 400;
        throw error;
    }

    // Check project access
    await checkProjectAccess(task.projects, userId);

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
            is_archived: false,
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
    userId,
    options = {}
) => {

    // Find the parent task and its project/workspace
    const task = await prisma.tasks.findUnique({
        where: {
            id: taskId
        },
        include: {
            projects: true
        }
    });

    if (!task) {
        throw new Error("Task not found");
    }

    if (task.is_archived) {
        const error = new Error("Cannot add a subtask to an archived task");
        error.statusCode = 400;
        throw error;
    }

    // Check project access
    await checkProjectAccess(task.projects, userId);

    const isArchived = options?.archived === true || options?.archived === "true";
    const includeAll = options?.archived === "all" || options?.includeArchived === true || options?.includeArchived === "true";

    const where = {
        task_id: taskId
    };

    if (!includeAll) {
        where.is_archived = isArchived;
    }

    // Get subtasks belonging to the task
    const subtasks = await prisma.subtasks.findMany({
        where,
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
                    projects: true
                }
            },
        }
    });

    if (!subtask) {
        throw new Error("Subtask not found");
    }

    // Check project access
    await checkProjectAccess(subtask.tasks.projects, userId);

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
                    projects: true
                }
            }
        }
    });

    if (!existingSubtask) {
        throw new Error("Subtask not found");
    }

    // Check project access
    await checkProjectAccess(existingSubtask.tasks.projects, userId);

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
                    projects: true
                }
            }
        }
    });

    if (!existingSubtask) {
        throw new Error("Subtask not found");
    }

    // Check project access
    await checkProjectAccess(existingSubtask.tasks.projects, userId);

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
                    projects: true
                }
            }
        }
    });

    if (!existingSubtask) {
        throw new Error("Subtask not found");
    }

    // Check project access
    await checkProjectAccess(existingSubtask.tasks.projects, userId);

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

const archiveSubtask = async (subtaskId, userId) => {
    const existingSubtask = await prisma.subtasks.findUnique({
        where: { id: subtaskId },
        include: {
            tasks: {
                include: { projects: true }
            }
        }
    });

    if (!existingSubtask) {
        const error = new Error("Subtask not found");
        error.statusCode = 404;
        throw error;
    }

    await checkProjectAccess(existingSubtask.tasks.projects, userId);

    if (existingSubtask.is_archived) {
        const error = new Error("Subtask is already archived");
        error.statusCode = 400;
        throw error;
    }

    const subtask = await prisma.subtasks.update({
        where: { id: subtaskId },
        data: { is_archived: true },
        include: {
            tasks: {
                select: { id: true, title: true, project_id: true }
            }
        }
    });

    return subtask;
};

const restoreSubtask = async (subtaskId, userId) => {
    const existingSubtask = await prisma.subtasks.findUnique({
        where: { id: subtaskId },
        include: {
            tasks: {
                include: { projects: true }
            }
        }
    });

    if (!existingSubtask) {
        const error = new Error("Subtask not found");
        error.statusCode = 404;
        throw error;
    }

    await checkProjectAccess(existingSubtask.tasks.projects, userId);

    if (!existingSubtask.is_archived) {
        const error = new Error("Subtask is not archived");
        error.statusCode = 400;
        throw error;
    }

    if (existingSubtask.tasks?.is_archived) {
        const error = new Error("Cannot restore subtask while its parent task is archived. Please restore the task first.");
        error.statusCode = 400;
        throw error;
    }

    const subtask = await prisma.subtasks.update({
        where: { id: subtaskId },
        data: { is_archived: false },
        include: {
            tasks: {
                select: { id: true, title: true, project_id: true }
            }
        }
    });

    return subtask;
};

export {
    VALID_SUBTASK_STATUSES,
    createSubtask,
    getTaskSubtasks,
    getSubtask,
    updateSubtask,
    updateSubtaskStatus,
    deleteSubtask,
    archiveSubtask,
    restoreSubtask
};