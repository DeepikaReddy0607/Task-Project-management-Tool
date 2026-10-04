/**
 * Search Routes (Phase 16)
 * 
 * Provides authenticated, permission-aware global search endpoints.
 */

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { searchController } from "../controllers/searchController.js";

const router = express.Router();

router.get("/", authMiddleware, searchController);

export default router;
