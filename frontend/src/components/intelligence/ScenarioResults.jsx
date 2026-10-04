import React from "react";
import { FiArrowRight, FiAlertTriangle, FiCheckCircle, FiClock, FiActivity, FiShield, FiGitCommit } from "react-icons/fi";

/**
 * Scenario Results View
 * Renders a side-by-side comparison between baseline project intelligence
 * and the simulated state with delta indicators and explainable warnings.
 */
const ScenarioResults = ({ simulationResult, onReset }) => {
  if (!simulationResult) return null;

  const { baseline, scenario, delta, warnings = [], affectedTasks = [], affectedUsers = [] } = simulationResult;

  const formatDate = (isoString) => {
    if (!isoString) return "Not set";
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? "Not set" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isScheduleWorse = (delta?.scheduleVarianceDays || 0) > 0;
  const isHealthWorse = (delta?.healthScoreDelta || 0) < 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FiGitCommit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Simulation Impact Analysis
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Comparing live project baseline with projected in-memory scenario.
          </p>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 underline"
          >
            Configure New Scenario
          </button>
        )}
      </div>

      {/* KPI Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Schedule Completion */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span className="flex items-center gap-1.5"><FiClock className="w-4 h-4" /> Projected Completion</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              isScheduleWorse ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}>
              {delta?.scheduleVarianceDays > 0 ? `+${delta.scheduleVarianceDays}d delay` : delta?.scheduleVarianceDays < 0 ? `${delta.scheduleVarianceDays}d earlier` : "No change"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Baseline</div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatDate(baseline?.projectedEnd)}</div>
            </div>
            <FiArrowRight className="w-4 h-4 text-slate-400" />
            <div className="text-right">
              <div className="text-xs text-indigo-500 font-medium">Simulated</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(scenario?.projectedEnd)}</div>
            </div>
          </div>
        </div>

        {/* Project Health Score */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span className="flex items-center gap-1.5"><FiActivity className="w-4 h-4" /> Health Scorecard</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              isHealthWorse ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}>
              {delta?.healthScoreDelta > 0 ? `+${delta.healthScoreDelta} pts` : delta?.healthScoreDelta < 0 ? `${delta.healthScoreDelta} pts` : "No change"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Baseline</div>
              <div className="text-base font-semibold text-slate-700 dark:text-slate-300">{baseline?.healthScore || 0}/100</div>
            </div>
            <FiArrowRight className="w-4 h-4 text-slate-400" />
            <div className="text-right">
              <div className="text-xs text-indigo-500 font-medium">Simulated</div>
              <div className="text-base font-bold text-slate-900 dark:text-white">{scenario?.healthScore || 0}/100</div>
            </div>
          </div>
        </div>

        {/* Critical Tasks & Bottlenecks */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span className="flex items-center gap-1.5"><FiShield className="w-4 h-4" /> Bottlenecks & Critical</span>
            <span className="text-xs text-slate-500">Path Impact</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500">Critical Tasks:</span>
              <span className="ml-1 font-bold text-slate-800 dark:text-slate-200">{baseline?.criticalTasksCount || 0} → {scenario?.criticalTasksCount || 0}</span>
            </div>
            <div>
              <span className="text-slate-500">Bottlenecks:</span>
              <span className="ml-1 font-bold text-slate-800 dark:text-slate-200">{baseline?.bottlenecksCount || 0} → {scenario?.bottlenecksCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings & Insights */}
      {warnings.length > 0 && (
        <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
            <FiAlertTriangle className="w-4 h-4" />
            Simulation Alerts ({warnings.length})
          </div>
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 pl-5 list-disc">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Affected Entities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-lg text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Affected Task Count:</span>
          <span className="ml-2 font-bold text-indigo-600 dark:text-indigo-400">{affectedTasks.length} task(s)</span>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-lg text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Affected Team Members:</span>
          <span className="ml-2 font-bold text-indigo-600 dark:text-indigo-400">{affectedUsers.length} member(s)</span>
        </div>
      </div>
    </div>
  );
};

export default ScenarioResults;
