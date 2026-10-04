import React, { useState, useEffect } from "react";
import { FiSearch, FiLayers, FiUsers, FiFolder, FiChevronLeft, FiChevronRight, FiCalendar } from "react-icons/fi";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { fetchAdminWorkspaces } from "../../services/api/adminApi";

export default function AdminWorkspaceOverview() {
  const [workspaces, setWorkspaces] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadWorkspaces = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminWorkspaces({ search, page, limit: pagination.limit });
      setWorkspaces(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces(1);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadWorkspaces(1);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="border-b border-[var(--color-border)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Workspace Administration</h2>
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              System-wide overview of all registered workspaces, team sizes, and project counts.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces..."
                className="h-9 w-48 sm:w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
          </form>
        </div>
      </div>

      {error && (
        <div className="m-5 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Workspaces Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-[var(--color-text-muted)]">
          <thead className="bg-[var(--color-canvas-soft)] text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] border-b border-[var(--color-border)]">
            <tr>
              <th scope="col" className="px-5 py-3">Workspace Name</th>
              <th scope="col" className="px-5 py-3">Owner</th>
              <th scope="col" className="px-5 py-3">Members</th>
              <th scope="col" className="px-5 py-3">Projects</th>
              <th scope="col" className="px-5 py-3">Created Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
            {loading ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  Loading workspaces...
                </td>
              </tr>
            ) : workspaces.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  No workspaces found.
                </td>
              </tr>
            ) : (
              workspaces.map((ws) => (
                <tr key={ws.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                        <FiLayers size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-[var(--color-text)]">{ws.name}</div>
                        {ws.description && (
                          <div className="text-[0.6875rem] text-[var(--color-text-subtle)] max-w-xs truncate">
                            {ws.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="font-medium text-[var(--color-text)]">{ws.ownerName}</div>
                    <div className="text-[0.6875rem] text-[var(--color-text-subtle)]">{ws.ownerEmail}</div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                      <FiUsers size={13} className="text-blue-500" /> {ws.memberCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                      <FiFolder size={13} className="text-emerald-500" /> {ws.projectCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-[var(--color-text-subtle)]">
                    <span className="inline-flex items-center gap-1">
                      <FiCalendar size={12} /> {formatDate(ws.createdAt)}
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
            onClick={() => loadWorkspaces(pagination.page - 1)}
          >
            <FiChevronLeft size={13} /> Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadWorkspaces(pagination.page + 1)}
          >
            Next <FiChevronRight size={13} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
