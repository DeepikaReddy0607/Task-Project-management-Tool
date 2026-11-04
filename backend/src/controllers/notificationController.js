import {
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
} from "../services/notificationService.js";

const createNotificationController = async (req, res, next) => {
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
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        if (error.message?.includes("Invalid notification type")) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        console.error("Create notification error:", error);
        if (typeof next === "function") {
            return next(error);
        }
        return res.status(500).json({
            success: false,
            message: "Failed to create notification"
        });
    }
};

const getNotificationsController = async (req, res, next) => {
    try {
        const userId = req.user.userId || req.user.id;
        const page = req.query.page;
        const limit = req.query.limit;

        const result = await getUserNotifications(userId, { page, limit });

        return res.status(200).json({
            success: true,
            data: result.notifications,
            notifications: result.notifications,
            pagination: result.pagination
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        console.error("Get notifications error:", error);
        if (typeof next === "function") {
            return next(error);
        }
        return res.status(500).json({
            success: false,
            message: "Failed to fetch notifications"
        });
    }
};

const getUnreadCountController = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const count =
            await getUnreadCount(userId);

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
        const userId = req.user.userId || req.user.id;
        const notification =
            await markAsRead(
                req.params.id,
                userId
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
        const userId = req.user.userId || req.user.id;
        const result =
            await markAllAsRead(userId);

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