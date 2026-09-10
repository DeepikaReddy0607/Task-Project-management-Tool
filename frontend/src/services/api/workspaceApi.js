import api from "./axios";

export const getWorkspaces = async () => {
  const response = await api.get("/workspaces");
  return response.data;
};

export const getWorkspace = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}`);
  return response.data;
};

export const createWorkspace = async (workspaceData) => {
  const response = await api.post("/workspaces", workspaceData);
  return response.data;
};

export const updateWorkspace = async (workspaceId, workspaceData) => {
  const response = await api.patch(
    `/workspaces/${workspaceId}`,
    workspaceData
  );
  return response.data;
};

export const deleteWorkspace = async (workspaceId) => {
  const response = await api.delete(`/workspaces/${workspaceId}`);
  return response.data;
};

export const getWorkspaceMembers = async (workspaceId) => {
  const response = await api.get(
    `/workspaces/${workspaceId}/members`
  );
  return response.data;
};

export const addWorkspaceMember = async (workspaceId, memberData) => {
  const response = await api.post(
    `/workspaces/${workspaceId}/members`,
    memberData
  );
  return response.data;
};

export const updateWorkspaceMemberRole = async (
  workspaceId,
  userId,
  role
) => {
  const response = await api.patch(
    `/workspaces/${workspaceId}/members/${userId}`,
    { role }
  );
  return response.data;
};

export const removeWorkspaceMember = async (
  workspaceId,
  userId
) => {
  const response = await api.delete(
    `/workspaces/${workspaceId}/members/${userId}`
  );
  return response.data;
};