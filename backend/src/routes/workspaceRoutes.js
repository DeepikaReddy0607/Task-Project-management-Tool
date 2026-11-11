import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    create,
    getAll,
    getOne,
    addMember,
    getMembers,
    removeMember,
    updateMemberRole,
    update,
    remove,
    archive,
    restore
} from "../controllers/workspaceController.js";

const router = express.Router();

// Create workspace
router.post("/", authMiddleware, create);

// Get workspaces for logged-in user
router.get("/", authMiddleware, getAll);

// Get a single workspace
router.get("/:id", authMiddleware, getOne);

// Update workspace details
router.patch("/:id", authMiddleware, update);

// Archive workspace
router.patch("/:id/archive", authMiddleware, archive);
router.post("/:id/archive", authMiddleware, archive);

// Restore workspace
router.patch("/:id/restore", authMiddleware, restore);
router.post("/:id/restore", authMiddleware, restore);

// Delete workspace (permanent)
router.delete("/:id", authMiddleware, remove);

// Add a member to a workspace
router.post("/:id/members", authMiddleware, addMember);

// Get workspace members
router.get("/:id/members", authMiddleware, getMembers);

// Remove a member from a workspace
router.delete("/:id/members/:userId", authMiddleware, removeMember);

// Update workspace member role
router.patch(
    "/:id/members/:userId",
    authMiddleware,
    updateMemberRole
);

// ============================================================
// PHASE 5: WORKSPACE PORTFOLIO INTELLIGENCE
// ============================================================
import {
    getPortfolio,
    getCrossProject,
    getResourceConflictsController,
    getPortfolioRiskMapController,
    simulatePortfolioScenarioController
} from "../controllers/projectController.js";

router.get("/:workspaceId/intelligence/portfolio", authMiddleware, getPortfolio);
router.get("/:id/intelligence/portfolio", authMiddleware, getPortfolio);

router.get("/:workspaceId/intelligence/cross-project", authMiddleware, getCrossProject);
router.get("/:id/intelligence/cross-project", authMiddleware, getCrossProject);

router.get("/:workspaceId/intelligence/resource-conflicts", authMiddleware, getResourceConflictsController);
router.get("/:id/intelligence/resource-conflicts", authMiddleware, getResourceConflictsController);

router.get("/:workspaceId/intelligence/risk-map", authMiddleware, getPortfolioRiskMapController);
router.get("/:id/intelligence/risk-map", authMiddleware, getPortfolioRiskMapController);

router.post("/:workspaceId/intelligence/simulate", authMiddleware, simulatePortfolioScenarioController);
router.post("/:id/intelligence/simulate", authMiddleware, simulatePortfolioScenarioController);

// ============================================================
// PHASE 6: WORKSPACE COORDINATION & EXECUTIVE BRIEFING
// ============================================================
import {
    getWorkspaceBriefingController,
    getWorkspaceCoordinationController,
    getWorkspaceApprovalsController,
    getWorkspaceActionsController
} from "../controllers/projectController.js";

router.get("/:workspaceId/intelligence/briefing", authMiddleware, getWorkspaceBriefingController);
router.get("/:id/intelligence/briefing", authMiddleware, getWorkspaceBriefingController);

router.get("/:workspaceId/intelligence/coordination", authMiddleware, getWorkspaceCoordinationController);
router.get("/:id/intelligence/coordination", authMiddleware, getWorkspaceCoordinationController);

router.get("/:workspaceId/intelligence/approvals", authMiddleware, getWorkspaceApprovalsController);
router.get("/:id/intelligence/approvals", authMiddleware, getWorkspaceApprovalsController);

router.get("/:workspaceId/intelligence/actions", authMiddleware, getWorkspaceActionsController);
router.get("/:id/intelligence/actions", authMiddleware, getWorkspaceActionsController);

export default router;