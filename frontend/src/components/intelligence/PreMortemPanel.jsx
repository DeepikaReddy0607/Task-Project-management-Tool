import { useState } from "react";
import { FiAlertCircle, FiChevronDown, FiChevronUp, FiCheckCircle, FiShield, FiArrowRight } from "react-icons/fi";

const severityColors = {
  CRITICAL: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
  HIGH: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  LOW: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-700"
};

export default function PreMortemPanel({
  preMortemData,
  onSelectTask = null,
  className = ""
}) {
  const [expandedId, setExpandedId] = useState(null);

  if (!preMortemData) return null;

  const findings = preMortemData.findings || [];
  const summary = preMortemData.summary || { total: 0 };

  return (
    <div className={`p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FiAlertCircle className="w-5 h-5 text-rose-500" />
          <h3 className="text-base font-bold text-[var(--color-text)]">Predictive Pre-Mortem</h3>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {summary.total} condition{summary.total === 1 ? "" : "s"} require attention under current trajectory
        </span>
      </div>

      {findings.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <FiCheckCircle className="w-6 h-6 text-emerald-500 mx-auto" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">Clean Pre-Mortem Assessment</p>
          <p>No critical failure mechanisms detected. Project conditions are proceeding stably.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((item) => {
            const isExpanded = expandedId === item.id;
            const badgeClass = severityColors[item.severity] || severityColors.LOW;

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] space-y-2 text-xs"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="flex items-center justify-between cursor-pointer gap-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass} shrink-0`}>
                      {item.severity}
                    </span>
                    <span className="font-semibold text-[var(--color-text)] truncate">{item.title}</span>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{item.explanation}</p>

                {isExpanded && (
                  <div className="pt-2 border-t border-[var(--color-border)] space-y-2 animate-fadeIn">
                    {item.evidence && item.evidence.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                          Evidence:
                        </span>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-400 text-[11px]">
                          {item.evidence.map((ev, i) => (
                            <li key={i}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {item.suggestedAction && (
                      <div className="p-2.5 rounded-md bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                        <span className="font-bold shrink-0">Action:</span>
                        <span>{item.suggestedAction}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
