import {
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from "../services/quackieAlertService.js";

export const getNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page, limit, unreadOnly } = req.query;

        const result = await getUserNotifications({
            userId,
            page,
            limit,
            unreadOnly: unreadOnly === "true" || unreadOnly === true
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error("Get notifications error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch notifications.",
            error: error.message
        });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Notification ID is required."
            });
        }

        const result = await markNotificationAsRead({
            notificationId: id,
            userId
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error("Mark notification as read error:", error);
        const status = error.message.includes("not found") || error.message.includes("access denied") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to mark notification as read."
        });
    }
};

export const markAllRead = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await markAllNotificationsAsRead({ userId });

        return res.status(200).json(result);
    } catch (error) {
        console.error("Mark all notifications as read error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to mark all notifications as read.",
            error: error.message
        });
    }
};
