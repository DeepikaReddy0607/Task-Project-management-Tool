import crypto from "crypto";
import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { buildDigitalTwin, getProjectDigitalTwin } from "./digitalTwinService.js";
import { calculateProjectHealth, HEALTH_STATUS } from "./projectHealthService.js";
import { calculateScheduleDrift, DRIFT_SEVERITY } from "./scheduleDriftService.js";
import { calculateDeadlineRisks, DEADLINE_RISK_LEVEL } from "./deadlineRiskService.js";
import { calculateTeamWorkload, calculateKnowledgeConcentration } from "./teamIntelligenceService.js";
import { runPreMortemAnalysis } from "./preMortemService.js";

/**
 * Scenario Status Lifecycle Constants
 */
export const SCENARIO_STATUS = {
    DRAFT: "DRAFT",
    SIMULATED: "SIMULATED",
    PROPOSED: "PROPOSED",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    EXECUTED: "EXECUTED",
    STALE: "STALE",
    EXPIRED: "EXPIRED",
    FAILED: "FAILED"
};

/**
 * Supported Scenario Mutation Types
 */
export const MUTATION_TYPES = {
    TASK_DELAY: "TASK_DELAY",
    TASK_DURATION_INCREASE: "TASK_DURATION_INCREASE",
    TASK_DURATION_DECREASE: "TASK_DURATION_DECREASE",
    TASK_COMPLETE: "TASK_COMPLETE",
    TASK_COMPLETION: "TASK_COMPLETION",
    TASK_REASSIGN: "TASK_REASSIGN",
    TASK_REASSIGNMENT: "TASK_REASSIGNMENT",
    TASK_PRIORITY_CHANGE: "TASK_PRIORITY_CHANGE",
    TASK_DUE_DATE_CHANGE: "TASK_DUE_DATE_CHANGE",
    DEPENDENCY_CREATE: "DEPENDENCY_CREATE",
    DEPENDENCY_REMOVE: "DEPENDENCY_REMOVE",
    DEPENDENCY_REPLACE: "DEPENDENCY_REPLACE",
    PROJECT_DEADLINE_CHANGE: "PROJECT_DEADLINE_CHANGE",
    SCOPE_CHANGE: "SCOPE_CHANGE"
};

/**
 * In-memory repository for scenarios (project-isolated, with TTL).
 * Map<scenarioId, scenarioObject>
 */
const scenarioStore = new Map();

/**
 * Helper to deep clone plain JS objects.
 */
export const deepClone = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;
    return JSON.parse(JSON.stringify(obj));
};

/**
 * Computes a deterministic SHA-256 state hash for a project based on its core fields.
 * Used for stale-state protection.
 */
export const computeProjectStateHash = ({ project, tasks = [], dependencies = [] }) => {
    const sortedTasks = [...tasks]
        .filter((t) => !t.is_archived)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((t) => ({
            id: t.id,
            status: t.status,
            priority: t.priority,
            estimated_hours: Number(t.estimated_hours || 0),
            due_date: t.due_date ? new Date(t.due_date).toISOString().split("T")[0] : null,
            assigned_to: t.assigned_to || null
        }));

    const sortedDeps = [...dependencies]
        .map((d) => ({
            task_id: d.task_id,
            depends_on_task_id: d.depends_on_task_id
        }))
        .sort((a, b) => `${a.task_id}->${a.depends_on_task_id}`.localeCompare(`${b.task_id}->${b.depends_on_task_id}`));

    const payload = JSON.stringify({
        projectId: project?.id,
        startDate: project?.start_date ? new Date(project.start_date).toISOString().split("T")[0] : null,
        endDate: project?.end_date ? new Date(project.end_date).toISOString().split("T")[0] : null,
        status: project?.status,
        tasks: sortedTasks,
        dependencies: sortedDeps
    });

    return crypto.createHash("sha256").update(payload).digest("hex");
};

/**
 * Validates a list of mutations against project data.
 * Returns structured validation result with any errors encountered.
 */
export const validateScenarioMutations = ({
    project,
    tasks = [],
    dependencies = [],
    projectMembers = [],
    mutations = []
}) => {
    const errors = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const memberSet = new Set((projectMembers || []).map((m) => m.user_id || m.id));

    if (!Array.isArray(mutations) || mutations.length === 0) {
        return { valid: true, errors: [] };
    }

    mutations.forEach((m, index) => {
        const prefix = `Mutation #${index + 1} (${m.type || "UNKNOWN"}): `;

        // Normalize mutation type
        const type = String(m.type || "").toUpperCase();

        switch (type) {
            case MUTATION_TYPES.TASK_DELAY: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                const days = Number(m.days);
                if (isNaN(days)) {
                    errors.push({ type: "INVALID_DAYS", message: `${prefix}Delay days must be a valid number.` });
                }
                break;
            }

            case MUTATION_TYPES.TASK_DURATION_INCREASE:
            case MUTATION_TYPES.TASK_DURATION_DECREASE: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                const hours = Number(m.hours);
                if (isNaN(hours) || hours <= 0) {
                    errors.push({ type: "INVALID_HOURS", message: `${prefix}Duration hours must be a positive number.` });
                }
                break;
            }

            case MUTATION_TYPES.TASK_COMPLETE:
            case MUTATION_TYPES.TASK_COMPLETION: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                break;
            }

            case MUTATION_TYPES.TASK_REASSIGN:
            case MUTATION_TYPES.TASK_REASSIGNMENT: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                if (m.toUserId && memberSet.size > 0 && !memberSet.has(m.toUserId)) {
                    // Check if member is in project member set
                    errors.push({ type: "INVALID_USER", message: `${prefix}User '${m.toUserId}' is not a recognized member of this project.` });
                }
                break;
            }

            case MUTATION_TYPES.TASK_PRIORITY_CHANGE: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                const validPriorities = ["Low", "Medium", "High", "Critical"];
                if (!validPriorities.includes(m.priority)) {
                    errors.push({ type: "INVALID_PRIORITY", message: `${prefix}Priority must be one of: ${validPriorities.join(", ")}.` });
                }
                break;
            }

            case MUTATION_TYPES.TASK_DUE_DATE_CHANGE: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                if (m.newDueDate && isNaN(new Date(m.newDueDate).getTime())) {
                    errors.push({ type: "INVALID_DATE", message: `${prefix}Invalid date format for newDueDate.` });
                }
                break;
            }

            case MUTATION_TYPES.DEPENDENCY_CREATE: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Child task '${m.taskId}' does not exist in project.` });
                }
                if (!m.dependsOnTaskId || !taskMap.has(m.dependsOnTaskId)) {
                    errors.push({ type: "INVALID_DEPENDENCY", message: `${prefix}Parent task '${m.dependsOnTaskId}' does not exist in project.` });
                }
                if (m.taskId === m.dependsOnTaskId) {
                    errors.push({ type: "SELF_DEPENDENCY", message: `${prefix}A task cannot depend on itself.` });
                }
                break;
            }

            case MUTATION_TYPES.DEPENDENCY_REMOVE: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' does not exist in project.` });
                }
                if (!m.dependsOnTaskId || !taskMap.has(m.dependsOnTaskId)) {
                    errors.push({ type: "INVALID_DEPENDENCY", message: `${prefix}Dependency target '${m.dependsOnTaskId}' does not exist in project.` });
                }
                break;
            }

            case MUTATION_TYPES.DEPENDENCY_REPLACE: {
                if (!m.taskId || !taskMap.has(m.taskId)) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Child task '${m.taskId}' does not exist in project.` });
                }
                if (!m.newDependsOnTaskId || !taskMap.has(m.newDependsOnTaskId)) {
                    errors.push({ type: "INVALID_DEPENDENCY", message: `${prefix}New parent task '${m.newDependsOnTaskId}' does not exist in project.` });
                }
                if (m.taskId === m.newDependsOnTaskId) {
                    errors.push({ type: "SELF_DEPENDENCY", message: `${prefix}A task cannot depend on itself.` });
                }
                break;
            }

            case MUTATION_TYPES.PROJECT_DEADLINE_CHANGE: {
                if (m.newEndDate && isNaN(new Date(m.newEndDate).getTime())) {
                    errors.push({ type: "INVALID_DATE", message: `${prefix}Invalid date format for new project deadline.` });
                }
                if (m.daysOffset !== undefined && isNaN(Number(m.daysOffset))) {
                    errors.push({ type: "INVALID_DAYS", message: `${prefix}daysOffset must be a valid number.` });
                }
                break;
            }

            case MUTATION_TYPES.SCOPE_CHANGE: {
                if (m.action === "REMOVE_TASK" && (!m.taskId || !taskMap.has(m.taskId))) {
                    errors.push({ type: "INVALID_TASK", message: `${prefix}Task '${m.taskId}' to remove does not exist in project.` });
                }
                if (m.action === "ADD_TASK" && (!m.taskData || !m.taskData.title)) {
                    errors.push({ type: "INVALID_TASK_DATA", message: `${prefix}New task must contain a title.` });
                }
                break;
            }

            default:
                errors.push({ type: "UNKNOWN_MUTATION", message: `${prefix}Unsupported mutation type '${m.type}'.` });
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Applies mutations in-memory to deep-cloned tasks, dependencies, members, and project.
 * Guarantees zero mutation of live database or original reference objects.
 */
export const applyMutationsInMemory = ({
    clonedProject,
    clonedTasks,
    clonedDependencies,
    clonedMembers,
    mutations = [],
    startOfToday = getStartOfTodayUtc()
}) => {
    const affectedTaskIds = new Set();
    const affectedUserIds = new Set();
    const warnings = [];

    mutations.forEach((m) => {
        const type = String(m.type || "").toUpperCase();

        switch (type) {
            case MUTATION_TYPES.TASK_DELAY: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    const currentDue = task.due_date ? new Date(task.due_date) : new Date(startOfToday);
                    const newDue = new Date(currentDue.getTime() + Number(m.days) * 24 * 60 * 60 * 1000);
                    task.due_date = newDue.toISOString();
                    affectedTaskIds.add(task.id);
                    if (task.assigned_to) affectedUserIds.add(task.assigned_to);
                }
                break;
            }

            case MUTATION_TYPES.TASK_DURATION_INCREASE: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    const currentHours = Number(task.estimated_hours || 0);
                    task.estimated_hours = currentHours + Number(m.hours);
                    affectedTaskIds.add(task.id);
                    if (task.assigned_to) affectedUserIds.add(task.assigned_to);
                }
                break;
            }

            case MUTATION_TYPES.TASK_DURATION_DECREASE: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    const currentHours = Number(task.estimated_hours || 0);
                    task.estimated_hours = Math.max(1, currentHours - Number(m.hours));
                    affectedTaskIds.add(task.id);
                    if (task.assigned_to) affectedUserIds.add(task.assigned_to);
                }
                break;
            }

            case MUTATION_TYPES.TASK_COMPLETE:
            case MUTATION_TYPES.TASK_COMPLETION: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    task.status = "Completed";
                    affectedTaskIds.add(task.id);
                    if (task.assigned_to) affectedUserIds.add(task.assigned_to);
                }
                break;
            }

            case MUTATION_TYPES.TASK_REASSIGN:
            case MUTATION_TYPES.TASK_REASSIGNMENT: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    const oldUser = task.assigned_to;
                    task.assigned_to = m.toUserId || null;
                    if (m.toUserName) {
                        task.users_tasks_assigned_toTousers = {
                            id: m.toUserId,
                            first_name: m.toUserName.split(" ")[0] || m.toUserName,
                            last_name: m.toUserName.split(" ").slice(1).join(" ") || "",
                            email: `${m.toUserId}@workspace.local`
                        };
                    }
                    affectedTaskIds.add(task.id);
                    if (oldUser) affectedUserIds.add(oldUser);
                    if (m.toUserId) affectedUserIds.add(m.toUserId);
                }
                break;
            }

            case MUTATION_TYPES.TASK_PRIORITY_CHANGE: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    task.priority = m.priority;
                    affectedTaskIds.add(task.id);
                }
                break;
            }

            case MUTATION_TYPES.TASK_DUE_DATE_CHANGE: {
                const task = clonedTasks.find((t) => t.id === m.taskId);
                if (task) {
                    task.due_date = m.newDueDate ? new Date(m.newDueDate).toISOString() : null;
                    affectedTaskIds.add(task.id);
                    if (task.assigned_to) affectedUserIds.add(task.assigned_to);
                }
                break;
            }

            case MUTATION_TYPES.DEPENDENCY_CREATE: {
                // Ensure edge does not already exist
                const exists = clonedDependencies.some(
                    (d) => d.task_id === m.taskId && d.depends_on_task_id === m.dependsOnTaskId
                );
                if (!exists) {
                    clonedDependencies.push({
                        task_id: m.taskId,
                        depends_on_task_id: m.dependsOnTaskId
                    });
                }
                affectedTaskIds.add(m.taskId);
                affectedTaskIds.add(m.dependsOnTaskId);
                break;
            }

            case MUTATION_TYPES.DEPENDENCY_REMOVE: {
                const index = clonedDependencies.findIndex(
                    (d) => d.task_id === m.taskId && d.depends_on_task_id === m.dependsOnTaskId
                );
                if (index !== -1) {
                    clonedDependencies.splice(index, 1);
                }
                affectedTaskIds.add(m.taskId);
                affectedTaskIds.add(m.dependsOnTaskId);
                break;
            }

            case MUTATION_TYPES.DEPENDENCY_REPLACE: {
                const index = clonedDependencies.findIndex(
                    (d) => d.task_id === m.taskId && d.depends_on_task_id === m.oldDependsOnTaskId
                );
                if (index !== -1) {
                    clonedDependencies.splice(index, 1);
                }
                const exists = clonedDependencies.some(
                    (d) => d.task_id === m.taskId && d.depends_on_task_id === m.newDependsOnTaskId
                );
                if (!exists) {
                    clonedDependencies.push({
                        task_id: m.taskId,
                        depends_on_task_id: m.newDependsOnTaskId
                    });
                }
                affectedTaskIds.add(m.taskId);
                if (m.oldDependsOnTaskId) affectedTaskIds.add(m.oldDependsOnTaskId);
                affectedTaskIds.add(m.newDependsOnTaskId);
                break;
            }

            case MUTATION_TYPES.PROJECT_DEADLINE_CHANGE: {
                if (m.newEndDate) {
                    clonedProject.end_date = new Date(m.newEndDate).toISOString();
                } else if (m.daysOffset !== undefined) {
                    const currentEnd = clonedProject.end_date ? new Date(clonedProject.end_date) : new Date(startOfToday);
                    clonedProject.end_date = new Date(currentEnd.getTime() + Number(m.daysOffset) * 24 * 60 * 60 * 1000).toISOString();
                }
                break;
            }

            case MUTATION_TYPES.SCOPE_CHANGE: {
                if (m.action === "REMOVE_TASK") {
                    const taskIndex = clonedTasks.findIndex((t) => t.id === m.taskId);
                    if (taskIndex !== -1) {
                        clonedTasks.splice(taskIndex, 1);
                        affectedTaskIds.add(m.taskId);
                    }
                    // Remove connected dependencies
                    for (let i = clonedDependencies.length - 1; i >= 0; i--) {
                        if (clonedDependencies[i].task_id === m.taskId || clonedDependencies[i].depends_on_task_id === m.taskId) {
                            clonedDependencies.splice(i, 1);
                        }
                    }
                } else if (m.action === "ADD_TASK" && m.taskData) {
                    const newId = m.taskData.id || `sim_task_${crypto.randomUUID().slice(0, 8)}`;
                    clonedTasks.push({
                        id: newId,
                        title: m.taskData.title,
                        status: m.taskData.status || "To Do",
                        priority: m.taskData.priority || "Medium",
                        estimated_hours: Number(m.taskData.estimated_hours || 8),
                        due_date: m.taskData.due_date || null,
                        assigned_to: m.taskData.assigned_to || null,
                        is_archived: false,
                        project_id: clonedProject.id
                    });
                    affectedTaskIds.add(newId);
                }
                break;
            }
        }
    });

    return {
        affectedTasks: Array.from(affectedTaskIds),
        affectedUsers: Array.from(affectedUserIds),
        warnings
    };
};

/**
 * Executes a deterministic What-If simulation against a project's Digital Twin.
 * 
 * Safety invariants:
 * - Pure in-memory computation
 * - ZERO database writes
 * - ZERO Socket.IO broadcasts
 * - Deterministic, reproducible calculations
 */
export const runScenarioSimulation = ({
    project,
    tasks = [],
    dependencies = [],
    projectMembers = [],
    risks = [],
    decisions = [],
    mutations = [],
    baseDigitalTwin = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    // 1. Validate mutations
    const validation = validateScenarioMutations({
        project,
        tasks,
        dependencies,
        projectMembers,
        mutations
    });

    if (!validation.valid) {
        return {
            valid: false,
            errors: validation.errors
        };
    }

    // 2. Build or reuse baseline Digital Twin
    const baseline = baseDigitalTwin || buildDigitalTwin({
        project,
        tasks,
        dependencies,
        projectMembers,
        risks,
        decisions,
        startOfToday
    });

    const baselineHealth = calculateProjectHealth(baseline, { startOfToday });
    const baselineDrift = calculateScheduleDrift(baseline, startOfToday);
    const baselineDeadlineRisks = calculateDeadlineRisks(baseline);
    const baselineWorkload = calculateTeamWorkload(baseline);
    const baselineKnowledge = calculateKnowledgeConcentration(baseline);

    // 3. Clone relevant state in memory
    const clonedProject = deepClone(project);
    const clonedTasks = deepClone(tasks);
    const clonedDependencies = deepClone(dependencies);
    const clonedMembers = deepClone(projectMembers);
    const clonedRisks = deepClone(risks);
    const clonedDecisions = deepClone(decisions);

    // 4. Apply mutations to clones
    const { affectedTasks, affectedUsers, warnings: mutationWarnings } = applyMutationsInMemory({
        clonedProject,
        clonedTasks,
        clonedDependencies,
        clonedMembers,
        mutations,
        startOfToday
    });

    // 5. Recalculate intelligence stack on simulated state
    const simulatedTwin = buildDigitalTwin({
        project: clonedProject,
        tasks: clonedTasks,
        dependencies: clonedDependencies,
        projectMembers: clonedMembers,
        risks: clonedRisks,
        decisions: clonedDecisions,
        startOfToday
    });

    const simulatedHealth = calculateProjectHealth(simulatedTwin, { startOfToday });
    const simulatedDrift = calculateScheduleDrift(simulatedTwin, startOfToday);
    const simulatedDeadlineRisks = calculateDeadlineRisks(simulatedTwin);
    const simulatedWorkload = calculateTeamWorkload(simulatedTwin);
    const simulatedKnowledge = calculateKnowledgeConcentration(simulatedTwin);
    const simulatedPreMortem = runPreMortemAnalysis(simulatedTwin);

    // 6. Compute deltas & impacts
    const oldCritical = new Set(baseline.criticalPath.criticalTasks || []);
    const newCritical = new Set(simulatedTwin.criticalPath.criticalTasks || []);

    const addedCriticalTasks = Array.from(newCritical).filter((id) => !oldCritical.has(id));
    const removedCriticalTasks = Array.from(oldCritical).filter((id) => !newCritical.has(id));

    const oldBottlenecks = new Map((baseline.bottlenecks.items || []).map((b) => [b.taskId, b]));
    const newBottlenecks = new Map((simulatedTwin.bottlenecks.items || []).map((b) => [b.taskId, b]));

    const addedBottlenecks = Array.from(newBottlenecks.keys()).filter((id) => !oldBottlenecks.has(id));
    const removedBottlenecks = Array.from(oldBottlenecks.keys()).filter((id) => !newBottlenecks.has(id));

    const warnings = [...mutationWarnings];
    if (simulatedTwin.criticalPath.hasCycle) {
        warnings.push("Simulation detected a circular dependency deadlock in the proposed task sequence!");
    }
    if (simulatedDrift.deltaDays > baselineDrift.deltaDays) {
        const addedDays = simulatedDrift.deltaDays - baselineDrift.deltaDays;
        warnings.push(`Proposed changes delay project completion by +${addedDays} additional day(s).`);
    }

    const baselineDeadlineRisksTotal = Array.isArray(baselineDeadlineRisks) ? baselineDeadlineRisks.length : (baselineDeadlineRisks?.summary?.total || 0);
    const simulatedDeadlineRisksTotal = Array.isArray(simulatedDeadlineRisks) ? simulatedDeadlineRisks.length : (simulatedDeadlineRisks?.summary?.total || 0);
    const simulatedDeadlineRisksCritical = Array.isArray(simulatedDeadlineRisks) ? simulatedDeadlineRisks.filter((r) => r.riskLevel === "CRITICAL").length : (simulatedDeadlineRisks?.summary?.critical || 0);

    const delta = {
        scheduleVarianceDays: simulatedDrift.deltaDays - baselineDrift.deltaDays,
        healthScoreDelta: simulatedHealth.score - baselineHealth.score,
        criticalTasksDelta: (simulatedTwin.criticalPath.criticalTasks || []).length - (baseline.criticalPath.criticalTasks || []).length,
        bottlenecksDelta: simulatedTwin.bottlenecks.count - baseline.bottlenecks.count,
        deadlineRisksDelta: simulatedDeadlineRisksTotal - baselineDeadlineRisksTotal,
        workloadConcentrationDelta: simulatedKnowledge.concentrationScore - baselineKnowledge.concentrationScore
    };

    const impact = {
        schedule: {
            plannedEnd: simulatedTwin.project.endDate,
            projectedEnd: simulatedDrift.projectedEndDate,
            deltaDays: simulatedDrift.deltaDays,
            severity: simulatedDrift.severity,
            varianceDelta: delta.scheduleVarianceDays
        },
        health: {
            baselineScore: baselineHealth.score,
            simulatedScore: simulatedHealth.score,
            scoreDelta: delta.healthScoreDelta,
            baselineStatus: baselineHealth.status,
            simulatedStatus: simulatedHealth.status
        },
        criticalPath: {
            oldCriticalTasks: Array.from(oldCritical),
            newCriticalTasks: Array.from(newCritical),
            addedCriticalTasks,
            removedCriticalTasks,
            hasCycle: simulatedTwin.criticalPath.hasCycle,
            durationChangeDays: simulatedTwin.criticalPath.criticalPathDuration - baseline.criticalPath.criticalPathDuration
        },
        bottlenecks: {
            newBottlenecks: addedBottlenecks.map((id) => newBottlenecks.get(id)),
            removedBottlenecks: removedBottlenecks.map((id) => oldBottlenecks.get(id)),
            baselineCount: baseline.bottlenecks.count,
            simulatedCount: simulatedTwin.bottlenecks.count
        },
        deadlineRisks: {
            baselineTotal: baselineDeadlineRisksTotal,
            simulatedTotal: simulatedDeadlineRisksTotal,
            criticalCount: simulatedDeadlineRisksCritical
        },
        team: {
            baselineConcentration: baselineKnowledge.concentrationScore,
            simulatedConcentration: simulatedKnowledge.concentrationScore,
            members: simulatedWorkload.members
        },
        dependencies: {
            hasCycle: simulatedTwin.dependencies.hasCycle,
            blockedChains: simulatedTwin.dependencies.blockedChains,
            totalDependencies: simulatedTwin.dependencies.total
        }
    };

    return {
        valid: true,
        baseline: {
            projectedEnd: baselineDrift.projectedEndDate,
            scheduleVarianceDays: baselineDrift.deltaDays,
            healthScore: baselineHealth.score,
            healthStatus: baselineHealth.status,
            criticalTasksCount: (baseline.criticalPath.criticalTasks || []).length,
            bottlenecksCount: baseline.bottlenecks.count,
            majorBottlenecksCount: baseline.bottlenecks.majorBottlenecksCount,
            deadlineRisksCount: baselineDeadlineRisksTotal,
            workloadConcentrationScore: baselineKnowledge.concentrationScore,
            hasCycle: baseline.criticalPath.hasCycle
        },
        scenario: {
            projectedEnd: simulatedDrift.projectedEndDate,
            scheduleVarianceDays: simulatedDrift.deltaDays,
            healthScore: simulatedHealth.score,
            healthStatus: simulatedHealth.status,
            criticalTasksCount: (simulatedTwin.criticalPath.criticalTasks || []).length,
            bottlenecksCount: simulatedTwin.bottlenecks.count,
            majorBottlenecksCount: simulatedTwin.bottlenecks.majorBottlenecksCount,
            deadlineRisksCount: simulatedDeadlineRisksTotal,
            workloadConcentrationScore: simulatedKnowledge.concentrationScore,
            hasCycle: simulatedTwin.criticalPath.hasCycle,
            preMortemFindingsCount: simulatedPreMortem.summary.total
        },
        delta,
        impact,
        warnings,
        affectedTasks,
        affectedUsers,
        simulatedDigitalTwin: simulatedTwin,
        simulatedDependencies: clonedDependencies
    };
};

/**
 * Creates and registers a new Scenario in the in-memory store.
 */
export const createProjectScenario = async ({
    projectId,
    userId,
    name = "Untitled Scenario",
    description = "",
    mutations = []
}) => {
    // 1. Verify project access
    await verifyProjectAccess(projectId, userId);

    // 2. Fetch digital twin as base snapshot
    const digitalTwin = await getProjectDigitalTwin(projectId, userId);

    // 3. Compute base state hash
    const baseStateHash = computeProjectStateHash({
        project: digitalTwin.project,
        tasks: digitalTwin.tasks.items || [],
        dependencies: digitalTwin.dependencies
    });

    const scenarioId = `scen_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h TTL

    const scenarioRecord = {
        scenarioId,
        projectId,
        userId,
        name,
        description,
        baseStateHash,
        mutations,
        simulatedState: null,
        impact: null,
        createdAt,
        expiresAt,
        status: SCENARIO_STATUS.DRAFT
    };

    scenarioStore.set(scenarioId, scenarioRecord);
    return scenarioRecord;
};

/**
 * Simulates a scenario by ID and updates its in-memory status.
 */
export const simulateProjectScenario = async ({
    projectId,
    userId,
    scenarioId,
    mutations = null
}) => {
    await verifyProjectAccess(projectId, userId);

    let scenario = scenarioStore.get(scenarioId);
    if (!scenario || scenario.projectId !== projectId) {
        const error = new Error(`Scenario '${scenarioId}' not found for project.`);
        error.statusCode = 404;
        throw error;
    }

    const appliedMutations = mutations || scenario.mutations || [];

    // Fetch live project records to simulate against
    const [project, tasks, dependencies, projectMembers, risks, decisions] = await Promise.all([
        prisma.projects.findUnique({ where: { id: projectId } }),
        prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: projectId, is_archived: false }
            }
        }),
        prisma.project_members.findMany({
            where: { project_id: projectId },
            include: { users: true, roles: true }
        }),
        prisma.risks.findMany({ where: { project_id: projectId } }),
        prisma.decisions.findMany({ where: { project_id: projectId } })
    ]);

    const result = runScenarioSimulation({
        project,
        tasks,
        dependencies,
        projectMembers,
        risks,
        decisions,
        mutations: appliedMutations
    });

    if (!result.valid) {
        scenario.status = SCENARIO_STATUS.FAILED;
        return result;
    }

    // Update scenario record
    scenario.mutations = appliedMutations;
    scenario.simulatedState = result.scenario;
    scenario.impact = result.impact;
    scenario.delta = result.delta;
    scenario.warnings = result.warnings;
    scenario.affectedTasks = result.affectedTasks;
    scenario.affectedUsers = result.affectedUsers;
    scenario.status = SCENARIO_STATUS.SIMULATED;

    return {
        ...result,
        scenarioId,
        status: scenario.status
    };
};

/**
 * Retrieves a scenario by ID.
 */
export const getProjectScenario = async (projectId, scenarioId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const scenario = scenarioStore.get(scenarioId);
    if (!scenario || scenario.projectId !== projectId) {
        const error = new Error(`Scenario '${scenarioId}' not found.`);
        error.statusCode = 404;
        throw error;
    }
    return scenario;
};

/**
 * Lists all scenarios for a given project.
 */
export const listProjectScenarios = async (projectId, userId) => {
    await verifyProjectAccess(projectId, userId);
    const scenarios = [];
    for (const s of scenarioStore.values()) {
        if (s.projectId === projectId) {
            scenarios.push(s);
        }
    }
    return scenarios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Clears in-memory scenario store (used for test teardown).
 */
export const clearScenarioStore = () => {
    scenarioStore.clear();
};
