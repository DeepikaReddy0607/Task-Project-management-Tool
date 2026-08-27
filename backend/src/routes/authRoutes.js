import express from "express";
import {
    register,
    login,
    forgotPasswordController,
    resetPasswordController
} from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);

export default router;