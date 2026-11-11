import {
  FiActivity,
  FiBell,
  FiBarChart2,
  FiCalendar,
  FiCheckSquare,
  FiColumns,
  FiFolder,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiSettings,
  FiUser,
  FiX,
  FiTrendingUp,
  FiCompass,
  FiShield,
  FiCpu,
  FiPieChart,
  FiChevronLeft,
  FiChevronRight,
  FiMessageSquare,
} from "react-icons/fi";
import { TbCrystalBall } from "react-icons/tb";
import { useLocation, useNavigate } from "react-router-dom";
import TaskFlowMark from "../components/brand/TaskFlowMark";
import NavItem from "../components/navigation/NavItem";
import { logoutUser } from "../services/api/authApi";
import { usePreferences } from "../context/PreferencesContext";
import { useChatNotifications } from "../context/ChatNotificationContext";

const coreNavigation = [
  { label: "Dashboard", icon: FiGrid, path: "/" },
  { label: "Workspaces", icon: FiLayers, path: "/workspaces" },
  { label: "Projects", icon: FiFolder, path: "/projects" },
  { label: "My Tasks", icon: FiCheckSquare, path: "/tasks" },
  { label: "Productivity", icon: FiTrendingUp, path: "/productivity" },
  { label: "Chat", icon: FiMessageSquare, path: "/chat" },
  { label: "Kanban", icon: FiColumns, path: "/kanban" },
  { label: "Calendar", icon: FiCalendar, path: "/calendar" },
];

const intelligenceNavigation = [
  { label: "Command Center", icon: FiCpu, path: "/command-center" },
  { label: "Coordination", icon: FiCompass, path: "/coordination" },
  { label: "What-If Simulation", icon: TbCrystalBall, path: "/what-if" },
  { label: "Portfolio Intelligence", icon: FiPieChart, path: "/portfolio" },
  { label: "Reports & Analytics", icon: FiBarChart2, path: "/reports" },
  { label: "Activity", icon: FiActivity, path: "/activity" },
];

const accountNavigation = [
  { label: "Profile", icon: FiUser, path: "/profile" },
  { label: "Settings", icon: FiSettings, path: "/settings" },
];

function Sidebar({ isOpen = false, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { preferences, updatePreference } = usePreferences();
  const { totalUnread } = useChatNotifications();
  const isCollapsed = Boolean(preferences.sidebarCollapsed);

  const navigateTo = (path) => {
    if (path) navigate(path);
    onClose();
  };
  const handleLogout = () => {
    logoutUser();
    navigate("/login", { replace: true });
    onClose();
  };

  const userStr = localStorage.getItem("taskflow_user");
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isAdmin = currentUser?.role?.trim().toLowerCase() === "admin";

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[rgb(52_67_51/0.16)] backdrop-blur-[2px] lg:hidden"
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-canvas-soft)_94%,transparent)] shadow-[var(--shadow-soft)] transition-all duration-300",
          isCollapsed ? "w-[17rem] lg:w-[5rem]" : "w-[17rem] lg:w-[17rem]",
          "lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0 lg:shadow-none",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-[4.75rem] items-center justify-between border-b border-[var(--color-border)] px-4 sm:px-5">
          <div className={isCollapsed ? "lg:hidden" : ""}>
            <TaskFlowMark />
          </div>
          {isCollapsed && (
            <div className="hidden lg:flex w-full justify-center">
              <span className="h-8 w-8 rounded-xl bg-[var(--color-brand)] flex items-center justify-center text-white font-bold text-sm">
                TF
              </span>
            </div>
          )}

          {/* Mobile close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-text)] lg:hidden"
          >
            <FiX size={19} />
          </button>

          {/* Desktop collapse toggle button */}
          <button
            type="button"
            onClick={() => updatePreference("sidebarCollapsed", !isCollapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition"
          >
            {isCollapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 scrollbar-none" aria-label="Primary navigation">
          {/* CORE WORK */}
          {!isCollapsed && (
            <p className="mb-3 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
              Core Work
            </p>
          )}
          <div className="space-y-1">
            {coreNavigation.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                isCollapsed={isCollapsed}
                active={location.pathname === item.path}
                badge={item.path === "/chat" ? totalUnread : undefined}
                onClick={() => navigateTo(item.path)}
              />
            ))}
          </div>

          {/* INTELLIGENCE & PLANNING */}
          {!isCollapsed && (
            <p className="mb-3 mt-8 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--color-brand)]">
              Intelligence & Planning
            </p>
          )}
          {isCollapsed && <div className="my-4 border-t border-[var(--color-border)]" />}
          <div className="space-y-1">
            {intelligenceNavigation.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                isCollapsed={isCollapsed}
                active={
                  location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`)
                }
                onClick={() => navigateTo(item.path)}
              />
            ))}
          </div>

          {/* ADMINISTRATION */}
          {isAdmin && (
            <>
              {!isCollapsed && (
                <p className="mb-3 mt-8 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-purple-600">
                  Administration
                </p>
              )}
              {isCollapsed && <div className="my-4 border-t border-[var(--color-border)]" />}
              <div className="space-y-1">
                <NavItem
                  label="Admin Dashboard"
                  icon={FiShield}
                  path="/admin"
                  isCollapsed={isCollapsed}
                  active={location.pathname === "/admin" || location.pathname.startsWith("/admin/")}
                  onClick={() => navigateTo("/admin")}
                />
              </div>
            </>
          )}

          {/* ACCOUNT */}
          {!isCollapsed && (
            <p className="mb-3 mt-8 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
              Account
            </p>
          )}
          {isCollapsed && <div className="my-4 border-t border-[var(--color-border)]" />}
          <div className="space-y-1">
            {accountNavigation.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                isCollapsed={isCollapsed}
                active={location.pathname === item.path}
                onClick={() => navigateTo(item.path)}
              />
            ))}
          </div>
        </nav>

        <div className="border-t border-[var(--color-border)] p-3">
          <button
            type="button"
            onClick={handleLogout}
            title={isCollapsed ? "Logout" : undefined}
            className={`flex w-full items-center ${
              isCollapsed ? "justify-center px-2" : "gap-3 px-3"
            } rounded-xl py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_20%,transparent)]`}
          >
            <FiLogOut size={18} aria-hidden="true" className="shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
