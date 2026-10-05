import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";

// ============================================================
// CONSTANTS & SEVERITIES
// ============================================================

export const DRIFT_SEVERITY = Object.freeze({
    NONE: "NONE",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
});

/**
 * Determine drift severity from variance in days.
 * 
 * @param {number} deltaDays 
 * @param {boolean} hasCycle 
 * @returns {string} Severity enum
 */
export const determineDriftSeverity = (deltaDays, hasCycle = false) => {
    if (hasCycle) return DRIFT_SEVERITY.CRITICAL;
    if (deltaDays <= 0) return DRIFT_SEVERITY.NONE;
    if (deltaDays <= 2) return DRIFT_SEVERITY.LOW;
    if (deltaDays <= 5) return DRIFT_SEVERITY.MEDIUM;
    if (deltaDays <= 10) return DRIFT_SEVERITY.HIGH;
    return DRIFT_SEVERITY.CRITICAL;
};

/**
 * Pure deterministic calculation of schedule drift.
 * 
 * @param {Object} digitalTwin Structured digital twin
 * @param {Date} [startOfToday]
 * @returns {Object} Schedule drift intelligence payload
 */
export const calculateScheduleDrift = (digitalTwin, startOfToday = getStartOfTodayUtc()) => {
    if (!digitalTwin) {
        return {
            plannedStartDate: null,
            plannedEndDate: null,
            projectedEndDate: null,
            plannedDurationDays: 0,
            projectedDurationDays: 0,
            deltaDays: 0,
            scheduleVariance: 0,
            severity: DRIFT_SEVERITY.NONE,
            hasCycle: false,
            reasons: ["No project data available."]
        };
    }

    const { project, tasks, criticalPath } = digitalTwin;
    const hasCycle = Boolean(criticalPath?.hasCycle);
    const reasons = [];

    if (hasCycle) {
        return {
            plannedStartDate: project?.startDate || null,
            plannedEndDate: project?.endDate || null,
            projectedEndDate: null,
            plannedDurationDays: project?.plannedDurationDays || 0,
            projectedDurationDays: 0,
            deltaDays: 0,
            scheduleVariance: 0,
            severity: DRIFT_SEVERITY.CRITICAL,
            hasCycle: true,
            reasons: ["Schedule calculations are blocked due to a circular dependency in project tasks."]
        };
    }

    // 1. Resolve planned start and end dates
    let plannedStart = project?.startDate ? new Date(project.startDate) : null;
    let plannedEnd = project?.endDate ? new Date(project.endDate) : null;

    // Fallback planned start to today if undefined
    const baseStart = plannedStart && !isNaN(plannedStart.getTime()) ? plannedStart : startOfToday;

    // 2. Resolve projected end date from CPM critical path
    const cpmDuration = criticalPath?.projectDurationDays || project?.projectedDurationDays || 0;
    let projectedEnd = new Date(baseStart.getTime() + cpmDuration * 24 * 60 * 60 * 1000);

    // If plannedEnd was not specified, infer from plannedDurationDays or latest task due date
    if (!plannedEnd) {
        if (project?.plannedDurationDays > 0) {
            plannedEnd = new Date(baseStart.getTime() + project.plannedDurationDays * 24 * 60 * 60 * 1000);
        } else {
            plannedEnd = projectedEnd;
        }
    }

    // 3. Compute delta in days
    const diffMs = projectedEnd.getTime() - plannedEnd.getTime();
    const rawDelta = Math.round(diffMs / (24 * 60 * 60 * 1000));
    const deltaDays = Math.max(0, rawDelta);
    const scheduleVariance = rawDelta;
    const severity = determineDriftSeverity(deltaDays, false);

    // 4. Build explainable reasons
    if (deltaDays > 0) {
        reasons.push(`Projected completion is ${deltaDays} day${deltaDays > 1 ? "s" : ""} later than the planned deadline.`);
        if (project?.plannedDurationDays && cpmDuration > project.plannedDurationDays) {
            const pathDiff = cpmDuration - project.plannedDurationDays;
            reasons.push(`Critical path duration (${cpmDuration} days) exceeds the planned project duration (${project.plannedDurationDays} days) by ${pathDiff} day${pathDiff > 1 ? "s" : ""}.`);
        }
        if (tasks?.overdue > 0) {
            reasons.push(`${tasks.overdue} overdue task${tasks.overdue > 1 ? "s are" : " is"} contributing to downstream schedule delay.`);
        }
    } else {
        reasons.push("Project is currently projected to finish on or ahead of the planned deadline.");
    }

    return {
        plannedStartDate: plannedStart ? plannedStart.toISOString() : null,
        plannedEndDate: plannedEnd ? plannedEnd.toISOString() : null,
        projectedEndDate: projectedEnd ? projectedEnd.toISOString() : null,
        plannedDurationDays: project?.plannedDurationDays || cpmDuration,
        projectedDurationDays: cpmDuration,
        deltaDays,
        scheduleVariance,
        severity,
        hasCycle: false,
        reasons
    };
};

/**
 * Async database fetch and schedule drift calculation for a project.
 * 
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<Object>} Schedule drift report
 */
export const getProjectScheduleDrift = async (projectId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const { getProjectDigitalTwin } = await import("./digitalTwinService.js");
    const digitalTwin = await getProjectDigitalTwin(projectId, userId);
    return calculateScheduleDrift(digitalTwin);
};

export default {
    DRIFT_SEVERITY,
    determineDriftSeverity,
    calculateScheduleDrift,
    getProjectScheduleDrift
};
