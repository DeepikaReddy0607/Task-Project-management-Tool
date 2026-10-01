import api from "./axios";

// Get all subtasks for a task
export const getSubtasks = async (taskId) => {
  const response = await api.get(`/tasks/${taskId}/subtasks`);
  return response.data;
};

// Create a subtask
export const createSubtask = async (taskId, data) => {
  const response = await api.post(
    `/tasks/${taskId}/subtasks`,
    data
  );
  return response.data;
};

// Get a single subtask
export const getSubtask = async (id) => {
  const response = await api.get(`/subtasks/${id}`);
  return response.data;
};

// Update a subtask
export const updateSubtask = async (id, data) => {
  const response = await api.patch(
    `/subtasks/${id}`,
    data
  );
  return response.data;
};

// Update subtask status
export const updateSubtaskStatus = async (id, status) => {
  const response = await api.patch(
    `/subtasks/${id}/status`,
    { status }
  );
  return response.data;
};

// Delete a subtask
export const deleteSubtask = async (id) => {
  const response = await api.delete(
    `/subtasks/${id}`
  );
  return response.data;
};