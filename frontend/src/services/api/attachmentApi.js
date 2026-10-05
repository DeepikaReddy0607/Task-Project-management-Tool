import api from "./axios";

/**
 * Upload an attachment to a Task
 * @param {string} taskId
 * @param {File} file
 * @param {Function} [onUploadProgress]
 */
export const uploadTaskAttachment = async (taskId, file, onUploadProgress) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(`/tasks/${taskId}/attachments`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress,
  });

  return response.data;
};

/**
 * Get all attachments for a Task
 * @param {string} taskId
 */
export const getTaskAttachments = async (taskId) => {
  const response = await api.get(`/tasks/${taskId}/attachments`);
  return response.data;
};

/**
 * Upload an attachment to a Project
 * @param {string} projectId
 * @param {File} file
 * @param {Function} [onUploadProgress]
 */
export const uploadProjectAttachment = async (projectId, file, onUploadProgress) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(`/projects/${projectId}/attachments`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress,
  });

  return response.data;
};

/**
 * Get all attachments for a Project
 * @param {string} projectId
 */
export const getProjectAttachments = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/attachments`);
  return response.data;
};

/**
 * Download an attachment by ID
 * @param {string} attachmentId
 * @param {string} fileName
 */
export const downloadAttachment = async (attachmentId, fileName) => {
  const response = await api.get(`/attachments/${attachmentId}/download`, {
    responseType: "blob",
  });

  // Create a blob URL and trigger browser download
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName || `attachment-${attachmentId}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return true;
};

/**
 * Delete an attachment by ID
 * @param {string} attachmentId
 */
export const deleteAttachment = async (attachmentId) => {
  const response = await api.delete(`/attachments/${attachmentId}`);
  return response.data;
};

export default {
  uploadTaskAttachment,
  getTaskAttachments,
  uploadProjectAttachment,
  getProjectAttachments,
  downloadAttachment,
  deleteAttachment,
};
