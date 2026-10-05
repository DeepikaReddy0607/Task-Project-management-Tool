import { FiChevronDown, FiMenu, FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import TaskFlowMark from "../components/brand/TaskFlowMark";
import NotificationBell from "../components/notifications/NotificationBell";

function Navbar({ mobileNavigationOpen, onMenuToggle, onOpenSearch }) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-canvas-soft)_86%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-[4.75rem] w-full max-w-[1600px] items-center gap-3 px-4 sm:gap-4 sm:px-7 lg:px-10">
        <button type="button" onClick={onMenuToggle} aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileNavigationOpen} className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_20%,transparent)] lg:hidden"><FiMenu size={20} /></button>
        <div className="flex shrink-0 items-center lg:hidden"><TaskFlowMark /></div>
        <button type="button" onClick={() => navigate("/workspaces")} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-white/70 hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)] md:flex"><span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand)] shadow-[0_0_0_4px_var(--color-surface-sage)]" aria-hidden="true" /><span>My Workspace</span><FiChevronDown size={15} aria-hidden="true" /></button>
        
        {/* Global Search Trigger */}
        <div className="ml-auto hidden md:block">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-10 w-60 items-center justify-between rounded-xl border border-[var(--color-border)] bg-white/70 px-3 py-2 text-xs font-medium text-[var(--color-text-subtle)] transition duration-[var(--duration-base)] hover:bg-white hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_12%,transparent)]"
          >
            <span className="flex items-center gap-2">
              <FiSearch size={15} className="text-[var(--color-text-subtle)]" />
              <span>Search TaskFlow...</span>
            </span>
            <kbd className="flex items-center gap-0.5 rounded border border-[var(--color-border)] bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              <span>⌘</span><span>K</span>
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Search Button */}
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Open search"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-text)] md:hidden"
          >
            <FiSearch size={18} />
          </button>

          <NotificationBell />
          <button type="button" onClick={() => navigate("/profile")} aria-label="Open profile" className="group flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-white hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-sm font-bold text-[var(--color-brand-hover)] ring-2 ring-white">G</span><span className="hidden text-left lg:block"><span className="block text-xs font-semibold text-[var(--color-text)]">TaskFlow Member</span><span className="block text-[0.6875rem] text-[var(--color-text-subtle)]">Personal workspace</span></span><FiChevronDown size={15} className="hidden text-[var(--color-text-subtle)] lg:block" aria-hidden="true" /></button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
