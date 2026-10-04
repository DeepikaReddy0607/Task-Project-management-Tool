import api from "./axios";

/**
 * Phase 16: Unified Permission-Aware Search & Filter API Client
 * 
 * Supports full entity filtering, sorting, pagination, and multi-criteria queries.
 * @param {Object} params
 * @param {string} [params.q] Search term
 * @param {string} [params.type] 'all' | 'tasks' | 'projects' | 'workspaces' | 'decisions' | 'risks' | 'members' | 'activity'
 * @param {string} [params.workspaceId]
 * @param {string} [params.projectId]
 * @param {string} [params.status]
 * @param {string} [params.priority]
 * @param {string} [params.category]
 * @param {string} [params.severity]
 * @param {string} [params.assigneeId]
 * @param {string} [params.ownerId]
 * @param {string} [params.from]
 * @param {string} [params.to]
 * @param {number} [params.page]
 * @param {number} [params.pageSize]
 * @param {string} [params.sortBy] 'relevance' | 'updatedAt' | 'createdAt' | 'title'
 * @param {string} [params.sortOrder] 'asc' | 'desc'
 */
export const searchUnified = async (params = {}) => {
  const cleanParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      cleanParams[key] = value;
    }
  }

  const response = await api.get("/search", { params: cleanParams });
  return response.data;
};

export default {
  searchUnified,
};
