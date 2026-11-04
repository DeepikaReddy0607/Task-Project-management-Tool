import api from "./axios";

export const getCalendarEvents = async (params = {}) => {
  const response = await api.get("/calendar", { params });

  return response.data;
};
