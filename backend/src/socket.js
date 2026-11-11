import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import prisma from "./config/prisma.js";
import { getAllowedOrigins } from "./config/cors.js";
import { revokeUser, unrevokeUser, invalidateUserTokens } from "./middleware/authMiddleware.js";

let io = null;

// Multi-socket presence tracking
// Maps userId -> Set of socket IDs connected on this process
const localUserSockets = new Map();
// Maps userId -> remote socket count from peer cluster workers
const remoteUserSocketCounts = new Map();
// Maps userId -> ISO timestamp string when user went offline
const userLastSeen = new Map();

/**
 * Returns true if a user has at least one active socket connected locally or on a peer worker.
 */
export function isUserOnline(userId) {
    if (!userId) return false;
    const local = localUserSockets.get(userId)?.size || 0;
    const remote = remoteUserSocketCounts.get(userId) || 0;
    return (local + remote) > 0;
}

/**
 * Returns a user's current presence status and last seen timestamp.
 */
export function getUserPresence(userId) {
    const online = isUserOnline(userId);
    return {
        userId,
        status: online ? "online" : "offline",
        lastSeen: online ? null : userLastSeen.get(userId) || null,
    };
}

/**
 * Returns an object of presence statuses for multiple user IDs.
 */
export function getUsersPresence(userIds = []) {
    const map = {};
    for (const id of userIds) {
        map[id] = getUserPresence(id);
    }
    return map;
}

/**
 * Broadcast presence state update to workspace rooms and peer cluster workers.
 */
export function broadcastPresenceUpdate(userId, status, workspaceIds = [], lastSeen = null) {
    if (!io) return;
    const payload = {
        userId,
        status,
        ...(lastSeen ? { lastSeen } : {}),
        timestamp: new Date().toISOString(),
    };

    const targetRooms = (workspaceIds || []).map((wid) => `workspace:${wid}`);
    if (targetRooms.length > 0) {
        let broadcaster = io;
        targetRooms.forEach((r) => {
            broadcaster = broadcaster.to(r);
        });
        broadcaster.emit("chat:presence_updated", payload);
    }

    if (process.send && targetRooms.length > 0) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:presence_updated",
                targetRooms,
                eventPayload: payload,
            });
        } catch {}
    }
}

/**
 * Broadcast chat message creation to room and cluster peer workers.
 */
export const emitChatMessageCreated = (message, room) => {
    if (!io) return;
    io.to(room).emit("chat:message_created", message);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:message_created",
                targetRooms: [room],
                eventPayload: message,
            });
        } catch {}
    }
};

/**
 * Dispatch chat message to container room and individual user rooms for instant delivery and notifications.
 */
export const dispatchChatMessage = async (message, senderId) => {
    if (!io || !message) return;
    const room = message.channel_id ? `channel:${message.channel_id}` : `conversation:${message.conversation_id}`;
    emitChatMessageCreated(message, room);

    try {
        let recipientUserIds = [];
        let containerTitle = "Direct Message";

        if (message.conversation_id) {
            const conv = await prisma.conversations.findUnique({
                where: { id: message.conversation_id },
                include: {
                    conversation_members: {
                        select: { user_id: true },
                    },
                },
            });
            if (conv) {
                containerTitle = conv.title || "Direct Message";
                recipientUserIds = (conv.conversation_members || [])
                    .map((m) => m.user_id)
                    .filter((id) => id !== senderId);
            }
        } else if (message.channel_id) {
            const chan = await prisma.channels.findUnique({
                where: { id: message.channel_id },
                include: {
                    channel_members: {
                        select: { user_id: true },
                    },
                },
            });
            if (chan) {
                containerTitle = `#${chan.name}`;
                recipientUserIds = (chan.channel_members || [])
                    .map((m) => m.user_id)
                    .filter((id) => id !== senderId);
            }
        }

        const senderName =
            [message.users?.first_name, message.users?.last_name].filter(Boolean).join(" ") ||
            "Team Member";

        const notificationPayload = {
            id: message.id,
            senderId,
            senderName,
            senderPicture: message.users?.profile_picture || null,
            content: message.content,
            preview: message.content.length > 100 ? `${message.content.slice(0, 100)}...` : message.content,
            conversationId: message.conversation_id || null,
            channelId: message.channel_id || null,
            containerTitle,
            createdAt: message.created_at,
        };

        for (const recipientId of recipientUserIds) {
            // Deliver message to user's personal socket room so UI and unread count update in real-time
            io.to(`user:${recipientId}`).emit("chat:message_created", message);
            // Deliver popup notification
            io.to(`user:${recipientId}`).emit("chat:notification", notificationPayload);
        }

        if (process.send && recipientUserIds.length > 0) {
            try {
                const userRooms = recipientUserIds.map((id) => `user:${id}`);
                process.send({
                    type: "TASKFLOW_SOCKET_BROADCAST",
                    eventType: "chat:notification",
                    targetRooms: userRooms,
                    eventPayload: notificationPayload,
                });
            } catch {}
        }
    } catch (err) {
        console.error("Failed to dispatch chat notification:", err);
    }
};

/**
 * Broadcast chat message modification to room and cluster peer workers.
 */
export const emitChatMessageUpdated = (message, room) => {
    if (!io) return;
    io.to(room).emit("chat:message_updated", message);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:message_updated",
                targetRooms: [room],
                eventPayload: message,
            });
        } catch {}
    }
};

/**
 * Broadcast chat message deletion to room and cluster peer workers.
 */
export const emitChatMessageDeleted = (deletionInfo, room) => {
    if (!io) return;
    io.to(room).emit("chat:message_deleted", deletionInfo);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:message_deleted",
                targetRooms: [room],
                eventPayload: deletionInfo,
            });
        } catch {}
    }
};

/**
 * Broadcast chat read receipt to room and cluster peer workers.
 */
export const emitChatReadReceipt = (receipt, room) => {
    if (!io) return;
    io.to(room).emit("chat:read_receipt", receipt);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:read_receipt",
                targetRooms: [room],
                eventPayload: receipt,
            });
        } catch {}
    }
};

/**
 * Broadcast chat reaction addition to room and cluster peer workers.
 */
export const emitChatReactionAdded = (reactionPayload, room) => {
    if (!io) return;
    io.to(room).emit("chat:reaction_added", reactionPayload);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:reaction_added",
                targetRooms: [room],
                eventPayload: reactionPayload,
            });
        } catch {}
    }
};

/**
 * Broadcast chat reaction removal to room and cluster peer workers.
 */
export const emitChatReactionRemoved = (reactionPayload, room) => {
    if (!io) return;
    io.to(room).emit("chat:reaction_removed", reactionPayload);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:reaction_removed",
                targetRooms: [room],
                eventPayload: reactionPayload,
            });
        } catch {}
    }
};

/**
 * Broadcast chat message pinned event to room and cluster peer workers.
 */
export const emitChatMessagePinned = (pinPayload, room) => {
    if (!io) return;
    io.to(room).emit("chat:message_pinned", pinPayload);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:message_pinned",
                targetRooms: [room],
                eventPayload: pinPayload,
            });
        } catch {}
    }
};

/**
 * Broadcast chat message unpinned event to room and cluster peer workers.
 */
export const emitChatMessageUnpinned = (unpinPayload, room) => {
    if (!io) return;
    io.to(room).emit("chat:message_unpinned", unpinPayload);
    if (process.send) {
        try {
            process.send({
                type: "TASKFLOW_SOCKET_BROADCAST",
                eventType: "chat:message_unpinned",
                targetRooms: [room],
                eventPayload: unpinPayload,
            });
        } catch {}
    }
};

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: getAllowedOrigins(),
            methods: ["GET", "POST", "PATCH", "DELETE"],
            credentials: true,
        },
    });

    // In multi-process cluster mode, relay broadcasts, presence sync, and cache invalidation
    if (process.send && !process._taskflowIpcRegistered) {
        process._taskflowIpcRegistered = true;
        process.on("message", (msg) => {
            if (!msg) return;
            if (msg.type === "TASKFLOW_SOCKET_BROADCAST" && io) {
                const { eventType, targetRooms, eventPayload } = msg;
                if (targetRooms && targetRooms.length > 0) {
                    let broadcaster = io;
                    targetRooms.forEach((room) => {
                        broadcaster = broadcaster.to(room);
                    });
                    broadcaster.emit(eventType, eventPayload);
                    broadcaster.emit("taskflow:event", eventPayload);
                }
            } else if (msg.type === "TASKFLOW_PRESENCE_STATE") {
                const { userId, delta } = msg;
                const current = remoteUserSocketCounts.get(userId) || 0;
                const updated = Math.max(0, current + (delta || 0));
                if (updated > 0) {
                    remoteUserSocketCounts.set(userId, updated);
                } else {
                    remoteUserSocketCounts.delete(userId);
                }
            } else if (msg.type === "TASKFLOW_INVALIDATE_USER") {
                invalidateUserTokens(msg.userId);
            } else if (msg.type === "TASKFLOW_REVOKE_USER") {
                revokeUser(msg.userId);
            } else if (msg.type === "TASKFLOW_UNREVOKE_USER") {
                unrevokeUser(msg.userId);
            }
        });
    }

    // 1. Authenticate socket connection with existing JWT
    io.use(async (socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

            if (!token) {
                return next(new Error("Authentication required"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId || decoded.id;
            socket.user = { ...decoded, userId };

            // Verify that the user exists and is active
            const user = await prisma.users.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    profile_picture: true,
                    is_active: true,
                },
            });

            if (!user || user.is_active === false) {
                return next(new Error("User account is inactive or not found"));
            }

            socket.userProfile = user;

            // Fetch user's workspaces and projects to pre-join relevant rooms
            const memberships = await prisma.workspace_members.findMany({
                where: { user_id: userId },
                select: { workspace_id: true, workspace_role: true },
            });
            socket.workspaceIds = memberships.map((m) => m.workspace_id);

            // Pre-join projects where user is explicit member, manager, or workspace Admin/Owner
            const adminWorkspaceIds = memberships
                .filter((m) => ["Owner", "Admin"].includes(m.workspace_role))
                .map((m) => m.workspace_id);

            const authorizedProjects = await prisma.projects.findMany({
                where: {
                    is_archived: false,
                    OR: [
                        { workspace_id: { in: adminWorkspaceIds } },
                        { manager_id: userId },
                        { project_members: { some: { user_id: userId } } },
                    ],
                },
                select: { id: true },
            });
            socket.projectIds = authorizedProjects.map((p) => p.id);

            next();
        } catch (error) {
            console.warn("Socket authentication failed:", error.message);
            next(new Error("Invalid authentication token"));
        }
    });

    // 2. Connection handler & room joins
    io.on("connection", (socket) => {
        const userId = socket.user?.userId;

        // Join personal user room
        if (userId) {
            socket.join(`user:${userId}`);
        }

        // Join workspace rooms
        if (Array.isArray(socket.workspaceIds)) {
            socket.workspaceIds.forEach((wid) => {
                socket.join(`workspace:${wid}`);
            });
        }

        // Join project rooms
        if (Array.isArray(socket.projectIds)) {
            socket.projectIds.forEach((pid) => {
                socket.join(`project:${pid}`);
            });
        }

        // ----------------------------------------------------
        // Multi-socket Presence Handling
        // ----------------------------------------------------
        if (userId) {
            const wasOnline = isUserOnline(userId);
            if (!localUserSockets.has(userId)) {
                localUserSockets.set(userId, new Set());
            }
            localUserSockets.get(userId).add(socket.id);

            if (!wasOnline) {
                broadcastPresenceUpdate(userId, "online", socket.workspaceIds);
                if (process.send) {
                    try {
                        process.send({
                            type: "TASKFLOW_PRESENCE_STATE",
                            userId,
                            delta: 1,
                            workspaceIds: socket.workspaceIds,
                        });
                    } catch {}
                }
            }
        }

        // ----------------------------------------------------
        // Dynamic Room Join/Leave: Project
        // ----------------------------------------------------
        socket.on("join:project", async (projectId) => {
            if (!projectId || !socket.user?.userId) return;
            try {
                const project = await prisma.projects.findUnique({
                    where: { id: projectId },
                    select: { id: true, workspace_id: true, manager_id: true, is_archived: true },
                });
                if (!project || project.is_archived) return;

                // 1. Explicit project member
                const membership = await prisma.project_members.findFirst({
                    where: { project_id: projectId, user_id: socket.user.userId },
                });
                if (membership) {
                    socket.join(`project:${projectId}`);
                    return;
                }

                // 2. Project manager
                if (project.manager_id === socket.user.userId) {
                    socket.join(`project:${projectId}`);
                    return;
                }

                // 3. Workspace Owner or Admin for the project's workspace
                const workspaceAdmin = await prisma.workspace_members.findFirst({
                    where: {
                        workspace_id: project.workspace_id,
                        user_id: socket.user.userId,
                        workspace_role: { in: ["Owner", "Admin"] },
                    },
                });
                if (workspaceAdmin) {
                    socket.join(`project:${projectId}`);
                }
            } catch (err) {
                // Ignore authorization error and deny join
            }
        });

        socket.on("leave:project", (projectId) => {
            if (projectId) socket.leave(`project:${projectId}`);
        });

        // ----------------------------------------------------
        // Dynamic Room Join/Leave: Workspace
        // ----------------------------------------------------
        socket.on("join:workspace", async (workspaceId) => {
            if (!workspaceId || !socket.user?.userId) return;
            try {
                const membership = await prisma.workspace_members.findFirst({
                    where: { workspace_id: workspaceId, user_id: socket.user.userId },
                });
                if (membership) {
                    socket.join(`workspace:${workspaceId}`);
                }
            } catch (err) {
                // Ignore authorization error and deny join
            }
        });

        socket.on("leave:workspace", (workspaceId) => {
            if (workspaceId) socket.leave(`workspace:${workspaceId}`);
        });

        // ====================================================
        // TASKFLOW CHAT: DYNAMIC ROOMS & EVENTS
        // ====================================================

        // 1. Join Chat Channel
        socket.on("chat:join_channel", async (data, callback) => {
            const channelId = typeof data === "string" ? data : data?.channelId;
            if (!channelId || !socket.user?.userId) {
                if (typeof callback === "function") callback({ success: false, message: "Channel ID is required" });
                return;
            }
            try {
                const { validateChannelAccess } = await import("./services/chatService.js");
                await validateChannelAccess(channelId, socket.user.userId);
                socket.join(`channel:${channelId}`);
                if (typeof callback === "function") callback({ success: true, channelId });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
                socket.emit("chat:error", { action: "join_channel", channelId, message: err.message });
            }
        });

        // 2. Leave Chat Channel
        socket.on("chat:leave_channel", (data) => {
            const channelId = typeof data === "string" ? data : data?.channelId;
            if (channelId) socket.leave(`channel:${channelId}`);
        });

        // 3. Join Chat Direct/Group Conversation
        socket.on("chat:join_conversation", async (data, callback) => {
            const conversationId = typeof data === "string" ? data : data?.conversationId;
            if (!conversationId || !socket.user?.userId) {
                if (typeof callback === "function") callback({ success: false, message: "Conversation ID is required" });
                return;
            }
            try {
                const { validateConversationAccess } = await import("./services/chatService.js");
                await validateConversationAccess(conversationId, socket.user.userId);
                socket.join(`conversation:${conversationId}`);
                if (typeof callback === "function") callback({ success: true, conversationId });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
                socket.emit("chat:error", { action: "join_conversation", conversationId, message: err.message });
            }
        });

        // 4. Leave Chat Direct/Group Conversation
        socket.on("chat:leave_conversation", (data) => {
            const conversationId = typeof data === "string" ? data : data?.conversationId;
            if (conversationId) socket.leave(`conversation:${conversationId}`);
        });

        // 5. Send Chat Message (Persisted & Shared Business Logic)
        socket.on("chat:send_message", async (payload = {}, callback) => {
            if (!payload || !socket.user?.userId) {
                if (typeof callback === "function") callback({ success: false, message: "Payload is required" });
                return;
            }
            try {
                const { sendMessage } = await import("./services/chatService.js");
                const message = await sendMessage(socket.user.userId, payload);

                await dispatchChatMessage(message, socket.user.userId);

                if (typeof callback === "function") callback({ success: true, message });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
                socket.emit("chat:error", { action: "send_message", message: err.message });
            }
        });

        // 6. Typing Started
        socket.on("chat:typing_started", async ({ channelId, conversationId } = {}) => {
            if (!socket.user?.userId) return;
            try {
                if (channelId) {
                    const { validateChannelAccess } = await import("./services/chatService.js");
                    await validateChannelAccess(channelId, socket.user.userId);
                    socket.to(`channel:${channelId}`).emit("chat:typing_started", {
                        userId: socket.user.userId,
                        user: socket.userProfile,
                        channelId,
                        timestamp: Date.now(),
                    });
                } else if (conversationId) {
                    const { validateConversationAccess } = await import("./services/chatService.js");
                    await validateConversationAccess(conversationId, socket.user.userId);
                    socket.to(`conversation:${conversationId}`).emit("chat:typing_started", {
                        userId: socket.user.userId,
                        user: socket.userProfile,
                        conversationId,
                        timestamp: Date.now(),
                    });
                }
            } catch {
                // Silently drop unauthorized typing attempts
            }
        });

        // 7. Typing Stopped
        socket.on("chat:typing_stopped", ({ channelId, conversationId } = {}) => {
            if (!socket.user?.userId) return;
            if (channelId) {
                socket.to(`channel:${channelId}`).emit("chat:typing_stopped", {
                    userId: socket.user.userId,
                    channelId,
                    timestamp: Date.now(),
                });
            } else if (conversationId) {
                socket.to(`conversation:${conversationId}`).emit("chat:typing_stopped", {
                    userId: socket.user.userId,
                    conversationId,
                    timestamp: Date.now(),
                });
            }
        });

        // 8. Read Receipt
        socket.on("chat:read_receipt", async ({ messageId } = {}, callback) => {
            if (!messageId || !socket.user?.userId) return;
            try {
                const { recordReadReceipt } = await import("./services/chatService.js");
                const receipt = await recordReadReceipt(socket.user.userId, messageId);
                const room = receipt.channelId ? `channel:${receipt.channelId}` : `conversation:${receipt.conversationId}`;

                emitChatReadReceipt(receipt, room);

                if (typeof callback === "function") callback({ success: true, receipt });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
            }
        });

        // 9. Query Presence for Specific Users
        socket.on("chat:get_presence", async ({ userIds = [] } = {}, callback) => {
            const presence = {};
            const missingIds = [];
            if (Array.isArray(userIds)) {
                userIds.forEach((uId) => {
                    const p = getUserPresence(uId);
                    presence[uId] = p;
                    if (p.status === "offline" && !p.lastSeen) {
                        missingIds.push(uId);
                    }
                });
            }
            if (missingIds.length > 0) {
                try {
                    const dbUsers = await prisma.users.findMany({
                        where: { id: { in: missingIds } },
                        select: { id: true, last_seen_at: true },
                    });
                    for (const u of dbUsers) {
                        if (u.last_seen_at && presence[u.id]) {
                            presence[u.id].lastSeen = u.last_seen_at.toISOString();
                        }
                    }
                } catch {}
            }
            if (typeof callback === "function") callback({ success: true, presence });
        });

        // 10. Add Reaction via Socket
        socket.on("chat:add_reaction", async ({ messageId, emoji } = {}, callback) => {
            if (!messageId || !emoji || !socket.user?.userId) return;
            try {
                const { addReaction } = await import("./services/chatService.js");
                const reaction = await addReaction(socket.user.userId, messageId, emoji);
                const room = reaction.channelId ? `channel:${reaction.channelId}` : `conversation:${reaction.conversationId}`;

                emitChatReactionAdded(reaction, room);

                if (typeof callback === "function") callback({ success: true, reaction });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
            }
        });

        // 11. Remove Reaction via Socket
        socket.on("chat:remove_reaction", async ({ messageId, emoji } = {}, callback) => {
            if (!messageId || !emoji || !socket.user?.userId) return;
            try {
                const { removeReaction } = await import("./services/chatService.js");
                const result = await removeReaction(socket.user.userId, messageId, emoji);
                const room = result.channelId ? `channel:${result.channelId}` : `conversation:${result.conversationId}`;

                emitChatReactionRemoved(result, room);

                if (typeof callback === "function") callback({ success: true, result });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
            }
        });

        // 12. Pin Message via Socket
        socket.on("chat:pin_message", async ({ messageId } = {}, callback) => {
            if (!messageId || !socket.user?.userId) return;
            try {
                const { pinMessage } = await import("./services/chatService.js");
                const pin = await pinMessage(socket.user.userId, messageId);
                const room = pin.channelId ? `channel:${pin.channelId}` : `conversation:${pin.conversationId}`;

                emitChatMessagePinned(pin, room);

                if (typeof callback === "function") callback({ success: true, pin });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
            }
        });

        // 13. Unpin Message via Socket
        socket.on("chat:unpin_message", async ({ messageId } = {}, callback) => {
            if (!messageId || !socket.user?.userId) return;
            try {
                const { unpinMessage } = await import("./services/chatService.js");
                const result = await unpinMessage(socket.user.userId, messageId);
                const room = result.channelId ? `channel:${result.channelId}` : `conversation:${result.conversationId}`;

                emitChatMessageUnpinned(result, room);

                if (typeof callback === "function") callback({ success: true, result });
            } catch (err) {
                if (typeof callback === "function") callback({ success: false, message: err.message });
            }
        });

        // ----------------------------------------------------
        // Disconnect & Multi-Socket Presence Clean Up
        // ----------------------------------------------------
        socket.on("disconnect", () => {
            if (userId && localUserSockets.has(userId)) {
                const userSockets = localUserSockets.get(userId);
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    localUserSockets.delete(userId);
                }

                if (process.send) {
                    try {
                        process.send({
                            type: "TASKFLOW_PRESENCE_STATE",
                            userId,
                            delta: -1,
                            workspaceIds: socket.workspaceIds,
                        });
                    } catch {}
                }

                // If user has zero active sockets remaining, transition to offline
                if (!isUserOnline(userId)) {
                    const nowIso = new Date().toISOString();
                    userLastSeen.set(userId, nowIso);
                    broadcastPresenceUpdate(userId, "offline", socket.workspaceIds, nowIso);
                    prisma.users.update({
                        where: { id: userId },
                        data: { last_seen_at: new Date() },
                    }).catch(() => {});
                }
            }
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        console.warn("Socket.io has not been initialized yet!");
    }
    return io;
};

/**
 * Emit real-time event to scoped rooms.
 * Only call this after successful database persistence.
 */
export const emitRealtimeEvent = ({
    type,
    workspaceId = null,
    projectId = null,
    taskId = null,
    userId = null,
    oldStatus = null,
    newStatus = null,
    data = null,
    changes = null,
    ...extra
}) => {
    if (!io) return;

    // Dynamically manage room membership if a user is added, removed, or deactivated
    if (userId) {
        if (type === "workspace.member_added" && workspaceId) {
            io.in(`user:${userId}`).socketsJoin(`workspace:${workspaceId}`);
        } else if (type === "workspace.member_removed" && workspaceId) {
            io.in(`user:${userId}`).socketsLeave(`workspace:${workspaceId}`);
            // Also evict user sockets from all project rooms of that workspace
            setImmediate(async () => {
                try {
                    const workspaceProjects = await prisma.projects.findMany({
                        where: { workspace_id: workspaceId },
                        select: { id: true },
                    });
                    for (const proj of workspaceProjects) {
                        io.in(`user:${userId}`).socketsLeave(`project:${proj.id}`);
                    }
                } catch {
                    // Ignore non-fatal cleanup error
                }
            });
        } else if (type === "project.member_added" && projectId) {
            io.in(`user:${userId}`).socketsJoin(`project:${projectId}`);
        } else if (type === "project.member_removed" && projectId) {
            io.in(`user:${userId}`).socketsLeave(`project:${projectId}`);
        } else if (type === "workspace.member_role_changed" && workspaceId) {
            const newRole = changes?.workspaceRole || changes?.role || data?.workspace_role;
            if (newRole && !["Owner", "Admin"].includes(newRole)) {
                // User was downgraded to regular member; evict from project rooms where user is not an explicit member or manager
                setImmediate(async () => {
                    try {
                        const nonMemberProjects = await prisma.projects.findMany({
                            where: {
                                workspace_id: workspaceId,
                                manager_id: { not: userId },
                                project_members: {
                                    none: { user_id: userId },
                                },
                            },
                            select: { id: true },
                        });
                        for (const proj of nonMemberProjects) {
                            io.in(`user:${userId}`).socketsLeave(`project:${proj.id}`);
                        }
                    } catch {
                        // Ignore background cleanup error
                    }
                });
            }
        } else if (type === "user.status_changed" && data?.isActive === false) {
            revokeUser(userId);
            if (process.send) {
                try { process.send({ type: "TASKFLOW_REVOKE_USER", userId }); } catch {}
            }
            io.in(`user:${userId}`).disconnectSockets(true);
        } else if (type === "user.status_changed" && data?.isActive === true) {
            unrevokeUser(userId);
            if (process.send) {
                try { process.send({ type: "TASKFLOW_UNREVOKE_USER", userId }); } catch {}
            }
        } else if (type === "user.role_changed") {
            invalidateUserTokens(userId);
            if (process.send) {
                try { process.send({ type: "TASKFLOW_INVALIDATE_USER", userId }); } catch {}
            }
        } else if (type === "user.deleted") {
            revokeUser(userId);
            if (process.send) {
                try { process.send({ type: "TASKFLOW_REVOKE_USER", userId }); } catch {}
            }
            io.in(`user:${userId}`).disconnectSockets(true);
        }
    }

    const payload = {
        type,
        workspaceId,
        projectId,
        taskId,
        userId,
        ...(oldStatus !== null ? { oldStatus } : {}),
        ...(newStatus !== null ? { newStatus } : {}),
        data,
        changes,
        ...extra,
        timestamp: new Date().toISOString(),
    };

    // Determine target rooms
    const targetRooms = new Set();

    if (projectId) {
        targetRooms.add(`project:${projectId}`);
    }
    if (workspaceId) {
        targetRooms.add(`workspace:${workspaceId}`);
    }
    if (userId) {
        targetRooms.add(`user:${userId}`);
    }

    // If no specific room is targeted, fallback to personal user room if available
    if (targetRooms.size === 0 && userId) {
        targetRooms.add(`user:${userId}`);
    }

    // Broadcast to targeted rooms with automatic socket deduplication across joined rooms
    if (targetRooms.size > 0) {
        let broadcaster = io;
        targetRooms.forEach((room) => {
            broadcaster = broadcaster.to(room);
        });
        broadcaster.emit(type, payload);
        broadcaster.emit("taskflow:event", payload);

        // Forward to peer workers in cluster mode via primary process IPC
        if (process.send) {
            try {
                process.send({
                    type: "TASKFLOW_SOCKET_BROADCAST",
                    eventType: type,
                    targetRooms: Array.from(targetRooms),
                    eventPayload: payload,
                });
            } catch {
                // IPC channel closed or unavailable
            }
        }
    }

    // Asynchronously evaluate proactive alerts for business events (persistence-first)
    if (type !== "notification.created") {
        setImmediate(async () => {
            try {
                const { processEventForAlerts } = await import("./services/quackieAlertService.js");
                await processEventForAlerts(payload);
            } catch (alertErr) {
                // Non-fatal background alert processing
            }
        });
    }

    return payload;
};
