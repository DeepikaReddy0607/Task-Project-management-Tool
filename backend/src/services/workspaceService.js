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

export {
    createWorkspace,
    getUserWorkspaces,
    getWorkspaceById
};