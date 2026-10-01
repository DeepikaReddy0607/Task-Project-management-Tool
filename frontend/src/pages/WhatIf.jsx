import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
    FiActivity,
    FiAlertCircle,
    FiAlertTriangle,
    FiArrowRight,
    FiCalendar,
    FiCheck,
    FiCheckCircle,
    FiClock,
    FiFolder,
    FiInfo,
    FiLayers,
    FiLock,
    FiPlus,
    FiRefreshCw,
    FiShield,
    FiTrash2,
    FiTrendingDown,
    FiTrendingUp,
    FiUnlock,
    FiUser,
    FiUsers,
    FiZap
} from "react-icons/fi";
import { TbCrystalBall } from "react-icons/tb";
import MainLayout from "../layouts/MainLayout";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { getWorkspaces } from "../services/api/workspaceApi";
import { getProjects, getProjectMembers, getProjectRisk, simulateProjectWhatIf } from "../services/api/projectApi";
import { getProjectTasks } from "../services/api/taskApi";
import { useAssistantContext } from "../context/AssistantContext";

// Risk badge styling
const riskBadges = {
    LOW: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)] border-[color-mix(in_srgb,var(--color-brand)_25%,transparent)]",
    MEDIUM: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_25%,transparent)]",
    HIGH: "bg-[var(--color-peach-soft)] text-[var(--color-peach)] border-[color-mix(in_srgb,var(--color-peach)_25%,transparent)]",
    CRITICAL: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_25%,transparent)]"
};

// Supported Scenarios
const SCENARIOS = [
    {
        id: "complete_task",
        title: "Complete Task",
        icon: FiCheckCircle,
        desc: "Simulate finishing a task and measure schedule, completion, and blocker impacts."
    },
    {
        id: "change_priority",
        title: "Change Priority",
        icon: FiTrendingUp,
        desc: "Simulate elevating or lowering a task priority and see the priority queue shift."
    },
    {
        id: "change_deadline",
        title: "Move Deadline",
        icon: FiClock,
        desc: "Simulate extending or expediting project or task deadlines."
    },
    {
        id: "resolve_blocker",
        title: "Resolve Blocker",
        icon: FiShield,
        desc: "Simulate resolving dependency bottlenecks to unblock downstream work."
    },
    {
        id: "reassign_task",
        title: "Reassign Task",
        icon: FiUsers,
        desc: "Simulate reallocating work to rebalance team workload concentration."
    },
    {
        id: "multi",
        title: "Multiple Changes",
        icon: FiLayers,
        desc: "Combine multiple hypothetical adjustments into a single compound simulation."
    }
];

export default function WhatIf() {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { setPageContext } = useAssistantContext();

    // 1. Projects & Workspaces
    const [projects, setProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [projectsError, setProjectsError] = useState(null);
    const [selectedProjectId, setSelectedProjectId] = useState("");

    // 2. Project Data
    const [projectTasks, setProjectTasks] = useState([]);
    const [projectMembers, setProjectMembers] = useState([]);
    const [projectSnapshot, setProjectSnapshot] = useState(null);
    const [loadingProjectData, setLoadingProjectData] = useState(false);

    // 3. Scenario Selection & Inputs
    const [selectedScenario, setSelectedScenario] = useState("complete_task");

    // Inputs for single scenario
    const [selectedTaskId, setSelectedTaskId] = useState("");
    const [selectedPriority, setSelectedPriority] = useState("High");
    const [deadlineToChange, setDeadlineToChange] = useState("project"); // 'project' | 'task'
    const [daysOffset, setDaysOffset] = useState(3);
    const [customDate, setCustomDate] = useState("");
    const [selectedAssigneeId, setSelectedAssigneeId] = useState("");

    // Compound scenario builder (for 'multi')
    const [multiChanges, setMultiChanges] = useState([]);

    // 4. Simulation Execution & Results
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationResult, setSimulationResult] = useState(null);
    const [simulationError, setSimulationError] = useState(null);

    // 5. Session-only Simulation History (React state only, not in DB)
    const [recentSimulations, setRecentSimulations] = useState([]);

    // Update Quackie context
    useEffect(() => {
        const p = projects.find((item) => item.id === selectedProjectId);
        setPageContext({
            page: "what-if",
            projectId: selectedProjectId || null,
            projectTitle: p?.title || null
        });
    }, [selectedProjectId, projects, setPageContext]);

    // Load accessible projects across all user workspaces
    const loadAllProjects = useCallback(async () => {
        setLoadingProjects(true);
        setProjectsError(null);
        try {
            const wsRes = await getWorkspaces();
            const workspaceList = wsRes?.workspaces || (Array.isArray(wsRes) ? wsRes : []);

            if (workspaceList.length === 0) {
                setProjects([]);
                setSelectedProjectId("");
                return;
            }

            let hasProjectError = false;
            const projectsNested = await Promise.all(
                workspaceList.map(async (ws) => {
                    try {
                        const projRes = await getProjects(ws.id);
                        const list = projRes?.projects || (Array.isArray(projRes) ? projRes : []);
                        return list.map((p) => ({
                            ...p,
                            workspaceTitle: ws.title,
                            workspaceId: ws.id
                        }));
                    } catch (err) {
                        console.error(`Failed to load projects for workspace ${ws.id}:`, err);
                        hasProjectError = true;
                        return [];
                    }
                })
            );

            const flattened = projectsNested.flat();

            if (flattened.length === 0 && hasProjectError) {
                setProjectsError("Unable to load projects. Please try again.");
                setProjects([]);
                setSelectedProjectId("");
                return;
            }

            setProjects(flattened);

            // Check prefill from URL param or location.state
            const paramProjId = searchParams.get("projectId") || location.state?.projectId;
            if (paramProjId && flattened.some((p) => p.id === paramProjId)) {
                setSelectedProjectId(paramProjId);
            } else if (flattened.length > 0) {
                setSelectedProjectId((prev) => (flattened.some((p) => p.id === prev) ? prev : flattened[0].id));
            } else {
                setSelectedProjectId("");
            }

            // Check scenario / task prefill
            const paramScenario = searchParams.get("scenario") || location.state?.scenario;
            if (paramScenario && SCENARIOS.some((s) => s.id === paramScenario)) {
                setSelectedScenario(paramScenario);
            }
            const paramTaskId = searchParams.get("taskId") || location.state?.taskId;
            if (paramTaskId) {
                setSelectedTaskId(paramTaskId);
            }
        } catch (err) {
            console.error("Failed to load projects for What-If:", err);
            setProjectsError("Unable to load projects. Please try again.");
            setProjects([]);
            setSelectedProjectId("");
        } finally {
            setLoadingProjects(false);
        }
    }, [searchParams, location.state]);

    useEffect(() => {
        void loadAllProjects();
    }, [loadAllProjects]);

    // Load active tasks, members, and snapshot risk metrics when project changes
    const loadProjectDetails = useCallback(async (projId) => {
        if (!projId) {
            setProjectTasks([]);
            setProjectMembers([]);
            setProjectSnapshot(null);
            return;
        }

        setLoadingProjectData(true);
        setSimulationError(null);
        try {
            const [tasksRes, membersRes, riskRes] = await Promise.all([
                getProjectTasks(projId).catch((err) => {
                    console.error("Failed to load project tasks:", err);
                    return null;
                }),
                getProjectMembers(projId).catch((err) => {
                    console.error("Failed to load project members:", err);
                    return null;
                }),
                getProjectRisk(projId).catch((err) => {
                    console.error("Failed to load project risk:", err);
                    return null;
                })
            ]);

            const rawTasks = tasksRes?.tasks || (Array.isArray(tasksRes) ? tasksRes : []);
            const activeTasks = rawTasks.filter((t) => !t.is_archived);
            setProjectTasks(activeTasks);

            const rawMembers = membersRes?.members || (Array.isArray(membersRes) ? membersRes : []);
            const normalizedMembers = rawMembers.map((m) => {
                const uId = m.user?.id || m.users?.id || m.user_id || m.userId;
                const uFirst = m.user?.first_name || m.users?.first_name || m.first_name || "Member";
                const uLast = m.user?.last_name || m.users?.last_name || m.last_name || "";
                const roleName = m.role || m.roles?.name || "Contributor";
                return {
                    id: m.id || uId,
                    userId: uId,
                    user: {
                        id: uId,
                        first_name: uFirst,
                        last_name: uLast
                    },
                    role: roleName
                };
            });
            setProjectMembers(normalizedMembers);

            const rawRisk = riskRes?.risk || riskRes?.riskAnalysis || riskRes;
            if (rawRisk && (rawRisk.riskLevel !== undefined || rawRisk.metrics)) {
                const metrics = rawRisk.metrics || {};
                setProjectSnapshot({
                    riskLevel: rawRisk.riskLevel || "LOW",
                    riskScore: rawRisk.riskScore ?? 0,
                    completionPercentage: rawRisk.completionPercentage ?? metrics.completionPercentage ?? 0,
                    totalTasks: rawRisk.totalTasks ?? metrics.totalTasks ?? 0,
                    completedTasks: rawRisk.completedTasks ?? metrics.completedTasks ?? 0,
                    activeTasks: rawRisk.activeTasks ?? metrics.incompleteTasks ?? (metrics.totalTasks ? metrics.totalTasks - (metrics.completedTasks || 0) : 0),
                    overdueTasks: rawRisk.overdueTasks ?? metrics.overdueTasks ?? 0,
                    activeBlockers: rawRisk.activeBlockers ?? metrics.activeBlockers ?? 0,
                    blockedTasks: rawRisk.blockedTasks ?? metrics.blockedTasks ?? 0,
                    daysUntilDeadline: rawRisk.daysUntilDeadline ?? metrics.daysUntilDeadline ?? null,
                    isDeadlinePassed: rawRisk.isDeadlinePassed ?? metrics.isDeadlinePassed ?? false,
                    primaryRisk: rawRisk.primaryRisk || metrics.primaryRisk || null
                });
            } else {
                setProjectSnapshot(null);
            }

            // Auto-select first active task if current is invalid
            if (activeTasks.length > 0) {
                setSelectedTaskId((prev) => (activeTasks.some((t) => t.id === prev) ? prev : activeTasks[0].id));
            } else {
                setSelectedTaskId("");
            }

            if (normalizedMembers.length > 0) {
                setSelectedAssigneeId((prev) => (normalizedMembers.some((m) => m.user?.id === prev) ? prev : normalizedMembers[0].user?.id || ""));
            } else {
                setSelectedAssigneeId("");
            }
        } catch (err) {
            console.error("Error loading project details:", err);
            setSimulationError("Failed to fetch project details. Please try again.");
        } finally {
            setLoadingProjectData(false);
        }
    }, []);

    useEffect(() => {
        if (selectedProjectId) {
            void loadProjectDetails(selectedProjectId);
        }
    }, [selectedProjectId, loadProjectDetails]);

    // Currently selected project entity
    const currentProject = useMemo(() => {
        return projects.find((p) => p.id === selectedProjectId) || null;
    }, [projects, selectedProjectId]);

    // Blocker tasks in the project (tasks that are prerequisite for other tasks)
    const blockerCandidates = useMemo(() => {
        return projectTasks.filter((t) => t.status !== "Completed");
    }, [projectTasks]);

    // Run Simulation
    const handleRunSimulation = async () => {
        if (!selectedProjectId) {
            setSimulationError("Please select a project to simulate.");
            return;
        }

        setSimulationError(null);
        setIsSimulating(true);

        try {
            let payload = { scenario: selectedScenario };

            if (selectedScenario === "complete_task") {
                if (!selectedTaskId) {
                    setSimulationError("Please select a task to complete.");
                    setIsSimulating(false);
                    return;
                }
                payload.taskId = selectedTaskId;
            } else if (selectedScenario === "change_priority") {
                if (!selectedTaskId) {
                    setSimulationError("Please select a task.");
                    setIsSimulating(false);
                    return;
                }
                payload.taskId = selectedTaskId;
                payload.priority = selectedPriority;
            } else if (selectedScenario === "change_deadline") {
                if (deadlineToChange === "task") {
                    if (!selectedTaskId) {
                        setSimulationError("Please select a task to shift deadline.");
                        setIsSimulating(false);
                        return;
                    }
                    payload.taskId = selectedTaskId;
                }
                if (customDate) {
                    payload.newDate = customDate;
                } else {
                    payload.daysOffset = Number(daysOffset);
                }
            } else if (selectedScenario === "resolve_blocker") {
                if (selectedTaskId) {
                    payload.taskId = selectedTaskId;
                }
            } else if (selectedScenario === "reassign_task") {
                if (!selectedTaskId) {
                    setSimulationError("Please select a task to reassign.");
                    setIsSimulating(false);
                    return;
                }
                const targetMember = projectMembers.find((m) => m.user?.id === selectedAssigneeId);
                payload.taskId = selectedTaskId;
                payload.assigneeId = selectedAssigneeId || null;
                payload.assigneeName = targetMember ? `${targetMember.user?.first_name || ""} ${targetMember.user?.last_name || ""}`.trim() : null;
            } else if (selectedScenario === "multi") {
                if (multiChanges.length === 0) {
                    setSimulationError("Please add at least one hypothetical change to simulate.");
                    setIsSimulating(false);
                    return;
                }
                payload.scenario = "multi";
                payload.changes = multiChanges;
            }

            // Call existing What-If API endpoint
            const res = await simulateProjectWhatIf(selectedProjectId, payload);
            const sim = res.simulation;
            setSimulationResult(sim);

            // Add to session-only history (no database storage)
            const targetTask = projectTasks.find((t) => t.id === payload.taskId);
            let historyLabel = "";
            if (selectedScenario === "complete_task") {
                historyLabel = `Complete "${targetTask?.title || "Task"}"`;
            } else if (selectedScenario === "change_priority") {
                historyLabel = `Set "${targetTask?.title || "Task"}" to ${selectedPriority}`;
            } else if (selectedScenario === "change_deadline") {
                historyLabel = `Move deadline ${daysOffset >= 0 ? `+${daysOffset}` : daysOffset} days`;
            } else if (selectedScenario === "resolve_blocker") {
                historyLabel = `Resolve blocker "${targetTask?.title || "Primary Blocker"}"`;
            } else if (selectedScenario === "reassign_task") {
                historyLabel = `Reassign "${targetTask?.title || "Task"}"`;
            } else {
                historyLabel = `Compound (${multiChanges.length} changes)`;
            }

            const historyEntry = {
                id: sim.simulationId || `sim_${Date.now()}`,
                label: historyLabel,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                baselineRisk: sim.baseline?.riskScore,
                projectedRisk: sim.projected?.riskScore,
                completionDelta: (sim.projected?.completionPercentage || 0) - (sim.baseline?.completionPercentage || 0),
                simData: sim
            };

            setRecentSimulations((prev) => [historyEntry, ...prev.slice(0, 7)]);
        } catch (err) {
            console.error("Simulation failed:", err);
            const msg = err.response?.data?.message || err.message || "Simulation failed. Please try again.";
            setSimulationError(msg);
        } finally {
            setIsSimulating(false);
        }
    };

    // Helper: Add change to compound multi list
    const handleAddMultiChange = (change) => {
        setMultiChanges((prev) => [...prev, change]);
    };

    const handleRemoveMultiChange = (index) => {
        setMultiChanges((prev) => prev.filter((_, i) => i !== index));
    };

    return (
        <MainLayout>
            <div className="space-y-6 pb-12">
                {/* 1. PAGE HEADER */}
                <PageHeader
                    title="🔮 What-If Simulator"
                    description="Explore possible project outcomes without changing your actual TaskFlow data."
                    actions={
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand)] bg-[var(--color-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-hover)] shadow-xs">
                                <FiLock size={12} />
                                🔒 Simulation only
                            </span>
                        </div>
                    }
                />

                {/* SAFETY NOTICE BANNER */}
                <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--color-brand)_20%,transparent)] bg-[var(--color-surface-sage)]/60 p-3.5 text-xs text-[var(--color-brand-hover)] shadow-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <FiLock className="shrink-0 text-[var(--color-brand)]" size={15} />
                        <span>
                            <strong>Safety Guarantee:</strong> Nothing will be changed in your projects, tasks, deadlines, assignments, or risks. All computations are strictly read-only and performed in memory.
                        </span>
                    </div>
                </div>

                {/* PROJECTS ERROR BANNER */}
                {projectsError && (
                    <div className="rounded-[var(--radius-xl)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)] shadow-xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <FiAlertCircle className="shrink-0" size={16} />
                            <span>{projectsError}</span>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void loadAllProjects()}
                            className="!py-1.5 !px-3 !text-xs"
                        >
                            <FiRefreshCw size={12} className="mr-1.5" />
                            Retry
                        </Button>
                    </div>
                )}

                {/* ERROR ALERT */}
                {simulationError && (
                    <div className="rounded-[var(--radius-xl)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)] shadow-xs flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                            <FiAlertCircle className="mt-0.5 shrink-0" size={16} />
                            <span>{simulationError}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSimulationError(null)}
                            className="text-xs font-semibold underline hover:opacity-80"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* 2. PROJECT SELECTION BAR & CURRENT SNAPSHOT */}
                <Card className="!p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex-1 max-w-xl">
                            <label htmlFor="whatif-project-select" className="block text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)] mb-1.5">
                                Select Project to Simulate
                            </label>
                            <div className="relative">
                                <select
                                    id="whatif-project-select"
                                    value={selectedProjectId}
                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                    disabled={loadingProjects || !!projectsError}
                                    className="w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 pr-10 text-sm font-medium text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)] disabled:opacity-50"
                                >
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.title} ({p.workspaceTitle || "Workspace"})
                                        </option>
                                    ))}
                                    {loadingProjects && <option value="">Loading projects...</option>}
                                    {!loadingProjects && projectsError && (
                                        <option value="">Unable to load projects. Please try again.</option>
                                    )}
                                    {!loadingProjects && !projectsError && projects.length === 0 && (
                                        <option value="">No projects available</option>
                                    )}
                                </select>
                                <FiFolder className="pointer-events-none absolute right-3.5 top-3 text-[var(--color-text-subtle)]" size={16} />
                            </div>
                        </div>

                        {currentProject && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => loadProjectDetails(selectedProjectId)}
                                    disabled={loadingProjectData}
                                    className="!py-2 !text-xs"
                                >
                                    <FiRefreshCw size={13} className={loadingProjectData ? "animate-spin" : ""} />
                                    Refresh Data
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* CURRENT PROJECT SNAPSHOT */}
                    {loadingProjectData ? (
                        <div className="mt-5 flex items-center justify-center py-6 text-sm text-[var(--color-text-muted)]">
                            <FiRefreshCw className="mr-2 animate-spin text-[var(--color-brand)]" />
                            Loading real project baseline metrics...
                        </div>
                    ) : projectSnapshot ? (
                        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)] mb-3">
                                Current Project Snapshot (Real Data)
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                {/* 1. Risk */}
                                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                    <span className="text-[11px] text-[var(--color-text-subtle)] block">Risk Level</span>
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                        <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold border ${riskBadges[projectSnapshot.riskLevel] || ""}`}>
                                            {projectSnapshot.riskLevel}
                                        </span>
                                        <span className="text-xs font-semibold text-[var(--color-text)]">
                                            {projectSnapshot.riskScore}/100
                                        </span>
                                    </div>
                                </div>

                                {/* 2. Completion */}
                                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                    <span className="text-[11px] text-[var(--color-text-subtle)] block">Completion</span>
                                    <div className="mt-1 text-sm font-bold text-[var(--color-text)]">
                                        {projectSnapshot.completionPercentage}%
                                    </div>
                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                        {projectSnapshot.completedTasks}/{projectSnapshot.totalTasks} tasks
                                    </span>
                                </div>

                                {/* 3. Active Tasks */}
                                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                    <span className="text-[11px] text-[var(--color-text-subtle)] block">Active Tasks</span>
                                    <div className="mt-1 text-sm font-bold text-[var(--color-text)]">
                                        {projectSnapshot.activeTasks}
                                    </div>
                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                        {projectTasks.length} in progress
                                    </span>
                                </div>

                                {/* 4. Overdue Tasks */}
                                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                    <span className="text-[11px] text-[var(--color-text-subtle)] block">Overdue</span>
                                    <div className={`mt-1 text-sm font-bold ${projectSnapshot.overdueTasks > 0 ? "text-[var(--color-danger)] font-extrabold" : "text-[var(--color-text)]"}`}>
                                        {projectSnapshot.overdueTasks}
                                    </div>
                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                        {projectSnapshot.overdueTasks > 0 ? "Urgent attention" : "On schedule"}
                                    </span>
                                </div>

                                {/* 5. Blockers */}
                                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                    <span className="text-[11px] text-[var(--color-text-subtle)] block">Blockers</span>
                                    <div className={`mt-1 text-sm font-bold ${projectSnapshot.activeBlockers > 0 ? "text-[var(--color-peach)]" : "text-[var(--color-text)]"}`}>
                                        {projectSnapshot.activeBlockers}
                                    </div>
                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                        {projectSnapshot.blockedTasks} blocked tasks
                                    </span>
                                </div>

                                {/* 6. Deadline */}
                                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                                    <span className="text-[11px] text-[var(--color-text-subtle)] block">Deadline</span>
                                    <div className="mt-1 text-sm font-bold text-[var(--color-text)] truncate">
                                        {projectSnapshot.daysUntilDeadline !== null
                                            ? projectSnapshot.isDeadlinePassed
                                                ? `${Math.abs(projectSnapshot.daysUntilDeadline)}d passed`
                                                : `${projectSnapshot.daysUntilDeadline}d left`
                                            : "No deadline"}
                                    </div>
                                    <span className="text-[10px] text-[var(--color-text-muted)] truncate block">
                                        {currentProject?.end_date ? new Date(currentProject.end_date).toLocaleDateString() : "Open ended"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Card>

                {/* 3. SCENARIO SELECTION & INPUT SECTION */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* SCENARIO PICKER (LEFT COLUMN) */}
                    <div className="lg:col-span-7 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-[var(--font-display)] text-base font-semibold text-[var(--color-text)]">
                                What do you want to simulate?
                            </h2>
                            <span className="text-xs text-[var(--color-text-muted)]">
                                Choose a scenario
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {SCENARIOS.map((sc) => {
                                const Icon = sc.icon;
                                const isSelected = selectedScenario === sc.id;
                                return (
                                    <button
                                        key={sc.id}
                                        type="button"
                                        onClick={() => setSelectedScenario(sc.id)}
                                        className={`flex flex-col text-left p-3.5 rounded-[var(--radius-xl)] border transition duration-150 ${
                                            isSelected
                                                ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]/50 shadow-xs ring-2 ring-[var(--color-brand)]/20"
                                                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-canvas-soft)]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg ${isSelected ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]"}`}>
                                                <Icon size={16} />
                                            </div>
                                            <span className="font-semibold text-sm text-[var(--color-text)]">
                                                {sc.title}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs text-[var(--color-text-muted)] leading-relaxed">
                                            {sc.desc}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>

                        {/* SCENARIO PARAMETERS FORM */}
                        <Card className="!p-5 border-t-4 border-t-[var(--color-brand)]">
                            <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
                                <TbCrystalBall className="text-[var(--color-brand)]" size={18} />
                                Configure Parameters: {SCENARIOS.find((s) => s.id === selectedScenario)?.title}
                            </h3>

                            {/* 1. COMPLETE TASK */}
                            {selectedScenario === "complete_task" && (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="task-select-complete" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            Task to mark as completed:
                                        </label>
                                        <select
                                            id="task-select-complete"
                                            value={selectedTaskId}
                                            onChange={(e) => setSelectedTaskId(e.target.value)}
                                            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                        >
                                            {projectTasks.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.title} ({t.priority} priority · {t.status})
                                                </option>
                                            ))}
                                            {projectTasks.length === 0 && <option value="">No tasks available in this project</option>}
                                        </select>
                                    </div>
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        Simulates marking this task completed in memory. Downstream tasks blocked by this task will become actionable, and project risk & completion will update.
                                    </p>
                                </div>
                            )}

                            {/* 2. CHANGE PRIORITY */}
                            {selectedScenario === "change_priority" && (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="task-select-priority" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            Select Task:
                                        </label>
                                        <select
                                            id="task-select-priority"
                                            value={selectedTaskId}
                                            onChange={(e) => setSelectedTaskId(e.target.value)}
                                            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                        >
                                            {projectTasks.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.title} (Current: {t.priority})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="priority-select" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            Hypothetical New Priority:
                                        </label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {["Low", "Medium", "High", "Critical"].map((prio) => (
                                                <button
                                                    key={prio}
                                                    type="button"
                                                    onClick={() => setSelectedPriority(prio)}
                                                    className={`py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                                                        selectedPriority === prio
                                                            ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-xs"
                                                            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-canvas-soft)]"
                                                    }`}
                                                >
                                                    {prio}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3. MOVE DEADLINE */}
                            {selectedScenario === "change_deadline" && (
                                <div className="space-y-4">
                                    <div>
                                        <span className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            What deadline are you moving?
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDeadlineToChange("project")}
                                                className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition ${
                                                    deadlineToChange === "project"
                                                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                                                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                                                }`}
                                            >
                                                Project Deadline ({currentProject?.end_date ? new Date(currentProject.end_date).toLocaleDateString() : "None"})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeadlineToChange("task")}
                                                className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition ${
                                                    deadlineToChange === "task"
                                                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                                                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                                                }`}
                                            >
                                                Specific Task Deadline
                                            </button>
                                        </div>
                                    </div>

                                    {deadlineToChange === "task" && (
                                        <div>
                                            <label htmlFor="task-select-deadline" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                                Select Task:
                                            </label>
                                            <select
                                                id="task-select-deadline"
                                                value={selectedTaskId}
                                                onChange={(e) => setSelectedTaskId(e.target.value)}
                                                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                            >
                                                {projectTasks.map((t) => (
                                                    <option key={t.id} value={t.id}>
                                                        {t.title} ({t.due_date ? new Date(t.due_date).toLocaleDateString() : "No date"})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="deadline-offset-select" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                                Shift by Days (+ / -):
                                            </label>
                                            <select
                                                id="deadline-offset-select"
                                                value={daysOffset}
                                                onChange={(e) => {
                                                    setDaysOffset(Number(e.target.value));
                                                    setCustomDate("");
                                                }}
                                                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                            >
                                                <option value={7}>+7 days (Extend by 1 week)</option>
                                                <option value={3}>+3 days (Extend schedule)</option>
                                                <option value={14}>+14 days (Extend by 2 weeks)</option>
                                                <option value={-3}>-3 days (Expedite / Compress)</option>
                                                <option value={-7}>-7 days (Expedite by 1 week)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="custom-date-input" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                                Or Pick Explicit Date:
                                            </label>
                                            <input
                                                id="custom-date-input"
                                                type="date"
                                                value={customDate}
                                                onChange={(e) => setCustomDate(e.target.value)}
                                                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 4. RESOLVE BLOCKER */}
                            {selectedScenario === "resolve_blocker" && (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="task-select-blocker" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            Select Blocker Task to Resolve:
                                        </label>
                                        <select
                                            id="task-select-blocker"
                                            value={selectedTaskId}
                                            onChange={(e) => setSelectedTaskId(e.target.value)}
                                            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                        >
                                            <option value="">-- Most Impactful Active Blocker (Auto-Detect) --</option>
                                            {blockerCandidates.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.title} ({t.priority} priority)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        Simulates removing the bottleneck caused by this prerequisite task. Downstream tasks will immediately transition to READY state.
                                    </p>
                                </div>
                            )}

                            {/* 5. REASSIGN TASK */}
                            {selectedScenario === "reassign_task" && (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="task-select-reassign" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            Select Task:
                                        </label>
                                        <select
                                            id="task-select-reassign"
                                            value={selectedTaskId}
                                            onChange={(e) => setSelectedTaskId(e.target.value)}
                                            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                        >
                                            {projectTasks.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="member-select-reassign" className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                                            Reassign to Team Member:
                                        </label>
                                        <select
                                            id="member-select-reassign"
                                            value={selectedAssigneeId}
                                            onChange={(e) => setSelectedAssigneeId(e.target.value)}
                                            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                                        >
                                            {projectMembers.map((m) => (
                                                <option key={m.user?.id} value={m.user?.id}>
                                                    {m.user?.first_name} {m.user?.last_name} ({m.role})
                                                </option>
                                            ))}
                                            {projectMembers.length === 0 && <option value="">No project members available</option>}
                                        </select>
                                    </div>
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        Tests how reallocating this task balances workload concentration across team members.
                                    </p>
                                </div>
                            )}

                            {/* 6. MULTIPLE CHANGES */}
                            {selectedScenario === "multi" && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider">
                                            Compound Changes ({multiChanges.length})
                                        </span>
                                    </div>

                                    {multiChanges.length > 0 ? (
                                        <div className="space-y-2">
                                            {multiChanges.map((ch, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5 text-xs text-[var(--color-text)]"
                                                >
                                                    <span className="font-medium">
                                                        {ch.type === "complete_task" && `✓ Complete task "${projectTasks.find((t) => t.id === ch.taskId)?.title || ch.taskId}"`}
                                                        {ch.type === "change_priority" && `Elevate "${projectTasks.find((t) => t.id === ch.taskId)?.title || ch.taskId}" to ${ch.priority}`}
                                                        {ch.type === "change_deadline" && `Move deadline ${ch.daysOffset >= 0 ? `+${ch.daysOffset}` : ch.daysOffset} days`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveMultiChange(idx)}
                                                        className="text-[var(--color-danger)] hover:underline p-1"
                                                    >
                                                        <FiTrash2 size={13} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-[var(--color-text-muted)]">
                                            No changes added yet. Use the buttons below to stage changes into this compound simulation.
                                        </p>
                                    )}

                                    <div className="border-t border-[var(--color-border)] pt-3 flex flex-wrap gap-2">
                                        {selectedTaskId && (
                                            <Button
                                                variant="secondary"
                                                className="!py-1.5 !text-xs"
                                                onClick={() => handleAddMultiChange({ type: "complete_task", taskId: selectedTaskId })}
                                            >
                                                <FiPlus size={12} />
                                                Add Complete Task
                                            </Button>
                                        )}
                                        {selectedTaskId && (
                                            <Button
                                                variant="secondary"
                                                className="!py-1.5 !text-xs"
                                                onClick={() => handleAddMultiChange({ type: "change_priority", taskId: selectedTaskId, priority: "Critical" })}
                                            >
                                                <FiPlus size={12} />
                                                Add Critical Priority
                                            </Button>
                                        )}
                                        <Button
                                            variant="secondary"
                                            className="!py-1.5 !text-xs"
                                            onClick={() => handleAddMultiChange({ type: "change_deadline", daysOffset: 5 })}
                                        >
                                            <FiPlus size={12} />
                                            Add +5 Days Extension
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* SIMULATE ACTION BUTTON */}
                            <div className="mt-6 border-t border-[var(--color-border)] pt-4 flex items-center justify-between">
                                <span className="text-xs text-[var(--color-text-subtle)] flex items-center gap-1">
                                    <FiLock size={12} /> Read-only calculation
                                </span>
                                <Button
                                    variant="primary"
                                    onClick={handleRunSimulation}
                                    disabled={isSimulating || !selectedProjectId}
                                    className="!px-6 !py-2.5 font-bold shadow-md"
                                >
                                    {isSimulating ? (
                                        <>
                                            <FiRefreshCw className="animate-spin" size={16} />
                                            Simulating...
                                        </>
                                    ) : (
                                        <>
                                            <TbCrystalBall size={18} />
                                            Simulate
                                        </>
                                    )}
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {/* RECENT SIMULATIONS (RIGHT COLUMN) */}
                    <div className="lg:col-span-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-[var(--font-display)] text-base font-semibold text-[var(--color-text)]">
                                Recent Simulations
                            </h2>
                            {recentSimulations.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setRecentSimulations([])}
                                    className="text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        <Card className="!p-4">
                            <span className="text-[11px] text-[var(--color-text-subtle)] block mb-3 uppercase tracking-wider font-semibold">
                                Session History (Memory Only)
                            </span>

                            {recentSimulations.length > 0 ? (
                                <div className="space-y-2.5">
                                    {recentSimulations.map((simItem) => (
                                        <div
                                            key={simItem.id}
                                            onClick={() => setSimulationResult(simItem.simData)}
                                            className="group cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3 transition hover:border-[var(--color-brand)] hover:shadow-xs"
                                        >
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-brand-hover)]">
                                                    {simItem.label}
                                                </span>
                                                <span className="text-[10px] text-[var(--color-text-subtle)]">
                                                    {simItem.timestamp}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                                                <span>
                                                    Risk: <strong>{simItem.baselineRisk}</strong> → <strong>{simItem.projectedRisk}</strong>
                                                </span>
                                                {simItem.completionDelta !== 0 && (
                                                    <span className={simItem.completionDelta > 0 ? "text-[var(--color-brand)] font-semibold" : ""}>
                                                        +{simItem.completionDelta}% completion
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                                    <TbCrystalBall size={24} className="mx-auto mb-2 text-[var(--color-text-subtle)] opacity-40" />
                                    No simulations run yet this session.
                                    <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
                                        Choose a scenario on the left and click Simulate.
                                    </p>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>

                {/* 4. SIMULATION RESULTS SECTION */}
                {simulationResult && (
                    <div className="mt-8 space-y-6 animate-fadeIn">
                        {/* RESULT HEADER */}
                        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white shadow-xs">
                                    <TbCrystalBall size={17} />
                                </span>
                                <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--color-text)]">
                                    What-If Result
                                </h2>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-sage)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-hover)]">
                                <FiCheck size={13} />
                                Simulation Complete
                            </span>
                        </div>

                        {/* APPLIED HYPOTHETICAL CHANGE CARD */}
                        <div className="rounded-[var(--radius-xl)] border border-[var(--color-brand)] bg-[var(--color-brand-soft)]/40 p-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-brand-hover)]">
                                Hypothetical Change Applied
                            </span>
                            <div className="mt-1.5 space-y-1">
                                {simulationResult.changes?.map((ch, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                                        <span className="text-[var(--color-brand)] font-bold">•</span>
                                        <span>{ch.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* COMPARISON METRICS: CURRENT → PROJECTED */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {/* 1. RISK SCORE */}
                            {(() => {
                                const base = simulationResult.baseline?.riskScore ?? 0;
                                const proj = simulationResult.projected?.riskScore ?? 0;
                                const diff = proj - base;
                                const improved = diff < 0;
                                const worsened = diff > 0;
                                return (
                                    <Card className="!p-4 border-l-4 border-l-[var(--color-brand)]">
                                        <span className="text-xs font-bold text-[var(--color-text-subtle)] uppercase">Project Risk</span>
                                        <div className="mt-3 flex items-center justify-between">
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Current</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {simulationResult.baseline?.riskLevel} {base}
                                                </span>
                                            </div>
                                            <FiArrowRight size={18} className="text-[var(--color-text-subtle)]" />
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Projected</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {simulationResult.projected?.riskLevel} {proj}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
                                            <span className={`font-bold px-2 py-0.5 rounded-md ${improved ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]" : worsened ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"}`}>
                                                {improved ? `IMPROVED (${diff} pts)` : worsened ? `WORSENED (+${diff} pts)` : "UNCHANGED"}
                                            </span>
                                        </div>
                                    </Card>
                                );
                            })()}

                            {/* 2. COMPLETION PERCENTAGE */}
                            {(() => {
                                const base = simulationResult.baseline?.completionPercentage ?? 0;
                                const proj = simulationResult.projected?.completionPercentage ?? 0;
                                const diff = proj - base;
                                return (
                                    <Card className="!p-4 border-l-4 border-l-[var(--color-brand)]">
                                        <span className="text-xs font-bold text-[var(--color-text-subtle)] uppercase">Completion</span>
                                        <div className="mt-3 flex items-center justify-between">
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Current</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {base}%
                                                </span>
                                            </div>
                                            <FiArrowRight size={18} className="text-[var(--color-text-subtle)]" />
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Projected</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {proj}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
                                            <span className={`font-bold px-2 py-0.5 rounded-md ${diff > 0 ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"}`}>
                                                {diff > 0 ? `IMPROVED (+${diff}%)` : "UNCHANGED"}
                                            </span>
                                            <span className="text-[11px] text-[var(--color-text-muted)]">
                                                {simulationResult.projected?.completedTasks}/{simulationResult.projected?.totalTasks} tasks
                                            </span>
                                        </div>
                                    </Card>
                                );
                            })()}

                            {/* 3. ACTIVE BLOCKERS */}
                            {(() => {
                                const base = simulationResult.baseline?.activeBlockers ?? 0;
                                const proj = simulationResult.projected?.activeBlockers ?? 0;
                                const diff = proj - base;
                                const improved = diff < 0;
                                return (
                                    <Card className="!p-4 border-l-4 border-l-[var(--color-brand)]">
                                        <span className="text-xs font-bold text-[var(--color-text-subtle)] uppercase">Active Blockers</span>
                                        <div className="mt-3 flex items-center justify-between">
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Current</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {base}
                                                </span>
                                            </div>
                                            <FiArrowRight size={18} className="text-[var(--color-text-subtle)]" />
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Projected</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {proj}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
                                            <span className={`font-bold px-2 py-0.5 rounded-md ${improved ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"}`}>
                                                {improved ? `IMPROVED (${diff} blockers)` : "UNCHANGED"}
                                            </span>
                                        </div>
                                    </Card>
                                );
                            })()}

                            {/* 4. OVERDUE TASKS */}
                            {(() => {
                                const base = simulationResult.baseline?.overdueTasks ?? 0;
                                const proj = simulationResult.projected?.overdueTasks ?? 0;
                                const diff = proj - base;
                                const improved = diff < 0;
                                return (
                                    <Card className="!p-4 border-l-4 border-l-[var(--color-brand)]">
                                        <span className="text-xs font-bold text-[var(--color-text-subtle)] uppercase">Overdue Tasks</span>
                                        <div className="mt-3 flex items-center justify-between">
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Current</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {base}
                                                </span>
                                            </div>
                                            <FiArrowRight size={18} className="text-[var(--color-text-subtle)]" />
                                            <div>
                                                <span className="text-xs text-[var(--color-text-muted)] block">Projected</span>
                                                <span className="text-lg font-bold text-[var(--color-text)]">
                                                    {proj}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
                                            <span className={`font-bold px-2 py-0.5 rounded-md ${improved ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"}`}>
                                                {improved ? `IMPROVED (${diff})` : "UNCHANGED"}
                                            </span>
                                        </div>
                                    </Card>
                                );
                            })()}
                        </div>

                        {/* 5. IMPACT VISUALIZATION PIPELINE */}
                        <Card className="!p-5 bg-[var(--color-canvas-soft)]">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)] block mb-4">
                                Impact Visualization Pipeline
                            </span>
                            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                                {/* Step 1: Action */}
                                <div className="w-full flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center shadow-xs">
                                    <span className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)]">Action</span>
                                    <p className="mt-1 text-xs font-bold text-[var(--color-text)] truncate">
                                        {simulationResult.changes?.[0]?.description || "Hypothetical Change"}
                                    </p>
                                </div>

                                <FiArrowRight className="hidden md:block text-[var(--color-brand)] shrink-0" size={18} />

                                {/* Step 2: Task State */}
                                <div className="w-full flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center shadow-xs">
                                    <span className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)]">Task State</span>
                                    <p className="mt-1 text-xs font-bold text-[var(--color-text)]">
                                        {simulationResult.scenario === "complete_task" ? "Status: Completed" : simulationResult.scenario === "change_priority" ? "Priority Updated" : "Deadline Shifted"}
                                    </p>
                                </div>

                                <FiArrowRight className="hidden md:block text-[var(--color-brand)] shrink-0" size={18} />

                                {/* Step 3: Dependencies */}
                                <div className="w-full flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center shadow-xs">
                                    <span className="text-[10px] uppercase font-bold text-[var(--color-text-subtle)]">Dependencies</span>
                                    <p className="mt-1 text-xs font-bold text-[var(--color-text)] truncate">
                                        {simulationResult.unblockedTasks?.length > 0
                                            ? `Unblocks: ${simulationResult.unblockedTasks[0].title}`
                                            : "No blockers resolved"}
                                    </p>
                                </div>

                                <FiArrowRight className="hidden md:block text-[var(--color-brand)] shrink-0" size={18} />

                                {/* Step 4: Outcome */}
                                <div className="w-full flex-1 rounded-xl border border-[var(--color-brand)] bg-[var(--color-brand-soft)]/50 p-3 text-center shadow-xs">
                                    <span className="text-[10px] uppercase font-bold text-[var(--color-brand-hover)]">Recalculated Outcome</span>
                                    <p className="mt-1 text-xs font-bold text-[var(--color-text)]">
                                        Risk: {simulationResult.baseline?.riskScore} → {simulationResult.projected?.riskScore}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* 6. WHY DID IT CHANGE? & RECOMMENDATIONS */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Key Impacts */}
                            <Card className="!p-5">
                                <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                                    <FiActivity className="text-[var(--color-brand)]" size={16} />
                                    Why this changed (Impact Analysis)
                                </h3>

                                <div className="space-y-2.5">
                                    {simulationResult.impacts?.map((imp, idx) => {
                                        const isGood = imp.direction === "improved";
                                        const isBad = imp.direction === "worsened";
                                        return (
                                            <div
                                                key={idx}
                                                className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-2.5 text-xs text-[var(--color-text)]"
                                            >
                                                <span className={`mt-0.5 shrink-0 ${isGood ? "text-[var(--color-brand)]" : isBad ? "text-[var(--color-danger)]" : "text-[var(--color-text-subtle)]"}`}>
                                                    {isGood ? "✓" : isBad ? "⚠" : "ℹ"}
                                                </span>
                                                <span className="leading-relaxed">{imp.explanation}</span>
                                            </div>
                                        );
                                    })}

                                    {/* Unblocked downstream tasks */}
                                    {simulationResult.unblockedTasks?.length > 0 && (
                                        <div className="rounded-lg border border-[var(--color-brand)] bg-[var(--color-surface-sage)]/60 p-3 text-xs">
                                            <span className="font-bold text-[var(--color-brand-hover)] flex items-center gap-1.5 mb-1.5">
                                                <FiUnlock size={14} />
                                                🟢 Actionable Downstream Tasks Unblocked:
                                            </span>
                                            <div className="space-y-1 pl-4">
                                                {simulationResult.unblockedTasks.map((t) => (
                                                    <div key={t.id} className="font-semibold text-[var(--color-text)]">
                                                        • {t.title} ({t.priority} priority) — Ready to start!
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Warnings if any */}
                                    {simulationResult.warnings?.length > 0 && (
                                        <div className="rounded-lg border border-[var(--color-peach)] bg-[var(--color-peach-soft)] p-3 text-xs text-[var(--color-text)]">
                                            <span className="font-bold text-[var(--color-peach)] block mb-1">
                                                Note:
                                            </span>
                                            {simulationResult.warnings.map((w, idx) => (
                                                <div key={idx}>• {w}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* Recommendations & Conversational Summary */}
                            <Card className="!p-5">
                                <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                                    <FiZap className="text-[var(--color-brand)]" size={16} />
                                    Actionable Recommendations
                                </h3>

                                <div className="space-y-3">
                                    {simulationResult.recommendations?.map((rec, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3 text-xs text-[var(--color-text)] font-medium"
                                        >
                                            <span className="text-[var(--color-brand)] font-bold shrink-0">👉</span>
                                            <span className="leading-relaxed">{rec}</span>
                                        </div>
                                    ))}

                                    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-muted)] leading-relaxed">
                                        <p className="font-semibold text-[var(--color-text)] mb-1">
                                            Read-Only Sandbox Confirmed:
                                        </p>
                                        No database rows were inserted, deleted, or updated during this simulation. All metrics reflect a prospective model calculated exclusively in memory.
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
