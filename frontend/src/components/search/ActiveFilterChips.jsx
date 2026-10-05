import React from "react";
import { FiX } from "react-icons/fi";

/**
 * ActiveFilterChips displays active filters as interactive chips with remove buttons.
 * 
 * @param {Object} props
 * @param {Object} props.filters - Active filter key-value pairs
 * @param {Function} props.onRemove - Callback when a single filter is removed (key) => void
 * @param {Function} props.onClearAll - Callback when clear all is clicked () => void
 */
export default function ActiveFilterChips({
  filters = {},
  onRemove,
  onClearAll,
  workspaces = [],
  projects = [],
  className = "",
}) {
  const chips = [];

  if (filters.q) {
    chips.push({ key: "q", label: `Query: "${filters.q}"` });
  }
  if (filters.type && filters.type !== "all") {
    chips.push({ key: "type", label: `Type: ${filters.type}` });
  }
  if (filters.workspaceId) {
    const ws = workspaces.find((w) => w.id === filters.workspaceId);
    chips.push({ key: "workspaceId", label: `Workspace: ${ws?.name || filters.workspaceId}` });
  }
  if (filters.projectId) {
    const prj = projects.find((p) => p.id === filters.projectId);
    chips.push({ key: "projectId", label: `Project: ${prj?.title || prj?.name || filters.projectId}` });
  }
  if (filters.status) {
    chips.push({ key: "status", label: `Status: ${filters.status}` });
  }
  if (filters.priority) {
    chips.push({ key: "priority", label: `Priority: ${filters.priority}` });
  }
  if (filters.assigneeId) {
    chips.push({ key: "assigneeId", label: `Assignee: ${filters.assigneeId}` });
  }
  if (filters.ownerId) {
    chips.push({ key: "ownerId", label: `Owner: ${filters.ownerId}` });
  }
  if (filters.from) {
    chips.push({ key: "from", label: `From: ${filters.from}` });
  }
  if (filters.to) {
    chips.push({ key: "to", label: `To: ${filters.to}` });
  }
  if (filters.category) {
    chips.push({ key: "category", label: `Category: ${filters.category}` });
  }
  if (filters.severity) {
    chips.push({ key: "severity", label: `Severity: ${filters.severity}` });
  }
  if (filters.sortBy && filters.sortBy !== "relevance") {
    chips.push({ key: "sortBy", label: `Sort: ${filters.sortBy} (${filters.sortOrder || "desc"})` });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 pb-1">
      <span className="text-xs font-medium text-[var(--color-text-subtle)]">Active filters:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] shadow-xs transition hover:bg-slate-100"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove && onRemove(chip.key)}
            className="rounded p-0.5 text-[var(--color-text-subtle)] hover:bg-red-50 hover:text-red-600 focus:outline-none"
            aria-label={`Remove filter ${chip.label}`}
          >
            <FiX size={12} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-semibold text-[var(--color-brand)] hover:underline ml-1 focus:outline-none"
      >
        Clear all
      </button>
    </div>
  );
}
