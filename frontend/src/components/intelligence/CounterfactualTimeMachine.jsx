import React, { useState, useEffect } from "react";
import {
  runCounterfactual,
  compareCounterfactualBranches,
  getCounterfactualReplay
} from "../../services/api/intelligenceApi";

export default function CounterfactualTimeMachine({ projectId, onClose, initialScenario = null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Scenario Builder State
  const [scenarioType, setScenarioType] = useState(initialScenario?.type || "EARLIER_COMPLETION");
  const [deltaDays, setDeltaDays] = useState(initialScenario?.deltaDays || 2);
  const [targetTaskId, setTargetTaskId] = useState(initialScenario?.targetTaskId || "");
  const [targetMemberId, setTargetMemberId] = useState("");
  const [newHours, setNewHours] = useState(24);

  // Simulation Results
  const [report, setReport] = useState(null);
  const [timelineReplay, setTimelineReplay] = useState(null);

  // Multi-Branch Comparison State
  const [branchComparison, setBranchComparison] = useState(null);
  const [comparingBranches, setComparingBranches] = useState(false);

  // View Mode: "single" | "branches"
  const [viewMode, setViewMode] = useState("single");

  useEffect(() => {
    if (projectId) {
      handleRunCounterfactual();
    }
  }, [projectId]);

  const handleRunCounterfactual = async (customScenario = null) => {
    setLoading(true);
    setError(null);
    try {
      const scenario = customScenario || {
        type: scenarioType,
        deltaDays: Number(deltaDays),
        targetTaskId: targetTaskId.trim() || undefined,
        targetMemberId: targetMemberId.trim() || undefined,
        newHours: Number(newHours)
      };

      const res = await runCounterfactual({ projectId, scenario });
      setReport(res);

      // Also generate timeline replay
      try {
        const replay = await getCounterfactualReplay({
          projectId,
          counterfactualId: res.counterfactualId,
          scenario
        });
        setTimelineReplay(replay);
      } catch {
        // Fallback gracefully
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to run counterfactual simulation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompareMultiBranches = async () => {
    setComparingBranches(true);
    setError(null);
    try {
      const branches = [
        {
          type: "EARLIER_COMPLETION",
          deltaDays: 2,
          title: "Branch A: Target Task Completed 2 Days Earlier"
        },
        {
          type: "ALTERNATIVE_ASSIGNMENT",
          title: "Branch B: Key Workload Reassigned to Secondary Member"
        },
        {
          type: "REMOVED_DEPENDENCY",
          title: "Branch C: Critical Path Decoupled (Parallelized Execution)"
        }
      ];

      const res = await compareCounterfactualBranches({ projectId, branches });
      setBranchComparison(res);
      setViewMode("branches");
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to compare counterfactual branches.");
    } finally {
      setComparingBranches(false);
    }
  };

  const actual = report?.actualState || {};
  const simulated = report?.simulatedState || {};
  const deltas = report?.deltas || {};

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">⏳</span>
            <h2 className="text-lg font-bold">Counterfactual Time Machine</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-300 dark:border-indigo-700">
              Phase 12
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Simulates: "What would have happened if we had made a different decision earlier?" without mutating real project history.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("single")}
              className={`px-3 py-1.5 font-medium transition ${
                viewMode === "single"
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              Single Branch
            </button>
            <button
              onClick={handleCompareMultiBranches}
              disabled={comparingBranches}
              className={`px-3 py-1.5 font-medium transition ${
                viewMode === "branches"
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {comparingBranches ? "Simulating..." : "Multi-Branch Comparison"}
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Counterfactual Scenario Configuration Bar */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Counterfactual Scenario Definition
          </span>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-500 font-medium block mb-1">Scenario Type:</label>
              <select
                value={scenarioType}
                onChange={(e) => setScenarioType(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="EARLIER_COMPLETION">Earlier Task Completion</option>
                <option value="LATER_COMPLETION">Delayed Task Completion</option>
                <option value="ALTERNATIVE_ASSIGNMENT">Alternative Workload Reassignment</option>
                <option value="REMOVED_DEPENDENCY">Decouple Dependency (Parallelize)</option>
                <option value="ADDED_DEPENDENCY">Enforce Dependency Constraint</option>
                <option value="DIFFERENT_ESTIMATE">Different Effort Estimate</option>
                <option value="DIFFERENT_DEADLINE">Alternative Project Deadline</option>
                <option value="DIFFERENT_SCOPE">Alternative Scope Commitment</option>
                <option value="RISK_ACTION_EARLIER">Earlier Risk Mitigation Action</option>
                <option value="ALTERNATIVE_DECISION">Alternative Architecture Decision</option>
              </select>
            </div>

            <div>
              <label className="text-slate-500 font-medium block mb-1">Time Delta (Days):</label>
              <input
                type="number"
                min="1"
                max="15"
                value={deltaDays}
                onChange={(e) => setDeltaDays(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
              />
            </div>

            <div>
              <label className="text-slate-500 font-medium block mb-1">Target Task ID / Title (Optional):</label>
              <input
                type="text"
                placeholder="e.g. t1 or Core Ledger Service"
                value={targetTaskId}
                onChange={(e) => setTargetTaskId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => handleRunCounterfactual()}
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition disabled:opacity-50"
              >
                {loading ? "Simulating Alternate History..." : "Simulate Alternate History"}
              </button>
            </div>
          </div>
        </div>

        {/* View Mode: Single Branch Results */}
        {viewMode === "single" && report && (
          <div className="space-y-6">
            {/* Divergence Point Header */}
            <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white uppercase">
                  Divergence Point
                </span>
                <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-100 mt-1">
                  {report.divergencePoint?.description || report.title}
                </h3>
                <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-0.5">
                  Reference Date: <strong>{report.divergencePoint?.date}</strong> · Evidence Quality: <strong>{report.evidenceQuality}</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500 dark:text-slate-400 block font-mono text-[10px]">
                  Hash: {report.stateHash?.slice(0, 16)}...
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  ✓ Actual History Intact
                </span>
              </div>
            </div>

            {/* Actual vs Counterfactual Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Actual Baseline Card */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-500 uppercase">Actual History (Recorded)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-bold">
                    BASELINE
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">P80 Delivery:</span>
                    <span className="font-semibold">{actual.p80Date?.split("T")[0] || "Unscheduled"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Project Health:</span>
                    <span className="font-semibold text-emerald-600">{actual.healthScore}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Schedule Drift:</span>
                    <span className="font-semibold">{actual.scheduleDriftDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Critical Path Tasks:</span>
                    <span className="font-semibold">{actual.criticalTaskCount}</span>
                  </div>
                </div>
              </div>

              {/* Counterfactual Simulated Card */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-900">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase">Simulated Alternative</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold">
                    COUNTERFACTUAL
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Simulated P80:</span>
                    <span className="font-semibold">{simulated.p80Date?.split("T")[0] || "Unscheduled"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Simulated Health:</span>
                    <span className="font-semibold text-indigo-600">{simulated.healthScore}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Simulated Drift:</span>
                    <span className="font-semibold">{simulated.scheduleDriftDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Critical Path Tasks:</span>
                    <span className="font-semibold">{simulated.criticalTaskCount}</span>
                  </div>
                </div>
              </div>

              {/* Delta Comparison Callout */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-emerald-50 dark:from-indigo-950/40 dark:to-emerald-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase block">
                    Net Counterfactual Shift
                  </span>
                  <div className="mt-2 space-y-1">
                    <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {deltas.scheduleDaysDelta <= 0 ? `${deltas.scheduleDaysDelta} Days` : `+${deltas.scheduleDaysDelta} Days`}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      Health Shift: {deltas.healthDelta >= 0 ? `+${deltas.healthDelta}` : deltas.healthDelta} pts
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Critical Path: {deltas.criticalPathChanged ? "Migrated to alternate route" : "Route stable"}
                    </p>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 italic mt-2">
                  *Simulated projection under deterministic Digital Twin models.
                </div>
              </div>
            </div>

            {/* Dual Track Visual Timeline */}
            <div className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Visual History Divergence (Timeline Replay)
              </span>

              <div className="relative border-l-2 border-slate-300 dark:border-slate-600 ml-4 pl-6 space-y-6 text-xs">
                {/* Baseline Track */}
                <div className="relative">
                  <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-slate-400 border-2 border-white dark:border-slate-800"></div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Actual Historical Track</span>
                  <p className="text-slate-800 dark:text-slate-200 font-semibold mt-0.5">
                    Original execution proceeded as recorded in baseline logs.
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    Projected delivery: {actual.p80Date?.split("T")[0]} (Health: {actual.healthScore}/100)
                  </p>
                </div>

                {/* Divergence Point Node */}
                <div className="relative p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                  <div className="absolute -left-[31px] top-4 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-200 dark:ring-indigo-900"></div>
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase">
                    ⚡ Divergence Event: {report.divergencePoint?.date}
                  </span>
                  <p className="text-indigo-950 dark:text-indigo-100 font-bold mt-0.5">
                    {report.divergencePoint?.description}
                  </p>
                  <p className="text-indigo-800 dark:text-indigo-300 text-[11px] mt-0.5">
                    Alternative decision injected into in-memory cloned dependency graph.
                  </p>
                </div>

                {/* Counterfactual Outcome Node */}
                <div className="relative">
                  <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800"></div>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    Simulated Historical Outcome
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 font-semibold mt-0.5">
                    New delivery milestone: {simulated.p80Date?.split("T")[0]} (Health: {simulated.healthScore}/100)
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                    Net Delta: {deltas.scheduleDaysDelta <= 0 ? `${deltas.scheduleDaysDelta} days` : `+${deltas.scheduleDaysDelta} days`} delivery improvement.
                  </p>
                </div>
              </div>
            </div>

            {/* Sequential Causal Impact Chain */}
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Sequential Causal Simulation Trace
              </span>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {(report.impactChain || []).map((step, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-indigo-500 font-bold font-mono">0{idx + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Limitations & Disclaimers */}
            <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <span className="font-bold text-[10px] uppercase text-slate-600 dark:text-slate-300">
                Methodological Limitations & Disclaimers
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {(report.limitations || []).map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* View Mode: Multi-Branch Comparison */}
        {viewMode === "branches" && branchComparison && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Multi-Branch Counterfactual Comparison
                </h3>
                <p className="text-xs text-slate-500">
                  Simultaneous evaluation of {branchComparison.branchesCount} alternative strategies against actual recorded baseline.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Branch Scenario</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">P80 Delivery</th>
                    <th className="px-3 py-3">P80 Delta</th>
                    <th className="px-3 py-3">Health Score</th>
                    <th className="px-3 py-3">Health Delta</th>
                    <th className="px-3 py-3">Critical Tasks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {(branchComparison.comparisonRows || []).map((row, idx) => (
                    <tr
                      key={idx}
                      className={row.isBaseline ? "bg-slate-50/50 dark:bg-slate-900/50 font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          {row.isBaseline && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-bold">
                              RECORDED
                            </span>
                          )}
                          <span>{row.scenarioName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-slate-500">
                        {row.type}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {row.p80Date?.split("T")[0] || "N/A"}
                      </td>
                      <td className="px-3 py-3">
                        {row.isBaseline ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={row.p80ShiftDays <= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                            {row.p80ShiftDays <= 0 ? `${row.p80ShiftDays}d` : `+${row.p80ShiftDays}d`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {row.healthScore}/100
                      </td>
                      <td className="px-3 py-3">
                        {row.isBaseline ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={row.healthGain >= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                            {row.healthGain >= 0 ? `+${row.healthGain}` : `${row.healthGain}`} pts
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {row.criticalTaskCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
