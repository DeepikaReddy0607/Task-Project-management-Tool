import api from "./axios";

/**
 * Fetch Critical Path Method (CPM) analysis for a given project.
 * Returns deterministic project duration, critical tasks, slack metrics,
 * all critical paths, and cycle detection status.
 *
 * @param {string} projectId
 * @returns {Promise<Object>} API response payload
 */
export const getCriticalPath = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/critical-path`);
  return response.data;
};

/**
 * Fetch Bottleneck Intelligence for a given project.
 * Returns ranked list of bottleneck tasks with explainable scoring (0-100),
 * severity levels (CRITICAL, HIGH, MEDIUM, LOW), and root cause reasons.
 *
 * @param {string} projectId
 * @returns {Promise<Object>} API response payload
 */
export const getBottlenecks = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/bottlenecks`);
  return response.data;
};
