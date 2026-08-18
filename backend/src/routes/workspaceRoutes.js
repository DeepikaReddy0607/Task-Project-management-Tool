import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    create,
    getAll,
    getOne
} from "../controllers/workspaceController.js";

const router = express.Router();

// Create workspace
router.post("/", authMiddleware, create);
// Get workspaces for logged-in user
router.get("/", authMiddleware, getAll);
// Get a single workspace
router.get("/:id", authMiddleware, getOne);

export default router;