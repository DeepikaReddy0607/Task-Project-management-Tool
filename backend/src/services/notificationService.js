import prisma from "../config/prisma.js";

const shouldDeliverNotification = async (userId, type) => {
    try {
        const pref = await prisma.user_preferences.findUnique({
            where: { user_id: userId }
        });
        if (!pref) return true;

        if (!pref.in_app_notifications) return false;
        if (pref.dnd_enabled) return false;

        if (pref.quiet_hours_enabled && pref.quiet_hours_start && pref.quiet_hours_end) {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const [sh, sm] = pref.quiet_hours_start.split(":").map(Number);
            const [eh, em] = pref.quiet_hours_end.split(":").map(Number);
            const startMinutes = sh * 60 + sm;
            const endMinutes = eh * 60 + em;
            if (startMinutes <= endMinutes) {
                if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) return false;
            } else {
                if (currentMinutes >= startMinutes || currentMinutes <= endMinutes) return false;
            }
        }

        switch (type) {
            case "TASK_ASSIGNED":
                return pref.task_assignments;
            case "TASK_STATUS_UPDATED":
            case "TASK_STATUS_CHANGED":
                return pref.task_status_updates;
            case "COMMENT_ADDED":
            case "MENTION":
                return pref.mentions_and_comments;
            case "DUE_DATE_APPROACHING":
            case "TASK_DUE_SOON":
                return pref.deadline_reminders;
            case "PROJECT_UPDATED":
            case "PROJECT_MEMBER_ADDED":
                return pref.project_updates;
            case "RISK_ALERT":
            case "RISK_CREATED":
                return pref.risk_alerts;
            case "AI_RECOMMENDATION":
            case "AI_INSIGHT":
                return pref.ai_recommendations_notif;
            default:
                return true;
        }
    } catch {
        return true;
    }
};

const createNotification = async ({
    userId,
    type,
    message,
    relatedEntityType = null,
    relatedEntityId = null
}) => {
    const allowed = await shouldDeliverNotification(userId, type);
    if (!allowed) {
        return null;
    }

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
    markAllAsRead,
    shouldDeliverNotification,
};
