import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiInfo,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../../services/api/notificationApi";
import { useSocketEvent } from "../../context/SocketContext";

function formatRelativeTime(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSeverityBadge(severity) {
  switch (severity) {
    case "CRITICAL":
      return {
        icon: <FiAlertCircle className="shrink-0 text-red-500" size={16} />,
        dotClass: "bg-red-500",
      };
    case "HIGH":
      return {
        icon: <FiAlertCircle className="shrink-0 text-amber-600" size={16} />,
        dotClass: "bg-amber-600",
      };
    case "WARNING":
      return {
        icon: <FiAlertTriangle className="shrink-0 text-orange-500" size={16} />,
        dotClass: "bg-orange-500",
      };
    case "INFO":
    default:
      return {
        icon: <FiInfo className="shrink-0 text-blue-500" size={16} />,
        dotClass: "bg-blue-500",
      };
  }
}

const isNotificationRead = (notification) => Boolean(notification.is_read);

const notificationProjectId = (notification) =>
  notification.project_id ||
  (notification.related_entity_type === "project" ? notification.related_entity_id : null);

const notificationTaskId = (notification) =>
  notification.task_id ||
  (notification.related_entity_type === "task" ? notification.related_entity_id : null);

function NotificationBell() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);
  const notificationVersionRef = useRef(0);
  const listRequestIdRef = useRef(0);
  const unreadCountRequestIdRef = useRef(0);

  const invalidateNotificationRequests = () => {
    notificationVersionRef.current += 1;
  };

  const refreshUnreadCount = useCallback(async () => {
    const requestId = ++unreadCountRequestIdRef.current;
    const notificationVersion = notificationVersionRef.current;

    try {
      const response = await getUnreadNotificationCount();
      if (
        response?.success &&
        requestId === unreadCountRequestIdRef.current &&
        notificationVersion === notificationVersionRef.current
      ) {
        setUnreadCount(Number(response.unreadCount) || 0);
      }
    } catch (error) {
      console.warn("Failed to load unread notification count:", error.message);
    }
  }, []);

  const fetchNotificationsList = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    const countRequestId = ++unreadCountRequestIdRef.current;
    const notificationVersion = notificationVersionRef.current;

    try {
      setIsLoading(true);
      const token = localStorage.getItem("taskflow_token");
      if (!token) return;

      const [notificationsResponse, countResponse] = await Promise.all([
        getNotifications(),
        getUnreadNotificationCount(),
      ]);

      if (
        notificationsResponse?.success &&
        requestId === listRequestIdRef.current &&
        notificationVersion === notificationVersionRef.current
      ) {
        setNotifications(
          Array.isArray(notificationsResponse.data) ? notificationsResponse.data : [],
        );
      }

      if (
        countResponse?.success &&
        countRequestId === unreadCountRequestIdRef.current &&
        notificationVersion === notificationVersionRef.current
      ) {
        setUnreadCount(Number(countResponse.unreadCount) || 0);
      }
    } catch (error) {
      console.warn("Failed to load notifications:", error.message);
    } finally {
      if (requestId === listRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const markOneAsRead = useCallback(
    async (id) => {
      try {
        const response = await markNotificationAsRead(id);
        if (response?.success) {
          invalidateNotificationRequests();
          setNotifications((current) =>
            current.map((notification) =>
              notification.id === id
                ? { ...notification, ...(response.data || {}), is_read: true }
                : notification,
            ),
          );
          await refreshUnreadCount();
        }
      } catch (error) {
        console.warn("Failed to mark notification as read:", error.message);
      }
    },
    [refreshUnreadCount],
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void fetchNotificationsList();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [fetchNotificationsList]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useSocketEvent("notification.created", (payload) => {
    const newNotification = payload?.data?.notification || payload?.notification;
    if (!newNotification) return;

    invalidateNotificationRequests();
    setNotifications((current) => {
      const isDuplicate = current.some(
        (notification) =>
          notification.id === newNotification.id ||
          (notification.dedupe_key && notification.dedupe_key === newNotification.dedupe_key),
      );

      return isDuplicate ? current : [newNotification, ...current];
    });
    void refreshUnreadCount();
  });

  const handleMarkOneRead = async (event, id) => {
    event.stopPropagation();
    await markOneAsRead(id);
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await markAllNotificationsAsRead();
      if (response?.success) {
        invalidateNotificationRequests();
        setNotifications((current) =>
          current.map((notification) => ({ ...notification, is_read: true })),
        );
        await refreshUnreadCount();
      }
    } catch (error) {
      console.warn("Failed to mark all notifications as read:", error.message);
    }
  };

  const handleItemClick = (notification) => {
    if (!isNotificationRead(notification)) {
      void markOneAsRead(notification.id);
    }

    setIsOpen(false);

    const intelligenceTypes = [
      "CRITICAL_PATH_CHANGED",
      "NEW_CRITICAL_TASK",
      "CRITICAL_TASK_OVERDUE",
      "BOTTLENECK_ESCALATED",
      "NEW_MAJOR_BOTTLENECK",
      "PROJECT_DURATION_INCREASED",
      "CYCLE_DETECTED",
    ];
    const isIntelligenceAlert =
      intelligenceTypes.includes(notification.type) ||
      notification.type?.startsWith("CRITICAL_PATH_") ||
      notification.type?.startsWith("BOTTLENECK_") ||
      notification.type?.startsWith("CYCLE_");
    const projectId = notificationProjectId(notification);
    const taskId = notificationTaskId(notification);

    if (isIntelligenceAlert && projectId) {
      const taskParam = taskId ? `&taskId=${taskId}` : "";
      navigate(`/projects?projectId=${projectId}&tab=intelligence${taskParam}`);
    } else if (taskId) {
      navigate("/tasks");
    } else if (projectId) {
      navigate(`/projects?projectId=${projectId}`);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          const nextState = !isOpen;
          setIsOpen(nextState);
          if (nextState) void fetchNotificationsList();
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:-translate-y-0.5 hover:bg-white hover:text-[var(--color-text)] hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"
      >
        <FiBell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--color-peach)] px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification center"
          className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[var(--color-peach)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-peach)]">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              >
                <FiCheck size={13} />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[380px] divide-y divide-[var(--color-border)] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="space-y-2 p-8 text-center text-xs text-[var(--color-text-muted)]">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-canvas-soft)] text-[var(--color-text-subtle)]">
                  <FiCheckCircle size={20} />
                </div>
                <p className="font-medium text-[var(--color-text)]">All caught up!</p>
                <p>You have no recent notifications.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const severity = getSeverityBadge(notification.severity);
                const isRead = isNotificationRead(notification);
                const projectId = notificationProjectId(notification);
                const taskId = notificationTaskId(notification);

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleItemClick(notification)}
                    className={`group relative flex cursor-pointer items-start gap-3 p-3.5 transition hover:bg-[var(--color-surface-muted)] ${
                      isRead ? "bg-[var(--color-surface)] opacity-75" : "bg-blue-50/20"
                    }`}
                  >
                    <div className="mt-0.5">{severity.icon}</div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-[var(--color-text)]">
                          {notification.title || "Notification"}
                        </p>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-text-subtle)]">
                          <FiClock size={10} />
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                        {notification.message}
                      </p>
                      {(projectId || taskId) && (
                        <div className="flex items-center gap-2 pt-0.5 text-[10px] text-[var(--color-text-subtle)]">
                          {projectId && (
                            <span className="rounded bg-[var(--color-canvas-soft)] px-1.5 py-0.5 font-medium">
                              Project
                            </span>
                          )}
                          {taskId && (
                            <span className="rounded bg-[var(--color-canvas-soft)] px-1.5 py-0.5 font-medium">
                              Task
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {!isRead && (
                      <button
                        type="button"
                        title="Mark as read"
                        aria-label="Mark notification as read"
                        onClick={(event) => handleMarkOneRead(event, notification.id)}
                        className="shrink-0 rounded-md p-1 text-[var(--color-text-subtle)] transition hover:bg-white hover:text-[var(--color-brand)]"
                      >
                        <span className={`block h-2 w-2 rounded-full ${severity.dotClass}`} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
