import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";

import {
    createNotificationController,
    getNotificationsController,
    getUnreadCountController,
    markAsReadController,
    markAllAsReadController
} from "../controllers/notificationController.js";

const router = express.Router();

router.post(
    "/notifications",
    authMiddleware,
    createNotificationController
);

router.get(
    "/notifications",
    authMiddleware,
    getNotificationsController
);

router.get(
    "/notifications/unread-count",
    authMiddleware,
    getUnreadCountController
);

router.patch(
    "/notifications/:id/read",
    authMiddleware,
    markAsReadController
);

router.patch(
    "/notifications/read-all",
    authMiddleware,
    markAllAsReadController
);

export default router;