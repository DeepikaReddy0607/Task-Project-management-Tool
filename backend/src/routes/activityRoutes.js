import express from "express";
import { getAll } from "../controllers/activityController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
    "/workspaces/:workspaceId/activities",
    authMiddleware,
    getAll
);

export default router;