import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch,
  FiCheckSquare,
  FiFolder,
  FiLayers,
  FiFileText,
  FiAlertTriangle,
  FiUser,
  FiActivity,
  FiX,
  FiArrowRight,
  FiCornerDownLeft,
  FiSliders,
  FiCalendar,
} from "react-icons/fi";
import { searchUnified } from "../../services/api/searchApi";
import { getWorkspaces } from "../../services/api/workspaceApi";
import { getProjects } from "../../services/api/projectApi";
import FilterBar from "./FilterBar";
import ActiveFilterChips from "./ActiveFilterChips";

const ENTITY_ICONS = {
  task: FiCheckSquare,
  tasks: FiCheckSquare,
  project: FiFolder,
  projects: FiFolder,
  workspace: FiLayers,
  workspaces: FiLayers,
  decision: FiFileText,
  decisions: FiFileText,
  risk: FiAlertTriangle,
  risks: FiAlertTriangle,
  member: FiUser,
  members: FiUser,
  activity: FiActivity,
  activities: FiActivity,
};

const ENTITY_BADGES = {
  task: { bg: "bg-blue-50 text-blue-600 border-blue-200", label: "Task" },
  tasks: { bg: "bg-blue-50 text-blue-600 border-blue-200", label: "Task" },
  project: { bg: "bg-indigo-50 text-indigo-600 border-indigo-200", label: "Project" },
  projects: { bg: "bg-indigo-50 text-indigo-600 border-indigo-200", label: "Project" },
  workspace: { bg: "bg-purple-50 text-purple-600 border-purple-200", label: "Workspace" },
  workspaces: { bg: "bg-purple-50 text-purple-600 border-purple-200", label: "Workspace" },
  decision: { bg: "bg-emerald-50 text-emerald-600 border-emerald-200", label: "Decision" },
  decisions: { bg: "bg-emerald-50 text-emerald-600 border-emerald-200", label: "Decision" },
  risk: { bg: "bg-amber-50 text-amber-600 border-amber-200", label: "Risk" },
  risks: { bg: "bg-amber-50 text-amber-600 border-amber-200", label: "Risk" },
  member: { bg: "bg-teal-50 text-teal-600 border-teal-200", label: "Member" },
  members: { bg: "bg-teal-50 text-teal-600 border-teal-200", label: "Member" },
  activity: { bg: "bg-slate-100 text-slate-600 border-slate-200", label: "Activity" },
  activities: { bg: "bg-slate-100 text-slate-600 border-slate-200", label: "Activity" },
};

const DEFAULT_FILTERS = {
  q: "",
  type: "all",
  workspaceId: "",
  projectId: "",
  status: "",
  priority: "",
  assigneeId: "",
  ownerId: "",
  from: "",
  to: "",
  sortBy: "relevance",
  sortOrder: "desc",
};

export default function GlobalSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState([]);
  const [counts, setCounts] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);

  const inputRef = useRef(null);

  // Load workspaces and projects for scoping
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const loadScope = async () => {
      try {
        const wsRes = await getWorkspaces();
        const wsList = wsRes?.workspaces || (Array.isArray(wsRes?.data) ? wsRes.data : []);
        if (!isMounted) return;
        setWorkspaces(wsList);

        if (wsList.length > 0) {
          const prjPromises = wsList.map((ws) =>
            getProjects(ws.id).catch(() => ({ projects: [] }))
          );
          const prjResults = await Promise.all(prjPromises);
          if (!isMounted) return;
          const allPrjs = prjResults.flatMap(
            (r) => r?.projects || (Array.isArray(r?.data) ? r.data : [])
          );
          setProjects(allPrjs);
        }
      } catch (err) {
        console.warn("Failed to load search filter options:", err);
      }
    };

    loadScope();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Focus input and reset when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setFilters(DEFAULT_FILTERS);
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search query & filter changes
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await searchUnified({
          q: filters.q?.trim() || undefined,
          type: filters.type !== "all" ? filters.type : undefined,
          workspaceId: filters.workspaceId || undefined,
          projectId: filters.projectId || undefined,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          assigneeId: filters.assigneeId?.trim() || undefined,
          ownerId: filters.ownerId?.trim() || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          sortBy: filters.sortBy || undefined,
          sortOrder: filters.sortOrder || undefined,
          pageSize: 25,
        });

        if (response?.data) {
          const rawItems = Array.isArray(response.data.flatResults)
            ? response.data.flatResults
            : Array.isArray(response.data.results)
            ? response.data.results
            : [];
          setResults(rawItems);
          setCounts(response.data.counts || {});
          setTotalCount(
            response.data.pagination?.total ||
              response.data.counts?.total ||
              rawItems.length
          );
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Search modal error:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, filters]);

  // Keyboard navigation inside modal
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (filters.q?.trim()) {
        goToFullSearch();
      }
    }
  };

  const handleSelect = (item) => {
    onClose();
    if (item.navigationTarget) {
      navigate(item.navigationTarget);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleRemoveFilter = (key) => {
    setFilters((prev) => ({
      ...prev,
      [key]: key === "type" ? "all" : key === "sortBy" ? "relevance" : key === "sortOrder" ? "desc" : "",
    }));
  };

  const handleClearAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const goToFullSearch = () => {
    onClose();
    const params = new URLSearchParams();
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    if (filters.type && filters.type !== "all") params.set("type", filters.type);
    if (filters.workspaceId) params.set("workspaceId", filters.workspaceId);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    navigate(`/search?${params.toString()}`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-14 px-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-[var(--color-border)] overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Search Input */}
        <div className="relative flex items-center border-b border-[var(--color-border)] px-6 py-4 bg-white">
          <FiSearch size={22} className="text-[var(--color-text-subtle)] shrink-0 mr-3.5" />
          <input
            ref={inputRef}
            type="text"
            value={filters.q || ""}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, q: e.target.value }))
            }
            placeholder="Search tasks, projects, decisions, risks, members... (Type to search)"
            className="flex-1 bg-transparent text-base sm:text-lg text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-subtle)] font-medium"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, q: "" }))}
              className="p-1.5 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] mr-2"
              aria-label="Clear search input"
            >
              <FiX size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-[var(--color-text-muted)] hover:bg-slate-200 transition"
          >
            ESC
          </button>
        </div>

        {/* Filter Controls & Tabs */}
        <div className="px-6 py-3 bg-slate-50 border-b border-[var(--color-border)]">
          <FilterBar
            filters={filters}
            onChange={handleFilterChange}
            counts={counts}
            showSearchInput={false}
            showEntityTabs={true}
            workspaces={workspaces}
            projects={projects}
            collapsible={true}
          />
          <ActiveFilterChips
            filters={filters}
            workspaces={workspaces}
            projects={projects}
            onRemove={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
          />
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 min-h-[220px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-sm text-[var(--color-text-muted)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-brand)] border-t-transparent mb-3" />
              <span>Searching TaskFlow...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((item, idx) => {
              const entityType = item.entityType || "task";
              const Icon = ENTITY_ICONS[entityType] || FiFileText;
              const badge = ENTITY_BADGES[entityType] || {
                bg: "bg-slate-100 text-slate-600 border-slate-200",
                label: entityType,
              };
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={`${entityType}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3.5 sm:p-4 rounded-xl cursor-pointer transition border ${
                    isSelected
                      ? "bg-[var(--color-surface)] border-[var(--color-brand)] shadow-xs"
                      : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${badge.bg}`}
                    >
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--color-text)] truncate">
                          {item.title || item.name || "Untitled"}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 ${badge.bg}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] truncate max-w-xl mt-1">
                        {item.projectTitle && (
                          <span className="font-medium text-slate-700">
                            {item.projectTitle} •
                          </span>
                        )}
                        {item.workspaceTitle && !item.projectTitle && (
                          <span className="font-medium text-slate-700">
                            {item.workspaceTitle} •
                          </span>
                        )}
                        <span>
                          {item.snippet ||
                            item.description ||
                            item.email ||
                            item.rationale ||
                            ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.status && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-[var(--color-text-muted)] border border-slate-200">
                        {item.status}
                      </span>
                    )}
                    {item.priority && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        {item.priority}
                      </span>
                    )}
                    {item.severity && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                        {item.severity}
                      </span>
                    )}
                    {isSelected && (
                      <span className="flex items-center text-xs text-[var(--color-brand)] font-semibold gap-1 pl-1">
                        Open <FiCornerDownLeft size={12} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-14">
              <FiSearch size={32} className="mx-auto text-[var(--color-text-subtle)] mb-2" />
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {filters.q || Object.values(filters).some(Boolean)
                  ? "No matching results found"
                  : "Search & filter across TaskFlow"}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm mx-auto">
                {filters.q || Object.values(filters).some(Boolean)
                  ? "Try broadening your keywords or removing some filters to see more results."
                  : "Quickly discover tasks, projects, decisions, risks, members, and activity in your workspace."}
              </p>
              {Object.values(filters).some(Boolean) && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="mt-3 text-xs font-semibold text-[var(--color-brand)] hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5 bg-slate-50 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[var(--color-border)] font-mono text-[10px]">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[var(--color-border)] font-mono text-[10px]">
                Enter
              </kbd>{" "}
              Open
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[var(--color-border)] font-mono text-[10px]">
                ESC
              </kbd>{" "}
              Close
            </span>
          </div>

          <div className="flex items-center gap-3">
            {totalCount > 0 && (
              <span className="font-medium text-[var(--color-text-muted)]">
                Found {totalCount} {totalCount === 1 ? "result" : "results"}
              </span>
            )}
            <button
              type="button"
              onClick={goToFullSearch}
              className="flex items-center gap-1 font-semibold text-[var(--color-brand)] hover:underline"
            >
              Open Full Search <FiArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
