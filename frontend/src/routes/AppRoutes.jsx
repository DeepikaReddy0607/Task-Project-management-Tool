import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "../pages/dashboard/Dashboard";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import Workspaces from "../pages/workspaces/Workspaces";
import Projects from "../pages/projects/Projects";
import Profile from "../pages/profile/Profile";
import ChangePassword from "../pages/profile/ChangePassword";
import Tasks from "../pages/tasks/Tasks";
import Calendar from "../pages/calendar/Calendar";
import Kanban from "../pages/kanban/Kanban";
import Activity from "../pages/activity/Activity";
import FirstTimeExperience from "../components/onboarding/FirstTimeExperience";
import WhatIf from "../pages/WhatIf";
import PortfolioIntelligence from "../pages/PortfolioIntelligence";
import CoordinationPage from "../pages/CoordinationPage";
import ProjectCommandCenterPage from "../pages/ProjectCommandCenterPage";
import AdminDashboardPage from "../pages/admin/AdminDashboardPage";
import SearchPage from "../pages/search/SearchPage";
import { AssistantProvider } from "../context/AssistantContext";
import { SocketProvider } from "../context/SocketContext";

function AppRoutes() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <AssistantProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/change-password" element={<ChangePassword />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/what-if" element={<WhatIf />} />

            <Route path="/portfolio" element={<PortfolioIntelligence />} />
            <Route path="/portfolio-intelligence" element={<PortfolioIntelligence />} />

            <Route path="/coordination" element={<CoordinationPage />} />
            <Route path="/coordination-dashboard" element={<CoordinationPage />} />
            <Route path="/briefing" element={<CoordinationPage />} />
            <Route path="/standup" element={<CoordinationPage />} />
            <Route path="/approval-center" element={<CoordinationPage />} />

            <Route path="/command-center" element={<ProjectCommandCenterPage />} />
            <Route path="/project-command-center" element={<ProjectCommandCenterPage />} />

            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />

            <Route path="/search" element={<SearchPage />} />

            <Route path="/onboarding" element={<FirstTimeExperience />} />
          </Routes>
        </AssistantProvider>
      </SocketProvider>
    </BrowserRouter>
  );
}

export default AppRoutes;
