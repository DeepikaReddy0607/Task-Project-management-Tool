import api from "./axios";

/**
 * Fetch notifications for authenticated user
 */
export const getNotifications = async () => {
    const response = await api.get("/notifications");
    return response.data;
};

/**
 * Fetch the unread notification count for the authenticated user.
 */
export const getUnreadNotificationCount = async () => {
    const response = await api.get("/notifications/unread-count");
    return response.data;
};

/**
 * Mark a single notification as read
 * @param {string} id - Notification UUID
 */
export const markNotificationAsRead = async (id) => {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
};

/**
 * Mark all notifications as read for current user
 */
export const markAllNotificationsAsRead = async () => {
    const response = await api.patch("/notifications/read-all");
    return response.data;
};
