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
    update
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

export default router;