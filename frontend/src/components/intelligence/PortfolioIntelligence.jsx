import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getPortfolioIntelligence,
  getResourceConflicts,
  getCrossProjectIntelligence
} from "../../services/api/intelligenceApi";
import { getWorkspaces } from "../../services/api/workspaceApi";
import PortfolioRiskMap from "./PortfolioRiskMap";
import ResourceConflictPanel from "./ResourceConflictPanel";
import CrossProjectIntelligence from "./CrossProjectIntelligence";
import PortfolioScenarioBuilder from "./PortfolioScenarioBuilder";
import PortfolioScenarioResults from "./PortfolioScenarioResults";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { FiRefreshCw, FiLayers, FiAlertCircle, FiChevronRight } from "react-icons/fi";

export default function PortfolioIntelligence({ workspaceId: propWorkspaceId }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);

  // Determine effective workspaceId from prop or localStorage
  const initialWorkspaceId =
    propWorkspaceId ||
    localStorage.getItem("activeWorkspaceId") ||
    localStorage.getItem("currentWorkspaceId") ||
    "";

  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [activeTab, setActiveTab] = useState("risk-map"); // 'risk-map' | 'resources' | 'cross-project' | 'what-if'
  const [loading, setLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  const [error, setError] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);

  // Load workspaces on mount
  useEffect(() => {
    let isMounted = true;
    const fetchUserWorkspaces = async () => {
      try {
        setWorkspacesLoading(true);
        const res = await getWorkspaces();
        const list = res?.workspaces || res || [];
        if (isMounted) {
          setWorkspaces(list);
          if (list.length > 0) {
            // If current workspaceId is empty or not in the user's workspaces, default to first workspace
            const exists = list.some((w) => w.id === workspaceId);
            if (!workspaceId || !exists) {
              const defaultId = list[0].id;
              setWorkspaceId(defaultId);
              localStorage.setItem("activeWorkspaceId", defaultId);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load workspaces for portfolio view:", err);
      } finally {
        if (isMounted) setWorkspacesLoading(false);
      }
    };

    fetchUserWorkspaces();
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchPortfolio = async () => {
    if (!workspaceId) return;
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
    if (workspaceId) {
      fetchPortfolio();
    }
  }, [workspaceId]);

  const handleWorkspaceChange = (e) => {
    const newId = e.target.value;
    setWorkspaceId(newId);
    localStorage.setItem("activeWorkspaceId", newId);
  };

  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--color-text-muted)]">
        <FiRefreshCw className="animate-spin mr-3" size={20} />
        <span>Loading workspace portfolio...</span>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <Card className="p-12 text-center max-w-xl mx-auto my-12">
        <FiLayers className="mx-auto text-[var(--color-text-muted)] opacity-50" size={40} />
        <h3 className="mt-4 text-lg font-semibold text-[var(--color-text)]">
          No Workspaces Found
        </h3>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Create a workspace and projects to explore multi-project portfolio intelligence and cross-project risk maps.
        </p>
        <div className="mt-6">
          <Link to="/workspaces">
            <Button>Go to Workspaces</Button>
          </Link>
        </div>
      </Card>
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
    HEALTHY: "bg-[var(--color-surface-sage)] text-[var(--color-brand)] border-[var(--color-brand-soft)]",
    WATCH: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info-soft)]",
    AT_RISK: "bg-[var(--color-peach-soft)] text-[var(--color-peach)] border-[var(--color-peach-soft)]",
    CRITICAL: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger-soft)]"
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🌐</span>
            <h1 className="text-2xl font-bold text-[var(--color-text)] tracking-tight">
              Portfolio Command Center
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 bg-[var(--color-surface-sage)] text-[var(--color-brand)] border border-[var(--color-border)] rounded-full">
              Executive Intelligence
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Workspace-level health, probabilistic forecasting, resource pressure, and cross-project risk concentration
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Workspace Switcher */}
          <div className="flex items-center gap-2">
            <label htmlFor="portfolio-workspace-select" className="text-xs font-medium text-[var(--color-text-muted)]">
              Workspace:
            </label>
            <select
              id="portfolio-workspace-select"
              value={workspaceId}
              onChange={handleWorkspaceChange}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] shadow-xs focus:border-[var(--color-brand)] focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="secondary"
            onClick={fetchPortfolio}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={13} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[var(--color-danger-soft)] border border-[var(--color-danger-soft)] rounded-[var(--radius-md)] text-[var(--color-danger)] text-sm flex items-start gap-2">
          <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
          <div>
            <span className="font-semibold">Portfolio Intelligence Notice: </span>
            {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--color-text-muted)]">
          <FiRefreshCw className="animate-spin mr-3" size={24} />
          <span>Aggregating Workspace Portfolio Intelligence...</span>
        </div>
      ) : (
        <>
          {/* KPI Overview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Overall Health */}
            <Card className="p-4 col-span-2 sm:col-span-1">
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Portfolio Health
              </div>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-black text-[var(--color-text)]">
                  {portfolioHealthScore}
                </span>
                <span className="text-xs text-[var(--color-text-subtle)]">/ 100</span>
              </div>
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                  statusBadgeColors[portfolioStatus] || "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                }`}
              >
                {portfolioStatus}
              </span>
            </Card>

            {/* Total Projects */}
            <Card className="p-4">
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Projects
              </div>
              <div className="text-2xl font-bold text-[var(--color-text)] mt-1">
                {totalProjects}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">Active initiatives</div>
            </Card>

            {/* Healthy */}
            <Card className="p-4">
              <div className="text-xs font-semibold text-[var(--color-brand)] uppercase tracking-wider">
                Healthy
              </div>
              <div className="text-2xl font-bold text-[var(--color-brand)] mt-1">
                {distribution.HEALTHY || 0}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">Operating on track</div>
            </Card>

            {/* Watch */}
            <Card className="p-4">
              <div className="text-xs font-semibold text-[var(--color-info)] uppercase tracking-wider">
                Watch
              </div>
              <div className="text-2xl font-bold text-[var(--color-info)] mt-1">
                {distribution.WATCH || 0}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">Minor drift signals</div>
            </Card>

            {/* At Risk */}
            <Card className="p-4">
              <div className="text-xs font-semibold text-[var(--color-peach)] uppercase tracking-wider">
                At Risk
              </div>
              <div className="text-2xl font-bold text-[var(--color-peach)] mt-1">
                {distribution.AT_RISK || 0}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">Elevated risk load</div>
            </Card>

            {/* Critical */}
            <Card className="p-4">
              <div className="text-xs font-semibold text-[var(--color-danger)] uppercase tracking-wider">
                Critical
              </div>
              <div className="text-2xl font-bold text-[var(--color-danger)] mt-1">
                {distribution.CRITICAL || 0}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">Immediate intervention</div>
            </Card>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 border-b border-[var(--color-border)] overflow-x-auto text-xs font-semibold">
            {[
              { id: "risk-map", label: "📊 Portfolio Risk Map" },
              { id: "resources", label: "👥 Resource Conflicts" },
              { id: "cross-project", label: "🔗 Cross-Project Relationships" },
              { id: "what-if", label: "🧪 Portfolio What-If" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-[var(--color-brand)] text-[var(--color-brand)] font-bold"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
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
        </>
      )}
    </div>
  );
}
