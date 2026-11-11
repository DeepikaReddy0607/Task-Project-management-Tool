import prisma from "../config/prisma.js";

const createWorkspace = async (userId, name, description) => {
    // Verify that the logged-in user exists
    const user = await prisma.users.findUnique({
        where: {
            id: userId
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    // Create workspace and owner membership together
    const workspace = await prisma.workspaces.create({
        data: {
            name,
            description: description || null,
            owner_id: userId,

            workspace_members: {
                create: {
                    user_id: userId,
                    workspace_role: "Owner"
                }
            }
        },
        include: {
            workspace_members: {
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
            }
        }
    });

    return workspace;
};

const getUserWorkspaces = async (userId, options = {}) => {
    const isArchived = options?.archived === true || options?.archived === "true";
    const includeAll = options?.archived === "all" || options?.includeArchived === true || options?.includeArchived === "true";

    const where = {
        user_id: userId,
    };

    if (!includeAll) {
        where.workspaces = {
            is_archived: isArchived
        };
    }

    const memberships = await prisma.workspace_members.findMany({
        where,
        include: {
            workspaces: true
        },
        orderBy: {
            joined_at: "desc"
        }
    });

    return memberships.map((membership) => ({
        id: membership.workspaces.id,
        name: membership.workspaces.name,
        description: membership.workspaces.description,
        ownerId: membership.workspaces.owner_id,
        workspaceRole: membership.workspace_role,
        isArchived: membership.workspaces.is_archived,
        createdAt: membership.workspaces.created_at,
        updatedAt: membership.workspaces.updated_at
    }));
};

const getWorkspaceById = async (workspaceId, userId) => {

    // Check whether the workspace exists
    const workspace = await prisma.workspaces.findUnique({
        where: {
            id: workspaceId
        }
    });

    if (!workspace) {
        throw new Error("Workspace not found");
    }
    
    // Check whether the user is a member of this workspace
    const membership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: userId
            }
        },
        include: {
            workspaces: true
        }
    });

    // User is not a member of this workspace
    if (!membership) {
        throw new Error("Workspace access denied");
    }

    return {
        id: membership.workspaces.id,
        name: membership.workspaces.name,
        description: membership.workspaces.description,
        ownerId: membership.workspaces.owner_id,
        workspaceRole: membership.workspace_role,
        isArchived: membership.workspaces.is_archived,
        createdAt: membership.workspaces.created_at,
        updatedAt: membership.workspaces.updated_at
    };
};

const addWorkspaceMember = async (
    workspaceId,
    requesterId,
    userId,
    workspaceRole
) => {

    // 1. Check whether the workspace exists
    const workspace = await prisma.workspaces.findUnique({
        where: {
            id: workspaceId
        }
    });

    if (!workspace) {
        throw new Error("Workspace not found");
    }

    // 2. Check the requester's workspace membership
    const requesterMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: requesterId
                }
            }
        });

    // Requester must belong to the workspace
    if (!requesterMembership) {
        throw new Error("Workspace access denied");
    }

    // 3. Only Owner or Admin can add members
    if (
        requesterMembership.workspace_role !== "Owner" &&
        requesterMembership.workspace_role !== "Admin"
    ) {
        throw new Error(
            "Only workspace Owner or Admin can add members"
        );
    }

    // 4. Validate workspace role
    const allowedRoles = [
        "Admin",
        "Member"
    ];

    if (!allowedRoles.includes(workspaceRole)) {
        throw new Error("Invalid workspace role");
    }

    // 5. Check whether the target user exists
    const user = await prisma.users.findUnique({
        where: {
            id: userId
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    // 6. Check whether user is already a member
    const existingMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            }
        });

    if (existingMembership) {
        const error = new Error(
            "User is already a member of this workspace"
        );
        error.statusCode = 409;
        throw error;
    }

    // 7. Add the user to the workspace
    const membership =
        await prisma.workspace_members.create({
            data: {
                workspace_id: workspaceId,
                user_id: userId,
                workspace_role: workspaceRole
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

    return membership;
};

const getWorkspaceMembers = async (workspaceId, requesterId) => {

    // 1. Check whether requester belongs to the workspace
    const requesterMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: requesterId
                }
            }
        });

    if (!requesterMembership) {
        throw new Error("Workspace access denied");
    }

    // 2. Get all workspace members
    const members = await prisma.workspace_members.findMany({
        where: {
            workspace_id: workspaceId
        },
        include: {
            users: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    roles: {
                        select: {
                            role_name: true
                        }
                    }
                }
            }
        },
        orderBy: {
            joined_at: "asc"
        }
    });

    // 3. Return clean response
    return members.map((member) => ({
        id: member.users.id,
        firstName: member.users.first_name,
        lastName: member.users.last_name,
        email: member.users.email,
        globalRole: member.users.roles.role_name,
        workspaceRole: member.workspace_role,
        joinedAt: member.joined_at
    }));
};

const removeWorkspaceMember = async (
    workspaceId,
    requesterId,
    userId
) => {

    // 1. Check whether the workspace exists
    const workspace = await prisma.workspaces.findUnique({
        where: {
            id: workspaceId
        }
    });

    if (!workspace) {
        throw new Error("Workspace not found");
    }

    // 2. Check the requester's workspace membership
    const requesterMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: requesterId
                }
            }
        });

    if (!requesterMembership) {
        throw new Error("Workspace access denied");
    }

    // 3. Only Owner or Admin can remove members
    if (
        requesterMembership.workspace_role !== "Owner" &&
        requesterMembership.workspace_role !== "Admin"
    ) {
        throw new Error(
            "Only workspace Owner or Admin can remove members"
        );
    }

    // 4. Check whether target user is a member
    const targetMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            }
        });

    if (!targetMembership) {
        throw new Error(
            "User is not a member of this workspace"
        );
    }

    // 5. Prevent removal of workspace owner
    if (workspace.owner_id === userId) {
        throw new Error(
            "Workspace owner cannot be removed"
        );
    }

    // 6. Remove the membership
    await prisma.workspace_members.delete({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: userId
            }
        }
    });

    return {
        userId,
        workspaceId
    };
};

const updateWorkspaceMemberRole = async (
    workspaceId,
    requesterId,
    userId,
    workspaceRole
) => {

    // 1. Check whether the workspace exists
    const workspace = await prisma.workspaces.findUnique({
        where: {
            id: workspaceId
        }
    });

    if (!workspace) {
        throw new Error("Workspace not found");
    }

    // 2. Check the requester's workspace membership
    const requesterMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: requesterId
                }
            }
        });

    if (!requesterMembership) {
        throw new Error("Workspace access denied");
    }

    // 3. Only Owner can update member roles
    if (
        requesterMembership.workspace_role !== "Owner"
    ) {
        throw new Error(
            "Only workspace Owner can update member roles"
        );
    }

    // 4. Only Admin and Member can be assigned
    const allowedRoles = [
        "Admin",
        "Member"
    ];

    if (!allowedRoles.includes(workspaceRole)) {
        throw new Error(
            "Invalid workspace role"
        );
    }

    // 5. Find target membership
    const targetMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            }
        });

    if (!targetMembership) {
        throw new Error(
            "User is not a member of this workspace"
        );
    }

    // 6. Prevent changing the workspace owner's role
    if (workspace.owner_id === userId) {
        throw new Error(
            "Workspace owner role cannot be changed"
        );
    }

    // 7. Update workspace role
    const updatedMembership =
        await prisma.workspace_members.update({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            },
            data: {
                workspace_role: workspaceRole
            },
            include: {
                users: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true,
                        roles: {
                            select: {
                                role_name: true
                            }
                        }
                    }
                }
            }
        });

    return {
        id: updatedMembership.users.id,
        firstName: updatedMembership.users.first_name,
        lastName: updatedMembership.users.last_name,
        email: updatedMembership.users.email,
        globalRole: updatedMembership.users.roles.role_name,
        workspaceRole: updatedMembership.workspace_role,
        role: updatedMembership.workspace_role,
        joinedAt: updatedMembership.joined_at
    };
};

const updateWorkspace = async (
    workspaceId,
    requesterId,
    name,
    description
) => {

    // 1. Check whether the workspace exists
    const workspace = await prisma.workspaces.findUnique({
        where: {
            id: workspaceId
        }
    });

    if (!workspace) {
        throw new Error("Workspace not found");
    }

    // 2. Check requester's workspace membership
    const requesterMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: requesterId
                }
            }
        });

    if (!requesterMembership) {
        throw new Error("Workspace access denied");
    }

    // 3. Only Owner can update workspace details
    if (requesterMembership.workspace_role !== "Owner") {
        throw new Error(
            "Only workspace Owner can update workspace"
        );
    }

    // 4. Validate workspace name if provided
    if (name !== undefined && !name.trim()) {
        throw new Error(
            "Workspace name cannot be empty"
        );
    }

    // 5. Update workspace
    const updatedWorkspace = await prisma.workspaces.update({
        where: {
            id: workspaceId
        },
        data: {
            ...(name !== undefined && {
                name: name.trim()
            }),

            ...(description !== undefined && {
                description: description || null
            })
        }
    });

    // 6. Return clean response
    return {
        id: updatedWorkspace.id,
        name: updatedWorkspace.name,
        description: updatedWorkspace.description,
        ownerId: updatedWorkspace.owner_id,
        createdAt: updatedWorkspace.created_at,
        updatedAt: updatedWorkspace.updated_at
    };
};

const deleteWorkspace = async (
    workspaceId,
    requesterId
) => {

    // 1. Check whether the workspace exists
    const workspace = await prisma.workspaces.findUnique({
        where: {
            id: workspaceId
        }
    });

    if (!workspace) {
        throw new Error("Workspace not found");
    }

    // 2. Check requester's workspace membership
    const requesterMembership =
        await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: requesterId
                }
            }
        });

    // Requester must belong to the workspace
    if (!requesterMembership) {
        throw new Error("Workspace access denied");
    }

    // 3. Only Owner can delete the workspace
    if (requesterMembership.workspace_role !== "Owner") {
        throw new Error(
            "Only workspace Owner can delete workspace"
        );
    }

    // 4. Delete the workspace
    await prisma.workspaces.delete({
        where: {
            id: workspaceId
        }
    });

    return {
        workspaceId
    };
};

const archiveWorkspace = async (workspaceId, requesterId) => {
    const workspace = await prisma.workspaces.findUnique({
        where: { id: workspaceId }
    });
    if (!workspace) {
        const error = new Error("Workspace not found");
        error.statusCode = 404;
        throw error;
    }
    const requesterMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: requesterId
            }
        }
    });
    if (!requesterMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }
    if (requesterMembership.workspace_role !== "Owner" && requesterMembership.workspace_role !== "Admin") {
        const error = new Error("Only workspace Owner or Admin can archive workspace");
        error.statusCode = 403;
        throw error;
    }
    if (workspace.is_archived) {
        const error = new Error("Workspace is already archived");
        error.statusCode = 400;
        throw error;
    }

    const updated = await prisma.workspaces.update({
        where: { id: workspaceId },
        data: {
            is_archived: true,
            updated_at: new Date()
        }
    });

    return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        ownerId: updated.owner_id,
        isArchived: updated.is_archived,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
    };
};

const restoreWorkspace = async (workspaceId, requesterId) => {
    const workspace = await prisma.workspaces.findUnique({
        where: { id: workspaceId }
    });
    if (!workspace) {
        const error = new Error("Workspace not found");
        error.statusCode = 404;
        throw error;
    }
    const requesterMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: requesterId
            }
        }
    });
    if (!requesterMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }
    if (requesterMembership.workspace_role !== "Owner" && requesterMembership.workspace_role !== "Admin") {
        const error = new Error("Only workspace Owner or Admin can restore workspace");
        error.statusCode = 403;
        throw error;
    }
    if (!workspace.is_archived) {
        const error = new Error("Workspace is not archived");
        error.statusCode = 400;
        throw error;
    }

    const updated = await prisma.workspaces.update({
        where: { id: workspaceId },
        data: {
            is_archived: false,
            updated_at: new Date()
        }
    });

    return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        ownerId: updated.owner_id,
        isArchived: updated.is_archived,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
    };
};

export {
    createWorkspace,
    getUserWorkspaces,
    getWorkspaceById,
    addWorkspaceMember,
    getWorkspaceMembers,
    removeWorkspaceMember,
    updateWorkspaceMemberRole,
    updateWorkspace,
    deleteWorkspace,
    archiveWorkspace,
    restoreWorkspace
};