import api from "./axios";

const configForProject = (projectId) =>
  projectId ? { params: { projectId } } : undefined;

export const getTaskCompletionReport = async (projectId) => {
  const response = await api.get("/reports/task-completion", configForProject(projectId));
  return response.data;
};

export const getPendingOverdueReport = async (projectId) => {
  const response = await api.get("/reports/pending-overdue", configForProject(projectId));
  return response.data;
};

export const getPriorityReport = async (projectId) => {
  const response = await api.get("/reports/by-priority", configForProject(projectId));
  return response.data;
};

export const getStatusReport = async (projectId) => {
  const response = await api.get("/reports/by-status", configForProject(projectId));
  return response.data;
};

export const getDashboardReport = async (projectId) => {
  const response = await api.get("/reports/dashboard", configForProject(projectId));
  return response.data;
};
