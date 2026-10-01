import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    getNotifications,
    markAsRead,
    markAllRead
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/notifications", authMiddleware, getNotifications);
router.patch("/notifications/read-all", authMiddleware, markAllRead);
router.patch("/notifications/:id/read", authMiddleware, markAsRead);

export default router;
