import { useEffect, useState, useCallback, useRef } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiFilter,
  FiLayers,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiZap,
  FiMaximize2
} from "react-icons/fi";
import { useSocketEvent } from "../../context/SocketContext";
import { getCriticalPath, getBottlenecks } from "../../services/api/intelligenceApi";
import CriticalPathGraph from "./CriticalPathGraph";
import BottleneckRadar from "./BottleneckRadar";

export default function ProjectIntelligence({ projectId, className = "" }) {
  const [criticalPathData, setCriticalPathData] = useState(null);
  const [bottleneckData, setBottleneckData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'critical-path' | 'bottlenecks'
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const debounceTimerRef = useRef(null);

  const loadIntelligence = useCallback(async (isManualRefresh = false) => {
    if (!projectId) return;
    if (isManualRefresh) setIsRefreshing(true);

    try {
      setError(null);
      const [cpRes, bnRes] = await Promise.all([
        getCriticalPath(projectId),
        getBottlenecks(projectId),
      ]);

      // Both endpoints return { success, data }
      setCriticalPathData(cpRes?.data || null);
      setBottleneckData(bnRes?.data || null);
    } catch (err) {
      console.error("Failed to load project intelligence:", err);
      const status = err.response?.status;
      if (status === 403) {
        setError("You do not have permission to view intelligence for this project.");
      } else if (status === 404) {
        setError("Project not found.");
      } else {
        setError(err.response?.data?.message || err.message || "Failed to load project intelligence.");
      }
    } finally {
      setLoading(false);
      if (isManualRefresh) {
        setTimeout(() => setIsRefreshing(false), 300);
      }
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    setSelectedTaskId(null);
    void loadIntelligence();
  }, [loadIntelligence]);

  // Real-time synchronization on task/dependency/project updates with 400ms debounce
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
        void loadIntelligence();
      }, 400);
    }
  }, [projectId, loadIntelligence]);

  useSocketEvent("*", handleRealtimeUpdate);
  useSocketEvent("reconnect", () => void loadIntelligence());

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center ${className}`}>
        <FiRefreshCw className="mx-auto animate-spin text-[var(--color-brand)]" size={32} />
        <h4 className="mt-3 font-[var(--font-display)] text-sm font-semibold text-[var(--color-text)]">
          Computing Project Intelligence...
        </h4>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Running Critical Path Method (CPM) and analyzing dependency bottlenecks.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-8 text-center ${className}`}>
        <FiAlertTriangle className="mx-auto text-rose-500" size={32} />
        <h4 className="mt-2 font-semibold text-sm text-[var(--color-text)]">
          Intelligence Unavailable
        </h4>
        <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={() => void loadIntelligence(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-xs hover:bg-[var(--color-canvas-soft)]"
        >
          <FiRefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} /> Retry Analysis
        </button>
      </div>
    );
  }

  const cpSummary = criticalPathData?.summary || {};
  const bnSummary = bottleneckData?.summary || {};
  const hasCycle = Boolean(criticalPathData?.hasCycle || bottleneckData?.hasCycle);

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Executive KPI Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Critical Path Duration */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Project Duration
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <FiClock size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              {hasCycle ? "—" : `${criticalPathData?.projectDurationDays ?? 0}`}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {hasCycle ? "Cycle detected" : "days critical path"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
            {hasCycle
              ? "Scheduling suspended"
              : cpSummary.multipleCriticalPaths
              ? "Multiple parallel critical paths"
              : "Minimum time to project delivery"}
          </p>
        </div>

        {/* Metric 2: Critical Tasks Count */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Critical Tasks
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <FiZap size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {cpSummary.criticalTasksCount ?? 0}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              of {cpSummary.totalTasks ?? 0} tasks
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
            {cpSummary.criticalTasksCount > 0
              ? "Zero slack — any delay postpones delivery"
              : "No zero-slack bottlenecks"}
          </p>
        </div>

        {/* Metric 3: Active Bottlenecks */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Active Bottlenecks
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <FiAlertTriangle size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-orange-600 dark:text-orange-400">
              {bnSummary.totalBottlenecks ?? 0}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {bnSummary.criticalCount ? `${bnSummary.criticalCount} critical` : "monitored"}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-[var(--color-text-subtle)]" title={bnSummary.primaryBottleneckTitle}>
            {bnSummary.primaryBottleneckTitle
              ? `Top: ${bnSummary.primaryBottleneckTitle}`
              : "Workflows flowing smoothly"}
          </p>
        </div>

        {/* Metric 4: Graph Health */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Graph Topology
            </span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                hasCycle
                  ? "bg-rose-500/10 text-rose-600"
                  : "bg-emerald-500/10 text-emerald-600"
              }`}
            >
              {hasCycle ? <FiAlertTriangle size={15} /> : <FiCheckCircle size={15} />}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-lg font-bold tracking-tight ${
                hasCycle ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {hasCycle ? "Cycle Detected" : "Valid DAG"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
            {hasCycle
              ? "Prerequisite circular dependency"
              : "Strict topological ordering"}
          </p>
        </div>
      </div>

      {/* View Switcher & Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--color-canvas-soft)] p-1 border border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "all"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            All Intelligence
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("critical-path")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "critical-path"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Critical Path Graph
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bottlenecks")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "bottlenecks"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Bottleneck Radar
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedTaskId && (
            <button
              type="button"
              onClick={() => setSelectedTaskId(null)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)]"
            >
              Clear Selection
            </button>
          )}

          <button
            type="button"
            onClick={() => void loadIntelligence(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-2xs hover:bg-[var(--color-canvas-soft)] disabled:opacity-50"
            title="Recalculate project intelligence"
          >
            <FiRefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
            <span>{isRefreshing ? "Analyzing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Main Content Panels */}
      {activeTab === "all" ? (
        <div className="space-y-6">
          {/* Critical Path Section */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                  Critical Path Diagram
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Topological schedule flow identifying the sequence of zero-slack tasks controlling the delivery deadline.
                </p>
              </div>
            </div>
            <CriticalPathGraph
              data={criticalPathData}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          </section>

          {/* Bottleneck Radar Section */}
          <section className="space-y-2 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                  Bottleneck Radar
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Ranked workflow bottlenecks scored by downstream task blockage, critical path membership, overdue delay, and priority.
                </p>
              </div>
            </div>
            <BottleneckRadar
              data={bottleneckData}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          </section>
        </div>
      ) : activeTab === "critical-path" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                Critical Path Diagram
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Topological schedule flow identifying the sequence of zero-slack tasks controlling the delivery deadline.
              </p>
            </div>
          </div>
          <CriticalPathGraph
            data={criticalPathData}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                Bottleneck Radar
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Ranked workflow bottlenecks scored by downstream task blockage, critical path membership, overdue delay, and priority.
              </p>
            </div>
          </div>
          <BottleneckRadar
            data={bottleneckData}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>
      )}
    </div>
  );
}
