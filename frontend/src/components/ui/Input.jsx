import { forwardRef } from "react";
import clsx from "clsx";

const Input = forwardRef(function Input(
  {
    className,
    error,
    helperText,
    id,
    label,
    ...props
  },
  ref,
) {
  const message = error || helperText;
  const messageId = id && message ? `${id}-message` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--color-text)]">
          {label}
        </label>
      )}

      <input
        ref={ref}
        id={id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={messageId}
        className={clsx(
          "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition duration-[var(--duration-base)] ease-[var(--ease-standard)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-text-muted)]",
          error
            ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_16%,transparent)]"
            : "border-[var(--color-border)]",
          className,
        )}
        {...props}
      />

      {message && (
        <p
          id={messageId}
          className={clsx(
            "mt-2 text-sm",
            error ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
});

export default Input;
