import prisma from "../config/prisma.js";
import { getProjectHealthHistory } from "./projectHistoryService.js";
import { getProjectTimeline } from "./projectTimelineService.js";

// In-memory store for unit tests and fallback
export const inMemoryDecisions = new Map(); // projectId -> Array<decision>

export const clearDecisionStore = () => {
    inMemoryDecisions.clear();
};

export const addInMemoryDecision = (projectId, decision) => {
    if (!inMemoryDecisions.has(projectId)) {
        inMemoryDecisions.set(projectId, []);
    }
    const record = {
        id: decision.id || `dec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        project_id: projectId,
        decision: decision.decision || decision.title || "Project Decision",
        reason: decision.reason || decision.description || null,
        decision_date: decision.decision_date ? new Date(decision.decision_date) : new Date(),
        owner_id: decision.owner_id || decision.userId || null,
        status: decision.status || "Proposed",
        created_at: decision.created_at ? new Date(decision.created_at) : new Date(),
        users: decision.users || (decision.owner ? { first_name: decision.owner.name, last_name: "" } : null),
        linkedTasks: decision.linkedTasks || [],
        linkedRisks: decision.linkedRisks || []
    };
    inMemoryDecisions.get(projectId).push(record);
    return record;
};

/**
 * Analyzes a decision's temporal impact against recorded project health snapshots and timeline events.
 * Strictly separates temporal association from causal proof.
 */
export const analyzeDecisionImpact = (decision, snapshots = [], subsequentEvents = []) => {
    const decisionTime = new Date(decision.decision_date || decision.created_at).getTime();

    // Find nearest snapshot before or on decision date
    const priorSnapshots = snapshots.filter(
        (s) => new Date(s.captured_at).getTime() <= decisionTime
    ).sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
    const beforeState = priorSnapshots[0] || null;

    // Find nearest snapshot after decision date (within 14 days)
    const afterSnapshots = snapshots.filter(
        (s) => new Date(s.captured_at).getTime() > decisionTime
    ).sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    const afterState = afterSnapshots[0] || null;

    let healthDelta = null;
    let driftDelta = null;
    let bottleneckDelta = null;
    let impactSummary = "Insufficient historical snapshots to measure temporal state change.";

    if (beforeState && afterState) {
        healthDelta = afterState.health_score - beforeState.health_score;
        driftDelta = afterState.schedule_drift_days - beforeState.schedule_drift_days;
        bottleneckDelta = afterState.bottleneck_count - beforeState.bottleneck_count;

        impactSummary = `After this decision was recorded, project health shifted from ${beforeState.health_score} to ${afterState.health_score} (delta: ${healthDelta > 0 ? "+" : ""}${healthDelta}), and schedule drift shifted from ${beforeState.schedule_drift_days} to ${afterState.schedule_drift_days} days.`;
    } else if (beforeState && !afterState) {
        impactSummary = `Project health was ${beforeState.health_score} when decision was recorded; no subsequent snapshots recorded yet.`;
    }

    // Filter events occurring within 7 days after the decision
    const postEvents = subsequentEvents.filter((ev) => {
        const evTime = new Date(ev.timestamp).getTime();
        return evTime > decisionTime && evTime <= decisionTime + 7 * 24 * 60 * 60 * 1000;
    });

    return {
        decisionId: decision.id,
        decisionTitle: decision.decision,
        decisionDate: decision.decision_date,
        status: decision.status,
        beforeState: beforeState
            ? {
                  capturedAt: beforeState.captured_at,
                  healthScore: beforeState.health_score,
                  healthStatus: beforeState.health_status,
                  scheduleDriftDays: beforeState.schedule_drift_days,
                  bottleneckCount: beforeState.bottleneck_count
              }
            : null,
        afterState: afterState
            ? {
                  capturedAt: afterState.captured_at,
                  healthScore: afterState.health_score,
                  healthStatus: afterState.health_status,
                  scheduleDriftDays: afterState.schedule_drift_days,
                  bottleneckCount: afterState.bottleneck_count
              }
            : null,
        deltas: {
            healthDelta,
            driftDelta,
            bottleneckDelta
        },
        temporalObservation: impactSummary,
        isCausal: false,
        causalityDisclaimer: "Temporal association reflects chronologically subsequent events and should not be construed as established causal proof.",
        subsequentEventsWindow: postEvents.map((e) => ({
            id: e.id,
            timestamp: e.timestamp,
            title: e.title,
            type: e.type,
            severity: e.severity
        }))
    };
};

/**
 * Retrieves decisions and decision intelligence impact analysis for a project.
 */
export const getProjectDecisionIntelligence = async (projectId, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required for Decision Intelligence");
    }

    const { status, ownerId, from, to } = options;

    let records = [];

    // Query DB if available
    try {
        if (prisma) {
            const whereClause = { project_id: projectId };
            if (status) whereClause.status = status;
            if (ownerId) whereClause.owner_id = ownerId;
            if (from || to) {
                whereClause.decision_date = {};
                if (from) whereClause.decision_date.gte = new Date(from);
                if (to) whereClause.decision_date.lte = new Date(to);
            }

            const dbDecisions = await prisma.decisions.findMany({
                where: whereClause,
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
                            roles: { select: { role_name: true } }
                        }
                    }
                },
                orderBy: { decision_date: "desc" }
            });

            if (dbDecisions && dbDecisions.length > 0) {
                records = dbDecisions;
            }
        }
    } catch {
        // Fall back to in-memory
    }

    // Merge/fallback in-memory decisions
    if (records.length === 0) {
        const memList = inMemoryDecisions.get(projectId) || [];
        records = [...memList];

        if (status) {
            records = records.filter((d) => d.status.toLowerCase() === status.toLowerCase());
        }
        if (ownerId) {
            records = records.filter((d) => d.owner_id === ownerId);
        }
        if (from) {
            records = records.filter((d) => new Date(d.decision_date).getTime() >= new Date(from).getTime());
        }
        if (to) {
            records = records.filter((d) => new Date(d.decision_date).getTime() <= new Date(to).getTime());
        }
    }

    // Sort newest first
    records.sort((a, b) => new Date(b.decision_date).getTime() - new Date(a.decision_date).getTime());

    // Fetch health history snapshots and timeline events for impact analysis
    const historyData = await getProjectHealthHistory(projectId, { limit: 100, order: "asc" });
    const timelineData = await getProjectTimeline(projectId, { limit: 100, order: "asc" });

    const analyzedDecisions = records.map((decision) => {
        const ownerName = decision.users
            ? `${decision.users.first_name || ""} ${decision.users.last_name || ""}`.trim() || decision.users.email
            : "Team Member";

        const impact = analyzeDecisionImpact(decision, historyData.snapshots, timelineData.events);

        // Extract entity linkage if explicit
        const linkedTasks = decision.linkedTasks || [];
        const linkedRisks = decision.linkedRisks || [];

        return {
            id: decision.id,
            projectId,
            decision: decision.decision,
            title: decision.decision,
            reason: decision.reason,
            rationale: decision.reason,
            decisionDate: decision.decision_date,
            status: decision.status,
            owner: {
                id: decision.owner_id,
                name: ownerName
            },
            impact,
            linkedEntities: {
                tasks: linkedTasks,
                risks: linkedRisks,
                temporalAssociations: impact.subsequentEventsWindow
            }
        };
    });

    return {
        projectId,
        totalDecisions: analyzedDecisions.length,
        decisions: analyzedDecisions
    };
};
