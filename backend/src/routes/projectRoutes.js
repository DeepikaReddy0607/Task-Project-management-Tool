import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    create, 
    getAll, 
    getOne, 
    update, 
    archive, 
    addMember,
    getMembers,
    updateMemberRole,
    removeMember
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

// Get project members

router.get(
    "/projects/:id/members",
    authMiddleware,
    getMembers
);

// Update project member role

router.patch(
    "/projects/:id/members/:userId",
    authMiddleware,
    updateMemberRole
);

// Remove project member

router.delete(
    "/projects/:id/members/:userId",
    authMiddleware,
    removeMember
);

export default router;