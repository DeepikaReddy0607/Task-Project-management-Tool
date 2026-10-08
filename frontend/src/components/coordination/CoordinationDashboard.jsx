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
import PageHeader from "../ui/PageHeader";
import Card from "../ui/Card";
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
    <div className={`space-y-6 ${className}`}>
      {/* Page Header with Workspace & Project Selectors */}
      <PageHeader
        title="Coordination & Executive Workflows"
        description="Autonomous daily briefings, intelligent action plans, automated standups, and approval governance."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                Workspace:
              </span>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => {
                  setSelectedWorkspaceId(e.target.value);
                  setSelectedProjectId("");
                }}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                Project:
              </span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
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
        }
      />

      {/* Coordination State Status Bar */}
      {coordinationState && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)] tracking-wider">
              Coordination State
            </div>
            <div className="text-base font-bold text-[var(--color-text)] mt-1 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  coordinationState.status === "HEALTHY" || coordinationState.state === "HEALTHY"
                    ? "bg-emerald-500"
                    : coordinationState.status === "CRITICAL" || coordinationState.state === "CRITICAL"
                    ? "bg-rose-500"
                    : "bg-amber-500"
                }`}
              />
              {coordinationState.status || coordinationState.state || "ACTIVE"}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)] tracking-wider">
              Immediate Actions
            </div>
            <div className="text-base font-bold text-[var(--color-brand)] mt-1">
              {coordinationState.actionQueue?.length || coordinationState.urgentActionsCount || 0} Queued
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)] tracking-wider">
              Active Blockers
            </div>
            <div className="text-base font-bold text-[var(--color-danger)] mt-1">
              {coordinationState.blockerQueue?.length || coordinationState.blockersCount || 0} Escalated
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)] tracking-wider">
              Pending Approvals
            </div>
            <div className="text-base font-bold text-[var(--color-sun)] mt-1">
              {coordinationState.approvalQueue?.length || coordinationState.pendingApprovalsCount || 0} Pending
            </div>
          </Card>
        </div>
      )}

      {/* Main Suite Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
        {[
          { id: "briefing", label: "Daily Briefing", icon: FiSun },
          { id: "actions", label: "Next Actions & Plans", icon: FiTarget },
          { id: "standup", label: "Automated Standup", icon: FiMessageSquare },
          { id: "approvals", label: "Approval Center", icon: FiShield },
          ...(selectedProjectId
            ? [{ id: "stakeholder", label: "Stakeholder Report", icon: FiFileText }]
            : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                isActive
                  ? "bg-[var(--color-brand)] text-white shadow-xs"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
              }`}
            >
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
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
