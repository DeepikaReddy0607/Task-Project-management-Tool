import api from "./axios";

/**
 * Fetch notifications for authenticated user
 * @param {Object} params - { page, limit, unreadOnly }
 */
export const getNotifications = async (params = {}) => {
    const response = await api.get("/notifications", { params });
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
