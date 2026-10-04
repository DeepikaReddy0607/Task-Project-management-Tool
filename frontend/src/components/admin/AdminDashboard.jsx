import React, { useState, useEffect } from "react";
import {
  FiShield,
  FiUsers,
  FiLayers,
  FiFolder,
  FiActivity,
  FiRefreshCw,
  FiAlertCircle
} from "react-icons/fi";
import Card from "../ui/Card";
import Button from "../ui/Button";
import AdminOverviewCards from "./AdminOverviewCards";
import AdminUserManagement from "./AdminUserManagement";
import AdminWorkspaceOverview from "./AdminWorkspaceOverview";
import AdminProjectOverview from "./AdminProjectOverview";
import AdminActivityFeed from "./AdminActivityFeed";
import { fetchAdminOverview } from "../../services/api/adminApi";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminOverview();
      setOverview(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load platform overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: FiShield },
    { id: "users", label: "Users & Roles", icon: FiUsers },
    { id: "workspaces", label: "Workspaces", icon: FiLayers },
    { id: "projects", label: "Projects", icon: FiFolder },
    { id: "activity", label: "Audit Trail", icon: FiActivity }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <FiShield size={16} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
              Admin Dashboard
            </h1>
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
              Platform RBAC
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
            Platform governance, user role administration, workspace oversight, and immutable system audit logging.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            className="flex items-center gap-1.5"
            disabled={loading}
          >
            <FiRefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--color-border)]">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-medium transition ${
                  isActive
                    ? "border-[var(--color-brand)] text-[var(--color-brand)] font-semibold"
                    : "border-transparent text-[var(--color-text-subtle)] hover:border-slate-300 hover:text-[var(--color-text)]"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <FiAlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <AdminOverviewCards overview={overview} />

          {/* Quick Snapshot Section */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent Audit Activities */}
            <Card className="p-5">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] flex items-center gap-2">
                  <FiActivity size={14} className="text-purple-600" /> Recent Administrative Activity
                </h3>
                <button
                  onClick={() => setActiveTab("activity")}
                  className="text-xs font-medium text-[var(--color-brand)] hover:underline"
                >
                  View Full Audit Log &rarr;
                </button>
              </div>

              <div className="mt-3 divide-y divide-[var(--color-border)]">
                {overview?.recentActivity?.length > 0 ? (
                  overview.recentActivity.slice(0, 5).map((act) => (
                    <div key={act.id} className="py-2.5 flex items-start justify-between text-xs">
                      <div>
                        <div className="font-medium text-[var(--color-text)]">{act.description}</div>
                        <div className="text-[0.6875rem] text-[var(--color-text-subtle)]">By {act.actor}</div>
                      </div>
                      <span className="text-[0.6875rem] text-[var(--color-text-subtle)] font-mono whitespace-nowrap ml-4">
                        {new Date(act.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-[var(--color-text-subtle)]">
                    No recent administrative activity recorded.
                  </div>
                )}
              </div>
            </Card>

            {/* Platform Quick Governance Actions */}
            <Card className="p-5 flex flex-col justify-between">
              <div>
                <div className="border-b border-[var(--color-border)] pb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] flex items-center gap-2">
                    <FiShield size={14} className="text-emerald-600" /> Platform Administration Guidelines
                  </h3>
                </div>

                <div className="mt-3 space-y-2.5 text-xs text-[var(--color-text-muted)]">
                  <div className="flex items-start gap-2">
                    <span className="rounded-full bg-purple-100 p-1 text-purple-700 text-[10px] font-bold">1</span>
                    <span><strong>Server-Side RBAC Enforcement:</strong> Every administrative API is guarded server-side by <code>requireAdmin</code>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="rounded-full bg-purple-100 p-1 text-purple-700 text-[10px] font-bold">2</span>
                    <span><strong>Self-Demotion Guard:</strong> The system strictly protects the last active administrator from demotion or deactivation.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="rounded-full bg-purple-100 p-1 text-purple-700 text-[10px] font-bold">3</span>
                    <span><strong>Credential Redaction:</strong> Password hashes, JWT secrets, and auth tokens are never returned in administrative endpoints.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="rounded-full bg-purple-100 p-1 text-purple-700 text-[10px] font-bold">4</span>
                    <span><strong>Explicit Confirmation:</strong> Role modifications and account deactivations require deliberate confirmation modals.</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[var(--color-border)] flex items-center gap-3">
                <Button size="sm" variant="secondary" onClick={() => setActiveTab("users")} className="flex-1">
                  Manage Users & Roles
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setActiveTab("workspaces")} className="flex-1">
                  Manage Workspaces
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <AdminUserManagement onActionCompleted={loadOverview} />
      )}

      {activeTab === "workspaces" && (
        <AdminWorkspaceOverview />
      )}

      {activeTab === "projects" && (
        <AdminProjectOverview />
      )}

      {activeTab === "activity" && (
        <AdminActivityFeed />
      )}
    </div>
  );
}
