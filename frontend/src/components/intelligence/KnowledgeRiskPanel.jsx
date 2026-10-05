import { FiShield, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";

const severityColors = {
  CRITICAL: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
  HIGH: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  LOW: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
};

export default function KnowledgeRiskPanel({ knowledgeRiskData, className = "" }) {
  if (!knowledgeRiskData) return null;

  const { concentrationScore = 0, severity = "LOW", evidence = [], recommendations = [] } = knowledgeRiskData;
  const badgeClass = severityColors[severity] || severityColors.LOW;

  return (
    <div className={`p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiShield className="w-4 h-4 text-purple-500" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">Knowledge Concentration Risk</h4>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
          {severity} Risk ({concentrationScore}/100)
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300 block">Resilience Evidence:</span>
        <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
          {(evidence || []).slice(0, 3).map((ev, i) => (
            <li key={i}>{ev}</li>
          ))}
        </ul>

        {recommendations.length > 0 && (
          <div className="mt-2 p-2.5 rounded-md bg-purple-50/30 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 text-[11px] text-purple-700 dark:text-purple-300">
            <strong>Mitigation:</strong> {recommendations[0]}
          </div>
        )}
      </div>
    </div>
  );
}
