import React, { useState } from "react";
import { FiSearch, FiFilter, FiSliders, FiX, FiCalendar, FiUser, FiLayers, FiFolder } from "react-icons/fi";

const ENTITY_TYPES = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "projects", label: "Projects" },
  { id: "workspaces", label: "Workspaces" },
  { id: "decisions", label: "Decisions" },
  { id: "risks", label: "Risks" },
  { id: "members", label: "Members" },
  { id: "activity", label: "Activity" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "IN_REVIEW", label: "In Review" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Most Relevant" },
  { value: "updatedAt", label: "Recently Updated" },
  { value: "createdAt", label: "Recently Created" },
  { value: "title", label: "Title (Alphabetical)" },
];

export default function FilterBar({
  filters = {},
  onChange,
  counts = {},
  showEntityTabs = true,
  showSearchInput = true,
  workspaces = [],
  projects = [],
  collapsible = false,
  className = "",
}) {
  const [showAdvanced, setShowAdvanced] = useState(!collapsible);

  const handleInputChange = (field, value) => {
    onChange({
      ...filters,
      [field]: value,
      page: 1, // reset page when filters change
    });
  };

  const availableProjects = filters.workspaceId
    ? projects.filter((p) => (p.workspace_id || p.workspaceId) === filters.workspaceId)
    : projects;

  const countActiveAdvancedFilters = [
    filters.workspaceId,
    filters.projectId,
    filters.status,
    filters.priority,
    filters.assigneeId,
    filters.ownerId,
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Bar Input */}
      {showSearchInput && (
        <div className="relative flex items-center">
          <FiSearch
            size={18}
            className="pointer-events-none absolute left-3.5 text-[var(--color-text-subtle)]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={filters.q || ""}
            onChange={(e) => handleInputChange("q", e.target.value)}
            placeholder="Search tasks, projects, decisions, risks, members..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2.5 pl-10 pr-10 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_12%,transparent)] placeholder:text-[var(--color-text-subtle)]"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => handleInputChange("q", "")}
              className="absolute right-3 rounded p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
              aria-label="Clear search query"
            >
              <FiX size={16} />
            </button>
          )}
        </div>
      )}

      {/* Entity Type Tabs */}
      {showEntityTabs && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] pb-2.5">
          {ENTITY_TYPES.map((type) => {
            const count =
              counts[type.id] !== undefined
                ? counts[type.id]
                : type.id === "all"
                ? counts.total
                : undefined;
            const active = (filters.type || "all") === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => handleInputChange("type", type.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-[var(--color-brand)] text-white shadow-xs"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-slate-200 hover:text-[var(--color-text)]"
                }`}
              >
                <span>{type.label}</span>
                {count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active
                        ? "bg-white/25 text-white"
                        : "bg-slate-300 text-[var(--color-text-muted)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {collapsible && (
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className={`ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition border ${
                showAdvanced || countActiveAdvancedFilters > 0
                  ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <FiSliders size={13} />
              <span>Filters</span>
              {countActiveAdvancedFilters > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-brand)] text-[10px] font-bold text-white">
                  {countActiveAdvancedFilters}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Filter Controls Row */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          {/* Workspace Filter */}
          {workspaces.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-workspace" className="font-medium text-[var(--color-text-subtle)] shrink-0">
                Workspace:
              </label>
              <select
                id="filter-workspace"
                value={filters.workspaceId || ""}
                onChange={(e) => {
                  onChange({
                    ...filters,
                    workspaceId: e.target.value,
                    projectId: "", // reset project if workspace changes
                    page: 1,
                  });
                }}
                className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] min-w-[120px] max-w-[180px] truncate"
              >
                <option value="">All Workspaces</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Project Filter */}
          {projects.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-project" className="font-medium text-[var(--color-text-subtle)] shrink-0">
                Project:
              </label>
              <select
                id="filter-project"
                value={filters.projectId || ""}
                onChange={(e) => handleInputChange("projectId", e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] min-w-[120px] max-w-[180px] truncate"
              >
                <option value="">All Projects</option>
                {availableProjects.map((prj) => (
                  <option key={prj.id} value={prj.id}>
                    {prj.title || prj.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-status" className="font-medium text-[var(--color-text-subtle)] shrink-0">
              Status:
            </label>
            <select
              id="filter-status"
              value={filters.status || ""}
              onChange={(e) => handleInputChange("status", e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-priority" className="font-medium text-[var(--color-text-subtle)] shrink-0">
              Priority:
            </label>
            <select
              id="filter-priority"
              value={filters.priority || ""}
              onChange={(e) => handleInputChange("priority", e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee / Owner */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-assignee" className="font-medium text-[var(--color-text-subtle)] shrink-0">
              Assignee:
            </label>
            <input
              id="filter-assignee"
              type="text"
              placeholder="User ID or name..."
              value={filters.assigneeId || ""}
              onChange={(e) => handleInputChange("assigneeId", e.target.value)}
              className="w-32 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] placeholder:text-[var(--color-text-subtle)]"
            />
          </div>

          {/* Date Range: From */}
          <div className="flex items-center gap-1">
            <label htmlFor="filter-from" className="font-medium text-[var(--color-text-subtle)] shrink-0">
              From:
            </label>
            <input
              id="filter-from"
              type="date"
              value={filters.from || ""}
              onChange={(e) => handleInputChange("from", e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
            />
          </div>

          {/* Date Range: To */}
          <div className="flex items-center gap-1">
            <label htmlFor="filter-to" className="font-medium text-[var(--color-text-subtle)] shrink-0">
              To:
            </label>
            <input
              id="filter-to"
              type="date"
              value={filters.to || ""}
              onChange={(e) => handleInputChange("to", e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
            />
          </div>

          {/* Sort By Filter */}
          <div className="flex items-center gap-1.5 ml-auto">
            <label htmlFor="filter-sort" className="font-medium text-[var(--color-text-subtle)] shrink-0">
              Sort:
            </label>
            <select
              id="filter-sort"
              value={filters.sortBy || "relevance"}
              onChange={(e) => handleInputChange("sortBy", e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Sort Order Toggle */}
            <button
              type="button"
              onClick={() =>
                handleInputChange(
                  "sortOrder",
                  (filters.sortOrder || "desc") === "desc" ? "asc" : "desc"
                )
              }
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50 transition"
              title="Toggle sort direction"
            >
              {(filters.sortOrder || "desc").toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
