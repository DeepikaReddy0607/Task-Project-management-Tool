import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================

export const DEADLINE_RISK_LEVEL = Object.freeze({
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW"
});

const RISK_LEVEL_ORDER = Object.freeze({
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4
});

/**
 * Pure deterministic calculation of tasks threatening the project deadline.
 * 
 * @param {Object} digitalTwin Structured digital twin
 * @param {Date} [startOfToday]
 * @returns {Array<Object>} Sorted list of deadline risk tasks
 */
export const calculateDeadlineRisks = (digitalTwin, startOfToday = getStartOfTodayUtc()) => {
    if (!digitalTwin || !digitalTwin.tasks) return [];

    const { criticalPath, bottlenecks, dependencies } = digitalTwin;
    const isCycle = Boolean(criticalPath?.hasCycle);

    // If project has cycle, tasks in cycle are all critical risks
    if (isCycle) {
        return (criticalPath.cycleNodes || []).map((node) => ({
            taskId: typeof node === "string" ? node : node.taskId || node.id,
            title: typeof node === "string" ? node : node.title || node.taskId,
            riskLevel: DEADLINE_RISK_LEVEL.CRITICAL,
            reason: "Task is part of a circular dependency blocking the entire schedule.",
            downstreamImpact: 1,
            slack: 0,
            dueDate: null,
            estimatedEffort: 0
        }));
    }

    const criticalTaskIds = new Set(criticalPath?.criticalTasks || []);
    const bottleneckMap = new Map();
    (bottlenecks?.items || []).forEach((bn) => {
        bottleneckMap.set(bn.taskId, bn);
    });

    const deadlineRisks = [];

    // Inspect active tasks directly from digitalTwin
    // (If tasks array has detailed objects or through bottlenecks/CP)
    const taskCandidates = new Map();

    // From bottleneck items:
    (bottlenecks?.items || []).forEach((bn) => {
        taskCandidates.set(bn.taskId, {
            id: bn.taskId,
            title: bn.title,
            slack: bn.totalSlack !== undefined ? bn.totalSlack : (bn.slack !== undefined ? bn.slack : (criticalTaskIds.has(bn.taskId) ? 0 : 5)),
            dueDate: bn.dueDate || bn.due_date || null,
            estimatedEffort: bn.estimatedHours || bn.estimated_hours || 0,
            downstreamCount: bn.blockedDownstreamCount || bn.transitiveBlockedCount || bn.directCount || bn.transitiveCount || 0,
            isBottleneck: true,
            bnSeverity: bn.severity
        });
    });

    // From critical path items:
    (criticalPath?.criticalPath || []).forEach((cpItem) => {
        const id = typeof cpItem === "string" ? cpItem : cpItem.taskId || cpItem.id;
        const title = typeof cpItem === "string" ? cpItem : cpItem.title || id;
        const slack = cpItem.totalSlack !== undefined ? cpItem.totalSlack : (cpItem.slack !== undefined ? cpItem.slack : 0);
        const existing = taskCandidates.get(id);

        if (existing) {
            existing.isCritical = true;
            existing.slack = slack;
        } else {
            taskCandidates.set(id, {
                id,
                title,
                slack,
                dueDate: cpItem.dueDate || null,
                estimatedEffort: cpItem.durationDays ? cpItem.durationDays * 8 : 0,
                downstreamCount: 1,
                isCritical: true,
                bnSeverity: null
            });
        }
    });

    // Evaluate each candidate task
    taskCandidates.forEach((task) => {
        const isCritical = criticalTaskIds.has(task.id) || task.slack === 0;
        let isOverdue = false;
        let daysOverdue = 0;

        if (task.dueDate) {
            const d = new Date(task.dueDate);
            if (!isNaN(d.getTime()) && d < startOfToday) {
                isOverdue = true;
                daysOverdue = Math.max(1, Math.round((startOfToday.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)));
            }
        }

        let riskLevel = null;
        let reason = "";

        if (isCritical && isOverdue) {
            riskLevel = DEADLINE_RISK_LEVEL.CRITICAL;
            reason = `Overdue critical task (${daysOverdue}d overdue) directly delays the project deadline.`;
        } else if (task.bnSeverity === "CRITICAL" && isCritical) {
            riskLevel = DEADLINE_RISK_LEVEL.CRITICAL;
            reason = `Critical bottleneck on the critical path blocking ${task.downstreamCount} downstream task(s).`;
        } else if (isCritical) {
            riskLevel = DEADLINE_RISK_LEVEL.HIGH;
            reason = "Zero-slack critical task; any delay immediately pushes the project deadline.";
        } else if (isOverdue && task.downstreamCount > 0) {
            riskLevel = DEADLINE_RISK_LEVEL.HIGH;
            reason = `Overdue task blocking ${task.downstreamCount} downstream dependent task(s).`;
        } else if (task.slack !== null && task.slack <= 1) {
            riskLevel = DEADLINE_RISK_LEVEL.MEDIUM;
            reason = `Near-zero slack (${task.slack} day); highly sensitive to downstream slippage.`;
        } else if (task.bnSeverity === "HIGH" || task.bnSeverity === "MEDIUM") {
            riskLevel = DEADLINE_RISK_LEVEL.MEDIUM;
            reason = `Active workflow bottleneck blocking ${task.downstreamCount} dependent task(s).`;
        } else if (isOverdue) {
            riskLevel = DEADLINE_RISK_LEVEL.LOW;
            reason = `Overdue by ${daysOverdue} day(s), but has available slack.`;
        }

        if (riskLevel) {
            deadlineRisks.push({
                taskId: task.id,
                title: task.title,
                riskLevel,
                reason,
                downstreamImpact: task.downstreamCount,
                slack: task.slack !== null && task.slack !== undefined ? task.slack : 0,
                dueDate: task.dueDate,
                estimatedEffort: task.estimatedEffort,
                isOverdue,
                daysOverdue
            });
        }
    });

    // Deterministic sorting:
    // 1. riskLevel severity (CRITICAL first, then HIGH, MEDIUM, LOW)
    // 2. slack ascending
    // 3. daysOverdue descending
    // 4. title alphabetically
    deadlineRisks.sort((a, b) => {
        const orderA = RISK_LEVEL_ORDER[a.riskLevel] || 99;
        const orderB = RISK_LEVEL_ORDER[b.riskLevel] || 99;
        if (orderA !== orderB) return orderA - orderB;

        if (a.slack !== b.slack) return a.slack - b.slack;
        if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
        return a.title.localeCompare(b.title);
    });

    return deadlineRisks;
};

/**
 * Async fetch and calculate deadline risks for a project.
 * 
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<Array<Object>>}
 */
export const getProjectDeadlineRisks = async (projectId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const { getProjectDigitalTwin } = await import("./digitalTwinService.js");
    const digitalTwin = await getProjectDigitalTwin(projectId, userId);
    return calculateDeadlineRisks(digitalTwin);
};

export default {
    DEADLINE_RISK_LEVEL,
    calculateDeadlineRisks,
    getProjectDeadlineRisks
};
