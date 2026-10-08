import {
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
} from "../services/notificationService.js";

const createNotificationController = async (req, res) => {
    try {
        const {
            userId,
            type,
            message,
            relatedEntityType,
            relatedEntityId
        } = req.body;

        if (!userId || !type || !message) {
            return res.status(400).json({
                success: false,
                message: "userId, type and message are required"
            });
        }

        const notification = await createNotification({
            userId,
            type,
            message,
            relatedEntityType,
            relatedEntityId
        });

        return res.status(201).json({
            success: true,
            message: "Notification created successfully",
            data: notification
        });
    } catch (error) {
        console.error("Create notification error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create notification",
            error: error.message
        });
    }
};

const getNotificationsController = async (req, res) => {
    try {
        const notifications =
            await getUserNotifications(req.user.id);

        return res.status(200).json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error("Get notifications error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch notifications",
            error: error.message
        });
    }
};

const getUnreadCountController = async (req, res) => {
    try {
        const count =
            await getUnreadCount(req.user.id);

        return res.status(200).json({
            success: true,
            unreadCount: count
        });
    } catch (error) {
        console.error("Get unread count error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get unread notification count",
            error: error.message
        });
    }
};

const markAsReadController = async (req, res) => {
    try {
        const notification =
            await markAsRead(
                req.params.id,
                req.user.id
            );

        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            data: notification
        });
    } catch (error) {
        console.error(
            "Mark notification as read error:",
            error
        );

        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

const markAllAsReadController = async (req, res) => {
    try {
        const result =
            await markAllAsRead(req.user.id);

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read",
            updatedCount: result.count
        });
    } catch (error) {
        console.error(
            "Mark all notifications as read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to mark all notifications as read",
            error: error.message
        });
    }
};

export {
    createNotificationController,
    getNotificationsController,
    getUnreadCountController,
    markAsReadController,
    markAllAsReadController
};