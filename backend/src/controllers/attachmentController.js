import attachmentService from "../services/attachmentService.js";
import path from "path";

export const uploadTaskAttachment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file was uploaded.",
      });
    }

    const attachment = await attachmentService.createTaskAttachment({
      taskId,
      uploadedBy: userId,
      userRole,
      file,
    });

    return res.status(201).json({
      success: true,
      data: attachment,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to upload task attachment.",
    });
  }
};

export const getTaskAttachments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const attachments = await attachmentService.getTaskAttachments(
      taskId,
      userId,
      userRole
    );

    return res.status(200).json({
      success: true,
      data: attachments,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch task attachments.",
    });
  }
};

export const uploadProjectAttachment = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file was uploaded.",
      });
    }

    const attachment = await attachmentService.createProjectAttachment({
      projectId,
      uploadedBy: userId,
      userRole,
      file,
    });

    return res.status(201).json({
      success: true,
      data: attachment,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to upload project attachment.",
    });
  }
};

export const getProjectAttachments = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const attachments = await attachmentService.getProjectAttachments(
      projectId,
      userId,
      userRole
    );

    return res.status(200).json({
      success: true,
      data: attachments,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch project attachments.",
    });
  }
};

export const getAttachmentMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const attachment = await attachmentService.getAttachmentById(
      id,
      userId,
      userRole
    );

    return res.status(200).json({
      success: true,
      data: attachment,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch attachment metadata.",
    });
  }
};

export const downloadAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const fileInfo = await attachmentService.getAttachmentFileStream(
      id,
      userId,
      userRole
    );

    // Set download headers with sanitized filename
    const safeDownloadName = path.basename(fileInfo.fileName);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeDownloadName)}"`
    );
    res.setHeader("Content-Type", fileInfo.fileType || "application/octet-stream");

    if (fileInfo.buffer) {
      return res.send(fileInfo.buffer);
    }

    return res.sendFile(fileInfo.filePath);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to download attachment.",
    });
  }
};

export const deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const result = await attachmentService.deleteAttachment(
      id,
      userId,
      userRole
    );

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete attachment.",
    });
  }
};

export default {
  uploadTaskAttachment,
  getTaskAttachments,
  uploadProjectAttachment,
  getProjectAttachments,
  getAttachmentMetadata,
  downloadAttachment,
  deleteAttachment,
};
