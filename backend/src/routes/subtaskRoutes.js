import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    create,
    getAll,
    getOne,
    update,
    updateStatus,
    remove
} from "../controllers/subtaskController.js";


const router = express.Router();


// Create a subtask inside a task
router.post(
    "/tasks/:taskId/subtasks",
    authMiddleware,
    create
);

// Get all subtasks for a task
router.get(
    "/tasks/:taskId/subtasks",
    authMiddleware,
    getAll
);

// Get a single subtask
router.get(
    "/subtasks/:id",
    authMiddleware,
    getOne
);

// Update a subtask
router.patch(
    "/subtasks/:id",
    authMiddleware,
    update
);

// Update subtask status
router.patch(
    "/subtasks/:id/status",
    authMiddleware,
    updateStatus
);

// Delete a subtask
router.delete(
    "/subtasks/:id",
    authMiddleware,
    remove
);

export default router;