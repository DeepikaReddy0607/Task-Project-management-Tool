import clsx from "clsx";

function SettingRow({ title, description, children, badge = null, className = "" }) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] last:border-b-0",
        className
      )}
    >
      <div className="space-y-0.5 pr-4 max-w-xl">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
          {badge && (
            <span className="rounded-full bg-[var(--color-surface-sage)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand-hover)]">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

export default SettingRow;
