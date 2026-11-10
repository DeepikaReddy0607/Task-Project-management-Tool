import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
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

      const publicPaths = ["/login", "/register", "/verify-otp", "/forgot-password", "/reset-password"];
      const currentPath = window.location.pathname;

      if (!publicPaths.some((p) => currentPath.startsWith(p)) && !isRedirecting) {
        isRedirecting = true;
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }

    // Attach user-friendly normalized error message
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      error.userMessage = "Request timed out. Please check your connection and try again.";
    } else if (!error.response) {
      error.userMessage = "Network error. Please check your internet connection.";
    } else if (error.response.status === 429) {
      error.userMessage = error.response.data?.message || "Too many requests. Please slow down and try again later.";
    } else if (error.response.status >= 500) {
      error.userMessage = error.response.data?.message || "Server error encountered. Please try again shortly.";
    } else {
      error.userMessage =
        error.response.data?.message ||
        (typeof error.response.data?.error === "string" ? error.response.data.error : null) ||
        error.message ||
        "An unexpected error occurred.";
    }

    return Promise.reject(error);
  }
);

export default api;
