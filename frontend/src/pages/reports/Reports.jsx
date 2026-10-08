import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCheckCircle,
  FiClock,
  FiRefreshCw,
} from "react-icons/fi";

import StatCard from "../../components/dashboard/StatCard";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";
import { getProjects } from "../../services/api/projectApi";
import { getDashboardReport } from "../../services/api/reportApi";
import { getWorkspaces } from "../../services/api/workspaceApi";

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip);

const emptyDashboard = {
  completion: {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    completionRate: 0,
  },
  pendingOverdue: {
    pendingTasks: 0,
    overdueTasks: 0,
  },
  byPriority: [],
  byStatus: [],
};

const chartColors = ["#789565", "#7599bd", "#edb197", "#eec96d", "#a78bba", "#899382"];

const asNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const chartOptions = (label) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 10,
        usePointStyle: true,
        pointStyle: "circle",
        color: "#687565",
        font: { size: 12 },
      },
    },
    tooltip: {
      callbacks: {
        label: (context) => `${context.label}: ${context.raw} ${label}`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#687565" },
      grid: { display: false },
    },
    y: {
      beginAtZero: true,
      ticks: { color: "#687565", precision: 0 },
      grid: { color: "#e7dece" },
    },
  },
});

function ChartEmptyState({ description, title }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
      <FiBarChart2 className="text-[var(--color-brand)]" size={28} aria-hidden="true" />
      <p className="mt-3 font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function Reports() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [error, setError] = useState("");
  const reportRequestIdRef = useRef(0);

  const loadProjects = useCallback(async () => {
    try {
      setIsLoadingProjects(true);
      const workspaceResponse = await getWorkspaces();
      const workspaces = Array.isArray(workspaceResponse?.workspaces)
        ? workspaceResponse.workspaces
        : [];
      const projectResponses = await Promise.all(
        workspaces.map(async (workspace) => {
          const response = await getProjects(workspace.id);
          return Array.isArray(response?.projects) ? response.projects : [];
        }),
      );
      setProjects(projectResponses.flat());
    } catch (loadError) {
      console.warn("Failed to load report projects:", loadError.message);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const loadDashboard = useCallback(async (projectId = selectedProjectId) => {
    const requestId = ++reportRequestIdRef.current;

    try {
      setIsLoadingReport(true);
      setError("");
      const response = await getDashboardReport(projectId || undefined);

      if (response?.success && requestId === reportRequestIdRef.current) {
        setDashboard({
          completion: response.data?.completion || emptyDashboard.completion,
          pendingOverdue: response.data?.pendingOverdue || emptyDashboard.pendingOverdue,
          byPriority: Array.isArray(response.data?.byPriority) ? response.data.byPriority : [],
          byStatus: Array.isArray(response.data?.byStatus) ? response.data.byStatus : [],
        });
      }
    } catch (loadError) {
      if (requestId === reportRequestIdRef.current) {
        setError(loadError.response?.data?.message || "Unable to load reports right now.");
      }
    } finally {
      if (requestId === reportRequestIdRef.current) {
        setIsLoadingReport(false);
      }
    }
  }, [selectedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const completion = dashboard.completion || emptyDashboard.completion;
  const pendingOverdue = dashboard.pendingOverdue || emptyDashboard.pendingOverdue;
  const completionRate = Math.max(0, Math.min(100, asNumber(completion.completionRate)));
  const completedTasks = asNumber(completion.completedTasks);
  const pendingTasks = asNumber(completion.pendingTasks);
  const priorityData = Array.isArray(dashboard.byPriority)
    ? dashboard.byPriority
    : emptyDashboard.byPriority;
  const statusData = Array.isArray(dashboard.byStatus)
    ? dashboard.byStatus
    : emptyDashboard.byStatus;
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const completionChartData = useMemo(
    () => ({
      labels: ["Completed", "Pending"],
      datasets: [
        {
          data: [completedTasks, pendingTasks],
          backgroundColor: ["#789565", "#e7dece"],
          borderColor: ["#789565", "#e7dece"],
          borderWidth: 1,
        },
      ],
    }),
    [completedTasks, pendingTasks],
  );

  const priorityChartData = useMemo(
    () => ({
      labels: priorityData.map((item) => item.priority),
      datasets: [
        {
          label: "Tasks",
          data: priorityData.map((item) => asNumber(item.count)),
          backgroundColor: priorityData.map((_, index) => chartColors[index % chartColors.length]),
          borderRadius: 8,
          maxBarThickness: 42,
        },
      ],
    }),
    [priorityData],
  );

  const statusChartData = useMemo(
    () => ({
      labels: statusData.map((item) => item.status),
      datasets: [
        {
          data: statusData.map((item) => asNumber(item.count)),
          backgroundColor: statusData.map((_, index) => chartColors[index % chartColors.length]),
          borderColor: "#fffdf8",
          borderWidth: 2,
        },
      ],
    }),
    [statusData],
  );

  const handleProjectChange = (event) => {
    reportRequestIdRef.current += 1;
    setSelectedProjectId(event.target.value);
  };

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Reports & Analytics"
          description="Track task health, completion progress, and workload distribution across your work."
          actions={(
            <Button
              variant="secondary"
              onClick={() => loadDashboard()}
              disabled={isLoadingReport}
              aria-label="Refresh reports and analytics"
            >
              <FiRefreshCw size={16} aria-hidden="true" />
              Refresh
            </Button>
          )}
        />

        <section className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_78%,transparent)] p-4 shadow-[var(--shadow-xs)] sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="report-project" className="block text-sm font-medium text-[var(--color-text)]">
              Project
            </label>
            <select
              id="report-project"
              value={selectedProjectId}
              onChange={handleProjectChange}
              disabled={isLoadingProjects}
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm font-medium text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-72"
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title || "Untitled project"}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {selectedProject ? `Showing analytics for ${selectedProject.title}.` : "Showing analytics for all projects."}
          </p>
        </section>

        {error && (
          <Card className="border-[var(--color-danger)] bg-[var(--color-danger-soft)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <FiAlertTriangle className="mt-0.5 shrink-0 text-[var(--color-danger)]" size={20} aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-[var(--color-text)]">Reports could not be loaded</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{error}</p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => loadDashboard()}>
                Try again
              </Button>
            </div>
          </Card>
        )}

        {isLoadingReport ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading report summary" aria-busy="true">
            {["total", "completed", "pending", "overdue"].map((item) => (
              <Card key={item} className="min-h-36 animate-pulse bg-[var(--color-canvas-soft)]" />
            ))}
          </div>
        ) : !error ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Task summary">
            <StatCard title="Total Tasks" value={asNumber(completion.totalTasks)} detail="Tasks in scope" icon={FiBarChart2} accentClass="bg-[var(--color-info-soft)] text-[var(--color-info)]" />
            <StatCard title="Completed Tasks" value={completedTasks} detail={`${completionRate}% completion rate`} icon={FiCheckCircle} accentClass="bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]" />
            <StatCard title="Pending Tasks" value={asNumber(pendingOverdue.pendingTasks)} detail="Still in progress" icon={FiClock} accentClass="bg-[var(--color-sun-soft)] text-[var(--color-sun)]" />
            <StatCard title="Overdue Tasks" value={asNumber(pendingOverdue.overdueTasks)} detail="Need attention" icon={FiAlertTriangle} accentClass="bg-[var(--color-peach-soft)] text-[var(--color-peach)]" />
          </section>
        ) : null}

        {!isLoadingReport && !error && (
          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">Task completion</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">Completed tasks compared with pending work.</p>
                </div>
                <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--color-brand-hover)]">
                  {completionRate}% complete
                </span>
              </div>
              {completedTasks || pendingTasks ? (
                <div className="mt-6 h-64" aria-label="Completed versus pending task chart">
                  <Doughnut data={completionChartData} options={chartOptions("tasks")} />
                </div>
              ) : (
                <ChartEmptyState title="No task data yet" description="Create tasks to see completion progress here." />
              )}
            </Card>

            <Card>
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">Tasks by priority</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Current task distribution by priority.</p>
              </div>
              {priorityData.length ? (
                <div className="mt-6 h-64" aria-label="Tasks by priority chart">
                  <Bar data={priorityChartData} options={chartOptions("tasks")} />
                </div>
              ) : (
                <ChartEmptyState title="No priority data yet" description="Priority breakdowns will appear when tasks are available." />
              )}
            </Card>

            <Card className="xl:col-span-2">
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">Tasks by status</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">See how work is distributed across its current statuses.</p>
              </div>
              {statusData.length ? (
                <div className="mt-6 h-72" aria-label="Tasks by status chart">
                  <Doughnut data={statusChartData} options={chartOptions("tasks")} />
                </div>
              ) : (
                <ChartEmptyState title="No status data yet" description="Status breakdowns will appear when tasks are available." />
              )}
            </Card>
          </section>
        )}
      </div>
    </MainLayout>
  );
}

export default Reports;
