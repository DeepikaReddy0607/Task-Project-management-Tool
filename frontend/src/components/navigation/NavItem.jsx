import clsx from "clsx";

function NavItem({ active = false, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium transition duration-[var(--duration-base)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_24%,transparent)]",
        active
          ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)] shadow-[var(--shadow-xs)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]",
      )}
    >
      <Icon
        size={18}
        className={clsx(
          "transition duration-[var(--duration-base)] group-hover:scale-105",
          active ? "text-[var(--color-brand)]" : "text-[var(--color-text-subtle)]",
        )}
        aria-hidden="true"
      />
      <span>{label}</span>
    </button>
  );
}

export default NavItem;
