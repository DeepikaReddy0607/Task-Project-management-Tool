import { FiActivity } from "react-icons/fi";
import ActivityItem from "./ActivityItem";

function TimelineSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading activity timeline" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-4">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--color-surface-muted)]" />
          <div className="flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <span className="block h-4 w-32 animate-pulse rounded bg-[var(--color-surface-muted)]" />
            <span className="mt-3 block h-4 w-full animate-pulse rounded bg-[var(--color-surface-muted)]" />
            <span className="mt-2 block h-4 w-4/5 animate-pulse rounded bg-[var(--color-surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTimeline({ activities, isLoading, isFiltered }) {
  if (isLoading) return <TimelineSkeleton />;

  if (!activities.length) {
    return (
      <section className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-5 py-12 text-center">
        <FiActivity className="mx-auto text-[var(--color-brand)]" size={30} aria-hidden="true" />
        <h2 className="mt-4 font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
          {isFiltered ? "No matching activity" : "No activity yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
          {isFiltered
            ? "Try changing the filters to see other workspace updates."
            : "Workspace updates will appear here as your team plans and completes work."}
        </p>
      </section>
    );
  }

  return (
    <ol className="relative" aria-label="Workspace activity timeline">
      {activities.map((activity, index) => (
        <ActivityItem key={activity.id} activity={activity} isLast={index === activities.length - 1} />
      ))}
    </ol>
  );
}

export default ActivityTimeline;
