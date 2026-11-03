import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { getPreferences, updatePreferences, resetPreferences } from "../services/api/preferencesApi";

const defaultPreferences = {
  theme: "system",
  interfaceDensity: "comfortable",
  sidebarCollapsed: false,
  dashboardLayout: "default",

  // Notifications
  inAppNotifications: true,
  emailNotifications: true,
  taskAssignments: true,
  deadlineReminders: true,
  taskStatusUpdates: true,
  mentionsAndComments: true,
  projectUpdates: true,
  workspaceActivity: true,
  riskAlerts: true,
  aiRecommendationsNotif: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  dndEnabled: false,
  notificationFrequency: "immediate",

  // Tasks
  defaultTaskView: "kanban",
  defaultTaskPriority: "Medium",
  defaultTaskSort: "due_date",
  showCompletedTasks: true,
  defaultTaskFilter: "all",
  weekStartsOn: "Monday",

  // Workspace
  defaultWorkspaceId: null,
  defaultLandingPage: "dashboard",
  rememberLastWorkspace: true,
  rememberLastProject: true,
  lastWorkspaceId: null,
  lastProjectId: null,

  // Date & Time
  timezone: "UTC",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "12h",

  // AI & Intelligence
  aiRecommendations: true,
  proactiveInsights: true,
  aiTaskSuggestions: true,
  aiGeneratedSummaries: true,
  quackieSuggestions: true,
  aiInsightFrequency: "medium",

  // Privacy & Personalization
  profileVisibility: "team",
  activityVisibility: "team",
  personalizedDashboard: true,
  personalizedRecommendations: true,
};

const PreferencesContext = createContext(null);

export const PreferencesProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(() => {
    try {
      const cached = localStorage.getItem("taskflow_preferences_cache");
      return cached ? { ...defaultPreferences, ...JSON.parse(cached) } : defaultPreferences;
    } catch {
      return defaultPreferences;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [saveError, setSaveError] = useState(null);
  const statusTimerRef = useRef(null);

  // System dark-mode detection
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Compute active theme
  const activeTheme = preferences.theme === "system" ? (systemPrefersDark ? "dark" : "light") : preferences.theme;

  // Apply theme & density to document element
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.setAttribute("data-theme", activeTheme);
    if (activeTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    document.documentElement.setAttribute(
      "data-density",
      preferences.interfaceDensity || "comfortable"
    );
  }, [activeTheme, preferences.interfaceDensity]);

  // Load user preferences from backend on mount or auth change
  const loadPreferences = useCallback(async () => {
    const token = localStorage.getItem("taskflow_token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await getPreferences();
      const prefs = res?.preferences || res?.data;
      if (prefs) {
        setPreferences((prev) => {
          const merged = { ...prev, ...prefs };
          try {
            localStorage.setItem("taskflow_preferences_cache", JSON.stringify(merged));
          } catch {
            // Ignore
          }
          return merged;
        });
      }
    } catch (err) {
      console.warn("Failed to load user preferences from backend:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();

    const handleAuthChange = () => {
      void loadPreferences();
    };

    window.addEventListener("taskflow_user_updated", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener("taskflow_user_updated", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, [loadPreferences]);

  // Helper to show saved status with auto-reset
  const triggerSavedStatus = () => {
    setSaveStatus("saved");
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setSaveStatus("idle");
    }, 2000);
  };

  // Optimistic update single preference
  const updatePreference = useCallback(async (key, value) => {
    let previousValue;
    setPreferences((prev) => {
      previousValue = prev[key];
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem("taskflow_preferences_cache", JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });

    setSaveStatus("saving");
    setSaveError(null);

    try {
      const res = await updatePreferences({ [key]: value });
      const savedPrefs = res?.preferences || res?.data;
      if (savedPrefs) {
        setPreferences((prev) => ({ ...prev, ...savedPrefs }));
      }
      triggerSavedStatus();
    } catch (err) {
      console.error(`Failed to save preference "${key}":`, err);
      // Rollback to previous value
      setPreferences((prev) => {
        const reverted = { ...prev, [key]: previousValue };
        try {
          localStorage.setItem("taskflow_preferences_cache", JSON.stringify(reverted));
        } catch {
          // Ignore
        }
        return reverted;
      });
      setSaveStatus("error");
      setSaveError(err.response?.data?.message || err.message || "Failed to save preference");
    }
  }, []);

  // Batch update preferences
  const updatePreferencesBatch = useCallback(async (partialUpdates) => {
    let previousState;
    setPreferences((prev) => {
      previousState = prev;
      const updated = { ...prev, ...partialUpdates };
      try {
        localStorage.setItem("taskflow_preferences_cache", JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });

    setSaveStatus("saving");
    setSaveError(null);

    try {
      const res = await updatePreferences(partialUpdates);
      const savedPrefs = res?.preferences || res?.data;
      if (savedPrefs) {
        setPreferences((prev) => ({ ...prev, ...savedPrefs }));
      }
      triggerSavedStatus();
    } catch (err) {
      console.error("Failed to batch save preferences:", err);
      // Rollback
      setPreferences(previousState);
      try {
        localStorage.setItem("taskflow_preferences_cache", JSON.stringify(previousState));
      } catch {
        // Ignore
      }
      setSaveStatus("error");
      setSaveError(err.response?.data?.message || err.message || "Failed to save preferences");
    }
  }, []);

  // Reset to factory defaults
  const resetToDefaults = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const res = await resetPreferences();
      const resetPrefs = res?.preferences || res?.data || defaultPreferences;
      setPreferences(resetPrefs);
      try {
        localStorage.setItem("taskflow_preferences_cache", JSON.stringify(resetPrefs));
      } catch {
        // Ignore
      }
      triggerSavedStatus();
      return true;
    } catch (err) {
      console.error("Failed to reset preferences:", err);
      setSaveStatus("error");
      setSaveError(err.response?.data?.message || err.message || "Failed to reset preferences");
      return false;
    }
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        activeTheme,
        interfaceDensity: preferences.interfaceDensity || "comfortable",
        isLoading,
        saveStatus,
        saveError,
        updatePreference,
        updatePreferencesBatch,
        resetToDefaults,
        refreshPreferences: loadPreferences,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
};

export default PreferencesContext;
