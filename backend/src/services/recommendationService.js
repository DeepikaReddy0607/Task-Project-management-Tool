import { generateReplanningProposals, REPLANNING_STRATEGIES } from "./projectReplanningService.js";
import { getProjectDigitalTwin } from "./digitalTwinService.js";
import { verifyProjectAccess } from "./projectRiskService.js";

/**
 * Recommendation Types
 */
export const RECOMMENDATION_TYPES = {
    DEADLINE_RECOVERY: "DEADLINE_RECOVERY",
    BOTTLENECK_RELIEF: "BOTTLENECK_RELIEF",
    WORKLOAD_BALANCING: "WORKLOAD_BALANCING",
    DEPENDENCY_OPTIMIZATION: "DEPENDENCY_OPTIMIZATION",
    CRITICAL_PATH_REDUCTION: "CRITICAL_PATH_REDUCTION",
    SCHEDULE_RECOVERY: "SCHEDULE_RECOVERY"
};

/**
 * Generates evidence-based, explainable recommendations with deterministic confidence metadata.
 * 
 * Safety invariants:
 * - Read-only analysis
 * - Strictly avoids fake probability or unsupported certainty claims
 * - Formatted for both UI panels and conversational Quackie answers
 * 
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.userId
 * @returns {Promise<Array<Object>>} Structured explainable recommendations
 */
export const getProjectRecommendations = async ({ projectId, userId }) => {
    await verifyProjectAccess(projectId, userId);

    const digitalTwin = await getProjectDigitalTwin(projectId, userId);
    const { proposals } = await generateReplanningProposals({
        projectId,
        userId,
        digitalTwin
    });

    const recommendations = [];

    proposals.forEach((proposal) => {
        let recType = RECOMMENDATION_TYPES.DEADLINE_RECOVERY;
        let confidenceBasis = [
            "Deterministic critical path calculation (CPM)",
            "Active task dependency structure",
            "Reported task estimated effort"
        ];
        let confidenceLevel = "HIGH";

        if (proposal.strategy === REPLANNING_STRATEGIES.WORKLOAD_BALANCING) {
            recType = RECOMMENDATION_TYPES.WORKLOAD_BALANCING;
            confidenceBasis.push("Team remaining hours aggregation");
            confidenceLevel = "MEDIUM"; // Medium because skill matrix is unverified
        } else if (proposal.strategy === REPLANNING_STRATEGIES.BOTTLENECK_RELIEF) {
            recType = RECOMMENDATION_TYPES.BOTTLENECK_RELIEF;
            confidenceBasis.push("Bottleneck impact and downstream blocked task count");
            confidenceLevel = "HIGH";
        } else if (proposal.strategy === REPLANNING_STRATEGIES.SEQUENCE_OPTIMIZATION) {
            recType = RECOMMENDATION_TYPES.DEPENDENCY_OPTIMIZATION;
            confidenceBasis.push("Parallelization of critical path dependencies");
            confidenceLevel = "MEDIUM"; // Requires domain validation of technical coupling
        }

        recommendations.push({
            recommendationId: `rec_${proposal.proposalId}`,
            proposalId: proposal.proposalId,
            type: recType,
            title: proposal.title,
            explanation: {
                what: proposal.proposedChanges.map((c) => c.details || `${c.type} on task ${c.taskTitle || c.taskId}`).join("; "),
                why: proposal.rationale
            },
            evidence: proposal.evidence || [],
            proposedChanges: proposal.proposedChanges || [],
            expectedImpact: proposal.projectedImpact,
            risks: proposal.warnings || [],
            assumptions: proposal.assumptions || [],
            confidence: {
                level: confidenceLevel,
                basis: confidenceBasis
            },
            status: proposal.status
        });
    });

    return recommendations;
};
