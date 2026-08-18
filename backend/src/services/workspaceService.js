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
        "Owner",
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

export {
    createWorkspace,
    getUserWorkspaces,
    getWorkspaceById,
    addWorkspaceMember
};