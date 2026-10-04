import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  FiSearch,
  FiCheckSquare,
  FiFolder,
  FiLayers,
  FiFileText,
  FiAlertTriangle,
  FiUser,
  FiActivity,
  FiArrowRight,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiInbox,
} from "react-icons/fi";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FilterBar from "../../components/search/FilterBar";
import ActiveFilterChips from "../../components/search/ActiveFilterChips";
import { searchUnified } from "../../services/api/searchApi";
import { getWorkspaces } from "../../services/api/workspaceApi";
import { getProjects } from "../../services/api/projectApi";

const ENTITY_ICONS = {
  tasks: FiCheckSquare,
  projects: FiFolder,
  workspaces: FiLayers,
  decisions: FiFileText,
  risks: FiAlertTriangle,
  members: FiUser,
  activity: FiActivity,
};

const ENTITY_COLORS = {
  tasks: "bg-blue-50 text-blue-600 border-blue-200",
  projects: "bg-indigo-50 text-indigo-600 border-indigo-200",
  workspaces: "bg-purple-50 text-purple-600 border-purple-200",
  decisions: "bg-emerald-50 text-emerald-600 border-emerald-200",
  risks: "bg-amber-50 text-amber-600 border-amber-200",
  members: "bg-teal-50 text-teal-600 border-teal-200",
  activity: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Extract filters from URL search params
  const currentFilters = {
    q: searchParams.get("q") || "",
    type: searchParams.get("type") || "all",
    workspaceId: searchParams.get("workspaceId") || "",
    projectId: searchParams.get("projectId") || "",
    status: searchParams.get("status") || "",
    priority: searchParams.get("priority") || "",
    assigneeId: searchParams.get("assigneeId") || "",
    ownerId: searchParams.get("ownerId") || "",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
    category: searchParams.get("category") || "",
    severity: searchParams.get("severity") || "",
    sortBy: searchParams.get("sortBy") || "relevance",
    sortOrder: searchParams.get("sortOrder") || "desc",
    page: parseInt(searchParams.get("page") || "1", 10),
    pageSize: parseInt(searchParams.get("pageSize") || "20", 10),
  };

  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);

  const [results, setResults] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load available workspaces and projects for scoping
  useEffect(() => {
    let active = true;
    const loadScope = async () => {
      try {
        const wsRes = await getWorkspaces();
        const wsList = wsRes?.workspaces || (Array.isArray(wsRes?.data) ? wsRes.data : []);
        if (!active) return;
        setWorkspaces(wsList);

        if (wsList.length > 0) {
          const projectPromises = wsList.map((ws) =>
            getProjects(ws.id).catch(() => ({ projects: [] }))
          );
          const prjResults = await Promise.all(projectPromises);
          if (!active) return;
          const allPrjs = prjResults.flatMap(
            (r) => r?.projects || (Array.isArray(r?.data) ? r.data : [])
          );
          setProjects(allPrjs);
        }
      } catch (err) {
        console.warn("Failed to load search workspaces/projects:", err);
      }
    };
    loadScope();
    return () => {
      active = false;
    };
  }, []);

  // Sync state changes into URL search params
  const updateFilters = useCallback(
    (newFilters) => {
      const updated = new URLSearchParams();
      for (const [key, val] of Object.entries(newFilters)) {
        if (val !== undefined && val !== null && val !== "" && val !== "all") {
          // If page is 1, we can omit it for cleaner URLs
          if (key === "page" && val === 1) continue;
          if (key === "pageSize" && val === 20) continue;
          if (key === "sortBy" && val === "relevance") continue;
          if (key === "sortOrder" && val === "desc") continue;
          updated.set(key, val);
        }
      }
      setSearchParams(updated);
    },
    [setSearchParams]
  );

  // Execute unified search when URL params change
  useEffect(() => {
    let isCancelled = false;

    const execute = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await searchUnified({
          q: currentFilters.q || undefined,
          type: currentFilters.type !== "all" ? currentFilters.type : undefined,
          workspaceId: currentFilters.workspaceId || undefined,
          projectId: currentFilters.projectId || undefined,
          status: currentFilters.status || undefined,
          priority: currentFilters.priority || undefined,
          assigneeId: currentFilters.assigneeId || undefined,
          ownerId: currentFilters.ownerId || undefined,
          from: currentFilters.from || undefined,
          to: currentFilters.to || undefined,
          category: currentFilters.category || undefined,
          severity: currentFilters.severity || undefined,
          sortBy: currentFilters.sortBy || undefined,
          sortOrder: currentFilters.sortOrder || undefined,
          page: currentFilters.page || 1,
          pageSize: currentFilters.pageSize || 20,
        });

        if (!isCancelled && response?.data) {
          const rawItems = Array.isArray(response.data.flatResults)
            ? response.data.flatResults
            : Array.isArray(response.data.results)
            ? response.data.results
            : [];
          setResults(rawItems);
          setCounts(response.data.counts || {});
          setPagination(
            response.data.pagination || {
              page: currentFilters.page,
              pageSize: currentFilters.pageSize,
              total: response.data.counts?.total || rawItems.length,
              totalPages: Math.ceil((response.data.counts?.total || rawItems.length) / (currentFilters.pageSize || 20)) || 1,
            }
          );
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Search execution failed:", err);
          setError(err.response?.data?.message || "Failed to execute search. Please try again.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    execute();

    return () => {
      isCancelled = true;
    };
  }, [
    searchParams.get("q"),
    searchParams.get("type"),
    searchParams.get("workspaceId"),
    searchParams.get("projectId"),
    searchParams.get("status"),
    searchParams.get("priority"),
    searchParams.get("assigneeId"),
    searchParams.get("ownerId"),
    searchParams.get("from"),
    searchParams.get("to"),
    searchParams.get("category"),
    searchParams.get("severity"),
    searchParams.get("sortBy"),
    searchParams.get("sortOrder"),
    searchParams.get("page"),
    searchParams.get("pageSize"),
  ]);

  const handleFilterChange = (updated) => {
    updateFilters(updated);
  };

  const handleRemoveFilter = (key) => {
    const updated = { ...currentFilters, [key]: key === "type" ? "all" : "" };
    updateFilters(updated);
  };

  const handleClearAll = () => {
    updateFilters({ q: "", type: "all" });
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    updateFilters({ ...currentFilters, page: newPage });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Search & Filters"
          description="Explore tasks, projects, decisions, risks, teammates, and system activity across all your authorized workspaces."
        />

        {/* Filter Bar Component */}
        <Card className="p-5">
          <FilterBar
            filters={currentFilters}
            onChange={handleFilterChange}
            counts={counts}
            showEntityTabs={true}
            workspaces={workspaces}
            projects={projects}
            collapsible={true}
          />
          <ActiveFilterChips
            filters={currentFilters}
            workspaces={workspaces}
            projects={projects}
            onRemove={handleRemoveFilter}
            onClearAll={handleClearAll}
          />
        </Card>

        {/* Search Results Summary & Count */}
        <div className="flex items-center justify-between px-1">
          <div className="text-sm text-[var(--color-text-muted)]">
            {loading ? (
              <span>Searching...</span>
            ) : (
              <span>
                Found <strong className="text-[var(--color-text)] font-semibold">{pagination.total}</strong>{" "}
                {pagination.total === 1 ? "result" : "results"}
                {currentFilters.q && (
                  <span>
                    {" "}
                    for "<strong>{currentFilters.q}</strong>"
                  </span>
                )}
              </span>
            )}
          </div>

          {pagination.totalPages > 1 && (
            <div className="text-xs text-[var(--color-text-subtle)]">
              Page {pagination.page} of {pagination.totalPages}
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 w-full animate-pulse rounded-2xl border border-[var(--color-border)] bg-slate-100"
              />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-3">
            {results.map((item) => {
              const Icon = ENTITY_ICONS[item.entityType] || FiFileText;
              const colorClass = ENTITY_COLORS[item.entityType] || "bg-slate-50 text-slate-600 border-slate-200";

              return (
                <div
                  key={`${item.entityType}-${item.id}`}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-xs transition hover:border-[var(--color-brand)] hover:shadow-md"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colorClass}`}
                    >
                      <Icon size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => item.navigationTarget && navigate(item.navigationTarget)}
                          className="text-base font-semibold text-[var(--color-text)] hover:text-[var(--color-brand)] transition truncate text-left"
                        >
                          {item.title}
                        </button>

                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-slate-100 text-[var(--color-text-subtle)]">
                          {item.entityType.slice(0, -1)}
                        </span>

                        {item.metadata?.status && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {item.metadata.status}
                          </span>
                        )}

                        {item.metadata?.priority && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            {item.metadata.priority}
                          </span>
                        )}

                        {item.metadata?.severity && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                            {item.metadata.severity}
                          </span>
                        )}
                      </div>

                      {item.snippet && (
                        <p className="mt-1 text-sm text-[var(--color-text-muted)] line-clamp-2">
                          {item.snippet}
                        </p>
                      )}

                      {/* Context metadata footer */}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-subtle)]">
                        {item.metadata?.workspaceName && (
                          <span className="flex items-center gap-1 font-medium">
                            <FiLayers size={12} /> {item.metadata.workspaceName}
                          </span>
                        )}
                        {item.metadata?.projectName && (
                          <span className="flex items-center gap-1 font-medium">
                            <FiFolder size={12} /> {item.metadata.projectName}
                          </span>
                        )}
                        {item.metadata?.assigneeName && (
                          <span className="flex items-center gap-1 font-medium">
                            <FiUser size={12} /> {item.metadata.assigneeName}
                          </span>
                        )}
                        {item.metadata?.updatedAt && (
                          <span className="flex items-center gap-1">
                            <FiCalendar size={12} />
                            Updated {new Date(item.metadata.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => item.navigationTarget && navigate(item.navigationTarget)}
                      className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100"
                    >
                      <span>View</span>
                      <FiArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-12 text-center shadow-xs">
            <FiInbox size={36} className="mx-auto text-[var(--color-text-subtle)] mb-3" />
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              No matching items found
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] max-w-md mx-auto">
              We couldn't find any resources matching your search and filter criteria. Try clearing some filters or searching with broader keywords.
            </p>
            <div className="mt-5 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Reset all filters
              </Button>
            </div>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4 px-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
              className="flex items-center gap-1"
            >
              <FiChevronLeft size={16} /> Previous
            </Button>

            <span className="text-xs text-[var(--color-text-muted)]">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
              className="flex items-center gap-1"
            >
              Next <FiChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
