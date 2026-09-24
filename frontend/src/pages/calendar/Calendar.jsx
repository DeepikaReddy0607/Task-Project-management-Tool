import { useMemo, useState } from "react";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiX,
} from "react-icons/fi";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const eventStyles = {
  "task-start": "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  task: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
  "project-start": "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
  project: "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
};

const eventLabels = {
  "task-start": "Task start",
  task: "Task deadline",
  "project-start": "Project start",
  project: "Project deadline",
};

const toDateKey = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return toDateKey(nextDate);
};

const mockEvents = (() => {
  const today = new Date();
  return [
    {
      id: "calendar-task-start-1",
      sourceId: "task-design-review",
      title: "Prepare design review",
      type: "task-start",
      date: addDays(today, -2),
      status: "In Progress",
      priority: "High",
      projectId: "project-product",
      projectTitle: "Product refresh",
    },
    {
      id: "calendar-task-1",
      sourceId: "task-design-review",
      title: "Design review due",
      type: "task",
      date: addDays(today, 2),
      status: "In Progress",
      priority: "High",
      projectId: "project-product",
      projectTitle: "Product refresh",
    },
    {
      id: "calendar-project-start-1",
      sourceId: "project-onboarding",
      title: "Client onboarding begins",
      type: "project-start",
      date: addDays(today, 5),
      status: "Planning",
      priority: "Medium",
      projectId: "project-onboarding",
      projectTitle: "Client onboarding",
    },
    {
      id: "calendar-task-2",
      sourceId: "task-content-plan",
      title: "Content plan deadline",
      type: "task",
      date: addDays(today, 9),
      status: "To Do",
      priority: "Medium",
      projectId: "project-marketing",
      projectTitle: "Spring campaign",
    },
    {
      id: "calendar-project-1",
      sourceId: "project-product",
      title: "Product refresh milestone",
      type: "project",
      date: addDays(today, 14),
      status: "In Progress",
      priority: "High",
      projectId: "project-product",
      projectTitle: "Product refresh",
    },
  ];
})();

const formatLongDate = (dateKey) =>
  new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateKey + "T00:00:00"));

function CalendarDialog({ event, onClose }) {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(52_67_51/0.22)] p-3 backdrop-blur-sm sm:items-center sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-title"
        className="w-full max-w-lg rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + eventStyles[event.type]}>
              {eventLabels[event.type]}
            </span>
            <h2 id="calendar-event-title" className="mt-3 font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event details"
            className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)]"
          >
            <FiX size={19} />
          </button>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Date</dt>
            <dd className="mt-1 text-sm font-medium text-[var(--color-text)]">{formatLongDate(event.date)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Status</dt>
            <dd className="mt-1 text-sm font-medium text-[var(--color-text)]">{event.status}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Priority</dt>
            <dd className="mt-1 text-sm font-medium text-[var(--color-text)]">{event.priority}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Project</dt>
            <dd className="mt-1 text-sm font-medium text-[var(--color-text)]">{event.projectTitle || "No project"}</dd>
          </div>
        </dl>
        <div className="mt-7 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </section>
    </div>
  );
}

function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [filter, setFilter] = useState("All");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const filteredEvents = mockEvents.filter((event) =>
    filter === "All" ||
    (filter === "Tasks" && (event.type === "task" || event.type === "task-start")) ||
    (filter === "Projects" && (event.type === "project" || event.type === "project-start"))
  );
  const eventsByDate = filteredEvents.reduce((groups, event) => {
    groups[event.date] = [...(groups[event.date] || []), event];
    return groups;
  }, {});

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - leadingDays);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [viewDate]);

  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(viewDate);
  const eventsInVisibleMonth = filteredEvents.filter((event) => {
    const eventDate = new Date(event.date + "T00:00:00");
    return eventDate.getFullYear() === viewDate.getFullYear() &&
      eventDate.getMonth() === viewDate.getMonth();
  });

  const changeMonth = (amount) => {
    setViewDate((current) =>
      new Date(current.getFullYear(), current.getMonth() + amount, 1)
    );
  };

  const isToday = (date) => toDateKey(date) === toDateKey(today);

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Calendar"
          description="A clear view of your tasks and project milestones."
        />

        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
              >
                Today
              </Button>
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-canvas-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                <FiChevronLeft size={19} />
              </button>
              <h2 className="min-w-[11rem] text-center font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]">{monthLabel}</h2>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-canvas-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                <FiChevronRight size={19} />
              </button>
            </div>
            <div className="flex rounded-[var(--radius-md)] bg-[var(--color-canvas-soft)] p-1" aria-label="Calendar event filters">
              {["All", "Tasks", "Projects"].map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={"rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition " + (filter === option ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-xs)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")} aria-pressed={filter === option}>{option}</button>)}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <div className="min-w-[44rem]">
              <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
                {weekdays.map((day) => <div key={day} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">{day}</div>)}
              </div>
              <div className="grid grid-cols-7 border-l border-t border-[var(--color-border)]">
                {calendarDays.map((date) => {
                  const dateKey = toDateKey(date);
                  const dayEvents = eventsByDate[dateKey] || [];
                  const isCurrentMonth = date.getMonth() === viewDate.getMonth();
                  return <div key={dateKey} className={"min-h-32 border-b border-r border-[var(--color-border)] p-2 " + (isCurrentMonth ? "bg-[var(--color-surface)]" : "bg-[var(--color-canvas-soft)]")}>
                    <span className={"inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold " + (isToday(date) ? "bg-[var(--color-brand)] text-white" : isCurrentMonth ? "text-[var(--color-text)]" : "text-[var(--color-text-subtle)]")}>{date.getDate()}</span>
                    <div className="mt-2 space-y-1">{dayEvents.map((event) => <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} className={"block w-full truncate rounded px-2 py-1 text-left text-[0.6875rem] font-semibold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] " + eventStyles[event.type]} aria-label={"Open details for " + event.title}>{event.title}</button>)}</div>
                  </div>;
                })}
              </div>
            </div>
          </div>

          {!eventsInVisibleMonth.length && <div className="mt-6 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-4 py-8 text-center"><FiCalendar className="mx-auto text-[var(--color-brand)]" size={24} /><p className="mt-2 font-semibold text-[var(--color-text)]">No events match this view</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">Try another month or event filter to see your planned work.</p></div>}
        </Card>
      </div>
      <CalendarDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </MainLayout>
  );
}

export default Calendar;
