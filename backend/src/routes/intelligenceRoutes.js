/**
 * Intelligence Routes (Phase 7)
 * 
 * Routes for natural language project control, queries, simulations, action preparation,
 * evidence lookup, and controlled execution.
 */

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    queryIntelligence,
    simulateScenario,
    prepareAction,
    getEvidence,
    getPendingApprovals,
    executeApprovedAction,
    analyzeDependencyShockwave,
    getQuickShockwave,
    stressTestProjectEndpoint,
    evaluateInterventionEndpoint,
    compareInterventionsEndpoint,
    prepareInterventionProposalEndpoint,
    getInterventionProposalEndpoint,
    runChaosLabEndpoint,
    getChaosLabEndpoint,
    detectFailureThresholdEndpoint,
    analyzeChaosRecoveryEndpoint,
    evaluateChaosScenarioEndpoint,
    runRedTeamEndpoint,
    getRedTeamEndpoint,
    validateRedTeamFindingEndpoint,
    runCounterfactualEndpoint,
    getCounterfactualBaselineEndpoint,
    compareCounterfactualBranchesEndpoint,
    getCounterfactualReplayEndpoint
} from "../controllers/intelligenceController.js";

const router = express.Router();

router.use(authMiddleware);

// Natural Language & Deterministic Query
router.post("/query", queryIntelligence);

// What-If Simulation
router.post("/simulate", simulateScenario);

// Action Preparation
router.post("/prepare-action", prepareAction);

// Evidence Lookup
router.get("/evidence/:entityType/:entityId", getEvidence);

// Approvals Queue
router.get("/approvals", getPendingApprovals);

// Controlled Execution of Approved Proposals
router.post("/execute-approved", executeApprovedAction);

// Phase 8: Dependency Shockwave & Stress-Test Routes
router.post("/shockwave", analyzeDependencyShockwave);
router.get("/shockwave/:projectId/:taskId", getQuickShockwave);
router.post("/shockwave/stress-test", stressTestProjectEndpoint);

// Phase 9: Intervention Impact Engine Routes
router.post("/intervention/evaluate", evaluateInterventionEndpoint);
router.post("/intervention/compare", compareInterventionsEndpoint);
router.post("/intervention/prepare", prepareInterventionProposalEndpoint);
router.get("/intervention/:projectId/:proposalId", getInterventionProposalEndpoint);

// Phase 10: Project Chaos / Failure Laboratory Routes
router.post("/chaos/run", runChaosLabEndpoint);
router.get("/chaos/:projectId", getChaosLabEndpoint);
router.post("/chaos/threshold", detectFailureThresholdEndpoint);
router.post("/chaos/recovery", analyzeChaosRecoveryEndpoint);
router.post("/chaos/scenario", evaluateChaosScenarioEndpoint);

// Phase 11: Project Red Team Routes
router.post("/red-team/run", runRedTeamEndpoint);
router.get("/red-team/:projectId", getRedTeamEndpoint);
router.post("/red-team/validate", validateRedTeamFindingEndpoint);

// Phase 12: Counterfactual Time Machine Routes
router.post("/counterfactual/run", runCounterfactualEndpoint);
router.get("/counterfactual/:projectId", getCounterfactualBaselineEndpoint);
router.post("/counterfactual/compare", compareCounterfactualBranchesEndpoint);
router.post("/counterfactual/replay", getCounterfactualReplayEndpoint);

export default router;
