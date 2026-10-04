import React, { useState, useEffect } from "react";
import {
  FiClock,
  FiFilter,
  FiUser,
  FiAlertCircle,
  FiCheckCircle,
  FiGitCommit,
  FiLayers,
  FiChevronLeft,
  FiChevronRight,
  FiRefreshCw,
  FiInfo,
  FiX
} from "react-icons/fi";
import { getProjectTimeline } from "../../services/api/intelligenceApi";

export default function ProjectHistoryTimeline({ projectId, className = "" }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedSeverity, setSelectedSeverity] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [activeModalEvent, setActiveModalEvent] = useState(null);

  const fetchTimeline = async (pageNum = 1) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getProjectTimeline(projectId, {
        page: pageNum,
        limit: 15,
        severity: selectedSeverity || undefined,
        type: selectedType || undefined,
        order: "desc"
      });

      if (res.success && res.data) {
        setEvents(res.data.events || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
        setTotalPages(res.data.totalPages || 1);
      } else {
        setEvents([]);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load project timeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchTimeline(1);
  }, [projectId, selectedSeverity, selectedType]);

  const severityBadge = (sev) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800";
      case "HIGH":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800";
      case "MEDIUM":
        return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800";
      case "LOW":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800";
      default:
        return "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-800";
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header and Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FiClock className="text-primary" />
              Project Intelligence Timeline
            </h3>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {total} Events
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Normalized, immutable historical record of all project mutations and milestones.
          </p>
        </div>

        {/* Severity & Type Selectors */}
        <div className="flex items-center space-x-2">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="INFO">Info</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200"
          >
            <option value="">All Event Types</option>
            <option value="TASK_CREATED">Task Created</option>
            <option value="TASK_UPDATED">Task Updated</option>
            <option value="TASK_COMPLETED">Task Completed</option>
            <option value="DEPENDENCY_CREATED">Dependency Created</option>
            <option value="DECISION_RECORDED">Decision Recorded</option>
            <option value="HEALTH_DEGRADED">Health Degraded</option>
            <option value="REPLANNING_EXECUTED">Replanning Executed</option>
          </select>

          <button
            onClick={() => fetchTimeline(page)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Refresh Timeline"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Events Table / Timeline List */}
      {loading ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-2 text-slate-500">
          <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
          <span>Loading historical events...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400">
          <div className="flex items-center space-x-2 font-semibold">
            <FiAlertCircle className="w-5 h-5" />
            <span>Failed to load timeline</span>
          </div>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
          <FiLayers className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No Events Match Selected Filters</h4>
          <p className="text-xs text-slate-500 mt-1">Try resetting severity or event type filters to view all recorded timeline items.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
          {events.map((ev) => {
            const dateObj = new Date(ev.timestamp);
            const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

            return (
              <div
                key={ev.id}
                onClick={() => setActiveModalEvent(ev)}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex items-start justify-between gap-4"
              >
                <div className="flex items-start space-x-3.5">
                  <div className="mt-1">
                    <span className={`w-2.5 h-2.5 rounded-full block ${ev.severity === "CRITICAL" ? "bg-rose-500" : ev.severity === "HIGH" ? "bg-amber-500" : "bg-primary"}`} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ev.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${severityBadge(ev.severity)}`}>
                        {ev.severity}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{ev.entityType}</span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                      {ev.description}
                    </p>

                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-2">
                      <span className="flex items-center gap-1">
                        <FiUser className="w-3 h-3" />
                        {ev.actor?.name || "System"}
                      </span>
                      <span>·</span>
                      <span className="capitalize text-slate-400 font-mono">Source: {ev.source}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">{dateStr}</span>
                  <span className="text-[11px] text-slate-400">{timeStr}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-500">
            Page {page} of {totalPages} ({total} recorded items)
          </span>
          <div className="flex items-center space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => fetchTimeline(page - 1)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
            >
              <FiChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => fetchTimeline(page + 1)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
            >
              Next <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Detailed Modal on Event Click */}
      {activeModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FiClock className="text-primary w-5 h-5" />
                <h4 className="font-bold text-slate-900 dark:text-white text-base">Recorded Event Details</h4>
              </div>
              <button
                onClick={() => setActiveModalEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <span className="text-slate-400 block font-semibold uppercase">Event Title</span>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">{activeModalEvent.title}</p>
              </div>

              <div>
                <span className="text-slate-400 block font-semibold uppercase">Description</span>
                <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  {activeModalEvent.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block font-semibold uppercase">Recorded Timestamp</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {new Date(activeModalEvent.timestamp).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase">Actor</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {activeModalEvent.actor?.name} ({activeModalEvent.actor?.role || "Member"})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase">Severity</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${severityBadge(activeModalEvent.severity)}`}>
                    {activeModalEvent.severity}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase">Source Record</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 capitalize">{activeModalEvent.source}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveModalEvent(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
