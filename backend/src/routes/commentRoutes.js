import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    create,
    getAll,
    update,
    remove
} from "../controllers/commentController.js";


const router = express.Router();


// Create a comment on a task
router.post(
    "/tasks/:taskId/comments",
    authMiddleware,
    create
);


// Get all comments for a task
router.get(
    "/tasks/:taskId/comments",
    authMiddleware,
    getAll
);


// Update own comment
router.put(
    "/comments/:id",
    authMiddleware,
    update
);


// Delete own comment
router.delete(
    "/comments/:id",
    authMiddleware,
    remove
);


export default router;