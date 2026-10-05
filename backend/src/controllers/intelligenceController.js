/**
 * Intelligence Controller (Phase 7)
 * 
 * Endpoints for natural-language intelligence queries, simulations, action preparation,
 * evidence lookup, approvals, and executed proposals.
 */

import { handleIntelligenceQuery, simulateNaturalLanguageScenario } from "../services/intelligenceQueryService.js";
import { prepareActionProposal, executeApprovedProposalSafely } from "../services/intelligenceApprovalService.js";
import { analyzeShockwave, stressTestProject } from "../services/dependencyShockwaveService.js";
import {
    evaluateIntervention,
    compareInterventions,
    prepareInterventionProposal
} from "../services/interventionImpactService.js";
import {
    runProjectChaosLab,
    getProjectChaosLab,
    detectFailureThreshold,
    analyzeChaosRecovery,
    evaluateChaosScenario
} from "../services/projectChaosService.js";
import {
    runProjectRedTeam,
    getProjectRedTeam,
    validateFindingWithChaos
} from "../services/projectRedTeamService.js";
import {
    runCounterfactualSimulation,
    selectHistoricalBaseline,
    compareCounterfactualBranches,
    getCounterfactualTimelineReplay
} from "../services/counterfactualTimeMachineService.js";
import { getInMemoryApproval } from "../services/intelligenceApprovalService.js";
import { extractEvidenceFromEngine, EVIDENCE_SOURCE_TYPES } from "../services/intelligenceEvidenceService.js";
import { listProjectProposals } from "../services/projectReplanningService.js";
import { verifyProjectAccess } from "../services/projectRiskService.js";
import prisma from "../config/prisma.js";

const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * POST /api/intelligence/query
 */
export const queryIntelligence = async (req, res) => {
    try {
        const { query, projectId, workspaceId, context } = req.body;
        if (!query || typeof query !== "string") {
            return res.status(400).json({ error: "Query string is required." });
        }

        const userId = req.user?.id;
        const result = await handleIntelligenceQuery({
            query,
            projectId,
            workspaceId,
            userId,
            context
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to process intelligence query."
        });
    }
};

/**
 * POST /api/intelligence/simulate
 */
export const simulateScenario = async (req, res) => {
    try {
        const { projectId, query, customMutations } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await simulateNaturalLanguageScenario({
            projectId,
            query,
            userId,
            customMutations
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to run simulation."
        });
    }
};

/**
 * POST /api/intelligence/prepare-action
 */
export const prepareAction = async (req, res) => {
    try {
        const { projectId, actionType, entities, rationale } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await prepareActionProposal({
            projectId,
            userId,
            actionType,
            entities,
            rationale
        });

        return res.status(201).json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to prepare action proposal."
        });
    }
};

/**
 * GET /api/intelligence/evidence/:entityType/:entityId
 */
export const getEvidence = async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        const { projectId } = req.query;
        const userId = req.user?.id;

        if (projectId && isUuid(projectId)) {
            await verifyProjectAccess(projectId, userId);
        }

        const evidence = extractEvidenceFromEngine({
            engineType: entityType.toUpperCase(),
            data: { id: entityId, metric: "Verified" },
            projectId: projectId || "default"
        });

        return res.json(evidence);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to retrieve evidence."
        });
    }
};

/**
 * GET /api/intelligence/approvals
 */
export const getPendingApprovals = async (req, res) => {
    try {
        const { projectId, workspaceId } = req.query;
        const userId = req.user?.id;

        if (projectId) {
            if (isUuid(projectId)) await verifyProjectAccess(projectId, userId);
            const proposals = await listProjectProposals(projectId, userId).catch(() => []);
            return res.json({
                projectId,
                approvals: proposals.filter((p) => p.status === "PROPOSED" || p.status === "Pending")
            });
        }

        if (workspaceId) {
            if (isUuid(workspaceId)) {
                const membership = await prisma.workspace_members.findFirst({
                    where: { workspace_id: workspaceId, user_id: userId }
                });
                if (!membership) return res.status(403).json({ error: "Workspace access denied." });
            }
            return res.json({ workspaceId, approvals: [] });
        }

        return res.status(400).json({ error: "projectId or workspaceId is required." });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to retrieve approvals."
        });
    }
};

/**
 * POST /api/intelligence/execute-approved
 */
export const executeApprovedAction = async (req, res) => {
    try {
        const { projectId, proposalId } = req.body;
        if (!proposalId) {
            return res.status(400).json({ error: "Proposal ID is required for execution." });
        }

        const userId = req.user?.id;
        const result = await executeApprovedProposalSafely({
            projectId,
            proposalId,
            userId
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            error: error.message || "Execution failed.",
            code: error.code || "EXECUTION_ERROR"
        });
    }
};

/**
 * POST /api/intelligence/shockwave
 */
export const analyzeDependencyShockwave = async (req, res) => {
    try {
        const { projectId, sourceTaskId, sourceUserId, shockType, magnitude, unit, customMutations } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await analyzeShockwave({
            projectId,
            userId,
            sourceTaskId,
            sourceUserId,
            shockType,
            magnitude,
            unit,
            customMutations
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to analyze dependency shockwave."
        });
    }
};

/**
 * GET /api/intelligence/shockwave/:projectId/:taskId
 */
export const getQuickShockwave = async (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        const magnitude = Number(req.query.magnitude) || 3;
        const shockType = req.query.shockType || "TASK_DELAY";
        const userId = req.user?.id;

        const result = await analyzeShockwave({
            projectId,
            userId,
            sourceTaskId: taskId,
            shockType,
            magnitude
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to compute quick shockwave."
        });
    }
};

/**
 * POST /api/intelligence/shockwave/stress-test
 */
export const stressTestProjectEndpoint = async (req, res) => {
    try {
        const { projectId, durationDays } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await stressTestProject({
            projectId,
            userId,
            durationDays: Number(durationDays) || 3
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to execute stress test."
        });
    }
};

/**
 * POST /api/intelligence/intervention/evaluate
 */
export const evaluateInterventionEndpoint = async (req, res) => {
    try {
        const { projectId, intervention, customMutations } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!intervention) {
            return res.status(400).json({ error: "Intervention definition is required." });
        }

        const userId = req.user?.id;
        const result = await evaluateIntervention({
            projectId,
            userId,
            intervention,
            customMutations
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to evaluate intervention impact."
        });
    }
};

/**
 * POST /api/intelligence/intervention/compare
 */
export const compareInterventionsEndpoint = async (req, res) => {
    try {
        const { projectId, interventions } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!Array.isArray(interventions) || interventions.length === 0) {
            return res.status(400).json({ error: "Interventions array is required." });
        }

        const userId = req.user?.id;
        const result = await compareInterventions({
            projectId,
            userId,
            interventions
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to compare interventions."
        });
    }
};

/**
 * POST /api/intelligence/intervention/prepare
 */
export const prepareInterventionProposalEndpoint = async (req, res) => {
    try {
        const { projectId, intervention, evaluation } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!intervention) {
            return res.status(400).json({ error: "Intervention definition is required." });
        }

        const userId = req.user?.id;
        const result = await prepareInterventionProposal({
            projectId,
            userId,
            intervention,
            evaluation
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to prepare intervention proposal."
        });
    }
};

/**
 * GET /api/intelligence/intervention/:projectId/:proposalId
 */
export const getInterventionProposalEndpoint = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const proposal = getInMemoryApproval(proposalId);
        if (!proposal) {
            return res.status(404).json({ error: `Proposal '${proposalId}' not found.` });
        }

        return res.json(proposal);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to retrieve intervention proposal."
        });
    }
};

/**
 * POST /api/intelligence/chaos/run
 */
export const runChaosLabEndpoint = async (req, res) => {
    try {
        const {
            projectId,
            scenarioCount,
            severityRange,
            includeCombined,
            includeMonteCarlo,
            seed,
            customScenarios
        } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await runProjectChaosLab({
            projectId,
            userId,
            scenarioCount,
            severityRange,
            includeCombined,
            includeMonteCarlo,
            seed,
            customScenarios
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to execute Project Chaos Lab."
        });
    }
};

/**
 * GET /api/intelligence/chaos/:projectId
 */
export const getChaosLabEndpoint = async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await getProjectChaosLab(projectId, userId);
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to retrieve Chaos Lab results."
        });
    }
};

/**
 * POST /api/intelligence/chaos/threshold
 */
export const detectFailureThresholdEndpoint = async (req, res) => {
    try {
        const { projectId, targetTaskId, targetDimension, stepDays, maxSteps } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await detectFailureThreshold({
            projectId,
            userId,
            targetTaskId,
            targetDimension,
            stepDays,
            maxSteps
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to detect failure threshold."
        });
    }
};

/**
 * POST /api/intelligence/chaos/recovery
 */
export const analyzeChaosRecoveryEndpoint = async (req, res) => {
    try {
        const { projectId, chaosResult, topScenario } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await analyzeChaosRecovery({
            projectId,
            userId,
            chaosResult,
            topScenario
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to analyze chaos recovery."
        });
    }
};

/**
 * POST /api/intelligence/chaos/scenario
 */
export const evaluateChaosScenarioEndpoint = async (req, res) => {
    try {
        const { projectId, scenario } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!scenario) {
            return res.status(400).json({ error: "Scenario definition is required." });
        }

        const userId = req.user?.id;
        const result = await evaluateChaosScenario({
            projectId,
            scenario,
            userId
        });

        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to evaluate chaos scenario."
        });
    }
};

// ============================================================
// PHASE 11: PROJECT RED TEAM ENDPOINTS
// ============================================================

/**
 * POST /api/intelligence/red-team/run
 */
export const runRedTeamEndpoint = async (req, res) => {
    try {
        const { projectId } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await runProjectRedTeam({ projectId, userId });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to run Project Red Team analysis."
        });
    }
};

/**
 * GET /api/intelligence/red-team/:projectId
 */
export const getRedTeamEndpoint = async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const userId = req.user?.id;
        const result = await getProjectRedTeam(projectId, userId);
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to retrieve Red Team findings."
        });
    }
};

/**
 * POST /api/intelligence/red-team/validate
 */
export const validateRedTeamFindingEndpoint = async (req, res) => {
    try {
        const { projectId, findingId } = req.body;
        if (!projectId || !findingId) {
            return res.status(400).json({ error: "Project ID and Finding ID are required." });
        }

        const result = await validateFindingWithChaos({ projectId, findingId });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to validate Red Team finding with Chaos Lab."
        });
    }
};

// ============================================================
// PHASE 12: COUNTERFACTUAL TIME MACHINE ENDPOINTS
// ============================================================

/**
 * POST /api/intelligence/counterfactual/run
 */
export const runCounterfactualEndpoint = async (req, res) => {
    try {
        const { projectId, scenario } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!scenario || !scenario.type) {
            return res.status(400).json({ error: "Valid scenario with type is required." });
        }

        const userId = req.user?.id;
        const result = await runCounterfactualSimulation({ projectId, userId, scenario });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to run counterfactual simulation."
        });
    }
};

/**
 * GET /api/intelligence/counterfactual/:projectId
 */
export const getCounterfactualBaselineEndpoint = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { referenceTimestamp } = req.query;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const result = await selectHistoricalBaseline({ projectId, referenceTimestamp });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to retrieve counterfactual baseline."
        });
    }
};

/**
 * POST /api/intelligence/counterfactual/compare
 */
export const compareCounterfactualBranchesEndpoint = async (req, res) => {
    try {
        const { projectId, branches } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!Array.isArray(branches) || branches.length === 0) {
            return res.status(400).json({ error: "Array of scenario branches is required." });
        }

        const userId = req.user?.id;
        const result = await compareCounterfactualBranches({ projectId, userId, branches });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to compare counterfactual branches."
        });
    }
};

/**
 * POST /api/intelligence/counterfactual/replay
 */
export const getCounterfactualReplayEndpoint = async (req, res) => {
    try {
        const { projectId, counterfactualId, scenario } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required." });
        }

        const result = await getCounterfactualTimelineReplay({ projectId, counterfactualId, scenario });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.message || "Failed to generate counterfactual timeline replay."
        });
    }
};

