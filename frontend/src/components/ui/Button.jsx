import clsx from "clsx";

const variantClasses = {
  primary:
    "bg-[var(--color-brand)] text-[var(--color-brand-contrast)] shadow-[var(--shadow-brand)] hover:bg-[var(--color-brand-hover)]",
  secondary:
    "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-xs)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-canvas-soft)]",
  soft:
    "bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)] hover:bg-[var(--color-surface-sage)]",
};

function Button({
  children,
  className,
  disabled = false,
  type = "button",
  variant = "primary",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold transition duration-[var(--duration-base)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_28%,transparent)] enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55",
        variantClasses[variant] || variantClasses.primary,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
