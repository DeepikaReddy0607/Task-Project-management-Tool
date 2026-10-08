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
  FiCompass,
  FiShield,
  FiCpu,
  FiPieChart,
  FiLock,
} from "react-icons/fi";
import { TbCrystalBall } from "react-icons/tb";
import { useLocation, useNavigate } from "react-router-dom";
import TaskFlowMark from "../components/brand/TaskFlowMark";
import NavItem from "../components/navigation/NavItem";
import { logoutUser } from "../services/api/authApi";

const coreNavigation = [
  { label: "Dashboard", icon: FiGrid, path: "/" },
  { label: "Workspaces", icon: FiLayers, path: "/workspaces" },
  { label: "Projects", icon: FiFolder, path: "/projects" },
  { label: "My Tasks", icon: FiCheckSquare, path: "/tasks" },
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
  { label: "Change Password", icon: FiLock, path: "/profile/change-password" },
];

function Sidebar({ isOpen = false, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
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
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-canvas-soft)_94%,transparent)] shadow-[var(--shadow-soft)] transition-transform duration-300",
          "lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0 lg:shadow-none",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-[4.75rem] items-center justify-between border-b border-[var(--color-border)] px-5">
          <TaskFlowMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-text)] lg:hidden"
          >
            <FiX size={19} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Primary navigation">
          {/* CORE WORK */}
          <p className="mb-3 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
            Core Work
          </p>
          <div className="space-y-1">
            {coreNavigation.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                active={location.pathname === item.path}
                onClick={() => navigateTo(item.path)}
              />
            ))}
          </div>

          {/* INTELLIGENCE & PLANNING */}
          <p className="mb-3 mt-8 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--color-brand)]">
            Intelligence & Planning
          </p>
          <div className="space-y-1">
            {intelligenceNavigation.map((item) => (
              <NavItem
                key={item.label}
                {...item}
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
              <p className="mb-3 mt-8 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-purple-600">
                Administration
              </p>
              <div className="space-y-1">
                <NavItem
                  label="Admin Dashboard"
                  icon={FiShield}
                  path="/admin"
                  active={location.pathname === "/admin" || location.pathname.startsWith("/admin/")}
                  onClick={() => navigateTo("/admin")}
                />
              </div>
            </>
          )}

          {/* ACCOUNT */}
          <p className="mb-3 mt-8 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
            Account
          </p>
          <div className="space-y-1">
            {accountNavigation.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                active={location.pathname === item.path}
                onClick={() => navigateTo(item.path)}
              />
            ))}
          </div>
        </nav>
        <div className="border-t border-[var(--color-border)] p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_20%,transparent)]"
          >
            <FiLogOut size={18} aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
