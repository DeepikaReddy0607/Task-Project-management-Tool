import React, { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiFilter,
  FiLayers,
  FiRefreshCw,
  FiUser
} from "react-icons/fi";
import { getProjectDependencies } from "../../services/api/taskApi";

export default function ProjectDependencyGraph({ projectId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // "all", "critical", "blocked"
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const fetchGraph = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError("");
      const res = await getProjectDependencies(projectId);
      setData(res);
    } catch (err) {
      console.error("Failed to fetch project dependency graph:", err);
      setError(err?.response?.data?.error || "Failed to load project dependency graph");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-gray-500">
        <FiRefreshCw className="animate-spin mr-2" />
        Computing project dependency topology and critical path...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const stats = data?.stats || {};
  const hasCycles = data?.hasCycles || false;

  const filteredNodes = nodes.filter((n) => {
    if (filter === "critical") return n.isCritical;
    if (filter === "blocked") return n.isBlocked;
    return true;
  });

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedNodePrereqs = edges
    .filter((e) => e.to === selectedNodeId)
    .map((e) => nodes.find((n) => n.id === e.from))
    .filter(Boolean);
  const selectedNodeDependents = edges
    .filter((e) => e.from === selectedNodeId)
    .map((e) => nodes.find((n) => n.id === e.to))
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header and Telemetry Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <FiLayers className="text-blue-600" />
            Project Dependency Graph (Phase 13)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Topological structure, critical chain sequence, and execution blockers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded font-medium transition ${
                filter === "all" ? "bg-white text-blue-700 shadow-xs" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All Tasks ({nodes.length})
            </button>
            <button
              onClick={() => setFilter("critical")}
              className={`px-3 py-1 rounded font-medium transition ${
                filter === "critical" ? "bg-white text-red-700 shadow-xs" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Critical Path ({stats.criticalTasksCount || 0})
            </button>
            <button
              onClick={() => setFilter("blocked")}
              className={`px-3 py-1 rounded font-medium transition ${
                filter === "blocked" ? "bg-white text-amber-700 shadow-xs" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Blocked ({stats.blockedTasksCount || 0})
            </button>
          </div>

          <button
            onClick={fetchGraph}
            className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition"
            title="Refresh graph"
          >
            <FiRefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Cycle Warning */}
      {hasCycles && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
          <FiAlertTriangle className="text-red-600 shrink-0" size={16} />
          <div>
            <strong>Cycle Detected in Project Graph:</strong> A circular dependency exists among tasks:{" "}
            <span className="font-mono">{data.cycleNodes?.join(" → ")}</span>. Resolve cycle to restore CPM scheduling.
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-gray-500">Total Tasks</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{stats.totalTasks ?? nodes.length}</div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-gray-500">Dependencies</div>
          <div className="text-lg font-bold text-blue-600 mt-1">{stats.totalDependencies ?? edges.length}</div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-gray-500">Critical Path Tasks</div>
          <div className="text-lg font-bold text-red-600 mt-1">{stats.criticalTasksCount ?? 0}</div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-gray-500">Blocked Tasks</div>
          <div className="text-lg font-bold text-amber-600 mt-1">{stats.blockedTasksCount ?? 0}</div>
        </div>
      </div>

      {/* Main Grid: Task Nodes & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Nodes List */}
        <div className="lg:col-span-2 space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {filteredNodes.length === 0 ? (
            <div className="bg-white p-8 text-center text-xs text-gray-500 rounded-lg border border-gray-200">
              No tasks match the active filter.
            </div>
          ) : (
            filteredNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`p-3.5 rounded-lg border transition cursor-pointer ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/40 shadow-xs"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900 truncate">
                          {node.title}
                        </span>
                        {node.isCritical && (
                          <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            Critical Path
                          </span>
                        )}
                        {node.isBlocked ? (
                          <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1">
                            <FiClock size={10} /> Blocked
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1">
                            <FiCheckCircle size={10} /> Ready
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span>Status: <strong className="text-gray-700">{node.status}</strong></span>
                        {node.assignedTo && <span>Owner: {node.assignedTo}</span>}
                        <span>Duration: {node.durationDays}d</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs text-gray-400">
                        {node.blockedByCount} in / {node.blocksCount} out
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Task Inspector */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-fit">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b pb-2">
            Dependency Inspector
          </h4>

          {selectedNode ? (
            <div className="mt-3 space-y-4 text-xs">
              <div>
                <div className="font-bold text-sm text-gray-900">{selectedNode.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-medium text-gray-800">{selectedNode.status}</span>
                  {selectedNode.isCritical && (
                    <span className="text-red-600 font-semibold">• Zero Slack (Critical)</span>
                  )}
                </div>
              </div>

              {/* Upstream Prerequisites */}
              <div>
                <span className="font-semibold text-gray-700 block mb-1">
                  Prerequisites (Blocked By):
                </span>
                {selectedNodePrereqs.length === 0 ? (
                  <p className="text-gray-400 italic">No prerequisite tasks.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedNodePrereqs.map((p) => (
                      <li key={p.id} className="p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="font-medium text-gray-800">{p.title}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Status: {p.status} · {p.status === "Completed" ? "✅ Done" : "⏳ Blocking"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Downstream Dependents */}
              <div>
                <span className="font-semibold text-gray-700 block mb-1">
                  Dependents (Blocks):
                </span>
                {selectedNodeDependents.length === 0 ? (
                  <p className="text-gray-400 italic">No downstream dependents.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedNodeDependents.map((d) => (
                      <li key={d.id} className="p-2 bg-gray-50 rounded border border-gray-200 flex items-center gap-1.5">
                        <FiArrowRight size={12} className="text-blue-600" />
                        <span className="font-medium text-gray-800">{d.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 text-center text-xs text-gray-400 py-6">
              Select a task from the list to inspect its upstream prerequisites and downstream dependents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
