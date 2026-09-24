import { useMemo, useState } from "react";
import { FiLayout } from "react-icons/fi";
import KanbanColumn from "../../components/kanban/KanbanColumn";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

const STATUSES = ["Backlog", "To Do", "In Progress", "Review", "Completed"];

const PROJECTS = [
  { id: "all", name: "All projects" },
  { id: "website", name: "Website refresh" },
  { id: "mobile", name: "Mobile workspace" },
  { id: "launch", name: "Product launch" },
];

const INITIAL_TASKS = [
  {
    id: "task-1", projectId: "website", projectName: "Website refresh", status: "Backlog", priority: "Low",
    title: "Collect customer homepage feedback", description: "Review the latest interview notes and group recurring themes.", assignee: "Maya", dueDate: "Sep 30", subtasksCompleted: 1, subtasksTotal: 4,
  },
  {
    id: "task-2", projectId: "website", projectName: "Website refresh", status: "To Do", priority: "High",
    title: "Prepare the component inventory", description: "Document the existing patterns before the design handoff.", assignee: "Aarav", dueDate: "Sep 27", subtasksCompleted: 2, subtasksTotal: 5,
  },
  {
    id: "task-3", projectId: "mobile", projectName: "Mobile workspace", status: "To Do", priority: "Medium",
    title: "Outline offline task behaviour", description: "Capture the key states for working without a network connection.", assignee: "Zoe", dueDate: "Oct 2", subtasksCompleted: 0, subtasksTotal: 3,
  },
  {
    id: "task-4", projectId: "launch", projectName: "Product launch", status: "In Progress", priority: "Critical",
    title: "Finalize launch checklist", description: "Confirm owners and dates across launch communications.", assignee: "Noah", dueDate: "Sep 25", subtasksCompleted: 6, subtasksTotal: 8,
  },
  {
    id: "task-5", projectId: "website", projectName: "Website refresh", status: "In Progress", priority: "Medium",
    title: "Build project overview states", description: "Implement the empty, loading, and populated views.", assignee: "Maya", dueDate: "Sep 29", subtasksCompleted: 3, subtasksTotal: 6,
  },
  {
    id: "task-6", projectId: "mobile", projectName: "Mobile workspace", status: "Review", priority: "High",
    title: "Review notification preferences", description: "Check the mobile copy and final interaction details.", assignee: "Aarav", dueDate: "Sep 26", subtasksCompleted: 4, subtasksTotal: 4,
  },
  {
    id: "task-7", projectId: "launch", projectName: "Product launch", status: "Completed", priority: "Low",
    title: "Share the launch briefing", description: "Send the approved briefing to the project team.", assignee: "Zoe", dueDate: "Sep 20", subtasksCompleted: 2, subtasksTotal: 2,
  },
];

function Kanban() {
  const [projectId, setProjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState(INITIAL_TASKS);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesProject = projectId === "all" || task.projectId === projectId;
      const matchesQuery = !normalizedQuery
        || `${task.title} ${task.description} ${task.assignee}`.toLowerCase().includes(normalizedQuery);
      return matchesProject && matchesQuery;
    });
  }, [projectId, query, tasks]);

  const moveTask = (taskId, status) => {
    setTasks((currentTasks) => currentTasks.map((task) => (
      task.id === taskId ? { ...task, status } : task
    )));
  };

  return (
    <MainLayout>
      <div className="space-y-7">
        <PageHeader
          title="Kanban board"
          description="See your work at a glance and move tasks through each stage of progress."
          actions={<span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-hover)]"><FiLayout size={16} aria-hidden="true" />{visibleTasks.length} visible tasks</span>}
        />

        <Card className="p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.2fr)]">
            <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="kanban-project">
              <span className="mb-2 block">Project</span>
              <select
                id="kanban-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
              >
                {PROJECTS.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <Input
              id="kanban-search"
              label="Search tasks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by task, detail, or assignee"
              type="search"
              autoComplete="off"
            />
          </div>
        </Card>

        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-4" aria-label="Kanban board columns">
            {STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                statuses={STATUSES}
                tasks={visibleTasks.filter((task) => task.status === status)}
                onMoveTask={moveTask}
              />
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default Kanban;
