import React, { useState } from "react";

/**
 * ShockwaveGraph - Visualizes downstream dependency disruption propagation DAG using native SVG.
 * 
 * Invariants:
 * - Pure SVG rendering (zero third-party graph dependencies)
 * - Level-by-level horizontal or layered layout
 * - Interactive node inspection (click to inspect, hover)
 * - Path highlighting
 */
export default function ShockwaveGraph({
  shockwaveData,
  onSelectTask,
  className = ""
}) {
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [highlightedPathIndex, setHighlightedPathIndex] = useState(null);

  if (!shockwaveData) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
        Run shockwave analysis to generate the dependency propagation graph.
      </div>
    );
  }

  const { shock, propagation, criticalPath, bottlenecks } = shockwaveData;
  const sourceId = shock?.sourceTaskId;
  const affectedTasks = propagation?.affectedTasks || [];
  const rawPaths = propagation?.rawPaths || [];

  // 1. Build layout layers by propagation depth
  // Depth 0: source task
  // Depth 1..N: affected tasks
  const layers = {};
  layers[0] = [
    {
      taskId: sourceId || "source",
      title: shock?.sourceTaskTitle || "Source Component",
      depth: 0,
      relation: "SOURCE",
      isSource: true,
      isCritical: criticalPath?.isSourceCritical || false,
      isBottleneck: bottlenecks?.isSourceBottleneck || false
    }
  ];

  affectedTasks.forEach((t) => {
    const d = t.depth || 1;
    if (!layers[d]) layers[d] = [];
    layers[d].push({
      ...t,
      isCritical: t.criticalAfter,
      isBottleneck: (bottlenecks?.newlyCreatedBottlenecks || []).some((b) => b.taskId === t.taskId)
    });
  });

  const depthKeys = Object.keys(layers).map(Number).sort((a, b) => a - b);
  const maxNodesInLayer = Math.max(...Object.values(layers).map((l) => l.length), 1);

  // Dynamic SVG dimensions
  const layerWidth = 240;
  const nodeHeight = 80;
  const nodeWidth = 190;
  const paddingX = 60;
  const paddingY = 60;

  const totalWidth = Math.max(700, depthKeys.length * layerWidth + paddingX * 2);
  const totalHeight = Math.max(380, maxNodesInLayer * (nodeHeight + 35) + paddingY * 2);

  // Position nodes
  const nodePositions = {};
  depthKeys.forEach((depth, colIdx) => {
    const nodesInCol = layers[depth];
    const colX = paddingX + colIdx * layerWidth;
    const colSpacing = (totalHeight - paddingY * 2) / (nodesInCol.length + 1);

    nodesInCol.forEach((node, rowIdx) => {
      const nodeY = paddingY + (rowIdx + 1) * colSpacing - nodeHeight / 2;
      nodePositions[node.taskId] = {
        ...node,
        x: colX,
        y: nodeY
      };
    });
  });

  // Extract edges from paths
  const edges = [];
  const edgeKeySet = new Set();

  rawPaths.forEach((path, pathIdx) => {
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const key = `${from}->${to}`;
      if (!edgeKeySet.has(key)) {
        edgeKeySet.add(key);
        edges.push({
          from,
          to,
          pathIndex: pathIdx
        });
      }
    }
  });

  // Fallback: If no paths enumerated, connect source to depth 1, depth 1 to depth 2, etc.
  if (edges.length === 0 && affectedTasks.length > 0) {
    affectedTasks.forEach((t) => {
      if (t.depth === 1) {
        edges.push({ from: sourceId || "source", to: t.taskId, pathIndex: 0 });
      }
    });
  }

  const selectedNode = selectedTaskId ? nodePositions[selectedTaskId] : null;

  return (
    <div className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden ${className}`}>
      {/* Graph Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/60 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-300">Propagation DAG</span>
          <span className="text-slate-500">|</span>
          <div className="flex items-center gap-3 text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              Source ({shock?.magnitude}d Shock)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Affected Task
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Critical Path
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              Bottleneck
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {rawPaths.length > 0 && (
            <span className="text-slate-400">
              {rawPaths.length} propagation path{rawPaths.length > 1 ? "s" : ""}
            </span>
          )}
          {selectedTaskId && (
            <button
              onClick={() => setSelectedTaskId(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
            >
              Reset Selection
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative overflow-x-auto overflow-y-auto max-h-[520px] p-2 bg-slate-950/30">
        <svg
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="min-w-full h-auto"
          style={{ width: `${totalWidth}px`, height: `${totalHeight}px` }}
        >
          <defs>
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            <linearGradient id="sourceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#3730a3" />
            </linearGradient>
            <linearGradient id="affectedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* Edges */}
          {edges.map((edge, idx) => {
            const start = nodePositions[edge.from];
            const end = nodePositions[edge.to];
            if (!start || !end) return null;

            const x1 = start.x + nodeWidth;
            const y1 = start.y + nodeHeight / 2;
            const x2 = end.x;
            const y2 = end.y + nodeHeight / 2;

            const isHighlighted =
              selectedTaskId === edge.from ||
              selectedTaskId === edge.to ||
              highlightedPathIndex === edge.pathIndex;

            // Smooth cubic Bezier curve
            const dx = (x2 - x1) * 0.5;
            const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            return (
              <path
                key={`edge-${idx}`}
                d={pathD}
                fill="none"
                stroke={isHighlighted ? "#f59e0b" : "#475569"}
                strokeWidth={isHighlighted ? "2.5" : "1.5"}
                strokeDasharray={edge.isDirect ? "none" : "none"}
                markerEnd={isHighlighted ? "url(#arrow-active)" : "url(#arrow-default)"}
                className="transition-all duration-200"
              />
            );
          })}

          {/* Nodes */}
          {Object.values(nodePositions).map((node) => {
            const isSelected = selectedTaskId === node.taskId;
            const isSource = node.isSource;
            const isCritical = node.isCritical;
            const isBottleneck = node.isBottleneck;

            let strokeColor = "#334155";
            if (isSelected) strokeColor = "#38bdf8";
            else if (isCritical) strokeColor = "#ef4444";
            else if (isBottleneck) strokeColor = "#a855f7";
            else if (isSource) strokeColor = "#818cf8";
            else strokeColor = "#f59e0b";

            return (
              <g
                key={`node-${node.taskId}`}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => {
                  setSelectedTaskId(node.taskId);
                  if (onSelectTask) onSelectTask(node.taskId);
                }}
                className="cursor-pointer group"
              >
                {/* Node Box */}
                <rect
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="8"
                  ry="8"
                  fill={isSource ? "url(#sourceGrad)" : "url(#affectedGrad)"}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                  className="transition-all duration-200 group-hover:filter group-hover:brightness-110 shadow-lg"
                />

                {/* Level / Depth Badge */}
                <rect
                  x="8"
                  y="8"
                  width="48"
                  height="16"
                  rx="3"
                  fill={isSource ? "#312e81" : "#1e293b"}
                />
                <text
                  x="32"
                  y="20"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontWeight="bold"
                >
                  {isSource ? "SOURCE" : `L${node.depth} ${node.relation || "DIRECT"}`}
                </text>

                {/* Status Badges */}
                <g transform="translate(100, 8)">
                  {isCritical && (
                    <circle cx="8" cy="8" r="4" fill="#ef4444" />
                  )}
                  {isBottleneck && (
                    <circle cx="20" cy="8" r="4" fill="#a855f7" />
                  )}
                </g>

                {/* Title */}
                <text
                  x="10"
                  y="46"
                  fill="#f8fafc"
                  fontSize="12"
                  fontWeight="600"
                  className="truncate"
                >
                  {node.title.length > 22 ? `${node.title.slice(0, 20)}...` : node.title}
                </text>

                {/* Subtitle / Details */}
                <text
                  x="10"
                  y="65"
                  fill="#94a3b8"
                  fontSize="10"
                >
                  {isSource
                    ? `Shock: +${shock?.magnitude}d`
                    : `Est: ${node.estimatedHours || 8}h · ${isCritical ? "Critical" : "Standard"}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100">{selectedNode.title}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                {selectedNode.relation} · Level {selectedNode.depth}
              </span>
              {selectedNode.isCritical && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950 text-rose-300 border border-rose-800">
                  Critical Path
                </span>
              )}
              {selectedNode.isBottleneck && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
                  Bottleneck
                </span>
              )}
            </div>
            <p className="text-slate-400 mt-1">
              Task ID: <code className="text-slate-300">{selectedNode.taskId}</code>
              {selectedNode.assignedTo && ` · Assigned to: ${selectedNode.assignedTo}`}
              {selectedNode.paths && ` · Reached via ${selectedNode.paths.length} distinct path(s)`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Highlight paths leading to this task</span>
          </div>
        </div>
      )}
    </div>
  );
}
