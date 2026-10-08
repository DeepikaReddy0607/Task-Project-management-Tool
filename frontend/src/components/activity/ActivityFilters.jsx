function ActivityFilters({
  actionTypes,
  entityTypes,
  actionType,
  entityType,
  onActionTypeChange,
  onEntityTypeChange,
}) {
  return (
    <section
      className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_78%,transparent)] p-4 shadow-[var(--shadow-xs)] sm:grid-cols-2"
      aria-label="Activity filters"
    >
      <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="activity-action-filter">
        Action
        <select
          id="activity-action-filter"
          value={actionType}
          onChange={(event) => onActionTypeChange(event.target.value)}
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"
        >
          <option value="">All Actions</option>
          {actionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="activity-entity-filter">
        Entity
        <select
          id="activity-entity-filter"
          value={entityType}
          onChange={(event) => onEntityTypeChange(event.target.value)}
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"
        >
          <option value="">All Entities</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export default ActivityFilters;
