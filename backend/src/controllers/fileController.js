import fs from "fs";
import path from "path";
import prisma from "../config/prisma.js";

/**
 * Upload file to a task
 * POST /api/tasks/:taskId/files
 */
export const uploadTaskFile = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const task = await prisma.tasks.findUnique({
      where: {
        id: taskId,
      },
    });

    if (!task) {
      fs.unlinkSync(req.file.path);

      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const attachment = await prisma.attachments.create({
      data: {
        task_id: taskId,
        uploaded_by: req.user.id,
        file_name: req.file.originalname,
        file_url: `/uploads/${req.file.filename}`,
        file_type: req.file.mimetype,
        file_size: req.file.size,
      },
    });

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      attachment,
    });
  } catch (error) {
    console.error("Upload task file error:", error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to upload file",
      error: error.message,
    });
  }
};

/**
 * Upload file to a project
 * POST /api/projects/:projectId/files
 */
export const uploadProjectFile = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const project = await prisma.projects.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      fs.unlinkSync(req.file.path);

      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const attachment = await prisma.attachments.create({
      data: {
        project_id: projectId,
        uploaded_by: req.user.id,
        file_name: req.file.originalname,
        file_url: `/uploads/${req.file.filename}`,
        file_type: req.file.mimetype,
        file_size: req.file.size,
      },
    });

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      attachment,
    });
  } catch (error) {
    console.error("Upload project file error:", error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to upload file",
      error: error.message,
    });
  }
};

/**
 * Get files attached to a task
 * GET /api/tasks/:taskId/files
 */
export const getTaskFiles = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.tasks.findUnique({
      where: {
        id: taskId,
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const files = await prisma.attachments.findMany({
      where: {
        task_id: taskId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      files,
    });
  } catch (error) {
    console.error("Get task files error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve files",
      error: error.message,
    });
  }
};

/**
 * Get files attached to a project
 * GET /api/projects/:projectId/files
 */
export const getProjectFiles = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.projects.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const files = await prisma.attachments.findMany({
      where: {
        project_id: projectId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      files,
    });
  } catch (error) {
    console.error("Get project files error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve files",
      error: error.message,
    });
  }
};

/**
 * Delete file
 * DELETE /api/files/:fileId
 */
export const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const attachment = await prisma.attachments.findUnique({
      where: {
        id: fileId,
      },
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const filePath = path.join(
      process.cwd(),
      attachment.file_url.replace("/uploads/", "")
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.attachments.delete({
      where: {
        id: fileId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Delete file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete file",
      error: error.message,
    });
  }
};