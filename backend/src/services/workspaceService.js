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

const getUserWorkspaces = async (userId) => {

    const memberships = await prisma.workspace_members.findMany({
        where: {
            user_id: userId
        },
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
        createdAt: membership.workspaces.created_at,
        updatedAt: membership.workspaces.updated_at
    }));
};

const getWorkspaceById = async (workspaceId, userId) => {

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
        throw new Error(
            "User is already a member of this workspace"
        );
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
        joinedAt: updatedMembership.joined_at
    };
};

export {
    createWorkspace,
    getUserWorkspaces,
    getWorkspaceById,
    addWorkspaceMember,
    getWorkspaceMembers,
    removeWorkspaceMember,
    updateWorkspaceMemberRole
};