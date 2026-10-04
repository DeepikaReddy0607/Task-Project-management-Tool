import React from "react";
import { useNavigate } from "react-router-dom";
import { FiShield, FiAlertTriangle, FiArrowLeft } from "react-icons/fi";
import MainLayout from "../../layouts/MainLayout";
import AdminDashboard from "../../components/admin/AdminDashboard";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  // Inspect current logged in user and role
  const userStr = localStorage.getItem("taskflow_user");
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isAdmin = currentUser?.role?.trim().toLowerCase() === "admin";

  return (
    <MainLayout>
      {isAdmin ? (
        <AdminDashboard />
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
          <Card className="max-w-md text-center p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <FiShield size={28} />
            </div>

            <h2 className="mt-4 text-lg font-bold text-[var(--color-text)]">
              Administrator Access Required
            </h2>

            <p className="mt-2 text-xs text-[var(--color-text-muted)] leading-relaxed">
              This dashboard is restricted to system administrators. Your current account ({currentUser?.email || "Guest"}) does not have administrative privileges.
            </p>

            <div className="mt-6 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/")}
                className="flex items-center gap-1.5"
              >
                <FiArrowLeft size={14} /> Return to Dashboard
              </Button>
            </div>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}
