import { FiArrowRight, FiCircle, FiStar } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Quackie from "../brand/Quackie";
import TaskFlowMark from "../brand/TaskFlowMark";
import Button from "../ui/Button";
import Card from "../ui/Card";

const setupSteps = [
  {
    id: "workspace",
    title: "Create your workspace",
    description: "Your workspace is the home for your projects and team.",
    action: "Set up workspace",
    path: "/workspaces",
  },
  {
    id: "project",
    title: "Create your first project",
    description: "Projects keep related work organized in one place.",
    action: "Create project",
    path: "/projects",
  },
  {
    id: "task",
    title: "Add your first task",
    description: "Turn your project into actionable work.",
    action: "Add task",
    path: "/tasks",
  },
];

function FirstTimeExperience() {
  const navigate = useNavigate();

  const goToDashboard = () => {
    navigate("/", { replace: true });
  };

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-4 py-6 sm:px-6 sm:py-8 lg:flex lg:items-center lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 sm:mb-10">
          <TaskFlowMark />
        </header>

        <Card
          className="taskflow-fade-slide-in overflow-hidden p-0"
          aria-labelledby="onboarding-title"
        >
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] lg:gap-8">
            <section
              className="flex flex-col items-center rounded-[var(--radius-xl)] bg-[var(--color-surface-sage)] px-5 py-7 text-center sm:px-8 lg:items-start lg:text-left"
              aria-labelledby="onboarding-title"
            >
              <Quackie emotion="curious" size="lg" decorative className="mb-4" />
              <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-hover)]">
                <FiStar size={14} aria-hidden="true" />
                First steps
              </span>
              <h1
                id="onboarding-title"
                className="mt-4 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.03em] text-[var(--color-text)]"
              >
                Welcome to TaskFlow!
              </h1>
              <p className="mt-2 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                Let&apos;s get your workspace ready.
              </p>
              <p className="mt-4 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                TaskFlow helps you organize work from workspace to project to task.
              </p>
              <div
                className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-hover)]"
                aria-label="TaskFlow hierarchy"
              >
                <span>Workspace</span>
                <FiArrowRight size={15} aria-hidden="true" />
                <span>Project</span>
                <FiArrowRight size={15} aria-hidden="true" />
                <span>Task</span>
              </div>
              <Button variant="secondary" className="mt-6" onClick={goToDashboard}>
                Skip for now
              </Button>
            </section>

            <section aria-labelledby="setup-guide-title">
              <h2
                id="setup-guide-title"
                className="font-[var(--font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text)]"
              >
                A simple way to get started
              </h2>
              <p className="mt-2 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                Follow these steps whenever you&apos;re ready. They guide you through
                TaskFlow&apos;s core structure without creating anything automatically.
              </p>

              <ol className="mt-6 space-y-3">
                {setupSteps.map((step, index) => (
                  <li
                    key={step.id}
                    className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4 sm:flex-row sm:items-center"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-brand-hover)]"
                      aria-hidden="true"
                    >
                      {index === 0 ? <FiCircle size={16} /> : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-[var(--color-text)]">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">
                        {step.description}
                      </p>
                    </div>
                    <Button
                      variant="soft"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => navigate(step.path)}
                    >
                      {step.action}
                      <FiArrowRight size={15} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ol>

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--color-text-muted)]">
                  You can return to these pages anytime from the workspace navigation.
                </p>
                <Button className="w-full sm:w-auto" onClick={goToDashboard}>
                  Go to Dashboard
                  <FiArrowRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </section>
          </div>
        </Card>
      </div>
    </main>
  );
}

export default FirstTimeExperience;
