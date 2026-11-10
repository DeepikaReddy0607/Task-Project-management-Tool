import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    getProfile,
    updateProfile,
    completeOnboarding
} from "../controllers/userController.js";

const router = express.Router();

router.get(
    "/profile",
    authMiddleware,
    getProfile
);

router.patch(
    "/profile",
    authMiddleware,
    updateProfile
);

router.post(
    "/onboarding/complete",
    authMiddleware,
    completeOnboarding
);

export default router;
