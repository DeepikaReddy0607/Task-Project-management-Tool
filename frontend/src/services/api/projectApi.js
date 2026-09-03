import api from "./axios";

// Create project
export const createProject = async (workspaceId, projectData) => {
  const response = await api.post(
    `/workspaces/${workspaceId}/projects`,
    projectData
  );

  return response.data;
};

// Get projects in workspace
export const getProjects = async (workspaceId) => {
  const response = await api.get(
    `/workspaces/${workspaceId}/projects`
  );

  return response.data;
};

// Get single project
export const getProject = async (projectId) => {
  const response = await api.get(`/projects/${projectId}`);

  return response.data;
};

// Update project
export const updateProject = async (projectId, projectData) => {
  const response = await api.patch(
    `/projects/${projectId}`,
    projectData
  );

  return response.data;
};

// Archive project
export const archiveProject = async (projectId) => {
  const response = await api.patch(
    `/projects/${projectId}/archive`
  );

  return response.data;
};

// Add project member
export const addProjectMember = async (projectId, memberData) => {
  const response = await api.post(
    `/projects/${projectId}/members`,
    memberData
  );

  return response.data;
};

// Get project members
export const getProjectMembers = async (projectId) => {
  const response = await api.get(
    `/projects/${projectId}/members`
  );

  return response.data;
};

// Update project member role
export const updateProjectMemberRole = async (
  projectId,
  userId,
  role
) => {
  const response = await api.patch(
    `/projects/${projectId}/members/${userId}`,
    { role }
  );

  return response.data;
};

// Remove project member
export const removeProjectMember = async (
  projectId,
  userId
) => {
  const response = await api.delete(
    `/projects/${projectId}/members/${userId}`
  );

  return response.data;
};