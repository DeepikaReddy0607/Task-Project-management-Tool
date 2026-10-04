import { useState, useEffect, useCallback } from "react";
import {
  FiCheckCircle,
  FiPlay,
  FiAlertOctagon,
  FiAlertTriangle,
  FiMessageSquare,
  FiCopy,
  FiRefreshCw,
  FiCalendar,
  FiUser,
  FiClock,
  FiLayers
} from "react-icons/fi";
import {
  getProjectStandup,
  getPersonalStandup
} from "../../services/api/intelligenceApi";

export default function StandupPanel({ projectId, workspaceId, className = "" }) {
  const [scope, setScope] = useState(projectId ? "PROJECT" : "PERSONAL");
  const [standup, setStandup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchStandup = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res;
      if (scope === "PROJECT" && projectId) {
        res = await getProjectStandup(projectId);
      } else {
        res = await getPersonalStandup(workspaceId);
      }
      setStandup(res?.data || null);
    } catch (err) {
      console.error("Failed to load standup:", err);
      setError(err?.response?.data?.error?.message || err.message || "Failed to load standup data");
    } finally {
      setLoading(false);
    }
  }, [scope, projectId, workspaceId]);

  useEffect(() => {
    fetchStandup();
  }, [fetchStandup]);

  const copyToClipboard = () => {
    if (!standup) return;
    const lines = [
      `*DAILY STANDUP — ${standup.scopeTitle || standup.scope || "Project"}*`,
      `*Date:* ${new Date().toLocaleDateString()}`,
      "",
      `*✅ YESTERDAY (${standup.yesterday?.length || 0})*`,
      ...(standup.yesterday?.length ? standup.yesterday.map((t) => `• ${t.title || t.name}${t.assignedTo ? ` (@${t.assignedTo})` : ""}`) : ["• None"]),
      "",
      `*⚡ TODAY (${standup.today?.length || 0})*`,
      ...(standup.today?.length ? standup.today.map((t) => `• ${t.title || t.name}${t.isCriticalPath ? " [CRITICAL PATH]" : ""}${t.assignedTo ? ` (@${t.assignedTo})` : ""}`) : ["• None"]),
      "",
      `*🛑 BLOCKED (${standup.blocked?.length || 0})*`,
      ...(standup.blocked?.length ? standup.blocked.map((t) => `• ${t.title || t.name}: ${t.reason || "Waiting on dependencies"}`) : ["• None"]),
      "",
      `*⚠️ AT RISK (${standup.atRisk?.length || 0})*`,
      ...(standup.atRisk?.length ? standup.atRisk.map((t) => `• ${t.title || t.name}: ${t.riskFactors?.join(", ") || t.reason || "Tight deadline"}`) : ["• None"]),
      "",
      `*💬 NEEDS DISCUSSION (${standup.needsDiscussion?.length || 0})*`,
      ...(standup.needsDiscussion?.length ? standup.needsDiscussion.map((t) => `• ${t.topic || t.title}: ${t.context || t.reason || "Alignment required"}`) : ["• None"])
    ];

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <FiMessageSquare size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Automated Daily Standup
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Deterministic
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              5-Vector automated standup generated directly from verified project records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
                Project Standup
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
              My Standup
            </button>
          </div>

          <button
            type="button"
            onClick={fetchStandup}
            disabled={loading}
            className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Refresh standup"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </button>

          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!standup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-xs"
          >
            <FiCopy size={13} />
            {copied ? "Copied!" : "Copy for Slack / Teams"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
          <FiAlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !standup ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <FiRefreshCw className="animate-spin text-indigo-500" size={28} />
          <p className="text-sm font-medium">Synthesizing 5-vector standup intelligence...</p>
        </div>
      ) : standup ? (
        <div className="space-y-5">
          {/* Vector 1: Yesterday */}
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <FiCheckCircle className="text-emerald-500" size={17} />
                1. Yesterday (Completed)
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {standup.yesterday?.length || 0} completed
              </span>
            </div>

            {(!standup.yesterday || standup.yesterday.length === 0) ? (
              <p className="text-xs text-zinc-400 italic py-2">
                No tasks were marked completed in the preceding 24-48 hours.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {standup.yesterday.map((t, idx) => (
                  <div
                    key={t.id || t.taskId || idx}
                    className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FiCheckCircle className="text-emerald-500 shrink-0" size={15} />
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {t.title || t.name}
                      </span>
                    </div>
                    {t.assignedTo && (
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1 shrink-0">
                        <FiUser size={11} /> {t.assignedTo}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vector 2: Today */}
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <FiPlay className="text-indigo-500" size={17} />
                2. Today (Planned & In Progress)
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {standup.today?.length || 0} tasks
              </span>
            </div>

            {(!standup.today || standup.today.length === 0) ? (
              <p className="text-xs text-zinc-400 italic py-2">
                No active tasks scheduled for today.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {standup.today.map((t, idx) => (
                  <div
                    key={t.id || t.taskId || idx}
                    className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {t.title || t.name}
                      </span>
                      {t.isCriticalPath && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 shrink-0">
                          CP
                        </span>
                      )}
                    </div>
                    {t.dueDate && (
                      <span className="text-[11px] text-zinc-500 shrink-0 flex items-center gap-1">
                        <FiClock size={11} /> {new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vector 3 & 4 Grid: Blocked + At Risk */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Vector 3: Blocked */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <FiAlertOctagon className="text-rose-500" size={17} />
                  3. Blocked
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  {standup.blocked?.length || 0}
                </span>
              </div>

              {(!standup.blocked || standup.blocked.length === 0) ? (
                <p className="text-xs text-zinc-400 italic py-2">
                  No tasks currently blocked by prerequisite dependencies.
                </p>
              ) : (
                <div className="space-y-2">
                  {standup.blocked.map((t, idx) => (
                    <div
                      key={t.id || t.taskId || idx}
                      className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-800/40 space-y-1"
                    >
                      <div className="text-xs font-bold text-rose-800 dark:text-rose-300">
                        {t.title || t.name}
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {t.reason || (t.blockedBy ? `Blocked by: ${t.blockedBy.map(b => b.title || b.name).join(", ")}` : "Waiting on prerequisite")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vector 4: At Risk */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <FiAlertTriangle className="text-amber-500" size={17} />
                  4. At Risk
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  {standup.atRisk?.length || 0}
                </span>
              </div>

              {(!standup.atRisk || standup.atRisk.length === 0) ? (
                <p className="text-xs text-zinc-400 italic py-2">
                  No tasks flagged as at imminent risk.
                </p>
              ) : (
                <div className="space-y-2">
                  {standup.atRisk.map((t, idx) => (
                    <div
                      key={t.id || t.taskId || idx}
                      className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                          {t.title || t.name}
                        </span>
                        {t.riskLevel && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800">
                            {t.riskLevel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {t.reason || t.riskFactors?.join(", ") || "Deadline threat / high downstream impact"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Vector 5: Needs Discussion */}
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <FiMessageSquare className="text-purple-500" size={17} />
                5. Needs Discussion
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                {standup.needsDiscussion?.length || 0}
              </span>
            </div>

            {(!standup.needsDiscussion || standup.needsDiscussion.length === 0) ? (
              <p className="text-xs text-zinc-400 italic py-2">
                No items currently require escalation or team discussion.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {standup.needsDiscussion.map((d, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/70 dark:border-purple-800/40 space-y-1"
                  >
                    <div className="text-xs font-bold text-purple-900 dark:text-purple-300">
                      {d.topic || d.title || d.action}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {d.context || d.reason || d.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
