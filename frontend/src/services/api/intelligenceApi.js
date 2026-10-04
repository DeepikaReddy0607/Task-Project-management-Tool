import api from "./axios";

/**
 * Fetch Critical Path Method (CPM) analysis for a given project.
 * Returns deterministic project duration, critical tasks, slack metrics,
 * all critical paths, and cycle detection status.
 *
 * @param {string} projectId
 * @returns {Promise<Object>} API response payload
 */
export const getCriticalPath = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/critical-path`);
  return response.data;
};

/**
 * Fetch Bottleneck Intelligence for a given project.
 * Returns ranked list of bottleneck tasks with explainable scoring (0-100),
 * severity levels (CRITICAL, HIGH, MEDIUM, LOW), and root cause reasons.
 *
 * @param {string} projectId
 * @returns {Promise<Object>} API response payload
 */
export const getBottlenecks = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/bottlenecks`);
  return response.data;
};

/**
 * Fetch unified Project Intelligence Overview aggregating Health, Drift,
 * Critical Path, Bottlenecks, Deadline Risks, Pre-Mortem, and Team Capacity.
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getIntelligenceOverview = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/overview`);
  return response.data;
};

/**
 * Fetch Project Health Scorecard and dimension breakdowns.
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getProjectHealth = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/health`);
  return response.data;
};

/**
 * Fetch Schedule Drift analysis (planned vs projected completion).
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getScheduleDrift = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/drift`);
  return response.data;
};

/**
 * Fetch prioritized tasks materially threatening the project deadline.
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getDeadlineRisks = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/deadline-risk`);
  return response.data;
};

/**
 * Fetch predictive pre-mortem failure condition findings with evidence.
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getPreMortem = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/pre-mortem`);
  return response.data;
};

/**
 * Fetch team capacity workload distribution and resilience/knowledge concentration.
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getTeamIntelligence = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/team`);
  return response.data;
};

/**
 * Fetch full Project Digital Twin computational model.
 *
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export const getDigitalTwin = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/digital-twin`);
  return response.data;
};

/**
 * Fetch all saved What-If scenarios for a project.
 */
export const getScenarios = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/scenarios`);
  return response.data;
};

/**
 * Create a new draft What-If scenario.
 */
export const createScenario = async (projectId, scenarioData) => {
  const response = await api.post(`/projects/${projectId}/intelligence/scenarios`, scenarioData);
  return response.data;
};

/**
 * Fetch a specific scenario by ID.
 */
export const getScenario = async (projectId, scenarioId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/scenarios/${scenarioId}`);
  return response.data;
};

/**
 * Simulate a scenario by applying its mutations against the live digital twin in memory.
 */
export const simulateScenario = async (projectId, scenarioId, mutations = null) => {
  const response = await api.post(`/projects/${projectId}/intelligence/scenarios/${scenarioId}/simulate`, { mutations });
  return response.data;
};

/**
 * Compare multiple scenarios against the baseline project intelligence.
 */
export const compareScenarios = async (projectId, payload) => {
  const response = await api.post(`/projects/${projectId}/intelligence/scenarios/compare`, payload);
  return response.data;
};

/**
 * Fetch generated replanning proposals for a project.
 */
export const getReplanningProposals = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/replanning`);
  return response.data;
};

/**
 * Generate fresh replanning proposals for deadline recovery or workload balance.
 */
export const generateReplanning = async (projectId, strategy = "ALL") => {
  const response = await api.post(`/projects/${projectId}/intelligence/replanning/generate`, { strategy });
  return response.data;
};

/**
 * Fetch a single replanning proposal by ID.
 */
export const getProposal = async (projectId, proposalId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/proposals/${proposalId}`);
  return response.data;
};

/**
 * Explicitly approve a replanning proposal.
 */
export const approveProposal = async (projectId, proposalId) => {
  const response = await api.post(`/projects/${projectId}/intelligence/proposals/${proposalId}/approve`);
  return response.data;
};

/**
 * Explicitly reject a replanning proposal with optional reason.
 */
export const rejectProposal = async (projectId, proposalId, reason = "") => {
  const response = await api.post(`/projects/${projectId}/intelligence/proposals/${proposalId}/reject`, { reason });
  return response.data;
};

/**
 * Execute an approved replanning proposal transactionally against the project.
 */
export const executeProposal = async (projectId, proposalId) => {
  const response = await api.post(`/projects/${projectId}/intelligence/proposals/${proposalId}/execute`);
  return response.data;
};

/**
 * Fetch explainable recommendations for project optimization.
 */
export const getRecommendations = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/recommendations`);
  return response.data;
};

// ============================================================
// PHASE 4: PROJECT MEMORY, DECISION INTELLIGENCE & HISTORY API
// ============================================================

/**
 * Fetch persistent health history, score changes, and dimension shifts.
 */
export const getHealthHistory = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/health-history`, { params });
  return response.data;
};

/**
 * Fetch general project history overview (health history + memory).
 */
export const getProjectHistory = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/history`, { params });
  return response.data;
};

/**
 * Fetch unified project intelligence timeline with filtering, sorting, and pagination.
 */
export const getProjectTimeline = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/timeline`, { params });
  return response.data;
};

/**
 * Fetch decision intelligence, including decision impact analysis and temporal context.
 */
export const getDecisionIntelligence = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/decisions`, { params });
  return response.data;
};

/**
 * Fetch project memory engine state, recurring patterns (bottlenecks, overdue, drift).
 */
export const getProjectMemory = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/memory`, { params });
  return response.data;
};

/**
 * Replay historical project intelligence at a specific point in time or across a date range.
 */
export const getProjectReplay = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/replay`, { params });
  return response.data;
};

/**
 * Run project diagnosis identifying systemic pathologies with explainable evidence.
 */
export const getProjectDiagnosis = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/diagnosis`, { params });
  return response.data;
};

/**
 * Run retrospective project autopsy for completed or archived projects.
 */
export const getProjectAutopsy = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/autopsy`, { params });
  return response.data;
};

// ============================================================
// PHASE 5: ADVANCED PREDICTIVE & CROSS-PROJECT INTELLIGENCE API
// ============================================================

/**
 * Fetch Monte Carlo schedule forecast for a project (P50, P80, P90, deadline probability).
 */
export const getProjectForecast = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/forecast`, { params });
  return response.data;
};

/**
 * Fetch probabilistic critical path appearance frequencies, dominant path, and high-impact tasks.
 */
export const getProbabilisticCriticalPath = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/intelligence/probabilistic-critical-path`, { params });
  return response.data;
};

/**
 * Fetch scope creep intelligence, net growth %, change frequency, and scope pressure.
 */
export const getProjectScopeIntelligence = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/scope`);
  return response.data;
};

/**
 * Fetch project team resource pressure breakdown.
 */
export const getProjectResourcePressure = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/resource-pressure`);
  return response.data;
};

/**
 * Fetch workspace-level portfolio intelligence (portfolio health, risk vectors, concentration).
 */
export const getPortfolioIntelligence = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/portfolio`);
  return response.data;
};

/**
 * Fetch cross-project intelligence (shared members, deadline conflicts, shared dependencies).
 */
export const getCrossProjectIntelligence = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/cross-project`);
  return response.data;
};

/**
 * Fetch workspace-level resource conflicts and pressure metrics.
 */
export const getResourceConflicts = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/resource-conflicts`);
  return response.data;
};

/**
 * Fetch portfolio risk map for a workspace.
 */
export const getPortfolioRiskMap = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/risk-map`);
  return response.data;
};

/**
 * Run pure in-memory Portfolio What-If scenario simulation.
 */
export const simulatePortfolioScenario = async (workspaceId, payload) => {
  const response = await api.post(`/workspaces/${workspaceId}/intelligence/simulate`, payload);
  return response.data;
};

// ============================================================
// PHASE 6: AUTONOMOUS PROJECT COORDINATION + EXECUTIVE WORKFLOW INTELLIGENCE
// ============================================================

/**
 * Fetch Daily Project Briefing.
 */
export const getProjectBriefing = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/briefing`);
  return response.data;
};

/**
 * Fetch Workspace Executive Briefing.
 */
export const getWorkspaceBriefing = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/briefing`);
  return response.data;
};

/**
 * Fetch Personal Work Briefing for the authenticated user.
 */
export const getPersonalBriefing = async (workspaceId = null) => {
  const params = workspaceId ? { workspaceId } : {};
  const response = await api.get(`/users/me/intelligence/briefing`, { params });
  return response.data;
};

/**
 * Fetch Automated Standup Intelligence for a project.
 */
export const getProjectStandup = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/standup`);
  return response.data;
};

/**
 * Fetch Automated Standup Intelligence for a team.
 */
export const getTeamStandup = async (teamId) => {
  const response = await api.get(`/teams/${teamId}/intelligence/standup`);
  return response.data;
};

/**
 * Fetch Personal Standup for the authenticated user.
 */
export const getPersonalStandup = async (workspaceId = null) => {
  const params = workspaceId ? { workspaceId } : {};
  const response = await api.get(`/users/me/intelligence/standup`, { params });
  return response.data;
};

/**
 * Fetch Intelligent Next Actions for a project.
 */
export const getProjectNextActions = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/actions`);
  return response.data;
};

/**
 * Fetch Workspace Next Actions.
 */
export const getWorkspaceNextActions = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/actions`);
  return response.data;
};

/**
 * Fetch Project Coordination State & Queues.
 */
export const getProjectCoordination = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/coordination`);
  return response.data;
};

/**
 * Fetch Workspace Coordination State & Queues.
 */
export const getWorkspaceCoordination = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/coordination`);
  return response.data;
};

/**
 * Fetch Unified Approval Center Queues for a workspace.
 */
export const getWorkspaceApprovals = async (workspaceId) => {
  const response = await api.get(`/workspaces/${workspaceId}/intelligence/approvals`);
  return response.data;
};

/**
 * Fetch Stakeholder Briefing for a project.
 */
export const getProjectStakeholderBriefing = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/stakeholder-briefing`);
  return response.data;
};

/**
 * Fetch Project Action Plan.
 */
export const getProjectActionPlan = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/action-plan`);
  return response.data;
};

/**
 * Fetch Project Recovery Plan.
 */
export const getProjectRecoveryPlan = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/intelligence/recovery-plan`);
  return response.data;
};

/**
 * Fetch Daily Action Plan for the authenticated user.
 */
export const getPersonalActionPlan = async (workspaceId = null) => {
  const params = workspaceId ? { workspaceId } : {};
  const response = await api.get(`/users/me/intelligence/action-plan`, { params });
  return response.data;
};

// ============================================================
// PHASE 7: PRODUCTION INTELLIGENCE & NATURAL-LANGUAGE PROJECT CONTROL
// ============================================================

/**
 * Execute a natural language or deterministic query across intelligence engines.
 */
export const queryIntelligence = async ({ query, projectId, workspaceId, context = {} }) => {
  const response = await api.post(`/intelligence/query`, { query, projectId, workspaceId, context });
  return response.data;
};

/**
 * Run What-If simulation from natural language query or structured scenario.
 */
export const simulateIntelligence = async ({ projectId, query, customMutations = [] }) => {
  const response = await api.post(`/intelligence/simulate`, { projectId, query, customMutations });
  return response.data;
};

/**
 * Prepare an actionable proposal without executing it.
 */
export const prepareActionProposal = async ({ projectId, actionType, entities = {}, rationale = "" }) => {
  const response = await api.post(`/intelligence/prepare-action`, { projectId, actionType, entities, rationale });
  return response.data;
};

/**
 * Fetch verified evidence for an intelligence metric or entity.
 */
export const getEvidence = async (entityType, entityId, projectId = null) => {
  const params = projectId ? { projectId } : {};
  const response = await api.get(`/intelligence/evidence/${entityType}/${entityId}`, { params });
  return response.data;
};

/**
 * Fetch pending approvals for a project or workspace.
 */
export const getIntelligenceApprovals = async ({ projectId, workspaceId }) => {
  const params = {};
  if (projectId) params.projectId = projectId;
  if (workspaceId) params.workspaceId = workspaceId;
  const response = await api.get(`/intelligence/approvals`, { params });
  return response.data;
};

/**
 * Execute an approved action proposal with Stale-State Protection.
 */
export const executeApprovedAction = async ({ projectId, proposalId }) => {
  const response = await api.post(`/intelligence/execute-approved`, { projectId, proposalId });
  return response.data;
};

/**
 * Run Dependency Shockwave Analysis (Phase 8).
 */
export const analyzeShockwave = async ({
  projectId,
  sourceTaskId,
  sourceUserId,
  shockType = "TASK_DELAY",
  magnitude = 3,
  unit = "days",
  customMutations
}) => {
  const response = await api.post(`/intelligence/shockwave`, {
    projectId,
    sourceTaskId,
    sourceUserId,
    shockType,
    magnitude,
    unit,
    customMutations
  });
  return response.data;
};

/**
 * Fetch quick shockwave analysis for a single task.
 */
export const getQuickShockwave = async (projectId, taskId, params = {}) => {
  const response = await api.get(`/intelligence/shockwave/${projectId}/${taskId}`, { params });
  return response.data;
};

/**
 * Run project stress-test ranking most vulnerable points of failure.
 */
export const stressTestProject = async (projectId, durationDays = 3) => {
  const response = await api.post(`/intelligence/shockwave/stress-test`, { projectId, durationDays });
  return response.data;
};

/**
 * Evaluate an intervention's projected impact before applying (Phase 9).
 */
export const evaluateIntervention = async ({ projectId, intervention, customMutations }) => {
  const response = await api.post(`/intelligence/intervention/evaluate`, { projectId, intervention, customMutations });
  return response.data;
};

/**
 * Compare multiple project intervention alternatives (Phase 9).
 */
export const compareInterventions = async ({ projectId, interventions }) => {
  const response = await api.post(`/intelligence/intervention/compare`, { projectId, interventions });
  return response.data;
};

/**
 * Prepare an intervention as a staged proposal in the Approval Center (Phase 9).
 */
export const prepareInterventionProposal = async ({ projectId, intervention, evaluation }) => {
  const response = await api.post(`/intelligence/intervention/prepare`, { projectId, intervention, evaluation });
  return response.data;
};

/**
 * Fetch a staged intervention proposal by ID (Phase 9).
 */
export const getInterventionProposal = async (projectId, proposalId) => {
  const response = await api.get(`/intelligence/intervention/${projectId}/${proposalId}`);
  return response.data;
};

/**
 * Execute Project Chaos / Failure Laboratory (Phase 10).
 */
export const runChaosLab = async ({
  projectId,
  scenarioCount = 25,
  severityRange = ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  includeCombined = true,
  includeMonteCarlo = true,
  seed = 42,
  customScenarios = null
}) => {
  const response = await api.post(`/intelligence/chaos/run`, {
    projectId,
    scenarioCount,
    severityRange,
    includeCombined,
    includeMonteCarlo,
    seed,
    customScenarios
  });
  return response.data;
};

/**
 * Fetch the latest Chaos Lab results for a project (Phase 10).
 */
export const getChaosLab = async (projectId) => {
  const response = await api.get(`/intelligence/chaos/${projectId}`);
  return response.data;
};

/**
 * Detect incremental disruption failure threshold / collapse point (Phase 10).
 */
export const detectFailureThreshold = async ({
  projectId,
  targetTaskId = null,
  targetDimension = "TASK_DELAY",
  stepDays = 1,
  maxSteps = 15
}) => {
  const response = await api.post(`/intelligence/chaos/threshold`, {
    projectId,
    targetTaskId,
    targetDimension,
    stepDays,
    maxSteps
  });
  return response.data;
};

/**
 * Analyze candidate recovery interventions for chaos scenarios (Phase 10).
 */
export const analyzeChaosRecovery = async ({ projectId, chaosResult, topScenario }) => {
  const response = await api.post(`/intelligence/chaos/recovery`, {
    projectId,
    chaosResult,
    topScenario
  });
  return response.data;
};

/**
 * Evaluate an individual chaos disruption scenario (Phase 10).
 */
export const evaluateChaosScenario = async ({ projectId, scenario }) => {
  const response = await api.post(`/intelligence/chaos/scenario`, {
    projectId,
    scenario
  });
  return response.data;
};

// ============================================================
// PHASE 11: PROJECT RED TEAM API
// ============================================================

/**
 * Execute full Project Red Team adversarial analysis.
 */
export const runRedTeam = async (projectId) => {
  const response = await api.post(`/intelligence/red-team/run`, { projectId });
  return response.data;
};

/**
 * Retrieve cached Project Red Team report.
 */
export const getRedTeam = async (projectId) => {
  const response = await api.get(`/intelligence/red-team/${projectId}`);
  return response.data;
};

/**
 * Validate a Red Team finding with targeted Chaos Lab simulation.
 */
export const validateRedTeamFinding = async ({ projectId, findingId }) => {
  const response = await api.post(`/intelligence/red-team/validate`, { projectId, findingId });
  return response.data;
};

// ============================================================
// PHASE 12: COUNTERFACTUAL TIME MACHINE API
// ============================================================

/**
 * Run a counterfactual simulation comparing actual history to an alternate branch.
 */
export const runCounterfactual = async ({ projectId, scenario }) => {
  const response = await api.post(`/intelligence/counterfactual/run`, { projectId, scenario });
  return response.data;
};

/**
 * Retrieve historical snapshot baseline for counterfactual reference.
 */
export const getCounterfactualBaseline = async (projectId, referenceTimestamp = null) => {
  const response = await api.get(`/intelligence/counterfactual/${projectId}`, {
    params: referenceTimestamp ? { referenceTimestamp } : {}
  });
  return response.data;
};

/**
 * Compare multiple counterfactual branches against actual baseline.
 */
export const compareCounterfactualBranches = async ({ projectId, branches }) => {
  const response = await api.post(`/intelligence/counterfactual/compare`, { projectId, branches });
  return response.data;
};

/**
 * Retrieve dual-track timeline replay for counterfactual divergence.
 */
export const getCounterfactualReplay = async ({ projectId, counterfactualId, scenario }) => {
  const response = await api.post(`/intelligence/counterfactual/replay`, {
    projectId,
    counterfactualId,
    scenario
  });
  return response.data;
};



