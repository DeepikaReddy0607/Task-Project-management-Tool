import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    getTaskCompletionReport,
    getPendingOverdueReport,
    getPriorityReport,
    getStatusReport,
    getDashboardReport
} from "../controllers/reportController.js";

const router = express.Router();

router.get(
    "/task-completion",
    authMiddleware,
    getTaskCompletionReport
);

router.get(
    "/pending-overdue",
    authMiddleware,
    getPendingOverdueReport
);

router.get(
    "/by-priority",
    authMiddleware,
    getPriorityReport
);

router.get(
    "/by-status",
    authMiddleware,
    getStatusReport
);

router.get(
    "/dashboard",
    authMiddleware,
    getDashboardReport
);

export default router;