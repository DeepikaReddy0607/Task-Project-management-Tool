import prisma from "../config/prisma.js";
import { createNotification } from "./notificationService.js";

export const SAFE_USER_SELECT = Object.freeze({
    id: true,
    first_name: true,
    last_name: true,
    email: true,
    profile_picture: true,
    is_active: true,
});

/**
 * Validates that a user is an active member of a workspace.
 */
export async function validateWorkspaceMembership(workspaceId, userId) {
    if (!workspaceId || !userId) {
        const error = new Error("Workspace ID and User ID are required");
        error.statusCode = 400;
        throw error;
    }

    const membership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: userId,
            },
        },
        include: {
            workspaces: true,
        },
    });

    if (!membership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    return membership;
}

/**
 * Validates that a user has access to a project within a workspace.
 */
export async function validateProjectAccess(projectId, userId, workspaceMembership) {
    if (!projectId) return null;

    const project = await prisma.projects.findUnique({
        where: { id: projectId },
    });

    if (!project) {
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }

    if (project.workspace_id !== workspaceMembership.workspace_id) {
        const error = new Error("Project does not belong to the specified workspace");
        error.statusCode = 403;
        throw error;
    }

    // Workspace Owner or Admin automatically has project access
    if (workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin") {
        return { project, projectRole: "Admin" };
    }

    // Check project_members table
    const projectMember = await prisma.project_members.findUnique({
        where: {
            project_id_user_id: {
                project_id: projectId,
                user_id: userId,
            },
        },
        include: {
            roles: true,
        },
    });

    if (!projectMember) {
        const error = new Error("Project access denied");
        error.statusCode = 403;
        throw error;
    }

    return { project, projectRole: projectMember.roles?.role_name || "Member" };
}

/**
 * Validates access to a direct/group conversation.
 */
export async function validateConversationAccess(conversationId, userId) {
    if (!conversationId) {
        const error = new Error("Conversation ID is required");
        error.statusCode = 400;
        throw error;
    }

    const conversation = await prisma.conversations.findUnique({
        where: { id: conversationId },
        include: {
            conversation_members: {
                include: {
                    users: {
                        select: SAFE_USER_SELECT,
                    },
                },
            },
        },
    });

    if (!conversation) {
        const error = new Error("Conversation not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify workspace membership (prevents removed workspace members from accessing chats)
    await validateWorkspaceMembership(conversation.workspace_id, userId);

    // Verify user is an active member in this conversation
    const memberRecord = conversation.conversation_members.find((m) => m.user_id === userId);
    if (!memberRecord) {
        const error = new Error("You are not a member of this conversation");
        error.statusCode = 403;
        throw error;
    }

    return { conversation, memberRecord };
}

/**
 * Validates access to a channel.
 */
export async function validateChannelAccess(channelId, userId) {
    if (!channelId) {
        const error = new Error("Channel ID is required");
        error.statusCode = 400;
        throw error;
    }

    const channel = await prisma.channels.findUnique({
        where: { id: channelId },
        include: {
            channel_members: {
                include: {
                    users: {
                        select: SAFE_USER_SELECT,
                    },
                },
            },
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true,
                },
            },
        },
    });

    if (!channel) {
        const error = new Error("Channel not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify workspace membership
    const workspaceMembership = await validateWorkspaceMembership(channel.workspace_id, userId);

    // If channel is project-scoped, verify project access
    if (channel.project_id) {
        await validateProjectAccess(channel.project_id, userId, workspaceMembership);
    }

    const channelMember = channel.channel_members.find((m) => m.user_id === userId);

    // If channel is private, user must be explicitly in channel_members
    if (channel.type === "PRIVATE" && !channelMember) {
        const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";
        if (!isWsAdmin) {
            const error = new Error("Channel access denied");
            error.statusCode = 403;
            throw error;
        }
    }

    return { channel, workspaceMembership, channelMember };
}

// ============================================================================
// CONVERSATION SERVICES
// ============================================================================

/**
 * List all conversations for the authenticated user within a workspace.
 */
export async function getUserConversations(userId, workspaceId) {
    await validateWorkspaceMembership(workspaceId, userId);

    const conversations = await prisma.conversations.findMany({
        where: {
            workspace_id: workspaceId,
            conversation_members: {
                some: {
                    user_id: userId,
                },
            },
        },
        include: {
            conversation_members: {
                include: {
                    users: {
                        select: SAFE_USER_SELECT,
                    },
                },
            },
            messages: {
                orderBy: { created_at: "desc" },
                take: 1,
                select: {
                    id: true,
                    content: true,
                    sender_id: true,
                    created_at: true,
                    is_deleted: true,
                },
            },
        },
        orderBy: [{ last_message_at: "desc" }, { updated_at: "desc" }],
    });

    const unreadCounts = await Promise.all(
        conversations.map(async (conv) => {
            const memberInfo = conv.conversation_members.find((m) => m.user_id === userId);
            const lastRead = memberInfo?.last_read_at || conv.created_at;
            return prisma.messages.count({
                where: {
                    conversation_id: conv.id,
                    created_at: { gt: lastRead },
                    sender_id: { not: userId },
                    is_deleted: false,
                },
            });
        })
    );

    return conversations.map((conv, idx) => {
        const memberInfo = conv.conversation_members.find((m) => m.user_id === userId);
        const otherMembers = conv.conversation_members
            .filter((m) => m.user_id !== userId)
            .map((m) => m.users);

        return {
            id: conv.id,
            workspaceId: conv.workspace_id,
            type: conv.type,
            title: conv.title || (conv.type === "DIRECT" && otherMembers[0] ? `${otherMembers[0].first_name} ${otherMembers[0].last_name}` : "Group Chat"),
            lastMessageAt: conv.last_message_at,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            unreadCount: unreadCounts[idx] || 0,
            members: conv.conversation_members.map((m) => ({
                id: m.id,
                userId: m.user_id,
                role: m.role,
                lastReadAt: m.last_read_at,
                isMuted: m.is_muted,
                isPinned: m.is_pinned,
                user: m.users,
            })),
            otherMembers,
            lastMessage: conv.messages[0] || null,
            currentUserSettings: memberInfo
                ? {
                      role: memberInfo.role,
                      lastReadAt: memberInfo.last_read_at,
                      isMuted: memberInfo.is_muted,
                      isPinned: memberInfo.is_pinned,
                  }
                : null,
        };
    });
}

/**
 * Get or create a 1-to-1 direct conversation with deterministic signature.
 */
export async function getOrCreateDirectConversation(userId, workspaceId, recipientId) {
    if (!recipientId) {
        const error = new Error("Recipient ID is required");
        error.statusCode = 400;
        throw error;
    }

    if (userId === recipientId) {
        const error = new Error("Cannot start a direct conversation with yourself");
        error.statusCode = 400;
        throw error;
    }

    // Verify requester has workspace membership
    await validateWorkspaceMembership(workspaceId, userId);

    // Verify recipient exists and is also an active member of this workspace
    const recipientMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: recipientId,
            },
        },
        include: {
            users: {
                select: SAFE_USER_SELECT,
            },
        },
    });

    if (!recipientMembership || !recipientMembership.users.is_active) {
        const error = new Error("Recipient is not a member of this workspace");
        error.statusCode = 400;
        throw error;
    }

    // Deterministic signature: min:max of the two user IDs
    const dmSignature = [userId, recipientId].sort().join(":");

    // Check if conversation already exists
    const existingConv = await prisma.conversations.findUnique({
        where: {
            workspace_id_dm_signature: {
                workspace_id: workspaceId,
                dm_signature: dmSignature,
            },
        },
        include: {
            conversation_members: {
                include: {
                    users: {
                        select: SAFE_USER_SELECT,
                    },
                },
            },
        },
    });

    if (existingConv) {
        return { conversation: existingConv, isExisting: true };
    }

    // Create atomically within a transaction
    try {
        const newConv = await prisma.$transaction(async (tx) => {
            const conv = await tx.conversations.create({
                data: {
                    workspace_id: workspaceId,
                    type: "DIRECT",
                    dm_signature: dmSignature,
                    created_by: userId,
                    conversation_members: {
                        create: [
                            { user_id: userId, role: "MEMBER" },
                            { user_id: recipientId, role: "MEMBER" },
                        ],
                    },
                },
                include: {
                    conversation_members: {
                        include: {
                            users: {
                                select: SAFE_USER_SELECT,
                            },
                        },
                    },
                },
            });
            return conv;
        });

        return { conversation: newConv, isExisting: false };
    } catch (err) {
        // Concurrency catch: if duplicate was created concurrently, return existing
        if (err.code === "P2002" || err.message?.includes("uq_conversation_workspace_dm_signature")) {
            const concurrentConv = await prisma.conversations.findUnique({
                where: {
                    workspace_id_dm_signature: {
                        workspace_id: workspaceId,
                        dm_signature: dmSignature,
                    },
                },
                include: {
                    conversation_members: {
                        include: {
                            users: {
                                select: SAFE_USER_SELECT,
                            },
                        },
                    },
                },
            });
            if (concurrentConv) {
                return { conversation: concurrentConv, isExisting: true };
            }
        }
        throw err;
    }
}

/**
 * Create a group direct conversation with multiple members.
 */
export async function createGroupConversation(userId, workspaceId, memberIds, title) {
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
        const error = new Error("memberIds must be a non-empty array of user IDs");
        error.statusCode = 400;
        throw error;
    }

    await validateWorkspaceMembership(workspaceId, userId);

    // Deduplicate and filter out requester's own ID
    const uniqueOtherMemberIds = [...new Set(memberIds)].filter((id) => id !== userId);

    if (uniqueOtherMemberIds.length === 0) {
        const error = new Error("At least one other member must be provided for a group conversation");
        error.statusCode = 400;
        throw error;
    }

    // Validate that all specified members are active workspace members
    const validMembers = await prisma.workspace_members.findMany({
        where: {
            workspace_id: workspaceId,
            user_id: { in: uniqueOtherMemberIds },
            users: { is_active: true },
        },
        select: { user_id: true },
    });

    if (validMembers.length !== uniqueOtherMemberIds.length) {
        const error = new Error("All group members must be active members of the workspace");
        error.statusCode = 400;
        throw error;
    }

    // All members to create: requester as OWNER, others as MEMBER
    const allMembersData = [
        { user_id: userId, role: "OWNER" },
        ...uniqueOtherMemberIds.map((id) => ({ user_id: id, role: "MEMBER" })),
    ];

    const groupConv = await prisma.$transaction(async (tx) => {
        const conv = await tx.conversations.create({
            data: {
                workspace_id: workspaceId,
                type: "GROUP",
                title: title?.trim() || null,
                dm_signature: null,
                created_by: userId,
                conversation_members: {
                    create: allMembersData,
                },
            },
            include: {
                conversation_members: {
                    include: {
                        users: {
                            select: SAFE_USER_SELECT,
                        },
                    },
                },
            },
        });
        return conv;
    });

    return groupConv;
}

/**
 * Retrieve details for a specific conversation.
 */
export async function getConversationDetails(userId, conversationId) {
    const { conversation } = await validateConversationAccess(conversationId, userId);
    return conversation;
}

/**
 * Retrieve members of a conversation.
 */
export async function getConversationMembers(userId, conversationId) {
    const { conversation } = await validateConversationAccess(conversationId, userId);
    return conversation.conversation_members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
        lastReadAt: m.last_read_at,
        isMuted: m.is_muted,
        isPinned: m.is_pinned,
        user: m.users,
    }));
}

// ============================================================================
// CHANNEL SERVICES
// ============================================================================

/**
 * Sanitize channel name (lowercase, alphanumeric, hyphens).
 */
export function sanitizeChannelName(name) {
    if (!name || typeof name !== "string") return "";
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Create a workspace or project channel.
 */
export async function createChannel(userId, workspaceId, data) {
    const { projectId, name, topic, description, type = "PUBLIC" } = data;

    const workspaceMembership = await validateWorkspaceMembership(workspaceId, userId);

    const cleanName = sanitizeChannelName(name);
    if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
        const error = new Error("Channel name must be between 2 and 80 alphanumeric characters or hyphens");
        error.statusCode = 400;
        throw error;
    }

    const channelType = type?.toUpperCase() === "PRIVATE" ? "PRIVATE" : "PUBLIC";

    // If project-scoped, validate project access
    if (projectId) {
        await validateProjectAccess(projectId, userId, workspaceMembership);
    }

    // Check unique name collision
    const existing = await prisma.channels.findFirst({
        where: {
            workspace_id: workspaceId,
            project_id: projectId || null,
            name: { equals: cleanName, mode: "insensitive" },
        },
    });

    if (existing) {
        const error = new Error(
            projectId
                ? "A channel with this name already exists in this project"
                : "A channel with this name already exists in this workspace"
        );
        error.statusCode = 409;
        throw error;
    }

    const channel = await prisma.$transaction(async (tx) => {
        const created = await tx.channels.create({
            data: {
                workspace_id: workspaceId,
                project_id: projectId || null,
                name: cleanName,
                topic: topic?.trim() || null,
                description: description?.trim() || null,
                type: channelType,
                created_by: userId,
                channel_members: {
                    create: {
                        user_id: userId,
                        role: "OWNER",
                    },
                },
            },
            include: {
                channel_members: {
                    include: {
                        users: {
                            select: SAFE_USER_SELECT,
                        },
                    },
                },
                projects: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
        return created;
    });

    return channel;
}

/**
 * List channels accessible to the user in a workspace.
 */
export async function getChannels(userId, workspaceId, options = {}) {
    const { projectId, archived = false } = options;
    const workspaceMembership = await validateWorkspaceMembership(workspaceId, userId);

    const isArchived = archived === "true" || archived === true;

    if (projectId) {
        await validateProjectAccess(projectId, userId, workspaceMembership);
    }

    // Query channels
    const channels = await prisma.channels.findMany({
        where: {
            workspace_id: workspaceId,
            project_id: projectId !== undefined ? projectId : null,
            is_archived: isArchived,
        },
        include: {
            channel_members: {
                include: {
                    users: {
                        select: SAFE_USER_SELECT,
                    },
                },
            },
            projects: {
                select: {
                    id: true,
                    title: true,
                },
            },
            _count: {
                select: {
                    channel_members: true,
                    messages: true,
                },
            },
        },
        orderBy: [{ last_message_at: "desc" }, { created_at: "asc" }],
    });

    const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";

    // Filter: public channels are accessible to all; private channels only to members or workspace admins
    const accessibleChannels = channels.filter((c) => {
        if (c.type === "PUBLIC") return true;
        const isMember = c.channel_members.some((m) => m.user_id === userId);
        return isMember || isWsAdmin;
    });

    const unreadCounts = await Promise.all(
        accessibleChannels.map(async (c) => {
            const memberInfo = c.channel_members.find((m) => m.user_id === userId);
            const lastRead = memberInfo?.last_read_at || new Date(0);
            return prisma.messages.count({
                where: {
                    channel_id: c.id,
                    created_at: { gt: lastRead },
                    sender_id: { not: userId },
                    is_deleted: false,
                },
            });
        })
    );

    return accessibleChannels.map((c, idx) => {
        const userMembership = c.channel_members.find((m) => m.user_id === userId);
        return {
            id: c.id,
            workspaceId: c.workspace_id,
            projectId: c.project_id,
            projectName: c.projects?.title || null,
            name: c.name,
            topic: c.topic,
            description: c.description,
            type: c.type,
            isArchived: c.is_archived,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            lastMessageAt: c.last_message_at,
            unreadCount: unreadCounts[idx] || 0,
            memberCount: c._count.channel_members,
            messageCount: c._count.messages,
            isMember: !!userMembership,
            membershipRole: userMembership?.role || null,
        };
    });
}

/**
 * Retrieve channel details.
 */
export async function getChannelDetails(userId, channelId) {
    const { channel, channelMember } = await validateChannelAccess(channelId, userId);

    return {
        id: channel.id,
        workspaceId: channel.workspace_id,
        projectId: channel.project_id,
        project: channel.projects || null,
        name: channel.name,
        topic: channel.topic,
        description: channel.description,
        type: channel.type,
        isArchived: channel.is_archived,
        createdAt: channel.created_at,
        updatedAt: channel.updated_at,
        lastMessageAt: channel.last_message_at,
        members: channel.channel_members.map((m) => ({
            id: m.id,
            userId: m.user_id,
            role: m.role,
            joinedAt: m.joined_at,
            lastReadAt: m.last_read_at,
            isMuted: m.is_muted,
            isPinned: m.is_pinned,
            user: m.users,
        })),
        isMember: !!channelMember,
        membershipRole: channelMember?.role || null,
    };
}

/**
 * Update channel metadata (name, topic, description).
 */
export async function updateChannel(userId, channelId, updates) {
    const { channel, workspaceMembership, channelMember } = await validateChannelAccess(channelId, userId);

    // Permission: Channel OWNER, Channel MODERATOR, or Workspace Owner/Admin
    const isChannelLead = channelMember && (channelMember.role === "OWNER" || channelMember.role === "MODERATOR");
    const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";

    if (!isChannelLead && !isWsAdmin) {
        const error = new Error("Permission denied: only channel leads or workspace administrators can modify channels");
        error.statusCode = 403;
        throw error;
    }

    const { name, topic, description } = updates;
    const dataToUpdate = {};

    if (name !== undefined) {
        const cleanName = sanitizeChannelName(name);
        if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
            const error = new Error("Channel name must be between 2 and 80 alphanumeric characters or hyphens");
            error.statusCode = 400;
            throw error;
        }

        // Check if name is taken by another channel in same scope
        if (cleanName !== channel.name) {
            const collision = await prisma.channels.findFirst({
                where: {
                    workspace_id: channel.workspace_id,
                    project_id: channel.project_id,
                    name: { equals: cleanName, mode: "insensitive" },
                    id: { not: channelId },
                },
            });

            if (collision) {
                const error = new Error("A channel with this name already exists");
                error.statusCode = 409;
                throw error;
            }

            dataToUpdate.name = cleanName;
        }
    }

    if (topic !== undefined) dataToUpdate.topic = topic?.trim() || null;
    if (description !== undefined) dataToUpdate.description = description?.trim() || null;

    dataToUpdate.updated_at = new Date();

    const updated = await prisma.channels.update({
        where: { id: channelId },
        data: dataToUpdate,
        include: {
            projects: {
                select: { id: true, title: true },
            },
        },
    });

    return updated;
}

/**
 * Archive a channel.
 */
export async function archiveChannel(userId, channelId) {
    const { channel, workspaceMembership, channelMember } = await validateChannelAccess(channelId, userId);

    const isChannelOwner = channelMember && channelMember.role === "OWNER";
    const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";

    if (!isChannelOwner && !isWsAdmin) {
        const error = new Error("Permission denied: only channel owners or workspace administrators can archive channels");
        error.statusCode = 403;
        throw error;
    }

    const updated = await prisma.channels.update({
        where: { id: channelId },
        data: {
            is_archived: true,
            updated_at: new Date(),
        },
    });

    return updated;
}

/**
 * Retrieve channel members.
 */
export async function getChannelMembers(userId, channelId) {
    const { channel } = await validateChannelAccess(channelId, userId);

    return channel.channel_members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
        lastReadAt: m.last_read_at,
        isMuted: m.is_muted,
        isPinned: m.is_pinned,
        user: m.users,
    }));
}

/**
 * Add a member to a channel (or self-join for public channels).
 */
export async function addChannelMember(userId, channelId, targetUserId, role = "MEMBER") {
    const { channel, workspaceMembership, channelMember } = await validateChannelAccess(channelId, userId);

    const isSelfJoin = userId === targetUserId;

    if (isSelfJoin) {
        if (channel.type === "PRIVATE") {
            const error = new Error("Cannot self-join a private channel. An invitation is required.");
            error.statusCode = 403;
            throw error;
        }
    } else {
        // Adding another user: requester must be Channel OWNER/MODERATOR or Workspace Admin
        const canManage = (channelMember && (channelMember.role === "OWNER" || channelMember.role === "MODERATOR")) ||
            workspaceMembership.workspace_role === "Owner" ||
            workspaceMembership.workspace_role === "Admin";

        if (!canManage) {
            const error = new Error("Permission denied to add members to this channel");
            error.statusCode = 403;
            throw error;
        }
    }

    // Verify target user is an active workspace member
    const targetWsMember = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: channel.workspace_id,
                user_id: targetUserId,
            },
        },
        include: {
            users: { select: SAFE_USER_SELECT },
        },
    });

    if (!targetWsMember || !targetWsMember.users.is_active) {
        const error = new Error("Target user is not an active member of this workspace");
        error.statusCode = 400;
        throw error;
    }

    // If channel is project-scoped, verify target user is also in the project
    if (channel.project_id) {
        const targetProjMember = await prisma.project_members.findUnique({
            where: {
                project_id_user_id: {
                    project_id: channel.project_id,
                    user_id: targetUserId,
                },
            },
        });

        const isTargetWsAdmin = targetWsMember.workspace_role === "Owner" || targetWsMember.workspace_role === "Admin";
        if (!targetProjMember && !isTargetWsAdmin) {
            const error = new Error("Target user is not a member of the project tied to this channel");
            error.statusCode = 400;
            throw error;
        }
    }

    // Check if already in channel
    const existing = await prisma.channel_members.findUnique({
        where: {
            channel_id_user_id: {
                channel_id: channelId,
                user_id: targetUserId,
            },
        },
    });

    if (existing) {
        return existing;
    }

    const newMember = await prisma.channel_members.create({
        data: {
            channel_id: channelId,
            user_id: targetUserId,
            role: role?.toUpperCase() === "MODERATOR" ? "MODERATOR" : "MEMBER",
        },
        include: {
            users: {
                select: SAFE_USER_SELECT,
            },
        },
    });

    return newMember;
}

/**
 * Remove a member from a channel (or self-leave).
 */
export async function removeChannelMember(userId, channelId, targetUserId) {
    const { channel, workspaceMembership, channelMember } = await validateChannelAccess(channelId, userId);

    const isSelfLeave = userId === targetUserId;

    if (!isSelfLeave) {
        const canManage = (channelMember && (channelMember.role === "OWNER" || channelMember.role === "MODERATOR")) ||
            workspaceMembership.workspace_role === "Owner" ||
            workspaceMembership.workspace_role === "Admin";

        if (!canManage) {
            const error = new Error("Permission denied to remove members from this channel");
            error.statusCode = 403;
            throw error;
        }
    }

    const targetMembership = await prisma.channel_members.findUnique({
        where: {
            channel_id_user_id: {
                channel_id: channelId,
                user_id: targetUserId,
            },
        },
    });

    if (!targetMembership) {
        const error = new Error("User is not a member of this channel");
        error.statusCode = 404;
        throw error;
    }

    // Prevent removing the sole owner without transferring ownership
    if (targetMembership.role === "OWNER") {
        const ownerCount = await prisma.channel_members.count({
            where: {
                channel_id: channelId,
                role: "OWNER",
            },
        });
        if (ownerCount <= 1) {
            const error = new Error("Cannot remove the only channel owner. Transfer ownership before leaving.");
            error.statusCode = 400;
            throw error;
        }
    }

    await prisma.channel_members.delete({
        where: {
            channel_id_user_id: {
                channel_id: channelId,
                user_id: targetUserId,
            },
        },
    });

    return { success: true, message: "Member removed successfully" };
}

// ============================================================================
// MESSAGE SERVICES
// ============================================================================

/**
 * Send a message to a channel or conversation.
 */
export async function sendMessage(userId, payload) {
    const { channelId, conversationId, content, messageType = "TEXT", parentMessageId, attachments } = payload;

    // Strict target mutual exclusivity
    if ((!channelId && !conversationId) || (channelId && conversationId)) {
        const error = new Error("Message must specify exactly one target: either channelId or conversationId");
        error.statusCode = 400;
        throw error;
    }

    if (!content || typeof content !== "string" || !content.trim()) {
        const error = new Error("Message content cannot be empty");
        error.statusCode = 400;
        throw error;
    }

    if (content.length > 10000) {
        const error = new Error("Message content exceeds maximum allowed length (10,000 characters)");
        error.statusCode = 400;
        throw error;
    }

    // Verify container authorization & auto-join channel if public
    if (channelId) {
        const { channel, channelMember } = await validateChannelAccess(channelId, userId);
        if (channel.is_archived) {
            const error = new Error("Cannot send messages to an archived channel");
            error.statusCode = 400;
            throw error;
        }

        // If user is accessing a public channel but not yet a member in channel_members, auto-join
        if (!channelMember && channel.type === "PUBLIC") {
            await prisma.channel_members.create({
                data: {
                    channel_id: channelId,
                    user_id: userId,
                    role: "MEMBER",
                },
            });
        }
    } else {
        await validateConversationAccess(conversationId, userId);
    }

    // If thread reply, validate parent message belongs to the same target container
    if (parentMessageId) {
        const parent = await prisma.messages.findUnique({
            where: { id: parentMessageId },
        });

        if (!parent) {
            const error = new Error("Thread parent message not found");
            error.statusCode = 404;
            throw error;
        }

        if (channelId && parent.channel_id !== channelId) {
            const error = new Error("Parent message does not belong to the target channel");
            error.statusCode = 400;
            throw error;
        }

        if (conversationId && parent.conversation_id !== conversationId) {
            const error = new Error("Parent message does not belong to the target conversation");
            error.statusCode = 400;
            throw error;
        }
    }

    const now = new Date();

    // Atomic transaction: create message, update container last_message_at, create sender read receipt
    const createdMessage = await prisma.$transaction(async (tx) => {
        const msg = await tx.messages.create({
            data: {
                channel_id: channelId || null,
                conversation_id: conversationId || null,
                sender_id: userId,
                content: content.trim(),
                message_type: messageType,
                parent_message_id: parentMessageId || null,
                attachments: attachments || null,
                created_at: now,
                updated_at: now,
            },
            include: {
                users: {
                    select: SAFE_USER_SELECT,
                },
                parent_message: {
                    select: {
                        id: true,
                        content: true,
                        sender_id: true,
                    },
                },
            },
        });

        // Update container's last_message_at
        if (channelId) {
            await tx.channels.update({
                where: { id: channelId },
                data: { last_message_at: now },
            });
        } else {
            await tx.conversations.update({
                where: { id: conversationId },
                data: { last_message_at: now },
            });
        }

        // Sender automatically has read their own message
        await tx.message_read_receipts.create({
            data: {
                message_id: msg.id,
                user_id: userId,
                read_at: now,
            },
        });

        return msg;
    });

    // Detect and dispatch @mentions notifications
    try {
        await processMentions(userId, createdMessage, channelId, conversationId);
    } catch (mentionErr) {
        console.error("[CHAT_MENTION_NOTIFICATION_ERROR]", mentionErr);
    }

    return createdMessage;
}

/**
 * Retrieve message history with cursor-based pagination.
 */
export async function getMessageHistory(userId, options = {}) {
    const { channelId, conversationId, cursor, limit = 30, direction = "before" } = options;

    if ((!channelId && !conversationId) || (channelId && conversationId)) {
        const error = new Error("History query must specify exactly one target: either channelId or conversationId");
        error.statusCode = 400;
        throw error;
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

    // Verify access
    if (channelId) {
        await validateChannelAccess(channelId, userId);
    } else {
        await validateConversationAccess(conversationId, userId);
    }

    const where = {
        channel_id: channelId || null,
        conversation_id: conversationId || null,
        parent_message_id: null, // Root messages only; replies accessed via getThreadReplies
    };

    if (cursor) {
        const cursorMsg = await prisma.messages.findUnique({
            where: { id: cursor },
            select: { id: true, created_at: true },
        });

        if (cursorMsg) {
            if (direction === "after") {
                where.created_at = { gt: cursorMsg.created_at };
            } else {
                where.created_at = { lt: cursorMsg.created_at };
            }
        }
    }

    const messages = await prisma.messages.findMany({
        where,
        take: parsedLimit + 1,
        orderBy: [{ created_at: direction === "after" ? "asc" : "desc" }, { id: direction === "after" ? "asc" : "desc" }],
        include: {
            users: {
                select: SAFE_USER_SELECT,
            },
            message_reactions: {
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                        },
                    },
                },
            },
            message_pins: {
                select: {
                    id: true,
                    pinned_at: true,
                    pinned_by: true,
                    users: {
                        select: SAFE_USER_SELECT,
                    },
                },
            },
            _count: {
                select: {
                    thread_replies: true,
                },
            },
        },
    });

    const hasMore = messages.length > parsedLimit;
    const paginated = hasMore ? messages.slice(0, parsedLimit) : messages;

    // For "before" direction, we fetched desc (newest to oldest in the past),
    // reverse so client receives chronological order (oldest to newest).
    const chronologicalMessages = direction === "before" ? paginated.reverse() : paginated;

    const nextCursor = paginated.length > 0 ? (direction === "before" ? paginated[0].id : paginated[paginated.length - 1].id) : null;

    return {
        messages: chronologicalMessages.map((m) => ({
            id: m.id,
            channelId: m.channel_id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            sender: m.users,
            content: m.is_deleted ? "This message was deleted." : m.content,
            messageType: m.message_type,
            isEdited: m.is_edited,
            editedAt: m.edited_at,
            isDeleted: m.is_deleted,
            deletedAt: m.deleted_at,
            attachments: m.attachments,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
            replyCount: m._count.thread_replies,
            reactions: m.message_reactions.map((r) => ({
                id: r.id,
                emoji: r.emoji,
                userId: r.user_id,
                user: r.users,
            })),
            isPinned: !!m.message_pins,
            pinInfo: m.message_pins
                ? {
                      id: m.message_pins.id,
                      pinnedAt: m.message_pins.pinned_at,
                      pinnedBy: m.message_pins.pinned_by,
                      pinnedByUser: m.message_pins.users,
                  }
                : null,
        })),
        nextCursor,
        hasMore,
    };
}

/**
 * Retrieve thread replies for a message.
 */
export async function getThreadReplies(userId, messageId, options = {}) {
    const { cursor, limit = 50 } = options;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    const parentMessage = await prisma.messages.findUnique({
        where: { id: messageId },
        include: {
            users: { select: SAFE_USER_SELECT },
        },
    });

    if (!parentMessage) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    // Verify container authorization
    if (parentMessage.channel_id) {
        await validateChannelAccess(parentMessage.channel_id, userId);
    } else {
        await validateConversationAccess(parentMessage.conversation_id, userId);
    }

    const where = {
        parent_message_id: messageId,
    };

    if (cursor) {
        const cursorMsg = await prisma.messages.findUnique({
            where: { id: cursor },
            select: { id: true, created_at: true },
        });
        if (cursorMsg) {
            where.created_at = { gt: cursorMsg.created_at };
        }
    }

    const replies = await prisma.messages.findMany({
        where,
        take: parsedLimit + 1,
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        include: {
            users: {
                select: SAFE_USER_SELECT,
            },
            message_reactions: {
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                        },
                    },
                },
            },
        },
    });

    const hasMore = replies.length > parsedLimit;
    const paginated = hasMore ? replies.slice(0, parsedLimit) : replies;

    return {
        parentMessage: {
            id: parentMessage.id,
            content: parentMessage.is_deleted ? "This message was deleted." : parentMessage.content,
            sender: parentMessage.users,
            createdAt: parentMessage.created_at,
        },
        replies: paginated.map((r) => ({
            id: r.id,
            content: r.is_deleted ? "This message was deleted." : r.content,
            senderId: r.sender_id,
            sender: r.users,
            isEdited: r.is_edited,
            editedAt: r.edited_at,
            isDeleted: r.is_deleted,
            deletedAt: r.deleted_at,
            createdAt: r.created_at,
            reactions: r.message_reactions,
        })),
        nextCursor: paginated.length > 0 ? paginated[paginated.length - 1].id : null,
        hasMore,
    };
}

/**
 * Edit an existing message (Author only).
 */
export async function editMessage(userId, messageId, content) {
    if (!content || typeof content !== "string" || !content.trim()) {
        const error = new Error("Message content cannot be empty");
        error.statusCode = 400;
        throw error;
    }

    const message = await prisma.messages.findUnique({
        where: { id: messageId },
    });

    if (!message) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    if (message.is_deleted) {
        const error = new Error("Cannot edit a deleted message");
        error.statusCode = 400;
        throw error;
    }

    // Server-side authorization: only author can edit
    if (message.sender_id !== userId) {
        const error = new Error("You can only edit your own messages");
        error.statusCode = 403;
        throw error;
    }

    const updated = await prisma.messages.update({
        where: { id: messageId },
        data: {
            content: content.trim(),
            is_edited: true,
            edited_at: new Date(),
            updated_at: new Date(),
        },
        include: {
            users: {
                select: SAFE_USER_SELECT,
            },
        },
    });

    return updated;
}

/**
 * Soft-delete an existing message (Author, Channel Lead, or Workspace Admin).
 */
export async function softDeleteMessage(userId, messageId) {
    const message = await prisma.messages.findUnique({
        where: { id: messageId },
    });

    if (!message) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    if (message.is_deleted) {
        return { success: true, message: "Message is already deleted" };
    }

    let canDelete = message.sender_id === userId;

    if (!canDelete) {
        if (message.channel_id) {
            const { workspaceMembership, channelMember } = await validateChannelAccess(message.channel_id, userId);
            const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";
            const isChannelLead = channelMember && (channelMember.role === "OWNER" || channelMember.role === "MODERATOR");
            canDelete = isWsAdmin || isChannelLead;
        } else if (message.conversation_id) {
            const { conversation } = await validateConversationAccess(message.conversation_id, userId);
            const wsMember = await validateWorkspaceMembership(conversation.workspace_id, userId);
            canDelete = wsMember.workspace_role === "Owner" || wsMember.workspace_role === "Admin";
        }
    }

    if (!canDelete) {
        const error = new Error("Permission denied to delete this message");
        error.statusCode = 403;
        throw error;
    }

    const now = new Date();
    await prisma.messages.update({
        where: { id: messageId },
        data: {
            is_deleted: true,
            deleted_at: now,
            content: "This message was deleted.",
            updated_at: now,
        },
    });

    return {
        success: true,
        message: "Message deleted successfully",
        messageId,
        channelId: message.channel_id,
        conversationId: message.conversation_id,
        deletedAt: now,
    };
}

/**
 * Record a read receipt for a message.
 */
export async function recordReadReceipt(userId, messageId) {
    const message = await prisma.messages.findUnique({
        where: { id: messageId },
    });

    if (!message) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    if (message.channel_id) {
        await validateChannelAccess(message.channel_id, userId);
    } else {
        await validateConversationAccess(message.conversation_id, userId);
    }

    const now = new Date();
    const receipt = await prisma.message_read_receipts.upsert({
        where: {
            message_id_user_id: {
                message_id: messageId,
                user_id: userId,
            },
        },
        update: {
            read_at: now,
        },
        create: {
            message_id: messageId,
            user_id: userId,
            read_at: now,
        },
    });

    // Update user's last_read_at on channel or conversation membership
    if (message.channel_id) {
        await prisma.channel_members.updateMany({
            where: { channel_id: message.channel_id, user_id: userId },
            data: { last_read_at: now },
        });
    } else if (message.conversation_id) {
        await prisma.conversation_members.updateMany({
            where: { conversation_id: message.conversation_id, user_id: userId },
            data: { last_read_at: now },
        });
    }

    return {
        id: receipt.id,
        messageId: message.id,
        channelId: message.channel_id,
        conversationId: message.conversation_id,
        userId,
        readAt: now.toISOString(),
    };
}

// ============================================================================
// PHASE 5: MENTIONS, REACTIONS, PINS, SEARCH & UNREAD TRACKING
// ============================================================================

/**
 * Detect and dispatch notification alerts for mentioned users in chat messages.
 */
async function processMentions(senderId, message, channelId, conversationId) {
    if (!message || !message.content) return;
    const content = message.content;

    let eligibleMembers = [];
    let containerTitle = "chat";

    if (channelId) {
        const channel = await prisma.channels.findUnique({
            where: { id: channelId },
            include: {
                channel_members: {
                    include: {
                        users: { select: SAFE_USER_SELECT },
                    },
                },
            },
        });
        if (channel) {
            containerTitle = `#${channel.name}`;
            eligibleMembers = channel.channel_members.map((m) => m.users).filter(Boolean);
        }
    } else if (conversationId) {
        const conversation = await prisma.conversations.findUnique({
            where: { id: conversationId },
            include: {
                conversation_members: {
                    include: {
                        users: { select: SAFE_USER_SELECT },
                    },
                },
            },
        });
        if (conversation) {
            containerTitle = conversation.title || "direct conversation";
            eligibleMembers = conversation.conversation_members.map((m) => m.users).filter(Boolean);
        }
    }

    const candidateMembers = eligibleMembers.filter(
        (u) => u.id !== senderId && u.is_active !== false
    );

    if (candidateMembers.length === 0) return;

    // Detect structured mentions: @[Name](uuid)
    const structuredMatches = [...content.matchAll(/@\[([^\]]+)\]\(([a-f0-9-]{36})\)/gi)].map(
        (m) => m[2]
    );

    // Detect plain mentions: @name
    const plainMatches = [...content.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((m) =>
        m[1].toLowerCase()
    );

    const mentionedUserIds = new Set(structuredMatches);

    candidateMembers.forEach((member) => {
        const firstName = (member.first_name || "").toLowerCase();
        const lastName = (member.last_name || "").toLowerCase();
        const fullName = `${firstName}${lastName}`;
        const emailPrefix = (member.email || "").split("@")[0].toLowerCase();

        if (
            plainMatches.includes(firstName) ||
            plainMatches.includes(fullName) ||
            plainMatches.includes(emailPrefix)
        ) {
            mentionedUserIds.add(member.id);
        }
    });

    const senderName =
        [message.users?.first_name, message.users?.last_name].filter(Boolean).join(" ") ||
        "A team member";

    const snippet = content.length > 80 ? `${content.slice(0, 80)}...` : content;

    for (const targetUserId of mentionedUserIds) {
        // Enforce member authorization invariant
        const isAuthorizedMember = candidateMembers.some((u) => u.id === targetUserId);
        if (!isAuthorizedMember) continue;

        try {
            await createNotification({
                userId: targetUserId,
                type: "comment", // Maps to MENTION / mentions_and_comments
                message: `${senderName} mentioned you in ${containerTitle}: "${snippet}"`,
                relatedEntityType: "chat_message",
                relatedEntityId: message.id,
            });
        } catch (e) {
            console.error(`Failed to create mention notification for user ${targetUserId}:`, e);
        }
    }
}

/**
 * Add an emoji reaction to a message.
 */
export async function addReaction(userId, messageId, emoji) {
    if (!emoji || typeof emoji !== "string" || !emoji.trim()) {
        const error = new Error("Emoji is required");
        error.statusCode = 400;
        throw error;
    }

    const cleanEmoji = emoji.trim();

    const message = await prisma.messages.findUnique({
        where: { id: messageId },
    });

    if (!message) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    if (message.channel_id) {
        await validateChannelAccess(message.channel_id, userId);
    } else if (message.conversation_id) {
        await validateConversationAccess(message.conversation_id, userId);
    }

    const reaction = await prisma.message_reactions.upsert({
        where: {
            message_id_user_id_emoji: {
                message_id: messageId,
                user_id: userId,
                emoji: cleanEmoji,
            },
        },
        update: {},
        create: {
            message_id: messageId,
            user_id: userId,
            emoji: cleanEmoji,
        },
        include: {
            users: {
                select: SAFE_USER_SELECT,
            },
        },
    });

    return {
        id: reaction.id,
        messageId: message.id,
        channelId: message.channel_id,
        conversationId: message.conversation_id,
        emoji: cleanEmoji,
        userId,
        user: reaction.users,
        createdAt: reaction.created_at,
    };
}

/**
 * Remove an emoji reaction from a message.
 */
export async function removeReaction(userId, messageId, emoji) {
    if (!emoji || typeof emoji !== "string" || !emoji.trim()) {
        const error = new Error("Emoji is required");
        error.statusCode = 400;
        throw error;
    }

    const cleanEmoji = emoji.trim();

    const message = await prisma.messages.findUnique({
        where: { id: messageId },
    });

    if (!message) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    if (message.channel_id) {
        await validateChannelAccess(message.channel_id, userId);
    } else if (message.conversation_id) {
        await validateConversationAccess(message.conversation_id, userId);
    }

    const existing = await prisma.message_reactions.findUnique({
        where: {
            message_id_user_id_emoji: {
                message_id: messageId,
                user_id: userId,
                emoji: cleanEmoji,
            },
        },
    });

    if (existing) {
        await prisma.message_reactions.delete({
            where: { id: existing.id },
        });
    }

    return {
        success: true,
        message: "Reaction removed",
        messageId: message.id,
        channelId: message.channel_id,
        conversationId: message.conversation_id,
        emoji: cleanEmoji,
        userId,
    };
}

/**
 * Pin a message in a channel or conversation.
 */
export async function pinMessage(userId, messageId) {
    const message = await prisma.messages.findUnique({
        where: { id: messageId },
        include: {
            users: { select: SAFE_USER_SELECT },
        },
    });

    if (!message) {
        const error = new Error("Message not found");
        error.statusCode = 404;
        throw error;
    }

    if (message.is_deleted) {
        const error = new Error("Cannot pin a deleted message");
        error.statusCode = 400;
        throw error;
    }

    if (message.channel_id) {
        const { workspaceMembership, channelMember } = await validateChannelAccess(message.channel_id, userId);
        const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";
        const isChannelLead = channelMember && (channelMember.role === "OWNER" || channelMember.role === "MODERATOR");
        if (!isWsAdmin && !isChannelLead) {
            const error = new Error("Permission denied to pin messages in this channel");
            error.statusCode = 403;
            throw error;
        }
    } else if (message.conversation_id) {
        await validateConversationAccess(message.conversation_id, userId);
    }

    const now = new Date();
    const pin = await prisma.message_pins.upsert({
        where: { message_id: messageId },
        update: {
            pinned_by: userId,
            pinned_at: now,
        },
        create: {
            message_id: messageId,
            channel_id: message.channel_id,
            conversation_id: message.conversation_id,
            pinned_by: userId,
            pinned_at: now,
        },
        include: {
            users: { select: SAFE_USER_SELECT },
        },
    });

    return {
        id: pin.id,
        messageId: message.id,
        channelId: message.channel_id,
        conversationId: message.conversation_id,
        pinnedBy: userId,
        pinnedAt: pin.pinned_at,
        user: pin.users,
        message: {
            id: message.id,
            content: message.content,
            senderId: message.sender_id,
            sender: message.users,
            createdAt: message.created_at,
        },
    };
}

/**
 * Unpin a message from a channel or conversation.
 */
export async function unpinMessage(userId, messageId) {
    const pin = await prisma.message_pins.findUnique({
        where: { message_id: messageId },
        include: {
            messages: true,
        },
    });

    if (!pin) {
        const error = new Error("Message is not pinned");
        error.statusCode = 404;
        throw error;
    }

    if (pin.channel_id) {
        const { workspaceMembership, channelMember } = await validateChannelAccess(pin.channel_id, userId);
        const isWsAdmin = workspaceMembership.workspace_role === "Owner" || workspaceMembership.workspace_role === "Admin";
        const isChannelLead = channelMember && (channelMember.role === "OWNER" || channelMember.role === "MODERATOR");
        const isPinner = pin.pinned_by === userId;
        if (!isWsAdmin && !isChannelLead && !isPinner) {
            const error = new Error("Permission denied to unpin this message");
            error.statusCode = 403;
            throw error;
        }
    } else if (pin.conversation_id) {
        await validateConversationAccess(pin.conversation_id, userId);
    }

    await prisma.message_pins.delete({
        where: { message_id: messageId },
    });

    return {
        success: true,
        message: "Message unpinned",
        messageId,
        channelId: pin.channel_id,
        conversationId: pin.conversation_id,
    };
}

/**
 * Retrieve pinned messages in a channel or conversation.
 */
export async function getPinnedMessages(userId, options = {}) {
    const { channelId, conversationId } = options;

    if (!channelId && !conversationId) {
        const error = new Error("Either channelId or conversationId must be provided");
        error.statusCode = 400;
        throw error;
    }

    if (channelId) {
        await validateChannelAccess(channelId, userId);
    } else {
        await validateConversationAccess(conversationId, userId);
    }

    const pins = await prisma.message_pins.findMany({
        where: {
            channel_id: channelId || null,
            conversation_id: conversationId || null,
            messages: {
                is_deleted: false,
            },
        },
        include: {
            users: { select: SAFE_USER_SELECT },
            messages: {
                include: {
                    users: { select: SAFE_USER_SELECT },
                    message_reactions: {
                        include: {
                            users: { select: { id: true, first_name: true, last_name: true } },
                        },
                    },
                },
            },
        },
        orderBy: { pinned_at: "desc" },
    });

    return pins.map((p) => ({
        id: p.id,
        messageId: p.message_id,
        channelId: p.channel_id,
        conversationId: p.conversation_id,
        pinnedAt: p.pinned_at,
        pinnedBy: p.pinned_by,
        pinnedByUser: p.users,
        message: {
            id: p.messages.id,
            content: p.messages.content,
            senderId: p.messages.sender_id,
            sender: p.messages.users,
            createdAt: p.messages.created_at,
            reactions: p.messages.message_reactions.map((r) => ({
                id: r.id,
                emoji: r.emoji,
                userId: r.user_id,
                user: r.users,
            })),
        },
    }));
}

/**
 * Search message content scoped to authorized channels and conversations.
 */
export async function searchMessages(userId, options = {}) {
    const { workspaceId, channelId, conversationId, page = 1, limit = 20 } = options;
    const rawQuery = options.query || options.q;

    if (!workspaceId) {
        const error = new Error("workspaceId is required for message search");
        error.statusCode = 400;
        throw error;
    }

    const wsMembership = await validateWorkspaceMembership(workspaceId, userId);

    if (!rawQuery || typeof rawQuery !== "string" || !rawQuery.trim()) {
        return {
            messages: [],
            total: 0,
            page: 1,
            limit: parseInt(limit, 10) || 20,
            totalPages: 0,
        };
    }

    const trimmedQuery = rawQuery.trim();
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const where = {
        is_deleted: false,
        content: {
            contains: trimmedQuery,
            mode: "insensitive",
        },
    };

    if (channelId) {
        await validateChannelAccess(channelId, userId);
        where.channel_id = channelId;
    } else if (conversationId) {
        await validateConversationAccess(conversationId, userId);
        where.conversation_id = conversationId;
    } else {
        const isWsAdmin = wsMembership.workspace_role === "Owner" || wsMembership.workspace_role === "Admin";

        const [userPrivateChannels, userConversations] = await Promise.all([
            isWsAdmin
                ? prisma.channels.findMany({
                      where: { workspace_id: workspaceId, type: "PRIVATE", is_archived: false },
                      select: { id: true },
                  })
                : prisma.channel_members.findMany({
                      where: {
                          user_id: userId,
                          channels: {
                              workspace_id: workspaceId,
                              type: "PRIVATE",
                              is_archived: false,
                          },
                      },
                      select: { channel_id: true },
                  }),
            prisma.conversation_members.findMany({
                where: {
                    user_id: userId,
                    conversations: { workspace_id: workspaceId },
                },
                select: { conversation_id: true },
            }),
        ]);

        const privateChanIds = userPrivateChannels.map((c) => c.channel_id || c.id);
        const convIds = userConversations.map((c) => c.conversation_id);

        where.OR = [
            {
                channels: {
                    workspace_id: workspaceId,
                    type: "PUBLIC",
                    is_archived: false,
                },
            },
            ...(privateChanIds.length > 0 ? [{ channel_id: { in: privateChanIds } }] : []),
            ...(convIds.length > 0 ? [{ conversation_id: { in: convIds } }] : []),
        ];
    }

    const [total, matchingMessages] = await Promise.all([
        prisma.messages.count({ where }),
        prisma.messages.findMany({
            where,
            take: limitNum,
            skip,
            orderBy: { created_at: "desc" },
            include: {
                users: { select: SAFE_USER_SELECT },
                channels: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
                conversations: {
                    select: {
                        id: true,
                        title: true,
                        type: true,
                    },
                },
            },
        }),
    ]);

    return {
        messages: matchingMessages.map((m) => ({
            id: m.id,
            content: m.content,
            channelId: m.channel_id,
            conversationId: m.conversation_id,
            channel: m.channels,
            conversation: m.conversations,
            senderId: m.sender_id,
            sender: m.users,
            createdAt: m.created_at,
            isEdited: m.is_edited,
        })),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
    };
}

/**
 * Mark a channel as read by the user.
 */
export async function markChannelRead(userId, channelId) {
    await validateChannelAccess(channelId, userId);
    const now = new Date();
    await prisma.channel_members.upsert({
        where: {
            channel_id_user_id: {
                channel_id: channelId,
                user_id: userId,
            },
        },
        update: { last_read_at: now },
        create: {
            channel_id: channelId,
            user_id: userId,
            role: "MEMBER",
            last_read_at: now,
        },
    });

    return {
        success: true,
        channelId,
        lastReadAt: now.toISOString(),
    };
}

/**
 * Mark a conversation as read by the user.
 */
export async function markConversationRead(userId, conversationId) {
    await validateConversationAccess(conversationId, userId);
    const now = new Date();
    await prisma.conversation_members.updateMany({
        where: {
            conversation_id: conversationId,
            user_id: userId,
        },
        data: { last_read_at: now },
    });

    return {
        success: true,
        conversationId,
        lastReadAt: now.toISOString(),
    };
}

/**
 * Retrieve unread message counts for all accessible channels and conversations.
 */
export async function getUnreadCounts(userId, workspaceId) {
    await validateWorkspaceMembership(workspaceId, userId);

    const [channels, conversations] = await Promise.all([
        getChannels(userId, workspaceId),
        getUserConversations(userId, workspaceId),
    ]);

    const unreadCounts = {};

    channels.forEach((c) => {
        unreadCounts[c.id] = c.unreadCount || 0;
    });

    conversations.forEach((c) => {
        unreadCounts[c.id] = c.unreadCount || 0;
    });

    return unreadCounts;
}
