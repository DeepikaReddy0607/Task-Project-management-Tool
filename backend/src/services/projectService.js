import prisma from "../config/prisma.js";
import { canManageProject } from "../utils/projectAuthorization.js";


// ============================================================
// CREATE PROJECT
// ============================================================

const createProject = async (
    workspaceId,
    userId,
    title,
    description,
    category,
    priority,
    status,
    startDate,
    endDate
) => {

    // Check whether the user belongs to the workspace
    const membership = await prisma.workspace_members.findFirst({
        where: {
            workspace_id: workspaceId,
            user_id: userId
        }
    });

    if (!membership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    // Only Workspace Owner/Admin can create projects
    if (
        membership.workspace_role !== "Owner" &&
        membership.workspace_role !== "Admin"
    ) {
        const error = new Error(
            "Insufficient permissions to create a project"
        );

        error.statusCode = 403;
        throw error;
    }

    // Create the project
    const project = await prisma.projects.create({
        data: {
            workspace_id: workspaceId,
            title,
            description,
            category,
            priority: priority || "Medium",
            status: status || "Planning",
            start_date: startDate
                ? new Date(startDate)
                : null,
            end_date: endDate
                ? new Date(endDate)
                : null,
            manager_id: userId
        }
    });

    return project;
};


// ============================================================
// GET ALL PROJECTS IN WORKSPACE
// ============================================================

const getWorkspaceProjects = async (
    workspaceId,
    userId
) => {

    // Check workspace access
    const membership = await prisma.workspace_members.findFirst({
        where: {
            workspace_id: workspaceId,
            user_id: userId
        }
    });

    if (!membership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    // Get only active projects
    const projects = await prisma.projects.findMany({
        where: {
            workspace_id: workspaceId,
            is_archived: false
        },
        orderBy: {
            created_at: "desc"
        }
    });

    return projects;
};


// ============================================================
// GET SINGLE PROJECT
// ============================================================

const getProject = async (
    projectId,
    userId
) => {

    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify workspace access
    const membership = await prisma.workspace_members.findFirst({
        where: {
            workspace_id: project.workspace_id,
            user_id: userId
        }
    });

    if (!membership) {
        const error = new Error("Project access denied");
        error.statusCode = 403;
        throw error;
    }

    return project;
};


// ============================================================
// CHECK PROJECT MANAGEMENT ACCESS
// ============================================================

const checkProjectManagementAccess = async (
    project,
    userId
) => {

    // Check workspace membership
    const workspaceMembership =
        await prisma.workspace_members.findFirst({
            where: {
                workspace_id: project.workspace_id,
                user_id: userId
            }
        });

    if (!workspaceMembership) {
        const error = new Error("Project access denied");
        error.statusCode = 403;
        throw error;
    }

    // Workspace Owner/Admin can manage projects
    if (
        workspaceMembership.workspace_role === "Owner" ||
        workspaceMembership.workspace_role === "Admin"
    ) {
        return;
    }

    // Check project membership
    const projectMembership =
        await prisma.project_members.findUnique({
            where: {
                project_id_user_id: {
                    project_id: project.id,
                    user_id: userId
                }
            },
            include: {
                roles: true
            }
        });

    const projectRole =
        projectMembership?.roles?.role_name;

    // Project Admin/Project Manager can manage project
    if (
        !canManageProject(
            workspaceMembership.workspace_role,
            projectRole
        )
    ) {
        const error = new Error(
            "Insufficient permissions to manage project"
        );

        error.statusCode = 403;
        throw error;
    }
};


// ============================================================
// UPDATE PROJECT
// ============================================================

const updateProject = async (
    projectId,
    userId,
    data
) => {

    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify project management permission
    await checkProjectManagementAccess(
        project,
        userId
    );

    const updatedProject = await prisma.projects.update({
        where: {
            id: projectId
        },
        data: {
            ...(data.title !== undefined && {
                title: data.title.trim()
            }),

            ...(data.description !== undefined && {
                description: data.description
            }),

            ...(data.category !== undefined && {
                category: data.category
            }),

            ...(data.priority !== undefined && {
                priority: data.priority
            }),

            ...(data.status !== undefined && {
                status: data.status
            }),

            ...(data.startDate !== undefined && {
                start_date: data.startDate
                    ? new Date(data.startDate)
                    : null
            }),

            ...(data.endDate !== undefined && {
                end_date: data.endDate
                    ? new Date(data.endDate)
                    : null
            })
        }
    });

    return updatedProject;
};


// ============================================================
// ARCHIVE PROJECT
// ============================================================

const archiveProject = async (
    projectId,
    userId
) => {

    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify project management permission
    await checkProjectManagementAccess(
        project,
        userId
    );

    if (project.is_archived) {
        const error = new Error(
            "Project is already archived"
        );

        error.statusCode = 400;
        throw error;
    }

    const archivedProject = await prisma.projects.update({
        where: {
            id: projectId
        },
        data: {
            is_archived: true
        }
    });

    return archivedProject;
};


// ============================================================
// ADD PROJECT MEMBER
// ============================================================

const addProjectMember = async (
    projectId,
    currentUserId,
    userId,
    roleName
) => {

    // Check that the project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify project management permission
    await checkProjectManagementAccess(
        project,
        currentUserId
    );

    // Check that the user being added exists
    const user = await prisma.users.findUnique({
        where: {
            id: userId
        }
    });

    if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    // Check that the user being added belongs
    // to the project's workspace
    const targetUserMembership =
        await prisma.workspace_members.findFirst({
            where: {
                workspace_id: project.workspace_id,
                user_id: userId
            }
        });

    if (!targetUserMembership) {
        const error = new Error(
            "User is not a member of the workspace"
        );

        error.statusCode = 400;
        throw error;
    }

    // Find the requested project role
    const role = await prisma.roles.findUnique({
        where: {
            role_name: roleName
        }
    });

    if (!role) {
        const error = new Error(
            "Invalid project role"
        );

        error.statusCode = 400;
        throw error;
    }

    // Check whether the user is already a project member
    const existingMember =
        await prisma.project_members.findUnique({
            where: {
                project_id_user_id: {
                    project_id: projectId,
                    user_id: userId
                }
            }
        });

    if (existingMember) {
        const error = new Error(
            "User is already a project member"
        );

        error.statusCode = 409;
        throw error;
    }

    // Add project member
    const projectMember =
        await prisma.project_members.create({
            data: {
                project_id: projectId,
                user_id: userId,
                role_id: role.id
            },
            include: {
                roles: true,
                users: true
            }
        });

    return projectMember;
};


// ============================================================
// GET PROJECT MEMBERS
// ============================================================

const getProjectMembers = async (
    projectId,
    userId
) => {

    // Check that the project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Check that the current user belongs
    // to the project's workspace
    const membership =
        await prisma.workspace_members.findFirst({
            where: {
                workspace_id: project.workspace_id,
                user_id: userId
            }
        });

    if (!membership) {
        const error = new Error(
            "Project access denied"
        );

        error.statusCode = 403;
        throw error;
    }

    // Get project members
    const members =
        await prisma.project_members.findMany({
            where: {
                project_id: projectId
            },
            include: {
                users: true,
                roles: true
            },
            orderBy: {
                user_id: "asc"
            }
        });

    return members;
};


// ============================================================
// UPDATE PROJECT MEMBER ROLE
// ============================================================

const updateProjectMemberRole = async (
    projectId,
    currentUserId,
    userId,
    roleName
) => {

    // Check that the project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify project management permission
    await checkProjectManagementAccess(
        project,
        currentUserId
    );

    // Check that the target user is a project member
    const projectMember =
        await prisma.project_members.findUnique({
            where: {
                project_id_user_id: {
                    project_id: projectId,
                    user_id: userId
                }
            }
        });

    if (!projectMember) {
        const error = new Error(
            "Project member not found"
        );

        error.statusCode = 404;
        throw error;
    }

    // Find the requested role
    const role = await prisma.roles.findUnique({
        where: {
            role_name: roleName
        }
    });

    if (!role) {
        const error = new Error(
            "Invalid project role"
        );

        error.statusCode = 400;
        throw error;
    }

    // Update role
    const updatedMember =
        await prisma.project_members.update({
            where: {
                project_id_user_id: {
                    project_id: projectId,
                    user_id: userId
                }
            },
            data: {
                role_id: role.id
            },
            include: {
                users: true,
                roles: true
            }
        });

    return updatedMember;
};


// ============================================================
// REMOVE PROJECT MEMBER
// ============================================================

const removeProjectMember = async (
    projectId,
    currentUserId,
    userId
) => {

    // Check that the project exists
    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify project management permission
    await checkProjectManagementAccess(
        project,
        currentUserId
    );

    // Check that the target user is a project member
    const projectMember =
        await prisma.project_members.findUnique({
            where: {
                project_id_user_id: {
                    project_id: projectId,
                    user_id: userId
                }
            }
        });

    if (!projectMember) {
        const error = new Error(
            "Project member not found"
        );

        error.statusCode = 404;
        throw error;
    }

    // Remove project member
    await prisma.project_members.delete({
        where: {
            project_id_user_id: {
                project_id: projectId,
                user_id: userId
            }
        }
    });

    return {
        userId,
        projectId
    };
};


// ============================================================
// EXPORTS
// ============================================================

export {
    createProject,
    getWorkspaceProjects,
    getProject,
    updateProject,
    archiveProject,
    addProjectMember,
    getProjectMembers,
    updateProjectMemberRole,
    removeProjectMember
};