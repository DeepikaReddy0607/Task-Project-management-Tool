import api from "./axios";

export const getPreferences = async () => {
  const response = await api.get("/preferences");
  return response.data;
};

export const updatePreferences = async (preferencesData) => {
  const response = await api.patch("/preferences", preferencesData);
  return response.data;
};

export const resetPreferences = async () => {
  const response = await api.post("/preferences/reset");
  return response.data;
};
