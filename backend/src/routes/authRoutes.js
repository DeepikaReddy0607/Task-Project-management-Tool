import express from "express";

import {
    register,
    login,
    forgotPassword,
    reset,
    changePassword
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/register", register);

router.post("/login", login);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", reset);

router.post(
  "/change-password",
  authMiddleware,
  changePassword
);

export default router;