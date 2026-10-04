import { useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiChevronDown,
  FiChevronUp,
  FiShield,
  FiCalendar,
  FiGitCommit,
  FiZap,
  FiUsers,
  FiAlertCircle
} from "react-icons/fi";

const statusConfig = {
  HEALTHY: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    border: "border-emerald-500/40",
    label: "Healthy"
  },
  WATCH: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    border: "border-amber-500/40",
    label: "Watch"
  },
  AT_RISK: {
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
    text: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
    border: "border-orange-500/40",
    label: "At Risk"
  },
  CRITICAL: {
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
    text: "text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    border: "border-rose-500/40",
    label: "Critical"
  }
};

const dimensionIcons = {
  schedule: FiCalendar,
  criticalPath: FiGitCommit,
  execution: FiCheckCircle,
  bottlenecks: FiZap,
  dependencies: FiGitCommit,
  workload: FiUsers,
  risks: FiShield
};

export default function ProjectHealthScorecard({ healthData, className = "" }) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedDimension, setExpandedDimension] = useState(null);

  if (!healthData) return null;

  const { score = 100, status = "HEALTHY", dimensions = {}, warnings = [], strengths = [], history = {} } = healthData;
  const config = statusConfig[status] || statusConfig.HEALTHY;

  const renderTrend = () => {
    const trend = history?.trend || "STABLE";
    if (trend === "IMPROVING") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
          <FiTrendingUp className="w-3.5 h-3.5" /> Improving {history.delta > 0 ? `(+${history.delta})` : ""}
        </span>
      );
    }
    if (trend === "DECLINING") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
          <FiTrendingDown className="w-3.5 h-3.5" /> Declining ({history.delta})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
        <FiMinus className="w-3.5 h-3.5" /> Stable
      </span>
    );
  };

  return (
    <div className={`p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-4 ${className}`}>
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl border ${config.badge}`}>
            {score}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--color-text)]">Project Health Scorecard</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${config.badge}`}>
                {config.label}
              </span>
              {renderTrend()}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Evaluated across 7 operational dimensions • Deterministic rating
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline px-2.5 py-1 rounded-lg border border-[var(--color-border)]"
        >
          {showDetails ? "Collapse Details" : "Explain Dimensions"}
          {showDetails ? <FiChevronUp className="w-3.5 h-3.5" /> : <FiChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Dimension Progress Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 pt-1">
        {Object.entries(dimensions).map(([key, dim]) => {
          const dimConf = statusConfig[dim.status] || statusConfig.HEALTHY;
          const Icon = dimensionIcons[key] || FiActivity;
          const isExpanded = expandedDimension === key;

          return (
            <div
              key={key}
              onClick={() => setExpandedDimension(isExpanded ? null : key)}
              className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                isExpanded
                  ? "border-blue-500/50 bg-blue-50/20 dark:bg-blue-950/20"
                  : "border-[var(--color-border)] hover:border-slate-300 dark:hover:border-slate-700 bg-[var(--color-surface-hover)]"
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="capitalize font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate">
                  <Icon className="w-3 h-3 text-slate-400 shrink-0" />
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
                <span className={`font-bold ${dimConf.text}`}>{dim.score}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${dimConf.bar}`}
                  style={{ width: `${Math.min(100, Math.max(5, dim.score))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Dimension Explanation */}
      {expandedDimension && dimensions[expandedDimension] && (
        <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/30 text-xs space-y-1.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-blue-700 dark:text-blue-300 capitalize">
              {expandedDimension.replace(/([A-Z])/g, " $1")} Health Analysis ({dimensions[expandedDimension].score}/100 - {dimensions[expandedDimension].status})
            </span>
            <button
              onClick={() => setExpandedDimension(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
            >
              ✕
            </button>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
            {(dimensions[expandedDimension].reasons || []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings & Strengths Collapsible */}
      {showDetails && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs border-t border-[var(--color-border)]">
          {warnings.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20 space-y-1">
              <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <FiAlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Attention Required ({warnings.length})
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {strengths.length > 0 && (
            <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-1">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <FiCheckCircle className="w-3.5 h-3.5 shrink-0" />
                Key Operational Strengths ({strengths.length})
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                {strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
