import prisma from "../config/prisma.js";

/**
 * Valid notification types explicitly permitted by PostgreSQL check constraint `chk_notification_type`
 */
export const VALID_NOTIFICATION_TYPES = Object.freeze([
    "assignment",
    "due_date",
    "comment",
    "update",
    "TASK_OVERDUE",
    "TASK_BLOCKED",
    "HIGH_RISK_PROJECT",
    "DEADLINE_WARNING",
    "PRIORITY_SHIFT",
    "NEW_CRITICAL_TASK"
]);

/**
 * Normalization map bridging internal uppercase/event names to valid database constraint types
 */
export const NOTIFICATION_TYPE_MAP = Object.freeze({
    // Direct audit mappings
    "NEW_COMMENT": "comment",
    "TASK_ASSIGNED": "assignment",
    "PROJECT_UPDATED": "update",
    "DUE_DATE_APPROACHING": "due_date",

    // Common event aliases
    "COMMENT_ADDED": "comment",
    "TASK_DUE_SOON": "due_date",
    "PROJECT_MEMBER_ADDED": "update",
    "TASK_STATUS_UPDATED": "update",
    "TASK_STATUS_CHANGED": "update",
    "ASSIGNMENT": "assignment",
    "COMMENT": "comment",
    "DUE_DATE": "due_date",
    "UPDATE": "update"
});

/**
 * Normalizes a raw notification type to a valid database notification type.
 * Returns null if the type cannot be mapped or validated.
 */
export const normalizeNotificationType = (rawType) => {
    if (!rawType || typeof rawType !== "string") {
        return null;
    }
    const trimmed = rawType.trim();

    // 1. Direct match in allowed database types
    if (VALID_NOTIFICATION_TYPES.includes(trimmed)) {
        return trimmed;
    }

    // 2. Direct map lookup
    if (NOTIFICATION_TYPE_MAP[trimmed]) {
        return NOTIFICATION_TYPE_MAP[trimmed];
    }

    // 3. Case-insensitive lookup against map
    const upper = trimmed.toUpperCase();
    if (NOTIFICATION_TYPE_MAP[upper]) {
        return NOTIFICATION_TYPE_MAP[upper];
    }

    // 4. Lowercase check against allowed lowercase DB types
    const lower = trimmed.toLowerCase();
    if (VALID_NOTIFICATION_TYPES.includes(lower)) {
        return lower;
    }

    // 5. Uppercase check against allowed uppercase DB types (e.g. TASK_OVERDUE)
    if (VALID_NOTIFICATION_TYPES.includes(upper)) {
        return upper;
    }

    return null;
};

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

        const normalized = normalizeNotificationType(type) || type;

        switch (normalized) {
            case "assignment":
            case "TASK_ASSIGNED":
                return Boolean(pref.task_assignments);
            case "TASK_STATUS_UPDATED":
            case "TASK_STATUS_CHANGED":
                return Boolean(pref.task_status_updates);
            case "comment":
            case "NEW_COMMENT":
            case "COMMENT_ADDED":
            case "MENTION":
                return Boolean(pref.mentions_and_comments);
            case "due_date":
            case "DUE_DATE_APPROACHING":
            case "TASK_DUE_SOON":
            case "TASK_OVERDUE":
            case "DEADLINE_WARNING":
                return Boolean(pref.deadline_reminders);
            case "update":
            case "PROJECT_UPDATED":
            case "PROJECT_MEMBER_ADDED":
            case "PRIORITY_SHIFT":
                return Boolean(pref.project_updates);
            case "TASK_BLOCKED":
            case "HIGH_RISK_PROJECT":
            case "NEW_CRITICAL_TASK":
            case "RISK_ALERT":
            case "RISK_CREATED":
                return Boolean(pref.risk_alerts);
            case "AI_RECOMMENDATION":
            case "AI_INSIGHT":
                return Boolean(pref.ai_recommendations_notif);
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
    const normalizedType = normalizeNotificationType(type);
    if (!normalizedType) {
        console.error("[NOTIFICATION_VALIDATION_ERROR] Invalid notification type rejected:", {
            userId,
            rawType: type,
            message,
            relatedEntityType,
            relatedEntityId
        });
        throw new Error(`Invalid notification type: ${type}`);
    }

    const allowed = await shouldDeliverNotification(userId, type);
    if (!allowed) {
        return null;
    }

    try {
        const notification = await prisma.notifications.create({
            data: {
                user_id: userId,
                type: normalizedType,
                message,
                related_entity_type: relatedEntityType,
                related_entity_id: relatedEntityId
            }
        });

        return notification;
    } catch (error) {
        console.error("[NOTIFICATION_INSERT_ERROR] Failed to persist notification:", {
            userId,
            type: normalizedType,
            message,
            error: error.message,
            code: error.code
        });
        throw error;
    }
};

const getUserNotifications = async (userId, { page = 1, limit = 20 } = {}) => {
    let pageNum = 1;
    let limitNum = 20;

    if (page !== undefined && page !== null && page !== "") {
        pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) {
            const error = new Error("Invalid page parameter. Must be a positive integer.");
            error.statusCode = 400;
            throw error;
        }
    }

    if (limit !== undefined && limit !== null && limit !== "") {
        limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            const error = new Error("Invalid limit parameter. Must be between 1 and 100.");
            error.statusCode = 400;
            throw error;
        }
    }

    const skip = (pageNum - 1) * limitNum;

    const [notifications, total] = await Promise.all([
        prisma.notifications.findMany({
            where: {
                user_id: userId
            },
            orderBy: {
                created_at: "desc"
            },
            skip,
            take: limitNum
        }),
        prisma.notifications.count({
            where: {
                user_id: userId
            }
        })
    ]);

    return {
        notifications,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1
        }
    };
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
