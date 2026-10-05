import React, { useState, useEffect } from "react";
import {
  runRedTeam,
  getRedTeam,
  validateRedTeamFinding
} from "../../services/api/intelligenceApi";

export default function ProjectRedTeam({ projectId, onClose, onLaunchCounterfactual }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [validatingFindingId, setValidatingFindingId] = useState(null);
  const [validationResult, setValidationResult] = useState(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (projectId) {
      handleFetchOrRunRedTeam();
    }
  }, [projectId]);

  const handleFetchOrRunRedTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await runRedTeam(projectId);
      setReport(data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to run Project Red Team analysis.");
    } finally {
      setLoading(false);
    }
  };

  const handleValidateWithChaos = async (finding) => {
    setValidatingFindingId(finding.findingId);
    setValidationResult(null);
    try {
      const res = await validateRedTeamFinding({
        projectId,
        findingId: finding.findingId
      });
      setValidationResult(res);
    } catch (err) {
      alert("Chaos validation failed: " + (err?.response?.data?.error || err.message));
    } finally {
      setValidatingFindingId(null);
    }
  };

  const findings = report?.findings || [];

  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
    if (categoryFilter !== "ALL" && f.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title?.toLowerCase().includes(q);
      const matchDesc = f.description?.toLowerCase().includes(q);
      const matchAssump = f.assumption?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssump) return false;
    }
    return true;
  });

  const exposure = report?.exposureScore || { score: 0, classification: "LOW_EXPOSURE" };

  const getScoreColor = (score) => {
    if (score >= 80) return "text-red-500 border-red-500 bg-red-50 dark:bg-red-950/20";
    if (score >= 60) return "text-orange-500 border-orange-500 bg-orange-50 dark:bg-orange-950/20";
    if (score >= 40) return "text-amber-500 border-amber-500 bg-amber-50 dark:bg-amber-950/20";
    return "text-emerald-500 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20";
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800";
      case "HIGH":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800";
      case "MEDIUM":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🛡️</span>
            <h2 className="text-lg font-bold">Project Red Team (Adversarial Analysis)</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold border border-red-300 dark:border-red-700">
              Phase 11
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Actively challenges assumptions, estimates, dependencies, and single points of failure before production breaks.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleFetchOrRunRedTeam}
            disabled={loading}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50 flex items-center space-x-1.5 shadow-sm"
          >
            <span>{loading ? "Challenging Project..." : "Run Red Team Challenge"}</span>
          </button>
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Exposure Scorecard & Headline Metrics */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Exposure Scorecard */}
            <div className={`p-5 rounded-xl border flex flex-col justify-between ${getScoreColor(exposure.score)}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Exposure Score</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-800/80">
                  {exposure.classification?.replace("_", " ")}
                </span>
              </div>
              <div className="my-2">
                <div className="text-4xl font-extrabold">{exposure.score}<span className="text-lg font-normal text-slate-500">/100</span></div>
                <p className="text-xs mt-1 text-slate-600 dark:text-slate-300">
                  Higher scores indicate severe concentration of fragile assumptions.
                </p>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Formula: Critical findings + High findings + Deadline risk + Concentration penalty.
              </div>
            </div>

            {/* Findings Breakdown */}
            <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Assumptions Challenged
              </span>
              <div className="my-2">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {report.findingsCount || 0}
                </div>
                <div className="flex items-center space-x-2 mt-2 text-xs">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold">
                    {report.summary?.criticalFindings || 0} Crit
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold">
                    {report.summary?.highFindings || 0} High
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold">
                    {report.summary?.mediumFindings || 0} Med
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400">
                Evaluated across 14 failure dimensions
              </div>
            </div>

            {/* Invariant Verification */}
            <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Immutability Invariant
              </span>
              <div className="my-2">
                <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                  <span>✓ 100% Read-Only</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono break-all text-[11px]">
                  Hash: {report.stateHash?.slice(0, 20)}...
                </p>
              </div>
              <div className="text-[10px] text-slate-400">
                SHA-256 verified equality before/after execution
              </div>
            </div>

            {/* Quick Handoff Action */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border border-indigo-200 dark:border-indigo-800/50 flex flex-col justify-between">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                Phase 12 Time Travel
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 my-2">
                Turn any challenged assumption into an alternate historical counterfactual simulation.
              </p>
              <button
                onClick={() => onLaunchCounterfactual && onLaunchCounterfactual()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition shadow-sm"
              >
                Open Time Machine →
              </button>
            </div>
          </div>
        )}

        {/* Top Concern Banner */}
        {report?.topVulnerabilities?.[0] && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-600 text-white">
                  TOP ADVERSARIAL CHALLENGE
                </span>
                <span className="text-xs font-semibold text-red-900 dark:text-red-200">
                  {report.topVulnerabilities[0].category}
                </span>
              </div>
              <h3 className="text-sm font-bold text-red-900 dark:text-red-100 mt-1.5">
                {report.topVulnerabilities[0].title}
              </h3>
              <p className="text-xs text-red-800 dark:text-red-300 mt-1">
                <strong>Challenged Assumption:</strong> {report.topVulnerabilities[0].assumption}
              </p>
            </div>
            <button
              onClick={() => setSelectedFinding(report.topVulnerabilities[0])}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 shadow-sm"
            >
              Inspect Challenge
            </button>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search findings, assumptions, tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-64 text-xs"
            />
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500">Severity:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="ALL">All Categories</option>
                <option value="ESTIMATE_REALISM">Estimate Realism</option>
                <option value="DEADLINE_REALISM">Deadline Realism</option>
                <option value="DEPENDENCY_FRAGILITY">Dependency Fragility</option>
                <option value="RESOURCE_CONCENTRATION">Resource Concentration</option>
                <option value="KNOWLEDGE_CONCENTRATION">Knowledge Concentration</option>
                <option value="CRITICAL_PATH_FRAGILITY">Critical Path Fragility</option>
                <option value="BOTTLENECK_FRAGILITY">Bottleneck Fragility</option>
                <option value="SCOPE_FRAGILITY">Scope Fragility</option>
                <option value="RECOVERY_FRAGILITY">Recovery Fragility</option>
                <option value="RISK_COVERAGE">Risk Coverage</option>
                <option value="DECISION_FRAGILITY">Decision Fragility</option>
                <option value="HEALTH_INCONSISTENCY">Health Inconsistency</option>
                <option value="CAPACITY_ASSUMPTION">Capacity Assumption</option>
                <option value="RESILIENCE_GAP">Resilience Gap</option>
              </select>
            </div>
          </div>
        </div>

        {/* Findings List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
            <span>Showing {filteredFindings.length} of {findings.length} Assumption Vulnerabilities</span>
          </div>

          {filteredFindings.map((finding) => (
            <div
              key={finding.findingId}
              className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadge(finding.severity)}`}>
                      {finding.severity}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {finding.category}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {finding.confidence?.replace("_", " ")}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {finding.title}
                  </h4>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setSelectedFinding(finding)}
                    className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleValidateWithChaos(finding)}
                    disabled={validatingFindingId === finding.findingId}
                    className="px-2.5 py-1 text-xs rounded bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 font-medium"
                  >
                    {validatingFindingId === finding.findingId ? "Simulating..." : "Test in Chaos Lab"}
                  </button>
                </div>
              </div>

              {/* Assumption & Evidence Snapshot */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider block">
                    Underlying Assumption
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 italic">
                    "{finding.assumption}"
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider block">
                    Red Team Evidence
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                    {finding.evidence?.[0] || finding.impact}
                  </p>
                </div>
              </div>

              {/* Recommended Action */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-700/50">
                <span className="text-slate-600 dark:text-slate-400">
                  <strong>Recommended Action:</strong> {finding.recommendedAction}
                </span>
                {finding.counterfactualAvailable && (
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer hover:underline"
                    onClick={() => onLaunchCounterfactual && onLaunchCounterfactual(finding)}>
                    Run Counterfactual ↩
                  </span>
                )}
              </div>
            </div>
          ))}

          {filteredFindings.length === 0 && (
            <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
              No assumption findings match your filter criteria.
            </div>
          )}
        </div>
      </div>

      {/* Finding Detail Modal */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between">
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadge(selectedFinding.severity)}`}>
                  {selectedFinding.severity}
                </span>
                <span className="text-xs font-mono text-slate-500 ml-2">
                  {selectedFinding.category}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {selectedFinding.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-bold text-slate-500 uppercase text-[10px]">Description</h4>
                <p className="mt-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedFinding.description}
                </p>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800/60">
                <h4 className="font-bold text-red-900 dark:text-red-200 uppercase text-[10px]">Challenged Assumption</h4>
                <p className="mt-0.5 text-red-800 dark:text-red-300 font-medium italic">
                  "{selectedFinding.assumption}"
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-500 uppercase text-[10px]">Concrete Evidence</h4>
                <ul className="mt-1 space-y-1 list-disc list-inside text-slate-700 dark:text-slate-300">
                  {(selectedFinding.evidence || []).map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-500 uppercase text-[10px]">Challenge Method</h4>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                  {selectedFinding.challengeMethod?.replace("_", " ")}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-500 uppercase text-[10px]">Recommended Action</h4>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                  {selectedFinding.recommendedAction}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-2">
              <button
                onClick={() => handleValidateWithChaos(selectedFinding)}
                disabled={validatingFindingId === selectedFinding.findingId}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm disabled:opacity-50"
              >
                {validatingFindingId === selectedFinding.findingId ? "Testing in Chaos Lab..." : "Validate with Chaos Lab"}
              </button>
              <button
                onClick={() => setSelectedFinding(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chaos Validation Result Modal */}
      {validationResult && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-red-200 dark:border-red-800">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                  CHAOS LAB VALIDATION RESULT
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {validationResult.findingTitle}
                </h3>
              </div>
              <button
                onClick={() => setValidationResult(null)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span>Validation Status:</span>
                <span className="font-bold text-red-600 dark:text-red-400">
                  {validationResult.validationStatus?.replace("_", " ")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase block">Chaos Score</span>
                  <span className="text-xl font-bold text-red-600">{validationResult.chaosScore}/100</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase block">Blast Radius</span>
                  <span className="text-xl font-bold text-orange-600">{validationResult.downstreamAffectedTasks} Tasks</span>
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Primary failure mode observed: <strong>{validationResult.primaryFailureMode}</strong>.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setValidationResult(null)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
