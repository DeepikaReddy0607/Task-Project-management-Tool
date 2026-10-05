import { useEffect, useState, useCallback, useRef } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiFilter,
  FiLayers,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiZap,
  FiUsers,
  FiMaximize2
} from "react-icons/fi";
import { useSocketEvent } from "../../context/SocketContext";
import {
  getIntelligenceOverview,
  getCriticalPath,
  getBottlenecks,
  createScenario,
  simulateScenario,
  getReplanningProposals,
  generateReplanning,
  approveProposal,
  rejectProposal,
  executeProposal
} from "../../services/api/intelligenceApi";
import CriticalPathGraph from "./CriticalPathGraph";
import BottleneckRadar from "./BottleneckRadar";
import ProjectHealthScorecard from "./ProjectHealthScorecard";
import ScheduleDriftCard from "./ScheduleDriftCard";
import DeadlineRiskPanel from "./DeadlineRiskPanel";
import PreMortemPanel from "./PreMortemPanel";
import TeamWorkloadPanel from "./TeamWorkloadPanel";
import KnowledgeRiskPanel from "./KnowledgeRiskPanel";
import ScenarioBuilder from "./ScenarioBuilder";
import ScenarioResults from "./ScenarioResults";
import ScenarioComparison from "./ScenarioComparison";
import ReplanningPanel from "./ReplanningPanel";
import ProposalPreview from "./ProposalPreview";
import ProjectHealthHistory from "./ProjectHealthHistory";
import ProjectHistoryTimeline from "./ProjectHistoryTimeline";
import DecisionIntelligencePanel from "./DecisionIntelligencePanel";
import ProjectReplay from "./ProjectReplay";
import ProjectDiagnosisPanel from "./ProjectDiagnosisPanel";
import ProjectAutopsy from "./ProjectAutopsy";
import ProjectForecastPanel from "./ProjectForecastPanel";
import ScopeIntelligencePanel from "./ScopeIntelligencePanel";

export default function ProjectIntelligence({ projectId, initialTaskId = null, className = "" }) {
  const [overviewData, setOverviewData] = useState(null);
  const [criticalPathData, setCriticalPathData] = useState(null);
  const [bottleneckData, setBottleneckData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'health' | 'critical-path' | 'bottlenecks' | 'team' | 'simulate' | 'replanning'
  const [selectedTaskId, setSelectedTaskId] = useState(() => initialTaskId || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("taskId") : null));
  const [searchQuery, setSearchQuery] = useState("");

  // Phase 3 States
  const [simulationResult, setSimulationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [activeProposalForPreview, setActiveProposalForPreview] = useState(null);
  const [isExecutingProposal, setIsExecutingProposal] = useState(false);
  const [proposalError, setProposalError] = useState(null);
  const [executionSuccess, setExecutionSuccess] = useState(null);

  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (initialTaskId) {
      setSelectedTaskId(initialTaskId);
    }
  }, [initialTaskId]);

  const loadIntelligence = useCallback(async (isManualRefresh = false) => {
    if (!projectId) return;
    if (isManualRefresh) setIsRefreshing(true);

    try {
      setError(null);
      // Fetch unified overview
      try {
        const overviewRes = await getIntelligenceOverview(projectId);
        const data = overviewRes?.data || {};
        setOverviewData(data);
        setCriticalPathData(data.criticalPath || null);
        setBottleneckData(data.bottlenecks || null);
      } catch (overviewErr) {
        // Fallback to separate endpoints if overview is unavailable
        const [cpRes, bnRes] = await Promise.all([
          getCriticalPath(projectId),
          getBottlenecks(projectId),
        ]);
        setCriticalPathData(cpRes?.data || null);
        setBottleneckData(bnRes?.data || null);
      }
    } catch (err) {
      console.error("Failed to load project intelligence:", err);
      const status = err.response?.status;
      if (status === 403) {
        setError("You do not have permission to view intelligence for this project.");
      } else if (status === 404) {
        setError("Project not found.");
      } else {
        setError(err.response?.data?.message || err.message || "Failed to load project intelligence.");
      }
    } finally {
      setLoading(false);
      if (isManualRefresh) {
        setTimeout(() => setIsRefreshing(false), 300);
      }
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    setSelectedTaskId(null);
    void loadIntelligence();
  }, [loadIntelligence]);

  // Real-time synchronization on task/dependency/project updates with 400ms debounce
  const handleRealtimeUpdate = useCallback((event) => {
    if (!event?.type) return;
    const matchesProject =
      !event.projectId ||
      event.projectId === projectId ||
      event.data?.project_id === projectId ||
      event.data?.projectId === projectId ||
      event.data?.id === projectId;

    if (matchesProject) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void loadIntelligence();
      }, 400);
    }
  }, [projectId, loadIntelligence]);

  useSocketEvent("*", handleRealtimeUpdate);
  useSocketEvent("reconnect", () => void loadIntelligence());

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center ${className}`}>
        <FiRefreshCw className="mx-auto animate-spin text-[var(--color-brand)]" size={32} />
        <h4 className="mt-3 font-[var(--font-display)] text-sm font-semibold text-[var(--color-text)]">
          Computing Project Intelligence...
        </h4>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Synthesizing Digital Twin, Critical Path Method, and Predictive Health Scorecard.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-[var(--radius-xl)] border border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-8 text-center ${className}`}>
        <FiAlertTriangle className="mx-auto text-rose-500" size={32} />
        <h4 className="mt-2 font-semibold text-sm text-[var(--color-text)]">
          Intelligence Unavailable
        </h4>
        <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={() => void loadIntelligence(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-xs hover:bg-[var(--color-canvas-soft)]"
        >
          <FiRefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} /> Retry Analysis
        </button>
      </div>
    );
  }

  // Phase 3 Actions
  const handleSimulate = async (scenarioData) => {
    setIsSimulating(true);
    try {
      const created = await createScenario(projectId, scenarioData);
      const sId = created?.data?.scenarioId;
      if (sId) {
        const simRes = await simulateScenario(projectId, sId, scenarioData.mutations);
        setSimulationResult(simRes?.data || simRes);
      }
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleGenerateReplanning = async (strategy = "ALL") => {
    setIsLoadingProposals(true);
    try {
      const res = await generateReplanning(projectId, strategy);
      setProposals(res?.data?.proposals || []);
    } catch (err) {
      console.error("Replanning failed:", err);
    } finally {
      setIsLoadingProposals(false);
    }
  };

  const handleApproveProposal = async (proposal) => {
    setProposalError(null);
    try {
      await approveProposal(projectId, proposal.proposalId);
      proposal.status = "APPROVED";
      setActiveProposalForPreview(proposal);
    } catch (err) {
      setProposalError(err.response?.data?.message || err.message);
    }
  };

  const handleRejectProposal = async (proposalId) => {
    try {
      await rejectProposal(projectId, proposalId);
      setProposals((prev) =>
        prev.map((p) => (p.proposalId === proposalId ? { ...p, status: "REJECTED" } : p))
      );
    } catch (err) {
      console.error("Reject failed:", err);
    }
  };

  const handleConfirmExecution = async (proposalId) => {
    setIsExecutingProposal(true);
    setProposalError(null);
    try {
      const res = await executeProposal(projectId, proposalId);
      setActiveProposalForPreview(null);
      setExecutionSuccess(`Plan applied successfully! Applied ${res?.data?.appliedChangesCount || 0} change(s).`);
      void loadIntelligence(true);
    } catch (err) {
      setProposalError(err.response?.data?.message || err.message || "Failed to execute proposal.");
    } finally {
      setIsExecutingProposal(false);
    }
  };

  const cpSummary = criticalPathData?.summary || {};
  const bnSummary = bottleneckData?.summary || {};
  const hasCycle = Boolean(criticalPathData?.hasCycle || bottleneckData?.hasCycle);
  const healthData = overviewData?.health;
  const driftData = overviewData?.drift;
  const deadlineRisks = overviewData?.deadlineRisks || [];
  const preMortemData = overviewData?.preMortem;
  const teamWorkloadData = overviewData?.teamWorkload;
  const knowledgeRiskData = overviewData?.knowledgeRisk;

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Executive KPI Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Project Health */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Project Health
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FiShield size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              {healthData?.score ?? (hasCycle ? 40 : 100)}/100
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {healthData?.status ?? (hasCycle ? "CRITICAL" : "HEALTHY")}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
            {healthData?.history?.trend ? `Trend: ${healthData.history.trend}` : "Deterministic multi-factor score"}
          </p>
        </div>

        {/* Metric 2: Critical Path Duration */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Project Duration
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <FiClock size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              {hasCycle ? "—" : `${criticalPathData?.projectDurationDays ?? 0}`}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {hasCycle ? "Cycle detected" : "days critical path"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
            {hasCycle
              ? "Scheduling suspended"
              : cpSummary.multipleCriticalPaths
              ? "Multiple parallel critical paths"
              : "Minimum time to project delivery"}
          </p>
        </div>

        {/* Metric 3: Critical Tasks Count */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Critical Tasks
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <FiZap size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {cpSummary.criticalTasksCount ?? (criticalPathData?.criticalTasks?.length || 0)}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              of {cpSummary.totalTasks ?? 0} tasks
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
            {cpSummary.criticalTasksCount > 0
              ? "Zero slack — any delay postpones delivery"
              : "No zero-slack bottlenecks"}
          </p>
        </div>

        {/* Metric 4: Active Bottlenecks */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[var(--color-text-subtle)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Active Bottlenecks
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <FiAlertTriangle size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-orange-600 dark:text-orange-400">
              {bnSummary.totalBottlenecks ?? (bottleneckData?.bottlenecks?.length || 0)}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {bnSummary.criticalCount ? `${bnSummary.criticalCount} critical` : "monitored"}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-[var(--color-text-subtle)]" title={bnSummary.primaryBottleneckTitle}>
            {bnSummary.primaryBottleneckTitle
              ? `Top: ${bnSummary.primaryBottleneckTitle}`
              : "Workflows flowing smoothly"}
          </p>
        </div>
      </div>

      {/* Interactive Navigation & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--color-surface-hover)] p-1 border border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "all"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            All Intelligence
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("health")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "health"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Health & Risk
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("critical-path")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "critical-path"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Critical Path
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bottlenecks")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "bottlenecks"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Bottlenecks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "team"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Team Capacity
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("simulate")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "simulate"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            What-If Simulate
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("forecast")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "forecast"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Forecast
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scope")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "scope"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Scope
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("replanning")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "replanning"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Replanning
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            History & Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("decisions")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "decisions"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Decisions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("replay")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "replay"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Replay
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("diagnosis")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "diagnosis"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Diagnosis
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("autopsy")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "autopsy"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Autopsy
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedTaskId && (
            <button
              type="button"
              onClick={() => setSelectedTaskId(null)}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand)] border border-[var(--color-brand-border)] hover:bg-[var(--color-brand)]/20"
            >
              Clear Selection (1 Task) ✕
            </button>
          )}

          <button
            type="button"
            onClick={() => void loadIntelligence(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            <FiRefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Intelligence Views */}

      {/* 1. Health & Risk Overview */}
      {(activeTab === "all" || activeTab === "health") && (
        <div className="space-y-4">
          {healthData && <ProjectHealthScorecard healthData={healthData} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {driftData && <ScheduleDriftCard driftData={driftData} />}
            <DeadlineRiskPanel
              deadlineRisks={deadlineRisks}
              selectedTaskId={selectedTaskId}
              onSelectTask={(id) => setSelectedTaskId(id)}
            />
          </div>

          {preMortemData && (
            <PreMortemPanel
              preMortemData={preMortemData}
              onSelectTask={(id) => setSelectedTaskId(id)}
            />
          )}
        </div>
      )}

      {/* 2. Critical Path Graph View */}
      {(activeTab === "all" || activeTab === "critical-path") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <FiClock className="w-4 h-4 text-blue-500" />
              Critical Path Sequence
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Interactive topological view
            </span>
          </div>
          <CriticalPathGraph
            data={criticalPathData}
            selectedTaskId={selectedTaskId}
            onSelectTask={(id) => setSelectedTaskId(id)}
          />
        </div>
      )}

      {/* 3. Bottleneck Radar View */}
      {(activeTab === "all" || activeTab === "bottlenecks") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <FiZap className="w-4 h-4 text-orange-500" />
              Bottleneck Radar & Root Causes
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Ranked constraint analysis
            </span>
          </div>
          <BottleneckRadar
            data={bottleneckData}
            selectedTaskId={selectedTaskId}
            onSelectTask={(id) => setSelectedTaskId(id)}
          />
        </div>
      )}

      {/* 4. Team Capacity & Knowledge Risk View */}
      {(activeTab === "all" || activeTab === "team") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamWorkloadPanel teamWorkloadData={teamWorkloadData} />
          <KnowledgeRiskPanel knowledgeRiskData={knowledgeRiskData} />
        </div>
      )}

      {/* 5. What-If Simulation View */}
      {(activeTab === "all" || activeTab === "simulate") && (
        <div className="space-y-4">
          <ScenarioBuilder
            tasks={overviewData?.digitalTwin?.tasks?.items || []}
            members={overviewData?.digitalTwin?.team?.members || []}
            onSimulate={handleSimulate}
            isLoading={isSimulating}
          />
          {simulationResult && (
            <ScenarioResults
              simulationResult={simulationResult}
              onReset={() => setSimulationResult(null)}
            />
          )}
        </div>
      )}

      {/* 6. Intelligent Replanning View */}
      {(activeTab === "all" || activeTab === "replanning") && (
        <div className="space-y-4">
          {executionSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
              <span>{executionSuccess}</span>
              <button
                type="button"
                onClick={() => setExecutionSuccess(null)}
                className="text-xs font-semibold hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}
          <ReplanningPanel
            proposals={proposals}
            onGenerate={handleGenerateReplanning}
            onPreview={(p) => setActiveProposalForPreview(p)}
            onApprove={handleApproveProposal}
            onReject={handleRejectProposal}
            isLoading={isLoadingProposals}
          />
        </div>
      )}

      {/* 6B. Schedule Forecast View */}
      {activeTab === "forecast" && (
        <div className="space-y-4">
          <ProjectForecastPanel projectId={projectId} />
        </div>
      )}

      {/* 6C. Scope Creep Intelligence View */}
      {activeTab === "scope" && (
        <div className="space-y-4">
          <ScopeIntelligencePanel projectId={projectId} />
        </div>
      )}

      {/* 7. Historical Health & Timeline View */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <ProjectHealthHistory projectId={projectId} />
          <ProjectHistoryTimeline projectId={projectId} />
        </div>
      )}

      {/* 8. Decision Intelligence View */}
      {activeTab === "decisions" && (
        <div className="space-y-4">
          <DecisionIntelligencePanel projectId={projectId} />
        </div>
      )}

      {/* 9. Time-Travel Replay View */}
      {activeTab === "replay" && (
        <div className="space-y-4">
          <ProjectReplay projectId={projectId} />
        </div>
      )}

      {/* 10. Diagnosis View */}
      {activeTab === "diagnosis" && (
        <div className="space-y-4">
          <ProjectDiagnosisPanel projectId={projectId} />
        </div>
      )}

      {/* 11. Autopsy & Retrospective View */}
      {activeTab === "autopsy" && (
        <div className="space-y-4">
          <ProjectAutopsy projectId={projectId} />
        </div>
      )}

      {/* Proposal Preview & Confirmation Modal */}
      {activeProposalForPreview && (
        <ProposalPreview
          proposal={activeProposalForPreview}
          onClose={() => setActiveProposalForPreview(null)}
          onConfirmExecution={handleConfirmExecution}
          isExecuting={isExecutingProposal}
          error={proposalError}
        />
      )}
    </div>
  );
}
