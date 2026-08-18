import clsx from "clsx";

function Card({ children, className, hoverable = false, ...props }) {
  return (
    <section
      className={clsx(
        "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6",
        hoverable &&
          "transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export default Card;
