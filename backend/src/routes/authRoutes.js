import express from "express";

import {
    register,
    verifyRegistrationOtp,
    resendRegistrationOtp,
    login,
    forgotPassword,
    reset,
    changePassword
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    registerRateLimiter,
    registerEmailRateLimiter,
    loginRateLimiter,
    loginAccountRateLimiter,
    forgotPasswordRateLimiter,
    otpVerifyRateLimiter,
    otpResendRateLimiter
} from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/register", registerRateLimiter, registerEmailRateLimiter, register);

router.post("/verify-registration-otp", otpVerifyRateLimiter, verifyRegistrationOtp);

router.post("/resend-registration-otp", otpResendRateLimiter, resendRegistrationOtp);

router.post("/login", loginRateLimiter, loginAccountRateLimiter, login);

router.post("/forgot-password", forgotPasswordRateLimiter, forgotPassword);

router.post("/reset-password", reset);

router.post(
  "/change-password",
  authMiddleware,
  changePassword
);

export default router;