import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useSocketEvent } from "../../context/SocketContext";
import { getProjectXRay } from "../../services/api/projectApi";
import { TbCrystalBall } from "react-icons/tb";
import {
    FiActivity,
    FiAlertTriangle,
    FiCheckCircle,
    FiClock,
    FiLayers,
    FiArrowDown,
    FiUsers,
    FiTarget,
    FiRefreshCw,
    FiShield,
    FiCheck
} from "react-icons/fi";

// Risk badge styling
const riskBadges = {
    LOW: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)] border-[color-mix(in_srgb,var(--color-brand)_25%,transparent)]",
    MEDIUM: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_25%,transparent)]",
    HIGH: "bg-[var(--color-peach-soft)] text-[var(--color-peach)] border-[color-mix(in_srgb,var(--color-peach)_25%,transparent)]",
    CRITICAL: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_25%,transparent)]"
};

const deadlineBadges = {
    NO_DEADLINE: "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
    NORMAL: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
    WITHIN_7_DAYS: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
    WITHIN_3_DAYS: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
    TODAY: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-bold",
    OVERDUE: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-bold animate-pulse"
};

const priorityBadges = {
    Low: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
    Medium: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
    High: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]",
    Critical: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
};

export default function ProjectXRay({ projectId, className = "" }) {
    const [xray, setXray] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const debounceTimerRef = useRef(null);

    const loadXRay = useCallback(async (isManualRefresh = false) => {
        if (!projectId) return;
        if (isManualRefresh) setIsRefreshing(true);
        try {
            setError(null);
            const response = await getProjectXRay(projectId);
            setXray(response.xray);
        } catch (err) {
            console.error("Failed to load Project X-Ray:", err);
            setError(err.response?.data?.message || err.message || "Failed to load Project X-Ray diagnostic.");
        } finally {
            setLoading(false);
            if (isManualRefresh) {
                setTimeout(() => setIsRefreshing(false), 300);
            }
        }
    }, [projectId]);

    useEffect(() => {
        setLoading(true);
        void loadXRay();
    }, [loadXRay]);

    // Real-time synchronization via existing Socket.IO with 400ms debounce
    const handleRealtimeUpdate = useCallback((event) => {
        if (!event?.type) return;
        const matchesProject =
            !event.projectId ||
            event.projectId === projectId ||
            event.data?.project_id === projectId ||
            event.data?.projectId === projectId ||
            event.data?.id === projectId;

        if (matchesProject) {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                void loadXRay();
            }, 400);
        }
    }, [projectId, loadXRay]);

    useSocketEvent("*", handleRealtimeUpdate);
    useSocketEvent("reconnect", () => void loadXRay());

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    if (loading) {
        return (
            <div className={`rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center ${className}`}>
                <FiRefreshCw className="mx-auto animate-spin text-[var(--color-brand)]" size={28} />
                <p className="mt-3 text-sm font-medium text-[var(--color-text-muted)]">Scanning project diagnostic data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`rounded-[var(--radius-xl)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-6 text-center ${className}`}>
                <FiAlertTriangle className="mx-auto text-[var(--color-danger)]" size={28} />
                <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">Diagnostic unavailable</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{error}</p>
                <button
                    onClick={() => void loadXRay(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-sm hover:bg-[var(--color-canvas-soft)]"
                >
                    <FiRefreshCw size={13} /> Retry
                </button>
            </div>
        );
    }

    if (!xray) return null;

    const { project, health, tasks, deadline, dependencies, workload, risks, focus, recommendations } = xray;

    return (
        <div className={`space-y-6 text-[var(--color-text)] ${className}`}>
            {/* 1. Header Banner & Health Overview */}
            <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)]">
                        <FiActivity size={20} />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-[var(--font-display)] text-base font-bold tracking-tight text-[var(--color-text)]">
                                Project X-Ray Diagnostic
                            </h3>
                            <span className="rounded-full bg-[var(--color-brand-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-hover)]">
                                Live Data
                            </span>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            {health.summary}
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0">
                    <Link
                        to={`/what-if?projectId=${projectId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)] bg-[var(--color-brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-hover)] transition hover:bg-[var(--color-surface-sage)] active:scale-95"
                        title="Simulate Project in What-If"
                    >
                        <TbCrystalBall size={15} />
                        <span>Simulate in What-If</span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => void loadXRay(true)}
                        disabled={isRefreshing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:bg-[var(--color-canvas-soft)] active:scale-95"
                        title="Refresh Diagnostic"
                    >
                        <FiRefreshCw size={13} className={isRefreshing ? "animate-spin text-[var(--color-brand)]" : ""} />
                        <span>{isRefreshing ? "Updating..." : "Refresh"}</span>
                    </button>
                </div>
            </div>

            {/* 2. Top Metric Diagnostic Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Health & Risk */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-subtle)] font-medium">
                        <span>PROJECT HEALTH</span>
                        <FiShield size={14} className="text-[var(--color-text-subtle)]" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${riskBadges[health.riskLevel] || riskBadges.LOW}`}>
                            {health.riskLevel} RISK
                        </span>
                        <span className="text-xl font-bold font-[var(--font-display)] text-[var(--color-text)]">
                            {health.riskScore}<span className="text-xs font-normal text-[var(--color-text-subtle)]">/100</span>
                        </span>
                    </div>
                    {/* Score Bar */}
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                health.riskScore >= 85 ? "bg-[var(--color-danger)]" :
                                health.riskScore >= 60 ? "bg-[var(--color-peach)]" :
                                health.riskScore >= 30 ? "bg-[var(--color-info)]" : "bg-[var(--color-brand)]"
                            }`}
                            style={{ width: `${Math.max(5, health.riskScore)}%` }}
                        />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--color-text-muted)] line-clamp-1">
                        {health.riskScore === 0 ? "Minimal warning signals" : `${health.riskScore}% risk load`}
                    </p>
                </div>

                {/* Completion */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-subtle)] font-medium">
                        <span>COMPLETION</span>
                        <FiCheckCircle size={14} className="text-[var(--color-text-subtle)]" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-[var(--font-display)] text-[var(--color-text)]">
                            {health.completionPercentage}%
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">
                            {tasks.completed}/{tasks.total} done
                        </span>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                        <div
                            className="h-full rounded-full bg-[var(--color-brand)] transition-all duration-500"
                            style={{ width: `${health.completionPercentage}%` }}
                        />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                        {tasks.active} active task{tasks.active === 1 ? "" : "s"} remaining
                    </p>
                </div>

                {/* Deadline Pressure */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-subtle)] font-medium">
                        <span>DEADLINE</span>
                        <FiClock size={14} className="text-[var(--color-text-subtle)]" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-lg font-bold font-[var(--font-display)] text-[var(--color-text)]">
                            {deadline.hasDeadline ? (
                                deadline.daysRemaining < 0
                                    ? `${Math.abs(deadline.daysRemaining)}d passed`
                                    : deadline.daysRemaining === 0
                                    ? "Due Today"
                                    : `${deadline.daysRemaining} days left`
                            ) : "No deadline"}
                        </span>
                    </div>
                    <div className="mt-2.5">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${deadlineBadges[deadline.pressure] || deadlineBadges.NORMAL}`}>
                            {deadline.pressure.replace(/_/g, " ")}
                        </span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--color-text-muted)] line-clamp-1" title={deadline.description}>
                        {deadline.description}
                    </p>
                </div>

                {/* Tasks Overview */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-subtle)] font-medium">
                        <span>TASKS BREAKDOWN</span>
                        <FiLayers size={14} className="text-[var(--color-text-subtle)]" />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                        <div className="rounded bg-[var(--color-canvas-soft)] py-1">
                            <span className="block text-base font-bold text-[var(--color-text)]">{tasks.active}</span>
                            <span className="text-[10px] text-[var(--color-text-subtle)]">Active</span>
                        </div>
                        <div className={`rounded py-1 ${tasks.overdue > 0 ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "bg-[var(--color-canvas-soft)] text-[var(--color-text)]"}`}>
                            <span className="block text-base font-bold">{tasks.overdue}</span>
                            <span className="text-[10px] font-medium">Overdue</span>
                        </div>
                        <div className={`rounded py-1 ${tasks.highPriorityIncomplete > 0 ? "bg-[var(--color-peach-soft)] text-[var(--color-peach)]" : "bg-[var(--color-canvas-soft)] text-[var(--color-text)]"}`}>
                            <span className="block text-base font-bold">{tasks.highPriorityIncomplete}</span>
                            <span className="text-[10px] font-medium">High Prio</span>
                        </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--color-text-muted)] text-center">
                        {tasks.inProgress} in progress · {tasks.todo} to do · {tasks.backlog} backlog
                    </p>
                </div>
            </div>

            {/* 3. Risk Signals & Primary Concern */}
            {risks.signals && risks.signals.length > 0 && (
                <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-peach-soft)] text-[var(--color-peach)]">
                                <FiAlertTriangle size={15} />
                            </span>
                            <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                                Warning Signals ({risks.signals.length})
                            </h4>
                        </div>
                        {risks.primaryRisk && (
                            <span className="text-xs text-[var(--color-peach)] font-semibold hidden sm:inline-block">
                                Primary: {risks.primaryRisk}
                            </span>
                        )}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {risks.signals.map((sig, i) => (
                            <div
                                key={i}
                                className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5 text-xs text-[var(--color-text)]"
                            >
                                <span className={`mt-0.5 shrink-0 rounded-full h-2 w-2 ${
                                    sig.severity === "high" || sig.severity === "critical" ? "bg-[var(--color-danger)]" :
                                    sig.severity === "medium" ? "bg-[var(--color-peach)]" : "bg-[var(--color-info)]"
                                }`} />
                                <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-[var(--color-text)]">{sig.message}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {risks.primaryRisk && (
                        <div className="mt-3 rounded-lg border border-[var(--color-peach)]/30 bg-[var(--color-peach-soft)]/40 p-2.5 text-xs sm:hidden">
                            <span className="font-bold text-[var(--color-peach)]">Primary Concern: </span>
                            <span className="text-[var(--color-text)]">{risks.primaryRisk}</span>
                        </div>
                    )}
                </div>
            )}

            {/* 4. Active Blockers & Dependencies Flow */}
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-xs)]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-info-soft)] text-[var(--color-info)]">
                            <FiArrowDown size={15} />
                        </span>
                        <div>
                            <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                                Dependency Intelligence
                            </h4>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                {dependencies.activeBlockers} active blocker{dependencies.activeBlockers === 1 ? "" : "s"} affecting {dependencies.blockedTasks} downstream task{dependencies.blockedTasks === 1 ? "" : "s"}
                            </p>
                        </div>
                    </div>
                </div>

                {dependencies.topBlockers && dependencies.topBlockers.length > 0 ? (
                    <div className="mt-4 space-y-3">
                        {dependencies.topBlockers.map((b) => (
                            <div key={b.task.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-[var(--color-text)]">{b.task.title}</span>
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${priorityBadges[b.task.priority] || priorityBadges.Medium}`}>
                                            {b.task.priority}
                                        </span>
                                        {b.task.isOverdue && (
                                            <span className="rounded bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-danger)]">
                                                OVERDUE
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-[var(--color-text-muted)] font-medium">
                                        Blocks {b.blockedCount} task{b.blockedCount === 1 ? "" : "s"}
                                    </span>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
                                    <FiArrowDown size={13} className="text-[var(--color-peach)] shrink-0" />
                                    <span className="text-[var(--color-text-muted)] font-medium">Directly blocks:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {b.blockedTasks.map((bt) => (
                                            <span key={bt.id} className="rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text)] border border-[var(--color-border)]">
                                                {bt.title}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-xs text-[var(--color-text-muted)]">
                        <FiCheck className="text-[var(--color-brand)]" size={16} />
                        <span>No active blocking dependencies detected. Downstream work is unblocked.</span>
                    </div>
                )}
            </div>

            {/* 5. Team Workload & Recommended Focus (Two Columns) */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Team Workload */}
                <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
                                <FiUsers size={15} />
                            </span>
                            <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                                Team Workload
                            </h4>
                        </div>
                        {workload.unassignedTasks > 0 && (
                            <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                                {workload.unassignedTasks} unassigned
                            </span>
                        )}
                    </div>

                    <div className="mt-4 divide-y divide-[var(--color-border)]">
                        {workload.members && workload.members.length > 0 ? (
                            workload.members.map((m) => (
                                <div key={m.userId} className="py-2.5 first:pt-0 last:pb-0">
                                    <div className="flex items-center justify-between text-xs font-semibold">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[var(--color-text)] truncate max-w-[140px] sm:max-w-[200px]">{m.name}</span>
                                            <span className="text-[10px] text-[var(--color-text-subtle)] font-normal">({m.role})</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[var(--color-text)]">{m.activeTasks} active</span>
                                            {m.overdueTasks > 0 && (
                                                <span className="text-[var(--color-danger)] font-bold">
                                                    ({m.overdueTasks} overdue)
                                                </span>
                                            )}
                                            <span className="text-[var(--color-text-subtle)] font-mono text-[11px] w-8 text-right">
                                                {m.workloadPercentage}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${
                                                m.workloadPercentage >= 60 ? "bg-[var(--color-peach)]" : "bg-[var(--color-brand)]"
                                            }`}
                                            style={{ width: `${m.workloadPercentage}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="py-4 text-center text-xs text-[var(--color-text-muted)]">
                                No assigned members yet.
                            </p>
                        )}
                    </div>
                </div>

                {/* Recommended Focus */}
                <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-xs)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)]">
                                <FiTarget size={15} />
                            </span>
                            <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                                Recommended Focus
                            </h4>
                        </div>
                    </div>

                    <div className="mt-4 space-y-2.5">
                        {focus.recommendedTasks && focus.recommendedTasks.length > 0 ? (
                            focus.recommendedTasks.map((t, idx) => (
                                <div key={t.id} className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-xs font-bold text-[var(--color-brand-hover)] shadow-xs">
                                        {idx + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold text-xs text-[var(--color-text)]">{t.title}</span>
                                            <span className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${priorityBadges[t.priority] || priorityBadges.Medium}`}>
                                                {t.priority}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                                            {t.focusReasons && t.focusReasons.length > 0
                                                ? t.focusReasons.slice(0, 2).join(" · ")
                                                : t.dueDateFormatted ? `Due ${t.dueDateFormatted}` : "Active milestone"}
                                            {t.estimatedHours ? ` · ~${t.estimatedHours}h` : ""}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="py-4 text-center text-xs text-[var(--color-text-muted)]">
                                {focus.message || "Project has no active tasks requiring attention."}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* 6. Actionable Recommendations */}
            {recommendations && recommendations.length > 0 && (
                <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-5 shadow-[var(--shadow-xs)]">
                    <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                        Actionable Recommendations
                    </h4>
                    <ul className="mt-3 space-y-2 text-xs text-[var(--color-text)]">
                        {recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <FiCheckCircle className="mt-0.5 shrink-0 text-[var(--color-brand)]" size={14} />
                                <span className="font-medium text-[var(--color-text)]">{rec}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
