import express from "express";
import verifyToken from "../middleware/authMiddleware.js";
import {
    getPreferencesController,
    updatePreferencesController,
    resetPreferencesController,
} from "../controllers/preferenceController.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getPreferencesController);
router.patch("/", updatePreferencesController);
router.post("/reset", resetPreferencesController);

export default router;
