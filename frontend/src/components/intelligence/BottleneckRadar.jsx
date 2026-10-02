import { useState, useMemo } from "react";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowRight,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiFilter,
  FiLayers,
  FiShield,
  FiTarget,
  FiZap
} from "react-icons/fi";

const severityConfig = {
  CRITICAL: {
    badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800",
    border: "border-rose-400/80 dark:border-rose-700/80",
    bg: "bg-rose-50/40 dark:bg-rose-950/20",
    bar: "bg-rose-500",
    iconColor: "text-rose-600 dark:text-rose-400",
    label: "Critical",
  },
  HIGH: {
    badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-800",
    border: "border-orange-400/80 dark:border-orange-700/80",
    bg: "bg-orange-50/40 dark:bg-orange-950/20",
    bar: "bg-orange-500",
    iconColor: "text-orange-600 dark:text-orange-400",
    label: "High",
  },
  MEDIUM: {
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800",
    border: "border-blue-300 dark:border-blue-800",
    bg: "bg-blue-50/30 dark:bg-blue-950/15",
    bar: "bg-blue-500",
    iconColor: "text-blue-600 dark:text-blue-400",
    label: "Medium",
  },
  LOW: {
    badge: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700",
    border: "border-[var(--color-border)]",
    bg: "bg-[var(--color-surface)]",
    bar: "bg-slate-400",
    iconColor: "text-slate-500",
    label: "Low",
  },
};

export default function BottleneckRadar({
  data,
  selectedTaskId = null,
  onSelectTask = null,
  className = ""
}) {
  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [expandedDetailsId, setExpandedDetailsId] = useState(null);

  const bottlenecks = data?.bottlenecks || [];
  const summary = data?.summary || {};
  const hasCycle = Boolean(data?.hasCycle);

  const toggleDetails = (taskId, e) => {
    e.stopPropagation();
    setExpandedDetailsId((prev) => (prev === taskId ? null : taskId));
  };

  const filteredBottlenecks = useMemo(() => {
    if (filterSeverity === "ALL") return bottlenecks;
    return bottlenecks.filter((b) => b.severity === filterSeverity);
  }, [bottlenecks, filterSeverity]);

  if (hasCycle) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-rose-300/60 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-5 ${className}`}>
        <div className="flex items-center gap-3 text-rose-800 dark:text-rose-200">
          <FiAlertTriangle className="text-rose-600 shrink-0" size={20} />
          <div>
            <h4 className="font-semibold text-sm">Bottleneck Analysis Paused</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
              Cycle detected in dependencies. Resolve circular prerequisite links to analyze workflow constraints.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (bottlenecks.length === 0) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-8 text-center ${className}`}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <FiCheckCircle size={26} />
        </div>
        <h4 className="mt-3 font-[var(--font-display)] text-base font-bold text-emerald-900 dark:text-emerald-100">
          No Workflow Bottlenecks Detected
        </h4>
        <p className="mx-auto mt-1 max-w-md text-xs text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
          Great news! All active tasks in this project have low dependency contention and healthy slack margins. Work is flowing smoothly.
        </p>
      </div>
    );
  }

  const primaryBottleneck = bottlenecks[0];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary KPI Strip & Filter Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-subtle)] uppercase tracking-wider mr-1">
            Severity Filter:
          </span>
          <button
            type="button"
            onClick={() => setFilterSeverity("ALL")}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              filterSeverity === "ALL"
                ? "bg-[var(--color-brand)] text-white shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            }`}
          >
            All ({bottlenecks.length})
          </button>
          {summary.criticalCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity("CRITICAL")}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                filterSeverity === "CRITICAL"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
              }`}
            >
              Critical ({summary.criticalCount})
            </button>
          )}
          {summary.highCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity("HIGH")}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                filterSeverity === "HIGH"
                  ? "bg-orange-600 text-white shadow-xs"
                  : "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
              }`}
            >
              High ({summary.highCount})
            </button>
          )}
          {summary.mediumCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity("MEDIUM")}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                filterSeverity === "MEDIUM"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
              }`}
            >
              Medium ({summary.mediumCount})
            </button>
          )}
          {summary.lowCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity("LOW")}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                filterSeverity === "LOW"
                  ? "bg-slate-700 text-white shadow-xs"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
              }`}
            >
              Low ({summary.lowCount})
            </button>
          )}
        </div>

        <div className="text-xs text-[var(--color-text-subtle)]">
          Ranked by multi-factor contention score (0–100)
        </div>
      </div>

      {/* Primary Bottleneck Spotlight (If All is selected or Primary matches filter) */}
      {primaryBottleneck && (filterSeverity === "ALL" || filterSeverity === primaryBottleneck.severity) && (
        <div
          onClick={() => onSelectTask && onSelectTask(primaryBottleneck.taskId)}
          className={`cursor-pointer rounded-[var(--radius-xl)] border-2 ${
            selectedTaskId === primaryBottleneck.taskId
              ? "ring-2 ring-[var(--color-brand)] border-[var(--color-brand)]"
              : severityConfig[primaryBottleneck.severity]?.border || "border-rose-400"
          } ${severityConfig[primaryBottleneck.severity]?.bg || "bg-rose-50/40"} p-4 shadow-sm transition hover:shadow-md`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  🔥 Primary Bottleneck #1
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    severityConfig[primaryBottleneck.severity]?.badge
                  }`}
                >
                  {primaryBottleneck.severity} SEVERITY
                </span>
              </div>

              <h4 className="font-[var(--font-display)] text-base font-bold text-[var(--color-text)]">
                {primaryBottleneck.title}
              </h4>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                <span>Status: <strong className="text-[var(--color-text)]">{primaryBottleneck.status}</strong></span>
                <span>•</span>
                <span>Priority: <strong className="text-[var(--color-text)]">{primaryBottleneck.priority}</strong></span>
                {primaryBottleneck.isCritical && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">Critical Path Task (0d slack)</span>
                  </>
                )}
                {primaryBottleneck.daysOverdue > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 animate-pulse">
                      {primaryBottleneck.daysOverdue} Days Overdue
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Score Pill / Meter */}
            <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-subtle)]">
                  Contention Score
                </span>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {primaryBottleneck.bottleneckScore}<span className="text-xs font-normal text-[var(--color-text-muted)]">/100</span>
                </p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">
            <div
              className={`h-full rounded-full ${severityConfig[primaryBottleneck.severity]?.bar || "bg-rose-500"}`}
              style={{ width: `${Math.min(100, primaryBottleneck.bottleneckScore)}%` }}
            />
          </div>

          {/* Reasons List */}
          {primaryBottleneck.reasons && primaryBottleneck.reasons.length > 0 && (
            <div className="mt-3 space-y-1">
              {primaryBottleneck.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-[var(--color-text)]">
                  <FiAlertCircle className="mt-0.5 shrink-0 text-rose-500" size={13} />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)]/60 pt-2.5 text-xs">
            <span className="italic text-[var(--color-text-muted)]">
              💡 Action: Unblocking this task frees {primaryBottleneck.transitiveDependentsCount} downstream tasks and relieves critical path pressure.
            </span>
            <span className="font-semibold text-[var(--color-brand)] flex items-center gap-1">
              Select in Graph <FiArrowRight size={13} />
            </span>
          </div>
        </div>
      )}

      {/* Remaining Bottlenecks List */}
      <div className="space-y-2.5">
        {filteredBottlenecks.map((bottleneck) => {
          // If we showed primary as spotlight and filter is ALL, still show it or let it render consistently
          const config = severityConfig[bottleneck.severity] || severityConfig.LOW;
          const isSelected = selectedTaskId === bottleneck.taskId;
          const isDetailsOpen = expandedDetailsId === bottleneck.taskId;

          return (
            <div
              key={bottleneck.taskId}
              onClick={() => onSelectTask && onSelectTask(bottleneck.taskId)}
              className={`group cursor-pointer rounded-[var(--radius-xl)] border ${
                isSelected
                  ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)] bg-[var(--color-surface)]"
                  : `${config.border} bg-[var(--color-surface)] hover:border-[var(--color-brand)]`
              } p-3.5 shadow-2xs transition hover:shadow-xs`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-canvas-soft)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)]">
                    #{bottleneck.rank}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="truncate font-semibold text-xs text-[var(--color-text)] group-hover:text-[var(--color-brand)]">
                        {bottleneck.title}
                      </h5>
                      <span className={`rounded-full border px-1.5 py-0.2 text-[9px] font-bold ${config.badge}`}>
                        {bottleneck.severity}
                      </span>
                      {bottleneck.isCritical && (
                        <span className="rounded bg-rose-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-rose-600 dark:text-rose-400">
                          Critical Path
                        </span>
                      )}
                      {bottleneck.daysOverdue > 0 && (
                        <span className="rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 px-1.5 py-0.2 text-[9px] font-bold">
                          {bottleneck.daysOverdue}d Overdue
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-subtle)]">
                      <span>Blocks <strong className="text-[var(--color-text)]">{bottleneck.directDependentsCount}</strong> direct ({bottleneck.transitiveDependentsCount} total downstream)</span>
                      <span>•</span>
                      <span>Slack: <strong className="text-[var(--color-text)]">{bottleneck.totalSlack}d</strong></span>
                      <span>•</span>
                      <span>Status: {bottleneck.status}</span>
                    </div>
                  </div>
                </div>

                {/* Score bar & expand details toggle */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--color-text-subtle)]">Score</span>
                    <p className={`font-mono text-sm font-bold ${config.iconColor}`}>
                      {bottleneck.bottleneckScore}
                    </p>
                  </div>

                  <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--color-canvas-soft)] border border-[var(--color-border)]">
                    <div
                      className={`h-full rounded-full ${config.bar}`}
                      style={{ width: `${Math.min(100, bottleneck.bottleneckScore)}%` }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => toggleDetails(bottleneck.taskId, e)}
                    className="rounded p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
                    title="Toggle score details"
                  >
                    {isDetailsOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Reasons chips */}
              {bottleneck.reasons && bottleneck.reasons.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-[var(--color-border)]/50">
                  {bottleneck.reasons.map((r, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-[var(--color-canvas-soft)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Expandable Score Weight Breakdown */}
              {isDetailsOpen && bottleneck.details && (
                <div className="mt-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5 text-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
                    Contention Factor Weight Breakdown
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="rounded bg-[var(--color-surface)] p-1.5 border border-[var(--color-border)]">
                      <span className="text-[var(--color-text-subtle)]">Downstream Impact:</span>
                      <p className="font-bold text-[var(--color-text)]">+{bottleneck.details.dependencyImpact} pts</p>
                    </div>
                    <div className="rounded bg-[var(--color-surface)] p-1.5 border border-[var(--color-border)]">
                      <span className="text-[var(--color-text-subtle)]">Critical Path:</span>
                      <p className="font-bold text-[var(--color-text)]">+{bottleneck.details.criticalImpact} pts</p>
                    </div>
                    <div className="rounded bg-[var(--color-surface)] p-1.5 border border-[var(--color-border)]">
                      <span className="text-[var(--color-text-subtle)]">Overdue Penalty:</span>
                      <p className="font-bold text-[var(--color-text)]">+{bottleneck.details.overdueImpact} pts</p>
                    </div>
                    <div className="rounded bg-[var(--color-surface)] p-1.5 border border-[var(--color-border)]">
                      <span className="text-[var(--color-text-subtle)]">Priority Weight:</span>
                      <p className="font-bold text-[var(--color-text)]">+{bottleneck.details.priorityImpact} pts</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
