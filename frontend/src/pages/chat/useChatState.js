import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "../../context/SocketContext";
import { getWorkspaces, getWorkspaceMembers } from "../../services/api/workspaceApi";
import {
  getUserConversations,
  getChannels,
  getMessageHistory,
  sendMessage,
  editMessage,
  deleteMessage,
  markMessageRead,
  addReaction,
  removeReaction,
  pinMessage,
  unpinMessage,
  getChannelPins,
  getConversationPins,
  searchMessages,
  markChannelRead,
  markConversationRead,
} from "../../services/api/chatApi";
import { useChatNotifications } from "../../context/ChatNotificationContext";

export function useChatState() {
  const { socket, isConnected } = useSocket();
  const { setActiveContainerId, markContainerAsRead: markGlobalContainerAsRead } = useChatNotifications();

  // User & Workspace State
  const [currentUser] = useState(() => {
    try {
      const raw = localStorage.getItem("taskflow_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    return localStorage.getItem("taskflow_chat_workspace") || null;
  });
  const [workspaceMembers, setWorkspaceMembers] = useState([]);

  // Channels & Conversations
  const [channels, setChannels] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeTarget, setActiveTarget] = useState(null); // { type: 'channel'|'conversation', id: string, data: object }
  const [unreadCounts, setUnreadCounts] = useState({}); // { [targetId]: count }

  // Messages & Pagination
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  // Pinned Messages
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);

  // Search
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchingMessages, setSearchingMessages] = useState(false);

  // Typing & Presence
  const [typingUsers, setTypingUsers] = useState(new Map()); // userId -> { id, first_name, last_name }
  const typingTimeoutRefs = useRef(new Map());
  const [presenceMap, setPresenceMap] = useState({});

  // UI state
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  const currentUserId = currentUser?.id || currentUser?.userId;

  // 1. Load initial workspaces
  useEffect(() => {
    let mounted = true;
    async function loadWorkspaces() {
      try {
        const res = await getWorkspaces();
        const wsList = res?.workspaces || res || [];
        if (!mounted) return;
        setWorkspaces(wsList);

        if (wsList.length > 0) {
          const selected =
            activeWorkspaceId && wsList.some((w) => w.id === activeWorkspaceId)
              ? activeWorkspaceId
              : wsList[0].id;
          setActiveWorkspaceId(selected);
          localStorage.setItem("taskflow_chat_workspace", selected);
        }
      } catch (err) {
        console.error("Failed to load workspaces for chat:", err);
      }
    }
    loadWorkspaces();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Load workspace channels, conversations, and members when active workspace changes
  const refreshWorkspaceData = useCallback(async () => {
    if (!activeWorkspaceId) return;

    try {
      const [chanRes, convRes, membersRes] = await Promise.all([
        getChannels(activeWorkspaceId).catch(() => ({ channels: [] })),
        getUserConversations(activeWorkspaceId).catch(() => ({ conversations: [] })),
        getWorkspaceMembers(activeWorkspaceId).catch(() => ({ members: [] })),
      ]);

      const chanList = chanRes.channels || [];
      const convList = convRes.conversations || [];
      const membersList = membersRes.members || [];

      setChannels(chanList);
      setConversations(convList);
      setWorkspaceMembers(membersList);

      // Populate initial unread counts
      const counts = {};
      chanList.forEach((c) => {
        counts[c.id] = c.unreadCount || 0;
      });
      convList.forEach((c) => {
        counts[c.id] = c.unreadCount || 0;
      });
      setUnreadCounts(counts);

      // If no active target, select first public channel or first conversation
      setActiveTarget((prev) => {
        if (prev) {
          if (prev.type === "channel" && chanList.some((c) => c.id === prev.id)) return prev;
          if (prev.type === "conversation" && convList.some((c) => c.id === prev.id)) return prev;
        }
        if (chanList.length > 0) {
          return { type: "channel", id: chanList[0].id, data: chanList[0] };
        }
        if (convList.length > 0) {
          return { type: "conversation", id: convList[0].id, data: convList[0] };
        }
        return null;
      });

      // Request presence for all workspace members via socket
      if (socket && isConnected && membersList.length > 0) {
        const memberUserIds = membersList.map((m) => m.user?.id || m.user_id || m.id).filter(Boolean);
        socket.emit("chat:get_presence", { userIds: memberUserIds }, (res) => {
          if (res?.presence) {
            setPresenceMap((prev) => ({ ...prev, ...res.presence }));
          }
        });
      }
    } catch (err) {
      console.error("Failed to load workspace chat data:", err);
    }
  }, [activeWorkspaceId, socket, isConnected]);

  useEffect(() => {
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  // 3. Load message history, pinned messages, and join real-time room
  useEffect(() => {
    if (!activeTarget?.id) {
      setMessages([]);
      setPinnedMessages([]);
      return;
    }

    let active = true;
    setLoadingMessages(true);
    setReplyingToMessage(null);
    setEditingMessage(null);
    setTypingUsers(new Map());

    // Clear unread badge for this target
    setActiveContainerId(activeTarget.id);
    markGlobalContainerAsRead(activeTarget.id);
    setUnreadCounts((prev) => ({
      ...prev,
      [activeTarget.id]: 0,
    }));

    // Mark as read on backend
    if (activeTarget.type === "channel") {
      markChannelRead(activeTarget.id).catch(() => {});
    } else {
      markConversationRead(activeTarget.id).catch(() => {});
    }

    // Join real-time room via socket
    if (socket && isConnected) {
      if (activeTarget.type === "channel") {
        socket.emit("chat:join_channel", { channelId: activeTarget.id });
      } else {
        socket.emit("chat:join_conversation", { conversationId: activeTarget.id });
      }
    }

    // Load message history
    async function loadHistory() {
      try {
        const query = {
          limit: 30,
          direction: "before",
          ...(activeTarget.type === "channel"
            ? { channelId: activeTarget.id }
            : { conversationId: activeTarget.id }),
        };

        const res = await getMessageHistory(query);
        if (!active) return;

        setMessages(res.messages || []);
        setHasMoreMessages(Boolean(res.hasMore));
        setNextCursor(res.nextCursor || null);

        // Mark newest message as read
        if (res.messages && res.messages.length > 0) {
          const latest = res.messages[res.messages.length - 1];
          if (latest.senderId !== currentUserId) {
            markMessageRead(latest.id).catch(() => {});
            if (socket?.connected) {
              socket.emit("chat:read_receipt", { messageId: latest.id });
            }
          }
        }
      } catch (err) {
        console.error("Failed to load message history:", err);
      } finally {
        if (active) setLoadingMessages(false);
      }
    }

    // Load pinned messages
    async function loadPins() {
      setLoadingPins(true);
      try {
        const res =
          activeTarget.type === "channel"
            ? await getChannelPins(activeTarget.id)
            : await getConversationPins(activeTarget.id);
        if (active) {
          setPinnedMessages(res?.pins || []);
        }
      } catch (err) {
        console.error("Failed to load pins:", err);
      } finally {
        if (active) setLoadingPins(false);
      }
    }

    loadHistory();
    loadPins();

    return () => {
      active = false;
      setActiveContainerId(null);
      if (socket && isConnected) {
        if (activeTarget.type === "channel") {
          socket.emit("chat:leave_channel", { channelId: activeTarget.id });
        } else {
          socket.emit("chat:leave_conversation", { conversationId: activeTarget.id });
        }
      }
    };
  }, [activeTarget?.id, activeTarget?.type, socket, isConnected, currentUserId]);

  // 4. Socket.IO Real-Time Event Handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Incoming new message
    const handleMessageCreated = (msg) => {
      const isForActiveChannel = activeTarget?.type === "channel" && msg.channel_id === activeTarget.id;
      const isForActiveConv = activeTarget?.type === "conversation" && msg.conversation_id === activeTarget.id;

      if (isForActiveChannel || isForActiveConv) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const normalized = {
            id: msg.id,
            channelId: msg.channel_id,
            conversationId: msg.conversation_id,
            senderId: msg.sender_id,
            sender: msg.users || msg.sender,
            content: msg.content,
            messageType: msg.message_type || "TEXT",
            isEdited: msg.is_edited,
            editedAt: msg.edited_at,
            isDeleted: msg.is_deleted,
            deletedAt: msg.deleted_at,
            attachments: msg.attachments,
            createdAt: msg.created_at,
            updatedAt: msg.updated_at,
            replyCount: 0,
            reactions: [],
            isPinned: false,
          };
          return [...prev, normalized];
        });

        // Auto mark read if from another user
        if (msg.sender_id !== currentUserId) {
          markMessageRead(msg.id).catch(() => {});
          socket.emit("chat:read_receipt", { messageId: msg.id });
        }
      } else {
        // Increment unread count for the recipient container
        const targetId = msg.channel_id || msg.conversation_id;
        if (targetId && msg.sender_id !== currentUserId) {
          setUnreadCounts((prev) => ({
            ...prev,
            [targetId]: (prev[targetId] || 0) + 1,
          }));
        }
      }

      // Update sidebar preview
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === msg.conversation_id) {
            return {
              ...c,
              lastMessage: {
                id: msg.id,
                content: msg.content,
                sender_id: msg.sender_id,
                created_at: msg.created_at,
                is_deleted: msg.is_deleted,
              },
              lastMessageAt: msg.created_at,
            };
          }
          return c;
        })
      );
    };

    // Message modified
    const handleMessageUpdated = (msg) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, content: msg.content, isEdited: msg.is_edited, editedAt: msg.edited_at }
            : m
        )
      );
    };

    // Message soft-deleted
    const handleMessageDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, content: "This message was deleted." }
            : m
        )
      );
      setPinnedMessages((prev) => prev.filter((p) => p.messageId !== messageId));
    };

    // Reaction added
    const handleReactionAdded = (payload) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === payload.messageId) {
            const existing = m.reactions || [];
            if (
              existing.some(
                (r) =>
                  r.id === payload.id ||
                  (r.emoji === payload.emoji && (r.userId === payload.userId || r.user?.id === payload.userId))
              )
            ) {
              return m;
            }
            return {
              ...m,
              reactions: [
                ...existing,
                {
                  id: payload.id,
                  emoji: payload.emoji,
                  userId: payload.userId,
                  user: payload.user,
                },
              ],
            };
          }
          return m;
        })
      );
    };

    // Reaction removed
    const handleReactionRemoved = (payload) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === payload.messageId) {
            return {
              ...m,
              reactions: (m.reactions || []).filter(
                (r) =>
                  !(
                    r.emoji === payload.emoji &&
                    (r.userId === payload.userId || r.user?.id === payload.userId)
                  )
              ),
            };
          }
          return m;
        })
      );
    };

    // Message pinned
    const handleMessagePinned = (payload) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, isPinned: true, pinInfo: payload.pin }
            : m
        )
      );
      setPinnedMessages((prev) => {
        if (prev.some((p) => p.messageId === payload.messageId)) return prev;
        return [payload.pin, ...prev];
      });
    };

    // Message unpinned
    const handleMessageUnpinned = (payload) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, isPinned: false, pinInfo: null }
            : m
        )
      );
      setPinnedMessages((prev) => prev.filter((p) => p.messageId !== payload.messageId));
    };

    // Typing started
    const handleTypingStarted = (event) => {
      const isCurrentTarget =
        (activeTarget?.type === "channel" && event.channelId === activeTarget.id) ||
        (activeTarget?.type === "conversation" && event.conversationId === activeTarget.id);

      if (isCurrentTarget && event.userId !== currentUserId) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(event.userId, event.user || { id: event.userId, first_name: "Team Member" });
          return next;
        });

        if (typingTimeoutRefs.current.has(event.userId)) {
          clearTimeout(typingTimeoutRefs.current.get(event.userId));
        }

        const timer = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(event.userId);
            return next;
          });
          typingTimeoutRefs.current.delete(event.userId);
        }, 5000);

        typingTimeoutRefs.current.set(event.userId, timer);
      }
    };

    // Typing stopped
    const handleTypingStopped = (event) => {
      if (event.userId && typingTimeoutRefs.current.has(event.userId)) {
        clearTimeout(typingTimeoutRefs.current.get(event.userId));
        typingTimeoutRefs.current.delete(event.userId);
      }

      setTypingUsers((prev) => {
        if (!prev.has(event.userId)) return prev;
        const next = new Map(prev);
        next.delete(event.userId);
        return next;
      });
    };

    // Presence updated
    const handlePresenceUpdated = (event) => {
      if (event?.userId) {
        setPresenceMap((prev) => ({
          ...prev,
          [event.userId]: {
            status: event.status,
            lastSeen: event.lastSeen || null,
          },
        }));
      }
    };

    socket.on("chat:message_created", handleMessageCreated);
    socket.on("chat:message_updated", handleMessageUpdated);
    socket.on("chat:message_deleted", handleMessageDeleted);
    socket.on("chat:reaction_added", handleReactionAdded);
    socket.on("chat:reaction_removed", handleReactionRemoved);
    socket.on("chat:message_pinned", handleMessagePinned);
    socket.on("chat:message_unpinned", handleMessageUnpinned);
    socket.on("chat:typing_started", handleTypingStarted);
    socket.on("chat:typing_stopped", handleTypingStopped);
    socket.on("chat:presence_updated", handlePresenceUpdated);

    return () => {
      socket.off("chat:message_created", handleMessageCreated);
      socket.off("chat:message_updated", handleMessageUpdated);
      socket.off("chat:message_deleted", handleMessageDeleted);
      socket.off("chat:reaction_added", handleReactionAdded);
      socket.off("chat:reaction_removed", handleReactionRemoved);
      socket.off("chat:message_pinned", handleMessagePinned);
      socket.off("chat:message_unpinned", handleMessageUnpinned);
      socket.off("chat:typing_started", handleTypingStarted);
      socket.off("chat:typing_stopped", handleTypingStopped);
      socket.off("chat:presence_updated", handlePresenceUpdated);

      typingTimeoutRefs.current.forEach((t) => clearTimeout(t));
      typingTimeoutRefs.current.clear();
    };
  }, [socket, isConnected, activeTarget?.id, activeTarget?.type, currentUserId]);

  // 5. Actions: Load Older Messages (Pagination)
  const loadOlderMessages = async () => {
    if (!hasMoreMessages || !nextCursor || loadingMore || !activeTarget) return;

    setLoadingMore(true);
    try {
      const query = {
        limit: 30,
        direction: "before",
        cursor: nextCursor,
        ...(activeTarget.type === "channel"
          ? { channelId: activeTarget.id }
          : { conversationId: activeTarget.id }),
      };

      const res = await getMessageHistory(query);
      setMessages((prev) => [...(res.messages || []), ...prev]);
      setHasMoreMessages(Boolean(res.hasMore));
      setNextCursor(res.nextCursor || null);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 6. Actions: Send Message
  const handleSendMessage = async (content) => {
    if (!content?.trim() || !activeTarget) return;

    const payload = {
      content: content.trim(),
      messageType: "TEXT",
      ...(activeTarget.type === "channel"
        ? { channelId: activeTarget.id }
        : { conversationId: activeTarget.id }),
      ...(replyingToMessage ? { parentMessageId: replyingToMessage.id } : {}),
    };

    const res = await sendMessage(payload);
    if (res?.message) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        const normalized = {
          id: res.message.id,
          channelId: res.message.channel_id,
          conversationId: res.message.conversation_id,
          senderId: res.message.sender_id,
          sender: res.message.users,
          content: res.message.content,
          messageType: res.message.message_type,
          isEdited: res.message.is_edited,
          editedAt: res.message.edited_at,
          isDeleted: res.message.is_deleted,
          deletedAt: res.message.deleted_at,
          attachments: res.message.attachments,
          createdAt: res.message.created_at,
          updatedAt: res.message.updated_at,
          replyCount: 0,
          reactions: [],
          isPinned: false,
          pinInfo: null,
        };
        return [...prev, normalized];
      });
      setReplyingToMessage(null);
    }
  };

  // 7. Actions: Edit Message
  const handleEditMessage = async (messageId, newContent) => {
    if (!newContent?.trim()) return;
    const res = await editMessage(messageId, newContent.trim());
    if (res?.message) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: res.message.content, isEdited: true, editedAt: res.message.edited_at }
            : m
        )
      );
      setEditingMessage(null);
    }
  };

  // 8. Actions: Delete Message
  const handleDeleteMessage = async (messageId) => {
    await deleteMessage(messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: "This message was deleted." } : m
      )
    );
  };

  // 9. Actions: Reaction Toggle
  const handleToggleReaction = async (messageId, emoji) => {
    if (!messageId || !emoji) return;
    const msg = messages.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find(
      (r) => r.emoji === emoji && (r.userId === currentUserId || r.user?.id === currentUserId)
    );

    if (existing) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: (m.reactions || []).filter(
                  (r) => !(r.emoji === emoji && (r.userId === currentUserId || r.user?.id === currentUserId))
                ),
              }
            : m
        )
      );
      await removeReaction(messageId, emoji).catch((err) => {
        console.error("Failed to remove reaction:", err);
      });
    } else {
      const tempId = `temp-${Date.now()}`;
      const tempReaction = {
        id: tempId,
        emoji,
        userId: currentUserId,
        user: currentUser,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, reactions: [...(m.reactions || []), tempReaction] }
            : m
        )
      );
      try {
        const res = await addReaction(messageId, emoji);
        if (res?.reaction) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions: (m.reactions || []).map((r) =>
                      r.id === tempId ? res.reaction : r
                    ),
                  }
                : m
            )
          );
        }
      } catch (err) {
        console.error("Failed to add reaction:", err);
      }
    }
  };

  // 10. Actions: Pin Toggle
  const handleTogglePin = async (message) => {
    if (!message?.id) return;
    const isPinned = Boolean(message.isPinned);

    if (isPinned) {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, isPinned: false, pinInfo: null } : m))
      );
      setPinnedMessages((prev) => prev.filter((p) => p.messageId !== message.id));
      await unpinMessage(message.id).catch((err) => {
        console.error("Failed to unpin message:", err);
      });
    } else {
      try {
        const res = await pinMessage(message.id);
        if (res?.pin) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === message.id ? { ...m, isPinned: true, pinInfo: res.pin } : m
            )
          );
          setPinnedMessages((prev) => [res.pin, ...prev]);
        }
      } catch (err) {
        console.error("Failed to pin message:", err);
      }
    }
  };

  // 11. Actions: Search Messages
  const handleSearchMessages = async (queryTerm) => {
    if (!queryTerm?.trim() || !activeWorkspaceId) return;
    setSearchingMessages(true);
    try {
      const res = await searchMessages({
        workspaceId: activeWorkspaceId,
        q: queryTerm.trim(),
      });
      setSearchResults(res?.messages || []);
    } catch (err) {
      console.error("Failed to search messages:", err);
      setSearchResults([]);
    } finally {
      setSearchingMessages(false);
    }
  };

  // 12. Actions: Typing Indicators Emitter
  const emitTyping = (isTyping) => {
    if (!socket?.connected || !activeTarget) return;
    const eventName = isTyping ? "chat:typing_started" : "chat:typing_stopped";
    const payload =
      activeTarget.type === "channel"
        ? { channelId: activeTarget.id }
        : { conversationId: activeTarget.id };
    socket.emit(eventName, payload);
  };

  return {
    currentUser,
    currentUserId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId: (id) => {
      setActiveWorkspaceId(id);
      localStorage.setItem("taskflow_chat_workspace", id);
    },
    workspaceMembers,
    channels,
    conversations,
    unreadCounts,
    activeTarget,
    setActiveTarget,
    messages,
    loadingMessages,
    loadingMore,
    hasMoreMessages,
    loadOlderMessages,
    handleSendMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleToggleReaction,
    handleTogglePin,
    pinnedMessages,
    loadingPins,
    pinnedPanelOpen,
    setPinnedPanelOpen,
    searchModalOpen,
    setSearchModalOpen,
    searchResults,
    searchingMessages,
    handleSearchMessages,
    emitTyping,
    typingUsers: Array.from(typingUsers.values()),
    presenceMap,
    infoPanelOpen,
    setInfoPanelOpen,
    searchQuery,
    setSearchQuery,
    replyingToMessage,
    setReplyingToMessage,
    editingMessage,
    setEditingMessage,
    refreshWorkspaceData,
  };
}
