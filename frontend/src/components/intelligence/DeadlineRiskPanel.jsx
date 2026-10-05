import { FiAlertTriangle, FiArrowRight, FiClock } from "react-icons/fi";

const levelColors = {
  CRITICAL: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
  HIGH: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  LOW: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-700"
};

export default function DeadlineRiskPanel({
  deadlineRisks = [],
  selectedTaskId = null,
  onSelectTask = null,
  className = ""
}) {
  const risks = Array.isArray(deadlineRisks) ? deadlineRisks : [];

  return (
    <div className={`p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiAlertTriangle className="w-4 h-4 text-orange-500" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">Deadline Risk Tasks</h4>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {risks.length} task{risks.length === 1 ? "" : "s"} threatening deadline
        </span>
      </div>

      {risks.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          No active tasks are currently threatening the project deadline.
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {risks.slice(0, 8).map((task) => {
            const isSelected = selectedTaskId === task.taskId;
            const badgeClass = levelColors[task.riskLevel] || levelColors.LOW;

            return (
              <div
                key={task.taskId}
                onClick={() => onSelectTask && onSelectTask(task.taskId)}
                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm"
                    : "border-[var(--color-border)] hover:border-slate-300 dark:hover:border-slate-700 bg-[var(--color-surface-hover)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-[var(--color-text)] truncate">{task.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass} shrink-0`}>
                    {task.riskLevel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1">{task.reason}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Slack: <strong className="text-[var(--color-text)]">{task.slack}d</strong></span>
                  {task.downstreamImpact > 0 && (
                    <span>Blocks: <strong className="text-[var(--color-text)]">{task.downstreamImpact} tasks</strong></span>
                  )}
                  {task.isOverdue && (
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">{task.daysOverdue}d overdue</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
