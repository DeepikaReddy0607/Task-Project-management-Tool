import api from "./axios";

// ============================================================================
// CONVERSATIONS
// ============================================================================

export const getUserConversations = async (workspaceId) => {
  const response = await api.get("/chat/conversations", {
    params: { workspaceId },
  });
  return response.data;
};

export const getOrCreateDirectConversation = async (workspaceId, recipientId) => {
  const response = await api.post("/chat/conversations/direct", {
    workspaceId,
    recipientId,
  });
  return response.data;
};

export const createGroupConversation = async (workspaceId, memberIds, title) => {
  const response = await api.post("/chat/conversations/group", {
    workspaceId,
    memberIds,
    title,
  });
  return response.data;
};

export const getConversationDetails = async (conversationId) => {
  const response = await api.get(`/chat/conversations/${conversationId}`);
  return response.data;
};

export const getConversationMembers = async (conversationId) => {
  const response = await api.get(`/chat/conversations/${conversationId}/members`);
  return response.data;
};

// ============================================================================
// CHANNELS
// ============================================================================

export const getChannels = async (workspaceId, projectId = null, archived = false) => {
  const params = { workspaceId, archived };
  if (projectId) params.projectId = projectId;
  const response = await api.get("/chat/channels", { params });
  return response.data;
};

export const createChannel = async (channelData) => {
  const response = await api.post("/chat/channels", channelData);
  return response.data;
};

export const getChannelDetails = async (channelId) => {
  const response = await api.get(`/chat/channels/${channelId}`);
  return response.data;
};

export const updateChannel = async (channelId, updateData) => {
  const response = await api.patch(`/chat/channels/${channelId}`, updateData);
  return response.data;
};

export const archiveChannel = async (channelId) => {
  const response = await api.post(`/chat/channels/${channelId}/archive`);
  return response.data;
};

export const getChannelMembers = async (channelId) => {
  const response = await api.get(`/chat/channels/${channelId}/members`);
  return response.data;
};

export const addChannelMember = async (channelId, userId, role = "MEMBER") => {
  const response = await api.post(`/chat/channels/${channelId}/members`, {
    userId,
    role,
  });
  return response.data;
};

export const removeChannelMember = async (channelId, userId) => {
  const response = await api.delete(`/chat/channels/${channelId}/members/${userId}`);
  return response.data;
};

// ============================================================================
// MESSAGES
// ============================================================================

export const getMessageHistory = async ({
  channelId,
  conversationId,
  cursor,
  limit = 30,
  direction = "before",
}) => {
  const params = { limit, direction };
  if (channelId) params.channelId = channelId;
  if (conversationId) params.conversationId = conversationId;
  if (cursor) params.cursor = cursor;

  const response = await api.get("/chat/messages", { params });
  return response.data;
};

export const sendMessage = async (messageData) => {
  const response = await api.post("/chat/messages", messageData);
  return response.data;
};

export const editMessage = async (messageId, content) => {
  const response = await api.patch(`/chat/messages/${messageId}`, { content });
  return response.data;
};

export const deleteMessage = async (messageId) => {
  const response = await api.delete(`/chat/messages/${messageId}`);
  return response.data;
};

export const getThreadReplies = async (messageId, cursor, limit = 50) => {
  const params = { limit };
  if (cursor) params.cursor = cursor;
  const response = await api.get(`/chat/messages/${messageId}/replies`, { params });
  return response.data;
};

export const markMessageRead = async (messageId) => {
  const response = await api.post(`/chat/messages/${messageId}/read`);
  return response.data;
};

// ============================================================================
// PHASE 5: REACTIONS, PINS, SEARCH & UNREAD TRACKING
// ============================================================================

export const addReaction = async (messageId, emoji) => {
  const response = await api.post(`/chat/messages/${messageId}/reactions`, { emoji });
  return response.data;
};

export const removeReaction = async (messageId, emoji) => {
  const response = await api.delete(
    `/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`
  );
  return response.data;
};

export const pinMessage = async (messageId) => {
  const response = await api.post(`/chat/messages/${messageId}/pin`);
  return response.data;
};

export const unpinMessage = async (messageId) => {
  const response = await api.delete(`/chat/messages/${messageId}/pin`);
  return response.data;
};

export const getChannelPins = async (channelId) => {
  const response = await api.get(`/chat/channels/${channelId}/pins`);
  return response.data;
};

export const getConversationPins = async (conversationId) => {
  const response = await api.get(`/chat/conversations/${conversationId}/pins`);
  return response.data;
};

export const searchMessages = async ({
  workspaceId,
  q,
  channelId,
  conversationId,
  page = 1,
  limit = 20,
}) => {
  const params = { workspaceId, q, page, limit };
  if (channelId) params.channelId = channelId;
  if (conversationId) params.conversationId = conversationId;

  const response = await api.get("/chat/search", { params });
  return response.data;
};

export const markChannelRead = async (channelId) => {
  const response = await api.post(`/chat/channels/${channelId}/read`);
  return response.data;
};

export const markConversationRead = async (conversationId) => {
  const response = await api.post(`/chat/conversations/${conversationId}/read`);
  return response.data;
};

export const getUnreadCounts = async (workspaceId) => {
  const response = await api.get("/chat/unread-counts", {
    params: { workspaceId },
  });
  return response.data;
};
