import api from "./axios";

// Create task inside a project
export const createTask = async (projectId, taskData) => {
  const response = await api.post(
    `/projects/${projectId}/tasks`,
    taskData
  );

  return response.data;
};

// Get all active tasks for a project
export const getProjectTasks = async (projectId) => {
  const response = await api.get(
    `/projects/${projectId}/tasks`
  );

  return response.data;
};

// Get tasks assigned to logged-in user
export const getMyTasks = async () => {
  const response = await api.get("/tasks/my-tasks");

  return response.data;
};

// Get single task
export const getTask = async (taskId) => {
  const response = await api.get(`/tasks/${taskId}`);

  return response.data;
};

// Update task
export const updateTask = async (taskId, taskData) => {
  const response = await api.patch(
    `/tasks/${taskId}`,
    taskData
  );

  return response.data;
};

// Assign task
export const assignTask = async (taskId, assignedTo) => {
  const response = await api.patch(
    `/tasks/${taskId}/assign`,
    { assignedTo }
  );

  return response.data;
};

// Archive task
export const archiveTask = async (taskId) => {
  const response = await api.patch(
    `/tasks/${taskId}/archive`
  );

  return response.data;
};

// Update task status
export const updateTaskStatus = async (taskId, status) => {
  const response = await api.patch(
    `/tasks/${taskId}/status`,
    { status }
  );

  return response.data;
};