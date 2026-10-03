import api from "./axios";

export const getCalendarEvents = async () => {
  const response = await api.get("/calendar");

  return response.data;
};