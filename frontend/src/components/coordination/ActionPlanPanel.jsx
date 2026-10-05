import { useState, useEffect, useCallback } from "react";
import {
  FiCheckSquare,
  FiZap,
  FiAlertTriangle,
  FiRefreshCw,
  FiTrendingUp,
  FiShield,
  FiChevronDown,
  FiChevronUp,
  FiArrowRight,
  FiClock,
  FiTarget,
  FiActivity,
  FiTool
} from "react-icons/fi";
import {
  getProjectNextActions,
  getWorkspaceNextActions,
  getProjectActionPlan,
  getProjectRecoveryPlan,
  getPersonalActionPlan
} from "../../services/api/intelligenceApi";

export default function ActionPlanPanel({ projectId, workspaceId, onOpenSimulation, className = "" }) {
  const [viewMode, setViewMode] = useState("actions"); // 'actions' | 'action-plan' | 'recovery-plan'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedActionId, setExpandedActionId] = useState(null);

  const fetchData = useCallback(async () => {
    if (!projectId && !workspaceId) {
      setLoading(false);
      setData(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let res;
      if (viewMode === "actions") {
        res = projectId ? await getProjectNextActions(projectId) : await getWorkspaceNextActions(workspaceId);
      } else if (viewMode === "action-plan") {
        res = projectId ? await getProjectActionPlan(projectId) : await getPersonalActionPlan(workspaceId);
      } else if (viewMode === "recovery-plan") {
        if (!projectId) {
          setError("Recovery Plan requires a project context.");
          setLoading(false);
          return;
        }
        res = await getProjectRecoveryPlan(projectId);
      }
      setData(res?.data || null);
    } catch (err) {
      console.error("Failed to load action data:", err);
      setError(err?.response?.data?.error?.message || err.message || "Failed to load intelligence data");
    } finally {
      setLoading(false);
    }
  }, [viewMode, projectId, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpand = (id) => {
    setExpandedActionId((prev) => (prev === id ? null : id));
  };

  const actionsList = data?.actions || data?.nextActions || data?.actionPlan?.actions || data?.sequencedActions || data?.items || [];
  const recoveryData = viewMode === "recovery-plan" ? data : null;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header bar with View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <FiTarget size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Intelligent Next Actions & Action Plans
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                0-100 Priority Scoring
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Deterministic sequencing based on critical path slack, bottlenecks, and deadline exposure
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Tabs */}
          <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1 border border-zinc-200 dark:border-zinc-700/60">
            <button
              type="button"
              onClick={() => setViewMode("actions")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "actions"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              }`}
            >
              Next Actions
            </button>
            <button
              type="button"
              onClick={() => setViewMode("action-plan")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "action-plan"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              }`}
            >
              Action Plan
            </button>
            {projectId && (
              <button
                type="button"
                onClick={() => setViewMode("recovery-plan")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === "recovery-plan"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                Recovery Plan
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Refresh actions"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
          <FiAlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <FiRefreshCw className="animate-spin text-blue-500" size={28} />
          <p className="text-sm font-medium">Computing deterministic priority scores and explainability models...</p>
        </div>
      ) : viewMode === "recovery-plan" && recoveryData ? (
        /* Recovery Plan View */
        <div className="space-y-6">
          {/* Recovery Overview Hero */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-rose-500/5 via-amber-500/5 to-indigo-500/5 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  PROJECT RECOVERY INTELLIGENCE
                </span>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {recoveryData.title || "Targeted Project Recovery Plan"}
                </h3>
              </div>

              {recoveryData.projectedRecoveryDays != null && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Projected Recovery</div>
                    <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      -{recoveryData.projectedRecoveryDays} Days
                    </div>
                  </div>
                </div>
              )}
            </div>

            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {recoveryData.rationale || recoveryData.summary || "Deterministic schedule recovery steps targeting critical path acceleration and blocker clearance."}
            </p>

            {onOpenSimulation && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onOpenSimulation(recoveryData)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition"
                >
                  <FiTool size={14} /> Simulate Recovery in What-If Sandbox
                </button>
              </div>
            )}
          </div>

          {/* Structured Recovery Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pillar 1: Blocker Removal */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
                <FiAlertTriangle size={15} /> Pillar 1: Blocker Clearance
              </h4>
              <div className="space-y-2">
                {(recoveryData.blockerRemovals || recoveryData.blockers || []).length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No hard blockers requiring removal.</p>
                ) : (
                  (recoveryData.blockerRemovals || recoveryData.blockers || []).map((b, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 text-xs">
                      <div className="font-bold text-rose-800 dark:text-rose-300">{b.title || b.action}</div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{b.details || b.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pillar 2: Critical Path Acceleration */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                <FiZap size={15} /> Pillar 2: Critical Path Compression
              </h4>
              <div className="space-y-2">
                {(recoveryData.criticalPathActions || []).length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No critical path compression steps identified.</p>
                ) : (
                  recoveryData.criticalPathActions.map((c, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-xs">
                      <div className="font-bold text-amber-800 dark:text-amber-300">{c.title || c.action}</div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{c.details || c.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pillar 3: Workload Rebalancing */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <FiActivity size={15} /> Pillar 3: Workload Rebalancing
              </h4>
              <div className="space-y-2">
                {(recoveryData.workloadRebalancing || []).length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">Workload is balanced across assignees.</p>
                ) : (
                  recoveryData.workloadRebalancing.map((w, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 text-xs">
                      <div className="font-bold text-blue-800 dark:text-blue-300">{w.title || w.action}</div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{w.details || w.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pillar 4: Scope Adjustments */}
            <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
                <FiTarget size={15} /> Pillar 4: Scope / Milestone Alignment
              </h4>
              <div className="space-y-2">
                {(recoveryData.scopeAdjustments || []).length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No scope deferrals proposed.</p>
                ) : (
                  recoveryData.scopeAdjustments.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 text-xs">
                      <div className="font-bold text-purple-800 dark:text-purple-300">{s.title || s.action}</div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{s.details || s.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Next Actions & Action Plan List View */
        <div className="space-y-4">
          {actionsList.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
              No pending actions computed. All projects currently operating within nominal parameters.
            </div>
          ) : (
            actionsList.map((action, idx) => {
              const isExpanded = expandedActionId === (action.id || idx);
              const score = action.priorityScore ?? action.score ?? 50;

              return (
                <div
                  key={action.id || idx}
                  className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs transition hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  {/* Action Summary Row */}
                  <div
                    onClick={() => toggleExpand(action.id || idx)}
                    className="p-5 flex items-start justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-3.5">
                      {/* Priority Score Badge */}
                      <div className="flex flex-col items-center justify-center shrink-0">
                        <div className={`h-11 w-11 rounded-xl flex flex-col items-center justify-center font-extrabold ${
                          score >= 80 ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" :
                          score >= 50 ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                          "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                        }`}>
                          <span className="text-sm leading-none">{score}</span>
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">SCORE</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {action.title || action.action || action.what}
                          </h4>
                          {action.urgency && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              action.urgency === "CRITICAL" ? "bg-rose-500/10 text-rose-600" :
                              action.urgency === "HIGH" ? "bg-amber-500/10 text-amber-600" :
                              "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                            }`}>
                              {action.urgency}
                            </span>
                          )}
                          {action.source && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              {action.source}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                          {action.description || action.why || action.reason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {action.dueDate && (
                        <div className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-400">
                          <FiClock size={12} />
                          {new Date(action.dueDate).toLocaleDateString()}
                        </div>
                      )}
                      <button
                        type="button"
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
                      >
                        {isExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Explainability Expansion Card */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 rounded-b-2xl">
                      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                        Deterministic Explainability Model
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">WHY (Rationale)</span>
                          <p className="text-zinc-700 dark:text-zinc-300">
                            {action.why || action.reason || "High downstream impact on project delivery."}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">EVIDENCE (Metrics)</span>
                          <p className="text-zinc-700 dark:text-zinc-300">
                            {action.evidence ? JSON.stringify(action.evidence) : "Observed dependency chain slack ≤ 0 and critical path residency."}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">URGENCY FACTOR</span>
                          <p className="text-zinc-700 dark:text-zinc-300">
                            {action.urgencyExplanation || `Priority Score: ${score}/100. Threatens planned delivery window.`}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">SUGGESTED NEXT STEP</span>
                          <p className="text-zinc-700 dark:text-zinc-300 font-medium">
                            {action.suggestedNextStep || "Review task prerequisites or reassign capacity via Replanning proposal."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
