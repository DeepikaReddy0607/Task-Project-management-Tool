import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiTrendingUp,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiTarget,
  FiActivity,
  FiRefreshCw,
  FiChevronRight,
  FiLayers
} from "react-icons/fi";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import StatCard from "../../components/dashboard/StatCard";
import Button from "../../components/ui/Button";
import { getProductivity } from "../../services/api/productivityApi";

function Productivity() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getProductivity();
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load productivity metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const summary = data?.summary || {
    totalAssigned: 0,
    completedCount: 0,
    activeCount: 0,
    overdueCount: 0,
    completionRate: 0,
    totalEstimatedHours: 0,
    avgCycleTimeHours: 0,
    avgCycleTimeDays: 0,
    focusIndex: 100
  };

  const priorityBreakdown = data?.priorityBreakdown || {
    Critical: { count: 0, estimatedHours: 0 },
    High: { count: 0, estimatedHours: 0 },
    Medium: { count: 0, estimatedHours: 0 },
    Low: { count: 0, estimatedHours: 0 }
  };

  const velocityTrend = data?.velocityTrend || [];
  const maxVelocity = Math.max(1, ...velocityTrend.map((v) => v.count));

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Productivity & Velocity"
          description="Real-time personal task throughput, completion velocity, cycle time, and workload distribution derived from active project assignments."
          actions={
            <Button
              variant="secondary"
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} size={15} />
              Refresh Metrics
            </Button>
          }
        />

        {error && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {/* TOP SUMMARY CARDS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Focus Index"
            value={`${summary.focusIndex}/100`}
            detail={
              summary.focusIndex >= 80
                ? "Excellent throughput and low overdue ratio"
                : summary.focusIndex >= 50
                ? "Moderate backlog load; check overdue items"
                : "High backlog pressure needing attention"
            }
            icon={FiTarget}
            accentClass="bg-[var(--color-surface-sage)] text-[var(--color-brand)]"
          />

          <StatCard
            title="Completed Tasks"
            value={summary.completedCount}
            detail={`${summary.completionRate}% completion rate of assigned tasks`}
            icon={FiCheckCircle}
            accentClass="bg-[var(--color-surface-sage)] text-[var(--color-brand)]"
          />

          <StatCard
            title="Average Cycle Time"
            value={`${summary.avgCycleTimeDays}d`}
            detail={`${summary.avgCycleTimeHours}h average time from start to completion`}
            icon={FiClock}
            accentClass="bg-[var(--color-info-soft)] text-[var(--color-info)]"
          />

          <StatCard
            title="Active Workload"
            value={summary.activeCount}
            detail={`${summary.totalEstimatedHours}h estimated effort remaining`}
            icon={FiActivity}
            accentClass="bg-[var(--color-peach-soft)] text-[var(--color-peach)]"
          />

          <StatCard
            title="Overdue Attention"
            value={summary.overdueCount}
            detail={
              summary.overdueCount === 0
                ? "All active deadlines are currently on schedule"
                : `${summary.overdueCount} task${summary.overdueCount > 1 ? "s" : ""} past deadline`
            }
            icon={FiAlertTriangle}
            accentClass={
              summary.overdueCount > 0
                ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
            }
          />
        </div>

        {/* 14-DAY VELOCITY TREND */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text)]">
                14-Day Completion Velocity
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Daily task completion throughput over the past two weeks
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-brand)]" />
              Completed tasks
            </div>
          </div>

          <div className="flex h-44 items-end gap-2 pt-6">
            {velocityTrend.map((v) => {
              const heightPct = Math.max(8, Math.round((v.count / maxVelocity) * 100));
              const dayLabel = v.date.slice(5); // MM-DD
              return (
                <div key={v.date} className="flex flex-1 flex-col items-center gap-2 group">
                  <div className="relative flex h-32 w-full items-end justify-center">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full max-w-[28px] rounded-t-sm transition-all duration-300 ${
                        v.count > 0
                          ? "bg-[var(--color-brand)] opacity-90 group-hover:opacity-100"
                          : "bg-[var(--color-surface-muted)] opacity-40"
                      }`}
                    />
                    {v.count > 0 && (
                      <span className="absolute -top-6 rounded bg-[var(--color-canvas-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text)] shadow-sm">
                        {v.count}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--color-text-subtle)] whitespace-nowrap">
                    {dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* WORKLOAD DISTRIBUTION BY PRIORITY */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-[var(--color-text)]">
            Active Workload by Priority
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                prio: "Critical",
                badge: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
                bar: "bg-[var(--color-danger)]",
                ...priorityBreakdown.Critical
              },
              {
                prio: "High",
                badge: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
                bar: "bg-[var(--color-peach)]",
                ...priorityBreakdown.High
              },
              {
                prio: "Medium",
                badge: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
                bar: "bg-[var(--color-info)]",
                ...priorityBreakdown.Medium
              },
              {
                prio: "Low",
                badge: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
                bar: "bg-[var(--color-brand-hover)]",
                ...priorityBreakdown.Low
              }
            ].map((item) => (
              <Card key={item.prio} className="p-5">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.badge}`}>
                    {item.prio} Priority
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {item.estimatedHours}h effort
                  </span>
                </div>
                <p className="mt-3 font-[var(--font-display)] text-2xl font-semibold text-[var(--color-text)]">
                  {item.count}{" "}
                  <span className="text-xs font-normal text-[var(--color-text-muted)]">
                    active task{item.count === 1 ? "" : "s"}
                  </span>
                </p>
                <div className="mt-3 h-1.5 w-full rounded-full bg-[var(--color-surface-muted)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.bar}`}
                    style={{
                      width: summary.activeCount > 0 ? `${(item.count / summary.activeCount) * 100}%` : "0%"
                    }}
                  />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* BOTTOM TWO COLUMNS: OVERDUE ALERTS & RECENT ACHIEVEMENTS */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Overdue Tasks List */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text)]">
                  Overdue Items
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Action required: tasks past their scheduled due dates
                </p>
              </div>
              <Link
                to="/tasks"
                className="flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:underline"
              >
                Go to Tasks <FiChevronRight size={14} />
              </Link>
            </div>

            {(!data?.overdueTasks || data.overdueTasks.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FiCheckCircle className="text-[var(--color-brand)] opacity-60" size={32} />
                <p className="mt-2 text-sm font-medium text-[var(--color-text)]">
                  No overdue tasks!
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  You are completely on schedule with your current task commitments.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {data.overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {t.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-subtle)]">
                        {t.projectTitle} • Due {t.dueDate?.slice(0, 10)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--color-danger-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-danger)]">
                      {t.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent Completions */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text)]">
                  Recent Completions
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Latest milestones completed by your account
                </p>
              </div>
              <Link
                to="/tasks"
                className="flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:underline"
              >
                View all <FiChevronRight size={14} />
              </Link>
            </div>

            {(!data?.recentCompletions || data.recentCompletions.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FiLayers className="text-[var(--color-text-muted)] opacity-60" size={32} />
                <p className="mt-2 text-sm font-medium text-[var(--color-text)]">
                  No completions yet
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Mark active tasks as Complete to build your velocity history.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {data.recentCompletions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {t.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-subtle)]">
                        {t.projectTitle} • Completed {new Date(t.completedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--color-surface-sage)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand)]">
                      Completed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

export default Productivity;
