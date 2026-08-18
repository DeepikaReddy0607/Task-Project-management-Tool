import { FiCalendar, FiCheck } from "react-icons/fi";
import ProgressBar from "./ProgressBar";

const priorityClasses = {
  High: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  Medium: "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
  Low: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
};

function DashboardTaskRow({ dueDate, priority, progress, status, title }) {
  return (
    <li className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4 transition duration-[var(--duration-base)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-brand)] bg-[var(--color-surface)] text-[var(--color-brand)]" aria-hidden="true">
          <FiCheck size={12} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sage)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--color-brand-hover)]">{status}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
            <span className={`rounded-[var(--radius-pill)] px-2.5 py-1 ${priorityClasses[priority] || priorityClasses.Low}`}>{priority} priority</span>
            <span className="inline-flex items-center gap-1.5"><FiCalendar size={13} aria-hidden="true" />Due {dueDate}</span>
          </div>
          <div className="mt-3 flex items-center gap-3"><ProgressBar value={progress} /><span className="w-9 shrink-0 text-right text-xs font-semibold text-[var(--color-brand-hover)]">{progress}%</span></div>
        </div>
      </div>
    </li>
  );
}

export default DashboardTaskRow;
