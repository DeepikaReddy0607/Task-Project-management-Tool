import { useState, useEffect, useRef, useCallback } from "react";
import { FiBell, FiCheck, FiCheckCircle, FiAlertTriangle, FiAlertCircle, FiInfo, FiClock, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from "../../services/api/notificationApi";
import { useSocketEvent } from "../../context/SocketContext";

function formatRelativeTime(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

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
                icon: <FiAlertCircle className="text-red-500 shrink-0" size={16} />,
                badgeClass: "bg-red-50 text-red-700 border-red-200",
                dotClass: "bg-red-500"
            };
        case "HIGH":
            return {
                icon: <FiAlertCircle className="text-amber-600 shrink-0" size={16} />,
                badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
                dotClass: "bg-amber-600"
            };
        case "WARNING":
            return {
                icon: <FiAlertTriangle className="text-orange-500 shrink-0" size={16} />,
                badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
                dotClass: "bg-orange-500"
            };
        case "INFO":
        default:
            return {
                icon: <FiInfo className="text-blue-500 shrink-0" size={16} />,
                badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
                dotClass: "bg-blue-500"
            };
    }
}

function NotificationBell() {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const dropdownRef = useRef(null);

    // Fetch notifications
    const fetchNotificationsList = useCallback(async () => {
        try {
            setIsLoading(true);
            const token = localStorage.getItem("taskflow_token");
            if (!token) return;

            const res = await getNotifications({ limit: 15 });
            if (res.success) {
                setNotifications(res.notifications || []);
                setUnreadCount(res.unreadCount || 0);
            }
        } catch (err) {
            console.warn("Failed to load notifications:", err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNotificationsList();
    }, [fetchNotificationsList]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    // Real-time listener for incoming notification.created
    useSocketEvent("notification.created", (payload) => {
        const newNotif = payload?.data?.notification || payload?.notification;
        if (!newNotif) return;

        setNotifications((prev) => {
            // Avoid duplicate in state
            if (prev.some((n) => n.id === newNotif.id || (n.dedupeKey && n.dedupeKey === newNotif.dedupeKey))) {
                return prev;
            }
            return [newNotif, ...prev];
        });
        setUnreadCount((c) => c + 1);
    });

    const handleMarkOneRead = async (e, id) => {
        e.stopPropagation();
        try {
            const res = await markNotificationAsRead(id);
            if (res.success) {
                setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
                );
                setUnreadCount(res.unreadCount);
            }
        } catch (err) {
            console.warn("Failed to mark notification as read:", err.message);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            const res = await markAllNotificationsAsRead();
            if (res.success) {
                setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                setUnreadCount(0);
            }
        } catch (err) {
            console.warn("Failed to mark all notifications as read:", err.message);
        }
    };

    const handleItemClick = (notif) => {
        if (!notif.isRead) {
            markNotificationAsRead(notif.id).then((res) => {
                if (res.success) {
                    setNotifications((prev) =>
                        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
                    );
                    setUnreadCount(res.unreadCount);
                }
            }).catch(() => {});
        }

        setIsOpen(false);

        if (notif.taskId) {
            navigate("/tasks");
        } else if (notif.projectId) {
            navigate(`/projects/${notif.projectId}`);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => {
                    const nextState = !isOpen;
                    setIsOpen(nextState);
                    if (nextState) {
                        fetchNotificationsList();
                    }
                }}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                aria-expanded={isOpen}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:-translate-y-0.5 hover:bg-white hover:text-[var(--color-text)] hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"
            >
                <FiBell size={19} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--color-peach)] px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Notification center"
                    className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] backdrop-blur-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 bg-[var(--color-canvas-soft)]">
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

                    {/* Notification List */}
                    <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--color-border)]">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-xs text-[var(--color-text-muted)] space-y-2">
                                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-canvas-soft)] text-[var(--color-text-subtle)]">
                                    <FiCheckCircle size={20} />
                                </div>
                                <p className="font-medium text-[var(--color-text)]">All caught up!</p>
                                <p>You have no recent notifications.</p>
                            </div>
                        ) : (
                            notifications.map((notif) => {
                                const sev = getSeverityBadge(notif.severity);
                                return (
                                    <div
                                        key={notif.id}
                                        onClick={() => handleItemClick(notif)}
                                        className={`group relative flex items-start gap-3 p-3.5 transition cursor-pointer hover:bg-[var(--color-surface-muted)] ${
                                            notif.isRead ? "opacity-75 bg-[var(--color-surface)]" : "bg-blue-50/20"
                                        }`}
                                    >
                                        <div className="mt-0.5">{sev.icon}</div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-semibold text-[var(--color-text)] truncate">
                                                    {notif.title || "Notification"}
                                                </p>
                                                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-subtle)] shrink-0">
                                                    <FiClock size={10} />
                                                    {formatRelativeTime(notif.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2">
                                                {notif.message}
                                            </p>
                                            {(notif.projectTitle || notif.taskTitle) && (
                                                <div className="flex items-center gap-2 pt-0.5 text-[10px] text-[var(--color-text-subtle)]">
                                                    {notif.projectTitle && (
                                                        <span className="rounded bg-[var(--color-canvas-soft)] px-1.5 py-0.5 font-medium truncate max-w-[140px]">
                                                            📁 {notif.projectTitle}
                                                        </span>
                                                    )}
                                                    {notif.taskTitle && (
                                                        <span className="rounded bg-[var(--color-canvas-soft)] px-1.5 py-0.5 font-medium truncate max-w-[140px]">
                                                            ✓ {notif.taskTitle}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {!notif.isRead && (
                                            <button
                                                type="button"
                                                title="Mark as read"
                                                onClick={(e) => handleMarkOneRead(e, notif.id)}
                                                className="shrink-0 p-1 rounded-md text-[var(--color-text-subtle)] transition hover:bg-white hover:text-[var(--color-brand)]"
                                            >
                                                <span className="h-2 w-2 rounded-full bg-[var(--color-brand)] block" />
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
