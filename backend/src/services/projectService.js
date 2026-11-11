import prisma from "../config/prisma.js";
import { canManageProject } from "../utils/projectAuthorization.js";
import { createNotification } from "./notificationService.js";
import sendEmail from "./emailService.js";

export const SAFE_USER_SELECT = Object.freeze({
    id: true,
    first_name: true,
    last_name: true,
    email: true,
    profile_picture: true,
    is_active: true
});

export const PROJECT_ROLE_MAPPINGS = Object.freeze({
    "member": "Team Member",
    "team member": "Team Member",
    "teammember": "Team Member",
    "contributor": "Team Member",
    "admin": "Admin",
    "project manager": "Project Manager",
    "projectmanager": "Project Manager",
    "pm": "Project Manager"
});

export const normalizeProjectRoleName = (inputRole) => {
    if (!inputRole || typeof inputRole !== "string") {
        return null;
    }
    const trimmed = inputRole.trim();
    const lower = trimmed.toLowerCase();
    if (PROJECT_ROLE_MAPPINGS[lower]) {
        return PROJECT_ROLE_MAPPINGS[lower];
    }
    return trimmed;
};

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

    // Validate project dates
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start > end) {
            const error = new Error("Project start date cannot be after end date");
            error.statusCode = 400;
            throw error;
        }
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
    userId,
    options = {}
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

    const isArchived = options?.archived === "true" || options?.archived === true || options?.isArchived === true;

    // Get projects
    const where = {
        workspace_id: workspaceId,
        is_archived: isArchived
    };

    // If regular workspace member (not Owner/Admin), strictly filter to projects where user is manager or member
    if (membership.workspace_role !== "Owner" && membership.workspace_role !== "Admin") {
        where.OR = [
            { manager_id: userId },
            { project_members: { some: { user_id: userId } } }
        ];
    }

    // Get projects
    const projects = await prisma.projects.findMany({
        where,
        orderBy: {
            created_at: "desc"
        }
    });

    return projects;
};


// ============================================================
// CHECK PROJECT ACCESS HIERARCHY
// ============================================================

export const checkProjectAccess = async (project, userId) => {
    if (!project || !userId) {
        const error = new Error("Project access denied");
        error.statusCode = 403;
        throw error;
    }

    // 1. Check workspace membership
    const workspaceMembership = await prisma.workspace_members.findFirst({
        where: {
            workspace_id: project.workspace_id,
            user_id: userId
        }
    });

    if (!workspaceMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    // 2. Workspace Owner or Admin has administrative oversight over all projects in the workspace
    if (workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin") {
        return { isOwnerOrAdmin: true, workspaceMembership };
    }

    // 3. Project manager has access
    if (project.manager_id === userId) {
        return { isManager: true, workspaceMembership };
    }

    // 4. Project member has access
    const projectMember = await prisma.project_members.findUnique({
        where: {
            project_id_user_id: {
                project_id: project.id,
                user_id: userId
            }
        }
    });

    if (projectMember) {
        return { isMember: true, projectMember, workspaceMembership };
    }

    // User is only a workspace member without project access
    const error = new Error("Project access denied");
    error.statusCode = 403;
    throw error;
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

    // Enforce strict project access
    await checkProjectAccess(project, userId);

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

    // Project Manager can manage project
    if (project.manager_id === userId) {
        return;
    }

    // Check project membership for Project Manager role
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

    const projectRole = (projectMembership?.roles?.role_name || "").toLowerCase();
    if (projectRole === "project manager" || projectRole === "admin") {
        return;
    }

    const error = new Error(
        "Only workspace Owner, Admin or Project Manager can manage this project"
    );

    error.statusCode = 403;
    throw error;
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

    const effectiveStartDate = data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : project.start_date;
    const effectiveEndDate = data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : project.end_date;
    if (effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate) {
        const error = new Error("Project start date cannot be after end date");
        error.statusCode = 400;
        throw error;
    }

    const resolvedManagerId = data.managerId || data.manager_id;
    if (resolvedManagerId !== undefined) {
        const targetManager = await prisma.users.findUnique({
            where: { id: resolvedManagerId }
        });
        if (!targetManager) {
            const error = new Error("Manager user not found");
            error.statusCode = 400;
            throw error;
        }
        const wsMember = await prisma.workspace_members.findFirst({
            where: { workspace_id: project.workspace_id, user_id: resolvedManagerId }
        });
        if (!wsMember) {
            const error = new Error("Manager must be a member of the workspace");
            error.statusCode = 400;
            throw error;
        }
    }

    const isArchivedUpdate = data.status === "Archived"
        ? true
        : (data.status && data.status !== "Archived" && project.is_archived ? false : undefined);

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

            ...(isArchivedUpdate !== undefined && {
                is_archived: isArchivedUpdate
            }),

            ...(resolvedManagerId !== undefined && {
                manager_id: resolvedManagerId
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

    // Get all project members with email joined (eliminating N+1 user queries)
    const projectMembers = await prisma.project_members.findMany({
        where: {
            project_id: projectId
        },
        select: {
            user_id: true,
            users: {
                select: {
                    email: true
                }
            }
        }
    });

    // Notify all project members concurrently without blocking serial I/O
    const notifyTasks = projectMembers
        .filter((member) => member.user_id !== userId)
        .map(async (member) => {
            try {
                await createNotification({
                    userId: member.user_id,
                    type: "PROJECT_UPDATED",
                    message: `Project "${updatedProject.title}" has been updated.`,
                    relatedEntityType: "PROJECT",
                    relatedEntityId: updatedProject.id
                });
            } catch (notifErr) {
                console.error("[NOTIFICATION_DISPATCH_WARNING] Project update notification failed:", {
                    projectId: updatedProject.id,
                    userId: member.user_id,
                    error: notifErr.message
                });
            }

            const email = member.users?.email;
            if (email) {
                try {
                    await sendEmail({
                        to: email,
                        subject: `Project Updated: ${updatedProject.title}`,
                        text: `The project "${updatedProject.title}" has been updated.`,
                        html: `
                            <h2>Project Updated</h2>
                            <p>The following project has been updated:</p>
                            <p><strong>${updatedProject.title}</strong></p>
                            <p>Please log in to TaskFlow to view the latest changes.</p>
                        `
                    });
                } catch (mailErr) {
                    console.warn("[MAIL] Project update notification email skipped or failed:", mailErr.message);
                }
            }
        });

    await Promise.allSettled(notifyTasks);

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

const restoreProject = async (
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

    if (!project.is_archived) {
        const error = new Error("Project is not archived");
        error.statusCode = 400;
        throw error;
    }

    const restoredProject = await prisma.projects.update({
        where: {
            id: projectId
        },
        data: {
            is_archived: false,
            updated_at: new Date()
        }
    });

    return restoredProject;
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
    const normalizedRoleName = normalizeProjectRoleName(roleName);
    const role = await prisma.roles.findFirst({
        where: {
            role_name: {
                equals: normalizedRoleName,
                mode: "insensitive"
            }
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
                users: {
                    select: SAFE_USER_SELECT
                }
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
        },
        include: {
            users: {
                select: SAFE_USER_SELECT
            }
        }
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    // Check that the current user belongs
    // to the project's workspace and has project access
    await checkProjectAccess(project, userId);

    // Get project members
    const members =
        await prisma.project_members.findMany({
            where: {
                project_id: projectId
            },
            include: {
                roles: true,
                users: {
                    select: SAFE_USER_SELECT
                }
            },
            orderBy: {
                user_id: "asc"
            }
        });

    // Ensure the project manager is included in the project members list if not already present
    if (project.users && !members.some((m) => m.user_id === project.manager_id)) {
        members.unshift({
            id: `pm-manager-${project.manager_id}`,
            project_id: projectId,
            user_id: project.manager_id,
            role_id: null,
            joined_at: project.created_at,
            roles: {
                role_name: "Project Manager",
                description: "Project Manager"
            },
            users: project.users
        });
    }

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
    const normalizedRoleName = normalizeProjectRoleName(roleName);
    const role = await prisma.roles.findFirst({
        where: {
            role_name: {
                equals: normalizedRoleName,
                mode: "insensitive"
            }
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
                roles: true,
                users: {
                    select: SAFE_USER_SELECT
                }
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


const deleteProject = async (
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

    // Verify project management permission (Owner, Admin, or Project Manager)
    await checkProjectManagementAccess(
        project,
        userId
    );

    // Delete project (cascades delete tasks, members, channels, etc.)
    await prisma.projects.delete({
        where: {
            id: projectId
        }
    });

    return {
        id: projectId,
        workspaceId: project.workspace_id
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
    deleteProject,
    archiveProject,
    restoreProject,
    addProjectMember,
    getProjectMembers,
    updateProjectMemberRole,
    removeProjectMember
};