import { useEffect, useMemo, useState, useCallback } from "react";
import { FiActivity, FiAlertCircle, FiChevronLeft, FiChevronRight, FiRefreshCw } from "react-icons/fi";

import ActivityFilters from "../../components/activity/ActivityFilters";
import ActivityTimeline from "../../components/activity/ActivityTimeline";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";
import { getWorkspaces } from "../../services/api/workspaceApi";
import { getWorkspaceActivities } from "../../services/api/activityApi";
import { useSocketEvent } from "../../context/SocketContext";

const PAGE_LIMIT = 10;

function Activity() {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [activities, setActivities] = useState([]);
  const [actionType, setActionType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Load workspaces
  useEffect(() => {
    let isMounted = true;
    const loadWorkspaces = async () => {
      setIsLoadingWorkspaces(true);
      try {
        const res = await getWorkspaces();
        const list = res?.workspaces || res?.data?.workspaces || res?.data || [];
        if (isMounted) {
          setWorkspaces(list);
          if (list.length > 0 && !selectedWorkspaceId) {
            setSelectedWorkspaceId(list[0].id);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Failed to load workspaces.");
        }
      } finally {
        if (isMounted) setIsLoadingWorkspaces(false);
      }
    };

    void loadWorkspaces();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load activities for selected workspace
  const loadActivities = useCallback(async (silent = false) => {
    if (!selectedWorkspaceId) return;
    if (!silent) {
      setIsLoading(true);
      setError("");
    }

    try {
      const res = await getWorkspaceActivities(selectedWorkspaceId, {
        page,
        limit: PAGE_LIMIT,
        actionType: actionType || undefined,
        entityType: entityType || undefined,
      });

      const list = res?.activities || res?.data?.activities || [];
      const pagination = res?.pagination || res?.data?.pagination || {};

      setActivities(Array.isArray(list) ? list : []);
      setTotalCount(pagination.total ?? list.length);
      setTotalPages(Math.max(1, pagination.totalPages ?? Math.ceil(list.length / PAGE_LIMIT)));
    } catch (err) {
      console.error("Failed to load workspace activities:", err);
      if (!silent) {
        setError(err.response?.data?.message || "Failed to load workspace activities.");
        setActivities([]);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [selectedWorkspaceId, page, actionType, entityType]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      void loadActivities();
    }
  }, [selectedWorkspaceId, loadActivities]);

  // Real-time synchronization
  useSocketEvent("*", (event) => {
    if (!event?.type) return;
    if (
      event.workspaceId === selectedWorkspaceId ||
      event.type.startsWith("activity.") ||
      event.type.startsWith("task.") ||
      event.type.startsWith("project.")
    ) {
      void loadActivities(true);
    }
  });

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId),
    [workspaces, selectedWorkspaceId]
  );

  const actionTypes = useMemo(() => {
    const types = new Set(["created", "updated", "completed", "archived", "added", "removed"]);
    activities.forEach((a) => {
      if (a.action_type) types.add(a.action_type);
    });
    return Array.from(types);
  }, [activities]);

  const entityTypes = useMemo(() => {
    const types = new Set(["task", "project", "workspace", "comment"]);
    activities.forEach((a) => {
      if (a.entity_type) types.add(a.entity_type);
    });
    return Array.from(types);
  }, [activities]);

  const changeWorkspace = (workspaceId) => {
    setSelectedWorkspaceId(workspaceId);
    setActionType("");
    setEntityType("");
    setPage(1);
  };

  const changeActionType = (value) => {
    setActionType(value);
    setPage(1);
  };

  const changeEntityType = (value) => {
    setEntityType(value);
    setPage(1);
  };

  const hasFilters = Boolean(actionType || entityType);

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Activity"
          description="Follow the latest workspace updates, from new plans to completed work."
        />

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">
            <div className="flex items-center gap-2">
              <FiAlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="secondary" onClick={() => loadActivities()} className="shrink-0 text-xs">
              <FiRefreshCw size={14} /> Retry
            </Button>
          </div>
        )}

        <Card className="p-4 sm:p-5">
          <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="activity-workspace">
            Workspace
            <select
              id="activity-workspace"
              value={selectedWorkspaceId}
              onChange={(event) => changeWorkspace(event.target.value)}
              disabled={isLoadingWorkspaces || workspaces.length === 0}
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm font-medium text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)] sm:max-w-sm"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {selectedWorkspace?.description || (workspaces.length === 0 && !isLoadingWorkspaces ? "No workspaces found. Create a workspace to track activity." : "Choose a workspace to review its updates.")}
          </p>
        </Card>

        <ActivityFilters
          actionTypes={actionTypes}
          entityTypes={entityTypes}
          actionType={actionType}
          entityType={entityType}
          onActionTypeChange={changeActionType}
          onEntityTypeChange={changeEntityType}
        />

        <section aria-labelledby="activity-timeline-heading">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)]">
              <FiActivity size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 id="activity-timeline-heading" className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
                Timeline
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {totalCount} {totalCount === 1 ? "update" : "updates"} in this view
              </p>
            </div>
          </div>

          <ActivityTimeline
            activities={activities}
            isLoading={isLoading}
            isFiltered={hasFilters}
          />
        </section>

        {!isLoading && totalCount > 0 && (
          <nav
            className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Activity pagination"
          >
            <p className="text-sm text-[var(--color-text-muted)]">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                aria-label="Previous activity page"
              >
                <FiChevronLeft size={16} aria-hidden="true" />
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                aria-label="Next activity page"
              >
                Next
                <FiChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </div>
    </MainLayout>
  );
}

export default Activity;
