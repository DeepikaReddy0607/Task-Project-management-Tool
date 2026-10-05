import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import { getProjectDependenciesHandler } from "../controllers/taskDependencyController.js";
import {
    createDecisionHandler,
    getProjectDecisionsHandler,
    getDecisionByIdHandler,
    updateDecisionHandler,
    deleteDecisionHandler,
    supersedeDecisionHandler,
    getDecisionIntelligenceHandler
} from "../controllers/decisionController.js";

import {
    create, 
    getAll, 
    getOne, 
    update, 
    archive, 
    addMember,
    getMembers,
    updateMemberRole,
    removeMember,
    getRisk,
    getXRay,
    simulateProjectWhatIf,
    getCriticalPath,
    getBottlenecks,
    getDigitalTwin,
    getHealth,
    getDrift,
    getDeadlineRisk,
    getPreMortem,
    getTeamIntelligence,
    getIntelligenceOverview,
    getScenarios,
    createScenario,
    getScenario,
    simulateScenario,
    compareScenarios,
    getReplanningProposals,
    generateReplanning,
    getProposal,
    approveProposal,
    rejectProposal,
    executeProposal,
    getRecommendations,
    getHealthHistory,
    getTimeline,
    getDecisions,
    getMemory,
    getReplay,
    getDiagnosis,
    getAutopsy,
    getForecast,
    getProbabilisticCP,
    getScope,
    getResourcePressure,
    getPortfolio,
    getCrossProject,
    getResourceConflictsController,
    getPortfolioRiskMapController,
    simulatePortfolioScenarioController,
    getBriefingController,
    getStandupController,
    getNextActionsController,
    getCoordinationController,
    getStakeholderBriefingController,
    getActionPlanController,
    getRecoveryPlanController,
    getPersonalBriefingController,
    getPersonalStandupController,
    getPersonalActionPlanController
} from "../controllers/projectController.js";

const router = express.Router();

// Create a project inside a workspace
router.post(
    "/workspaces/:workspaceId/projects",
    authMiddleware,
    create
);

// Get active projects in a workspace
router.get(
    "/workspaces/:workspaceId/projects",
    authMiddleware,
    getAll
);

// Get project predictive risk analysis
router.get(
    "/projects/:id/risk",
    authMiddleware,
    getRisk
);

// Get project X-Ray diagnostic
router.get(
    "/projects/:id/xray",
    authMiddleware,
    getXRay
);

// Get project critical path analysis
router.get(
    "/projects/:id/critical-path",
    authMiddleware,
    getCriticalPath
);

router.get(
    "/projects/:projectId/critical-path",
    authMiddleware,
    getCriticalPath
);

// Get project bottleneck intelligence
router.get(
    "/projects/:id/bottlenecks",
    authMiddleware,
    getBottlenecks
);

router.get(
    "/projects/:projectId/bottlenecks",
    authMiddleware,
    getBottlenecks
);

// Get project dependency graph (Phase 13)
router.get(
    "/projects/:id/dependencies",
    authMiddleware,
    getProjectDependenciesHandler
);

router.get(
    "/projects/:projectId/dependencies",
    authMiddleware,
    getProjectDependenciesHandler
);

// Phase 2 Intelligence Endpoints
router.get(
    "/projects/:projectId/intelligence/overview",
    authMiddleware,
    getIntelligenceOverview
);
router.get(
    "/projects/:id/intelligence/overview",
    authMiddleware,
    getIntelligenceOverview
);

router.get(
    "/projects/:projectId/intelligence/digital-twin",
    authMiddleware,
    getDigitalTwin
);
router.get(
    "/projects/:id/intelligence/digital-twin",
    authMiddleware,
    getDigitalTwin
);

router.get(
    "/projects/:projectId/intelligence/health",
    authMiddleware,
    getHealth
);
router.get(
    "/projects/:id/intelligence/health",
    authMiddleware,
    getHealth
);

router.get(
    "/projects/:projectId/intelligence/drift",
    authMiddleware,
    getDrift
);
router.get(
    "/projects/:id/intelligence/drift",
    authMiddleware,
    getDrift
);

router.get(
    "/projects/:projectId/intelligence/deadline-risk",
    authMiddleware,
    getDeadlineRisk
);
router.get(
    "/projects/:id/intelligence/deadline-risk",
    authMiddleware,
    getDeadlineRisk
);

router.get(
    "/projects/:projectId/intelligence/pre-mortem",
    authMiddleware,
    getPreMortem
);
router.get(
    "/projects/:id/intelligence/pre-mortem",
    authMiddleware,
    getPreMortem
);

router.get(
    "/projects/:projectId/intelligence/team",
    authMiddleware,
    getTeamIntelligence
);
router.get(
    "/projects/:id/intelligence/team",
    authMiddleware,
    getTeamIntelligence
);

router.get(
    "/projects/:projectId/intelligence/resilience",
    authMiddleware,
    getTeamIntelligence
);
router.get(
    "/projects/:id/intelligence/resilience",
    authMiddleware,
    getTeamIntelligence
);

// ============================================================
// PHASE 3: SCENARIOS, SIMULATION & REPLANNING ROUTES
// ============================================================

// Scenarios CRUD & Simulation
router.get("/projects/:projectId/intelligence/scenarios", authMiddleware, getScenarios);
router.get("/projects/:id/intelligence/scenarios", authMiddleware, getScenarios);
router.post("/projects/:projectId/intelligence/scenarios", authMiddleware, createScenario);
router.post("/projects/:id/intelligence/scenarios", authMiddleware, createScenario);

router.get("/projects/:projectId/intelligence/scenarios/:scenarioId", authMiddleware, getScenario);
router.get("/projects/:id/intelligence/scenarios/:scenarioId", authMiddleware, getScenario);
router.post("/projects/:projectId/intelligence/scenarios/:scenarioId/simulate", authMiddleware, simulateScenario);
router.post("/projects/:id/intelligence/scenarios/:scenarioId/simulate", authMiddleware, simulateScenario);

router.post("/projects/:projectId/intelligence/scenarios/compare", authMiddleware, compareScenarios);
router.post("/projects/:id/intelligence/scenarios/compare", authMiddleware, compareScenarios);

// Replanning & Proposals
router.get("/projects/:projectId/intelligence/replanning", authMiddleware, getReplanningProposals);
router.get("/projects/:id/intelligence/replanning", authMiddleware, getReplanningProposals);
router.post("/projects/:projectId/intelligence/replanning/generate", authMiddleware, generateReplanning);
router.post("/projects/:id/intelligence/replanning/generate", authMiddleware, generateReplanning);

router.get("/projects/:projectId/intelligence/proposals", authMiddleware, getReplanningProposals);
router.get("/projects/:id/intelligence/proposals", authMiddleware, getReplanningProposals);
router.get("/projects/:projectId/intelligence/proposals/:proposalId", authMiddleware, getProposal);
router.get("/projects/:id/intelligence/proposals/:proposalId", authMiddleware, getProposal);

router.post("/projects/:projectId/intelligence/proposals/:proposalId/approve", authMiddleware, approveProposal);
router.post("/projects/:id/intelligence/proposals/:proposalId/approve", authMiddleware, approveProposal);

router.post("/projects/:projectId/intelligence/proposals/:proposalId/reject", authMiddleware, rejectProposal);
router.post("/projects/:id/intelligence/proposals/:proposalId/reject", authMiddleware, rejectProposal);

router.post("/projects/:projectId/intelligence/proposals/:proposalId/execute", authMiddleware, executeProposal);
router.post("/projects/:id/intelligence/proposals/:proposalId/execute", authMiddleware, executeProposal);

// Recommendations
router.get("/projects/:projectId/intelligence/recommendations", authMiddleware, getRecommendations);
router.get("/projects/:id/intelligence/recommendations", authMiddleware, getRecommendations);

// ============================================================
// PHASE 4: PROJECT MEMORY, DECISION INTELLIGENCE & HISTORY
// ============================================================

// Health History & Dimension Trends
router.get("/projects/:projectId/intelligence/history", authMiddleware, getHealthHistory);
router.get("/projects/:id/intelligence/history", authMiddleware, getHealthHistory);
router.get("/projects/:projectId/intelligence/health-history", authMiddleware, getHealthHistory);
router.get("/projects/:id/intelligence/health-history", authMiddleware, getHealthHistory);

// Unified Project Timeline
router.get("/projects/:projectId/intelligence/timeline", authMiddleware, getTimeline);
router.get("/projects/:id/intelligence/timeline", authMiddleware, getTimeline);

// Decision Intelligence (Phase 4)
router.get("/projects/:projectId/intelligence/decisions", authMiddleware, getDecisions);
router.get("/projects/:id/intelligence/decisions", authMiddleware, getDecisions);

// Decision Log (Phase 14)
router.post("/projects/:projectId/decisions", authMiddleware, createDecisionHandler);
router.post("/projects/:id/decisions", authMiddleware, createDecisionHandler);

router.get("/projects/:projectId/decisions", authMiddleware, getProjectDecisionsHandler);
router.get("/projects/:id/decisions", authMiddleware, getProjectDecisionsHandler);

router.get("/projects/:projectId/decisions/:decisionId", authMiddleware, getDecisionByIdHandler);
router.get("/projects/:id/decisions/:decisionId", authMiddleware, getDecisionByIdHandler);

router.patch("/projects/:projectId/decisions/:decisionId", authMiddleware, updateDecisionHandler);
router.patch("/projects/:id/decisions/:decisionId", authMiddleware, updateDecisionHandler);

router.delete("/projects/:projectId/decisions/:decisionId", authMiddleware, deleteDecisionHandler);
router.delete("/projects/:id/decisions/:decisionId", authMiddleware, deleteDecisionHandler);

router.post("/projects/:projectId/decisions/:decisionId/supersede", authMiddleware, supersedeDecisionHandler);
router.post("/projects/:id/decisions/:decisionId/supersede", authMiddleware, supersedeDecisionHandler);

router.get("/projects/:projectId/decisions/:decisionId/intelligence", authMiddleware, getDecisionIntelligenceHandler);
router.get("/projects/:id/decisions/:decisionId/intelligence", authMiddleware, getDecisionIntelligenceHandler);

// Project Memory Engine
router.get("/projects/:projectId/intelligence/memory", authMiddleware, getMemory);
router.get("/projects/:id/intelligence/memory", authMiddleware, getMemory);

// Project Replay
router.get("/projects/:projectId/intelligence/replay", authMiddleware, getReplay);
router.get("/projects/:id/intelligence/replay", authMiddleware, getReplay);

// Project Diagnosis
router.get("/projects/:projectId/intelligence/diagnosis", authMiddleware, getDiagnosis);
router.get("/projects/:id/intelligence/diagnosis", authMiddleware, getDiagnosis);

// Project Autopsy / Retrospective
router.get("/projects/:projectId/intelligence/autopsy", authMiddleware, getAutopsy);
router.get("/projects/:id/intelligence/autopsy", authMiddleware, getAutopsy);

// ============================================================
// PHASE 5: ADVANCED PREDICTIVE & CROSS-PROJECT INTELLIGENCE
// ============================================================

// Monte Carlo Schedule Forecast
router.get("/projects/:projectId/intelligence/forecast", authMiddleware, getForecast);
router.get("/projects/:id/intelligence/forecast", authMiddleware, getForecast);

// Probabilistic Critical Path & Volatility
router.get("/projects/:projectId/intelligence/probabilistic-critical-path", authMiddleware, getProbabilisticCP);
router.get("/projects/:id/intelligence/probabilistic-critical-path", authMiddleware, getProbabilisticCP);

// Scope Creep Intelligence
router.get("/projects/:projectId/intelligence/scope", authMiddleware, getScope);
router.get("/projects/:id/intelligence/scope", authMiddleware, getScope);

// Resource Pressure
router.get("/projects/:projectId/intelligence/resource-pressure", authMiddleware, getResourcePressure);
router.get("/projects/:id/intelligence/resource-pressure", authMiddleware, getResourcePressure);

// Workspace Portfolio Intelligence
router.get("/workspaces/:workspaceId/intelligence/portfolio", authMiddleware, getPortfolio);

// Cross-Project Intelligence
router.get("/workspaces/:workspaceId/intelligence/cross-project", authMiddleware, getCrossProject);

// Resource Conflicts
router.get("/workspaces/:workspaceId/intelligence/resource-conflicts", authMiddleware, getResourceConflictsController);

// Portfolio Risk Map
router.get("/workspaces/:workspaceId/intelligence/risk-map", authMiddleware, getPortfolioRiskMapController);

// Portfolio What-If Simulation (READ-ONLY)
router.post("/workspaces/:workspaceId/intelligence/simulate", authMiddleware, simulatePortfolioScenarioController);

// Simulate What-If predictive scenario (READ-ONLY)
router.post(
    "/projects/:id/simulate",
    authMiddleware,
    simulateProjectWhatIf
);

// ============================================================
// PHASE 6: AUTONOMOUS PROJECT COORDINATION + EXECUTIVE WORKFLOW INTELLIGENCE
// ============================================================

// Daily Project Briefing
router.get("/projects/:projectId/intelligence/briefing", authMiddleware, getBriefingController);
router.get("/projects/:id/intelligence/briefing", authMiddleware, getBriefingController);

// Automated Standup Intelligence
router.get("/projects/:projectId/intelligence/standup", authMiddleware, getStandupController);
router.get("/projects/:id/intelligence/standup", authMiddleware, getStandupController);
router.get("/teams/:teamId/intelligence/standup", authMiddleware, getStandupController);

// Intelligent Next Actions
router.get("/projects/:projectId/intelligence/actions", authMiddleware, getNextActionsController);
router.get("/projects/:id/intelligence/actions", authMiddleware, getNextActionsController);

// Project Coordinator & Coordination State
router.get("/projects/:projectId/intelligence/coordination", authMiddleware, getCoordinationController);
router.get("/projects/:id/intelligence/coordination", authMiddleware, getCoordinationController);

// Stakeholder Briefing Generator
router.get("/projects/:projectId/intelligence/stakeholder-briefing", authMiddleware, getStakeholderBriefingController);
router.get("/projects/:id/intelligence/stakeholder-briefing", authMiddleware, getStakeholderBriefingController);

// Action Plans & Recovery Plans
router.get("/projects/:projectId/intelligence/action-plan", authMiddleware, getActionPlanController);
router.get("/projects/:id/intelligence/action-plan", authMiddleware, getActionPlanController);
router.get("/projects/:projectId/intelligence/recovery-plan", authMiddleware, getRecoveryPlanController);
router.get("/projects/:id/intelligence/recovery-plan", authMiddleware, getRecoveryPlanController);

// Personal Briefings & Standup for Authenticated User
router.get("/users/me/intelligence/briefing", authMiddleware, getPersonalBriefingController);
router.get("/users/me/intelligence/standup", authMiddleware, getPersonalStandupController);
router.get("/users/me/intelligence/action-plan", authMiddleware, getPersonalActionPlanController);

// Get a single project
router.get(
    "/projects/:id",
    authMiddleware,
    getOne
);

// Update a project
router.patch(
    "/projects/:id",
    authMiddleware,
    update
);

// Archive a project
router.patch(
    "/projects/:id/archive",
    authMiddleware,
    archive
);

// Add a member to a project
router.post(
    "/projects/:id/members",
    authMiddleware,
    addMember
);

// Get project members

router.get(
    "/projects/:id/members",
    authMiddleware,
    getMembers
);

// Update project member role

router.patch(
    "/projects/:id/members/:userId",
    authMiddleware,
    updateMemberRole
);

// Remove project member

router.delete(
    "/projects/:id/members/:userId",
    authMiddleware,
    removeMember
);

export default router;