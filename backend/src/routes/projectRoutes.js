import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    create, 
    getAll, 
    getOne, 
    update, 
    archive, 
    addMember
} from "../controllers/projectController.js";

const router = express.Router();

// Create a project inside a workspace
router.post(
    "/workspaces/:workspaceId/projects",
    authMiddleware,
    create
);

// Get active projects in a workspace
router.get(
    "/workspaces/:workspaceId/projects",
    authMiddleware,
    getAll
);

// Get a single project
router.get(
    "/projects/:id",
    authMiddleware,
    getOne
);

// Update a project
router.patch(
    "/projects/:id",
    authMiddleware,
    update
);

// Archive a project
router.patch(
    "/projects/:id/archive",
    authMiddleware,
    archive
);

// Add a member to a project
router.post(
    "/projects/:id/members",
    authMiddleware,
    addMember
);

export default router;