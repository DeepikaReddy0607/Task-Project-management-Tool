import prisma from "../config/prisma.js";
import path from "path";
import fs from "fs";
import { UPLOAD_DIR } from "../middleware/uploadMiddleware.js";

// In-memory store for hermetic testing and disconnected environments
let inMemoryAttachments = [];
let inMemoryTasks = [];
let inMemoryProjects = [];
let inMemoryWorkspaceMembers = [];
let inMemoryProjectMembers = [];
let inMemoryActivityLogs = [];

export const seedInMemoryAttachmentData = ({
  attachments = [],
  tasks = [],
  projects = [],
  workspaceMembers = [],
  projectMembers = [],
}) => {
  inMemoryAttachments = [...attachments];
  inMemoryTasks = [...tasks];
  inMemoryProjects = [...projects];
  inMemoryWorkspaceMembers = [...workspaceMembers];
  inMemoryProjectMembers = [...projectMembers];
  inMemoryActivityLogs = [];
};

export const clearAttachmentStore = () => {
  inMemoryAttachments = [];
  inMemoryTasks = [];
  inMemoryProjects = [];
  inMemoryWorkspaceMembers = [];
  inMemoryProjectMembers = [];
  inMemoryActivityLogs = [];
};

/**
 * Format attachment record for client consumption.
 * Ensures BigInt file_size is converted to Number and sensitive absolute paths are redacted.
 */
export const sanitizeAttachment = (attachment) => {
  if (!attachment) return null;

  return {
    id: attachment.id,
    taskId: attachment.task_id || attachment.taskId || null,
    projectId: attachment.project_id || attachment.projectId || null,
    uploadedBy: attachment.uploaded_by || attachment.uploadedBy,
    uploaderName:
      attachment.users
        ? `${attachment.users.first_name || ""} ${attachment.users.last_name || ""}`.trim() ||
          attachment.users.name ||
          attachment.users.email
        : attachment.uploaderName || "Unknown",
    fileName: attachment.file_name || attachment.fileName,
    fileType: attachment.file_type || attachment.fileType || "application/octet-stream",
    fileSize:
      typeof attachment.file_size === "bigint"
        ? Number(attachment.file_size)
        : Number(attachment.fileSize || 0),
    createdAt: attachment.created_at || attachment.createdAt || new Date().toISOString(),
  };
};

/**
 * Check if a user has access to a project or its parent workspace
 */
export const verifyProjectAccess = async (projectId, userId, userRole) => {
  if (!userId) return false;
  if (userRole && userRole.toLowerCase() === "admin") return true;

  // In-memory fallback
  if (inMemoryProjects.length > 0) {
    const project = inMemoryProjects.find((p) => p.id === projectId);
    if (!project) return false;

    // Direct project membership
    const hasProject = inMemoryProjectMembers.some(
      (pm) => pm.project_id === projectId && pm.user_id === userId
    );
    if (hasProject) return true;

    // Workspace membership
    const hasWorkspace = inMemoryWorkspaceMembers.some(
      (wm) => wm.workspace_id === project.workspace_id && wm.user_id === userId
    );
    return hasWorkspace;
  }

  try {
    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { workspace_id: true },
    });
    if (!project) return false;

    const [pmMember, wsMember] = await Promise.all([
      prisma.project_members.findFirst({
        where: { project_id: projectId, user_id: userId },
      }),
      prisma.workspace_members.findFirst({
        where: { workspace_id: project.workspace_id, user_id: userId },
      }),
    ]);

    return Boolean(pmMember || wsMember);
  } catch (err) {
    console.error("verifyProjectAccess database error:", err.message);
    return false;
  }
};

/**
 * Check if a user has access to a task
 */
export const verifyTaskAccess = async (taskId, userId, userRole) => {
  if (!userId) return false;
  if (userRole && userRole.toLowerCase() === "admin") {
    // Admin still requires task to actually exist
    if (inMemoryTasks.length > 0) {
      return Boolean(inMemoryTasks.find((t) => t.id === taskId));
    }
    try {
      const task = await prisma.tasks.findUnique({ where: { id: taskId } });
      return Boolean(task);
    } catch {
      return false;
    }
  }

  // In-memory fallback
  if (inMemoryTasks.length > 0) {
    const task = inMemoryTasks.find((t) => t.id === taskId);
    if (!task) return false;
    return verifyProjectAccess(task.project_id || task.projectId, userId, userRole);
  }

  try {
    const task = await prisma.tasks.findUnique({
      where: { id: taskId },
      select: { project_id: true },
    });
    if (!task) return false;
    return verifyProjectAccess(task.project_id, userId, userRole);
  } catch (err) {
    console.error("verifyTaskAccess database error:", err.message);
    return false;
  }
};

/**
 * Upload an attachment to a Task
 */
export const createTaskAttachment = async ({ taskId, uploadedBy, userRole, file }) => {
  if (!file) {
    const error = new Error("No file uploaded.");
    error.statusCode = 400;
    throw error;
  }

  // 1. Verify Task access
  const hasAccess = await verifyTaskAccess(taskId, uploadedBy, userRole);
  if (!hasAccess) {
    // Clean up uploaded file from disk if access denied
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {}
    }
    const error = new Error("Access denied or task not found.");
    error.statusCode = 404;
    throw error;
  }

  // Determine project_id
  let projectId = null;
  if (inMemoryTasks.length > 0) {
    const task = inMemoryTasks.find((t) => t.id === taskId);
    projectId = task ? (task.project_id || task.projectId) : null;
  } else {
    try {
      const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        select: { project_id: true },
      });
      projectId = task?.project_id || null;
    } catch (e) {}
  }

  const safeFileName = path.basename(file.originalname);
  const relativeUrl = `uploads/attachments/${file.filename}`;

  // In-memory fallback
  if (inMemoryAttachments.length > 0 || inMemoryTasks.length > 0) {
    const newAttachment = {
      id: crypto.randomUUID ? crypto.randomUUID() : `att-${Date.now()}`,
      task_id: taskId,
      project_id: null,
      uploaded_by: uploadedBy,
      file_name: safeFileName,
      file_url: relativeUrl,
      file_type: file.mimetype || "application/octet-stream",
      file_size: BigInt(file.size),
      created_at: new Date(),
      physical_path: file.path,
    };
    inMemoryAttachments.push(newAttachment);
    inMemoryActivityLogs.push({
      action: "UPLOAD_ATTACHMENT",
      entity_type: "attachment",
      entity_id: newAttachment.id,
      user_id: uploadedBy,
      task_id: taskId,
      created_at: new Date(),
    });
    return sanitizeAttachment(newAttachment);
  }

  // Production Prisma insert
  const created = await prisma.attachments.create({
    data: {
      task_id: taskId,
      project_id: null,
      uploaded_by: uploadedBy,
      file_name: safeFileName,
      file_url: relativeUrl,
      file_type: file.mimetype || "application/octet-stream",
      file_size: BigInt(file.size),
    },
    include: {
      users: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
    },
  });

  // Log activity if workspace is known
  try {
    if (projectId) {
      const proj = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { workspace_id: true },
      });
      if (proj) {
        await prisma.activity_logs.create({
          data: {
            workspace_id: proj.workspace_id,
            user_id: uploadedBy,
            action_type: "UPLOAD_ATTACHMENT",
            entity_type: "attachment",
            entity_id: created.id,
            description: `Uploaded attachment "${safeFileName}" to task.`,
          },
        });
      }
    }
  } catch (err) {
    // Activity logging should not fail upload
    console.error("Activity log error for attachment upload:", err.message);
  }

  return sanitizeAttachment(created);
};

/**
 * Upload an attachment to a Project
 */
export const createProjectAttachment = async ({ projectId, uploadedBy, userRole, file }) => {
  if (!file) {
    const error = new Error("No file uploaded.");
    error.statusCode = 400;
    throw error;
  }

  const hasAccess = await verifyProjectAccess(projectId, uploadedBy, userRole);
  if (!hasAccess) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {}
    }
    const error = new Error("Access denied or project not found.");
    error.statusCode = 404;
    throw error;
  }

  const safeFileName = path.basename(file.originalname);
  const relativeUrl = `uploads/attachments/${file.filename}`;

  // In-memory fallback
  if (inMemoryAttachments.length > 0 || inMemoryProjects.length > 0) {
    const newAttachment = {
      id: crypto.randomUUID ? crypto.randomUUID() : `att-${Date.now()}`,
      task_id: null,
      project_id: projectId,
      uploaded_by: uploadedBy,
      file_name: safeFileName,
      file_url: relativeUrl,
      file_type: file.mimetype || "application/octet-stream",
      file_size: BigInt(file.size),
      created_at: new Date(),
      physical_path: file.path,
    };
    inMemoryAttachments.push(newAttachment);
    return sanitizeAttachment(newAttachment);
  }

  const created = await prisma.attachments.create({
    data: {
      task_id: null,
      project_id: projectId,
      uploaded_by: uploadedBy,
      file_name: safeFileName,
      file_url: relativeUrl,
      file_type: file.mimetype || "application/octet-stream",
      file_size: BigInt(file.size),
    },
    include: {
      users: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
    },
  });

  return sanitizeAttachment(created);
};

/**
 * Get all attachments for a Task
 */
export const getTaskAttachments = async (taskId, userId, userRole) => {
  const hasAccess = await verifyTaskAccess(taskId, userId, userRole);
  if (!hasAccess) {
    const error = new Error("Access denied or task not found.");
    error.statusCode = 404;
    throw error;
  }

  // In-memory fallback
  if (inMemoryAttachments.length > 0 || inMemoryTasks.length > 0) {
    const records = inMemoryAttachments.filter((a) => (a.task_id || a.taskId) === taskId);
    return records.map(sanitizeAttachment);
  }

  const records = await prisma.attachments.findMany({
    where: { task_id: taskId },
    orderBy: { created_at: "desc" },
    include: {
      users: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
    },
  });

  return records.map(sanitizeAttachment);
};

/**
 * Get all attachments for a Project
 */
export const getProjectAttachments = async (projectId, userId, userRole) => {
  const hasAccess = await verifyProjectAccess(projectId, userId, userRole);
  if (!hasAccess) {
    const error = new Error("Access denied or project not found.");
    error.statusCode = 404;
    throw error;
  }

  if (inMemoryAttachments.length > 0 || inMemoryProjects.length > 0) {
    const records = inMemoryAttachments.filter((a) => (a.project_id || a.projectId) === projectId);
    return records.map(sanitizeAttachment);
  }

  const records = await prisma.attachments.findMany({
    where: { project_id: projectId },
    orderBy: { created_at: "desc" },
    include: {
      users: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
    },
  });

  return records.map(sanitizeAttachment);
};

/**
 * Get single attachment metadata
 */
export const getAttachmentById = async (attachmentId, userId, userRole) => {
  let attachment = null;

  if (inMemoryAttachments.length > 0) {
    attachment = inMemoryAttachments.find((a) => a.id === attachmentId);
  } else {
    try {
      attachment = await prisma.attachments.findUnique({
        where: { id: attachmentId },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
    } catch (e) {}
  }

  if (!attachment) {
    const error = new Error("Attachment not found.");
    error.statusCode = 404;
    throw error;
  }

  // Check parent authorization
  const taskId = attachment.task_id || attachment.taskId;
  const projectId = attachment.project_id || attachment.projectId;

  let hasAccess = false;
  if (taskId) {
    hasAccess = await verifyTaskAccess(taskId, userId, userRole);
  } else if (projectId) {
    hasAccess = await verifyProjectAccess(projectId, userId, userRole);
  }

  if (!hasAccess) {
    const error = new Error("Access denied or attachment not found.");
    error.statusCode = 404;
    throw error;
  }

  return sanitizeAttachment(attachment);
};

/**
 * Retrieve physical file stream information for secure download
 */
export const getAttachmentFileStream = async (attachmentId, userId, userRole) => {
  let attachment = null;

  if (inMemoryAttachments.length > 0) {
    attachment = inMemoryAttachments.find((a) => a.id === attachmentId);
  } else {
    try {
      attachment = await prisma.attachments.findUnique({
        where: { id: attachmentId },
      });
    } catch (e) {}
  }

  if (!attachment) {
    const error = new Error("Attachment not found.");
    error.statusCode = 404;
    throw error;
  }

  const taskId = attachment.task_id || attachment.taskId;
  const projectId = attachment.project_id || attachment.projectId;

  let hasAccess = false;
  if (taskId) {
    hasAccess = await verifyTaskAccess(taskId, userId, userRole);
  } else if (projectId) {
    hasAccess = await verifyProjectAccess(projectId, userId, userRole);
  }

  if (!hasAccess) {
    const error = new Error("Access denied or attachment not found.");
    error.statusCode = 404;
    throw error;
  }

  // Resolve absolute path safely from server UPLOAD_DIR
  const fileUrl = attachment.file_url || attachment.fileUrl;
  const storageFilename = path.basename(fileUrl);
  const absolutePath = path.resolve(UPLOAD_DIR, storageFilename);

  // Security check: Ensure absolute path is strictly within UPLOAD_DIR
  if (!absolutePath.startsWith(UPLOAD_DIR)) {
    const error = new Error("Invalid file path detected.");
    error.statusCode = 400;
    throw error;
  }

  // In test memory mode where physical file might not be written
  if (!fs.existsSync(absolutePath)) {
    if (attachment.contentBuffer) {
      return {
        buffer: attachment.contentBuffer,
        fileName: attachment.file_name || attachment.fileName,
        fileType: attachment.file_type || attachment.fileType || "application/octet-stream",
      };
    }
    const error = new Error("File content not found on server.");
    error.statusCode = 404;
    throw error;
  }

  return {
    filePath: absolutePath,
    fileName: attachment.file_name || attachment.fileName,
    fileType: attachment.file_type || attachment.fileType || "application/octet-stream",
  };
};

/**
 * Delete an attachment with strict permission verification
 */
export const deleteAttachment = async (attachmentId, userId, userRole) => {
  let attachment = null;

  if (inMemoryAttachments.length > 0) {
    attachment = inMemoryAttachments.find((a) => a.id === attachmentId);
  } else {
    try {
      attachment = await prisma.attachments.findUnique({
        where: { id: attachmentId },
      });
    } catch (e) {}
  }

  if (!attachment) {
    const error = new Error("Attachment not found.");
    error.statusCode = 404;
    throw error;
  }

  const taskId = attachment.task_id || attachment.taskId;
  const projectId = attachment.project_id || attachment.projectId;
  const uploaderId = attachment.uploaded_by || attachment.uploadedBy;

  // Authorization check:
  // Admin can delete any attachment.
  // Uploader can delete their own attachment.
  // Project Manager / Workspace Admin can delete attachments.
  const isAdmin = userRole && userRole.toLowerCase() === "admin";
  const isUploader = uploaderId === userId;
  const isPM = userRole && (userRole.toLowerCase() === "project manager" || userRole.toLowerCase() === "project_manager");

  if (!isAdmin && !isUploader && !isPM) {
    const error = new Error("Permission denied. Only the uploader or project manager can delete this attachment.");
    error.statusCode = 403;
    throw error;
  }

  // Delete physical file safely
  const fileUrl = attachment.file_url || attachment.fileUrl;
  if (fileUrl) {
    const storageFilename = path.basename(fileUrl);
    const absolutePath = path.resolve(UPLOAD_DIR, storageFilename);
    if (absolutePath.startsWith(UPLOAD_DIR) && fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch (err) {
        console.error("Failed to delete physical file:", err.message);
      }
    }
  }

  // Delete record from database / memory
  if (inMemoryAttachments.length > 0) {
    inMemoryAttachments = inMemoryAttachments.filter((a) => a.id !== attachmentId);
    inMemoryActivityLogs.push({
      action: "DELETE_ATTACHMENT",
      entity_type: "attachment",
      entity_id: attachmentId,
      user_id: userId,
      created_at: new Date(),
    });
    return { success: true, message: "Attachment deleted successfully." };
  }

  await prisma.attachments.delete({
    where: { id: attachmentId },
  });

  // Log activity
  try {
    if (projectId) {
      const proj = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { workspace_id: true },
      });
      if (proj) {
        await prisma.activity_logs.create({
          data: {
            workspace_id: proj.workspace_id,
            user_id: userId,
            action_type: "DELETE_ATTACHMENT",
            entity_type: "attachment",
            entity_id: attachmentId,
            description: `Deleted attachment "${attachment.file_name}".`,
          },
        });
      }
    }
  } catch (err) {
    console.error("Activity log error for attachment delete:", err.message);
  }

  return { success: true, message: "Attachment deleted successfully." };
};

export default {
  createTaskAttachment,
  createProjectAttachment,
  getTaskAttachments,
  getProjectAttachments,
  getAttachmentById,
  getAttachmentFileStream,
  deleteAttachment,
  sanitizeAttachment,
  seedInMemoryAttachmentData,
  clearAttachmentStore,
};
