import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiArchive,
  FiCalendar,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiFilter,
  FiPlus,
  FiSearch,
  FiX,
} from "react-icons/fi";

import Quackie from "../../components/brand/Quackie";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

import {
  getMyTasks,
  createTask,
  updateTask,
  archiveTask,
  updateTaskStatus,
} from "../../services/api/taskApi";

import { getWorkspaces } from "../../services/api/workspaceApi";

import {
  getProjects,
  getProjectMembers,
} from "../../services/api/projectApi";

/* ============================================================
   CONSTANTS
============================================================ */

const taskPriorities = ["Low", "Medium", "High", "Critical"];

const taskStatuses = [
  "Backlog",
  "To Do",
  "In Progress",
  "Review",
  "Completed",
];

const priorityClasses = {
  Low: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
  Medium: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  High: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
  Critical: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

const statusClasses = {
  Backlog:
    "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
  "To Do":
    "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  "In Progress":
    "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
  Review:
    "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
  Completed:
    "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
};

/* ============================================================
   HELPERS
============================================================ */

const today = () => new Date().toISOString().slice(0, 10);

const formatDate = (value) => {
  if (!value) return "Not scheduled";

  const stringValue = String(value);

  const date =
    stringValue.length === 10
      ? new Date(`${stringValue}T00:00:00`)
      : new Date(stringValue);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const emptyForm = {
  title: "",
  description: "",
  projectId: "",
  priority: "Medium",
  status: "To Do",
  startDate: "",
  dueDate: "",
  estimatedHours: "",
  assignedTo: "",
};

/* ============================================================
   DIALOG
============================================================ */

function Dialog({ children, onClose, title, wide = false }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(52_67_51/0.22)] p-3 backdrop-blur-sm sm:items-center sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        className={`max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:max-h-[calc(100vh-2.5rem)] sm:p-7 ${
          wide ? "max-w-4xl" : "max-w-xl"
        }`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="task-dialog-title"
            className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]"
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
          >
            <FiX size={19} />
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

/* ============================================================
   SELECT FIELD
============================================================ */

function SelectField({
  children,
  id,
  label,
  onChange,
  value,
  disabled = false,
}) {
  return (
    <label className="block text-sm font-medium text-[var(--color-text)]">
      {label}

      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </label>
  );
}

/* ============================================================
   AVATAR
============================================================ */

function Avatar({ user }) {
  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("") || "?";

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)]"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ============================================================
   NORMALIZERS
============================================================ */

const normalizeUser = (user) => {
  if (!user?.id) return null;

  return {
    id: user.id,
    name:
      `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
      user.name ||
      user.email ||
      "Unknown user",
    email: user.email || "",
  };
};

const normalizeProject = (project) => {
  if (!project?.id) return null;

  return {
    id: project.id,
    title: project.title || "Untitled project",
    description: project.description || "",
    status: project.status || "Planning",
    priority: project.priority || "Medium",
  };
};

const normalizeTask = (task) => ({
  ...task,

  id: task.id,

  title: task.title || "",

  description: task.description || "",

  projectId: task.project_id,

  priority: task.priority || "Medium",

  status: task.status || "To Do",

  startDate: task.start_date
    ? task.start_date.slice(0, 10)
    : "",

  dueDate: task.due_date
    ? task.due_date.slice(0, 10)
    : "",

  estimatedHours: task.estimated_hours ?? 0,

  assignedTo: task.assigned_to || "",

  isArchived: task.is_archived ?? false,

  createdAt: task.created_at,
});

/* ============================================================
   TASKS PAGE
============================================================ */

function Tasks() {
  const [tasks, setTasks] = useState([]);

  const [projects, setProjects] = useState([]);

  const [membersByProject, setMembersByProject] = useState({});

  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState("");

  const [isLoading, setIsLoading] = useState(true);

  const [isMetaLoading, setIsMetaLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("All");

  const [search, setSearch] = useState("");

  const [projectFilter, setProjectFilter] =
    useState("All");

  const [priorityFilter, setPriorityFilter] =
    useState("All");

  const [dueFilter, setDueFilter] =
    useState("All");

  const [selectedTaskId, setSelectedTaskId] =
    useState(null);

  const [dialog, setDialog] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const [formError, setFormError] = useState("");

  const [notice, setNotice] = useState("");

  const [dateReference] = useState(() => new Date());

  /* ==========================================================
     DERIVED DATA
  ========================================================== */

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) => !task.isArchived
      ),
    [tasks]
  );

  const selectedTask = useMemo(
    () =>
      tasks.find(
        (task) =>
          task.id === selectedTaskId
      ),
    [tasks, selectedTaskId]
  );

  /* ==========================================================
     HELPERS
  ========================================================== */

  const getProject = (id) => {
    return (
      projects.find(
        (project) =>
          project.id === id
      ) || null
    );
  };

  const getUser = (id) => {
    for (const members of Object.values(
      membersByProject
    )) {
      const user = members.find(
        (member) =>
          member.id === id
      );

      if (user) {
        return user;
      }
    }

    return null;
  };

  const projectMembers = (projectId) => {
    return (
      membersByProject[projectId] || []
    );
  };

  const isOverdue = (task) =>
    task.status !== "Completed" &&
    task.dueDate &&
    task.dueDate < today();

  const dueSoonLimit = new Date(
    dateReference.getTime() +
      7 * 86400000
  )
    .toISOString()
    .slice(0, 10);

  const isDueSoon = (task) =>
    task.status !== "Completed" &&
    task.dueDate &&
    task.dueDate >= today() &&
    task.dueDate <= dueSoonLimit;

  /* ==========================================================
     COUNTS
  ========================================================== */

  const counts = {
    active: activeTasks.filter(
      (task) =>
        task.status !== "Completed"
    ).length,

    dueSoon: activeTasks.filter(
      isDueSoon
    ).length,

    overdue: activeTasks.filter(
      isOverdue
    ).length,

    completed: activeTasks.filter(
      (task) =>
        task.status === "Completed"
    ).length,
  };

  /* ==========================================================
     FILTERING
  ========================================================== */

  const visibleTasks = activeTasks.filter(
    (task) => {
      const matchesTab =
        activeTab === "All" ||
        task.status === activeTab;

      const matchesSearch =
        `${task.title} ${task.description}`
          .toLowerCase()
          .includes(
            search.toLowerCase()
          );

      const matchesProject =
        projectFilter === "All" ||
        task.projectId ===
          projectFilter;

      const matchesPriority =
        priorityFilter === "All" ||
        task.priority ===
          priorityFilter;

      const matchesDue =
        dueFilter === "All" ||
        (dueFilter === "Overdue" &&
          isOverdue(task)) ||
        (dueFilter === "Due soon" &&
          isDueSoon(task));

      return (
        matchesTab &&
        matchesSearch &&
        matchesProject &&
        matchesPriority &&
        matchesDue
      );
    }
  );

  const mascotEmotion = notice
    ? "excited"
    : counts.overdue
    ? "worried"
    : !visibleTasks.length
    ? "curious"
    : counts.active === 0
    ? "excited"
    : "happy";

  /* ==========================================================
     DIALOG / FORM
  ========================================================== */

  const closeDialog = () => {
    setDialog(null);
    setFormError("");
  };

  const setField = (
    field,
    value
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openForm = (mode) => {
    const task = selectedTask;

    if (
      mode === "edit" &&
      task
    ) {
      setForm({
        title: task.title || "",

        description:
          task.description || "",

        projectId:
          task.projectId || "",

        priority:
          task.priority || "Medium",

        status:
          task.status || "To Do",

        startDate:
          task.startDate || "",

        dueDate:
          task.dueDate || "",

        estimatedHours:
          task.estimatedHours !==
            undefined &&
          task.estimatedHours !==
            null
            ? String(
                task.estimatedHours
              )
            : "",

        assignedTo:
          task.assignedTo || "",
      });
    } else {
      const firstProject =
        projects[0];

      setForm({
        ...emptyForm,

        projectId:
          firstProject?.id || "",

        assignedTo:
          firstProject
            ? projectMembers(
                firstProject.id
              )[0]?.id || ""
            : "",
      });
    }

    setFormError("");
    setDialog(mode);
  };

  /* ==========================================================
     LOAD PROJECT MEMBERS
  ========================================================== */

  const loadProjectMembers =
    async (projectList) => {
      const memberResults =
        await Promise.all(
          projectList.map(
            async (project) => {
              try {
                const response =
                  await getProjectMembers(
                    project.id
                  );

                const rawMembers =
                  response.members ||
                  response.projectMembers ||
                  response.data ||
                  [];

                const members =
                  rawMembers
                    .map((member) => {
                      const user =
                        member.users ||
                        member.user ||
                        member;

                      return normalizeUser(
                        user
                      );
                    })
                    .filter(Boolean);

                return [
                  project.id,
                  members,
                ];
              } catch (error) {
                console.error(
                  `Failed to load members for project ${project.id}`,
                  error
                );

                return [
                  project.id,
                  [],
                ];
              }
            }
          )
        );

      setMembersByProject(
        Object.fromEntries(
          memberResults
        )
      );
    };

  /* ==========================================================
     LOAD WORKSPACES / PROJECTS / MEMBERS
  ========================================================== */

  const loadTaskMetadata =
    async () => {
      try {
        setIsMetaLoading(true);

        const workspaceResponse =
          await getWorkspaces();

        const workspaceList =
          workspaceResponse.workspaces ||
          workspaceResponse.data ||
          workspaceResponse ||
          [];

        if (!workspaceList.length) {
          setProjects([]);
          setSelectedWorkspaceId("");
          setMembersByProject({});
          return;
        }

        const workspace =
          workspaceList.find(
            (item) =>
              item.id ===
              selectedWorkspaceId
          ) ||
          workspaceList[0];

        setSelectedWorkspaceId(
          workspace.id
        );

        const projectResponse =
          await getProjects(
            workspace.id
          );

        const rawProjects =
          projectResponse.projects ||
          projectResponse.data ||
          projectResponse ||
          [];

        const normalizedProjects =
          rawProjects
            .map(normalizeProject)
            .filter(Boolean);

        setProjects(
          normalizedProjects
        );

        await loadProjectMembers(
          normalizedProjects
        );
      } catch (error) {
        console.error(
          "Failed to load task metadata:",
          error
        );

        setProjects([]);
        setMembersByProject({});

        setFormError(
          error.response?.data
            ?.message ||
            "Failed to load workspaces and projects."
        );
      } finally {
        setIsMetaLoading(false);
      }
    };

  /* ==========================================================
     LOAD TASKS
  ========================================================== */

  const loadTasks = async () => {
    try {
      setIsLoading(true);

      setNotice("");

      setFormError("");

      const response =
        await getMyTasks();

      const normalizedTasks =
        (
          response.tasks || []
        ).map(normalizeTask);

      setTasks(
        normalizedTasks
      );
    } catch (error) {
      setFormError(
        error.response?.data
          ?.message ||
          "Failed to load tasks."
      );
    } finally {
      setIsLoading(false);
    }
  };

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    const loadPage =
      async () => {
        await Promise.all([
          loadTasks(),
          loadTaskMetadata(),
        ]);
      };

    void loadPage();
  }, []);

  /* ==========================================================
     SAVE TASK
  ========================================================== */

  const saveTask = async (
    event
  ) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setFormError(
        "Task title is required."
      );
      return;
    }

    if (!form.projectId) {
      setFormError(
        "Please select a project."
      );
      return;
    }

    if (
      form.estimatedHours !==
        "" &&
      (Number(
        form.estimatedHours
      ) < 0 ||
        Number.isNaN(
          Number(
            form.estimatedHours
          )
        ))
    ) {
      setFormError(
        "Estimated hours must be a non-negative number."
      );
      return;
    }

    if (
      form.startDate &&
      form.dueDate &&
      form.dueDate <
        form.startDate
    ) {
      setFormError(
        "Due date must be on or after the start date."
      );
      return;
    }

    try {
      setFormError("");

      const taskData = {
        title:
          form.title.trim(),

        description:
          form.description.trim(),

        priority:
          form.priority,

        status:
          form.status,

        startDate:
          form.startDate ||
          null,

        dueDate:
          form.dueDate ||
          null,

        estimatedHours:
          form.estimatedHours ===
          ""
            ? null
            : Number(
                form.estimatedHours
              ),

        assignedTo:
          form.assignedTo ||
          null,
      };

      /* ========================================================
         CREATE
      ======================================================== */

      if (
        dialog === "create"
      ) {
        const response =
          await createTask(
            form.projectId,
            taskData
          );

        const task =
          response.task;

        const normalizedTask =
          normalizeTask(task);

        setTasks(
          (current) => [
            normalizedTask,
            ...current,
          ]
        );

        setSelectedTaskId(
          task.id
        );

        setNotice(
          "Task created successfully."
        );
      }

      /* ========================================================
         UPDATE
      ======================================================== */

      else {
        const response =
          await updateTask(
            selectedTask.id,
            taskData
          );

        const task =
          response.task;

        const normalizedTask =
          normalizeTask(task);

        setTasks(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                selectedTask.id
                  ? {
                      ...item,
                      ...normalizedTask,
                    }
                  : item
            )
        );

        setNotice(
          "Task updated successfully."
        );
      }

      closeDialog();
    } catch (error) {
      setFormError(
        error.response?.data
          ?.message ||
          "Failed to save task."
      );
    }
  };

  /* ==========================================================
     CHANGE STATUS
  ========================================================== */

  const changeStatus =
    async (
      taskId,
      status
    ) => {
      try {
        const response =
          await updateTaskStatus(
            taskId,
            status
          );

        const task =
          response.task;

        setTasks(
          (current) =>
            current.map(
              (item) =>
                item.id === taskId
                  ? {
                      ...item,
                      status:
                        task.status,
                    }
                  : item
            )
        );

        setNotice(
          "Task status updated successfully."
        );
      } catch (error) {
        setNotice(
          error.response?.data
            ?.message ||
            "Failed to update task status."
        );
      }
    };

  /* ==========================================================
     ARCHIVE
  ========================================================== */

  const handleArchiveTask =
    async () => {
      if (!selectedTask)
        return;

      try {
        const response =
          await archiveTask(
            selectedTask.id
          );

        const task =
          response.task;

        setTasks(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                selectedTask.id
                  ? {
                      ...item,
                      isArchived:
                        task.is_archived,
                    }
                  : item
            )
        );

        setSelectedTaskId(null);

        closeDialog();

        setNotice(
          "Task archived successfully."
        );
      } catch (error) {
        setNotice(
          error.response?.data
            ?.message ||
            "Failed to archive task."
        );
      }
    };

  /* ==========================================================
     RESET FILTERS
  ========================================================== */

  const resetFilters = () => {
    setActiveTab("All");
    setSearch("");
    setProjectFilter("All");
    setPriorityFilter("All");
    setDueFilter("All");
  };

  const tabs = [
    "All",
    ...taskStatuses,
  ];

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">

        {/* PAGE HEADER */}

        <PageHeader
          title="My Tasks"
          description="Keep the next meaningful step clear, focused, and moving forward."
          actions={
            <Button
              onClick={() =>
                openForm("create")
              }
              disabled={
                isMetaLoading ||
                !projects.length
              }
            >
              <FiPlus size={17} />

              {isMetaLoading
                ? "Loading..."
                : "Add task"}
            </Button>
          }
        />

        {/* NOTICE */}

        {notice && (
          <div
            className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-sage)] px-4 py-3 text-sm text-[var(--color-brand-hover)]"
            role="status"
          >
            <span className="flex items-center gap-2">
              <FiCheckCircle
                size={18}
              />

              {notice}
            </span>

            <button
              type="button"
              onClick={() =>
                setNotice("")
              }
              className="rounded p-1 hover:bg-white/60"
              aria-label="Dismiss message"
            >
              <FiX size={16} />
            </button>
          </div>
        )}

        {/* ERROR */}

        {formError &&
          !dialog && (
            <div
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
              role="alert"
            >
              <FiAlertCircle
                size={18}
              />

              {formError}
            </div>
          )}

        {/* LOADING */}

        {isLoading && (
          <Card className="py-12 text-center">
            <FiClock
              className="mx-auto animate-pulse text-[var(--color-brand)]"
              size={28}
            />

            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Loading your tasks...
            </p>
          </Card>
        )}

        {/* SUMMARY CARDS */}

        {!isLoading && (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Active",
                value:
                  counts.active,
                icon: FiClock,
                tone: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
              },
              {
                label:
                  "Due soon",
                value:
                  counts.dueSoon,
                icon: FiCalendar,
                tone: "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
              },
              {
                label:
                  "Overdue",
                value:
                  counts.overdue,
                icon:
                  FiAlertCircle,
                tone: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
              },
              {
                label:
                  "Completed",
                value:
                  counts.completed,
                icon:
                  FiCheckCircle,
                tone: "bg-[var(--color-surface-sage)] text-[var(--color-brand)]",
              },
            ].map(
              ({
                label,
                value,
                icon: Icon,
                tone,
              }) => (
                <Card
                  key={label}
                  className="flex items-center gap-4 p-4 sm:p-5"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}
                  >
                    <Icon
                      size={19}
                    />
                  </span>

                  <div>
                    <p className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text)]">
                      {value}
                    </p>

                    <p className="text-sm text-[var(--color-text-muted)]">
                      {label}
                    </p>
                  </div>
                </Card>
              )
            )}
          </section>
        )}

        {/* FILTERS */}

        {!isLoading && (
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-4">

              {/* STATUS TABS */}

              <div
                className="flex flex-wrap gap-2"
                aria-label="Task status filters"
              >
                {tabs.map(
                  (tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() =>
                        setActiveTab(
                          tab
                        )
                      }
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                        activeTab ===
                        tab
                          ? "bg-[var(--color-brand)] text-white shadow-[var(--shadow-brand)]"
                          : "bg-[var(--color-canvas-soft)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                      }`}
                    >
                      {tab}
                    </button>
                  )
                )}
              </div>

              {/* FILTER CONTROLS */}

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(9rem,0.45fr))]">

                {/* SEARCH */}

                <label className="relative">
                  <span className="sr-only">
                    Search tasks
                  </span>

                  <FiSearch
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
                    size={17}
                  />

                  <input
                    value={search}
                    onChange={(
                      event
                    ) =>
                      setSearch(
                        event.target
                          .value
                      )
                    }
                    placeholder="Search tasks"
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                  />
                </label>

                {/* PROJECT FILTER */}

                <select
                  value={
                    projectFilter
                  }
                  onChange={(
                    event
                  ) =>
                    setProjectFilter(
                      event.target
                        .value
                    )
                  }
                  aria-label="Filter by project"
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]"
                >
                  <option value="All">
                    All
                  </option>

                  {projects.map(
                    (project) => (
                      <option
                        key={
                          project.id
                        }
                        value={
                          project.id
                        }
                      >
                        {
                          project.title
                        }
                      </option>
                    )
                  )}
                </select>

                {/* PRIORITY FILTER */}

                <select
                  value={
                    priorityFilter
                  }
                  onChange={(
                    event
                  ) =>
                    setPriorityFilter(
                      event.target
                        .value
                    )
                  }
                  aria-label="Filter by priority"
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]"
                >
                  <option value="All">
                    All
                  </option>

                  {taskPriorities.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>

                {/* DUE FILTER */}

                <select
                  value={
                    dueFilter
                  }
                  onChange={(
                    event
                  ) =>
                    setDueFilter(
                      event.target
                        .value
                    )
                  }
                  aria-label="Filter by due date"
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]"
                >
                  <option value="All">
                    All
                  </option>

                  <option value="Due soon">
                    Due soon
                  </option>

                  <option value="Overdue">
                    Overdue
                  </option>
                </select>
              </div>
            </div>
          </Card>
        )}

        {/* TASK LIST */}

        {!isLoading &&
          (visibleTasks.length ? (
            <section className="grid gap-3">
              {visibleTasks.map(
                (task) => {
                  const user =
                    getUser(
                      task.assignedTo
                    );

                  const project =
                    getProject(
                      task.projectId
                    );

                  const overdue =
                    isOverdue(
                      task
                    );

                  return (
                    <Card
                      key={
                        task.id
                      }
                      hoverable
                      className="cursor-pointer p-4 sm:p-5"
                      onClick={() =>
                        setSelectedTaskId(
                          task.id
                        )
                      }
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">

                        {/* TASK INFORMATION */}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">

                            <h2 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]">
                              {
                                task.title
                              }
                            </h2>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                statusClasses[
                                  task.status
                                ] ||
                                statusClasses[
                                  "To Do"
                                ]
                              }`}
                            >
                              {
                                task.status
                              }
                            </span>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                priorityClasses[
                                  task.priority
                                ] ||
                                priorityClasses.Medium
                              }`}
                            >
                              {
                                task.priority
                              }
                            </span>

                            {overdue && (
                              <span className="rounded-full bg-[var(--color-danger-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-danger)]">
                                Overdue
                              </span>
                            )}
                          </div>

                          <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">
                            {task.description ||
                              "No description yet."}
                          </p>

                          <p className="mt-2 text-xs text-[var(--color-text-subtle)]">
                            {project?.title ||
                              "Project unavailable"}{" "}
                            ·{" "}
                            {
                              task.estimatedHours
                            }
                            h estimated
                          </p>
                        </div>

                        {/* TASK ACTIONS */}

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span
                            className={`font-semibold ${
                              overdue
                                ? "text-[var(--color-danger)]"
                                : "text-[var(--color-text-muted)]"
                            }`}
                          >
                            Due{" "}
                            {formatDate(
                              task.dueDate
                            )}
                          </span>

                          <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
                            <Avatar
                              user={
                                user
                              }
                            />

                            {user?.name ||
                              "Unassigned"}
                          </span>

                          <select
                            value={
                              task.status
                            }
                            onClick={(
                              event
                            ) =>
                              event.stopPropagation()
                            }
                            onChange={(
                              event
                            ) => {
                              event.stopPropagation();

                              changeStatus(
                                task.id,
                                event
                                  .target
                                  .value
                              );
                            }}
                            aria-label={`Change ${task.title} status`}
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text)]"
                          >
                            {taskStatuses.map(
                              (
                                status
                              ) => (
                                <option
                                  key={
                                    status
                                  }
                                  value={
                                    status
                                  }
                                >
                                  {
                                    status
                                  }
                                </option>
                              )
                            )}
                          </select>

                          <FiChevronRight
                            className="text-[var(--color-text-subtle)]"
                            size={18}
                          />
                        </div>
                      </div>
                    </Card>
                  );
                }
              )}
            </section>
          ) : (
            <Card className="py-12 text-center">
              <Quackie
                emotion={
                  counts.active ===
                  0
                    ? "excited"
                    : "curious"
                }
                decorative
                size="md"
              />

              <h2 className="mt-3 font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
                {counts.active ===
                0
                  ? "Everything is complete"
                  : "No tasks match those filters"}
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
                {counts.active ===
                0
                  ? "Enjoy the clear space, then add the next step when you are ready."
                  : "Try adjusting the filters or add a new task."}
              </p>

              <div className="mt-5 flex justify-center gap-2">
                {counts.active !==
                  0 && (
                  <Button
                    variant="secondary"
                    onClick={
                      resetFilters
                    }
                  >
                    <FiFilter
                      size={16}
                    />
                    Reset filters
                  </Button>
                )}

                <Button
                  onClick={() =>
                    openForm(
                      "create"
                    )
                  }
                  disabled={
                    isMetaLoading ||
                    !projects.length
                  }
                >
                  <FiPlus
                    size={16}
                  />

                  {isMetaLoading
                    ? "Loading..."
                    : "Add task"}
                </Button>
              </div>
            </Card>
          ))}

        {/* OVERDUE MESSAGE */}

        {!isLoading &&
          counts.overdue > 0 && (
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-peach-soft)] bg-[color-mix(in_srgb,var(--color-surface)_82%,transparent)] p-4">
              <Quackie
                emotion={
                  mascotEmotion
                }
                decorative
                size="sm"
              />

              <p className="text-sm text-[var(--color-text-muted)]">
                <strong className="text-[var(--color-text)]">
                  A gentle
                  heads-up:
                </strong>{" "}
                {counts.overdue}{" "}
                task
                {counts.overdue ===
                1
                  ? " needs"
                  : "s need"}{" "}
                attention.
                Start with the
                smallest next
                step.
              </p>
            </div>
          )}

        {/* ======================================================
            CREATE / EDIT DIALOG
        ====================================================== */}

        {(dialog ===
          "create" ||
          dialog ===
            "edit") && (
          <Dialog
            title={
              dialog ===
              "create"
                ? "Add task"
                : "Edit task"
            }
            onClose={
              closeDialog
            }
          >
            <form
              onSubmit={
                saveTask
              }
              className="space-y-4"
            >
              {/* TITLE */}

              <Input
                id="task-title"
                label="Task title"
                value={
                  form.title
                }
                onChange={(
                  event
                ) =>
                  setField(
                    "title",
                    event
                      .target
                      .value
                  )
                }
                error={
                  formError
                }
                autoFocus
              />

              {/* DESCRIPTION */}

              <label className="block text-sm font-medium text-[var(--color-text)]">
                Description

                <textarea
                  value={
                    form.description
                  }
                  onChange={(
                    event
                  ) =>
                    setField(
                      "description",
                      event
                        .target
                        .value
                    )
                  }
                  rows={3}
                  className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                />
              </label>

              {/* PROJECT / PRIORITY / STATUS */}

              <div className="grid gap-4 sm:grid-cols-3">

                {/* PROJECT */}

                <SelectField
                  id="task-project"
                  label="Project"
                  value={
                    form.projectId
                  }
                  disabled={
                    isMetaLoading ||
                    !projects.length
                  }
                  onChange={(
                    event
                  ) => {
                    const projectId =
                      event
                        .target
                        .value;

                    const members =
                      projectMembers(
                        projectId
                      );

                    setForm(
                      (
                        current
                      ) => ({
                        ...current,

                        projectId,

                        assignedTo:
                          members[0]
                            ?.id ||
                          "",
                      })
                    );
                  }}
                >
                  <option value="">
                    Select project
                  </option>

                  {projects.map(
                    (
                      project
                    ) => (
                      <option
                        key={
                          project.id
                        }
                        value={
                          project.id
                        }
                      >
                        {
                          project.title
                        }
                      </option>
                    )
                  )}
                </SelectField>

                {/* PRIORITY */}

                <SelectField
                  id="task-priority"
                  label="Priority"
                  value={
                    form.priority
                  }
                  onChange={(
                    event
                  ) =>
                    setField(
                      "priority",
                      event
                        .target
                        .value
                    )
                  }
                >
                  {taskPriorities.map(
                    (item) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {item}
                      </option>
                    )
                  )}
                </SelectField>

                {/* STATUS */}

                <SelectField
                  id="task-status"
                  label="Status"
                  value={
                    form.status
                  }
                  onChange={(
                    event
                  ) =>
                    setField(
                      "status",
                      event
                        .target
                        .value
                    )
                  }
                >
                  {taskStatuses.map(
                    (item) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {item}
                      </option>
                    )
                  )}
                </SelectField>
              </div>

              {/* DATES / HOURS */}

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  id="task-start"
                  label="Start date"
                  type="date"
                  value={
                    form.startDate
                  }
                  onChange={(
                    event
                  ) =>
                    setField(
                      "startDate",
                      event
                        .target
                        .value
                    )
                  }
                />

                <Input
                  id="task-due"
                  label="Due date"
                  type="date"
                  value={
                    form.dueDate
                  }
                  onChange={(
                    event
                  ) =>
                    setField(
                      "dueDate",
                      event
                        .target
                        .value
                    )
                  }
                />

                <Input
                  id="task-hours"
                  label="Estimated hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={
                    form.estimatedHours
                  }
                  onChange={(
                    event
                  ) =>
                    setField(
                      "estimatedHours",
                      event
                        .target
                        .value
                    )
                  }
                />
              </div>

              {/* ASSIGNEE */}

              <SelectField
                id="task-assignee"
                label="Assignee"
                value={
                  form.assignedTo
                }
                disabled={
                  !form.projectId ||
                  !projectMembers(
                    form.projectId
                  ).length
                }
                onChange={(
                  event
                ) =>
                  setField(
                    "assignedTo",
                    event
                      .target
                      .value
                  )
                }
              >
                <option value="">
                  Unassigned
                </option>

                {projectMembers(
                  form.projectId
                ).map(
                  (user) => (
                    <option
                      key={
                        user.id
                      }
                      value={
                        user.id
                      }
                    >
                      {user.name}
                    </option>
                  )
                )}
              </SelectField>

              {/* FORM ACTIONS */}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={
                    closeDialog
                  }
                >
                  Cancel
                </Button>

                <Button type="submit">
                  {dialog ===
                  "create"
                    ? "Create task"
                    : "Save changes"}
                </Button>
              </div>
            </form>
          </Dialog>
        )}

        {/* ======================================================
            TASK DETAILS DIALOG
        ====================================================== */}

        {selectedTask && (
          <Dialog
            title={
              selectedTask.title
            }
            onClose={() =>
              setSelectedTaskId(
                null
              )
            }
            wide
          >
            {/* HEADER */}

            <div className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      statusClasses[
                        selectedTask
                          .status
                      ] ||
                      statusClasses[
                        "To Do"
                      ]
                    }`}
                  >
                    {
                      selectedTask.status
                    }
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      priorityClasses[
                        selectedTask
                          .priority
                      ] ||
                      priorityClasses.Medium
                    }`}
                  >
                    {
                      selectedTask.priority
                    }
                  </span>
                </div>

                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {selectedTask.description ||
                    "No description yet."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    openForm(
                      "edit"
                    )
                  }
                >
                  <FiEdit2
                    size={16}
                  />
                  Edit
                </Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    setDialog(
                      "archive"
                    )
                  }
                  className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  <FiArchive
                    size={16}
                  />
                  Archive
                </Button>
              </div>
            </div>

            {/* DETAILS */}

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                  Project
                </p>

                <p className="mt-1 font-medium text-[var(--color-text)]">
                  {getProject(
                    selectedTask.projectId
                  )?.title ||
                    "Project unavailable"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                  Assignee
                </p>

                <p className="mt-1 flex items-center gap-2 font-medium text-[var(--color-text)]">
                  <Avatar
                    user={getUser(
                      selectedTask.assignedTo
                    )}
                  />

                  {getUser(
                    selectedTask.assignedTo
                  )?.name ||
                    "Unassigned"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                  Estimated effort
                </p>

                <p className="mt-1 font-medium text-[var(--color-text)]">
                  {
                    selectedTask.estimatedHours
                  }{" "}
                  hours
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                  Start date
                </p>

                <p className="mt-1 font-medium text-[var(--color-text)]">
                  {formatDate(
                    selectedTask.startDate
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                  Due date
                </p>

                <p
                  className={`mt-1 font-medium ${
                    isOverdue(
                      selectedTask
                    )
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-text)]"
                  }`}
                >
                  {formatDate(
                    selectedTask.dueDate
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                  Created
                </p>

                <p className="mt-1 font-medium text-[var(--color-text)]">
                  {formatDate(
                    selectedTask.createdAt
                  )}
                </p>
              </div>
            </div>

            {/* STATUS */}

            <div className="mt-6 border-t border-[var(--color-border)] pt-5">
              <label
                htmlFor="detail-status"
                className="text-sm font-semibold text-[var(--color-text)]"
              >
                Change status
              </label>

              <select
                id="detail-status"
                value={
                  selectedTask.status
                }
                onChange={(
                  event
                ) =>
                  changeStatus(
                    selectedTask.id,
                    event
                      .target
                      .value
                  )
                }
                className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
              >
                {taskStatuses.map(
                  (status) => (
                    <option
                      key={
                        status
                      }
                      value={
                        status
                      }
                    >
                      {status}
                    </option>
                  )
                )}
              </select>
            </div>
          </Dialog>
        )}

        {/* ======================================================
            ARCHIVE CONFIRMATION
        ====================================================== */}

        {dialog ===
          "archive" && (
          <Dialog
            title="Archive task"
            onClose={
              closeDialog
            }
          >
            <div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]">
              <FiAlertCircle
                className="mt-0.5 shrink-0 text-[var(--color-danger)]"
                size={19}
              />

              <p>
                Archive{" "}
                <strong>
                  {
                    selectedTask?.title
                  }
                </strong>
                ? It will be
                removed from
                active task
                lists.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={
                  closeDialog
                }
              >
                Cancel
              </Button>

              <Button
                onClick={
                  handleArchiveTask
                }
                className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"
              >
                Archive task
              </Button>
            </div>
          </Dialog>
        )}
      </div>
    </MainLayout>
  );
}

export default Tasks;
