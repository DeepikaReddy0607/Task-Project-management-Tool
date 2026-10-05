import React, { useState, useEffect } from "react";
import {
  FiActivity,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiCalendar,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiLayers,
  FiRefreshCw
} from "react-icons/fi";
import { getHealthHistory } from "../../services/api/intelligenceApi";

export default function ProjectHealthHistory({ projectId, className = "" }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getHealthHistory(projectId, { limit: 50, order: "asc" });
      if (res.success && res.data) {
        setHistory(res.data);
        if (res.data.snapshots && res.data.snapshots.length > 0) {
          setSelectedSnapshot(res.data.snapshots[res.data.snapshots.length - 1]);
        }
      } else {
        setHistory(null);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load health history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  if (loading) {
    return (
      <div className={`p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-3 text-slate-500 ${className}`}>
        <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading health history records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-400 ${className}`}>
        <div className="flex items-center space-x-2 font-semibold">
          <FiAlertTriangle className="w-5 h-5" />
          <span>Error Loading Health History</span>
        </div>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!history || !history.snapshots || history.snapshots.length === 0) {
    return (
      <div className={`p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 ${className}`}>
        <FiActivity className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Health History Recorded</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          No historical snapshots have been recorded for this project yet. Snapshots are captured automatically upon replanning executions and major health shifts.
        </p>
      </div>
    );
  }

  const snapshots = history.snapshots;
  const trend = history.trend;
  const trendConfig = {
    IMPROVING: { icon: FiTrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    DECLINING: { icon: FiTrendingDown, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30" },
    STABLE: { icon: FiMinus, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" }
  }[trend] || { icon: FiMinus, color: "text-slate-500", bg: "bg-slate-500/10", border: "border-slate-500/30" };
  const TrendIcon = trendConfig.icon;

  // Compute SVG chart coordinates for health history sparkline
  const chartHeight = 120;
  const chartWidth = 500;
  const padding = 20;

  const points = snapshots.map((s, idx) => {
    const x = padding + (idx / Math.max(1, snapshots.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((s.health_score || 0) / 100) * (chartHeight - 2 * padding);
    return { x, y, snapshot: s };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Banner with Historical Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FiActivity className="text-primary w-5 h-5" />
              Persistent Health History
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
              Recorded State
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Immutable timeline of {history.totalSnapshots} project health snapshots. Append-only historical intelligence.
          </p>
        </div>

        {/* Quick KPI Strip */}
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 uppercase font-semibold">Latest Score</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {history.currentHealth ?? "N/A"}
              <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>
            </div>
          </div>
          <div className={`p-3 rounded-lg border ${trendConfig.bg} ${trendConfig.border} flex items-center space-x-2`}>
            <TrendIcon className={`w-6 h-6 ${trendConfig.color}`} />
            <div>
              <span className="text-xs font-medium text-slate-400">Trend</span>
              <div className={`text-sm font-bold ${trendConfig.color}`}>{history.trend}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Health History SVG Timeline Curve */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <FiLayers className="text-slate-400" />
            Health Score Trajectory Over Time
          </h3>
          <div className="text-xs text-slate-500 flex items-center gap-4">
            <span>Historical Min: <b>{history.historicalMin}</b></span>
            <span>Avg: <b>{history.averageHealth}</b></span>
            <span>Historical Max: <b>{history.historicalMax}</b></span>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-36">
            {/* Grid Lines */}
            <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="3 3" />
            <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="3 3" />
            <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />

            {/* Polyline Path */}
            <polyline fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={polylineStr} />

            {/* Data Points */}
            {points.map((p, idx) => {
              const isSelected = selectedSnapshot?.id === p.snapshot.id;
              return (
                <g key={idx} className="cursor-pointer" onClick={() => setSelectedSnapshot(p.snapshot)}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 6 : 4}
                    fill={isSelected ? "#ec4899" : "#6366f1"}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="transition-all hover:r-7"
                  />
                  {isSelected && (
                    <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[10px] font-bold fill-indigo-600 dark:fill-indigo-400">
                      {p.snapshot.health_score}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Snapshot Inspector */}
        {selectedSnapshot && (
          <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FiClock className="text-primary" />
                Snapshot: {new Date(selectedSnapshot.captured_at).toLocaleString()}
              </span>
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-primary/10 text-primary">
                Score: {selectedSnapshot.health_score} ({selectedSnapshot.health_status})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center text-xs">
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Schedule</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.schedule_score ?? "N/A"}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Crit. Path</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.critical_path_score ?? "N/A"}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Execution</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.execution_score ?? "N/A"}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Bottlenecks</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.bottleneck_score ?? "N/A"}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Dependencies</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.dependency_score ?? "N/A"}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Workload</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.workload_score ?? "N/A"}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block">Risks</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSnapshot.risk_score ?? "N/A"}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Major Transitions: Declines & Improvements */}
      {(history.majorDeclines?.length > 0 || history.majorImprovements?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {history.majorDeclines?.length > 0 && (
            <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-4 rounded-xl">
              <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 mb-2">
                <FiTrendingDown className="w-4 h-4 text-rose-600" />
                Significant Health Declines (≥5 pts)
              </h4>
              <ul className="space-y-2 text-xs">
                {history.majorDeclines.slice(0, 3).map((d, i) => (
                  <li key={i} className="p-2.5 bg-white dark:bg-slate-900 rounded border border-rose-100 dark:border-rose-900/40">
                    <div className="flex justify-between font-semibold">
                      <span className="text-rose-700 dark:text-rose-400">{d.previousScore} → {d.currentScore} ({d.delta} pts)</span>
                      <span className="text-slate-400">{new Date(d.toTimestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1">{d.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {history.majorImprovements?.length > 0 && (
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 p-4 rounded-xl">
              <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-2">
                <FiTrendingUp className="w-4 h-4 text-emerald-600" />
                Significant Health Recoveries (+5 pts)
              </h4>
              <ul className="space-y-2 text-xs">
                {history.majorImprovements.slice(0, 3).map((d, i) => (
                  <li key={i} className="p-2.5 bg-white dark:bg-slate-900 rounded border border-emerald-100 dark:border-emerald-900/40">
                    <div className="flex justify-between font-semibold">
                      <span className="text-emerald-700 dark:text-emerald-400">{d.previousScore} → {d.currentScore} (+{d.delta} pts)</span>
                      <span className="text-slate-400">{new Date(d.toTimestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1">{d.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
