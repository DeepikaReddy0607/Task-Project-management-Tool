import {
  FiAlertCircle,
  FiArrowUpRight,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiPlus,
} from "react-icons/fi";
import { useEffect, useMemo, useState } from "react";

import DashboardTaskRow from "../../components/dashboard/DashboardTaskRow";
import StatCard from "../../components/dashboard/StatCard";
import UpcomingItem from "../../components/dashboard/UpcomingItem";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

import { getMyTasks } from "../../services/api/taskApi";
import { getWorkspaces } from "../../services/api/workspaceApi";
import { getProjects } from "../../services/api/projectApi";
import { getProfile } from "../../services/api/userApi";

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

const normalizeTask = (task) => {
  const assignee = task?.assignee || task?.users || null;

  return {
    id: task?.id,
    title: task?.title || "Untitled task",
    description: task?.description || "",
    priority: task?.priority || "Low",
    status: task?.status || "Backlog",
    startDate: task?.start_date || task?.startDate || null,
    dueDate: task?.due_date || task?.dueDate || null,
    estimatedHours:
      task?.estimated_hours ?? task?.estimatedHours ?? 0,
    projectId:
      task?.project_id ||
      task?.projectId ||
      task?.project?.id ||
      null,
    projectTitle:
      task?.project?.title ||
      task?.project?.name ||
      "No project",
    assignee,
  };
};


const isCompletedStatus = (status) => {
  return String(status || "").toLowerCase() === "completed";
};


const isInProgressStatus = (status) => {
  return String(status || "").toLowerCase() === "in progress";
};


const parseDate = (value) => {
  if (!value) return null;

  const stringValue = String(value);

  const date =
    stringValue.length === 10
      ? new Date(`${stringValue}T00:00:00`)
      : new Date(stringValue);

  return Number.isNaN(date.getTime()) ? null : date;
};


const formatDate = (value) => {
  const date = parseDate(value);

  if (!date) return "No due date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
};


const formatUpcomingDate = (value) => {
  const date = parseDate(value);

  if (!date) return "No due date";

  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();

  if (isToday) {
    return `Today, ${new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  }

  if (isTomorrow) {
    return `Tomorrow, ${new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  }

  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};


const isOverdue = (task) => {
  const dueDate = parseDate(task.dueDate);

  if (!dueDate) return false;

  if (isCompletedStatus(task.status)) return false;

  const today = new Date();

  today.setHours(23, 59, 59, 999);

  return dueDate < today;
};


const getProgress = (task) => {
  if (isCompletedStatus(task.status)) return 100;

  switch (String(task.status || "").toLowerCase()) {
    case "review":
      return 80;

    case "in progress":
      return 50;

    case "to do":
      return 25;

    case "backlog":
      return 0;

    default:
      return 0;
  }
};


const getFirstName = (user) => {
  if (!user) return "there";

  return (
    user.first_name ||
    user.firstName ||
    user.firstname ||
    user.name?.split(" ")?.[0] ||
    user.full_name?.split(" ")?.[0] ||
    user.fullName?.split(" ")?.[0] ||
    "there"
  );
};


// ---------------------------------------------------------
// Dashboard
// ---------------------------------------------------------

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);

  const [isLoading, setIsLoading] = useState(true);

  const [user, setUser] = useState(null);


  // -------------------------------------------------------
  // Load dashboard data
  // -------------------------------------------------------
  useEffect(() => {
  let isMounted = true;

  const loadDashboard = async () => {
    setIsLoading(true);

    // Load current logged-in user
    try {
      const profileResponse = await getProfile();

      if (isMounted) {
        const profile =
          profileResponse?.user ||
          profileResponse?.data?.user ||
          profileResponse?.data ||
          profileResponse;

        setUser(profile || null);
      }
    } catch (error) {
      console.error("Failed to load current user:", error);

      if (isMounted) {
        setUser(null);
      }
    }

    // Load tasks
    try {
      const tasksResponse = await getMyTasks();

      if (isMounted) {
        const taskData =
          tasksResponse?.tasks ||
          tasksResponse?.data?.tasks ||
          tasksResponse?.data ||
          [];

        setTasks(
          Array.isArray(taskData)
            ? taskData.map(normalizeTask)
            : []
        );
      }
    } catch (error) {
      console.error("Failed to load dashboard tasks:", error);

      if (isMounted) {
        setTasks([]);
      }
    }

    // Load workspaces and projects
    try {
      const workspacesResponse = await getWorkspaces();

      if (!isMounted) return;

      const workspaceData =
        workspacesResponse?.workspaces ||
        workspacesResponse?.data?.workspaces ||
        workspacesResponse?.data ||
        [];

      const normalizedWorkspaces = Array.isArray(workspaceData)
        ? workspaceData
        : [];

      setWorkspaces(normalizedWorkspaces);

      if (normalizedWorkspaces.length > 0) {
        const workspaceId = normalizedWorkspaces[0]?.id;

        if (workspaceId) {
          try {
            const projectsResponse =
              await getProjects(workspaceId);

            if (!isMounted) return;

            const projectData =
              projectsResponse?.projects ||
              projectsResponse?.data?.projects ||
              projectsResponse?.data ||
              [];

            setProjects(
              Array.isArray(projectData)
                ? projectData
                : []
            );
          } catch (error) {
            console.error(
              "Failed to load dashboard projects:",
              error
            );

            if (isMounted) {
              setProjects([]);
            }
          }
        }
      }
    } catch (error) {
      console.error(
        "Failed to load dashboard workspaces:",
        error
      );

      if (isMounted) {
        setWorkspaces([]);
        setProjects([]);
      }
    }

    if (isMounted) {
      setIsLoading(false);
    }
  };

  loadDashboard();

  return () => {
    isMounted = false;
  };
}, []);


  // -------------------------------------------------------
  // Statistics
  // -------------------------------------------------------

  const statistics = useMemo(() => {
    const totalTasks = tasks.length;

    const completedTasks = tasks.filter(
      (task) => isCompletedStatus(task.status)
    ).length;

    const inProgressTasks = tasks.filter(
      (task) => isInProgressStatus(task.status)
    ).length;

    const overdueTasks = tasks.filter(
      (task) => isOverdue(task)
    ).length;

    const activeProjects = projects.filter((project) => {
      const status = String(
        project?.status || ""
      ).toLowerCase();

      return (
        status === "active" ||
        status === "planning" ||
        status === "in progress"
      );
    }).length;

    return [
      {
        title: "Total tasks",
        value: String(totalTasks),
        detail:
          activeProjects > 0
            ? `Across ${activeProjects} active ${
                activeProjects === 1
                  ? "project"
                  : "projects"
              }`
            : "No active projects",
        icon: FiClipboard,
        accentClass:
          "bg-[var(--color-surface-sage)] text-[var(--color-brand)]",
      },

      {
        title: "Completed",
        value: String(completedTasks),
        detail:
          totalTasks > 0
            ? `${Math.round(
                (completedTasks / totalTasks) * 100
              )}% of current work`
            : "0% of current work",
        icon: FiCheckCircle,
        accentClass:
          "bg-[var(--color-info-soft)] text-[var(--color-info)]",
      },

      {
        title: "In progress",
        value: String(inProgressTasks),
        detail:
          inProgressTasks > 0
            ? `${inProgressTasks} ${
                inProgressTasks === 1
                  ? "task"
                  : "tasks"
              } currently active`
            : "No tasks in progress",
        icon: FiClock,
        accentClass:
          "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
      },

      {
        title: "Overdue",
        value: String(overdueTasks),
        detail:
          overdueTasks > 0
            ? "Needs your attention"
            : "Nothing overdue",
        icon: FiAlertCircle,
        accentClass:
          "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
      },
    ];
  }, [tasks, projects]);


  // -------------------------------------------------------
  // Focus tasks
  // -------------------------------------------------------

  const focusTasks = useMemo(() => {
    const today = new Date();

    today.setHours(23, 59, 59, 999);

    return tasks
      .filter((task) => !isCompletedStatus(task.status))
      .filter((task) => {
        const dueDate = parseDate(task.dueDate);

        if (!dueDate) return false;

        return dueDate <= today;
      })
      .sort((a, b) => {
        const aDate = parseDate(a.dueDate)?.getTime() || Infinity;
        const bDate = parseDate(b.dueDate)?.getTime() || Infinity;

        return aDate - bDate;
      })
      .slice(0, 3)
      .map((task) => ({
        title: task.title,
        priority: task.priority,
        dueDate: formatDate(task.dueDate),
        status:
          task.status === "Backlog"
            ? "Not started"
            : task.status,
        progress: getProgress(task),
      }));
  }, [tasks]);


  // -------------------------------------------------------
  // Upcoming items
  //
  // We do not have a real calendar-event API connected yet.
  // Therefore upcoming items are derived from task due dates.
  // -------------------------------------------------------

  const upcomingItems = useMemo(() => {
    return tasks
      .filter((task) => !isCompletedStatus(task.status))
      .filter((task) => parseDate(task.dueDate))
      .sort((a, b) => {
        const aDate = parseDate(a.dueDate)?.getTime() || Infinity;
        const bDate = parseDate(b.dueDate)?.getTime() || Infinity;

        return aDate - bDate;
      })
      .slice(0, 3)
      .map((task) => ({
        title: task.title,
        date: formatUpcomingDate(task.dueDate),
      }));
  }, [tasks]);


  // -------------------------------------------------------
  // Weekly progress
  // -------------------------------------------------------

  const weeklyProgress = useMemo(() => {
    const now = new Date();

    const startOfWeek = new Date(now);

    const day = startOfWeek.getDay();

    const difference =
      day === 0 ? 6 : day - 1;

    startOfWeek.setDate(
      startOfWeek.getDate() - difference
    );

    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);

    endOfWeek.setDate(
      startOfWeek.getDate() + 6
    );

    endOfWeek.setHours(
      23,
      59,
      59,
      999
    );


    const completedThisWeek = tasks.filter((task) => {
      if (!isCompletedStatus(task.status)) {
        return false;
      }

      // Prefer updated_at/completed_at if available.
      const completionDate =
        task.completed_at ||
        task.completedAt ||
        task.updated_at ||
        task.updatedAt ||
        null;

      const date = parseDate(completionDate);

      if (!date) return false;

      return (
        date >= startOfWeek &&
        date <= endOfWeek
      );
    }).length;


    const tasksPlannedThisWeek = tasks.filter((task) => {
      const dueDate = parseDate(task.dueDate);

      if (!dueDate) return false;

      return (
        dueDate >= startOfWeek &&
        dueDate <= endOfWeek
      );
    }).length;


    let percentage = 0;

    if (tasksPlannedThisWeek > 0) {
      percentage = Math.min(
        100,
        Math.round(
          (completedThisWeek /
            tasksPlannedThisWeek) *
            100
        )
      );
    }


    return {
      percentage,
      completedThisWeek,
    };
  }, [tasks]);


  // -------------------------------------------------------
  // Current user
  // -------------------------------------------------------

  const userName = getFirstName(user);


  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">

        <PageHeader
          title={`Good morning, ${userName}`}
          description="Here is a clear view of the work that needs your attention today."
          actions={
            <Button>
              <FiPlus
                size={17}
                aria-hidden="true"
              />
              Add task
            </Button>
          }
        />


        {/* -------------------------------------------------
            Task Summary
        -------------------------------------------------- */}

        <section
          aria-label="Task summary"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {statistics.map((statistic) => (
            <StatCard
              key={statistic.title}
              {...statistic}
            />
          ))}
        </section>


        {/* -------------------------------------------------
            Main Dashboard
        -------------------------------------------------- */}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.82fr)]">

          {/* ------------------------------------------------
              Focus Tasks
          ------------------------------------------------- */}

          <Card className="p-5 sm:p-6">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

              <div>
                <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                  Your focus for today
                </h2>

                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Prioritize the work that will move your projects forward.
                </p>
              </div>

              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand)]"
                aria-hidden="true"
              >
                <FiClipboard size={18} />
              </span>

            </div>


            {isLoading ? (
              <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-5 py-10 text-center">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Loading your tasks...
                </p>
              </div>
            ) : focusTasks.length > 0 ? (
              <ul className="mt-6 space-y-3">
                {focusTasks.map((task, index) => (
                  <DashboardTaskRow
                    key={`${task.title}-${index}`}
                    {...task}
                  />
                ))}
              </ul>
            ) : (
              <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-5 py-10 text-center">

                <FiCheckCircle
                  className="mx-auto text-[var(--color-brand)]"
                  size={28}
                  aria-hidden="true"
                />

                <p className="mt-3 font-semibold text-[var(--color-text)]">
                  Nothing is due right now
                </p>

                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Add a task when you are ready to plan the next step.
                </p>

              </div>
            )}


            <Button
              variant="soft"
              className="mt-5 w-full sm:w-auto"
            >
              <FiPlus
                size={17}
                aria-hidden="true"
              />
              Add a task
            </Button>

          </Card>


          {/* ------------------------------------------------
              Right Column
          ------------------------------------------------- */}

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">

            {/* ----------------------------------------------
                Upcoming
            ----------------------------------------------- */}

            <Card className="p-5 sm:p-6">

              <div className="flex items-center justify-between gap-3">

                <div>
                  <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                    Upcoming
                  </h2>

                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Your next planned moments.
                  </p>
                </div>

                <FiCalendar
                  className="text-[var(--color-info)]"
                  size={20}
                  aria-hidden="true"
                />

              </div>


              {upcomingItems.length > 0 ? (
                <ul className="mt-6 divide-y divide-[var(--color-border)]">
                  {upcomingItems.map((item, index) => (
                    <UpcomingItem
                      key={`${item.title}-${index}`}
                      {...item}
                    />
                  ))}
                </ul>
              ) : (
                <div className="mt-6 py-6 text-center">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    No upcoming due dates.
                  </p>
                </div>
              )}


              <Button
                variant="secondary"
                className="mt-6 w-full"
              >
                <FiArrowUpRight
                  size={16}
                  aria-hidden="true"
                />
                View calendar
              </Button>

            </Card>


            {/* ----------------------------------------------
                Weekly Progress
            ----------------------------------------------- */}

            <Card className="p-5 sm:p-6">

              <div className="flex items-start justify-between gap-3">

                <div>
                  <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                    Weekly progress
                  </h2>

                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Your progress for the current week.
                  </p>
                </div>

                <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sage)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-hover)]">
                  {weeklyProgress.percentage > 0
                    ? "On track"
                    : "No progress"}
                </span>

              </div>


              <div className="mt-7 flex items-end justify-between gap-4">

                <div>

                  <p className="font-[var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)]">
                    {weeklyProgress.percentage}%
                  </p>

                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    of your planned work complete
                  </p>

                </div>


                <div
                  className="flex h-20 items-end gap-1.5"
                  aria-label="Weekly completed tasks trend"
                >
                  <span
                    className="h-8 w-2.5 rounded-t-full bg-[var(--color-info-soft)]"
                  />

                  <span
                    className="h-11 w-2.5 rounded-t-full bg-[var(--color-info-soft)]"
                  />

                  <span
                    className="h-14 w-2.5 rounded-t-full bg-[var(--color-brand-soft)]"
                  />

                  <span
                    className="h-20 w-2.5 rounded-t-full bg-[var(--color-brand)]"
                  />
                </div>

              </div>


              <div className="mt-6 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">

                <div
                  className="h-full rounded-full bg-[var(--color-brand)]"
                  style={{
                    width: `${weeklyProgress.percentage}%`,
                  }}
                />

              </div>


              <p className="mt-3 text-sm text-[var(--color-text-muted)]">

                <span className="font-semibold text-[var(--color-text)]">
                  {weeklyProgress.completedThisWeek}{" "}
                  {weeklyProgress.completedThisWeek === 1
                    ? "task"
                    : "tasks"}
                </span>

                {" "}completed this week.

              </p>

            </Card>

          </div>

        </section>

      </div>
    </MainLayout>
  );
}

export default Dashboard;