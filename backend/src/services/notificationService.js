import prisma from "../config/prisma.js";

const createNotification = async ({
    userId,
    type,
    message,
    relatedEntityType = null,
    relatedEntityId = null
}) => {
    const notification = await prisma.notifications.create({
        data: {
            user_id: userId,
            type,
            message,
            related_entity_type: relatedEntityType,
            related_entity_id: relatedEntityId
        }
    });

    return notification;
};

const getUserNotifications = async (userId) => {
    const notifications = await prisma.notifications.findMany({
        where: {
            user_id: userId
        },
        orderBy: {
            created_at: "desc"
        }
    });

    return notifications;
};

const getUnreadCount = async (userId) => {
    const count = await prisma.notifications.count({
        where: {
            user_id: userId,
            is_read: false
        }
    });

    return count;
};

const markAsRead = async (notificationId, userId) => {
    const notification = await prisma.notifications.findFirst({
        where: {
            id: notificationId,
            user_id: userId
        }
    });

    if (!notification) {
        throw new Error("Notification not found");
    }

    const updatedNotification = await prisma.notifications.update({
        where: {
            id: notificationId
        },
        data: {
            is_read: true
        }
    });

    return updatedNotification;
};

const markAllAsRead = async (userId) => {
    const result = await prisma.notifications.updateMany({
        where: {
            user_id: userId,
            is_read: false
        },
        data: {
            is_read: true
        }
    });

    return result;
};

export {
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
};