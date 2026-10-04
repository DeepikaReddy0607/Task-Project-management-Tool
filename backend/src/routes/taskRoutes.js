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
    updateStatus,
    getPrioritized
} from "../controllers/taskController.js";

import {
    createDependencyHandler,
    deleteDependencyHandler,
    getTaskDependenciesHandler
} from "../controllers/taskDependencyController.js";



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

// Get prioritized tasks (Smart Task Prioritization)
router.get(
    "/tasks/prioritized",
    authMiddleware,
    getPrioritized
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

// Task Dependencies (Phase 13)
router.post(
    "/tasks/:taskId/dependencies",
    authMiddleware,
    createDependencyHandler
);

router.get(
    "/tasks/:taskId/dependencies",
    authMiddleware,
    getTaskDependenciesHandler
);

router.delete(
    "/tasks/:taskId/dependencies/:dependsOnTaskId",
    authMiddleware,
    deleteDependencyHandler
);

router.delete(
    "/tasks/:taskId/dependencies",
    authMiddleware,
    deleteDependencyHandler
);

// Task Dependencies (Phase 13)
router.post(
    "/tasks/:taskId/dependencies",
    authMiddleware,
    createDependencyHandler
);

router.get(
    "/tasks/:taskId/dependencies",
    authMiddleware,
    getTaskDependenciesHandler
);

router.delete(
    "/tasks/:taskId/dependencies/:dependsOnTaskId",
    authMiddleware,
    deleteDependencyHandler
);

router.delete(
    "/tasks/:taskId/dependencies",
    authMiddleware,
    deleteDependencyHandler
);

export default router;

