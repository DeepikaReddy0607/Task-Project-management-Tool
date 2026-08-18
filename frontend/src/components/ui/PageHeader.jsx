import clsx from "clsx";

function PageHeader({ actions, className, description, title }) {
  return (
    <header
      className={clsx(
        "flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="max-w-2xl">
        <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text)] sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)] sm:text-base">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export default PageHeader;
