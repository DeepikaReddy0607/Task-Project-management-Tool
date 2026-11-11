import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/auth/ProtectedRoute";
import { AssistantProvider } from "../context/AssistantContext";
import { SocketProvider } from "../context/SocketContext";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ChatNotificationProvider } from "../context/ChatNotificationContext";

// Lazy-loaded routes for optimal bundle code-splitting
const Dashboard = lazy(() => import("../pages/dashboard/Dashboard"));
const Login = lazy(() => import("../pages/auth/Login"));
const Register = lazy(() => import("../pages/auth/Register"));
const VerifyOtp = lazy(() => import("../pages/auth/VerifyOtp"));
const ForgotPassword = lazy(() => import("../pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));
const Workspaces = lazy(() => import("../pages/workspaces/Workspaces"));
const Projects = lazy(() => import("../pages/projects/Projects"));
const Profile = lazy(() => import("../pages/profile/Profile"));
const Settings = lazy(() => import("../pages/settings/Settings"));
const ChangePassword = lazy(() => import("../pages/profile/ChangePassword"));
const Tasks = lazy(() => import("../pages/tasks/Tasks"));
const Calendar = lazy(() => import("../pages/calendar/Calendar"));
const Kanban = lazy(() => import("../pages/kanban/Kanban"));
const Activity = lazy(() => import("../pages/activity/Activity"));
const Reports = lazy(() => import("../pages/reports/Reports"));
const Productivity = lazy(() => import("../pages/productivity/Productivity"));
const Chat = lazy(() => import("../pages/chat/Chat"));
const WhatIf = lazy(() => import("../pages/WhatIf"));
const PortfolioIntelligence = lazy(() => import("../pages/PortfolioIntelligence"));
const CoordinationPage = lazy(() => import("../pages/CoordinationPage"));
const ProjectCommandCenterPage = lazy(() => import("../pages/ProjectCommandCenterPage"));
const AdminDashboardPage = lazy(() => import("../pages/admin/AdminDashboardPage"));
const SearchPage = lazy(() => import("../pages/search/SearchPage"));
const FirstTimeExperience = lazy(() => import("../components/onboarding/FirstTimeExperience"));
const NotFound = lazy(() => import("../pages/NotFound"));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-brand)] border-t-transparent" />
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Loading TaskFlow...</span>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <ChatNotificationProvider>
          <PreferencesProvider>
            <AssistantProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                {/* Public Authentication Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify-otp" element={<Navigate to="/login" replace />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Protected Application Routes */}
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/workspaces" element={<ProtectedRoute><Workspaces /></ProtectedRoute>} />
                <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/profile/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
                <Route path="/kanban" element={<ProtectedRoute><Kanban /></ProtectedRoute>} />
                <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/productivity" element={<ProtectedRoute><Productivity /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                <Route path="/what-if" element={<ProtectedRoute><WhatIf /></ProtectedRoute>} />

                <Route path="/portfolio" element={<ProtectedRoute><PortfolioIntelligence /></ProtectedRoute>} />
                <Route path="/portfolio-intelligence" element={<ProtectedRoute><PortfolioIntelligence /></ProtectedRoute>} />

                <Route path="/coordination" element={<ProtectedRoute><CoordinationPage /></ProtectedRoute>} />
                <Route path="/coordination-dashboard" element={<ProtectedRoute><CoordinationPage /></ProtectedRoute>} />
                <Route path="/briefing" element={<ProtectedRoute><CoordinationPage /></ProtectedRoute>} />
                <Route path="/standup" element={<ProtectedRoute><CoordinationPage /></ProtectedRoute>} />
                <Route path="/approval-center" element={<ProtectedRoute><CoordinationPage /></ProtectedRoute>} />

                <Route path="/command-center" element={<ProtectedRoute><ProjectCommandCenterPage /></ProtectedRoute>} />
                <Route path="/project-command-center" element={<ProtectedRoute><ProjectCommandCenterPage /></ProtectedRoute>} />

                <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
                <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />

                <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
                <Route path="/onboarding" element={<ProtectedRoute><FirstTimeExperience /></ProtectedRoute>} />

                {/* 404 Catch-All Route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AssistantProvider>
        </PreferencesProvider>
      </ChatNotificationProvider>
    </SocketProvider>
  </BrowserRouter>
  );
}

export default AppRoutes;
