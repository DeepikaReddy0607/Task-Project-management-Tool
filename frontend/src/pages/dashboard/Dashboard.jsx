import { FiAlertCircle, FiArrowUpRight, FiCalendar, FiCheckCircle, FiClipboard, FiClock, FiPlus } from "react-icons/fi";
import DashboardTaskRow from "../../components/dashboard/DashboardTaskRow";
import StatCard from "../../components/dashboard/StatCard";
import UpcomingItem from "../../components/dashboard/UpcomingItem";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

// Static presentation data. Replace these values with the backend response once its contract is available.
const statistics = [
  { title: "Total tasks", value: "16", detail: "Across 3 active projects", icon: FiClipboard, accentClass: "bg-[var(--color-surface-sage)] text-[var(--color-brand)]" },
  { title: "Completed", value: "8", detail: "50% of current work", icon: FiCheckCircle, accentClass: "bg-[var(--color-info-soft)] text-[var(--color-info)]" },
  { title: "In progress", value: "5", detail: "2 due this week", icon: FiClock, accentClass: "bg-[var(--color-sun-soft)] text-[var(--color-sun)]" },
  { title: "Overdue", value: "3", detail: "Needs your attention", icon: FiAlertCircle, accentClass: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" },
];

const focusTasks = [
  { title: "Review project requirements", priority: "High", dueDate: "Today", status: "In progress", progress: 72 },
  { title: "Prepare sprint review notes", priority: "Medium", dueDate: "Tomorrow", status: "In progress", progress: 46 },
  { title: "Organize design handoff", priority: "Low", dueDate: "Friday", status: "Not started", progress: 18 },
];

const upcomingItems = [
  { title: "Team stand-up", date: "Today, 10:00 AM" },
  { title: "Sprint review", date: "Tomorrow, 2:00 PM" },
  { title: "Project planning", date: "Friday, 11:00 AM" },
];

function Dashboard() {
  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader title="Good morning, Geethika" description="Here is a clear view of the work that needs your attention today." actions={<Button><FiPlus size={17} aria-hidden="true" /> Add task</Button>} />

        <section aria-label="Task summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statistics.map((statistic) => <StatCard key={statistic.title} {...statistic} />)}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.82fr)]">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">Your focus for today</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Prioritize the work that will move your projects forward.</p></div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand)]" aria-hidden="true"><FiClipboard size={18} /></span>
            </div>
            {focusTasks.length > 0 ? (
              <ul className="mt-6 space-y-3">{focusTasks.map((task) => <DashboardTaskRow key={task.title} {...task} />)}</ul>
            ) : (
              <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-5 py-10 text-center"><FiCheckCircle className="mx-auto text-[var(--color-brand)]" size={28} aria-hidden="true" /><p className="mt-3 font-semibold text-[var(--color-text)]">Nothing is due right now</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">Add a task when you are ready to plan the next step.</p></div>
            )}
            <Button variant="soft" className="mt-5 w-full sm:w-auto"><FiPlus size={17} aria-hidden="true" /> Add a task</Button>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">Upcoming</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Your next planned moments.</p></div><FiCalendar className="text-[var(--color-info)]" size={20} aria-hidden="true" /></div><ul className="mt-6 divide-y divide-[var(--color-border)]">{upcomingItems.map((item) => <UpcomingItem key={item.title} {...item} />)}</ul><Button variant="secondary" className="mt-6 w-full"><FiArrowUpRight size={16} aria-hidden="true" /> View calendar</Button></Card>
            <Card className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">Weekly progress</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">A steady, focused week so far.</p></div><span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sage)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-hover)]">On track</span></div><div className="mt-7 flex items-end justify-between gap-4"><div><p className="font-[var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)]">68%</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">of your planned work complete</p></div><div className="flex h-20 items-end gap-1.5" aria-label="Weekly completed tasks trend"><span className="h-8 w-2.5 rounded-t-full bg-[var(--color-info-soft)]" /><span className="h-11 w-2.5 rounded-t-full bg-[var(--color-info-soft)]" /><span className="h-14 w-2.5 rounded-t-full bg-[var(--color-brand-soft)]" /><span className="h-20 w-2.5 rounded-t-full bg-[var(--color-brand)]" /></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"><div className="h-full w-[68%] rounded-full bg-[var(--color-brand)]" /></div><p className="mt-3 text-sm text-[var(--color-text-muted)]"><span className="font-semibold text-[var(--color-text)]">8 tasks</span> completed this week.</p></Card>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}

export default Dashboard;
