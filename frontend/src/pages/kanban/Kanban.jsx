import { useEffect, useMemo, useState, useCallback } from "react";
import { FiLayout } from "react-icons/fi";
import { useSocketEvent } from "../../context/SocketContext";

import KanbanColumn from "../../components/kanban/KanbanColumn";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

import { getWorkspaces } from "../../services/api/workspaceApi";
import { getProjects } from "../../services/api/projectApi";
import {
  getProjectTasks,
  updateTaskStatus,
} from "../../services/api/taskApi";

const STATUSES = [
  "Backlog",
  "To Do",
  "In Progress",
  "Review",
  "Completed",
];

function Kanban() {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [query, setQuery] = useState("");

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
   * Load projects for the selected workspace,
   * then load tasks belonging to those projects.
   */
  const loadKanbanData = useCallback(async (silent = false, wsId = null) => {
    try {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      const workspaceResponse = await getWorkspaces();

      const wsList =
        workspaceResponse?.workspaces ||
        workspaceResponse?.data ||
        [];

      setWorkspaces(wsList);

      if (!wsList.length) {
        setProjects([]);
        setTasks([]);
        return;
      }

      const activeWsId = wsId || workspaceId || wsList[0]?.id || "";
      if (!workspaceId || wsId) {
        setWorkspaceId(activeWsId);
      }

      // Load projects strictly for the active workspace
      const projectResponse = await getProjects(activeWsId).catch(() => ({ projects: [] }));
      const wsProjects =
        projectResponse?.projects ||
        projectResponse?.data ||
        [];

      setProjects(wsProjects);

      /*
       * Load tasks with bounded concurrency to eliminate N+1 connection spikes.
       */
      const targetProjects = projectId === "all"
        ? wsProjects
        : wsProjects.filter((p) => p.id === projectId);

      const loadedTasks = [];
      const BATCH_SIZE = 4;

      for (let i = 0; i < targetProjects.length; i += BATCH_SIZE) {
        const batch = targetProjects.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (project) => {
            try {
              const taskResponse = await getProjectTasks(project.id);
              const projectTasks =
                taskResponse?.tasks ||
                taskResponse?.data ||
                [];

              return projectTasks.map((task) => ({
                ...task,
                projectId: project.id,
                projectName:
                  project.title ||
                  project.name ||
                  "Untitled project",
                assignee: (() => {
                  const user =
                    task.users_tasks_assigned_toTousers ||
                    task.assignee ||
                    null;
                  if (!user) return "Unassigned";
                  const first = user.first_name || user.firstName || "";
                  const last = user.last_name || user.lastName || "";
                  const full = `${first} ${last}`.trim();
                  return full || user.name || user.email || "Unassigned";
                })(),
                dueDate: task.due_date
                  ? (() => {
                      const match = String(task.due_date).match(/^(\d{4})-(\d{2})-(\d{2})/);
                      const d = match
                        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
                        : new Date(task.due_date);
                      return !Number.isNaN(d.getTime())
                        ? d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "No due date";
                    })()
                  : "No due date",
                subtasksCompleted:
                  task.subtasksCompleted ??
                  task.completedSubtasks ??
                  0,
                subtasksTotal:
                  task.subtasksTotal ??
                  task.totalSubtasks ??
                  0,
              }));
            } catch (taskError) {
              console.error(
                `Failed to load tasks for project ${project.id}:`,
                taskError
              );
              return [];
            }
          })
        );
        loadedTasks.push(...batchResults.flat());
      }

      setTasks(loadedTasks);
    } catch (loadError) {
      console.error("Failed to load Kanban:", loadError);

      setError(
        loadError?.response?.data?.message ||
          "Failed to load Kanban data."
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    void loadKanbanData();
  }, [loadKanbanData]);

  // Real-time synchronization for Kanban board
  useSocketEvent("*", (event) => {
    if (!event?.type) return;

    if (event.type === "task.status_updated" || event.type === "task.status_changed") {
      const targetTaskId = event.taskId || event.data?.id;
      const targetStatus = event.newStatus || event.changes?.status || event.data?.status;

      if (targetTaskId && targetStatus) {
        setTasks((currentTasks) => {
          const exists = currentTasks.some((t) => t.id === targetTaskId);
          if (exists) {
            return currentTasks.map((t) =>
              t.id === targetTaskId
                ? {
                    ...t,
                    status: targetStatus,
                    ...(event.data
                      ? {
                          title: event.data.title || t.title,
                          description: event.data.description ?? t.description,
                          priority: event.data.priority || t.priority
                        }
                      : {})
                  }
                : t
            );
          }
          void loadKanbanData(true);
          return currentTasks;
        });
        return;
      }
    }

    if (event.type === "task.archived") {
      const targetTaskId = event.taskId || event.data?.id;
      if (targetTaskId) {
        setTasks((currentTasks) => currentTasks.filter((t) => t.id !== targetTaskId));
        return;
      }
    }

    if (event.type.startsWith("task.") || event.type.startsWith("subtask.")) {
      void loadKanbanData(true);
    }
  });

  useSocketEvent("reconnect", () => {
    void loadKanbanData(true);
  });

  /*
   * Move task to another status.
   * The change is persisted through the backend.
   */
  const moveTask = async (taskId, status) => {
    const previousTasks = tasks;

    /*
     * Optimistic UI update.
     */
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? { ...task, status }
          : task
      )
    );

    try {
      await updateTaskStatus(taskId, status);
    } catch (updateError) {
      console.error(
        "Failed to update task status:",
        updateError
      );

      /*
       * Restore previous state if backend update fails.
       */
      setTasks(previousTasks);

      setError(
        updateError?.response?.data?.message ||
          "Failed to update task status."
      );
    }
  };

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesProject =
        projectId === "all" ||
        task.projectId === projectId;

      const matchesQuery =
        !normalizedQuery ||
        `${task.title || ""} ${
          task.description || ""
        } ${task.assignee || ""}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesProject && matchesQuery;
    });
  }, [projectId, query, tasks]);

  return (
    <MainLayout>
      <div className="space-y-7">
        <PageHeader
          title="Kanban board"
          description="See your work at a glance and move tasks through each stage of progress."
          actions={
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-hover)]">
              <FiLayout
                size={16}
                aria-hidden="true"
              />
              {visibleTasks.length} visible tasks
            </span>
          }
        />

        <Card className="p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(12rem,0.7fr)_minmax(12rem,0.7fr)_minmax(16rem,1.2fr)]">
            <label
              className="block text-sm font-medium text-[var(--color-text)]"
              htmlFor="kanban-workspace"
            >
              <span className="mb-2 block">
                Workspace
              </span>

              <select
                id="kanban-workspace"
                value={workspaceId}
                onChange={(event) => {
                  const newWs = event.target.value;
                  setWorkspaceId(newWs);
                  setProjectId("all");
                  void loadKanbanData(false, newWs);
                }}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
              >
                {workspaces.map((ws) => (
                  <option
                    key={ws.id}
                    value={ws.id}
                  >
                    {ws.name}
                  </option>
                ))}
              </select>
            </label>

            <label
              className="block text-sm font-medium text-[var(--color-text)]"
              htmlFor="kanban-project"
            >
              <span className="mb-2 block">
                Project
              </span>

              <select
                id="kanban-project"
                value={projectId}
                onChange={(event) =>
                  setProjectId(event.target.value)
                }
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
              >
                <option value="all">
                  All projects
                </option>

                {projects.map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                  >
                    {project.title ||
                      project.name ||
                      "Untitled project"}
                  </option>
                ))}
              </select>
            </label>

            <Input
              id="kanban-search"
              label="Search tasks"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search by task, detail, or assignee"
              type="search"
              autoComplete="off"
            />
          </div>
        </Card>

        {error && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <Card className="flex min-h-60 items-center justify-center p-6">
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              Loading Kanban board...
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto pb-3">
            <div
              className="flex min-w-max gap-4"
              aria-label="Kanban board columns"
            >
              {STATUSES.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  statuses={STATUSES}
                  tasks={visibleTasks.filter(
                    (task) => task.status === status
                  )}
                  onMoveTask={moveTask}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default Kanban;