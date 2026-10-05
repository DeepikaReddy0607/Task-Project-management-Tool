import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadSingleAttachment } from "../middleware/uploadMiddleware.js";
import {
  uploadTaskAttachment,
  getTaskAttachments,
  uploadProjectAttachment,
  getProjectAttachments,
  getAttachmentMetadata,
  downloadAttachment,
  deleteAttachment,
} from "../controllers/attachmentController.js";

const router = express.Router();

// Task-level attachments
router.post(
  "/tasks/:taskId/attachments",
  authMiddleware,
  uploadSingleAttachment,
  uploadTaskAttachment
);

router.get(
  "/tasks/:taskId/attachments",
  authMiddleware,
  getTaskAttachments
);

// Project-level attachments
router.post(
  "/projects/:projectId/attachments",
  authMiddleware,
  uploadSingleAttachment,
  uploadProjectAttachment
);

router.get(
  "/projects/:projectId/attachments",
  authMiddleware,
  getProjectAttachments
);

// Direct attachment operations
router.get(
  "/attachments/:id",
  authMiddleware,
  getAttachmentMetadata
);

router.get(
  "/attachments/:id/download",
  authMiddleware,
  downloadAttachment
);

router.delete(
  "/attachments/:id",
  authMiddleware,
  deleteAttachment
);

export default router;
