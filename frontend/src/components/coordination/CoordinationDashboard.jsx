import { useState, useEffect, useCallback } from "react";
import {
  FiGrid,
  FiSun,
  FiTarget,
  FiMessageSquare,
  FiShield,
  FiFileText,
  FiRefreshCw,
  FiLayers,
  FiFolder,
  FiCheckCircle,
  FiAlertTriangle,
  FiActivity
} from "react-icons/fi";
import DailyBriefingPanel from "./DailyBriefingPanel";
import StandupPanel from "./StandupPanel";
import ApprovalCenter from "./ApprovalCenter";
import ActionPlanPanel from "./ActionPlanPanel";
import StakeholderBriefingPanel from "./StakeholderBriefingPanel";
import { getWorkspaces } from "../../services/api/workspaceApi";
import { getProjects } from "../../services/api/projectApi";
import { getProjectCoordination, getWorkspaceCoordination } from "../../services/api/intelligenceApi";

export default function CoordinationDashboard({ initialProjectId, initialWorkspaceId, className = "" }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId || "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || "");
  const [activeTab, setActiveTab] = useState("briefing"); // 'briefing' | 'actions' | 'standup' | 'approvals' | 'stakeholder'
  const [coordinationState, setCoordinationState] = useState(null);
  const [loadingState, setLoadingState] = useState(false);

  // Load workspaces on mount
  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const res = await getWorkspaces();
        const list = res?.workspaces || res?.data?.workspaces || res?.data || (Array.isArray(res) ? res : []);
        setWorkspaces(list);
        if (!selectedWorkspaceId && list.length > 0) {
          setSelectedWorkspaceId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load workspaces for coordination:", err);
      }
    }
    loadWorkspaces();
  }, [selectedWorkspaceId]);

  // Load projects whenever workspace changes
  useEffect(() => {
    async function loadProjects() {
      if (!selectedWorkspaceId) return;
      try {
        const res = await getProjects(selectedWorkspaceId);
        const list = res?.projects || res?.data?.projects || res?.data || (Array.isArray(res) ? res : []);
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    }
    loadProjects();
  }, [selectedWorkspaceId, selectedProjectId]);

  // Load high-level coordination state
  const fetchCoordinationState = useCallback(async () => {
    if (!selectedProjectId && !selectedWorkspaceId) return;
    try {
      setLoadingState(true);
      let res;
      if (selectedProjectId) {
        res = await getProjectCoordination(selectedProjectId);
      } else if (selectedWorkspaceId) {
        res = await getWorkspaceCoordination(selectedWorkspaceId);
      }
      setCoordinationState(res?.data || null);
    } catch (err) {
      console.warn("Could not fetch coordination state summary:", err);
    } finally {
      setLoadingState(false);
    }
  }, [selectedProjectId, selectedWorkspaceId]);

  useEffect(() => {
    fetchCoordinationState();
  }, [fetchCoordinationState]);

  return (
    <div className={`p-4 md:p-8 max-w-7xl mx-auto space-y-6 ${className}`}>
      {/* Top Banner / Hero */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 rounded-3xl bg-gradient-to-r from-zinc-900 via-zinc-800 to-indigo-950 text-white shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-400 bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              Phase 6 Architecture
            </span>
            <span className="text-xs text-zinc-400">Autonomous Project Coordination</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Coordination & Executive Control Suite
          </h1>
          <p className="text-xs md:text-sm text-zinc-300 max-w-2xl leading-relaxed">
            Autonomous daily briefings, 0-100 deterministic action plans, 5-vector standups, and approval governance with zero silent mutations.
          </p>
        </div>

        {/* Workspace & Project Selectors */}
        <div className="flex flex-wrap items-center gap-3 bg-white/10 p-3 rounded-2xl border border-white/10 backdrop-blur-md">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 block">Workspace</label>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => {
                setSelectedWorkspaceId(e.target.value);
                setSelectedProjectId("");
              }}
              className="bg-zinc-800 text-white text-xs font-semibold rounded-xl px-3 py-1.5 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 block">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-zinc-800 text-white text-xs font-semibold rounded-xl px-3 py-1.5 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Entire Workspace —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Coordination State Status Bar */}
      {coordinationState && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400">Coordination State</div>
            <div className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-1 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${
                coordinationState.status === "HEALTHY" || coordinationState.state === "HEALTHY" ? "bg-emerald-500" :
                coordinationState.status === "CRITICAL" || coordinationState.state === "CRITICAL" ? "bg-rose-500" :
                "bg-amber-500"
              }`} />
              {coordinationState.status || coordinationState.state || "ACTIVE"}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400">Immediate Actions</div>
            <div className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
              {coordinationState.actionQueue?.length || coordinationState.urgentActionsCount || 0} Queued
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400">Active Blockers</div>
            <div className="text-base font-extrabold text-rose-600 dark:text-rose-400 mt-1">
              {coordinationState.blockerQueue?.length || coordinationState.blockersCount || 0} Escalated
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400">Pending Approvals</div>
            <div className="text-base font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {coordinationState.approvalQueue?.length || coordinationState.pendingApprovalsCount || 0} Pending
            </div>
          </div>
        </div>
      )}

      {/* Main Suite Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("briefing")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "briefing"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <FiSun size={15} /> Daily Briefing
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("actions")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "actions"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <FiTarget size={15} /> Next Actions & Plans
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("standup")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "standup"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <FiMessageSquare size={15} /> Automated Standup
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "approvals"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <FiShield size={15} /> Approval Center
        </button>

        {selectedProjectId && (
          <button
            type="button"
            onClick={() => setActiveTab("stakeholder")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "stakeholder"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <FiFileText size={15} /> Stakeholder Report
          </button>
        )}
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === "briefing" && (
          <DailyBriefingPanel
            projectId={selectedProjectId}
            workspaceId={selectedWorkspaceId}
          />
        )}

        {activeTab === "actions" && (
          <ActionPlanPanel
            projectId={selectedProjectId}
            workspaceId={selectedWorkspaceId}
          />
        )}

        {activeTab === "standup" && (
          <StandupPanel
            projectId={selectedProjectId}
            workspaceId={selectedWorkspaceId}
          />
        )}

        {activeTab === "approvals" && (
          <ApprovalCenter
            workspaceId={selectedWorkspaceId}
            projectId={selectedProjectId}
          />
        )}

        {activeTab === "stakeholder" && selectedProjectId && (
          <StakeholderBriefingPanel
            projectId={selectedProjectId}
          />
        )}
      </div>
    </div>
  );
}
