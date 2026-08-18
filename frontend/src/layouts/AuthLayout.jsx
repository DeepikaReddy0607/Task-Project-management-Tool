import clsx from "clsx";
import Card from "../components/ui/Card";
import TaskFlowMark from "../components/brand/TaskFlowMark";

function AuthLayout({ children, className, description, footer, title, visual }) {
  return (
    <main
      className={clsx(
        "relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:flex lg:items-stretch lg:p-8",
        className,
      )}
    >
      <div className="relative mx-auto grid w-full max-w-7xl overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] shadow-[var(--shadow-lg)] lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative flex min-h-72 overflow-hidden bg-[var(--color-surface-sage)] p-6 sm:p-9 lg:min-h-[42rem] lg:p-12">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -left-16 -top-16 h-52 w-52 rounded-full bg-[var(--color-sun-soft)]" />
            <div className="absolute right-[-4rem] top-1/3 h-64 w-64 rounded-full bg-[var(--color-info-soft)] opacity-75" />
            <div className="absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full bg-[var(--color-peach-soft)] opacity-90" />
          </div>

          <div className="relative flex w-full flex-col justify-between gap-8">
            <TaskFlowMark />

            <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center py-2 lg:py-8">
              {visual}
            </div>

            <div className="max-w-sm">
              <p className="font-[var(--font-display)] text-2xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.03em] text-[var(--color-text)] sm:text-3xl">
                A calmer way to move work forward.
              </p>
              <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                Bring plans, people, and progress together in one considered workspace.
              </p>
            </div>
          </div>
        </aside>

        <section className="flex items-center bg-[var(--color-canvas-soft)] p-4 sm:p-8 lg:p-12" aria-labelledby="auth-title">
          <div className="taskflow-page-enter mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <TaskFlowMark />
            </div>

            <Card className="p-6 sm:p-8" aria-label="Authentication form">
              <header>
                <h1
                  id="auth-title"
                  className="font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.03em] text-[var(--color-text)]"
                >
                  {title}
                </h1>
                {description && (
                  <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                    {description}
                  </p>
                )}
              </header>

              <div className="mt-7">{children}</div>

              {footer && <footer className="mt-7 border-t border-[var(--color-border)] pt-5">{footer}</footer>}
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

export default AuthLayout;
