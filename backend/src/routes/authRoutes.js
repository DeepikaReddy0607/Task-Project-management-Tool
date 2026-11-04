import express from "express";

import {
    register,
    login,
    forgotPassword,
    reset,
    changePassword
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    registerRateLimiter,
    loginRateLimiter,
    forgotPasswordRateLimiter
} from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/register", registerRateLimiter, register);

router.post("/login", loginRateLimiter, login);

router.post("/forgot-password", forgotPasswordRateLimiter, forgotPassword);

router.post("/reset-password", reset);

router.post(
  "/change-password",
  authMiddleware,
  changePassword
);

export default router;