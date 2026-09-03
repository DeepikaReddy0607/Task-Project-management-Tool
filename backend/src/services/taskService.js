import prisma from "../config/prisma.js";

const VALID_TASK_STATUSES = [
    "Backlog",
    "To Do",
    "In Progress",
    "Review",
    "Completed"
];

const createTask = async (
    projectId,
    userId,
    title,
    description,
    priority,
    status,
    startDate,
    dueDate,
    estimatedHours,
    assignedTo
) => {

    // Check whether project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        throw new Error("Project not found");
    }

    // Check whether creator has access to the workspace
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: project.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    // If assigning task to someone, verify that user
    // is a member of the project
    if (assignedTo) {

        const assignedMember =
            await prisma.project_members.findUnique({
                where: {
                    project_id_user_id: {
                        project_id: projectId,
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

    const task = await prisma.tasks.create({
        data: {
            project_id: projectId,
            title,
            description: description || null,
            priority: priority || "Medium",
            status: status || "Backlog",
            start_date: startDate
                ? new Date(startDate)
                : null,
            due_date: dueDate
                ? new Date(dueDate)
                : null,
            estimated_hours:
                estimatedHours !== undefined &&
                estimatedHours !== null
                    ? estimatedHours
                    : null,
            assigned_to: assignedTo || null,
            created_by: userId
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return task;
};

const getProjectTasks = async (
    projectId,
    userId
) => {

    // Check whether project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        throw new Error("Project not found");
    }

    // Check whether user has workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: project.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    const tasks = await prisma.tasks.findMany({
        where: {
            project_id: projectId,
            is_archived: false
        },
        orderBy: {
            created_at: "desc"
        },
        include: {
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return tasks;
};

const getTask = async (
    taskId,
    userId
) => {

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
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            subtasks: true,
            comments: {
                orderBy: {
                    created_at: "desc"
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

    return task;
};

const updateTask = async (
    taskId,
    userId,
    data
) => {

    // Find task
    const existingTask = await prisma.tasks.findUnique({
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

    if (!existingTask) {
        throw new Error("Task not found");
    }

    // Check workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: existingTask.projects.workspace_id,
                    user_id: userId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    // Build update object
    const updateData = {};

    if (data.title !== undefined) {
        updateData.title = data.title.trim();
    }

    if (data.description !== undefined) {
        updateData.description =
            data.description || null;
    }

    if (data.priority !== undefined) {
        updateData.priority = data.priority;
    }

    if (data.status !== undefined) {
        updateData.status = data.status;
    }

    if (data.startDate !== undefined) {
        updateData.start_date =
            data.startDate
                ? new Date(data.startDate)
                : null;
    }

    if (data.dueDate !== undefined) {
        updateData.due_date =
            data.dueDate
                ? new Date(data.dueDate)
                : null;
    }

    if (data.estimatedHours !== undefined) {
        updateData.estimated_hours =
            data.estimatedHours !== null
                ? data.estimatedHours
                : null;
    }

    updateData.updated_at = new Date();

    const updatedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: updateData,
        include: {
            projects: {
                select: {
                    id: true,
                    title: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return updatedTask;
};

const assignTask = async (
    taskId,
    currentUserId,
    assignedTo
) => {

    // Find the task and its project
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

    // Check whether current user has workspace access
    const workspaceMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: task.projects.workspace_id,
                    user_id: currentUserId
                }
            }
        });

    if (!workspaceMembership) {
        throw new Error("Workspace access denied");
    }

    // Check that assigned user exists
    const user = await prisma.users.findUnique({
        where: {
            id: assignedTo
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    // Check that assigned user belongs to this project
    const projectMembership =
        await prisma.project_members.findUnique({
            where: {
                project_id_user_id: {
                    project_id: task.project_id,
                    user_id: assignedTo
                }
            }
        });

    if (!projectMembership) {
        throw new Error(
            "Assigned user is not a member of the project"
        );
    }

    // Assign task
    const updatedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: {
            assigned_to: assignedTo,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return updatedTask;
};

const archiveTask = async (
    taskId,
    userId
) => {

    // Find the task and its project
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

    // Check if already archived
    if (task.is_archived) {
        throw new Error("Task is already archived");
    }

    // Archive task
    const archivedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: {
            is_archived: true,
            updated_at: new Date()
        }
    });

    return archivedTask;
};

const getMyTasks = async (userId) => {

    const tasks = await prisma.tasks.findMany({
        where: {
            assigned_to: userId,
            is_archived: false
        },
        orderBy: [
            {
                due_date: "asc"
            },
            {
                created_at: "desc"
            }
        ],
        include: {
            projects: {
                select: {
                    id: true,
                    title: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return tasks;
};

const updateTaskStatus = async (
    taskId,
    userId,
    status
) => {

    // Validate status
    if (!VALID_TASK_STATUSES.includes(status)) {
        throw new Error("Invalid task status");
    }

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

    // Update status
    const updatedTask = await prisma.tasks.update({
        where: {
            id: taskId
        },
        data: {
            status,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true
                }
            },
            users_tasks_created_byTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            },
            users_tasks_assigned_toTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                }
            }
        }
    });

    return updatedTask;
};

export {
    createTask,
    getProjectTasks,
    getTask,
    updateTask,
    assignTask,
    archiveTask,
    getMyTasks,
    updateTaskStatus
};