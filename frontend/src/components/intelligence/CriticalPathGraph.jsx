import { useMemo, useState, useEffect } from "react";
import {
  FiAlertTriangle,
  FiClock,
  FiCheckCircle,
  FiCircle,
  FiPlay,
  FiArrowRight,
  FiLayers,
  FiInfo,
  FiX,
  FiMaximize2,
  FiGitCommit,
  FiShield
} from "react-icons/fi";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const GAP_X = 72;
const GAP_Y = 24;
const PADDING_X = 40;
const PADDING_Y = 40;

const statusIcons = {
  Completed: <FiCheckCircle className="text-emerald-500 shrink-0" size={13} />,
  "In Progress": <FiPlay className="text-blue-500 shrink-0" size={13} />,
  "To Do": <FiCircle className="text-amber-500 shrink-0" size={13} />,
  Planning: <FiClock className="text-slate-400 shrink-0" size={13} />,
};

const priorityBadges = {
  Critical: "bg-rose-500/10 text-rose-600 border-rose-300 dark:border-rose-800",
  High: "bg-orange-500/10 text-orange-600 border-orange-300 dark:border-orange-800",
  Medium: "bg-blue-500/10 text-blue-600 border-blue-300 dark:border-blue-800",
  Low: "bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:border-emerald-800",
};

export default function CriticalPathGraph({
  data,
  selectedTaskId = null,
  onSelectTask = null,
  className = ""
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(selectedTaskId);
  const [activePathFilter, setActivePathFilter] = useState("all"); // 'all' or index 0, 1, ...

  useEffect(() => {
    setInternalSelectedId(selectedTaskId);
  }, [selectedTaskId]);

  const handleSelectNode = (id) => {
    const nextId = internalSelectedId === id ? null : id;
    setInternalSelectedId(nextId);
    if (onSelectTask) {
      onSelectTask(nextId);
    }
  };

  const tasks = data?.tasks || [];
  const hasCycle = Boolean(data?.hasCycle);
  const allCriticalPaths = data?.allCriticalPaths || (data?.criticalPath ? [data.criticalPath] : []);
  const activeCriticalPathIds = useMemo(() => {
    if (activePathFilter === "all") {
      return new Set(data?.criticalPath || []);
    }
    const path = allCriticalPaths[Number(activePathFilter)];
    return new Set(path || []);
  }, [data?.criticalPath, allCriticalPaths, activePathFilter]);

  // Compute topological layout: group tasks into columns (depth levels)
  const { columns, nodePositions, totalWidth, totalHeight, edges } = useMemo(() => {
    if (!tasks || tasks.length === 0 || hasCycle) {
      return { columns: [], nodePositions: new Map(), totalWidth: 800, totalHeight: 360, edges: [] };
    }

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const depthMemo = new Map();

    const getDepth = (id, visited = new Set()) => {
      if (depthMemo.has(id)) return depthMemo.get(id);
      if (visited.has(id)) return 0;
      visited.add(id);

      const task = taskMap.get(id);
      if (!task || !task.predecessors || task.predecessors.length === 0) {
        depthMemo.set(id, 0);
        return 0;
      }

      let maxPredDepth = 0;
      for (const predId of task.predecessors) {
        if (taskMap.has(predId)) {
          maxPredDepth = Math.max(maxPredDepth, getDepth(predId, new Set(visited)) + 1);
        }
      }
      depthMemo.set(id, maxPredDepth);
      return maxPredDepth;
    };

    // Assign every task to a column by its depth
    const colBuckets = [];
    tasks.forEach((task) => {
      const depth = getDepth(task.id);
      if (!colBuckets[depth]) colBuckets[depth] = [];
      colBuckets[depth].push(task);
    });

    // Sort nodes in each column: critical tasks first, then by earlyStart
    colBuckets.forEach((bucket) => {
      bucket.sort((a, b) => {
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
        if (a.earlyStart !== b.earlyStart) return a.earlyStart - b.earlyStart;
        return a.title.localeCompare(b.title);
      });
    });

    const maxRows = Math.max(...colBuckets.map((c) => c.length), 1);
    const computedWidth = Math.max(760, PADDING_X * 2 + colBuckets.length * (NODE_WIDTH + GAP_X) - GAP_X);
    const computedHeight = Math.max(340, PADDING_Y * 2 + maxRows * (NODE_HEIGHT + GAP_Y) - GAP_Y);

    const positions = new Map();
    colBuckets.forEach((bucket, colIdx) => {
      const colRows = bucket.length;
      // Vertically center columns with fewer rows
      const yOffset = ((maxRows - colRows) * (NODE_HEIGHT + GAP_Y)) / 2;

      bucket.forEach((task, rowIdx) => {
        const x = PADDING_X + colIdx * (NODE_WIDTH + GAP_X);
        const y = PADDING_Y + yOffset + rowIdx * (NODE_HEIGHT + GAP_Y);
        positions.set(task.id, { x, y, width: NODE_WIDTH, height: NODE_HEIGHT, col: colIdx, row: rowIdx });
      });
    });

    // Compute directed edges
    const computedEdges = [];
    tasks.forEach((u) => {
      const posU = positions.get(u.id);
      if (!posU || !u.successors) return;

      u.successors.forEach((vId) => {
        const v = taskMap.get(vId);
        const posV = positions.get(vId);
        if (!posV || !v) return;

        const startX = posU.x + NODE_WIDTH;
        const startY = posU.y + NODE_HEIGHT / 2;
        const endX = posV.x;
        const endY = posV.y + NODE_HEIGHT / 2;

        const dx = Math.max(25, (endX - startX) * 0.45);
        const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

        // Check if edge is on an active critical path
        const isCriticalEdge = allCriticalPaths.some((path) => {
          const uIdx = path.indexOf(u.id);
          return uIdx !== -1 && uIdx < path.length - 1 && path[uIdx + 1] === vId;
        }) || (u.isCritical && v.isCritical && u.earlyFinish === v.earlyStart);

        computedEdges.push({
          id: `${u.id}->${vId}`,
          fromId: u.id,
          toId: vId,
          pathD,
          startX,
          startY,
          endX,
          endY,
          isCritical: isCriticalEdge,
        });
      });
    });

    return {
      columns: colBuckets,
      nodePositions: positions,
      totalWidth: computedWidth,
      totalHeight: computedHeight,
      edges: computedEdges,
    };
  }, [tasks, hasCycle, allCriticalPaths]);

  // Selected task inspector info
  const selectedTask = useMemo(() => {
    if (!internalSelectedId) return null;
    return tasks.find((t) => t.id === internalSelectedId) || null;
  }, [internalSelectedId, tasks]);

  // If a circular dependency is detected, render Cycle Warning State
  if (hasCycle) {
    const cycleNodes = data.cycleNodes || [];
    const cycleNodeObjects = cycleNodes
      .map((id) => tasks.find((t) => t.id === id) || { id, title: `Task ${id.slice(0, 6)}` });

    return (
      <div className={`rounded-[var(--radius-xl)] border border-rose-300/60 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-6 ${className}`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <FiAlertTriangle size={22} />
          </span>
          <div className="flex-1">
            <h3 className="font-[var(--font-display)] text-base font-bold text-rose-900 dark:text-rose-200">
              Circular Dependency Detected (Cycle)
            </h3>
            <p className="mt-1 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              {data.cycleMessage ||
                "A circular dependency loop exists in this project's dependency graph. Critical Path calculation is suspended until circular prerequisites are resolved."}
            </p>

            {cycleNodeObjects.length > 0 && (
              <div className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-white/70 dark:bg-rose-950/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Detected Cycle Loop
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {cycleNodeObjects.map((node, i) => (
                    <div key={node.id} className="flex items-center gap-2">
                      <span className="rounded-md bg-rose-100 dark:bg-rose-900/60 px-2 py-1 text-xs font-semibold text-rose-800 dark:text-rose-200">
                        {node.title}
                      </span>
                      <FiArrowRight className="text-rose-400" size={12} />
                    </div>
                  ))}
                  <span className="rounded-md border border-dashed border-rose-400 bg-rose-100/60 dark:bg-rose-900/40 px-2 py-1 text-xs font-semibold text-rose-800 dark:text-rose-200">
                    {cycleNodeObjects[0]?.title} (Loop Closes)
                  </span>
                </div>
              </div>
            )}

            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              💡 <em>Resolution:</em> Go to the Tasks board and remove or invert at least one dependency link within the cycle loop above.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Empty project state
  if (!tasks || tasks.length === 0) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center ${className}`}>
        <FiLayers className="mx-auto text-[var(--color-text-subtle)]" size={32} />
        <h4 className="mt-3 font-[var(--font-display)] text-sm font-semibold text-[var(--color-text)]">
          No Tasks to Graph
        </h4>
        <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--color-text-muted)]">
          Add tasks with dependencies to this project to visualize its Critical Path sequence and calculate duration float.
        </p>
      </div>
    );
  }

  // Check if multiple critical paths exist
  const hasMultipleCriticalPaths = allCriticalPaths.length > 1;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Top Banner: Multiple Critical Paths or Flat Schedule */}
      {hasMultipleCriticalPaths && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <FiGitCommit size={15} />
            <span className="font-semibold">
              Multiple Critical Paths Detected: {allCriticalPaths.length} parallel paths share equal maximum duration ({data.projectDurationDays} days).
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium mr-1">Highlight:</span>
            <button
              type="button"
              onClick={() => setActivePathFilter("all")}
              className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                activePathFilter === "all"
                  ? "bg-amber-600 text-white"
                  : "bg-white/80 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 hover:bg-white"
              }`}
            >
              All ({allCriticalPaths.length})
            </button>
            {allCriticalPaths.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActivePathFilter(String(idx))}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                  activePathFilter === String(idx)
                    ? "bg-amber-600 text-white"
                    : "bg-white/80 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 hover:bg-white"
                }`}
              >
                Path {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-3.5 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 font-medium text-[var(--color-text)]">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs" />
            <span className="font-semibold text-rose-600 dark:text-rose-400">Critical Path Task (0d Slack)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>Non-Critical Task (Float &gt; 0)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <span className="inline-block h-0.5 w-4 bg-rose-500" />
            <span className="text-[11px]">Critical Dependency</span>
          </div>
        </div>
        <div className="text-[11px] text-[var(--color-text-subtle)]">
          Click any task card to inspect schedule metrics & prerequisites
        </div>
      </div>

      {/* Interactive SVG / HTML Canvas Container */}
      <div className="relative overflow-x-auto overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-inner">
        <div
          style={{ width: totalWidth, height: totalHeight }}
          className="relative min-w-full select-none"
        >
          {/* SVG Edge Layer */}
          <svg
            className="absolute inset-0 pointer-events-none z-0"
            width={totalWidth}
            height={totalHeight}
          >
            <defs>
              <marker
                id="arrow-normal"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
              </marker>
              <marker
                id="arrow-critical"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
              </marker>
              <marker
                id="arrow-highlighted"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3b82f6" />
              </marker>
            </defs>

            {/* Render Edges */}
            {edges.map((edge) => {
              const isConnectedToSelected =
                internalSelectedId &&
                (edge.fromId === internalSelectedId || edge.toId === internalSelectedId);

              let stroke = edge.isCritical ? "#ef4444" : "#94a3b8";
              let strokeWidth = edge.isCritical ? 2.5 : 1.5;
              let markerEnd = edge.isCritical ? "url(#arrow-critical)" : "url(#arrow-normal)";

              if (isConnectedToSelected) {
                stroke = "#3b82f6";
                strokeWidth = 3;
                markerEnd = "url(#arrow-highlighted)";
              } else if (internalSelectedId) {
                // Dim unrelated edges
                stroke = edge.isCritical ? "#fca5a5" : "#e2e8f0";
                strokeWidth = 1;
              }

              return (
                <path
                  key={edge.id}
                  d={edge.pathD}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={edge.isCritical ? "none" : undefined}
                  markerEnd={markerEnd}
                  className="transition-all duration-200"
                />
              );
            })}
          </svg>

          {/* HTML Node Cards Layer */}
          {tasks.map((task) => {
            const pos = nodePositions.get(task.id);
            if (!pos) return null;

            const isSelected = internalSelectedId === task.id;
            const isOnActiveCriticalPath = activeCriticalPathIds.has(task.id);
            const isCritical = task.isCritical;
            const isConnected =
              internalSelectedId &&
              selectedTask &&
              (selectedTask.predecessors?.includes(task.id) ||
                selectedTask.successors?.includes(task.id));

            return (
              <div
                key={task.id}
                onClick={() => handleSelectNode(task.id)}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
                className={`group z-10 flex cursor-pointer flex-col justify-between rounded-[var(--radius-lg)] p-2.5 transition-all duration-150 ${
                  isSelected
                    ? "ring-2 ring-[var(--color-brand)] shadow-md bg-[var(--color-surface)]"
                    : isConnected
                    ? "ring-2 ring-blue-400 bg-[var(--color-surface)] shadow-xs"
                    : isCritical
                    ? "border-2 border-rose-400/90 dark:border-rose-600 bg-rose-50/50 dark:bg-rose-950/20 shadow-xs hover:border-rose-500"
                    : "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs hover:border-[var(--color-brand)] hover:shadow-xs"
                } ${
                  internalSelectedId && !isSelected && !isConnected && !isCritical
                    ? "opacity-60"
                    : "opacity-100"
                }`}
              >
                {/* Header row: Status + Badges */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {statusIcons[task.status] || <FiCircle className="text-slate-400" size={12} />}
                    <span className="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
                      {task.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isCritical ? (
                      <span className="rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">
                        CRITICAL
                      </span>
                    ) : (
                      <span className="rounded bg-[var(--color-canvas-soft)] border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-text-muted)]">
                        Slack: {task.totalSlack}d
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h5
                  title={task.title}
                  className="truncate text-xs font-semibold text-[var(--color-text)] group-hover:text-[var(--color-brand)]"
                >
                  {task.title}
                </h5>

                {/* Footer metrics */}
                <div className="flex items-center justify-between border-t border-[var(--color-border)]/50 pt-1 text-[10px] text-[var(--color-text-subtle)]">
                  <span className="font-mono">
                    Day {task.earlyStart} → {task.earlyFinish}
                  </span>
                  <span className="font-semibold text-[var(--color-text-muted)]">
                    {task.durationDays}d duration
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Schedule Inspector (Expands when a task is selected) */}
      {selectedTask && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                  {selectedTask.title}
                </h4>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityBadges[selectedTask.priority] || ""}`}>
                  {selectedTask.priority}
                </span>
                {selectedTask.isCritical ? (
                  <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    ⚡ Critical Path Task
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                    Non-Critical (Float: {selectedTask.totalSlack}d)
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {selectedTask.isCritical
                  ? "Zero total float. Any delay on this task will postpone the overall project completion date."
                  : `This task can be delayed by up to ${selectedTask.totalSlack} days without pushing the project deadline.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectNode(selectedTask.id)}
              className="rounded-lg p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
              title="Close inspector"
            >
              <FiX size={16} />
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Duration
              </span>
              <p className="mt-0.5 font-bold text-[var(--color-text)]">
                {selectedTask.durationDays} Day{selectedTask.durationDays > 1 ? "s" : ""}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Earliest Schedule
              </span>
              <p className="mt-0.5 font-mono text-[var(--color-text)]">
                Start: Day {selectedTask.earlyStart} · Finish: Day {selectedTask.earlyFinish}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Latest Schedule
              </span>
              <p className="mt-0.5 font-mono text-[var(--color-text)]">
                Start: Day {selectedTask.lateStart} · Finish: Day {selectedTask.lateFinish}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Total Float / Slack
              </span>
              <p className={`mt-0.5 font-bold ${selectedTask.totalSlack === 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {selectedTask.totalSlack} Day{selectedTask.totalSlack !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Connected Dependencies Links */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs border-t border-[var(--color-border)] pt-3">
            <div>
              <span className="font-semibold text-[var(--color-text-muted)]">
                Prerequisites (Must finish before):
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selectedTask.predecessors && selectedTask.predecessors.length > 0 ? (
                  selectedTask.predecessors.map((pId) => {
                    const pTask = tasks.find((t) => t.id === pId);
                    return (
                      <button
                        key={pId}
                        type="button"
                        onClick={() => handleSelectNode(pId)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                      >
                        {pTask?.isCritical && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                        {pTask?.title || pId.slice(0, 6)}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-xs text-[var(--color-text-subtle)]">No prerequisites (Entry task)</span>
                )}
              </div>
            </div>

            <div>
              <span className="font-semibold text-[var(--color-text-muted)]">
                Downstream Dependents (Waiting on this):
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selectedTask.successors && selectedTask.successors.length > 0 ? (
                  selectedTask.successors.map((sId) => {
                    const sTask = tasks.find((t) => t.id === sId);
                    return (
                      <button
                        key={sId}
                        type="button"
                        onClick={() => handleSelectNode(sId)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                      >
                        {sTask?.isCritical && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                        {sTask?.title || sId.slice(0, 6)}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-xs text-[var(--color-text-subtle)]">No successors (Terminal task)</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
