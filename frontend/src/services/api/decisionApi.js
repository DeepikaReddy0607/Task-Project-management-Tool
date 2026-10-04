import api from "./axios";

/**
 * Phase 14: Decision Log API Client
 */

export const getProjectDecisions = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/decisions`, { params });
  return response.data;
};

export const getDecisionById = async (projectId, decisionId) => {
  const response = await api.get(`/projects/${projectId}/decisions/${decisionId}`);
  return response.data;
};

export const createDecision = async (projectId, data) => {
  const response = await api.post(`/projects/${projectId}/decisions`, data);
  return response.data;
};

export const updateDecision = async (projectId, decisionId, data) => {
  const response = await api.patch(`/projects/${projectId}/decisions/${decisionId}`, data);
  return response.data;
};

export const deleteDecision = async (projectId, decisionId) => {
  const response = await api.delete(`/projects/${projectId}/decisions/${decisionId}`);
  return response.data;
};

export const supersedeDecision = async (projectId, decisionId, data) => {
  const response = await api.post(`/projects/${projectId}/decisions/${decisionId}/supersede`, data);
  return response.data;
};

export const getDecisionIntelligence = async (projectId, decisionId) => {
  const response = await api.get(`/projects/${projectId}/decisions/${decisionId}/intelligence`);
  return response.data;
};

export default {
  getProjectDecisions,
  getDecisionById,
  createDecision,
  updateDecision,
  deleteDecision,
  supersedeDecision,
  getDecisionIntelligence
};
