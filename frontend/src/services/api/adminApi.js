import api from "./axios";

export const fetchAdminOverview = async () => {
    const response = await api.get("/admin/overview");
    return response.data;
};

export const fetchAdminUsers = async (params = {}) => {
    const response = await api.get("/admin/users", { params });
    return response.data;
};

export const fetchAdminUserById = async (id) => {
    const response = await api.get(`/admin/users/${id}`);
    return response.data;
};

export const updateAdminUserRole = async (id, role) => {
    const response = await api.patch(`/admin/users/${id}/role`, { role });
    return response.data;
};

export const updateAdminUserStatus = async (id, isActive) => {
    const response = await api.patch(`/admin/users/${id}/status`, { isActive });
    return response.data;
};

export const fetchAdminWorkspaces = async (params = {}) => {
    const response = await api.get("/admin/workspaces", { params });
    return response.data;
};

export const fetchAdminWorkspaceById = async (id) => {
    const response = await api.get(`/admin/workspaces/${id}`);
    return response.data;
};

export const fetchAdminProjects = async (params = {}) => {
    const response = await api.get("/admin/projects", { params });
    return response.data;
};

export const fetchAdminProjectById = async (id) => {
    const response = await api.get(`/admin/projects/${id}`);
    return response.data;
};

export const fetchAdminActivity = async (params = {}) => {
    const response = await api.get("/admin/activity", { params });
    return response.data;
};
