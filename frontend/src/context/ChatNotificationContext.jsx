import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { useSocket } from "./SocketContext";
import { FiMessageSquare, FiX } from "react-icons/fi";

const ChatNotificationContext = createContext(null);

export const ChatNotificationProvider = ({ children }) => {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCounts, setUnreadCounts] = useState({});
  const [activeContainerId, setActiveContainerId] = useState(null);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() => {
    return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
  });

  const activeContainerIdRef = useRef(activeContainerId);
  useEffect(() => {
    activeContainerIdRef.current = activeContainerId;
  }, [activeContainerId]);

  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Request browser notification permission
  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (Notification.permission === "granted") {
      setBrowserNotificationsEnabled(true);
      return true;
    }
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      const granted = permission === "granted";
      setBrowserNotificationsEnabled(granted);
      return granted;
    }
    return false;
  }, []);

  // Update container unread count
  const updateContainerUnread = useCallback((containerId, count) => {
    if (!containerId) return;
    setUnreadCounts((prev) => {
      const next = { ...prev, [containerId]: Math.max(0, count) };
      return next;
    });
  }, []);

  // Mark container as read
  const markContainerAsRead = useCallback((containerId) => {
    if (!containerId) return;
    setUnreadCounts((prev) => {
      if (!prev[containerId]) return prev;
      const next = { ...prev, [containerId]: 0 };
      return next;
    });
  }, []);

  // Calculate total unread
  const totalUnread = Object.values(unreadCounts).reduce((acc, curr) => acc + (Number(curr) || 0), 0);

  // Handle incoming notification
  useEffect(() => {
    if (!socket) return;

    const handleNotification = (payload) => {
      if (!payload) return;
      const targetId = payload.conversationId || payload.channelId;

      // Don't show toast if currently viewing this exact conversation inside /chat
      const isViewingCurrentTarget =
        locationRef.current.pathname.startsWith("/chat") &&
        activeContainerIdRef.current === targetId;

      // Increment unread count
      if (!isViewingCurrentTarget && targetId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [targetId]: (prev[targetId] || 0) + 1,
        }));
      }

      if (isViewingCurrentTarget) {
        return;
      }

      // 1. In-App Toast Notification
      toast.custom(
        (t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              navigate("/chat", {
                state: {
                  conversationId: payload.conversationId,
                  channelId: payload.channelId,
                },
              });
            }}
            className={`${
              t.visible ? "animate-enter" : "animate-leave"
            } max-w-sm w-full bg-[var(--color-surface)] shadow-lg rounded-xl pointer-events-auto flex ring-1 ring-black/5 border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-brand)] transition p-3.5 gap-3 items-start`}
          >
            <div className="relative shrink-0">
              {payload.senderPicture ? (
                <img
                  src={payload.senderPicture}
                  alt={payload.senderName || "User"}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)] flex items-center justify-center font-bold text-sm">
                  {(payload.senderName?.[0] || "U").toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-[var(--color-surface)]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
                  New Message
                </span>
                <span className="text-[10px] text-[var(--color-text-subtle)]">Just now</span>
              </div>
              <p className="text-xs font-semibold text-[var(--color-text)] truncate">
                {payload.senderName || "Team Member"}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
                {payload.content || payload.preview || "Sent a message"}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toast.dismiss(t.id);
              }}
              className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)] p-1 rounded transition"
              aria-label="Close notification"
            >
              <FiX size={14} />
            </button>
          </div>
        ),
        { duration: 5000, position: "top-right" }
      );

      // 2. Desktop Browser Notification if app in background
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        try {
          const title = payload.senderName ? `${payload.senderName}` : "New Message";
          const options = {
            body: payload.content || payload.preview || "You received a new message.",
            icon: payload.senderPicture || "/favicon.ico",
            tag: payload.id || `chat-${Date.now()}`,
          };
          const notification = new Notification(title, options);
          notification.onclick = () => {
            window.focus();
            navigate("/chat", {
              state: {
                conversationId: payload.conversationId,
                channelId: payload.channelId,
              },
            });
            notification.close();
          };
        } catch (e) {
          console.warn("Desktop notification trigger failed:", e);
        }
      }
    };

    socket.on("chat:notification", handleNotification);

    return () => {
      socket.off("chat:notification", handleNotification);
    };
  }, [socket, navigate]);

  const value = {
    unreadCounts,
    totalUnread,
    activeContainerId,
    setActiveContainerId,
    updateContainerUnread,
    markContainerAsRead,
    requestBrowserNotificationPermission,
    browserNotificationsEnabled,
  };

  return (
    <ChatNotificationContext.Provider value={value}>
      {children}
      <Toaster position="top-right" />
    </ChatNotificationContext.Provider>
  );
};

export const useChatNotifications = () => {
  const context = useContext(ChatNotificationContext);
  if (!context) {
    // Graceful fallback if used outside provider
    return {
      unreadCounts: {},
      totalUnread: 0,
      activeContainerId: null,
      setActiveContainerId: () => {},
      updateContainerUnread: () => {},
      markContainerAsRead: () => {},
      requestBrowserNotificationPermission: async () => false,
      browserNotificationsEnabled: false,
    };
  }
  return context;
};

export default ChatNotificationContext;
