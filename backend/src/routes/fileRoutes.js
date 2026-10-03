import express from "express";
import upload from "../middleware/uploadMiddleware.js";

import {
  uploadTaskFile,
  uploadProjectFile,
  getTaskFiles,
  getProjectFiles,
  deleteFile,
} from "../controllers/fileController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Task files
router.post(
  "/tasks/:taskId/files",
  authMiddleware,
  upload.single("file"),
  uploadTaskFile
);

router.get(
  "/tasks/:taskId/files",
  authMiddleware,
  getTaskFiles
);

// Project files
router.post(
  "/projects/:projectId/files",
  authMiddleware,
  upload.single("file"),
  uploadProjectFile
);

router.get(
  "/projects/:projectId/files",
  authMiddleware,
  getProjectFiles
);

// Delete file
router.delete(
  "/files/:fileId",
  authMiddleware,
  deleteFile
);

export default router;