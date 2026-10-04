import React, { useState, useEffect } from "react";
import {
  queryIntelligence,
  simulateIntelligence,
  prepareActionProposal,
  getIntelligenceApprovals,
  executeApprovedAction,
  getProjectHealth,
  getCriticalPath,
  getBottlenecks,
  getProjectCoordination,
  getProjectNextActions
} from "../../services/api/intelligenceApi";
import DependencyShockwavePanel from "./DependencyShockwavePanel";
import InterventionImpactPanel from "./InterventionImpactPanel";
import ProjectChaosLab from "./ProjectChaosLab";
import ProjectRedTeam from "./ProjectRedTeam";
import CounterfactualTimeMachine from "./CounterfactualTimeMachine";
import ProjectDependencyGraph from "./ProjectDependencyGraph";
import DecisionLog from "../decisions/DecisionLog";
import { getProjectDecisions } from "../../services/api/decisionApi";

export default function ProjectCommandCenter({ projectId, workspaceId }) {
  const [loading, setLoading] = useState(false);
  const [nlQuery, setNlQuery] = useState("");
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState(null);

  // Core telemetry state
  const [healthData, setHealthData] = useState(null);
  const [cpmData, setCpmData] = useState(null);
  const [bottlenecksData, setBottlenecksData] = useState(null);
  const [coordinationData, setCoordinationData] = useState(null);
  const [nextActionsData, setNextActionsData] = useState(null);
  const [approvalsData, setApprovalsData] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [decisionSummary, setDecisionSummary] = useState({ total: 0, active: 0, superseded: 0, recent: 0 });
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch initial telemetry
  const fetchTelemetry = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [h, cp, bn, coord, actions, apprv, decs] = await Promise.allSettled([
        getProjectHealth(projectId),
        getCriticalPath(projectId),
        getBottlenecks(projectId),
        getProjectCoordination(projectId),
        getProjectNextActions(projectId),
        getIntelligenceApprovals({ projectId }),
        getProjectDecisions(projectId, { limit: 1 })
      ]);

      if (h.status === "fulfilled") setHealthData(h.value);
      if (cp.status === "fulfilled") setCpmData(cp.value);
      if (bn.status === "fulfilled") setBottlenecksData(bn.value);
      if (coord.status === "fulfilled") setCoordinationData(coord.value);
      if (actions.status === "fulfilled") setNextActionsData(actions.value);
      if (apprv.status === "fulfilled") setApprovalsData(apprv.value?.approvals || []);
      if (decs.status === "fulfilled" && decs.value?.summary) setDecisionSummary(decs.value.summary);
    } catch (err) {
      console.error("Telemetry fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [projectId]);

  // Execute Natural Language Query
  const handleRunQuery = async (queryText = nlQuery) => {
    if (!queryText.trim()) return;
    setLoading(true);
    setQueryError(null);
    try {
      const res = await queryIntelligence({
        query: queryText,
        projectId,
        workspaceId,
        context: { projectId, workspaceId }
      });
      setQueryResult(res);
      if (res.data?.simulationResult) {
        setSimulationResult(res.data);
      }
    } catch (err) {
      setQueryError(err.response?.data?.error || err.message || "Failed to execute query.");
    } finally {
      setLoading(false);
    }
  };

  // Quick Preset Queries
  const presets = [
    "Why is project health declining?",
    "What is blocking this project?",
    "Which tasks are on the critical path?",
    "Show me the dependency shockwave",
    "What happens if I reassign API Testing to Bob?",
    "Compare reassigning versus adding a resource",
    "Stress-test this project",
    "Run Red Team analysis",
    "What if we completed task-1 earlier?",
    "Prepare a recovery plan"
  ];

  const healthScore = healthData?.score ?? healthData?.healthScore ?? 85;
  const healthStatus = healthData?.status ?? healthData?.healthStatus ?? "HEALTHY";

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto text-gray-900">
      {/* 1. Project Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Project Command Center
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                healthStatus === "CRITICAL"
                  ? "bg-red-100 text-red-800"
                  : healthStatus === "AT_RISK"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {healthStatus} ({healthScore}/100)
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Production Intelligence & Deterministic Natural-Language Control Layer
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchTelemetry}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm transition"
          >
            {loading ? "Refreshing..." : "Refresh Telemetry"}
          </button>
        </div>
      </div>

      {/* 2. Natural-Language Query Interface (Part 11) */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900 mb-2 flex items-center gap-2">
          <span>💬</span> Natural-Language Intelligence Query
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRunQuery()}
            placeholder="Ask anything: 'Why is health at risk?', 'Show blockers', 'What if task slips 3 days?'..."
            className="flex-1 px-4 py-2.5 bg-white border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
          />
          <button
            onClick={() => handleRunQuery()}
            disabled={loading || !nlQuery.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow transition disabled:opacity-50"
          >
            {loading ? "Evaluating..." : "Ask Command"}
          </button>
        </div>

        {/* Preset quick buttons */}
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <span className="text-xs text-blue-800 font-medium">Quick suggestions:</span>
          {presets.map((p, idx) => (
            <button
              key={idx}
              onClick={() => {
                setNlQuery(p);
                handleRunQuery(p);
              }}
              className="text-xs bg-white/80 hover:bg-white text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full transition shadow-xs"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Query Result Card */}
        {queryError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {queryError}
          </div>
        )}

        {queryResult && (
          <div className="mt-4 p-4 bg-white border border-blue-200 rounded-lg shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Interpreted Intent: <span className="text-blue-700">{queryResult.intent}</span>
              </span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                {queryResult.intentCategory}
              </span>
            </div>

            {queryResult.status === "NEEDS_CLARIFICATION" ? (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-sm">
                <strong>Clarification Required:</strong> {queryResult.clarificationRequired}
              </div>
            ) : (
              <>
                {queryResult.explanation?.summary && (
                  <p className="text-sm font-medium text-gray-800">
                    {queryResult.explanation.summary}
                  </p>
                )}

                {queryResult.explanation?.findings && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-600 uppercase">Findings:</span>
                    <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
                      {queryResult.explanation.findings.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {queryResult.evidence && queryResult.evidence.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-600 uppercase">Verifiable Evidence:</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                      {queryResult.evidence.map((ev, i) => (
                        <div key={i} className="text-xs p-2 bg-gray-50 rounded border border-gray-200">
                          <div className="font-semibold text-gray-800">{ev.metric}: <span className="text-blue-700">{ev.value}</span></div>
                          <div className="text-gray-600 mt-0.5">{ev.explanation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 2.5 Tab Navigation */}
      <div className="flex border-b border-gray-200 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 px-1 border-b-2 transition ${
            activeTab === "overview"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Telemetry Overview
        </button>
        <button
          onClick={() => setActiveTab("shockwave")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "shockwave"
              ? "border-amber-500 text-amber-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Dependency Shockwave (Phase 8)
        </button>
        <button
          onClick={() => setActiveTab("intervention")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "intervention"
              ? "border-emerald-600 text-emerald-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Intervention Impact (Phase 9)
        </button>
        <button
          onClick={() => setActiveTab("chaos")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "chaos"
              ? "border-purple-600 text-purple-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          Project Chaos Lab (Phase 10)
        </button>
        <button
          onClick={() => setActiveTab("redteam")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "redteam"
              ? "border-rose-600 text-rose-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          Project Red Team (Phase 11)
        </button>
        <button
          onClick={() => setActiveTab("counterfactual")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "counterfactual"
              ? "border-cyan-600 text-cyan-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          Counterfactual Time Machine (Phase 12)
        </button>
        <button
          onClick={() => setActiveTab("dependencies")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "dependencies"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          Dependency Graph (Phase 13)
        </button>
        <button
          onClick={() => setActiveTab("decisions")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "decisions"
              ? "border-teal-600 text-teal-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-teal-500" />
          Decision Log (Phase 14)
        </button>
      </div>

      {activeTab === "shockwave" ? (
        <DependencyShockwavePanel
          projectId={projectId}
          workspaceId={workspaceId}
          activeTasks={cpmData?.criticalTasks || []}
        />
      ) : activeTab === "intervention" ? (
        <InterventionImpactPanel
          projectId={projectId}
          initialTaskId={cpmData?.criticalTasks?.[0]?.id || "task-1"}
        />
      ) : activeTab === "chaos" ? (
        <ProjectChaosLab
          projectId={projectId}
        />
      ) : activeTab === "redteam" ? (
        <ProjectRedTeam
          projectId={projectId}
        />
      ) : activeTab === "counterfactual" ? (
        <CounterfactualTimeMachine
          projectId={projectId}
        />
      ) : activeTab === "dependencies" ? (
        <ProjectDependencyGraph
          projectId={projectId}
        />
      ) : activeTab === "decisions" ? (
        <DecisionLog
          projectId={projectId}
          onOpenCounterfactual={() => setActiveTab("counterfactual")}
        />
      ) : (
        /* 3. Consolidated Command Center Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Health & Critical Path */}
        <div className="space-y-6">
          {/* Health Card */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Project Health</h3>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-black text-gray-900">{healthScore}<span className="text-sm font-normal text-gray-500">/100</span></div>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded ${
                healthStatus === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {healthStatus}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Synthesized from active tasks, drift, and structural bottlenecks.
            </p>
          </div>

          {/* Critical Path Card */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Critical Path</h3>
            <div className="text-2xl font-bold text-gray-900">
              {cpmData?.criticalTasks?.length || cpmData?.criticalTaskIds?.length || 0} Tasks
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Duration: {cpmData?.durationDays || cpmData?.criticalPathDurationDays || 0} day(s) (Zero total slack)
            </div>
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              Any delay on critical path directly delays project delivery.
            </div>
          </div>

          {/* Bottlenecks Card */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Active Bottlenecks</h3>
            <div className="text-2xl font-bold text-gray-900">
              {bottlenecksData?.bottlenecks?.length || bottlenecksData?.majorBottlenecks?.length || 0} Active
            </div>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {(bottlenecksData?.bottlenecks || bottlenecksData?.majorBottlenecks || []).slice(0, 3).map((b, idx) => (
                <li key={idx} className="truncate">
                  • Task {b.taskId || b.id}: Score {b.score || 80} ({b.primaryCause || "High fanout"})
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Center Column: Blockers & Next Actions */}
        <div className="space-y-6">
          {/* Blockers Queue */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Active Blocker Queue</h3>
            {coordinationData?.blockerQueue?.length > 0 ? (
              <div className="space-y-2">
                {coordinationData.blockerQueue.slice(0, 3).map((b, idx) => (
                  <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs">
                    <div className="font-semibold text-red-900">{b.title || b.id}</div>
                    <div className="text-red-700 mt-0.5">{b.impact || "Blocked by prerequisites"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-3 text-center bg-gray-50 rounded">
                No active blocker locks detected.
              </div>
            )}
          </div>

          {/* Next Actions */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Prioritized Next Actions</h3>
            {nextActionsData?.actions?.length > 0 ? (
              <div className="space-y-2.5">
                {nextActionsData.actions.slice(0, 3).map((act, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{act.title}</span>
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px]">
                        {act.priorityScore}/100
                      </span>
                    </div>
                    <div className="text-gray-600 mt-1">{act.why}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-3 text-center bg-gray-50 rounded">
                All scheduled workstreams progressing normally.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Approvals & Simulation Preview */}
        <div className="space-y-6">
          {/* Pending Approvals */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pending Approvals</h3>
            {approvalsData.length > 0 ? (
              <div className="space-y-2">
                {approvalsData.map((appr, idx) => (
                  <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                    <div className="font-semibold text-amber-900">{appr.title || appr.strategy}</div>
                    <div className="text-amber-800 mt-1">{appr.impactSummary || "Awaiting explicit approval"}</div>
                    <div className="mt-2 text-[10px] text-gray-500 font-mono">ID: {appr.id}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-3 text-center bg-gray-50 rounded">
                Approval queue is empty. Zero pending changes.
              </div>
            )}
          </div>

          {/* What-If Simulation Output */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Simulation Sandbox</h3>
            {simulationResult ? (
              <div className="text-xs space-y-2">
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded text-purple-900 font-medium">
                  {simulationResult.impactSummary}
                </div>
                <div className="text-gray-500 text-[11px]">
                  Simulations execute read-only models without database mutation.
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-3 text-center bg-gray-50 rounded">
                Ask a simulation query above to preview What-If outcomes.
              </div>
            )}
          </div>

          {/* Project Decisions Telemetry Card (Phase 14) */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Project Decisions</h3>
              <button
                onClick={() => setActiveTab("decisions")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Open Decision Log →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">Active Decisions</span>
                <span className="text-base font-bold text-gray-900">{decisionSummary.active}</span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">Superseded</span>
                <span className="text-base font-bold text-gray-900">{decisionSummary.superseded}</span>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-gray-500 flex justify-between">
              <span>Total Recorded: {decisionSummary.total}</span>
              <span>Recent (7d): {decisionSummary.recent}</span>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
