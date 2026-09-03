import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    create,
    getAll,
    getOne,
    update,
    assign,
    archive,
    getMine,
    updateStatus
} from "../controllers/taskController.js";


const router = express.Router();


// Create a task inside a project
router.post(
    "/projects/:projectId/tasks",
    authMiddleware,
    create
);

// Get active tasks in a project
router.get(
    "/projects/:projectId/tasks",
    authMiddleware,
    getAll
);

// Get tasks assigned to current user
router.get(
    "/tasks/my-tasks",
    authMiddleware,
    getMine
);

// Get a single task
router.get(
    "/tasks/:id",
    authMiddleware,
    getOne
);

// Update a task
router.patch(
    "/tasks/:id",
    authMiddleware,
    update
);

// Assign a task to a project member
router.patch(
    "/tasks/:id/assign",
    authMiddleware,
    assign
);

// Archive a task
router.patch(
    "/tasks/:id/archive",
    authMiddleware,
    archive
);

// Update task status
router.patch(
    "/tasks/:id/status",
    authMiddleware,
    updateStatus
);

export default router;