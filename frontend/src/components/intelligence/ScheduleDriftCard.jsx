import { FiClock, FiCalendar, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";

const severityColors = {
  NONE: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
    text: "text-emerald-600 dark:text-emerald-400"
  },
  LOW: {
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800",
    text: "text-blue-600 dark:text-blue-400"
  },
  MEDIUM: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
    text: "text-amber-600 dark:text-amber-400"
  },
  HIGH: {
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
    text: "text-orange-600 dark:text-orange-400"
  },
  CRITICAL: {
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
    text: "text-rose-600 dark:text-rose-400"
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return "Not set";
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(d);
  } catch {
    return dateStr;
  }
};

export default function ScheduleDriftCard({ driftData, className = "" }) {
  if (!driftData) return null;

  const { plannedEndDate, projectedEndDate, deltaDays = 0, severity = "NONE", reasons = [], hasCycle } = driftData;
  const col = severityColors[severity] || severityColors.NONE;

  return (
    <div className={`p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiClock className="w-4 h-4 text-blue-500" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">Schedule Drift</h4>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${col.badge}`}>
          {severity === "NONE" ? "On Schedule" : `${severity} Drift`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 py-2 border-y border-[var(--color-border)] text-center">
        <div>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Planned End</span>
          <span className="text-xs font-semibold text-[var(--color-text)]">{formatDate(plannedEndDate)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Projected End</span>
          <span className="text-xs font-semibold text-[var(--color-text)]">{hasCycle ? "Blocked (Cycle)" : formatDate(projectedEndDate)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Variance</span>
          <span className={`text-xs font-bold ${col.text}`}>
            {hasCycle ? "N/A" : deltaDays > 0 ? `+${deltaDays} day${deltaDays > 1 ? "s" : ""}` : "0 days"}
          </span>
        </div>
      </div>

      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
        {(reasons || []).slice(0, 2).map((r, i) => (
          <p key={i} className="flex items-start gap-1.5">
            <span className="text-slate-400">•</span>
            <span>{r}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
