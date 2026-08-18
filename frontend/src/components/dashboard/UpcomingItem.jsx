import { FiClock } from "react-icons/fi";

function UpcomingItem({ date, title }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-info-soft)] text-[var(--color-info)]" aria-hidden="true">
        <FiClock size={16} />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{date}</p>
      </div>
    </li>
  );
}

export default UpcomingItem;
