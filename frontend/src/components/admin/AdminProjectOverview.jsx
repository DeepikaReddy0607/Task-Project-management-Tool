import React, { useState, useEffect } from "react";
import {
  FiSearch,
  FiFilter,
  FiFolder,
  FiUsers,
  FiCheckSquare,
  FiChevronLeft,
  FiChevronRight,
  FiCalendar,
  FiArchive
} from "react-icons/fi";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { fetchAdminProjects } from "../../services/api/adminApi";

export default function AdminProjectOverview() {
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProjects = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminProjects({
        search,
        status: statusFilter,
        page,
        limit: pagination.limit
      });
      setProjects(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects(1);
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadProjects(1);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const getStatusBadge = (project) => {
    if (project.isArchived) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
          <FiArchive size={11} /> Archived
        </span>
      );
    }

    switch (project.status?.toLowerCase()) {
      case "completed":
        return <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Completed</span>;
      case "in progress":
        return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">In Progress</span>;
      case "on hold":
        return <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">On Hold</span>;
      default:
        return <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-600/20">{project.status || "Planning"}</span>;
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="border-b border-[var(--color-border)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">System Projects Overview</h2>
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              High-level administrative status and task volume across all system projects.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="h-9 w-48 sm:w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
          </form>
        </div>

        {/* Status Filter */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <FiFilter size={13} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
          >
            <option value="all">All Projects</option>
            <option value="active">Active Only</option>
            <option value="archived">Archived Only</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Planning">Planning</option>
          </select>

          <span className="ml-auto text-xs text-[var(--color-text-subtle)]">
            Total Projects: <strong>{pagination.total}</strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="m-5 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Projects Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-[var(--color-text-muted)]">
          <thead className="bg-[var(--color-canvas-soft)] text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] border-b border-[var(--color-border)]">
            <tr>
              <th scope="col" className="px-5 py-3">Project Title</th>
              <th scope="col" className="px-5 py-3">Workspace</th>
              <th scope="col" className="px-5 py-3">Manager</th>
              <th scope="col" className="px-5 py-3">Members</th>
              <th scope="col" className="px-5 py-3">Tasks</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
            {loading ? (
              <tr>
                <td colSpan="7" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  Loading projects...
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  No projects found.
                </td>
              </tr>
            ) : (
              projects.map((proj) => (
                <tr key={proj.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <FiFolder size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-[var(--color-text)]">{proj.title}</div>
                        {proj.description && (
                          <div className="text-[0.6875rem] text-[var(--color-text-subtle)] max-w-xs truncate">
                            {proj.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-medium text-[var(--color-text)]">
                    {proj.workspaceName}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="font-medium text-[var(--color-text)]">{proj.managerName}</div>
                    {proj.managerEmail && (
                      <div className="text-[0.6875rem] text-[var(--color-text-subtle)]">{proj.managerEmail}</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]">
                      <FiUsers size={12} className="text-blue-500" /> {proj.memberCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]">
                      <FiCheckSquare size={12} className="text-emerald-500" /> {proj.taskCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {getStatusBadge(proj)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-[var(--color-text-subtle)]">
                    <span className="inline-flex items-center gap-1">
                      <FiCalendar size={12} /> {formatDate(proj.createdAt)}
                    </span>
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
          Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} total)
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pagination.page <= 1 || loading}
            onClick={() => loadProjects(pagination.page - 1)}
          >
            <FiChevronLeft size={13} /> Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadProjects(pagination.page + 1)}
          >
            Next <FiChevronRight size={13} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
