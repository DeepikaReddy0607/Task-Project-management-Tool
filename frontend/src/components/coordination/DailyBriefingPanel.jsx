import { useState, useEffect, useCallback } from "react";
import {
  FiSun,
  FiCalendar,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiArrowRight,
  FiCopy,
  FiRefreshCw,
  FiTarget,
  FiTrendingUp,
  FiShield,
  FiUser,
  FiLayers
} from "react-icons/fi";
import {
  getProjectBriefing,
  getWorkspaceBriefing,
  getPersonalBriefing
} from "../../services/api/intelligenceApi";

export default function DailyBriefingPanel({ projectId, workspaceId, className = "" }) {
  const [scope, setScope] = useState(projectId ? "PROJECT" : (workspaceId ? "WORKSPACE" : "PERSONAL"));
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchBriefing = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res;
      if (scope === "PROJECT" && projectId) {
        res = await getProjectBriefing(projectId);
      } else if (scope === "WORKSPACE" && workspaceId) {
        res = await getWorkspaceBriefing(workspaceId);
      } else {
        res = await getPersonalBriefing(workspaceId);
      }
      setBriefing(res?.data || null);
    } catch (err) {
      console.error("Failed to load briefing:", err);
      setError(err?.response?.data?.error?.message || err.message || "Failed to load daily briefing");
    } finally {
      setLoading(false);
    }
  }, [scope, projectId, workspaceId]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const copyToClipboard = () => {
    if (!briefing) return;
    const text = [
      `# 📋 DAILY BRIEFING — ${briefing.scopeTitle || briefing.scope || "Executive"}`,
      `Date: ${briefing.generatedAt ? new Date(briefing.generatedAt).toLocaleDateString() : new Date().toLocaleDateString()}`,
      `Health: ${briefing.health?.score != null ? briefing.health.score + "/100 (" + briefing.health.status + ")" : "N/A"}`,
      "",
      "## 🎯 SUMMARY",
      briefing.summary || "No summary available.",
      "",
      "## ⚡ KEY FOCUS TODAY",
      ...(briefing.keyFocusToday || []).map((t, idx) => `${idx + 1}. [${t.priority || "NORMAL"}] ${t.title || t.name}${t.isCriticalPath ? " (CRITICAL PATH)" : ""}`),
      "",
      "## 🚧 BLOCKERS & BOTTLENECKS",
      ...(briefing.blockers || []).map((b) => `- ${b.title || b.reason}`),
      ...(briefing.bottlenecks || []).map((b) => `- [${b.severity || "WARN"}] ${b.title || b.taskTitle || "Bottleneck"}`),
      "",
      "## 💡 SUGGESTED ACTIONS",
      ...(briefing.actionItems || []).map((a, idx) => `${idx + 1}. ${a.action || a.title || a.what}`),
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header bar with Scope Switcher & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <FiSun size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Autonomous Daily Briefing
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Phase 6 Intelligence
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Aggregated overnight signals, critical path pressure, and executive priority queue
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Scope buttons */}
          <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1 border border-zinc-200 dark:border-zinc-700/60">
            {projectId && (
              <button
                type="button"
                onClick={() => setScope("PROJECT")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  scope === "PROJECT"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                Project
              </button>
            )}
            {workspaceId && (
              <button
                type="button"
                onClick={() => setScope("WORKSPACE")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  scope === "WORKSPACE"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                Workspace
              </button>
            )}
            <button
              type="button"
              onClick={() => setScope("PERSONAL")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                scope === "PERSONAL"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              }`}
            >
              My Day
            </button>
          </div>

          <button
            type="button"
            onClick={fetchBriefing}
            disabled={loading}
            className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Refresh briefing"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </button>

          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!briefing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition shadow-xs"
          >
            <FiCopy size={13} />
            {copied ? "Copied!" : "Copy Summary"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
          <FiAlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !briefing ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <FiRefreshCw className="animate-spin text-amber-500" size={28} />
          <p className="text-sm font-medium">Assembling deterministic executive briefing...</p>
        </div>
      ) : briefing ? (
        <div className="space-y-6">
          {/* Executive Overview Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/5 via-white/80 to-indigo-500/5 dark:from-amber-950/20 dark:via-zinc-900/80 dark:to-indigo-950/20 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {briefing.scopeTitle || briefing.scope || "Executive Briefing"}
                </span>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {briefing.headline || "Daily Operational Briefing"}
                </h3>
              </div>
              {briefing.health && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Health Score</div>
                    <div className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                      {briefing.health.score != null ? briefing.health.score : "—"}/100
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    briefing.health.status === "HEALTHY" ? "bg-emerald-500/10 text-emerald-600" :
                    briefing.health.status === "CRITICAL" ? "bg-rose-500/10 text-rose-600" :
                    "bg-amber-500/10 text-amber-600"
                  }`}>
                    {briefing.health.status || "NORMAL"}
                  </span>
                </div>
              )}
            </div>

            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {briefing.summary || "No active summary recorded for this operational cycle."}
            </p>

            {/* Quick Stat Pill Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-200/80 dark:border-zinc-800/80">
              <div className="p-3 rounded-xl bg-white/60 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <div className="text-[10px] uppercase font-bold text-zinc-400">Key Focus Tasks</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {briefing.keyFocusToday?.length || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/60 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <div className="text-[10px] uppercase font-bold text-zinc-400">Active Blockers</div>
                <div className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                  {briefing.blockers?.length || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/60 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <div className="text-[10px] uppercase font-bold text-zinc-400">Critical Path Tasks</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {briefing.criticalPathTasks?.length || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/60 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <div className="text-[10px] uppercase font-bold text-zinc-400">Pending Approvals</div>
                <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {briefing.pendingApprovals?.length || briefing.approvalsRequired?.length || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Grid: Key Focus Today + Blockers & Bottlenecks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Key Focus Today */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <FiTarget className="text-amber-500" size={17} />
                  Key Focus Today
                </h4>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {briefing.keyFocusToday?.length || 0} tasks
                </span>
              </div>

              {(!briefing.keyFocusToday || briefing.keyFocusToday.length === 0) ? (
                <p className="text-xs text-zinc-400 italic py-6 text-center">
                  No urgent tasks scheduled for immediate action today.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {briefing.keyFocusToday.map((item, idx) => (
                    <div
                      key={item.id || item.taskId || idx}
                      className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-start justify-between gap-3 hover:border-amber-400 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {item.title || item.name}
                          </span>
                          {item.isCriticalPath && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              CRITICAL
                            </span>
                          )}
                        </div>
                        {item.dueDate && (
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <FiClock size={12} />
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </div>
                        )}
                        {item.reason && (
                          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                            {item.reason}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                        item.priority === "URGENT" || item.priority === "HIGH"
                          ? "bg-rose-500/10 text-rose-600"
                          : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}>
                        {item.priority || "NORMAL"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Blockers, Bottlenecks & Hazards */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <FiAlertTriangle className="text-rose-500" size={17} />
                  Blockers & Bottlenecks
                </h4>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600">
                  {(briefing.blockers?.length || 0) + (briefing.bottlenecks?.length || 0)} items
                </span>
              </div>

              {(!briefing.blockers?.length && !briefing.bottlenecks?.length) ? (
                <div className="py-6 text-center text-xs text-zinc-400 flex flex-col items-center gap-1.5">
                  <FiCheckCircle className="text-emerald-500" size={20} />
                  <p>All dependencies clear. No active bottlenecks detected.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {/* Blockers */}
                  {(briefing.blockers || []).map((b, idx) => (
                    <div
                      key={`blk-${idx}`}
                      className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                          {b.title || b.taskTitle || "Blocked Task"}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600">
                          BLOCKER
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {b.reason || b.description || "Dependency not yet completed"}
                      </p>
                    </div>
                  ))}

                  {/* Bottlenecks */}
                  {(briefing.bottlenecks || []).map((bn, idx) => (
                    <div
                      key={`bn-${idx}`}
                      className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-400">
                          {bn.taskTitle || bn.title || "Bottleneck Node"}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          BOTTLENECK {bn.score ? `(${bn.score})` : ""}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {bn.primaryCause || bn.reason || "High downstream dependency pressure"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Recommendations Card */}
          {briefing.actionItems && briefing.actionItems.length > 0 && (
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <FiTrendingUp className="text-indigo-500" size={17} />
                Recommended Operational Next Steps
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {briefing.actionItems.map((act, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-start gap-3"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {act.title || act.action || act.what}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {act.description || act.why || act.suggestedNextStep}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
