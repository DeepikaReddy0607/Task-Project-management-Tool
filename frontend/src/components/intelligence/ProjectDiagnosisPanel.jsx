import React, { useState, useEffect } from "react";
import {
  FiZap,
  FiAlertTriangle,
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiLayers,
  FiRefreshCw,
  FiInfo,
  FiTrendingDown
} from "react-icons/fi";
import { getProjectDiagnosis } from "../../services/api/intelligenceApi";

export default function ProjectDiagnosisPanel({ projectId, className = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDiagnosis = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getProjectDiagnosis(projectId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load project diagnosis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnosis();
  }, [projectId]);

  if (loading) {
    return (
      <div className={`p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-3 text-slate-500 ${className}`}>
        <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Running historical diagnosis across project records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400 ${className}`}>
        <div className="flex items-center space-x-2 font-semibold">
          <FiAlertTriangle className="w-5 h-5" />
          <span>Diagnosis Evaluation Error</span>
        </div>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data || !data.diagnoses || data.diagnoses.length === 0) {
    return (
      <div className={`p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 ${className}`}>
        <FiCheckCircle className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Operational Pathologies Detected</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          The project has maintained a stable operational trajectory with no recurring bottleneck or schedule instability patterns.
        </p>
      </div>
    );
  }

  const severityBadge = (sev) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800";
      case "HIGH":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800";
      case "MEDIUM":
        return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800";
      default:
        return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800";
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FiZap className="text-primary" />
              Project Diagnosis Engine
            </h3>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/30">
              {data.totalDiagnoses} Conditions Identified
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Detects recurring operational patterns, schedule drift, and bottlenecks using verified historical facts.
          </p>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
          <FiInfo className="text-primary w-4 h-4 shrink-0" />
          <span>Strictly cites verified associated factors rather than speculative blame.</span>
        </div>
      </div>

      {/* Diagnoses List */}
      <div className="grid grid-cols-1 gap-4">
        {data.diagnoses.map((diag, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {diag.type.replace(/_/g, " ")}
                  </h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${severityBadge(diag.severity)}`}>
                    {diag.severity}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {diag.explanation}
                </p>
              </div>

              <div className="text-right text-xs text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Frequency: {diag.frequency} event(s)
                </span>
                <span className="text-[11px] text-slate-400">
                  {diag.timeRange ? `${new Date(diag.timeRange.start).toLocaleDateString()} - ${new Date(diag.timeRange.end).toLocaleDateString()}` : "Entire Timeline"}
                </span>
              </div>
            </div>

            {/* Evidence & Associated Factors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              {/* Evidence */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5 flex items-center gap-1">
                  <FiCheckCircle className="text-emerald-500 w-3.5 h-3.5" />
                  Recorded Historical Evidence
                </span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {diag.evidence?.map((ev, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-slate-400">·</span>
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Associated Factors */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5 flex items-center gap-1">
                  <FiLayers className="text-primary w-3.5 h-3.5" />
                  Correlated Associated Factors
                </span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {diag.associatedFactors?.map((af, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-slate-400">·</span>
                      <span>{af}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Affected Entities */}
            {diag.affectedEntities?.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="font-semibold uppercase tracking-wider">Affected:</span>
                <div className="flex flex-wrap gap-1">
                  {diag.affectedEntities.map((ent, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                      {ent}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
