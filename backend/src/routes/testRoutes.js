import express from "express";
import authenticate from "../middleware/authMiddleware.js";
import authorizeRoles from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get(
    "/admin-test",
    authenticate,
    authorizeRoles("Admin"),
    (req, res) => {
        res.json({
            message: "RBAC test successful",
            user: req.user
        });
    }
);

export default router;