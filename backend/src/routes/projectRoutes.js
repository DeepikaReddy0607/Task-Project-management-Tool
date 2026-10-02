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
    removeMember,
    getRisk,
    getXRay,
    simulateProjectWhatIf,
    getCriticalPath,
    getBottlenecks
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

// Get project predictive risk analysis
router.get(
    "/projects/:id/risk",
    authMiddleware,
    getRisk
);

// Get project X-Ray diagnostic
router.get(
    "/projects/:id/xray",
    authMiddleware,
    getXRay
);

// Get project critical path analysis
router.get(
    "/projects/:id/critical-path",
    authMiddleware,
    getCriticalPath
);

router.get(
    "/projects/:projectId/critical-path",
    authMiddleware,
    getCriticalPath
);

// Get project bottleneck intelligence
router.get(
    "/projects/:id/bottlenecks",
    authMiddleware,
    getBottlenecks
);

router.get(
    "/projects/:projectId/bottlenecks",
    authMiddleware,
    getBottlenecks
);

// Simulate What-If predictive scenario (READ-ONLY)
router.post(
    "/projects/:id/simulate",
    authMiddleware,
    simulateProjectWhatIf
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