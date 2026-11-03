import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("taskflow_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let isRedirecting = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("taskflow_token");
      localStorage.removeItem("taskflow_user");

      const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password"];
      const currentPath = window.location.pathname;

      if (!publicPaths.some((p) => currentPath.startsWith(p)) && !isRedirecting) {
        isRedirecting = true;
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
