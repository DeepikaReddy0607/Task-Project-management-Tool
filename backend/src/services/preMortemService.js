import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";

// ============================================================
// CONSTANTS & SEVERITIES
// ============================================================

export const PREMORTEM_SEVERITY = Object.freeze({
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW"
});

const SEVERITY_ORDER = Object.freeze({
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4
});

/**
 * Pure deterministic predictive pre-mortem analysis.
 * 
 * Analyzes current project state across 12 failure mechanisms and generates
 * explainable, evidence-backed findings.
 * 
 * @param {Object} digitalTwin Structured digital twin
 * @param {Date} [startOfToday]
 * @returns {{ findings: Array<Object>, summary: Object }}
 */
export const runPreMortemAnalysis = (digitalTwin, startOfToday = getStartOfTodayUtc()) => {
    if (!digitalTwin) {
        return {
            findings: [],
            summary: { total: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 }
        };
    }

    const { project, tasks, dependencies, criticalPath, bottlenecks, team, risks } = digitalTwin;
    const findings = [];
    let counter = 1;

    // ------------------------------------------------------------
    // 1. DEPENDENCY CYCLES (Deadlock)
    // ------------------------------------------------------------
    if (criticalPath?.hasCycle || dependencies?.hasCycle) {
        const cycleNodes = criticalPath?.cycleNodes || [];
        const cycleIds = cycleNodes.map((n) => typeof n === "string" ? n : n.taskId || n.id);
        const cycleTitles = cycleNodes.map((n) => typeof n === "string" ? n : n.title || n.taskId).join(", ") || "multiple tasks";

        findings.push({
            id: `prem-${counter++}`,
            type: "DEPENDENCY_CYCLES",
            severity: PREMORTEM_SEVERITY.CRITICAL,
            title: "Dependency Deadlock in Task Scheduling",
            explanation: "A circular dependency creates an impossible topological schedule where tasks indefinitely wait on each other.",
            evidence: [
                `Circular loop detected involving task(s): ${cycleTitles}`,
                "Schedule calculations, duration projections, and critical path analysis are completely stalled."
            ],
            affectedTaskIds: cycleIds,
            affectedUserIds: [],
            suggestedAction: "Break the cycle by removing or reversing at least one dependency relationship in the loop."
        });

        // If cycle exists, return immediately with this critical finding
        return {
            findings,
            summary: { total: 1, criticalCount: 1, highCount: 0, mediumCount: 0, lowCount: 0 }
        };
    }

    // ------------------------------------------------------------
    // 2. OVERDUE CRITICAL TASKS
    // ------------------------------------------------------------
    const criticalTaskIds = new Set(criticalPath?.criticalTasks || []);
    // Find tasks that are overdue on critical path
    const overdueCriticalTasks = [];

    (tasks?.items || []).forEach((t) => {
        const isCritical = criticalTaskIds.has(t.id);
        const isOverdue = t.status !== "Completed" && t.due_date && new Date(t.due_date) < startOfToday;
        if (isCritical && isOverdue) {
            overdueCriticalTasks.push(t);
        }
    });

    if (overdueCriticalTasks.length === 0) {
        (bottlenecks?.items || []).forEach((bn) => {
            if (criticalTaskIds.has(bn.taskId) && (bn.isOverdue || (bn.dueDate && new Date(bn.dueDate) < startOfToday))) {
                overdueCriticalTasks.push(bn);
            }
        });
    }

    if (overdueCriticalTasks.length > 0 || (tasks?.overdue > 0 && criticalTaskIds.size > 0)) {
        const count = overdueCriticalTasks.length > 0 ? overdueCriticalTasks.length : Math.min(tasks.overdue, criticalTaskIds.size);
        const evidence = overdueCriticalTasks.map((t) => {
            const daysOverdue = t.daysOverdue || (t.due_date ? Math.max(1, Math.round((startOfToday.getTime() - new Date(t.due_date).getTime()) / 86400000)) : 1);
            return `Task "${t.title}" is overdue (${daysOverdue}d overdue) with zero slack.`;
        });

        if (evidence.length === 0 && count > 0) {
            evidence.push(`${count} critical path task(s) are overdue, pushing back project delivery day-for-day.`);
        }

        findings.push({
            id: `prem-${counter++}`,
            type: "OVERDUE_CRITICAL_TASKS",
            severity: PREMORTEM_SEVERITY.CRITICAL,
            title: "Overdue Critical Tasks Threatening Deadline",
            explanation: `${count} critical task(s) are past their due dates, directly extending the project completion date.`,
            evidence,
            affectedTaskIds: overdueCriticalTasks.map((t) => t.id || t.taskId),
            affectedUserIds: [],
            suggestedAction: "Immediately expedite or unblock overdue critical tasks to halt cumulative project delay."
        });
    }

    // ------------------------------------------------------------
    // 3. SCHEDULE SLIPPAGE (Projected > Planned)
    // ------------------------------------------------------------
    const plannedDuration = project?.plannedDurationDays || 0;
    const projectedDuration = project?.projectedDurationDays || 0;
    const driftDays = Math.max(0, projectedDuration - plannedDuration);

    if (driftDays >= 3) {
        const severity = driftDays >= 6 ? PREMORTEM_SEVERITY.HIGH : PREMORTEM_SEVERITY.MEDIUM;
        findings.push({
            id: `prem-${counter++}`,
            type: "SCHEDULE_SLIPPAGE",
            severity,
            title: "Projected Schedule Slippage",
            explanation: `Current critical path projects completion ${driftDays} days later than the planned deadline.`,
            evidence: [
                `Planned duration: ${plannedDuration} days vs Projected duration: ${projectedDuration} days`,
                `Schedule variance: +${driftDays} days delay`
            ],
            affectedTaskIds: criticalPath?.criticalTasks?.slice(0, 3) || [],
            affectedUserIds: [],
            suggestedAction: "Re-evaluate task durations on the critical path or compress scope on remaining milestones."
        });
    }

    // ------------------------------------------------------------
    // 4. CRITICAL WORK CONCENTRATION
    // ------------------------------------------------------------
    const members = team?.members || [];
    if (members.length > 1 && criticalTaskIds.size > 0) {
        members.forEach((m) => {
            const share = m.criticalCount / criticalTaskIds.size;
            if (share >= 0.50 && m.criticalCount >= 2) {
                const percent = Math.round(share * 100);
                findings.push({
                    id: `prem-${counter++}`,
                    type: "CRITICAL_WORK_CONCENTRATION",
                    severity: percent >= 70 ? PREMORTEM_SEVERITY.HIGH : PREMORTEM_SEVERITY.MEDIUM,
                    title: "Critical Work Concentrated on Single Assignee",
                    explanation: `${m.name} is assigned to ${percent}% of all critical path tasks. Any disruption to this member halts project delivery.`,
                    evidence: [
                        `${m.name} holds ${m.criticalCount} of ${criticalTaskIds.size} critical tasks (${percent}%).`,
                        `${m.name} has ${m.remainingHours} remaining estimated hours.`
                    ],
                    affectedTaskIds: [],
                    affectedUserIds: [m.userId],
                    suggestedAction: `Reassign non-specialized critical tasks or pair ${m.name} with another team member.`
                });
            }
        });
    }

    // ------------------------------------------------------------
    // 5. UNASSIGNED CRITICAL WORK
    // ------------------------------------------------------------
    if (team?.unassignedCriticalCount > 0) {
        findings.push({
            id: `prem-${counter++}`,
            type: "UNASSIGNED_CRITICAL_WORK",
            severity: PREMORTEM_SEVERITY.HIGH,
            title: "Unassigned Critical Path Work",
            explanation: `${team.unassignedCriticalCount} critical task(s) currently have no assigned owner, creating immediate execution risk.`,
            evidence: [
                `${team.unassignedCriticalCount} critical task(s) lack an owner.`,
                `Unassigned critical work contributes ${team.unassignedHours || 0} estimated hours.`
            ],
            affectedTaskIds: [],
            affectedUserIds: [],
            suggestedAction: "Assign owners to all critical tasks to ensure clear accountability."
        });
    }

    // ------------------------------------------------------------
    // 6. BOTTLENECK CONCENTRATION
    // ------------------------------------------------------------
    const majorBottlenecks = (bottlenecks?.items || []).filter(
        (b) => b.severity === "CRITICAL" || b.severity === "HIGH"
    );
    if (majorBottlenecks.length > 0) {
        const topBn = majorBottlenecks[0];
        findings.push({
            id: `prem-${counter++}`,
            type: "BOTTLENECK_CONCENTRATION",
            severity: topBn.severity === "CRITICAL" ? PREMORTEM_SEVERITY.HIGH : PREMORTEM_SEVERITY.MEDIUM,
            title: "Severe Workflow Bottlenecks Blocking Downstream Work",
            explanation: `${majorBottlenecks.length} major bottleneck task(s) are severely restricting execution flow.`,
            evidence: majorBottlenecks.slice(0, 3).map((b) =>
                `Task "${b.title}" blocks ${b.blockedDownstreamCount || b.transitiveBlockedCount || b.directCount || b.transitiveCount || 1} downstream task(s) (Severity: ${b.severity}).`
            ),
            affectedTaskIds: majorBottlenecks.map((b) => b.taskId),
            affectedUserIds: [],
            suggestedAction: "Focus team efforts on finishing prerequisite bottleneck tasks to unblock downstream execution."
        });
    }

    // ------------------------------------------------------------
    // 7. HIGH SEVERITY PROJECT RISKS
    // ------------------------------------------------------------
    const criticalRisks = (risks?.items || []).filter((r) => r.severity === "Critical" && !r.mitigation_plan);
    const highRisks = (risks?.items || []).filter((r) => r.severity === "High" && !r.mitigation_plan);

    if (criticalRisks.length > 0 || highRisks.length > 0) {
        const unmitigatedCount = criticalRisks.length + highRisks.length;
        findings.push({
            id: `prem-${counter++}`,
            type: "HIGH_SEVERITY_PROJECT_RISKS",
            severity: criticalRisks.length > 0 ? PREMORTEM_SEVERITY.HIGH : PREMORTEM_SEVERITY.MEDIUM,
            title: "Unmitigated High-Severity Project Risks",
            explanation: `${unmitigatedCount} critical/high risk(s) in the project register lack active mitigation plans.`,
            evidence: [
                ...criticalRisks.slice(0, 2).map((r) => `Critical Risk: "${r.title}" has no mitigation plan defined.`),
                ...highRisks.slice(0, 2).map((r) => `High Risk: "${r.title}" has no mitigation plan defined.`)
            ],
            affectedTaskIds: [],
            affectedUserIds: [],
            suggestedAction: "Document actionable mitigation procedures for all open high-priority project risks."
        });
    }

    // ------------------------------------------------------------
    // 8. OVERLOADED TEAM MEMBERS
    // ------------------------------------------------------------
    if (members.length > 0) {
        const totalRemainingHours = members.reduce((sum, m) => sum + (m.remainingHours || 0), 0);
        members.forEach((m) => {
            if (m.overdueCount >= 4) {
                findings.push({
                    id: `prem-${counter++}`,
                    type: "OVERLOADED_MEMBERS",
                    severity: PREMORTEM_SEVERITY.MEDIUM,
                    title: `Overdue Backlog Accumulation for ${m.name}`,
                    explanation: `${m.name} has ${m.overdueCount} overdue tasks, indicating workload saturation.`,
                    evidence: [
                        `${m.name} has ${m.overdueCount} overdue tasks.`,
                        `Total remaining effort: ${m.remainingHours} hours across ${m.incompleteCount} pending tasks.`
                    ],
                    affectedTaskIds: [],
                    affectedUserIds: [m.userId],
                    suggestedAction: "Rebalance task assignments or extend due dates to prevent team burnout."
                });
            } else if (totalRemainingHours > 0 && (m.remainingHours / totalRemainingHours) > 0.65 && members.length > 1) {
                const percent = Math.round((m.remainingHours / totalRemainingHours) * 100);
                findings.push({
                    id: `prem-${counter++}`,
                    type: "OVERLOADED_MEMBERS",
                    severity: PREMORTEM_SEVERITY.MEDIUM,
                    title: `Workload Asymmetry for ${m.name}`,
                    explanation: `${m.name} carries ${percent}% of all remaining project hours.`,
                    evidence: [
                        `${m.name} holds ${m.remainingHours} of ${totalRemainingHours} total remaining project hours (${percent}%).`
                    ],
                    affectedTaskIds: [],
                    affectedUserIds: [m.userId],
                    suggestedAction: "Distribute pending work packages across available team members."
                });
            }
        });
    }

    // Sort findings deterministically by severity (CRITICAL first, then HIGH, MEDIUM, LOW)
    findings.sort((a, b) => (SEVERITY_ORDER[a.severity] || 99) - (SEVERITY_ORDER[b.severity] || 99));

    const summary = {
        total: findings.length,
        criticalCount: findings.filter((f) => f.severity === PREMORTEM_SEVERITY.CRITICAL).length,
        highCount: findings.filter((f) => f.severity === PREMORTEM_SEVERITY.HIGH).length,
        mediumCount: findings.filter((f) => f.severity === PREMORTEM_SEVERITY.MEDIUM).length,
        lowCount: findings.filter((f) => f.severity === PREMORTEM_SEVERITY.LOW).length
    };

    return {
        findings,
        summary
    };
};

/**
 * Async fetch and execute predictive pre-mortem analysis for a project.
 * 
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<Object>} Pre-mortem results
 */
export const getProjectPreMortem = async (projectId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const { getProjectDigitalTwin } = await import("./digitalTwinService.js");
    const digitalTwin = await getProjectDigitalTwin(projectId, userId);
    return runPreMortemAnalysis(digitalTwin);
};

export default {
    PREMORTEM_SEVERITY,
    runPreMortemAnalysis,
    getProjectPreMortem
};
