import api from "./axios";

export const getProductivity = async (params = {}) => {
  const response = await api.get("/productivity", { params });
  return response.data;
};
