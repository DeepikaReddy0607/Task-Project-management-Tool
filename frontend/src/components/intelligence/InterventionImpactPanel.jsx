import React, { useState, useEffect } from "react";
import {
  evaluateIntervention,
  compareInterventions,
  prepareInterventionProposal
} from "../../services/api/intelligenceApi";

export default function InterventionImpactPanel({ projectId, initialTaskId = null, onClose }) {
  const [activeTab, setActiveTab] = useState("evaluate"); // "evaluate" | "compare"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Single intervention form state
  const [interventionType, setInterventionType] = useState("REASSIGN_TASK");
  const [taskId, setTaskId] = useState(initialTaskId || "task-1");
  const [targetUser, setTargetUser] = useState("Member B");
  const [magnitudeDays, setMagnitudeDays] = useState(2);
  const [priority, setPriority] = useState("High");

  // Results
  const [evaluation, setEvaluation] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [preparedProposal, setPreparedProposal] = useState(null);
  const [stagingLoading, setStagingLoading] = useState(false);

  const handleEvaluate = async () => {
    setLoading(true);
    setError(null);
    setPreparedProposal(null);
    try {
      const intervention = {
        type: interventionType,
        projectId,
        targetEntity: { taskId },
        parameters: {
          toUserId: targetUser,
          newAssignee: targetUser,
          daysOffset: Number(magnitudeDays),
          priority,
          hoursReduction: Number(magnitudeDays) * 8
        }
      };

      const result = await evaluateIntervention({
        projectId,
        intervention
      });

      setEvaluation(result);
    } catch (err) {
      setEvaluation(null);
      setError(err.response?.data?.message || err.message || "Failed to evaluate intervention.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run default evaluation on mount or project change
  useEffect(() => {
    setEvaluation(null);
    setComparison(null);
    setPreparedProposal(null);
    setError(null);
    if (projectId) {
      handleEvaluate();
    }
  }, [projectId]);

  const handleCompare = async () => {
    setLoading(true);
    setError(null);
    setComparison(null);
    try {
      const invA = {
        name: "Option A: Reassign Task",
        type: "REASSIGN_TASK",
        projectId,
        targetEntity: { taskId },
        parameters: { toUserId: targetUser }
      };
      const invB = {
        name: "Option B: Add Capacity / Resource",
        type: "ADD_RESOURCE",
        projectId,
        parameters: { hoursReduction: 16 }
      };
      const invC = {
        name: "Option C: Parallelize Work",
        type: "PARALLELIZE_COMPATIBLE_WORK",
        projectId,
        targetEntity: { taskId }
      };

      const result = await compareInterventions({
        projectId,
        interventions: [invA, invB, invC]
      });

      setComparison(result);
    } catch (err) {
      setComparison(null);
      setError(err.response?.data?.message || err.message || "Failed to compare candidate interventions.");
    } finally {
      setLoading(false);
    }
  };

  const handleStageProposal = async () => {
    if (!evaluation) return;
    setStagingLoading(true);
    setError(null);
    try {
      const proposal = await prepareInterventionProposal({
        projectId,
        intervention: {
          type: interventionType,
          projectId,
          targetEntity: { taskId },
          parameters: { toUserId: targetUser, daysOffset: magnitudeDays }
        },
        evaluation
      });
      setPreparedProposal(proposal);
    } catch (err) {
      setPreparedProposal(null);
      setError(err.response?.data?.message || err.message || "Failed to stage proposal in Approval Center.");
    } finally {
      setStagingLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-2xl relative">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              INTERVENTION ENGINE
            </span>
            <span className="text-xs font-mono text-slate-400">100% READ-ONLY SIMULATION</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Intervention Impact Engine</h2>
          <p className="text-xs text-slate-400">
            Simulate and evaluate proposed interventions before applying them to project state.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700 text-xs">
          <button
            onClick={() => { setActiveTab("evaluate"); handleEvaluate(); }}
            className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === "evaluate" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
          >
            Single Intervention
          </button>
          <button
            onClick={() => { setActiveTab("compare"); handleCompare(); }}
            className={`px-3 py-1.5 rounded-md font-medium transition ${activeTab === "compare" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
          >
            Compare Alternatives
          </button>
        </div>
      </div>

      {/* Error Message Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 ml-4 font-bold text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Mode 1: Single Intervention Evaluation */}
      {activeTab === "evaluate" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700/60">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Intervention Type</label>
              <select
                value={interventionType}
                onChange={(e) => setInterventionType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="REASSIGN_TASK">Reassign Task to Member</option>
                <option value="ADD_RESOURCE">Add Capacity / Resource</option>
                <option value="CHANGE_TASK_PRIORITY">Change Task Priority</option>
                <option value="CHANGE_TASK_DEADLINE">Adjust Deadline / Due Date</option>
                <option value="CHANGE_TASK_ESTIMATE">Revise Effort Estimate</option>
                <option value="PARALLELIZE_COMPATIBLE_WORK">Parallelize Compatible Work</option>
                <option value="RECOVERY_ACTION">Apply Recovery Strategy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Target Task</label>
              <input
                type="text"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="e.g. task-1, API Testing"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {interventionType === "REASSIGN_TASK" ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Assignee</label>
                <input
                  type="text"
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  placeholder="e.g. Member B, Bob"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            ) : interventionType === "CHANGE_TASK_PRIORITY" ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Offset / Units ({magnitudeDays}d)</label>
                <input
                  type="range"
                  min="1"
                  max="14"
                  value={magnitudeDays}
                  onChange={(e) => setMagnitudeDays(e.target.value)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            )}

            <div className="flex items-end">
              <button
                onClick={handleEvaluate}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-1.5 px-4 rounded text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                {loading ? "Simulating..." : "Evaluate Impact"}
              </button>
            </div>
          </div>

          {/* Results Display */}
          {evaluation && (
            <div className="space-y-6">
              {/* Score & KPI Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/70 p-4 rounded-lg border border-slate-700/80 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-medium">Intervention Impact Score</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-emerald-400">{evaluation.impactScore}</span>
                    <span className="text-xs text-slate-400">/ 100</span>
                  </div>
                  <span className="mt-1 text-[11px] font-semibold text-emerald-300">
                    {evaluation.classification?.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="bg-slate-800/70 p-4 rounded-lg border border-slate-700/80">
                  <span className="text-xs text-slate-400 font-medium">Schedule Recovery</span>
                  <div className="text-2xl font-bold text-white mt-2">
                    +{evaluation.comparison?.scheduleDelayDays?.recoveredDays || evaluation.impactVector?.scheduleRecoveryDays || 0}d
                  </div>
                  <span className="text-[11px] text-slate-400">Project finish advances</span>
                </div>

                <div className="bg-slate-800/70 p-4 rounded-lg border border-slate-700/80">
                  <span className="text-xs text-slate-400 font-medium">Health Shift</span>
                  <div className="text-2xl font-bold text-white mt-2">
                    {evaluation.comparison?.health?.before} → {evaluation.comparison?.health?.after}
                  </div>
                  <span className="text-[11px] text-emerald-400">
                    +{evaluation.comparison?.health?.delta || evaluation.impactVector?.healthDelta || 0} pts gain
                  </span>
                </div>

                <div className="bg-slate-800/70 p-4 rounded-lg border border-slate-700/80">
                  <span className="text-xs text-slate-400 font-medium">Critical Path Tasks</span>
                  <div className="text-2xl font-bold text-white mt-2">
                    {evaluation.comparison?.criticalTasks?.before} → {evaluation.comparison?.criticalTasks?.after}
                  </div>
                  <span className="text-[11px] text-emerald-400">
                    {evaluation.comparison?.criticalTasks?.delta || 0} critical tasks relieved
                  </span>
                </div>
              </div>

              {/* Side Effects Alert Banner */}
              {evaluation.sideEffects && evaluation.sideEffects.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200">
                  <span className="font-semibold text-amber-400 mr-2">⚠ Unintended Side-Effects Detected:</span>
                  {evaluation.sideEffects.map((se, idx) => (
                    <span key={idx} className="mr-3">
                      <strong>{se.title}:</strong> {se.description}
                    </span>
                  ))}
                </div>
              )}

              {/* Trade-Offs: Benefits vs Costs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Benefits */}
                <div className="bg-slate-800/40 p-4 rounded-lg border border-emerald-500/20">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span>✓</span> Projected Benefits ({evaluation.benefits?.length || 0})
                  </h3>
                  <div className="space-y-2.5">
                    {evaluation.benefits?.map((b, idx) => (
                      <div key={idx} className="bg-slate-900/60 p-2.5 rounded border border-slate-700/40">
                        <div className="text-xs font-semibold text-slate-200">{b.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{b.evidence || b.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Costs */}
                <div className="bg-slate-800/40 p-4 rounded-lg border border-rose-500/20">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span>⚠</span> Costs & Secondary Friction ({evaluation.costs?.length || 0})
                  </h3>
                  <div className="space-y-2.5">
                    {evaluation.costs?.length > 0 ? (
                      evaluation.costs.map((c, idx) => (
                        <div key={idx} className="bg-slate-900/60 p-2.5 rounded border border-slate-700/40">
                          <div className="text-xs font-semibold text-slate-200">{c.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{c.description}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-400 italic p-2">Zero negative side costs identified.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendation & Approval Staging CTA */}
              <div className="bg-slate-800/80 p-4 rounded-lg border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-300">Deterministic Recommendation</span>
                  <p className="text-xs text-slate-400 mt-1">
                    {evaluation.recommendation?.rationale}
                  </p>
                </div>

                <button
                  onClick={handleStageProposal}
                  disabled={stagingLoading || preparedProposal != null}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 px-5 rounded text-xs transition whitespace-nowrap shadow-lg shadow-indigo-900/20"
                >
                  {stagingLoading ? "Staging..." : preparedProposal ? "Staged in Approval Center" : "Stage in Approval Center"}
                </button>
              </div>

              {/* Staged Proposal Notice */}
              {preparedProposal && (
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-xs text-indigo-200">
                  <div className="font-semibold text-indigo-300">
                    ✓ Proposal Staged: {preparedProposal.proposalId}
                  </div>
                  <div className="text-slate-400 mt-1">
                    {preparedProposal.message || "Staged for human approval in Approval Center. ZERO state mutations occur until approved."}
                  </div>
                </div>
              )}
            </div>
          )}
          {loading && !evaluation && (
            <div className="p-8 text-center bg-slate-800/40 rounded-lg border border-slate-700/60 text-slate-400 text-xs">
              Simulating intervention impact...
            </div>
          )}
          {!loading && !evaluation && !error && (
            <div className="p-8 text-center bg-slate-800/40 rounded-lg border border-slate-700/60 text-slate-400 text-xs">
              Select intervention parameters above and click &quot;Evaluate Impact&quot; to simulate outcomes.
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Multi-Option Comparison */}
      {activeTab === "compare" && loading && (
        <div className="p-8 text-center bg-slate-800/40 rounded-lg border border-slate-700/60 text-slate-400 text-xs">
          Comparing candidate interventions...
        </div>
      )}
      {activeTab === "compare" && !loading && !comparison && !error && (
        <div className="p-8 text-center bg-slate-800/40 rounded-lg border border-slate-700/60 text-slate-400 text-xs">
          No comparison run yet. Click &quot;Compare Alternatives&quot; to evaluate trade-offs across options.
        </div>
      )}
      {activeTab === "compare" && comparison && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
            <h3 className="text-sm font-bold text-white mb-2">Intervention Comparative Matrix</h3>
            <p className="text-xs text-slate-400 mb-4">
              Comparing 3 candidate interventions across schedule recovery, health score delta, and trade-off friction.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-2 px-3 font-semibold">Rank</th>
                    <th className="py-2 px-3 font-semibold">Intervention Option</th>
                    <th className="py-2 px-3 font-semibold">Schedule Recovery</th>
                    <th className="py-2 px-3 font-semibold">Health Delta</th>
                    <th className="py-2 px-3 font-semibold">Impact Score</th>
                    <th className="py-2 px-3 font-semibold">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {comparison.comparisonMatrix?.rankedOptions?.map((opt) => (
                    <tr key={opt.rank} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">#{opt.rank}</td>
                      <td className="py-2.5 px-3 font-medium text-white">{opt.name}</td>
                      <td className="py-2.5 px-3 text-slate-300">+{opt.recoveryDays}d</td>
                      <td className="py-2.5 px-3 text-emerald-300">+{opt.healthDelta} pts</td>
                      <td className="py-2.5 px-3 font-bold text-white">{opt.score}/100</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${opt.verdict.includes("HIGH") ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                          {opt.verdict}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {comparison.comparisonMatrix?.recommendedOption && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-xs text-emerald-200">
              <span className="font-bold text-emerald-400">Optimal Option: {comparison.comparisonMatrix.recommendedOption.name}</span>
              <p className="mt-1 text-slate-300">
                {comparison.comparisonMatrix.recommendedOption.rationale}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
