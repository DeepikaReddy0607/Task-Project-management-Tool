import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiSliders,
  FiBell,
  FiCheckSquare,
  FiLayers,
  FiClock,
  FiCpu,
  FiShield,
  FiLock,
  FiSun,
  FiMoon,
  FiMonitor,
  FiRotateCcw,
  FiCheck,
  FiLoader,
  FiAlertTriangle,
  FiKey,
  FiExternalLink,
  FiLogOut,
  FiInfo,
} from "react-icons/fi";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Dialog from "../../components/ui/Dialog";
import SettingCard from "../../components/settings/SettingCard";
import SettingRow from "../../components/settings/SettingRow";
import ToggleSwitch from "../../components/settings/ToggleSwitch";
import { usePreferences } from "../../context/PreferencesContext";
import { getWorkspaces } from "../../services/api/workspaceApi";
import { logoutUser } from "../../services/api/authApi";

const CATEGORIES = [
  { id: "appearance", label: "Appearance", icon: FiSliders },
  { id: "notifications", label: "Notifications", icon: FiBell },
  { id: "tasks", label: "Tasks", icon: FiCheckSquare },
  { id: "workspace", label: "Workspace", icon: FiLayers },
  { id: "datetime", label: "Date & Time", icon: FiClock },
  { id: "ai", label: "AI & Intelligence", icon: FiCpu },
  { id: "privacy", label: "Privacy", icon: FiShield },
  { id: "account", label: "Account & Security", icon: FiLock },
];

function Settings() {
  const navigate = useNavigate();
  const {
    preferences,
    saveStatus,
    saveError,
    updatePreference,
    resetToDefaults,
  } = usePreferences();

  const [activeCategory, setActiveCategory] = useState("appearance");
  const [workspaces, setWorkspaces] = useState([]);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("taskflow_user") || "{}");
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    let isMounted = true;
    const fetchUserWorkspaces = async () => {
      try {
        const res = await getWorkspaces();
        if (isMounted) {
          setWorkspaces(res?.workspaces || (Array.isArray(res) ? res : []));
        }
      } catch (err) {
        console.warn("Failed to load workspaces for settings:", err);
      }
    };
    fetchUserWorkspaces();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleResetConfirm = async () => {
    setIsResetting(true);
    try {
      await resetToDefaults();
      setIsResetDialogOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const handleLogoutAll = () => {
    logoutUser();
    navigate("/login", { replace: true });
  };

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto">
        {/* Page Header */}
        <PageHeader
          title="Settings"
          description="Customize your personal workspace, appearance, notification rules, and application preferences."
          actions={
            <div className="flex items-center gap-3">
              {/* Saving Status Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium">
                {saveStatus === "saving" && (
                  <>
                    <FiLoader className="animate-spin text-[var(--color-brand)]" size={14} />
                    <span className="text-[var(--color-brand)] font-semibold">Saving changes...</span>
                  </>
                )}
                {saveStatus === "saved" && (
                  <>
                    <FiCheck className="text-emerald-600" size={14} />
                    <span className="text-emerald-700 font-semibold">All changes saved</span>
                  </>
                )}
                {saveStatus === "error" && (
                  <>
                    <FiAlertTriangle className="text-[var(--color-danger)]" size={14} />
                    <span className="text-[var(--color-danger)] font-semibold">Error saving</span>
                  </>
                )}
                {saveStatus === "idle" && (
                  <span className="text-[var(--color-text-subtle)]">Auto-saved to cloud</span>
                )}
              </div>

              {/* Reset to Defaults Trigger */}
              <Button
                variant="secondary"
                onClick={() => setIsResetDialogOpen(true)}
                className="text-xs font-semibold"
              >
                <FiRotateCcw size={14} />
                Reset Defaults
              </Button>
            </div>
          }
        />

        {saveError && (
          <div
            className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)] border border-[var(--color-danger)]/20"
            role="alert"
          >
            <FiAlertTriangle size={18} className="shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
          {/* Left Category Navigation Menu */}
          <nav
            aria-label="Settings categories"
            className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)]"
          >
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-3 w-full rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition shrink-0 ${
                    isActive
                      ? "bg-[var(--color-brand)] text-white shadow-sm"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sage)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <Icon size={16} className={isActive ? "text-white" : "text-[var(--color-brand)]"} />
                  <span className="whitespace-nowrap">{cat.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Main Content Panel */}
          <div className="md:col-span-3 space-y-6">
            {/* 1. APPEARANCE */}
            {activeCategory === "appearance" && (
              <>
                <SettingCard
                  icon={FiSliders}
                  title="Theme & Visual Style"
                  description="Choose how TaskFlow looks and feels across your devices."
                >
                  <SettingRow
                    title="Color Theme"
                    description="Switch between light, dark, or follow your operating system settings dynamically."
                  >
                    <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sage)] p-1">
                      <button
                        type="button"
                        onClick={() => updatePreference("theme", "light")}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          preferences.theme === "light"
                            ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        <FiSun size={14} />
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePreference("theme", "dark")}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          preferences.theme === "dark"
                            ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        <FiMoon size={14} />
                        Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePreference("theme", "system")}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          preferences.theme === "system"
                            ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        <FiMonitor size={14} />
                        System
                      </button>
                    </div>
                  </SettingRow>

                  <SettingRow
                    title="Interface Density"
                    description="Compact density reduces padding and increases on-screen information density."
                  >
                    <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sage)] p-1">
                      <button
                        type="button"
                        onClick={() => updatePreference("interfaceDensity", "comfortable")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          preferences.interfaceDensity === "comfortable"
                            ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        Comfortable
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePreference("interfaceDensity", "compact")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          preferences.interfaceDensity === "compact"
                            ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        Compact
                      </button>
                    </div>
                  </SettingRow>

                  <SettingRow
                    title="Collapse Sidebar by Default"
                    description="Keep the left navigation bar collapsed on large displays for maximum working canvas."
                  >
                    <ToggleSwitch
                      label="Collapse Sidebar by Default"
                      checked={preferences.sidebarCollapsed}
                      onChange={(val) => updatePreference("sidebarCollapsed", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Dashboard Layout"
                    description="Personalized dashboard layout organizes cards based on your frequent activities."
                  >
                    <select
                      value={preferences.dashboardLayout || "default"}
                      onChange={(e) => updatePreference("dashboardLayout", e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                    >
                      <option value="default">Standard (Default)</option>
                      <option value="personalized">Personalized Flow</option>
                    </select>
                  </SettingRow>
                </SettingCard>
              </>
            )}

            {/* 2. NOTIFICATIONS */}
            {activeCategory === "notifications" && (
              <>
                <SettingCard
                  icon={FiBell}
                  title="Notification Channels"
                  description="Control how and when you receive in-app and email alerts."
                >
                  <SettingRow
                    title="In-App Notifications"
                    description="Receive live notifications via the top-right notification bell and live alerts."
                  >
                    <ToggleSwitch
                      label="In-App Notifications"
                      checked={preferences.inAppNotifications}
                      onChange={(val) => updatePreference("inAppNotifications", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Email Notifications"
                    description="Send important alerts and task reminders directly to your registered email address."
                  >
                    <ToggleSwitch
                      label="Email Notifications"
                      checked={preferences.emailNotifications}
                      onChange={(val) => updatePreference("emailNotifications", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Do Not Disturb (DND)"
                    description="Instantly silence all non-critical notifications while you focus."
                    badge="Focus"
                  >
                    <ToggleSwitch
                      label="Do Not Disturb"
                      checked={preferences.dndEnabled}
                      onChange={(val) => updatePreference("dndEnabled", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Notification Frequency"
                    description="Choose whether alerts are delivered immediately or batched."
                  >
                    <select
                      value={preferences.notificationFrequency || "immediate"}
                      onChange={(e) => updatePreference("notificationFrequency", e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                    >
                      <option value="immediate">Immediate</option>
                      <option value="daily_digest">Daily Digest</option>
                      <option value="weekly_summary">Weekly Summary</option>
                    </select>
                  </SettingRow>
                </SettingCard>

                <SettingCard
                  icon={FiClock}
                  title="Quiet Hours"
                  description="Automatically suppress non-urgent alerts during scheduled hours."
                >
                  <SettingRow
                    title="Enable Quiet Hours"
                    description="Mute sounds and notification popups during your off-work schedule."
                  >
                    <ToggleSwitch
                      label="Enable Quiet Hours"
                      checked={preferences.quietHoursEnabled}
                      onChange={(val) => updatePreference("quietHoursEnabled", val)}
                    />
                  </SettingRow>

                  {preferences.quietHoursEnabled && (
                    <SettingRow
                      title="Quiet Window"
                      description="Specify start and end times in 24h format (HH:MM)."
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={preferences.quietHoursStart || "22:00"}
                          onChange={(e) => updatePreference("quietHoursStart", e.target.value)}
                          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                        />
                        <span className="text-xs text-[var(--color-text-muted)]">to</span>
                        <input
                          type="time"
                          value={preferences.quietHoursEnd || "08:00"}
                          onChange={(e) => updatePreference("quietHoursEnd", e.target.value)}
                          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                        />
                      </div>
                    </SettingRow>
                  )}
                </SettingCard>

                <SettingCard
                  icon={FiCheckSquare}
                  title="Notification Event Categories"
                  description="Choose which specific TaskFlow activities trigger notification alerts."
                >
                  <SettingRow
                    title="Task Assignments"
                    description="When a task is assigned or reassigned to you."
                  >
                    <ToggleSwitch
                      label="Task Assignments"
                      checked={preferences.taskAssignments}
                      onChange={(val) => updatePreference("taskAssignments", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Deadline Reminders"
                    description="Approaching due-date alerts for active tasks within 24 hours."
                  >
                    <ToggleSwitch
                      label="Deadline Reminders"
                      checked={preferences.deadlineReminders}
                      onChange={(val) => updatePreference("deadlineReminders", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Task Status Updates"
                    description="When tasks on your projects move across Kanban status columns."
                  >
                    <ToggleSwitch
                      label="Task Status Updates"
                      checked={preferences.taskStatusUpdates}
                      onChange={(val) => updatePreference("taskStatusUpdates", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Mentions & Comments"
                    description="When team members mention you or comment on your tasks."
                  >
                    <ToggleSwitch
                      label="Mentions & Comments"
                      checked={preferences.mentionsAndComments}
                      onChange={(val) => updatePreference("mentionsAndComments", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Project Updates"
                    description="Status changes, milestone completions, or new members joining your projects."
                  >
                    <ToggleSwitch
                      label="Project Updates"
                      checked={preferences.projectUpdates}
                      onChange={(val) => updatePreference("projectUpdates", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Workspace Activity"
                    description="Invitations, role changes, and workspace membership updates."
                  >
                    <ToggleSwitch
                      label="Workspace Activity"
                      checked={preferences.workspaceActivity}
                      onChange={(val) => updatePreference("workspaceActivity", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="Risk Alerts"
                    description="Critical path delay hazards and schedule bottleneck alarms."
                  >
                    <ToggleSwitch
                      label="Risk Alerts"
                      checked={preferences.riskAlerts}
                      onChange={(val) => updatePreference("riskAlerts", val)}
                    />
                  </SettingRow>

                  <SettingRow
                    title="AI Recommendations & Insights"
                    description="Proactive intelligence suggestions delivered by Quackie."
                  >
                    <ToggleSwitch
                      label="AI Recommendations & Insights"
                      checked={preferences.aiRecommendationsNotif}
                      onChange={(val) => updatePreference("aiRecommendationsNotif", val)}
                    />
                  </SettingRow>
                </SettingCard>
              </>
            )}

            {/* 3. TASK PREFERENCES */}
            {activeCategory === "tasks" && (
              <SettingCard
                icon={FiCheckSquare}
                title="Task Management Defaults"
                description="Configure default views, priorities, and filters for tasks."
              >
                <SettingRow
                  title="Default Task View"
                  description="Choose which view loads when opening the My Tasks page."
                >
                  <select
                    value={preferences.defaultTaskView || "kanban"}
                    onChange={(e) => updatePreference("defaultTaskView", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="kanban">Kanban Board</option>
                    <option value="list">List View</option>
                    <option value="calendar">Calendar View</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Default Task Priority"
                  description="Initial priority pre-selected when creating new tasks."
                >
                  <select
                    value={preferences.defaultTaskPriority || "Medium"}
                    onChange={(e) => updatePreference("defaultTaskPriority", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Default Task Sorting"
                  description="Primary sort order applied to task lists."
                >
                  <select
                    value={preferences.defaultTaskSort || "due_date"}
                    onChange={(e) => updatePreference("defaultTaskSort", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="due_date">Due Date</option>
                    <option value="priority">Priority</option>
                    <option value="created_at">Date Created</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Show Completed Tasks by Default"
                  description="Display finished tasks in views without requiring a manual filter toggle."
                >
                  <ToggleSwitch
                    label="Show Completed Tasks"
                    checked={preferences.showCompletedTasks}
                    onChange={(val) => updatePreference("showCompletedTasks", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="Default Task Filter"
                  description="Filter scope applied on initial page navigation."
                >
                  <select
                    value={preferences.defaultTaskFilter || "all"}
                    onChange={(e) => updatePreference("defaultTaskFilter", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="all">All Workspace Tasks</option>
                    <option value="assigned_to_me">Assigned to Me</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Week Starts On"
                  description="First day of the week displayed on calendars and task planning views."
                >
                  <select
                    value={preferences.weekStartsOn || "Monday"}
                    onChange={(e) => updatePreference("weekStartsOn", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </SettingRow>
              </SettingCard>
            )}

            {/* 4. WORKSPACE PREFERENCES */}
            {activeCategory === "workspace" && (
              <SettingCard
                icon={FiLayers}
                title="Workspace & Navigation"
                description="Manage default workspaces, opening routes, and session memory."
              >
                <SettingRow
                  title="Default Workspace"
                  description="The workspace automatically activated upon logging in."
                >
                  <select
                    value={preferences.defaultWorkspaceId || ""}
                    onChange={(e) => updatePreference("defaultWorkspaceId", e.target.value || null)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] max-w-xs"
                  >
                    <option value="">First Available Workspace</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow
                  title="Default Landing Page"
                  description="The screen displayed immediately after signing in to TaskFlow."
                >
                  <select
                    value={preferences.defaultLandingPage || "dashboard"}
                    onChange={(e) => updatePreference("defaultLandingPage", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="dashboard">Dashboard (/)</option>
                    <option value="tasks">My Tasks (/tasks)</option>
                    <option value="projects">Projects (/projects)</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Remember Last Workspace"
                  description="Automatically reopen the workspace you were last viewing when you return."
                >
                  <ToggleSwitch
                    label="Remember Last Workspace"
                    checked={preferences.rememberLastWorkspace}
                    onChange={(val) => updatePreference("rememberLastWorkspace", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="Remember Last Project"
                  description="Keep the active project selected when transitioning between views."
                >
                  <ToggleSwitch
                    label="Remember Last Project"
                    checked={preferences.rememberLastProject}
                    onChange={(val) => updatePreference("rememberLastProject", val)}
                  />
                </SettingRow>
              </SettingCard>
            )}

            {/* 5. DATE & TIME */}
            {activeCategory === "datetime" && (
              <SettingCard
                icon={FiClock}
                title="Regional Date & Time"
                description="Format timestamps, dates, and deadlines according to your locale."
              >
                <SettingRow
                  title="Timezone"
                  description="All task milestones and due dates are formatted relative to this timezone."
                >
                  <select
                    value={preferences.timezone || "UTC"}
                    onChange={(e) => updatePreference("timezone", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="UTC">UTC (Universal Coordinated Time)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</option>
                    <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Date Format"
                  description="Formatting standard for deadline presentation."
                >
                  <select
                    value={preferences.dateFormat || "YYYY-MM-DD"}
                    onChange={(e) => updatePreference("dateFormat", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-11-03)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (03/11/2026)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (11/03/2026)</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Time Format"
                  description="Clock format used throughout charts, logs, and activity feeds."
                >
                  <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sage)] p-1">
                    <button
                      type="button"
                      onClick={() => updatePreference("timeFormat", "12h")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        preferences.timeFormat === "12h"
                          ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      12-hour (AM/PM)
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePreference("timeFormat", "24h")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        preferences.timeFormat === "24h"
                          ? "bg-white text-[var(--color-brand-hover)] shadow-xs"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      24-hour (Military)
                    </button>
                  </div>
                </SettingRow>
              </SettingCard>
            )}

            {/* 6. AI & INTELLIGENCE */}
            {activeCategory === "ai" && (
              <SettingCard
                icon={FiCpu}
                title="AI & Intelligence Preferences"
                description="Configure generative suggestions and conversational insights provided by Quackie."
              >
                <div className="p-3 mb-4 rounded-xl border border-[var(--color-brand-soft)] bg-[var(--color-surface-sage)] text-xs text-[var(--color-brand-hover)] flex items-start gap-2.5">
                  <FiInfo className="shrink-0 mt-0.5 text-[var(--color-brand)]" size={16} />
                  <span>
                    <strong>Deterministic Reliability Invariant:</strong> Disabling AI suggestions will only silence speculative recommendations and conversational prompts. Core project intelligence—including CPM Critical Path, dependency cycles, bottleneck analysis, and What-If models—remains 100% active.
                  </span>
                </div>

                <SettingRow
                  title="AI Recommendations & Tips"
                  description="Receive proactive advisory prompts for schedule health and resource balances."
                >
                  <ToggleSwitch
                    label="AI Recommendations"
                    checked={preferences.aiRecommendations}
                    onChange={(val) => updatePreference("aiRecommendations", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="Proactive Dashboard Insights"
                  description="Display AI-curated summary callouts atop your project dashboards."
                >
                  <ToggleSwitch
                    label="Proactive Insights"
                    checked={preferences.proactiveInsights}
                    onChange={(val) => updatePreference("proactiveInsights", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="AI Task Suggestions"
                  description="Suggest subtasks and estimated durations during task creation."
                >
                  <ToggleSwitch
                    label="AI Task Suggestions"
                    checked={preferences.aiTaskSuggestions}
                    onChange={(val) => updatePreference("aiTaskSuggestions", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="AI-Generated Summaries"
                  description="Summarize project activity feeds and weekly coordination briefs."
                >
                  <ToggleSwitch
                    label="AI-Generated Summaries"
                    checked={preferences.aiGeneratedSummaries}
                    onChange={(val) => updatePreference("aiGeneratedSummaries", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="Quackie Floating Assistant Hints"
                  description="Allow Quackie to show animated contextual tips when bottlenecks are discovered."
                >
                  <ToggleSwitch
                    label="Quackie Suggestions"
                    checked={preferences.quackieSuggestions}
                    onChange={(val) => updatePreference("quackieSuggestions", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="AI Insight Frequency"
                  description="Pace of proactive recommendations."
                >
                  <select
                    value={preferences.aiInsightFrequency || "medium"}
                    onChange={(e) => updatePreference("aiInsightFrequency", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="low">Low (Conservative)</option>
                    <option value="medium">Medium (Balanced)</option>
                    <option value="high">High (Active Guidance)</option>
                  </select>
                </SettingRow>
              </SettingCard>
            )}

            {/* 7. PRIVACY */}
            {activeCategory === "privacy" && (
              <SettingCard
                icon={FiShield}
                title="Privacy & Personalization"
                description="Control how your profile and timeline presence appear to workspace teammates."
              >
                <SettingRow
                  title="Profile Visibility"
                  description="Who can view your contact details and active workspace role."
                >
                  <select
                    value={preferences.profileVisibility || "team"}
                    onChange={(e) => updatePreference("profileVisibility", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="public">Public to Organization</option>
                    <option value="team">Workspace Teammates Only</option>
                    <option value="private">Private (Workspace Admins Only)</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Activity Visibility"
                  description="Determine who can view your task completion actions in the team timeline."
                >
                  <select
                    value={preferences.activityVisibility || "team"}
                    onChange={(e) => updatePreference("activityVisibility", e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="team">Team Only</option>
                    <option value="private">Only Me</option>
                  </select>
                </SettingRow>

                <SettingRow
                  title="Personalized Dashboard"
                  description="Customize metric cards to emphasize your assigned tasks and active projects."
                >
                  <ToggleSwitch
                    label="Personalized Dashboard"
                    checked={preferences.personalizedDashboard}
                    onChange={(val) => updatePreference("personalizedDashboard", val)}
                  />
                </SettingRow>

                <SettingRow
                  title="Personalized Recommendations"
                  description="Tailor coordination and standup agendas to your direct responsibilities."
                >
                  <ToggleSwitch
                    label="Personalized Recommendations"
                    checked={preferences.personalizedRecommendations}
                    onChange={(val) => updatePreference("personalizedRecommendations", val)}
                  />
                </SettingRow>
              </SettingCard>
            )}

            {/* 8. ACCOUNT & SECURITY */}
            {activeCategory === "account" && (
              <>
                <SettingCard
                  icon={FiLock}
                  title="Account Security & Authentication"
                  description="Manage credentials and safeguard your TaskFlow account."
                >
                  <div className="p-3 mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-text-muted)] flex items-start gap-2.5">
                    <FiInfo className="shrink-0 mt-0.5 text-[var(--color-info)]" size={16} />
                    <span>
                      <strong>Authentication Architecture:</strong> TaskFlow uses stateless JSON Web Tokens with standard 24-hour expiration. Two-Factor Authentication (2FA) and server-side multi-device session revocation are not configured in this deployment.
                    </span>
                  </div>

                  <SettingRow
                    title="Password & Security"
                    description="Keep your TaskFlow credentials strong and secure."
                  >
                    <Link to="/profile/change-password">
                      <Button variant="secondary" className="text-xs">
                        <FiKey size={14} />
                        Change Password
                        <FiExternalLink size={12} className="opacity-70" />
                      </Button>
                    </Link>
                  </SettingRow>

                  <SettingRow
                    title="Account Identity"
                    description="Update your name, profile photo, and registered email address."
                  >
                    <Link to="/profile">
                      <Button variant="secondary" className="text-xs">
                        Manage Profile
                        <FiExternalLink size={12} className="opacity-70" />
                      </Button>
                    </Link>
                  </SettingRow>
                </SettingCard>

                <SettingCard
                  icon={FiShield}
                  title="Current Browser Session"
                  description="Technical details regarding your active client browser connection."
                >
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                      <div>
                        <p className="text-xs font-semibold text-[var(--color-text)]">
                          Connected Account
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {currentUser?.email || "Current User"} ({currentUser?.role || "Member"})
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active Now
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--color-text-subtle)]">Browser: </span>
                        <span className="font-medium text-[var(--color-text)]">
                          {navigator.userAgent.includes("Chrome")
                            ? "Chrome / Chromium"
                            : navigator.userAgent.includes("Firefox")
                            ? "Firefox"
                            : "Web Browser"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--color-text-subtle)]">Platform: </span>
                        <span className="font-medium text-[var(--color-text)]">
                          {navigator.platform || "Desktop"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="danger"
                        onClick={handleLogoutAll}
                        className="text-xs font-semibold"
                      >
                        <FiLogOut size={14} />
                        Logout from Current Session
                      </Button>
                    </div>
                  </div>
                </SettingCard>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Resetting Defaults */}
      {isResetDialogOpen && (
        <Dialog
          isOpen={isResetDialogOpen}
          onClose={() => !isResetting && setIsResetDialogOpen(false)}
          title="Reset Preferences to Factory Defaults?"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              This action will restore all your preferences (theme, notification toggles, task defaults, and intelligence settings) back to system factory defaults.
            </p>
            <p className="text-xs font-semibold text-[var(--color-danger)]">
              This applies immediately to your account and cannot be undone.
            </p>

            <div className="flex justify-end gap-3 pt-3">
              <Button
                variant="secondary"
                disabled={isResetting}
                onClick={() => setIsResetDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={isResetting}
                onClick={handleResetConfirm}
              >
                {isResetting ? "Resetting..." : "Confirm & Reset Defaults"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </MainLayout>
  );
}

export default Settings;
