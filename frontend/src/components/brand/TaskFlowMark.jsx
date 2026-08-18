import clsx from "clsx";
import { FiCheck } from "react-icons/fi";

function TaskFlowMark({ className }) {
  return (
    <div className={clsx("inline-flex items-center gap-2.5", className)}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand)] text-[var(--color-brand-contrast)] shadow-[var(--shadow-brand)]"
        aria-hidden="true"
      >
        <FiCheck size={19} strokeWidth={2.5} />
      </span>
      <span className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.03em] text-[var(--color-text)]">
        TaskFlow
      </span>
    </div>
  );
}

export default TaskFlowMark;
