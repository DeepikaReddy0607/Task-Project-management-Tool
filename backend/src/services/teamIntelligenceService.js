import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";

// ============================================================
// CONSTANTS & SEVERITIES
// ============================================================

export const KNOWLEDGE_RISK_SEVERITY = Object.freeze({
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW"
});

/**
 * Pure deterministic calculation of team workload distribution.
 * 
 * @param {Object} digitalTwin Structured digital twin
 * @returns {Object} Team workload intelligence
 */
export const calculateTeamWorkload = (digitalTwin) => {
    if (!digitalTwin || !digitalTwin.team) {
        return {
            members: [],
            unassigned: { count: 0, criticalCount: 0, hours: 0, share: 0 },
            totalRemainingHours: 0,
            averageHoursPerMember: 0
        };
    }

    const { team, tasks, criticalPath } = digitalTwin;
    const members = team.members || [];
    const totalRemainingHours = members.reduce((sum, m) => sum + (m.remainingHours || 0), 0) + (team.unassignedHours || 0);
    const totalCriticalTasks = criticalPath?.criticalTasks?.length || 0;

    const enrichedMembers = members.map((m) => {
        const workloadShare = totalRemainingHours > 0
            ? Number(((m.remainingHours / totalRemainingHours) * 100).toFixed(1))
            : 0;

        const criticalWorkloadShare = totalCriticalTasks > 0
            ? Number(((m.criticalCount / totalCriticalTasks) * 100).toFixed(1))
            : 0;

        return {
            ...m,
            workloadShare,
            criticalWorkloadShare
        };
    });

    const unassignedShare = totalRemainingHours > 0
        ? Number(((team.unassignedHours / totalRemainingHours) * 100).toFixed(1))
        : 0;

    const averageHoursPerMember = members.length > 0
        ? Number((totalRemainingHours / members.length).toFixed(1))
        : 0;

    return {
        members: enrichedMembers,
        unassigned: {
            count: team.unassignedTasks || 0,
            criticalCount: team.unassignedCriticalCount || 0,
            hours: team.unassignedHours || 0,
            share: unassignedShare
        },
        totalRemainingHours,
        averageHoursPerMember
    };
};

/**
 * Pure deterministic calculation of Knowledge Concentration Risk.
 * 
 * Quantifies single-point-of-failure risks where critical deliverables,
 * bottlenecks, or disproportionate effort rests on single assignees.
 * 
 * @param {Object} digitalTwin Structured digital twin
 * @returns {Object} Knowledge concentration risk payload
 */
export const calculateKnowledgeConcentration = (digitalTwin) => {
    if (!digitalTwin) {
        return {
            concentrationScore: 0,
            severity: KNOWLEDGE_RISK_SEVERITY.LOW,
            affectedUsers: [],
            affectedTasks: [],
            evidence: ["No project members or tasks to evaluate."],
            recommendations: []
        };
    }

    const workloadData = calculateTeamWorkload(digitalTwin);
    const { members, unassigned } = workloadData;
    const { criticalPath, bottlenecks } = digitalTwin;
    const totalCriticalTasks = criticalPath?.criticalTasks?.length || 0;

    let concentrationScore = 15; // baseline low risk
    const evidence = [];
    const affectedUsers = [];
    const affectedTasks = [...(criticalPath?.criticalTasks || [])];
    const recommendations = [];

    // Analyze members
    if (members.length > 1) {
        members.forEach((m) => {
            let isUserAffected = false;

            // 1. Critical task concentration (> 50%)
            if (totalCriticalTasks > 1 && m.criticalWorkloadShare >= 50) {
                concentrationScore += Math.round(m.criticalWorkloadShare * 0.4);
                evidence.push(`${m.name} is assigned to ${m.criticalWorkloadShare}% of critical path tasks (${m.criticalCount} of ${totalCriticalTasks}).`);
                isUserAffected = true;
            }

            // 2. Effort concentration (> 60%)
            if (m.workloadShare >= 60) {
                concentrationScore += 25;
                evidence.push(`${m.name} holds ${m.workloadShare}% of all remaining project hours (${m.remainingHours} hrs).`);
                isUserAffected = true;
            }

            // 3. Bottleneck ownership
            const memberBottlenecks = (bottlenecks?.items || []).filter(
                (b) => (b.severity === "CRITICAL" || b.severity === "HIGH") && b.assignedTo === m.userId
            );
            if (memberBottlenecks.length >= 2) {
                concentrationScore += 20;
                evidence.push(`${m.name} owns ${memberBottlenecks.length} major workflow bottlenecks.`);
                isUserAffected = true;
            }

            if (isUserAffected) {
                affectedUsers.push({
                    userId: m.userId,
                    name: m.name,
                    criticalWorkloadShare: m.criticalWorkloadShare,
                    workloadShare: m.workloadShare,
                    criticalCount: m.criticalCount,
                    remainingHours: m.remainingHours
                });
            }
        });
    } else if (members.length === 1 && totalCriticalTasks > 0) {
        // Solo member project
        concentrationScore = 50;
        evidence.push(`Single project contributor: ${members[0].name} holds 100% of project deliverables.`);
        affectedUsers.push(members[0]);
    }

    // 4. Unassigned critical work risk
    if (unassigned.criticalCount > 0) {
        concentrationScore += unassigned.criticalCount * 15;
        evidence.push(`${unassigned.criticalCount} critical path task(s) currently have no assigned owner.`);
        recommendations.push("Assign owners to all critical path tasks immediately.");
    }

    concentrationScore = Math.max(0, Math.min(100, concentrationScore));

    let severity = KNOWLEDGE_RISK_SEVERITY.LOW;
    if (concentrationScore >= 75) {
        severity = KNOWLEDGE_RISK_SEVERITY.CRITICAL;
    } else if (concentrationScore >= 55) {
        severity = KNOWLEDGE_RISK_SEVERITY.HIGH;
    } else if (concentrationScore >= 35) {
        severity = KNOWLEDGE_RISK_SEVERITY.MEDIUM;
    }

    if (affectedUsers.length > 0 && recommendations.length === 0) {
        recommendations.push("Pair high-concentration assignees with other team members or redistribute non-critical tasks.");
    }

    if (evidence.length === 0) {
        evidence.push("Workload and critical responsibilities are well-distributed across team members.");
    }

    return {
        concentrationScore,
        severity,
        affectedUsers,
        affectedTasks: affectedTasks.slice(0, 10),
        evidence,
        recommendations
    };
};

/**
 * Async fetch team capacity and knowledge resilience for a project.
 * 
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<Object>}
 */
export const getProjectTeamIntelligence = async (projectId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const { getProjectDigitalTwin } = await import("./digitalTwinService.js");
    const digitalTwin = await getProjectDigitalTwin(projectId, userId);

    return {
        workload: calculateTeamWorkload(digitalTwin),
        resilience: calculateKnowledgeConcentration(digitalTwin)
    };
};

export default {
    KNOWLEDGE_RISK_SEVERITY,
    calculateTeamWorkload,
    calculateKnowledgeConcentration,
    getProjectTeamIntelligence
};
