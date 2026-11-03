import api from "./axios";

export const getWorkspaceActivities = async (workspaceId, params = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);
  if (params.actionType) query.append("actionType", params.actionType);
  if (params.entityType) query.append("entityType", params.entityType);

  const qs = query.toString();
  const url = `/workspaces/${workspaceId}/activities${qs ? `?${qs}` : ""}`;
  const response = await api.get(url);
  return response.data;
};
