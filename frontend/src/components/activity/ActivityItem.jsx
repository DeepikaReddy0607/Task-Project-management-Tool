import { FiActivity, FiFolder, FiLayers, FiList, FiUser } from "react-icons/fi";

const entityIcons = {
  project: FiFolder,
  task: FiList,
  workspace: FiLayers,
  user: FiUser,
};

const entityLabels = {
  project: "Project",
  task: "Task",
  workspace: "Workspace",
  user: "User",
};

const initialsFor = (user) => {
  const initials = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .map((name) => name.trim().charAt(0))
    .join("");

  return initials.toUpperCase() || "?";
};

const fullNameFor = (user) =>
  [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Unknown member";

const validDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatTimestamp = (value) => {
  const date = validDate(value);
  if (!date) return "Date unavailable";

  const difference = Date.now() - date.getTime();
  const minutes = Math.floor(difference / 60_000);

  if (minutes >= 0 && minutes < 1) return "Just now";
  if (minutes > 0 && minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours > 0 && hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days > 0 && days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const fullTimestamp = (value) => {
  const date = validDate(value);
  if (!date) return undefined;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
};

function ActivityItem({ activity, isLast }) {
  const Icon = entityIcons[activity.entity_type] || FiActivity;
  const entityLabel = entityLabels[activity.entity_type] || activity.entity_type || "Activity";
  const timestamp = fullTimestamp(activity.created_at);

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!isLast && (
        <span
          className="absolute bottom-0 left-5 top-11 w-px bg-[var(--color-border)]"
          aria-hidden="true"
        />
      )}
      <span
        className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)] ring-4 ring-[var(--color-surface)]"
        aria-label={`${fullNameFor(activity.users)} avatar`}
      >
        {initialsFor(activity.users)}
      </span>

      <article className="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)]">{fullNameFor(activity.users)}</p>
            <p className="mt-1 break-words text-sm leading-relaxed text-[var(--color-text-muted)]">
              {activity.description}
            </p>
          </div>
          <time
            dateTime={validDate(activity.created_at)?.toISOString()}
            title={timestamp}
            className="shrink-0 text-xs font-medium text-[var(--color-text-subtle)]"
          >
            {formatTimestamp(activity.created_at)}
          </time>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-soft)] px-2.5 py-1 font-semibold text-[var(--color-brand-hover)]">
            <FiActivity size={13} aria-hidden="true" />
            {activity.action_type}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-canvas-soft)] px-2.5 py-1 font-semibold text-[var(--color-text-muted)]">
            <Icon size={13} aria-hidden="true" />
            {entityLabel}
          </span>
        </div>
      </article>
    </li>
  );
}

export default ActivityItem;
