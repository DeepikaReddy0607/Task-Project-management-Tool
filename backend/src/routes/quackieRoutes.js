import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    chat,
    getContext,
    getOverdue,
    getRecommendation,
    getFocusMission,
    getSummary,
    getBlockers,
    parseProposal,
    getProjectRisk,
    getXRay,
    simulate
} from "../controllers/quackieController.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/chat", chat);
router.get("/context", getContext);
router.get("/overdue", getOverdue);
router.get("/recommendation", getRecommendation);
router.get("/focus", getFocusMission);
router.get("/projects/:projectId/summary", getSummary);
router.get("/projects/:projectId/blockers", getBlockers);
router.get("/projects/:projectId/risk", getProjectRisk);
router.get("/risk", getProjectRisk);
router.get("/projects/:projectId/xray", getXRay);
router.get("/xray", getXRay);
router.post("/projects/:projectId/simulate", simulate);
router.post("/simulate", simulate);
router.post("/proposal", parseProposal);

export default router;
