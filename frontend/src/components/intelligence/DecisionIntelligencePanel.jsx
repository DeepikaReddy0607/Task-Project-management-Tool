import React, { useState, useEffect } from "react";
import {
  FiCheckSquare,
  FiUser,
  FiCalendar,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertCircle,
  FiClock,
  FiRefreshCw,
  FiInfo,
  FiArrowRight
} from "react-icons/fi";
import { getDecisionIntelligence } from "../../services/api/intelligenceApi";

export default function DecisionIntelligencePanel({ projectId, className = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDecisions = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getDecisionIntelligence(projectId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load decision intelligence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDecisions();
  }, [projectId]);

  if (loading) {
    return (
      <div className={`p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-3 text-slate-500 ${className}`}>
        <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Analyzing recorded project decisions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400 ${className}`}>
        <div className="flex items-center space-x-2 font-semibold">
          <FiAlertCircle className="w-5 h-5" />
          <span>Error Loading Decision Intelligence</span>
        </div>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data || !data.decisions || data.decisions.length === 0) {
    return (
      <div className={`p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 ${className}`}>
        <FiCheckSquare className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Recorded Decisions</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          No recorded decisions are available for this project. Decisions can be logged to track strategic milestones and observed project impact.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FiCheckSquare className="text-primary" />
              Decision Intelligence
            </h3>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              {data.totalDecisions} Documented Decisions
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Correlates recorded decisions with preceding and subsequent health snapshots.
          </p>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
          <FiInfo className="text-primary w-4 h-4 shrink-0" />
          <span>Temporal associations reflect chronological observations, not established causal blame.</span>
        </div>
      </div>

      {/* Decision Cards */}
      <div className="space-y-3">
        {data.decisions.map((dec) => {
          const dateStr = dec.decisionDate ? new Date(dec.decisionDate).toLocaleDateString() : "Undated";
          const before = dec.impact?.beforeState;
          const after = dec.impact?.afterState;
          const deltas = dec.impact?.deltas;

          return (
            <div
              key={dec.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{dec.decision}</h4>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase">
                      {dec.status}
                    </span>
                  </div>
                  {dec.reason && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                      "{dec.reason}"
                    </p>
                  )}
                </div>

                <div className="text-right text-xs text-slate-400">
                  <div className="flex items-center gap-1 justify-end font-medium text-slate-600 dark:text-slate-300">
                    <FiCalendar className="w-3 h-3" />
                    <span>{dateStr}</span>
                  </div>
                  <div className="flex items-center gap-1 justify-end mt-0.5">
                    <FiUser className="w-3 h-3" />
                    <span>{dec.owner?.name || "Team Member"}</span>
                  </div>
                </div>
              </div>

              {/* State Before vs After Comparison */}
              {before && after ? (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                    Recorded State Evolution
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Health Shift */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Health Score</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{before.healthScore}</span>
                          <FiArrowRight className="text-slate-400 w-3 h-3" />
                          <span className="font-bold text-slate-900 dark:text-white">{after.healthScore}</span>
                        </div>
                      </div>
                      {deltas?.healthDelta !== null && (
                        <span className={`text-xs font-black px-2 py-0.5 rounded ${deltas.healthDelta > 0 ? "bg-emerald-500/10 text-emerald-600" : deltas.healthDelta < 0 ? "bg-rose-500/10 text-rose-600" : "bg-slate-200 text-slate-600"}`}>
                          {deltas.healthDelta > 0 ? `+${deltas.healthDelta}` : deltas.healthDelta}
                        </span>
                      )}
                    </div>

                    {/* Schedule Drift Shift */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Schedule Drift</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{before.scheduleDriftDays}d</span>
                          <FiArrowRight className="text-slate-400 w-3 h-3" />
                          <span className="font-bold text-slate-900 dark:text-white">{after.scheduleDriftDays}d</span>
                        </div>
                      </div>
                      {deltas?.driftDelta !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${deltas.driftDelta > 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                          {deltas.driftDelta > 0 ? `+${deltas.driftDelta}d` : `${deltas.driftDelta}d`}
                        </span>
                      )}
                    </div>

                    {/* Bottlenecks Shift */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Bottlenecks</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{before.bottleneckCount}</span>
                          <FiArrowRight className="text-slate-400 w-3 h-3" />
                          <span className="font-bold text-slate-900 dark:text-white">{after.bottleneckCount}</span>
                        </div>
                      </div>
                      {deltas?.bottleneckDelta !== null && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600">
                          {deltas.bottleneckDelta > 0 ? `+${deltas.bottleneckDelta}` : deltas.bottleneckDelta}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5">
                    {dec.impact.temporalObservation}
                  </p>
                </div>
              ) : (
                <div className="mt-3 pt-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                  {dec.impact?.temporalObservation || "Awaiting additional historical snapshots to compute state delta."}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
