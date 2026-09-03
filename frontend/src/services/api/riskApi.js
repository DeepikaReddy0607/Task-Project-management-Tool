import api from "./axios";

// Create risk
export const createRisk = async (projectId, riskData) => {
  const response = await api.post(
    `/projects/${projectId}/risks`,
    riskData
  );

  return response.data;
};

// Get risks for a project
export const getProjectRisks = async (
  projectId,
  sort = "severity",
  order = "desc"
) => {
  const response = await api.get(
    `/projects/${projectId}/risks`,
    {
      params: {
        sort,
        order,
      },
    }
  );

  return response.data;
};

// Update risk
export const updateRisk = async (riskId, riskData) => {
  const response = await api.patch(
    `/risks/${riskId}`,
    riskData
  );

  return response.data;
};

// Close risk
export const closeRisk = async (riskId) => {
  const response = await api.patch(
    `/risks/${riskId}/close`
  );

  return response.data;
};