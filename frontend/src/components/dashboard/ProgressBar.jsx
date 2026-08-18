function ProgressBar({ value }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={value}
    >
      <div
        className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-emphasized)]"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default ProgressBar;
