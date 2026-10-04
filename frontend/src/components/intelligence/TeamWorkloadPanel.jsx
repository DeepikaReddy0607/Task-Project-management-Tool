import { FiUsers, FiClock, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";

export default function TeamWorkloadPanel({ teamWorkloadData, className = "" }) {
  if (!teamWorkloadData) return null;

  const { members = [], unassigned = {}, totalRemainingHours = 0 } = teamWorkloadData;

  return (
    <div className={`p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiUsers className="w-4 h-4 text-blue-500" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">Team Workload Distribution</h4>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {totalRemainingHours} total remaining hrs
        </span>
      </div>

      {members.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          No team members assigned to project tasks.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {members.map((m) => (
            <div
              key={m.userId}
              className="p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text)] truncate">{m.name}</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{m.workloadShare}% effort</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(5, m.workloadShare))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                <span>{m.remainingHours} hrs remaining</span>
                <div className="flex items-center gap-2">
                  <span>{m.criticalCount} critical</span>
                  {m.overdueCount > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">{m.overdueCount} overdue</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {unassigned.count > 0 && (
            <div className="p-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/20 dark:bg-amber-950/10 text-[11px] text-amber-700 dark:text-amber-400 flex items-center justify-between">
              <span>Unassigned Work: {unassigned.count} task(s) ({unassigned.hours} hrs)</span>
              {unassigned.criticalCount > 0 && (
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {unassigned.criticalCount} critical unassigned!
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
