import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getProductivity } from "../controllers/productivityController.js";

const router = express.Router();

router.get("/productivity", authMiddleware, getProductivity);

export default router;
