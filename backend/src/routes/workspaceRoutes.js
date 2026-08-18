import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    create,
    getAll
} from "../controllers/workspaceController.js";

const router = express.Router();

// Create workspace
router.post("/", authMiddleware, create);
// Get workspaces for logged-in user
router.get("/", authMiddleware, getAll);

export default router;