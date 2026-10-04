import React, { useState, useEffect } from "react";
import { FiActivity, FiFilter, FiChevronLeft, FiChevronRight, FiClock, FiUser } from "react-icons/fi";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { fetchAdminActivity } from "../../services/api/adminApi";

export default function AdminActivityFeed() {
  const [activities, setActivities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [actionType, setActionType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadActivity = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminActivity({
        actionType,
        page,
        limit: pagination.limit
      });
      setActivities(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load audit activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity(1);
  }, [actionType]);

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return "Just now";
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getActionBadge = (type) => {
    switch (type) {
      case "ADMIN_ROLE_CHANGE":
        return <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">Role Changed</span>;
      case "ADMIN_STATUS_CHANGE":
        return <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">Status Modified</span>;
      case "REPLANNING_EXECUTED":
        return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">Replan Executed</span>;
      default:
        return <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-600/20">{type || "Action"}</span>;
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="border-b border-[var(--color-border)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">System Audit Trail</h2>
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              Immutable chronological record of administrative changes, role modifications, and system events.
            </p>
          </div>

          {/* Action Type Filter */}
          <div className="flex items-center gap-2">
            <FiFilter size={13} className="text-[var(--color-text-muted)]" />
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
            >
              <option value="all">All Events</option>
              <option value="ADMIN_ROLE_CHANGE">Role Changes</option>
              <option value="ADMIN_STATUS_CHANGE">Status Changes</option>
              <option value="REPLANNING_EXECUTED">Replanning Events</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="m-5 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Activity Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-[var(--color-text-muted)]">
          <thead className="bg-[var(--color-canvas-soft)] text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-text-subtle)] border-b border-[var(--color-border)]">
            <tr>
              <th scope="col" className="px-5 py-3">Timestamp</th>
              <th scope="col" className="px-5 py-3">Actor</th>
              <th scope="col" className="px-5 py-3">Action Type</th>
              <th scope="col" className="px-5 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
            {loading ? (
              <tr>
                <td colSpan="4" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  Loading activity log...
                </td>
              </tr>
            ) : activities.length === 0 ? (
              <tr>
                <td colSpan="4" className="py-12 text-center text-xs text-[var(--color-text-subtle)]">
                  No administrative activity available.
                </td>
              </tr>
            ) : (
              activities.map((act) => (
                <tr key={act.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3.5 whitespace-nowrap text-[var(--color-text-subtle)]">
                    <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem]">
                      <FiClock size={11} /> {formatTimestamp(act.createdAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                      <FiUser size={12} className="text-purple-500" /> {act.actor}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {getActionBadge(act.actionType)}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text)] font-normal">
                    {act.description}
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
            onClick={() => loadActivity(pagination.page - 1)}
          >
            <FiChevronLeft size={13} /> Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadActivity(pagination.page + 1)}
          >
            Next <FiChevronRight size={13} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
