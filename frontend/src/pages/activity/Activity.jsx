import { useEffect, useMemo, useState } from "react";
import { FiActivity, FiChevronLeft, FiChevronRight } from "react-icons/fi";

import ActivityFilters from "../../components/activity/ActivityFilters";
import ActivityTimeline from "../../components/activity/ActivityTimeline";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import { initialWorkspaces } from "../../data/workspaceMockData";
import MainLayout from "../../layouts/MainLayout";

// These records match the future GET /api/workspaces/:workspaceId/activities item shape.
const mockActivities = [
  {
    id: "activity-008",
    workspace_id: "workspace-taskflow",
    user_id: "user-geethika",
    action_type: "completed",
    entity_type: "task",
    entity_id: "task-website-review",
    description: "Completed the website content review task.",
    created_at: "2026-10-05T08:45:00.000Z",
    users: { id: "user-geethika", first_name: "Geethika", last_name: "Sai Unnam", email: "geethika@taskflow.dev" },
  },
  {
    id: "activity-007",
    workspace_id: "workspace-taskflow",
    user_id: "user-aria",
    action_type: "updated",
    entity_type: "project",
    entity_id: "project-launch",
    description: "Updated the product launch project timeline.",
    created_at: "2026-10-05T07:20:00.000Z",
    users: { id: "user-aria", first_name: "Aria", last_name: "Patel", email: "aria@taskflow.dev" },
  },
  {
    id: "activity-006",
    workspace_id: "workspace-taskflow",
    user_id: "user-james",
    action_type: "created",
    entity_type: "task",
    entity_id: "task-research-summary",
    description: "Created the customer research summary task.",
    created_at: "2026-10-04T14:30:00.000Z",
    users: { id: "user-james", first_name: "James", last_name: "Morgan", email: "james@taskflow.dev" },
  },
  {
    id: "activity-005",
    workspace_id: "workspace-taskflow",
    user_id: "user-aria",
    action_type: "added",
    entity_type: "workspace",
    entity_id: "workspace-taskflow",
    description: "Added James Morgan to the workspace.",
    created_at: "2026-10-04T11:15:00.000Z",
    users: { id: "user-aria", first_name: "Aria", last_name: "Patel", email: "aria@taskflow.dev" },
  },
  {
    id: "activity-004",
    workspace_id: "workspace-taskflow",
    user_id: "user-geethika",
    action_type: "updated",
    entity_type: "task",
    entity_id: "task-navigation",
    description: "Updated the navigation audit task due date.",
    created_at: "2026-10-03T16:00:00.000Z",
    users: { id: "user-geethika", first_name: "Geethika", last_name: "Sai Unnam", email: "geethika@taskflow.dev" },
  },
  {
    id: "activity-003",
    workspace_id: "workspace-taskflow",
    user_id: "user-james",
    action_type: "created",
    entity_type: "project",
    entity_id: "project-mobile",
    description: "Created the mobile planning project.",
    created_at: "2026-10-03T09:10:00.000Z",
    users: { id: "user-james", first_name: "James", last_name: "Morgan", email: "james@taskflow.dev" },
  },
  {
    id: "activity-002",
    workspace_id: "workspace-taskflow",
    user_id: "user-geethika",
    action_type: "created",
    entity_type: "workspace",
    entity_id: "workspace-taskflow",
    description: "Created the TaskFlow Studio workspace.",
    created_at: "2026-10-02T10:00:00.000Z",
    users: { id: "user-geethika", first_name: "Geethika", last_name: "Sai Unnam", email: "geethika@taskflow.dev" },
  },
];

const PAGE_LIMIT = 4;

function Activity() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0]?.id || "");
  const [actionType, setActionType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 280);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedWorkspace = initialWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  const workspaceActivities = useMemo(
    () =>
      mockActivities
        .filter((activity) => activity.workspace_id === selectedWorkspaceId)
        .sort((first, second) => new Date(second.created_at) - new Date(first.created_at)),
    [selectedWorkspaceId],
  );

  const actionTypes = useMemo(
    () => [...new Set(workspaceActivities.map((activity) => activity.action_type))],
    [workspaceActivities],
  );
  const entityTypes = useMemo(
    () => [...new Set(workspaceActivities.map((activity) => activity.entity_type))],
    [workspaceActivities],
  );

  const filteredActivities = useMemo(
    () =>
      workspaceActivities.filter(
        (activity) =>
          (!actionType || activity.action_type === actionType) &&
          (!entityType || activity.entity_type === entityType),
      ),
    [actionType, entityType, workspaceActivities],
  );

  const pagination = useMemo(() => {
    const total = filteredActivities.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
    const currentPage = Math.min(page, totalPages);

    return { page: currentPage, limit: PAGE_LIMIT, total, totalPages };
  }, [filteredActivities.length, page]);

  const paginatedActivities = useMemo(() => {
    const start = (pagination.page - 1) * pagination.limit;
    return filteredActivities.slice(start, start + pagination.limit);
  }, [filteredActivities, pagination]);

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

        <Card className="p-4 sm:p-5">
          <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="activity-workspace">
            Workspace
            <select
              id="activity-workspace"
              value={selectedWorkspaceId}
              onChange={(event) => changeWorkspace(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm font-medium text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)] sm:max-w-sm"
            >
              {initialWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {selectedWorkspace?.description || "Choose a workspace to review its updates."}
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
                {pagination.total} {pagination.total === 1 ? "update" : "updates"} in this view
              </p>
            </div>
          </div>

          <ActivityTimeline
            activities={paginatedActivities}
            isLoading={isLoading}
            isFiltered={hasFilters}
          />
        </section>

        {!isLoading && pagination.total > 0 && (
          <nav
            className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Activity pagination"
          >
            <p className="text-sm text-[var(--color-text-muted)]">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={pagination.page === 1}
                aria-label="Previous activity page"
              >
                <FiChevronLeft size={16} aria-hidden="true" />
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                disabled={pagination.page === pagination.totalPages}
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
