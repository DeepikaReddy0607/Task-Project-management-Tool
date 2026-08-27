import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import uploadProfilePicture from "../config/upload.js";

import {
    getProfile,
    updateProfile,
    changeUserPassword
} from "../controllers/userController.js";

const router = express.Router();

router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, uploadProfilePicture.single("profilePicture"), updateProfile);
router.put(
    "/change-password",
    authMiddleware,
    changeUserPassword
);

export default router;