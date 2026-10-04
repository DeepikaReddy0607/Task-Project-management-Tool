import React, { useState, useEffect } from "react";
import { getProjectScopeIntelligence } from "../../services/api/intelligenceApi";

export default function ScopeIntelligencePanel({ projectId }) {
  const [loading, setLoading] = useState(true);
  const [scopeData, setScopeData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadScope() {
      try {
        setLoading(true);
        setError(null);
        const res = await getProjectScopeIntelligence(projectId);
        if (res?.success) {
          setScopeData(res.data);
        } else {
          setScopeData(res);
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || "Failed to load scope intelligence");
      } finally {
        setLoading(false);
      }
    }
    if (projectId) {
      loadScope();
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        <span>Evaluating Project Scope Intelligence...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <h4 className="font-semibold text-rose-800 mb-1">Scope Intelligence Error</h4>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!scopeData) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
        No reliable historical scope baseline is available.
      </div>
    );
  }

  const { baseline = {}, current = {}, metrics = {}, pressure = {}, events = [] } = scopeData;

  const pressureColors = {
    LOW: "bg-emerald-50 border-emerald-200 text-emerald-800",
    MEDIUM: "bg-amber-50 border-amber-200 text-amber-800",
    HIGH: "bg-orange-50 border-orange-200 text-orange-800",
    CRITICAL: "bg-rose-50 border-rose-200 text-rose-800"
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Baseline */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Baseline Scope</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{baseline.taskCount ?? 0} tasks</div>
          <div className="text-xs text-slate-500 mt-1 truncate" title={baseline.source}>
            {baseline.source || "Established baseline"}
          </div>
        </div>

        {/* Current Scope */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Scope</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{current.taskCount ?? 0} tasks</div>
          <div className="text-xs text-slate-500 mt-1">
            {current.activeCount ?? 0} active · {current.completedCount ?? 0} completed
          </div>
        </div>

        {/* Net Growth */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Growth</div>
          <div className={`text-2xl font-bold mt-1 ${metrics.percentageGrowth > 25 ? "text-amber-600" : "text-slate-900"}`}>
            {metrics.netScopeGrowth > 0 ? `+${metrics.netScopeGrowth}` : metrics.netScopeGrowth} tasks
            <span className="text-sm font-semibold ml-2">
              ({metrics.percentageGrowth > 0 ? `+${metrics.percentageGrowth}%` : `${metrics.percentageGrowth}%`})
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            +{metrics.tasksAdded ?? 0} added · -{metrics.tasksRemoved ?? 0} removed
          </div>
        </div>

        {/* Change Frequency */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Change Frequency</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {metrics.changeFrequencyPerWeek ?? 0} <span className="text-xs font-normal text-slate-500">/ week</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Volatility: {metrics.scopeVolatility ?? 0}
          </div>
        </div>
      </div>

      {/* Scope Pressure Callout */}
      <div className={`p-4 border rounded-xl ${pressureColors[pressure.level] || "bg-slate-50 border-slate-200 text-slate-800"}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-wider">
            Scope Pressure: {pressure.level}
          </span>
          {pressure.correlatedScheduleDriftDays > 0 && (
            <span className="text-xs font-semibold">
              Correlated Drift: {pressure.correlatedScheduleDriftDays} days
            </span>
          )}
        </div>
        <p className="text-sm font-medium">{pressure.explanation}</p>
        <p className="text-xs opacity-80 mt-2 italic">{pressure.disclaimer}</p>
      </div>

      {/* Scope Events Feed */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Detected Scope Events</h3>
        {events.length > 0 ? (
          <div className="space-y-3">
            {events.map((ev, idx) => (
              <div key={idx} className="p-3 border border-slate-100 rounded-lg bg-slate-50 flex items-start space-x-3 text-xs">
                <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                  ev.severity === "CRITICAL" ? "bg-rose-100 text-rose-800" :
                  ev.severity === "HIGH" ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {ev.severity}
                </span>
                <div>
                  <div className="font-semibold text-slate-800">{ev.type.replace(/_/g, " ")}</div>
                  <div className="text-slate-600 mt-0.5">{ev.description}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-4 text-center">
            No anomalous scope events detected. Scope evolution has progressed stably.
          </div>
        )}
      </div>
    </div>
  );
}
