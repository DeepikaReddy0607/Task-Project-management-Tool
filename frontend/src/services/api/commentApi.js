import api from "./axios";

// Get all comments for a task
export const getComments = async (taskId) => {
  const response = await api.get(`/tasks/${taskId}/comments`);
  return response.data;
};

// Create a comment on a task
export const createComment = async (taskId, content) => {
  const response = await api.post(`/tasks/${taskId}/comments`, { content });
  return response.data;
};

// Update own comment
export const updateComment = async (commentId, content) => {
  const response = await api.put(`/comments/${commentId}`, { content });
  return response.data;
};

// Delete own comment
export const deleteComment = async (commentId) => {
  const response = await api.delete(`/comments/${commentId}`);
  return response.data;
};
