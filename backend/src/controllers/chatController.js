import * as chatService from "../services/chatService.js";
import {
    emitChatMessageCreated,
    emitChatMessageUpdated,
    emitChatMessageDeleted,
    emitChatReadReceipt,
    emitChatReactionAdded,
    emitChatReactionRemoved,
    emitChatMessagePinned,
    emitChatMessageUnpinned,
} from "../socket.js";

// ============================================================================
// CONVERSATIONS
// ============================================================================

export async function getUserConversations(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { workspaceId } = req.query;

        if (!workspaceId) {
            return res.status(400).json({
                success: false,
                message: "workspaceId query parameter is required",
            });
        }

        const conversations = await chatService.getUserConversations(userId, workspaceId);
        return res.status(200).json({
            success: true,
            conversations,
        });
    } catch (error) {
        next(error);
    }
}

export async function getOrCreateDirectConversation(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { workspaceId, recipientId } = req.body;

        if (!workspaceId || !recipientId) {
            return res.status(400).json({
                success: false,
                message: "workspaceId and recipientId are required",
            });
        }

        const result = await chatService.getOrCreateDirectConversation(userId, workspaceId, recipientId);
        const statusCode = result.isExisting ? 200 : 201;

        return res.status(statusCode).json({
            success: true,
            conversation: result.conversation,
            isExisting: result.isExisting,
        });
    } catch (error) {
        next(error);
    }
}

export async function createGroupConversation(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { workspaceId, memberIds, title } = req.body;

        if (!workspaceId || !memberIds) {
            return res.status(400).json({
                success: false,
                message: "workspaceId and memberIds are required",
            });
        }

        const conversation = await chatService.createGroupConversation(userId, workspaceId, memberIds, title);
        return res.status(201).json({
            success: true,
            conversation,
        });
    } catch (error) {
        next(error);
    }
}

export async function getConversationDetails(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { conversationId } = req.params;

        const conversation = await chatService.getConversationDetails(userId, conversationId);
        return res.status(200).json({
            success: true,
            conversation,
        });
    } catch (error) {
        next(error);
    }
}

export async function getConversationMembers(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { conversationId } = req.params;

        const members = await chatService.getConversationMembers(userId, conversationId);
        return res.status(200).json({
            success: true,
            members,
        });
    } catch (error) {
        next(error);
    }
}

// ============================================================================
// CHANNELS
// ============================================================================

export async function createChannel(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { workspaceId, projectId, name, topic, description, type } = req.body;

        if (!workspaceId || !name) {
            return res.status(400).json({
                success: false,
                message: "workspaceId and channel name are required",
            });
        }

        const channel = await chatService.createChannel(userId, workspaceId, {
            projectId,
            name,
            topic,
            description,
            type,
        });

        return res.status(201).json({
            success: true,
            message: "Channel created successfully",
            channel,
        });
    } catch (error) {
        next(error);
    }
}

export async function getChannels(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { workspaceId, projectId, archived } = req.query;

        if (!workspaceId) {
            return res.status(400).json({
                success: false,
                message: "workspaceId query parameter is required",
            });
        }

        const channels = await chatService.getChannels(userId, workspaceId, {
            projectId,
            archived,
        });

        return res.status(200).json({
            success: true,
            channels,
        });
    } catch (error) {
        next(error);
    }
}

export async function getChannelDetails(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;

        const channel = await chatService.getChannelDetails(userId, channelId);
        return res.status(200).json({
            success: true,
            channel,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateChannel(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;
        const { name, topic, description } = req.body;

        const updated = await chatService.updateChannel(userId, channelId, {
            name,
            topic,
            description,
        });

        return res.status(200).json({
            success: true,
            message: "Channel updated successfully",
            channel: updated,
        });
    } catch (error) {
        next(error);
    }
}

export async function archiveChannel(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;

        const archived = await chatService.archiveChannel(userId, channelId);
        return res.status(200).json({
            success: true,
            message: "Channel archived successfully",
            channel: archived,
        });
    } catch (error) {
        next(error);
    }
}

export async function getChannelMembers(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;

        const members = await chatService.getChannelMembers(userId, channelId);
        return res.status(200).json({
            success: true,
            members,
        });
    } catch (error) {
        next(error);
    }
}

export async function addChannelMember(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;
        const { userId: targetUserId, role } = req.body;

        const effectiveTarget = targetUserId || userId;

        const member = await chatService.addChannelMember(userId, channelId, effectiveTarget, role);
        return res.status(201).json({
            success: true,
            message: "Member added to channel successfully",
            member,
        });
    } catch (error) {
        next(error);
    }
}

export async function removeChannelMember(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId, userId: targetUserId } = req.params;

        const result = await chatService.removeChannelMember(userId, channelId, targetUserId);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function sendMessage(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId, conversationId, content, messageType, parentMessageId, attachments } = req.body;

        const message = await chatService.sendMessage(userId, {
            channelId,
            conversationId,
            content,
            messageType,
            parentMessageId,
            attachments,
        });

        const targetRoom = message.channel_id ? `channel:${message.channel_id}` : `conversation:${message.conversation_id}`;
        emitChatMessageCreated(message, targetRoom);

        return res.status(201).json({
            success: true,
            message,
        });
    } catch (error) {
        next(error);
    }
}

export async function getMessageHistory(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId, conversationId, cursor, limit, direction } = req.query;

        const result = await chatService.getMessageHistory(userId, {
            channelId,
            conversationId,
            cursor,
            limit,
            direction,
        });

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
}

export async function getThreadReplies(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;
        const { cursor, limit } = req.query;

        const result = await chatService.getThreadReplies(userId, messageId, {
            cursor,
            limit,
        });

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
}

export async function editMessage(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;
        const { content } = req.body;

        const updated = await chatService.editMessage(userId, messageId, content);

        const targetRoom = updated.channel_id ? `channel:${updated.channel_id}` : `conversation:${updated.conversation_id}`;
        emitChatMessageUpdated(updated, targetRoom);

        return res.status(200).json({
            success: true,
            message: updated,
        });
    } catch (error) {
        next(error);
    }
}

export async function deleteMessage(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;

        const result = await chatService.softDeleteMessage(userId, messageId);

        const targetRoom = result.channelId ? `channel:${result.channelId}` : `conversation:${result.conversationId}`;
        emitChatMessageDeleted({
            messageId,
            channelId: result.channelId,
            conversationId: result.conversationId,
            deletedAt: result.deletedAt,
        }, targetRoom);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function markMessageRead(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;

        const receipt = await chatService.recordReadReceipt(userId, messageId);
        const targetRoom = receipt.channelId ? `channel:${receipt.channelId}` : `conversation:${receipt.conversationId}`;
        emitChatReadReceipt(receipt, targetRoom);

        return res.status(200).json({
            success: true,
            receipt,
        });
    } catch (error) {
        next(error);
    }
}

// ============================================================================
// PHASE 5: REACTIONS, PINS, SEARCH & UNREAD TRACKING CONTROLLERS
// ============================================================================

export async function addReaction(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;
        const { emoji } = req.body;

        const reaction = await chatService.addReaction(userId, messageId, emoji);
        const targetRoom = reaction.channelId ? `channel:${reaction.channelId}` : `conversation:${reaction.conversationId}`;
        emitChatReactionAdded(reaction, targetRoom);

        return res.status(201).json({
            success: true,
            reaction,
        });
    } catch (error) {
        next(error);
    }
}

export async function removeReaction(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId, emoji } = req.params;

        const result = await chatService.removeReaction(userId, messageId, decodeURIComponent(emoji));
        const targetRoom = result.channelId ? `channel:${result.channelId}` : `conversation:${result.conversationId}`;
        emitChatReactionRemoved(result, targetRoom);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function pinMessage(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;

        const pin = await chatService.pinMessage(userId, messageId);
        const targetRoom = pin.channelId ? `channel:${pin.channelId}` : `conversation:${pin.conversationId}`;
        emitChatMessagePinned(pin, targetRoom);

        return res.status(201).json({
            success: true,
            pin,
        });
    } catch (error) {
        next(error);
    }
}

export async function unpinMessage(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { messageId } = req.params;

        const result = await chatService.unpinMessage(userId, messageId);
        const targetRoom = result.channelId ? `channel:${result.channelId}` : `conversation:${result.conversationId}`;
        emitChatMessageUnpinned(result, targetRoom);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function getChannelPins(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;

        const pins = await chatService.getPinnedMessages(userId, { channelId });
        return res.status(200).json({
            success: true,
            pins,
        });
    } catch (error) {
        next(error);
    }
}

export async function getConversationPins(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { conversationId } = req.params;

        const pins = await chatService.getPinnedMessages(userId, { conversationId });
        return res.status(200).json({
            success: true,
            pins,
        });
    } catch (error) {
        next(error);
    }
}

export async function searchMessages(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const result = await chatService.searchMessages(userId, req.query);

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
}

export async function markChannelRead(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { channelId } = req.params;

        const result = await chatService.markChannelRead(userId, channelId);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function markConversationRead(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { conversationId } = req.params;

        const result = await chatService.markConversationRead(userId, conversationId);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function getUnreadCounts(req, res, next) {
    try {
        const userId = req.user.userId || req.user.id;
        const { workspaceId } = req.query;

        if (!workspaceId) {
            return res.status(400).json({
                success: false,
                message: "workspaceId query parameter is required",
            });
        }

        const unreadCounts = await chatService.getUnreadCounts(userId, workspaceId);
        return res.status(200).json({
            success: true,
            unreadCounts,
        });
    } catch (error) {
        next(error);
    }
}
