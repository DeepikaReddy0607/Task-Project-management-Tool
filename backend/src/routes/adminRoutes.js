/**
 * Admin Routes (Phase 15)
 * 
 * Strict Server-Side RBAC Guard:
 * All routes are guarded by authMiddleware + requireAdmin.
 */

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";
import {
    getOverviewController,
    getUsersController,
    getUserByIdController,
    updateUserRoleController,
    updateUserStatusController,
    getWorkspacesController,
    getWorkspaceByIdController,
    getProjectsController,
    getProjectByIdController,
    getActivityController
} from "../controllers/adminController.js";

const router = express.Router();

// Apply authentication and administrator authorization to all admin endpoints
router.use(authMiddleware, requireAdmin);

// Administrative Overview
router.get("/overview", getOverviewController);

// User Management
router.get("/users", getUsersController);
router.get("/users/:id", getUserByIdController);
router.patch("/users/:id/role", updateUserRoleController);
router.patch("/users/:id/status", updateUserStatusController);

// Workspace Administration
router.get("/workspaces", getWorkspacesController);
router.get("/workspaces/:id", getWorkspaceByIdController);

// Projects System Overview
router.get("/projects", getProjectsController);
router.get("/projects/:id", getProjectByIdController);

// System Activity & Audit Logs
router.get("/activity", getActivityController);

export default router;
