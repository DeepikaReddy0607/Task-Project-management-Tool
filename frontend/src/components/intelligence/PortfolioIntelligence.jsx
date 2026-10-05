import React, { useState, useEffect } from "react";
import {
  getPortfolioIntelligence,
  getResourceConflicts,
  getCrossProjectIntelligence
} from "../../services/api/intelligenceApi";
import PortfolioRiskMap from "./PortfolioRiskMap";
import ResourceConflictPanel from "./ResourceConflictPanel";
import CrossProjectIntelligence from "./CrossProjectIntelligence";
import PortfolioScenarioBuilder from "./PortfolioScenarioBuilder";
import PortfolioScenarioResults from "./PortfolioScenarioResults";

export default function PortfolioIntelligence({ workspaceId: propWorkspaceId }) {
  // Determine effective workspaceId from prop or localStorage
  const activeWorkspaceId =
    propWorkspaceId ||
    localStorage.getItem("activeWorkspaceId") ||
    localStorage.getItem("currentWorkspaceId") ||
    "";

  const [workspaceId, setWorkspaceId] = useState(activeWorkspaceId);
  const [activeTab, setActiveTab] = useState("risk-map"); // 'risk-map' | 'resources' | 'cross-project' | 'what-if'
  const [loading, setLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState(null);
  const [error, setError] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);

  const fetchPortfolio = async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await getPortfolioIntelligence(workspaceId);
      if (res?.success) {
        setPortfolioData(res.data);
      } else {
        setPortfolioData(res);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load portfolio intelligence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, [workspaceId]);

  if (!workspaceId) {
    return (
      <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500">
        Please select a workspace to inspect Portfolio Intelligence.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        <span>Aggregating Workspace Portfolio Intelligence...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <h4 className="font-semibold text-rose-800 mb-1">Portfolio Intelligence Unavailable</h4>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const {
    totalProjects = 0,
    portfolioHealthScore = 100,
    portfolioStatus = "HEALTHY",
    distribution = { HEALTHY: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0 },
    projects = [],
    riskConcentration = {}
  } = portfolioData || {};

  const statusBadgeColors = {
    HEALTHY: "bg-emerald-100 text-emerald-800 border-emerald-300",
    WATCH: "bg-amber-100 text-amber-800 border-amber-300",
    AT_RISK: "bg-orange-100 text-orange-800 border-orange-300",
    CRITICAL: "bg-rose-100 text-rose-800 border-rose-300"
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🌐</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Portfolio Command Center</h1>
            <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
              Phase 5 Executive
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Workspace-level health, probabilistic forecasting, resource pressure, and cross-project risk concentration
          </p>
        </div>

        <button
          onClick={fetchPortfolio}
          className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 self-start md:self-auto"
        >
          <span>↻</span>
          <span>Refresh Portfolio</span>
        </button>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Overall Health */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm col-span-2 sm:col-span-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Portfolio Health</div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-slate-900">{portfolioHealthScore}</span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusBadgeColors[portfolioStatus] || "bg-slate-100 text-slate-800"}`}>
            {portfolioStatus}
          </span>
        </div>

        {/* Total Projects */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Projects</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalProjects}</div>
          <div className="text-xs text-slate-500 mt-1">Active initiatives</div>
        </div>

        {/* Healthy */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Healthy</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{distribution.HEALTHY}</div>
          <div className="text-xs text-slate-400 mt-1">Operating on track</div>
        </div>

        {/* Watch */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Watch</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{distribution.WATCH}</div>
          <div className="text-xs text-slate-400 mt-1">Minor drift signals</div>
        </div>

        {/* At Risk */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-orange-600 uppercase tracking-wider">At Risk</div>
          <div className="text-2xl font-bold text-orange-700 mt-1">{distribution.AT_RISK}</div>
          <div className="text-xs text-slate-400 mt-1">Elevated risk load</div>
        </div>

        {/* Critical */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Critical</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{distribution.CRITICAL}</div>
          <div className="text-xs text-slate-400 mt-1">Immediate intervention</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-200 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab("risk-map")}
          className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "risk-map"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          📊 Portfolio Risk Map
        </button>

        <button
          onClick={() => setActiveTab("resources")}
          className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "resources"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          👥 Resource Conflicts
        </button>

        <button
          onClick={() => setActiveTab("cross-project")}
          className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "cross-project"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          🔗 Cross-Project Relationships
        </button>

        <button
          onClick={() => setActiveTab("what-if")}
          className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "what-if"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          🧪 Portfolio What-If
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "risk-map" && (
          <PortfolioRiskMap projects={projects} riskConcentration={riskConcentration} />
        )}

        {activeTab === "resources" && (
          <ResourceConflictPanel workspaceId={workspaceId} />
        )}

        {activeTab === "cross-project" && (
          <CrossProjectIntelligence workspaceId={workspaceId} />
        )}

        {activeTab === "what-if" && (
          <div className="space-y-6">
            {!simulationResult ? (
              <PortfolioScenarioBuilder
                workspaceId={workspaceId}
                projects={projects}
                onSimulationComplete={(res) => setSimulationResult(res)}
              />
            ) : (
              <PortfolioScenarioResults
                result={simulationResult}
                onReset={() => setSimulationResult(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
