import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    getCalendar,
} from "../controllers/calendarController.js";

const router = express.Router();

router.get("/", authMiddleware, getCalendar);

export default router;