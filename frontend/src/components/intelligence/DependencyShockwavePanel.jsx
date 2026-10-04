import React, { useState } from "react";
import {
  analyzeShockwave,
  stressTestProject,
  prepareActionProposal
} from "../../services/api/intelligenceApi";
import ShockwaveGraph from "./ShockwaveGraph";

export default function DependencyShockwavePanel({ projectId, workspaceId, activeTasks = [] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shockwaveResult, setShockwaveResult] = useState(null);
  const [stressTestResult, setStressTestResult] = useState(null);
  const [stagedProposalId, setStagedProposalId] = useState(null);

  // Form parameters
  const [selectedTaskId, setSelectedTaskId] = useState(activeTasks[0]?.id || "");
  const [shockType, setShockType] = useState("TASK_DELAY");
  const [magnitude, setMagnitude] = useState(3);
  const [unit, setUnit] = useState("days");

  // Run Shockwave Analysis
  const handleAnalyze = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setStressTestResult(null);

    try {
      const data = await analyzeShockwave({
        projectId,
        sourceTaskId: selectedTaskId || undefined,
        shockType,
        magnitude: Number(magnitude) || 3,
        unit
      });
      setShockwaveResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to analyze shockwave.");
    } finally {
      setLoading(false);
    }
  };

  // Run Stress-Test
  const handleStressTest = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      const data = await stressTestProject(projectId, Number(magnitude) || 3);
      setStressTestResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to run stress test.");
    } finally {
      setLoading(false);
    }
  };

  // Stage Recovery Proposal into Approval Center
  const handleStageRecovery = async (option) => {
    if (!projectId) return;
    try {
      const res = await prepareActionProposal({
        projectId,
        actionType: "PREPARE_RECOVERY_PLAN",
        entities: { durationDays: magnitude },
        rationale: `Mitigation for ${shockType} on ${shockwaveResult?.shock?.sourceTaskTitle || "component"}: ${option.strategy || option.description}`
      });
      setStagedProposalId(res.proposalId);
    } catch (err) {
      console.error("Failed to stage proposal:", err);
    }
  };

  const shock = shockwaveResult?.shock;
  const intensity = shockwaveResult?.intensity;
  const propagation = shockwaveResult?.propagation;
  const containment = shockwaveResult?.containment;
  const critical = shockwaveResult?.criticalPath;
  const deadline = shockwaveResult?.deadlineRisk;
  const team = shockwaveResult?.teamImpact;
  const health = shockwaveResult?.healthImpact;
  const forecast = shockwaveResult?.forecastImpact;
  const recoveryOptions = shockwaveResult?.recoveryOptions || [];

  return (
    <div className="space-y-6">
      {/* Control Header & Parameters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              Dependency Shockwave Engine
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate downstream disruption propagation, critical path exposure, and buffer absorption.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStressTest}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-purple-800/80 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 text-xs font-medium transition"
            >
              Stress-Test Project
            </button>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition flex items-center gap-1.5"
            >
              {loading ? "Simulating..." : "Analyze Shockwave"}
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {/* Target Component */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Target Task / Component</label>
            {activeTasks.length > 0 ? (
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {activeTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.id})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                placeholder="Enter task ID..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            )}
          </div>

          {/* Shock Type */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Disruption Type</label>
            <select
              value={shockType}
              onChange={(e) => setShockType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="TASK_DELAY">Task Delay / Schedule Slip</option>
              <option value="TASK_EFFORT_INCREASE">Effort / Scope Increase</option>
              <option value="TASK_BLOCKED">Task Blocked (Prerequisite Freeze)</option>
              <option value="ASSIGNEE_UNAVAILABLE">Assignee Unavailable</option>
              <option value="DEADLINE_COMPRESSION">Deadline Compression</option>
              <option value="RESOURCE_REDUCTION">Resource Capacity Reduction</option>
            </select>
          </div>

          {/* Magnitude Slider */}
          <div>
            <div className="flex justify-between text-slate-400 font-medium mb-1">
              <span>Magnitude</span>
              <span className="text-slate-200 font-bold">{magnitude} {unit}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={magnitude}
              onChange={(e) => setMagnitude(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="days">Days</option>
              <option value="hours">Hours</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Stress Test Ranking Modal / Banner */}
      {stressTestResult && (
        <div className="bg-purple-950/20 border border-purple-800/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-purple-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Project Stress-Test Ranking ({stressTestResult.durationDays}d Disruption)
            </h4>
            <span className="text-xs text-purple-300">
              Tested {stressTestResult.testedTaskCount} candidate tasks
            </span>
          </div>

          <p className="text-xs text-slate-300">{stressTestResult.summary}</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] text-slate-400 border-b border-purple-900/50 uppercase">
                <tr>
                  <th className="py-2">Rank</th>
                  <th className="py-2">Task</th>
                  <th className="py-2">Impact Score</th>
                  <th className="py-2">Severity</th>
                  <th className="py-2">Blast Radius</th>
                  <th className="py-2">Critical Tasks</th>
                  <th className="py-2">Project Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/30 text-slate-200">
                {(stressTestResult.rankedImpacts || []).slice(0, 5).map((item, idx) => (
                  <tr key={item.taskId} className="hover:bg-purple-900/10">
                    <td className="py-2 font-bold text-slate-400">#{idx + 1}</td>
                    <td className="py-2 font-medium">{item.taskTitle}</td>
                    <td className="py-2">
                      <span className="font-bold text-purple-300">{item.impactScore}/100</span>
                    </td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        item.severity === "CRITICAL" ? "bg-rose-950 text-rose-300 border border-rose-800" :
                        item.severity === "HIGH" ? "bg-amber-950 text-amber-300 border border-amber-800" :
                        "bg-slate-800 text-slate-300"
                      }`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-2">{item.affectedTasksCount} tasks (Depth {item.maxDepth})</td>
                    <td className="py-2">{item.criticalTasksAffected} critical</td>
                    <td className="py-2 font-semibold text-rose-400">+{item.projectCompletionDelayDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Shockwave Results */}
      {shockwaveResult && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Impact Severity */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Shock Intensity Score</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-100">{intensity?.score}/100</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  intensity?.severity === "CRITICAL" ? "bg-rose-950 text-rose-300 border border-rose-800" :
                  intensity?.severity === "HIGH" ? "bg-amber-950 text-amber-300 border border-amber-800" :
                  "bg-slate-800 text-slate-300"
                }`}>
                  {intensity?.severity}
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 truncate">
                {intensity?.factors?.[0] || "Downstream impact evaluated."}
              </div>
            </div>

            {/* Project Containment */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Project Buffer Containment</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-100">{containment?.containmentScore}%</span>
                <span className="text-xs text-emerald-400 font-medium">
                  {containment?.scheduleAbsorptionDays}d absorbed
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 truncate">
                {containment?.summary}
              </div>
            </div>

            {/* Blast Radius */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Blast Radius & Depth</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-100">{propagation?.totalAffected}</span>
                <span className="text-xs text-slate-400">tasks affected</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Max Propagation Depth: <strong className="text-slate-200">{propagation?.maxDepth} level(s)</strong>
              </div>
            </div>

            {/* Completion Shift */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Project Completion Shift</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-extrabold ${deadline?.delayDays > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  +{deadline?.delayDays}d
                </span>
                <span className="text-xs text-slate-400">schedule variance</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Health: <strong className="text-slate-200">{health?.scoreBefore} → {health?.scoreAfter}</strong> ({health?.scoreDelta} pts)
              </div>
            </div>
          </div>

          {/* DAG Visualizer */}
          <ShockwaveGraph shockwaveData={shockwaveResult} />

          {/* Baseline vs Shocked Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Critical Path & Bottlenecks */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Critical Path & Bottleneck Shifts
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Source Task Critical Status:</span>
                  <span className={`font-semibold ${critical?.isSourceCritical ? "text-rose-400" : "text-slate-300"}`}>
                    {critical?.isSourceCritical ? "On Critical Path (0 Slack)" : "Non-Critical (Has Buffer Float)"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Critical Path Duration:</span>
                  <span className="text-slate-200">
                    {critical?.durationBefore}d → {critical?.durationAfter}d ({critical?.durationDelta > 0 ? `+${critical?.durationDelta}d` : "0d"})
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Newly Critical Tasks:</span>
                  <span className="text-slate-200">
                    {critical?.newlyCriticalTasks?.length || 0} task(s)
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">New Bottlenecks Created:</span>
                  <span className="text-purple-300 font-semibold">
                    {shockwaveResult.bottlenecks?.newlyCreatedBottlenecks?.length || 0} bottleneck(s)
                  </span>
                </div>
              </div>
            </div>

            {/* Monte Carlo & Team Impact */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Monte Carlo Forecast & Team Exposure
              </h4>
              <div className="space-y-2 text-xs">
                {forecast?.available ? (
                  <>
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-400">P50 Most-Likely Finish:</span>
                      <span className="text-slate-200">
                        {forecast.baseline?.p50Date} → {forecast.shocked?.p50Date} (+{forecast.deltas?.p50ShiftDays}d)
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-400">P80 High-Confidence Finish:</span>
                      <span className="text-slate-200">
                        {forecast.baseline?.p80Date} → {forecast.shocked?.p80Date} (+{forecast.deltas?.p80ShiftDays}d)
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-1.5 text-slate-500 italic border-b border-slate-800">
                    Monte Carlo simulation unavailable for this sample topology.
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Team Members Impacted:</span>
                  <span className="text-slate-200 font-semibold">
                    {team?.affectedMembersCount} of {team?.totalMembersCount} member(s)
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Workload Concentration Delta:</span>
                  <span className="text-slate-200">
                    {team?.workloadConcentrationDelta > 0 ? `+${team.workloadConcentrationDelta}` : team?.workloadConcentrationDelta} pts
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recovery Opportunities Banner */}
          {recoveryOptions.length > 0 && (
            <div className="bg-emerald-950/20 border border-emerald-800/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Simulation Recovery Opportunities (Approval Center Ready)
                </h4>
                <span className="text-[10px] text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-800">
                  SIMULATION ONLY
                </span>
              </div>

              {stagedProposalId && (
                <div className="p-2.5 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-xs">
                  Proposal <code>{stagedProposalId}</code> successfully staged into the Approval Center for human review.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recoveryOptions.map((opt, idx) => (
                  <div key={opt.optionId || idx} className="p-3 bg-slate-950/60 border border-emerald-900/40 rounded-lg text-xs flex flex-col justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-200">{opt.strategy}</div>
                      <p className="text-slate-400 mt-1">{opt.description}</p>
                      <p className="text-emerald-400 mt-1 font-medium">{opt.simulatedOutcome}</p>
                    </div>
                    <button
                      onClick={() => handleStageRecovery(opt)}
                      className="self-end px-3 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-white font-medium text-[11px] transition shadow"
                    >
                      Stage in Approval Center
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
