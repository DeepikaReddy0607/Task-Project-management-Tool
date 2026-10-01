import { useState } from "react";
import { FiInbox } from "react-icons/fi";
import KanbanTaskCard from "./KanbanTaskCard";

const statusClasses = {
  Backlog: "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
  "To Do": "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  "In Progress": "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
  Review: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
  Completed: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
};

function KanbanColumn({ onMoveTask, status, statuses, tasks }) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDropTarget(false);
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) onMoveTask(taskId, status);
  };

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsDropTarget(false);
      }}
      onDrop={handleDrop}
      className={`flex w-[18.5rem] shrink-0 flex-col rounded-[var(--radius-xl)] border p-3 transition duration-[var(--duration-base)] sm:w-[20rem] ${isDropTarget ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_14%,transparent)]" : "border-[var(--color-border)] bg-[var(--color-canvas-soft)]"}`}
      aria-label={`${status} column`}
    >
      <header className="flex items-center justify-between gap-3 px-1 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{status}</h2>
          <span className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-bold ${statusClasses[status]}`}>
            {tasks.length}
          </span>
        </div>
      </header>

      <div className="min-h-44 space-y-3">
        {tasks.map((task) => (
          <KanbanTaskCard
            key={task.id}
            task={task}
            statuses={statuses}
            onStatusChange={onMoveTask}
          />
        ))}

        {!tasks.length && (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] px-5 py-8 text-center">
            <FiInbox size={22} className="text-[var(--color-brand)]" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">Nothing here yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Drag a task into this column to update its status.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default KanbanColumn;
