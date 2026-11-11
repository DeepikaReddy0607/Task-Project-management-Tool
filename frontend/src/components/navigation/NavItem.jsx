import clsx from "clsx";

function NavItem({ active = false, icon: Icon, label, onClick, isCollapsed = false, badge = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={isCollapsed ? label : undefined}
      className={clsx(
        "group relative flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium transition duration-[var(--duration-base)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_24%,transparent)]",
        isCollapsed && "justify-center px-2",
        active
          ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)] shadow-[var(--shadow-xs)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]",
      )}
    >
      <div className="relative shrink-0">
        <Icon
          size={18}
          className={clsx(
            "transition duration-[var(--duration-base)] group-hover:scale-105 shrink-0",
            active ? "text-[var(--color-brand)]" : "text-[var(--color-text-subtle)]",
          )}
          aria-hidden="true"
        />
        {isCollapsed && badge > 0 && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[var(--color-surface)]" />
        )}
      </div>
      {!isCollapsed && (
        <>
          <span className="truncate flex-1">{label}</span>
          {badge > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-xs leading-none">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export default NavItem;
