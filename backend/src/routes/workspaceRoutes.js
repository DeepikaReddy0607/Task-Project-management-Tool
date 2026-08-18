import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    create
} from "../controllers/workspaceController.js";

const router = express.Router();

// Create workspace
router.post("/", authMiddleware, create);

export default router;