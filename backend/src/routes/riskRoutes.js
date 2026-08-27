import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    create,
    getAll,
    update,
    close
} from "../controllers/riskController.js";

const router = express.Router();

// Create a risk for a project
router.post(
    "/projects/:projectId/risks",
    authMiddleware,
    create
);

// Get all risks for a project
router.get(
    "/projects/:projectId/risks",
    authMiddleware,
    getAll
);

// Update a risk
router.patch(
    "/risks/:id",
    authMiddleware,
    update
);

// Close a risk
router.patch(
    "/risks/:id/close",
    authMiddleware,
    close
);

export default router;