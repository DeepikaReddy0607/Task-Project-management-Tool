import { FiCalendar, FiCheckSquare, FiUser } from "react-icons/fi";

const priorityClasses = {
  Low: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  Medium: "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
  High: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
  Critical: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

function KanbanTaskCard({ onStatusChange, statuses, task }) {
  const progress = task.subtasksTotal
    ? Math.round((task.subtasksCompleted / task.subtasksTotal) * 100)
    : null;

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
      }}
      className="group cursor-grab rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)] transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-sm)] active:cursor-grabbing focus-within:border-[var(--color-brand)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_16%,transparent)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-[0.6875rem] font-semibold ${priorityClasses[task.priority] || priorityClasses.Low}`}
        >
          {task.priority}
        </span>
        <span className="text-xs font-medium text-[var(--color-text-subtle)]">{task.projectName}</span>
      </div>

      <h2 className="mt-3 text-sm font-semibold text-[var(--color-text)]">{task.title}</h2>
      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[var(--color-text-muted)]">
          {task.description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <FiUser size={13} aria-hidden="true" />
          {task.assignee}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FiCalendar size={13} aria-hidden="true" />
          Due {task.dueDate}
        </span>
      </div>

      {progress !== null && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <FiCheckSquare size={13} aria-hidden="true" />
              Subtasks
            </span>
            <span>{task.subtasksCompleted}/{task.subtasksTotal}</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
            aria-label={`${progress}% of subtasks completed`}
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress}
          >
            <span
              className="block h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <label className="mt-4 block text-xs font-semibold text-[var(--color-text-muted)]">
        <span className="sr-only">Move {task.title} to a status</span>
        <select
          value={task.status}
          onChange={(event) => onStatusChange(task.id, event.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-2.5 py-2 text-xs font-medium text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_16%,transparent)]"
          aria-label={`Move ${task.title} to a different status`}
        >
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </label>
    </article>
  );
}

export default KanbanTaskCard;
