import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import * as chatController from "../controllers/chatController.js";

const router = express.Router();

// Enforce authentication on all chat routes
router.use(authMiddleware);

// ============================================================================
// CONVERSATIONS
// ============================================================================

// List user conversations for a workspace
router.get("/conversations", chatController.getUserConversations);

// Create or resolve one-to-one direct conversation (idempotent)
router.post("/conversations/direct", chatController.getOrCreateDirectConversation);

// Create group direct conversation
router.post("/conversations/group", chatController.createGroupConversation);

// Get conversation details
router.get("/conversations/:conversationId", chatController.getConversationDetails);

// Get conversation members
router.get("/conversations/:conversationId/members", chatController.getConversationMembers);

// Get pinned messages in a conversation
router.get("/conversations/:conversationId/pins", chatController.getConversationPins);

// Mark conversation as read
router.post("/conversations/:conversationId/read", chatController.markConversationRead);

// ============================================================================
// CHANNELS
// ============================================================================

// Create workspace or project channel
router.post("/channels", chatController.createChannel);

// List channels in workspace
router.get("/channels", chatController.getChannels);

// Get channel details
router.get("/channels/:channelId", chatController.getChannelDetails);

// Get pinned messages in a channel
router.get("/channels/:channelId/pins", chatController.getChannelPins);

// Mark channel as read
router.post("/channels/:channelId/read", chatController.markChannelRead);

// Update channel metadata
router.patch("/channels/:channelId", chatController.updateChannel);

// Archive channel
router.post("/channels/:channelId/archive", chatController.archiveChannel);

// Get channel members
router.get("/channels/:channelId/members", chatController.getChannelMembers);

// Add member to channel / self-join
router.post("/channels/:channelId/members", chatController.addChannelMember);

// Remove member from channel / self-leave
router.delete("/channels/:channelId/members/:userId", chatController.removeChannelMember);

// ============================================================================
// MESSAGES, REACTIONS, PINS, SEARCH & UNREAD TRACKING
// ============================================================================

// Search messages
router.get("/search", chatController.searchMessages);

// Get unread counts
router.get("/unread-counts", chatController.getUnreadCounts);

// Send a message
router.post("/messages", chatController.sendMessage);

// Retrieve message history with cursor-based pagination
router.get("/messages", chatController.getMessageHistory);

// Retrieve thread replies
router.get("/messages/:messageId/replies", chatController.getThreadReplies);

// Edit message (author only)
router.patch("/messages/:messageId", chatController.editMessage);

// Soft delete message
router.delete("/messages/:messageId", chatController.deleteMessage);

// Record read receipt
router.post("/messages/:messageId/read", chatController.markMessageRead);

// Add emoji reaction
router.post("/messages/:messageId/reactions", chatController.addReaction);

// Remove emoji reaction
router.delete("/messages/:messageId/reactions/:emoji", chatController.removeReaction);

// Pin message
router.post("/messages/:messageId/pin", chatController.pinMessage);

// Unpin message
router.delete("/messages/:messageId/pin", chatController.unpinMessage);

export default router;
