import React, { useState, useEffect } from "react";
import {
  runChaosLab,
  getChaosLab,
  detectFailureThreshold,
  analyzeChaosRecovery
} from "../../services/api/intelligenceApi";

export default function ProjectChaosLab({ projectId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Configuration Controls
  const [scenarioCount, setScenarioCount] = useState(25);
  const [seed, setSeed] = useState(42);
  const [includeCombined, setIncludeCombined] = useState(true);
  const [includeMonteCarlo, setIncludeMonteCarlo] = useState(true);
  const [selectedSeverities, setSelectedSeverities] = useState(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

  // Main Lab Results
  const [labResult, setLabResult] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);

  // Failure Threshold State
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdResult, setThresholdResult] = useState(null);
  const [thresholdTargetTaskId, setThresholdTargetTaskId] = useState("");

  // Recovery Analysis State
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState("scenarios"); // "scenarios" | "sensitivity" | "matrix" | "threshold" | "recovery"

  // Filter state for scenarios table
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  const toggleSeverity = (sev) => {
    if (selectedSeverities.includes(sev)) {
      if (selectedSeverities.length > 1) {
        setSelectedSeverities(selectedSeverities.filter((s) => s !== sev));
      }
    } else {
      setSelectedSeverities([...selectedSeverities, sev]);
    }
  };

  const handleRunChaosLab = async () => {
    setLoading(true);
    setError(null);
    setSelectedScenario(null);
    try {
      const result = await runChaosLab({
        projectId,
        scenarioCount: Number(scenarioCount),
        severityRange: selectedSeverities,
        includeCombined,
        includeMonteCarlo,
        seed: Number(seed)
      });
      setLabResult(result);
      if (result.failureThreshold) {
        setThresholdResult(result.failureThreshold);
      }
      if (result.recommendedRecovery) {
        setRecoveryResult({ recommendedIntervention: result.recommendedRecovery });
      }
    } catch (err) {
      setLabResult(null);
      setError(err.response?.data?.message || err.message || "Failed to execute Chaos Lab simulation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLabResult(null);
    setSelectedScenario(null);
    setThresholdResult(null);
    setRecoveryResult(null);
    setError(null);
    if (projectId) {
      handleRunChaosLab();
    }
  }, [projectId]);

  const handleDetectThreshold = async () => {
    setThresholdLoading(true);
    try {
      const res = await detectFailureThreshold({
        projectId,
        targetTaskId: thresholdTargetTaskId || null,
        stepDays: 1,
        maxSteps: 15
      });
      setThresholdResult(res);
      setActiveTab("threshold");
    } catch (err) {
      console.error("Threshold detection error:", err);
    } finally {
      setThresholdLoading(false);
    }
  };

  const handleTestRecovery = async (scenario) => {
    setRecoveryLoading(true);
    try {
      const res = await analyzeChaosRecovery({
        projectId,
        chaosResult: labResult,
        topScenario: scenario
      });
      setRecoveryResult(res);
      setActiveTab("recovery");
    } catch (err) {
      console.error("Recovery analysis error:", err);
    } finally {
      setRecoveryLoading(false);
    }
  };

  const resilience = labResult?.resilienceScore || {};
  const summary = labResult?.summary || {};
  const dangerous = labResult?.mostDangerousComponent || {};
  const sensitivity = labResult?.sensitivityAnalysis || {};
  const scenarios = labResult?.scenarios || [];

  const filteredScenarios = scenarios.filter((scen) => {
    if (categoryFilter !== "ALL" && scen.category !== categoryFilter) return false;
    if (severityFilter !== "ALL" && scen.severity !== severityFilter) return false;
    return true;
  });

  const getResilienceColor = (score) => {
    if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-300";
    if (score >= 60) return "text-blue-700 bg-blue-50 border-blue-300";
    if (score >= 40) return "text-amber-700 bg-amber-50 border-amber-300";
    return "text-red-700 bg-red-50 border-red-300";
  };

  const getClassificationBadge = (classification) => {
    switch (classification) {
      case "RESILIENT":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">RESILIENT</span>;
      case "ATTENTION":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">ATTENTION</span>;
      case "HIGH_RISK":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">HIGH RISK</span>;
      case "CRITICAL_FAILURE":
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 animate-pulse">CRITICAL FAILURE</span>;
    }
  };

  const getSeverityBadge = (sev) => {
    const map = {
      LOW: "bg-gray-100 text-gray-700 border-gray-300",
      MEDIUM: "bg-blue-100 text-blue-700 border-blue-300",
      HIGH: "bg-amber-100 text-amber-800 border-amber-300",
      CRITICAL: "bg-red-100 text-red-800 border-red-300 font-bold"
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs border ${map[sev] || map.MEDIUM}`}>
        {sev}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Chaos Controls */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-purple-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              <h2 className="text-xl font-black tracking-tight">PROJECT CHAOS / FAILURE LABORATORY</h2>
              <span className="text-xs bg-purple-500/30 text-purple-200 border border-purple-400/40 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                Chaos Engine
              </span>
            </div>
            <p className="text-sm text-purple-200 mt-1 max-w-2xl">
              Automated stress-testing & controlled disruption generation against the Project Digital Twin. Evaluates systemic resilience, failure thresholds, and recovery interventions with zero database writes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunChaosLab}
              disabled={loading}
              className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              <span>{loading ? "Simulating Chaos..." : "⚡ Run Chaos Lab"}</span>
            </button>
            <button
              onClick={handleDetectThreshold}
              disabled={thresholdLoading}
              className="px-4 py-2.5 bg-purple-800/80 hover:bg-purple-700 border border-purple-500/50 text-white rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50"
            >
              <span>{thresholdLoading ? "Detecting..." : "Detect Collapse Point"}</span>
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div className="mt-5 pt-4 border-t border-purple-800/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          <div>
            <label className="block text-purple-300 font-semibold mb-1">Scenario Count: {scenarioCount}</label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={scenarioCount}
              onChange={(e) => setScenarioCount(e.target.value)}
              className="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-purple-300 font-semibold mb-1">Deterministic Seed</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full px-2.5 py-1 bg-purple-950/80 border border-purple-700 rounded text-purple-100 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
          </div>

          <div>
            <label className="block text-purple-300 font-semibold mb-1">Severities</label>
            <div className="flex gap-1">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => toggleSeverity(sev)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                    selectedSeverities.includes(sev)
                      ? "bg-purple-500 text-white"
                      : "bg-purple-950 text-purple-400 border border-purple-800"
                  }`}
                >
                  {sev[0]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-purple-300 font-semibold mb-1">Simulation Options</label>
            <div className="flex flex-col gap-1 text-[11px] text-purple-200">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCombined}
                  onChange={(e) => setIncludeCombined(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-0"
                />
                Multi-Shock Scenarios
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMonteCarlo}
                  onChange={(e) => setIncludeMonteCarlo(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-0"
                />
                Monte Carlo Forecast Shift
              </label>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <span className="text-purple-300 text-[11px]">Safety Invariant:</span>
            <span className="text-emerald-400 font-mono text-[10px]">READ_ONLY_SIMULATION (Zero DB Writes)</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Loading State */}
      {loading && !labResult && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="text-2xl animate-spin inline-block mb-3">⚡</div>
          <div className="text-sm font-bold text-slate-800">Executing Chaos Lab Stress-Test...</div>
          <p className="text-xs text-slate-500 mt-1">Simulating synthetic failure permutations against the Project Digital Twin.</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !labResult && !error && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="text-2xl inline-block mb-3 text-slate-400">🛡️</div>
          <div className="text-sm font-bold text-slate-800">No Stress-Test Results</div>
          <p className="text-xs text-slate-500 mt-1">Configure options above and click &quot;Run Chaos Lab&quot; to test systemic resilience.</p>
        </div>
      )}

      {/* 2. Top-Level Resilience KPI Cards */}
      {labResult && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Project Resilience Score */}
          <div className={`p-5 rounded-xl border shadow-sm ${getResilienceColor(resilience.score ?? 70)}`}>
            <div className="text-xs font-bold uppercase tracking-wider opacity-75">Project Resilience Score</div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl font-black">{resilience.score ?? 0}</span>
              <span className="text-sm font-semibold opacity-75">/ 100</span>
            </div>
            <div className="mt-2 text-xs font-bold uppercase tracking-wide">
              {resilience.classification || "CALCULATING"}
            </div>
            <p className="text-xs mt-2 opacity-90 leading-relaxed">
              {resilience.explanation}
            </p>
          </div>

          {/* Failure Classification Breakdown */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Scenario Outcomes</div>
              <div className="text-2xl font-black text-gray-900 mt-1">
                {summary.totalScenarios || scenarios.length} Scenarios
              </div>
            </div>
            <div className="space-y-1.5 mt-3 text-xs">
              <div className="flex justify-between items-center text-emerald-700">
                <span>Resilient Pass:</span>
                <span className="font-bold">{summary.failureClassificationCounts?.RESILIENT || 0} ({summary.resiliencePercentage ?? 0}%)</span>
              </div>
              <div className="flex justify-between items-center text-blue-700">
                <span>Attention Required:</span>
                <span className="font-bold">{summary.failureClassificationCounts?.ATTENTION || 0}</span>
              </div>
              <div className="flex justify-between items-center text-amber-700">
                <span>High-Risk Failures:</span>
                <span className="font-bold">{summary.failureClassificationCounts?.HIGH_RISK || 0}</span>
              </div>
              <div className="flex justify-between items-center text-red-700">
                <span>Critical Collapse:</span>
                <span className="font-bold">{summary.failureClassificationCounts?.CRITICAL_FAILURE || 0}</span>
              </div>
            </div>
          </div>

          {/* Most Dangerous Component Spotlight */}
          <div className="bg-white p-5 rounded-xl border border-rose-200 bg-rose-50/30 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Most Dangerous Component</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">CRITICAL TARGET</span>
              </div>
              <div className="text-base font-bold text-gray-900 mt-2 truncate" title={dangerous.componentTitle}>
                {dangerous.componentTitle || "N/A"}
              </div>
              <div className="text-xs text-gray-500">{dangerous.componentType}</div>
            </div>
            <div className="mt-3 pt-3 border-t border-rose-100 text-xs space-y-1">
              <div className="flex justify-between text-gray-700">
                <span>Peak Impact:</span>
                <span className="font-bold text-rose-700">{dangerous.maxChaosScore || 0}/100</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Avg Downstream Blast:</span>
                <span className="font-bold">{dangerous.averageDownstreamImpact || 0} tasks</span>
              </div>
            </div>
          </div>

          {/* Failure Threshold & Recovery Recommendation */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Threshold & Recovery</div>
              <div className="mt-2 text-sm font-semibold text-gray-800">
                Collapse Point:{" "}
                <span className="text-red-600 font-bold">
                  {labResult.failureThreshold?.collapsePointDays
                    ? `+${labResult.failureThreshold.collapsePointDays} day(s)`
                    : "No failure within 15d"}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Tolerance buffer: {labResult.failureThreshold?.toleranceDays || 0} day(s)
              </div>
            </div>
            {labResult.recommendedRecovery && (
              <div className="mt-3 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs">
                <div className="font-semibold text-purple-900 truncate">
                  💡 {labResult.recommendedRecovery.strategy}
                </div>
                <div className="text-purple-700 text-[11px] mt-0.5">
                  Est. Health Gain: +{labResult.recommendedRecovery.healthGain || 0} pts
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Navigation Sub-Tabs */}
      <div className="flex border-b border-gray-200 gap-2">
        {[
          { key: "scenarios", label: "Ranked Chaos Scenarios" },
          { key: "sensitivity", label: "Sensitivity Analysis" },
          { key: "matrix", label: "Category × Severity Matrix" },
          { key: "threshold", label: "Failure Threshold (Collapse Curve)" },
          { key: "recovery", label: "Recovery Interventions" }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === tab.key
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Tab Content */}
      {/* TAB 1: Ranked Scenarios Table */}
      {activeTab === "scenarios" && (
        <div className="space-y-4">
          {/* Table Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-600">Filters:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-gray-300 rounded px-2.5 py-1 text-gray-700"
              >
                <option value="ALL">All Categories ({scenarios.length})</option>
                <option value="TASK_DELAY">Task Delay</option>
                <option value="TASK_FAILURE">Task Failure</option>
                <option value="TASK_EFFORT_SHOCK">Effort Shock</option>
                <option value="TEAM_AVAILABILITY">Team Availability</option>
                <option value="DEPENDENCY_FAILURE">Dependency Failure</option>
                <option value="DEADLINE_COMPRESSION">Deadline Compression</option>
                <option value="BOTTLENECK_FAILURE">Bottleneck Failure</option>
                <option value="COMBINED_FAILURE">Combined Multi-Shock</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-white border border-gray-300 rounded px-2.5 py-1 text-gray-700"
              >
                <option value="ALL">All Severities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>

            <div className="text-gray-500">
              Showing {filteredScenarios.length} of {scenarios.length} scenarios (Sorted by Chaos Impact)
            </div>
          </div>

          {/* Scenarios Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Scenario Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Blast Radius</th>
                  <th className="px-4 py-3">Health Delta</th>
                  <th className="px-4 py-3 text-right">Chaos Score</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredScenarios.map((scen) => (
                  <tr
                    key={scen.id}
                    className="hover:bg-purple-50/40 transition cursor-pointer"
                    onClick={() => setSelectedScenario(scen)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getSeverityBadge(scen.severity)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{scen.title}</div>
                      {scen.primaryFailureMode && (
                        <div className="text-[10px] text-gray-500">{scen.primaryFailureMode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-[11px]">
                      {scen.category}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getClassificationBadge(scen.classification)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {scen.downstreamAffectedCount || 0} tasks
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold">
                      <span className={scen.healthDelta < 0 ? "text-red-600" : "text-gray-700"}>
                        {scen.healthDelta > 0 ? "+" : ""}{scen.healthDelta || 0} pts
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-black text-gray-900">
                      <span className={`px-2 py-0.5 rounded ${
                        scen.chaosImpactScore >= 75 ? "bg-red-100 text-red-800" :
                        scen.chaosImpactScore >= 50 ? "bg-amber-100 text-amber-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {scen.chaosImpactScore}/100
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleTestRecovery(scen)}
                        className="text-purple-600 hover:text-purple-900 font-semibold text-xs underline"
                      >
                        Mitigate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scenario Details Drawer/Card */}
          {selectedScenario && (
            <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-5 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔬</span>
                  <h3 className="font-bold text-gray-900 text-base">{selectedScenario.title}</h3>
                  {getClassificationBadge(selectedScenario.classification)}
                </div>
                <button
                  onClick={() => setSelectedScenario(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 font-medium">Downstream Blast Radius</span>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    {selectedScenario.downstreamAffectedCount || 0} Affected Tasks
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 font-medium">Project Delay</span>
                  <div className="text-lg font-bold text-red-600 mt-1">
                    +{selectedScenario.completionDelayDays || 0} Day(s)
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 font-medium">Health Impact</span>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    {selectedScenario.healthDelta || 0} pts
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 font-medium">Chaos Impact Score</span>
                  <div className="text-lg font-bold text-purple-700 mt-1">
                    {selectedScenario.chaosImpactScore}/100
                  </div>
                </div>
              </div>

              {selectedScenario.propagationPath && selectedScenario.propagationPath.length > 0 && (
                <div className="text-xs bg-white p-3 rounded-lg border border-gray-200">
                  <span className="font-bold text-gray-700 uppercase tracking-wider block mb-1">
                    Shockwave Propagation Sequence:
                  </span>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-purple-900">
                    {selectedScenario.propagationPath.map((step, idx) => (
                      <React.Fragment key={idx}>
                        <span className="bg-purple-100 px-2 py-0.5 rounded font-semibold">{step}</span>
                        {idx < selectedScenario.propagationPath.length - 1 && <span>→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => handleTestRecovery(selectedScenario)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow transition"
                >
                  🛡️ Test Recovery Intervention
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Sensitivity Analysis */}
      {activeTab === "sensitivity" && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-gray-900">Project Vulnerability & Sensitivity Spectrum</h3>
            <p className="text-xs text-gray-500 mt-1">
              Measures how drastically project delivery degrades under specific classes of disruption.
            </p>
          </div>

          <div className="space-y-4">
            {(sensitivity.dimensions || []).map((dim, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-gray-900">{dim.dimension}</span>
                  <span className="text-xs text-gray-500">{dim.scenarioCount} scenarios evaluated</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Chaos Impact:</span>
                      <span className="font-bold text-rose-700">{dim.averageImpact}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-rose-600 h-2 rounded-full"
                        style={{ width: `${Math.min(dim.averageImpact, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Dimension Resilience:</span>
                      <span className="font-bold text-emerald-700">{dim.resilienceScore}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-emerald-600 h-2 rounded-full"
                        style={{ width: `${Math.min(dim.resilienceScore, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Category x Severity Matrix */}
      {activeTab === "matrix" && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Disruption Category × Severity Distribution Matrix</h3>
            <p className="text-xs text-gray-500 mt-1">
              Two-dimensional systemic stress distribution across failure modes and intensities.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
              <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Disruption Category</th>
                  <th className="px-4 py-3 text-center">Low</th>
                  <th className="px-4 py-3 text-center">Medium</th>
                  <th className="px-4 py-3 text-center">High</th>
                  <th className="px-4 py-3 text-center">Critical</th>
                  <th className="px-4 py-3 text-right">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {[
                  "TASK_DELAY",
                  "TASK_FAILURE",
                  "TASK_EFFORT_SHOCK",
                  "TEAM_AVAILABILITY",
                  "RESOURCE_REDUCTION",
                  "DEPENDENCY_FAILURE",
                  "DEADLINE_COMPRESSION",
                  "SCOPE_EXPANSION",
                  "BOTTLENECK_FAILURE",
                  "COMBINED_FAILURE"
                ].map((cat) => {
                  const catScenarios = scenarios.filter((s) => s.category === cat);
                  const avg = catScenarios.length > 0
                    ? Math.round(catScenarios.reduce((acc, s) => acc + (s.chaosImpactScore || 0), 0) / catScenarios.length)
                    : 0;
                  return (
                    <tr key={cat} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{cat}</td>
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((sev) => {
                        const count = catScenarios.filter((s) => s.severity === sev).length;
                        return (
                          <td key={sev} className="px-4 py-3 text-center">
                            {count > 0 ? (
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                sev === "CRITICAL" ? "bg-red-100 text-red-800" :
                                sev === "HIGH" ? "bg-amber-100 text-amber-800" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {count}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-black text-gray-900">
                        {avg > 0 ? `${avg}/100` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Failure Threshold & Collapse Point */}
      {activeTab === "threshold" && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-gray-900">Project Collapse Curve & Failure Threshold</h3>
            <p className="text-xs text-gray-500 mt-1">
              Determines exactly how much progressive delay or disruption a critical element can withstand before the project crosses into Critical Failure.
            </p>
          </div>

          {thresholdResult && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div>
                  <span className="text-purple-700 font-semibold block">Target Component</span>
                  <span className="text-base font-bold text-purple-950">
                    {thresholdResult.targetTaskTitle || "Project Critical Path"}
                  </span>
                </div>
                <div>
                  <span className="text-purple-700 font-semibold block">Collapse Point</span>
                  <span className="text-xl font-black text-red-600">
                    {thresholdResult.collapsePointDays ? `+${thresholdResult.collapsePointDays} day(s)` : "None"}
                  </span>
                </div>
                <div>
                  <span className="text-purple-700 font-semibold block">Tolerance Buffer</span>
                  <span className="text-xl font-black text-emerald-700">
                    {thresholdResult.toleranceDays || 0} day(s)
                  </span>
                </div>
                <div>
                  <span className="text-purple-700 font-semibold block">Primary Failure Mode</span>
                  <span className="text-xs font-mono font-bold text-purple-900">
                    {thresholdResult.failureMode || "SCHEDULE_OVERRUN"}
                  </span>
                </div>
              </div>

              {/* Incremental Progression Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                  <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Step</th>
                      <th className="px-4 py-3">Added Disruption</th>
                      <th className="px-4 py-3">Simulated Health</th>
                      <th className="px-4 py-3">Project Status</th>
                      <th className="px-4 py-3 text-right">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(thresholdResult.progression || []).map((step) => (
                      <tr
                        key={step.step}
                        className={step.isCriticalFailure ? "bg-red-50/60 font-semibold" : "hover:bg-gray-50"}
                      >
                        <td className="px-4 py-3">#{step.step}</td>
                        <td className="px-4 py-3">+{step.addedDisruptionDays} day(s)</td>
                        <td className="px-4 py-3 font-mono">{step.simulatedHealth}/100</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            step.status === "CRITICAL" ? "bg-red-100 text-red-800" :
                            step.status === "WARNING" ? "bg-amber-100 text-amber-800" :
                            "bg-emerald-100 text-emerald-800"
                          }`}>
                            {step.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {step.isCriticalFailure ? (
                            <span className="text-red-700 font-bold uppercase text-[11px]">COLLAPSE POINT REACHED</span>
                          ) : (
                            <span className="text-emerald-700 font-semibold text-[11px]">WITHIN TOLERANCE</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Recovery Interventions */}
      {activeTab === "recovery" && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-gray-900">Chaos Recovery & Intervention Handoff</h3>
            <p className="text-xs text-gray-500 mt-1">
              Connects high-impact chaos scenarios directly to Intervention Impact evaluation.
            </p>
          </div>

          {recoveryResult?.recommendedIntervention ? (
            <div className="p-5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-800">
                  Recommended Recovery Action
                </span>
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
                  INTERVENTION EVALUATED
                </span>
              </div>

              <div className="text-lg font-bold text-gray-900">
                {recoveryResult.recommendedIntervention.strategy}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
                <div className="bg-white p-3 rounded-lg border border-purple-200">
                  <span className="text-gray-500">Projected Health Gain:</span>
                  <div className="text-base font-bold text-emerald-600 mt-0.5">
                    +{recoveryResult.recommendedIntervention.healthGain || 0} pts
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-purple-200">
                  <span className="text-gray-500">Delay Recovery:</span>
                  <div className="text-base font-bold text-blue-600 mt-0.5">
                    -{recoveryResult.recommendedIntervention.delayReductionDays || 0} day(s)
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-purple-200">
                  <span className="text-gray-500">Handoff Mode:</span>
                  <div className="text-base font-bold text-purple-700 mt-0.5">
                    Approval Center Staging
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-600 pt-1">
                {recoveryResult.recommendedIntervention.rationale}
              </p>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
              Select any scenario from the Ranked Scenarios table and click "Mitigate" to generate automated recovery interventions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
