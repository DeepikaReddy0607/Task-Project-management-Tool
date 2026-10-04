import React from "react";
import { FiUsers, FiLayers, FiFolder, FiShield, FiUserCheck, FiUserX, FiCheckCircle } from "react-icons/fi";
import Card from "../ui/Card";

export default function AdminOverviewCards({ overview }) {
  if (!overview) return null;

  const { users, workspaces, projects, memberships } = overview;

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
      {/* Users Metric Card */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Total Users
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FiUsers size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[var(--color-text)]">
              {users?.total ?? 0}
            </span>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <FiUserCheck size={13} /> {users?.active ?? 0} active
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)] space-y-1">
          <div className="flex justify-between">
            <span>Admins:</span>
            <span className="font-semibold text-purple-600">{users?.byRole?.admin ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Project Managers:</span>
            <span className="font-semibold text-blue-600">{users?.byRole?.projectManager ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Team Members:</span>
            <span className="font-semibold text-slate-600">{users?.byRole?.teamMember ?? 0}</span>
          </div>
          {users?.inactive > 0 && (
            <div className="flex justify-between text-amber-600">
              <span className="flex items-center gap-1"><FiUserX size={12} /> Inactive:</span>
              <span className="font-semibold">{users?.inactive}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Workspaces Metric Card */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Workspaces
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <FiLayers size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[var(--color-text)]">
              {workspaces?.total ?? 0}
            </span>
            <span className="text-xs text-[var(--color-text-subtle)]">across platform</span>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)] space-y-1">
          <div className="flex justify-between">
            <span>Workspace Memberships:</span>
            <span className="font-semibold text-[var(--color-text)]">{memberships?.totalWorkspaceMemberships ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Avg Members/Workspace:</span>
            <span className="font-semibold text-[var(--color-text)]">
              {workspaces?.total > 0 ? ((memberships?.totalWorkspaceMemberships || 0) / workspaces.total).toFixed(1) : 0}
            </span>
          </div>
        </div>
      </Card>

      {/* Projects Metric Card */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Total Projects
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FiFolder size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[var(--color-text)]">
              {projects?.total ?? 0}
            </span>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <FiCheckCircle size={13} /> {projects?.active ?? 0} active
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)] space-y-1">
          <div className="flex justify-between">
            <span>Archived Projects:</span>
            <span className="font-semibold text-[var(--color-text-subtle)]">{projects?.archived ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Project Memberships:</span>
            <span className="font-semibold text-[var(--color-text)]">{memberships?.totalProjectMemberships ?? 0}</span>
          </div>
        </div>
      </Card>

      {/* RBAC Security & Platform Card */}
      <Card className="flex flex-col justify-between bg-gradient-to-br from-slate-50 to-emerald-50/40">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Platform Security
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FiShield size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span> RBAC Guard Enforced
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)] space-y-1">
          <div className="flex justify-between">
            <span>Audit Trail:</span>
            <span className="font-semibold text-emerald-700">Active</span>
          </div>
          <div className="flex justify-between">
            <span>Credential Exposure:</span>
            <span className="font-semibold text-emerald-700">0 (Redacted)</span>
          </div>
          <div className="flex justify-between">
            <span>Last Admin Demotion:</span>
            <span className="font-semibold text-emerald-700">Protected</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
