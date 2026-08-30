import { FiBell, FiChevronDown, FiMenu, FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import TaskFlowMark from "../components/brand/TaskFlowMark";

function Navbar({ mobileNavigationOpen, onMenuToggle }) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-canvas-soft)_86%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-[4.75rem] w-full max-w-[1600px] items-center gap-3 px-4 sm:gap-4 sm:px-7 lg:px-10">
        <button type="button" onClick={onMenuToggle} aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileNavigationOpen} className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_20%,transparent)] lg:hidden"><FiMenu size={20} /></button>
        <div className="flex shrink-0 items-center lg:hidden"><TaskFlowMark /></div>
        <button type="button" onClick={() => navigate("/workspaces")} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-white/70 hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)] md:flex"><span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand)] shadow-[0_0_0_4px_var(--color-surface-sage)]" aria-hidden="true" /><span>My Workspace</span><FiChevronDown size={15} aria-hidden="true" /></button>
        <div className="ml-auto hidden md:block"><label className="relative block"><span className="sr-only">Search workspace</span><FiSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" aria-hidden="true" /><input type="search" placeholder="Search tasks and projects" className="h-10 w-52 rounded-xl border border-[var(--color-border)] bg-white/65 py-2 pl-10 pr-4 text-sm text-[var(--color-text)] outline-none transition duration-[var(--duration-base)] placeholder:text-[var(--color-text-subtle)] hover:bg-white/85 focus:w-64 focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_12%,transparent)]" /></label></div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:-translate-y-0.5 hover:bg-white hover:text-[var(--color-text)] hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"><FiBell size={19} /><span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--color-peach)] ring-2 ring-[var(--color-canvas-soft)]" aria-hidden="true" /></button>
          <button type="button" onClick={() => navigate("/profile")} aria-label="Open profile" className="group flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-white hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-sm font-bold text-[var(--color-brand-hover)] ring-2 ring-white">G</span><span className="hidden text-left lg:block"><span className="block text-xs font-semibold text-[var(--color-text)]">TaskFlow Member</span><span className="block text-[0.6875rem] text-[var(--color-text-subtle)]">Personal workspace</span></span><FiChevronDown size={15} className="hidden text-[var(--color-text-subtle)] lg:block" aria-hidden="true" /></button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
