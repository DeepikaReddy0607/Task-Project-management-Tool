import React, { useState, useEffect } from "react";
import {
  FiFileText,
  FiCheckCircle,
  FiCalendar,
  FiClock,
  FiActivity,
  FiZap,
  FiShield,
  FiCheckSquare,
  FiRefreshCw,
  FiAlertCircle,
  FiInfo,
  FiAward
} from "react-icons/fi";
import { getProjectAutopsy } from "../../services/api/intelligenceApi";

export default function ProjectAutopsy({ projectId, className = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forceLoad, setForceLoad] = useState(false);

  const loadAutopsy = async (force = false) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getProjectAutopsy(projectId, { force });
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load project autopsy");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAutopsy(forceLoad);
  }, [projectId, forceLoad]);

  if (loading) {
    return (
      <div className={`p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-3 text-slate-500 ${className}`}>
        <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Assembling retrospective autopsy from recorded milestones...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400 ${className}`}>
        <div className="flex items-center space-x-2 font-semibold">
          <FiAlertCircle className="w-5 h-5" />
          <span>Error Generating Autopsy</span>
        </div>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data || !data.eligible) {
    return (
      <div className={`p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 ${className}`}>
        <FiFileText className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Project Autopsy Unavailable for Active Projects
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          Project autopsy is designed for completed or archived projects. (Current status: <span className="font-semibold">{data?.projectStatus || "Active"}</span>).
        </p>
        <div className="mt-4">
          <button
            onClick={() => setForceLoad(true)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            Generate Mid-Project Retrospective Anyway
          </button>
        </div>
      </div>
    );
  }

  const { outcome, schedule, health, bottlenecks, replanning, lessonsAndPatterns } = data;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FiAward className="text-primary w-5 h-5" />
              Project Autopsy & Retrospective
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              {outcome.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Factual planned-vs-actual analysis assembled from verified historical records.
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 uppercase font-semibold">Final Health</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {health.finalScore ?? "N/A"}
            <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>
          </div>
        </div>
      </div>

      {/* KPI Grid: Schedule & Health Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Planned Duration</span>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {schedule.plannedDurationDays ? `${schedule.plannedDurationDays} days` : "Unspecified"}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Original Baseline</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Max Recorded Delay</span>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            +{schedule.largestDriftDays} days
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Across {schedule.driftEventsCount} drift events
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Delay Recovered</span>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {schedule.recoveredDays} days
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Through Replanning</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Health Trajectory</span>
          <div className="text-sm font-bold text-slate-900 dark:text-white mt-1.5 flex items-center justify-center gap-1">
            <span>{health.initialScore ?? "—"}</span>
            <span className="text-slate-400">→</span>
            <span className="text-rose-500">{health.lowestScore ?? "—"}</span>
            <span className="text-slate-400">→</span>
            <span className="text-emerald-500 font-black">{health.finalScore ?? "—"}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Initial → Lowest → Final</span>
        </div>
      </div>

      {/* Observed Historical Lessons & Patterns */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <FiCheckCircle className="text-emerald-500" />
          Factual Lessons & Observed Historical Patterns
        </h3>
        <ul className="space-y-2">
          {lessonsAndPatterns.map((lesson, idx) => (
            <li
              key={idx}
              className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 flex items-start gap-2.5 text-slate-700 dark:text-slate-300"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <span>{lesson}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-400">
          <FiInfo className="text-primary w-3.5 h-3.5 shrink-0" />
          <span>Observations are derived strictly from recorded metrics without assigning personal blame.</span>
        </div>
      </div>

      {/* Structural Retrospective: Bottlenecks & Replanning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Recurring Bottlenecks */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-2">
            <FiZap className="text-amber-500" />
            Recurring Bottlenecks ({bottlenecks.totalBottleneckOccurrences} total)
          </h4>
          {bottlenecks.recurringBottlenecks?.length > 0 ? (
            <div className="space-y-2">
              {bottlenecks.recurringBottlenecks.map((b, i) => (
                <div key={i} className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-100 dark:border-slate-800 flex justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{b.taskTitle}</span>
                  <span className="text-amber-600 font-bold">{b.occurrenceCount} occurrences</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No recurring bottlenecks were recorded during project execution.</p>
          )}
        </div>

        {/* Replanning Interventions */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-2">
            <FiCheckSquare className="text-primary" />
            Replanning Interventions ({replanning.totalProposals} proposals)
          </h4>
          {replanning.proposalsList?.length > 0 ? (
            <div className="space-y-2">
              {replanning.proposalsList.map((p, i) => (
                <div key={i} className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-100 dark:border-slate-800 flex justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Strategy: {p.strategy}</span>
                  <span className="text-xs uppercase font-bold text-primary">{p.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No replanning proposals were recorded for this project.</p>
          )}
        </div>
      </div>
    </div>
  );
}
