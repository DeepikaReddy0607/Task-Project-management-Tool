import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { deepClone } from "./scenarioSimulationService.js";
import { calculateCriticalPath } from "./criticalPathService.js";
import { calculateProjectHealth } from "./projectHealthService.js";
import { buildDigitalTwin } from "./digitalTwinService.js";

const inMemoryResourceStore = new Map();

export const clearResourceStore = () => {
    inMemoryResourceStore.clear();
};

export const setInMemoryResourceData = (key, data) => {
    inMemoryResourceStore.set(key, data);
};

/**
 * Calculates deterministic Resource Pressure Score (0-100) for a member.
 * Strictly measures operational scheduling load without evaluating employee performance.
 * 
 * Dimensions:
 * - Active tasks count (25%)
 * - Estimated hours / capacity (25%)
 * - Critical tasks count (20%)
 * - Overdue tasks count (15%)
 * - Multi-project deadline conflicts (15%)
 */
export const calculateResourcePressureScore = ({
    activeTaskCount,
    activeTasksCount,
    estimatedHours = 0,
    criticalTaskCount,
    criticalTasksCount,
    overdueTaskCount,
    overdueTasksCount,
    deadlineConflictsCount = 0
} = {}) => {
    const aCount = activeTaskCount ?? activeTasksCount ?? 0;
    const cCount = criticalTaskCount ?? criticalTasksCount ?? 0;
    const oCount = overdueTaskCount ?? overdueTasksCount ?? 0;

    const taskScore = Math.min(100, (aCount / 10) * 100);
    const hoursScore = Math.min(100, (estimatedHours / 40) * 100);
    const criticalScore = Math.min(100, (cCount / 2) * 100);
    const overdueScore = Math.min(100, (oCount / 2) * 100);
    const conflictScore = Math.min(100, (deadlineConflictsCount / 2) * 100);

    const weightedScore = Math.round(
        taskScore * 0.20 +
        hoursScore * 0.20 +
        criticalScore * 0.25 +
        overdueScore * 0.20 +
        conflictScore * 0.15
    );

    const bounded = Math.max(0, Math.min(100, weightedScore));
    let level = "NORMAL";
    if (bounded >= 85) level = "CRITICAL";
    else if (bounded >= 65) level = "HIGH";
    else if (bounded >= 35) level = "ELEVATED";

    return {
        score: bounded,
        level,
        label: "Resource Pressure",
        breakdown: {
            taskScore,
            hoursScore,
            criticalScore,
            overdueScore,
            conflictScore
        }
    };
};

/**
 * Pure in-memory simulation of resource unavailability across projects.
 * What happens if a person is unavailable for N days?
 * 
 * Zero database mutations, zero real-time event emissions, zero notifications.
 */
export const simulateResourceUnavailability = ({
    userId,
    unavailableDays = 5,
    projectsData = [], // Array of { project, tasks, dependencies, members, risks }
    projects = null,
    tasks = null,
    dependencies = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!userId) {
        throw new Error("User ID is required for resource unavailability simulation");
    }

    let normalizedProjectsData = projectsData;
    if ((!normalizedProjectsData || normalizedProjectsData.length === 0) && projects && tasks) {
        normalizedProjectsData = projects.map((p) => ({
            project: p,
            tasks: tasks.filter((t) => t.project_id === p.id || !t.project_id),
            dependencies: dependencies || []
        }));
    }

    const days = Math.max(1, Math.round(Number(unavailableDays) || 5));
    const results = [];
    let totalAffectedTasks = 0;

    normalizedProjectsData.forEach((pData) => {
        // Deep clone state to guarantee 100% isolation
        const clonedProject = deepClone(pData.project);
        const clonedTasks = deepClone(pData.tasks || []);
        const clonedDeps = deepClone(pData.dependencies || []);
        const clonedMembers = deepClone(pData.members || []);
        const clonedRisks = deepClone(pData.risks || []);

        // Baseline CPM & Health
        const baselineCPM = calculateCriticalPath({
            project: clonedProject,
            tasks: clonedTasks,
            dependencies: clonedDeps,
            startOfToday
        });

        const baselineTwin = buildDigitalTwin({
            project: clonedProject,
            tasks: clonedTasks,
            dependencies: clonedDeps,
            projectMembers: clonedMembers,
            risks: clonedRisks,
            startOfToday
        });

        const baselineHealth = calculateProjectHealth(baselineTwin);

        // Apply simulated unavailability:
        // For each incomplete task assigned to this user, add `days` to its duration
        let projectAffectedTasksCount = 0;
        clonedTasks.forEach((t) => {
            if (t.assigned_to === userId && t.status !== "Completed" && !t.is_archived) {
                projectAffectedTasksCount++;
                totalAffectedTasks++;
                // Add estimated hours corresponding to unavailable days (8h/day)
                t.estimated_hours = Number(t.estimated_hours || 0) + (days * 8);
            }
        });

        if (projectAffectedTasksCount === 0) {
            // Project is unaffected by this user's unavailability
            results.push({
                projectId: clonedProject.id,
                projectTitle: clonedProject.title,
                isAffected: false,
                affectedTasksCount: 0,
                baselineProjectedDays: baselineCPM.projectCriticalPathDays || 0,
                simulatedProjectedDays: baselineCPM.projectCriticalPathDays || 0,
                projectedDelayDays: 0,
                baselineHealthScore: baselineHealth.healthScore,
                simulatedHealthScore: baselineHealth.healthScore,
                healthScoreDelta: 0,
                newCriticalTasks: []
            });
            return;
        }

        // Recalculate CPM & Health on simulated state
        const simulatedCPM = calculateCriticalPath({
            project: clonedProject,
            tasks: clonedTasks,
            dependencies: clonedDeps,
            startOfToday
        });

        const simulatedTwin = buildDigitalTwin({
            project: clonedProject,
            tasks: clonedTasks,
            dependencies: clonedDeps,
            projectMembers: clonedMembers,
            risks: clonedRisks,
            startOfToday
        });

        const simulatedHealth = calculateProjectHealth(simulatedTwin);

        const baselineDays = baselineCPM.projectCriticalPathDays || 0;
        const simulatedDays = simulatedCPM.projectCriticalPathDays || 0;
        const delayDays = Math.max(0, simulatedDays - baselineDays);

        const baselineCritSet = new Set(baselineCPM.criticalTaskIds || []);
        const newCritical = (simulatedCPM.criticalTaskIds || []).filter((id) => !baselineCritSet.has(id));

        results.push({
            projectId: clonedProject.id,
            projectTitle: clonedProject.title,
            isAffected: true,
            affectedTasksCount: projectAffectedTasksCount,
            baselineProjectedDays: baselineDays,
            simulatedProjectedDays: simulatedDays,
            projectedDelayDays: delayDays,
            baselineHealthScore: baselineHealth.healthScore,
            simulatedHealthScore: simulatedHealth.healthScore,
            healthScoreDelta: simulatedHealth.healthScore - baselineHealth.healthScore,
            newCriticalTasks: newCritical
        });
    });

    const affectedProjects = results.filter((r) => r.isAffected).map((p) => ({
        ...p,
        additionalDriftDays: Math.max(days, p.projectedDelayDays)
    }));
    const maxDelay = affectedProjects.reduce((max, p) => Math.max(max, p.projectedDelayDays), 0);
    const minDelay = affectedProjects.length > 0
        ? affectedProjects.reduce((min, p) => Math.min(min, p.projectedDelayDays), Infinity)
        : 0;

    return {
        userId,
        unavailableDays: days,
        totalAffectedProjects: affectedProjects.length,
        totalAffectedTasks,
        delayedTasksCount: totalAffectedTasks,
        affectedProjects,
        projectedDelayRangeDays: {
            min: minDelay === Infinity ? 0 : minDelay,
            max: maxDelay
        },
        projects: results,
        disclaimer: "This is a purely in-memory simulated scenario. No real-world assignments, dates, or database records have been modified."
    };
};

/**
 * Retrieve workspace-level resource conflicts and pressure metrics.
 */
export const getResourceConflicts = async (workspaceId, userId) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (inMemoryResourceStore.has(workspaceId)) {
        return inMemoryResourceStore.get(workspaceId);
    }

    // Verify workspace access
    const isUuid = typeof workspaceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId);
    if (!isUuid) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    const membership = await prisma.workspace_members.findFirst({
        where: { workspace_id: workspaceId, user_id: userId }
    });

    if (!membership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    // Fetch projects user is authorized to inspect
    const projects = await prisma.projects.findMany({
        where: { workspace_id: workspaceId, is_archived: false },
        include: { project_members: { select: { user_id: true } } }
    });

    const authorized = projects.filter((p) =>
        membership.workspace_role === "Owner" ||
        membership.workspace_role === "Admin" ||
        p.manager_id === userId ||
        p.project_members.some((m) => m.user_id === userId)
    );

    const projectIds = authorized.map((p) => p.id);

    const tasks = await prisma.tasks.findMany({
        where: { project_id: { in: projectIds }, is_archived: false },
        include: {
            users_tasks_assigned_toTousers: {
                select: { id: true, first_name: true, last_name: true, email: true }
            }
        }
    });

    const startOfToday = getStartOfTodayUtc();
    const userMap = new Map();

    tasks.forEach((t) => {
        const uId = t.assigned_to;
        if (!uId) return;

        if (!userMap.has(uId)) {
            userMap.set(uId, {
                userId: uId,
                name: t.users_tasks_assigned_toTousers ? `${t.users_tasks_assigned_toTousers.first_name || ""} ${t.users_tasks_assigned_toTousers.last_name || ""}`.trim() : "Member",
                activeTasks: 0,
                estimatedHours: 0,
                criticalTasks: 0,
                overdueTasks: 0,
                projectIds: new Set()
            });
        }

        const u = userMap.get(uId);
        u.projectIds.add(t.project_id);

        if (t.status !== "Completed") {
            u.activeTasks++;
            u.estimatedHours += Number(t.estimated_hours || 0);
            if (t.priority === "High" || t.priority === "Critical") u.criticalTasks++;
            if (t.due_date && new Date(t.due_date) < startOfToday) u.overdueTasks++;
        }
    });

    const resourcePressureList = [];
    userMap.forEach((u) => {
        const pressure = calculateResourcePressureScore({
            activeTaskCount: u.activeTasks,
            estimatedHours: u.estimatedHours,
            criticalTaskCount: u.criticalTasks,
            overdueTaskCount: u.overdueTasks,
            deadlineConflictsCount: u.projectIds.size >= 2 ? 1 : 0
        });

        resourcePressureList.push({
            userId: u.userId,
            name: u.name,
            projectCount: u.projectIds.size,
            activeTasks: u.activeTasks,
            estimatedHours: u.estimatedHours,
            criticalTasks: u.criticalTasks,
            overdueTasks: u.overdueTasks,
            pressureScore: pressure.score,
            pressureLevel: pressure.level,
            pressureBreakdown: pressure.breakdown
        });
    });

    resourcePressureList.sort((a, b) => b.pressureScore - a.pressureScore);

    return {
        workspaceId,
        totalEvaluatedMembers: resourcePressureList.length,
        highPressureCount: resourcePressureList.filter((r) => r.pressureLevel === "HIGH" || r.pressureLevel === "CRITICAL").length,
        members: resourcePressureList,
        disclaimer: "Resource pressure metrics quantify structural scheduling constraints without assessing individual performance or capability."
    };
};

export const getResourceConflictIntelligence = getResourceConflicts;
export const simulateUnavailableResource = simulateResourceUnavailability;

