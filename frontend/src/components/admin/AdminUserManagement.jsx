import React, { useState, useEffect } from "react";
import {
  FiSearch,
  FiFilter,
  FiUserCheck,
  FiUserX,
  FiEdit2,
  FiChevronLeft,
  FiChevronRight,
  FiAlertTriangle,
  FiCheckCircle,
  FiX
} from "react-icons/fi";
import Card from "../ui/Card";
import Button from "../ui/Button";
import {
  fetchAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus
} from "../../services/api/adminApi";

export default function AdminUserManagement({ onActionCompleted }) {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Modal states
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRole, setNewRole] = useState("Team Member");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminUsers({
        search,
        role: roleFilter,
        status: statusFilter,
        page,
        limit: pagination.limit
      });
      setUsers(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, [roleFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadUsers(1);
  };

  const openRoleModal = (user) => {
    setSelectedUser(user);
    setNewRole(user.role || "Team Member");
    setRoleModalOpen(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedUser) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await updateAdminUserRole(selectedUser.id, newRole);
      setSuccessMessage(`Role for ${selectedUser.fullName || selectedUser.email} updated to ${newRole}`);
      setRoleModalOpen(false);
      loadUsers(pagination.page);
      if (onActionCompleted) onActionCompleted();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to update role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openStatusModal = (user) => {
    setSelectedUser(user);
    setStatusModalOpen(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedUser) return;
    const nextStatus = !selectedUser.isActive;
    try {
      setIsSubmitting(true);
      setError(null);
      await updateAdminUserStatus(selectedUser.id, nextStatus);
      setSuccessMessage(`User ${selectedUser.fullName || selectedUser.email} has been ${nextStatus ? "activated" : "deactivated"}`);
      setStatusModalOpen(false);
      loadUsers(pagination.page);
      if (onActionCompleted) onActionCompleted();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to update user status");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role?.toLowerCase()) {
      case "admin":
        return <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">Admin</span>;
      case "project manager":
        return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">Project Manager</span>;
      default:
        return <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-600/20">Team Member</span>;
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="border-b border-[var(--color-border)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">User Management</h2>
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              Inspect user accounts, manage RBAC roles, and control account activation status.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email..."
                className="h-9 w-48 sm:w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
          </form>
        </div>

        {/* Filter Dropdowns */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <FiFilter size={13} />
            <span>Role:</span>
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
          >
            <option value="all">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Project Manager">Project Manager</option>
            <option value="Team Member">Team Member</option>
          </select>

          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)] ml-2">
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <span className="ml-auto text-xs text-[var(--color-text-subtle)]">
            Total Users: <strong>{pagination.total}</strong>
          </span>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="mx-5 mt-4 flex items-center justify-between rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <div className="flex items-center gap-2">
            <FiAlertTriangle size={15} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <FiX size={14} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mx-5 mt-4 flex items-center justify-between rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
          <div className="flex items-center gap-2">
            <FiCheckCircle size={15} />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-[var(--color-text-muted)]">
          <thead className="bg-[var(--color-canvas-soft)] text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] border-b border-[var(--color-border)]">
            <tr>
              <th scope="col" className="px-5 py-3">User</th>
              <th scope="col" className="px-5 py-3">Role</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">Workspaces</th>
              <th scope="col" className="px-5 py-3">Projects</th>
              <th scope="col" className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
            {loading ? (
              <tr>
                <td colSpan="6" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  No users found matching your criteria.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                        {user.firstName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-[var(--color-text)]">
                          {user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.email}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--color-text-subtle)]">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {getRoleBadge(user.role)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-[var(--color-text)]">
                    {user.workspaceCount ?? 0}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-[var(--color-text)]">
                    {user.projectCount ?? 0}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => openRoleModal(user)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--color-text)] hover:bg-slate-50 hover:text-[var(--color-brand)] transition"
                    >
                      <FiEdit2 size={11} /> Change Role
                    </button>
                    <button
                      type="button"
                      onClick={() => openStatusModal(user)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.6875rem] font-medium transition ${
                        user.isActive
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {user.isActive ? <><FiUserX size={11} /> Deactivate</> : <><FiUserCheck size={11} /> Activate</>}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-text-subtle)]">
        <div>
          Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pagination.page <= 1 || loading}
            onClick={() => loadUsers(pagination.page - 1)}
          >
            <FiChevronLeft size={13} /> Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadUsers(pagination.page + 1)}
          >
            Next <FiChevronRight size={13} />
          </Button>
        </div>
      </div>

      {/* ROLE CHANGE MODAL (Requires Explicit Confirmation) */}
      {roleModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text)]">Change User Role</h3>
                <p className="text-xs text-[var(--color-text-subtle)] mt-1">
                  Update Role-Based Access Control (RBAC) permissions.
                </p>
              </div>
              <button
                onClick={() => setRoleModalOpen(false)}
                className="rounded-lg p-1 text-[var(--color-text-subtle)] hover:bg-slate-100"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs">
                <div className="font-semibold text-[var(--color-text)]">{selectedUser.fullName || selectedUser.email}</div>
                <div className="text-[var(--color-text-subtle)]">{selectedUser.email}</div>
                <div className="mt-1 text-[var(--color-text-muted)]">
                  Current role: <strong>{selectedUser.role}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  Select New Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="Admin">Admin (Full administrative privileges)</option>
                  <option value="Project Manager">Project Manager (Project & task leadership)</option>
                  <option value="Team Member">Team Member (Task participation)</option>
                </select>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200/60 flex items-start gap-2">
                <FiAlertTriangle className="shrink-0 mt-0.5" size={14} />
                <span>
                  <strong>Explicit Confirmation Required:</strong> Modifying roles alters system access immediately. Self-demotion protection prevents demoting the last active administrator.
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRoleModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmRoleChange}
                disabled={isSubmitting || newRole === selectedUser.role}
              >
                {isSubmitting ? "Updating..." : "Confirm Role Change"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STATUS TOGGLE MODAL (Deactivation / Activation Confirmation) */}
      {statusModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text)]">
                  {selectedUser.isActive ? "Deactivate User Account" : "Activate User Account"}
                </h3>
                <p className="text-xs text-[var(--color-text-subtle)] mt-1">
                  Manage login capability and workspace access.
                </p>
              </div>
              <button
                onClick={() => setStatusModalOpen(false)}
                className="rounded-lg p-1 text-[var(--color-text-subtle)] hover:bg-slate-100"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs">
                <div className="font-semibold text-[var(--color-text)]">{selectedUser.fullName || selectedUser.email}</div>
                <div className="text-[var(--color-text-subtle)]">{selectedUser.email}</div>
                <div className="mt-1 text-[var(--color-text-muted)]">
                  Role: <strong>{selectedUser.role}</strong>
                </div>
              </div>

              {selectedUser.isActive ? (
                <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200/60 flex items-start gap-2">
                  <FiAlertTriangle className="shrink-0 mt-0.5 text-red-600" size={14} />
                  <span>
                    <strong>Warning:</strong> Deactivating this user will prevent them from signing in or accessing any workspaces. The last remaining administrator cannot be deactivated.
                  </span>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200/60 flex items-start gap-2">
                  <FiCheckCircle className="shrink-0 mt-0.5 text-emerald-600" size={14} />
                  <span>
                    Activating this user will immediately restore their sign-in capabilities and access.
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStatusModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant={selectedUser.isActive ? "danger" : "primary"}
                size="sm"
                onClick={handleConfirmStatusChange}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Processing..."
                  : selectedUser.isActive
                  ? "Confirm Deactivation"
                  : "Confirm Activation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
