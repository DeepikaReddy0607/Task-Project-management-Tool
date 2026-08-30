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
function AppRoutes() {
  return (
    <BrowserRouter>
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
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
