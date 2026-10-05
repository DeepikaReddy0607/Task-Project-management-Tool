import crypto from "crypto";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { getProjectDigitalTwin } from "./digitalTwinService.js";
import {
    computeProjectStateHash,
    runScenarioSimulation,
    MUTATION_TYPES,
    SCENARIO_STATUS
} from "./scenarioSimulationService.js";

/**
 * In-memory storage for replanning proposals (project-scoped, TTL protected).
 * Map<proposalId, proposalRecord>
 */
const proposalStore = new Map();

/**
 * Replanning Strategy Enums
 */
export const REPLANNING_STRATEGIES = {
    SEQUENCE_OPTIMIZATION: "SEQUENCE_OPTIMIZATION",
    WORKLOAD_BALANCING: "WORKLOAD_BALANCING",
    BOTTLENECK_RELIEF: "BOTTLENECK_RELIEF",
    DEADLINE_RECOVERY: "DEADLINE_RECOVERY",
    SCOPE_PRESSURE: "SCOPE_PRESSURE",
    ALL: "ALL"
};

const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Generates deterministic replanning proposals to recover deadlines, alleviate bottlenecks,
 * or balance workload.
 * 
 * Safety invariants:
 * - Read-only analysis
 * - Generates proposals ONLY, never executes autonomously
 * - Includes factual rationale, evidence, risks, and assumptions
 * - Computes baseStateHash for stale-state protection
 */
export const generateReplanningProposals = async ({
    projectId,
    userId,
    strategy = REPLANNING_STRATEGIES.ALL,
    digitalTwin = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    // 1. Verify access and load Digital Twin
    let twin = digitalTwin;
    if (!twin) {
        if (isUuid(projectId)) {
            await verifyProjectAccess(projectId, userId);
        }
        twin = await getProjectDigitalTwin(projectId, userId);
    }

    const baseStateHash = computeProjectStateHash({
        project: twin.project,
        tasks: twin.tasks.items || [],
        dependencies: twin.dependencies
    });

    const proposals = [];
    const tasks = twin.tasks.items || [];
    const members = twin.team.members || [];
    const criticalTaskIds = new Set(twin.criticalPath.criticalTasks || []);
    const bottlenecks = twin.bottlenecks?.items || twin.bottlenecks?.majorBottlenecks || [];
    const plannedDuration = twin.project.plannedDurationDays || 1;
    const projectedDuration = twin.criticalPath.projectDurationDays || 1;
    const isDrifting = projectedDuration > plannedDuration;

    // ========================================================
    // STRATEGY B: WORKLOAD BALANCING
    // ========================================================
    if (strategy === REPLANNING_STRATEGIES.ALL || strategy === REPLANNING_STRATEGIES.WORKLOAD_BALANCING || strategy === REPLANNING_STRATEGIES.DEADLINE_RECOVERY) {
        if (members.length > 1) {
            const sortedByHours = [...members].sort((a, b) => (b.remainingHours || 0) - (a.remainingHours || 0));
            const heaviest = sortedByHours[0];
            const lightest = sortedByHours[sortedByHours.length - 1];
            const heavyUserId = heaviest.userId || heaviest.user_id || heaviest.id;
            const lightUserId = lightest.userId || lightest.user_id || lightest.id;

            const totalRemaining = members.reduce((sum, m) => sum + (m.remainingHours || 0), 0);
            const heavyShare = totalRemaining > 0 ? (heaviest.remainingHours / totalRemaining) * 100 : 0;

            if (heavyShare >= 40 && heaviest.remainingHours > lightest.remainingHours + 16) {
                // Find a critical or high-effort task assigned to heaviest member to reassign to lightest
                const candidateTasks = tasks.filter(
                    (t) => (t.assigned_to === heavyUserId) && t.status !== "Completed"
                ).sort((a, b) => {
                    const aCrit = criticalTaskIds.has(a.id) ? 1 : 0;
                    const bCrit = criticalTaskIds.has(b.id) ? 1 : 0;
                    return bCrit - aCrit || (b.estimated_hours || 0) - (a.estimated_hours || 0);
                });

                if (candidateTasks.length > 0) {
                    const taskToMove = candidateTasks[0];
                    const mutations = [
                        {
                            type: MUTATION_TYPES.TASK_REASSIGN,
                            taskId: taskToMove.id,
                            toUserId: lightUserId,
                            toUserName: lightest.name
                        }
                    ];

                    const sim = runScenarioSimulation({
                        project: twin.project,
                        tasks,
                        dependencies: twin.dependencies,
                        projectMembers: twin.team.members,
                        mutations,
                        baseDigitalTwin: twin,
                        startOfToday
                    });

                    proposals.push({
                        proposalId: `prop_${crypto.randomUUID()}`,
                        projectId,
                        title: `Rebalance Workload: Move '${taskToMove.title}' to ${lightest.name}`,
                        strategy: REPLANNING_STRATEGIES.WORKLOAD_BALANCING,
                        rationale: `${heaviest.name} currently holds ${Math.round(heavyShare)}% of project hours (${heaviest.remainingHours}h), while ${lightest.name} has only ${lightest.remainingHours}h.`,
                        proposedChanges: [
                            {
                                type: MUTATION_TYPES.TASK_REASSIGN,
                                taskId: taskToMove.id,
                                taskTitle: taskToMove.title,
                                fromUserId: heavyUserId,
                                fromUserName: heaviest.name,
                                toUserId: lightUserId,
                                toUserName: lightest.name,
                                estimatedHours: taskToMove.estimated_hours
                            }
                        ],
                        projectedImpact: {
                            projectedCompletion: {
                                before: sim.baseline.projectedEnd,
                                after: sim.scenario.projectedEnd,
                                deltaDays: sim.delta.scheduleVarianceDays
                            },
                            health: {
                                before: sim.baseline.healthScore,
                                after: sim.scenario.healthScore,
                                scoreDelta: sim.delta.healthScoreDelta
                            },
                            criticalTasks: {
                                before: sim.baseline.criticalTasksCount,
                                after: sim.scenario.criticalTasksCount
                            },
                            bottlenecks: {
                                before: sim.baseline.bottlenecksCount,
                                after: sim.scenario.bottlenecksCount
                            },
                            workloadConcentration: {
                                before: sim.baseline.workloadConcentrationScore,
                                after: sim.scenario.workloadConcentrationScore
                            }
                        },
                        evidence: [
                            `${heaviest.name} workload share: ${Math.round(heavyShare)}% (${heaviest.remainingHours}h remaining)`,
                            `${lightest.name} available capacity: only ${lightest.remainingHours}h assigned`,
                            `Task '${taskToMove.title}' estimated effort: ${taskToMove.estimated_hours}h`
                        ],
                        risks: [
                            "Task assignment suitability cannot be fully guaranteed without an explicit skill matrix."
                        ],
                        warnings: [
                            "Task assignment suitability cannot be fully guaranteed without an explicit skill matrix."
                        ],
                        assumptions: [
                            `${lightest.name} has the requisite domain context to execute '${taskToMove.title}' at equivalent velocity.`
                        ],
                        baseStateHash,
                        generatedAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        status: SCENARIO_STATUS.PROPOSED
                    });
                }
            }
        }
    }

    // ========================================================
    // STRATEGY C: BOTTLENECK RELIEF
    // ========================================================
    if (strategy === REPLANNING_STRATEGIES.ALL || strategy === REPLANNING_STRATEGIES.BOTTLENECK_RELIEF || strategy === REPLANNING_STRATEGIES.DEADLINE_RECOVERY) {
        const majorBottlenecks = bottlenecks.filter(
            (b) => (b.severity === "CRITICAL" || b.severity === "HIGH")
        );

        if (majorBottlenecks.length > 0) {
            const topBottleneck = majorBottlenecks[0];
            const bnTask = tasks.find((t) => t.id === topBottleneck.taskId);

            if (bnTask) {
                // If unassigned or assigned to someone overloaded, propose assigning to lightest member
                const sortedByHours = [...members].sort((a, b) => (a.remainingHours || 0) - (b.remainingHours || 0));
                const eligibleAssignee = sortedByHours.find((m) => (m.userId || m.user_id || m.id) !== bnTask.assigned_to) || sortedByHours[0];
                const eligibleUserId = eligibleAssignee ? (eligibleAssignee.userId || eligibleAssignee.user_id || eligibleAssignee.id) : null;

                const mutations = [];
                const proposedChanges = [];

                if (eligibleAssignee && bnTask.assigned_to !== eligibleUserId) {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_REASSIGN,
                        taskId: bnTask.id,
                        toUserId: eligibleUserId,
                        toUserName: eligibleAssignee.name
                    });
                    proposedChanges.push({
                        type: MUTATION_TYPES.TASK_REASSIGN,
                        taskId: bnTask.id,
                        taskTitle: bnTask.title,
                        toUserId: eligibleUserId,
                        toUserName: eligibleAssignee.name,
                        details: `Dedicate ${eligibleAssignee.name} to expedite resolution of bottleneck task.`
                    });
                }

                // If priority is not Critical, elevate to Critical to reflect true workflow impact
                if (bnTask.priority !== "Critical") {
                    mutations.push({
                        type: MUTATION_TYPES.TASK_PRIORITY_CHANGE,
                        taskId: bnTask.id,
                        priority: "Critical"
                    });
                    proposedChanges.push({
                        type: MUTATION_TYPES.TASK_PRIORITY_CHANGE,
                        taskId: bnTask.id,
                        taskTitle: bnTask.title,
                        priority: "Critical",
                        details: `Elevate priority to Critical to prevent downstream deadlock.`
                    });
                }

                if (mutations.length > 0) {
                    const sim = runScenarioSimulation({
                        project: twin.project,
                        tasks,
                        dependencies: twin.dependencies,
                        projectMembers: twin.team.members,
                        mutations,
                        baseDigitalTwin: twin,
                        startOfToday
                    });

                    proposals.push({
                        proposalId: `prop_${crypto.randomUUID()}`,
                        projectId,
                        title: `Relieve Bottleneck on '${bnTask.title}'`,
                        strategy: REPLANNING_STRATEGIES.BOTTLENECK_RELIEF,
                        rationale: `Task '${bnTask.title}' is a ${topBottleneck.severity} bottleneck directly obstructing ${topBottleneck.blockedDownstreamCount} downstream task(s).`,
                        proposedChanges,
                        projectedImpact: {
                            projectedCompletion: {
                                before: sim.baseline.projectedEnd,
                                after: sim.scenario.projectedEnd,
                                deltaDays: sim.delta.scheduleVarianceDays
                            },
                            health: {
                                before: sim.baseline.healthScore,
                                after: sim.scenario.healthScore,
                                scoreDelta: sim.delta.healthScoreDelta
                            },
                            criticalTasks: {
                                before: sim.baseline.criticalTasksCount,
                                after: sim.scenario.criticalTasksCount
                            },
                            bottlenecks: {
                                before: sim.baseline.bottlenecksCount,
                                after: sim.scenario.bottlenecksCount
                            },
                            workloadConcentration: {
                                before: sim.baseline.workloadConcentrationScore,
                                after: sim.scenario.workloadConcentrationScore
                            }
                        },
                        evidence: [
                            `Bottleneck severity: ${topBottleneck.severity} (score: ${topBottleneck.score})`,
                            `Directly blocks ${topBottleneck.blockedDownstreamCount} downstream task(s)`,
                            `Current task priority: ${bnTask.priority}`
                        ],
                        risks: [
                            "Elevating priority does not reduce physical effort; it ensures immediate team focus."
                        ],
                        warnings: [
                            "Elevating priority does not reduce physical effort; it ensures immediate team focus."
                        ],
                        assumptions: [
                            "Expediting this blocker unblocks the longest dependent downstream execution chain."
                        ],
                        baseStateHash,
                        generatedAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        status: SCENARIO_STATUS.PROPOSED
                    });
                }
            }
        }
    }

    // ========================================================
    // STRATEGY A: SEQUENCE OPTIMIZATION / PARALLELIZATION
    // ========================================================
    if (strategy === REPLANNING_STRATEGIES.ALL || strategy === REPLANNING_STRATEGIES.SEQUENCE_OPTIMIZATION || strategy === REPLANNING_STRATEGIES.DEADLINE_RECOVERY) {
        // Look for dependencies between critical path tasks that might be parallelizable
        const deps = twin.dependencies || [];
        const criticalDeps = deps.filter(
            (d) => criticalTaskIds.has(d.task_id) && criticalTaskIds.has(d.depends_on_task_id)
        );

        if (criticalDeps.length > 0) {
            // Find a dependency where parent and child could potentially execute in parallel
            const targetDep = criticalDeps[0];
            const childTask = tasks.find((t) => t.id === targetDep.task_id);
            const parentTask = tasks.find((t) => t.id === targetDep.depends_on_task_id);

            if (childTask && parentTask) {
                const mutations = [
                    {
                        type: MUTATION_TYPES.DEPENDENCY_REMOVE,
                        taskId: targetDep.task_id,
                        dependsOnTaskId: targetDep.depends_on_task_id
                    }
                ];

                const sim = runScenarioSimulation({
                    project: twin.project,
                    tasks,
                    dependencies: twin.dependencies,
                    projectMembers: twin.team.members,
                    mutations,
                    baseDigitalTwin: twin,
                    startOfToday
                });

                if (sim.valid && !sim.scenario.hasCycle) {
                    const daysSaved = sim.baseline.scheduleVarianceDays - sim.scenario.scheduleVarianceDays;
                    proposals.push({
                        proposalId: `prop_${crypto.randomUUID()}`,
                        projectId,
                        title: `Parallelize '${childTask.title}' & '${parentTask.title}'`,
                        strategy: REPLANNING_STRATEGIES.SEQUENCE_OPTIMIZATION,
                        rationale: `Removing the serial dependency constraint allows '${childTask.title}' to proceed in parallel with '${parentTask.title}', saving critical path duration.`,
                        proposedChanges: [
                            {
                                type: MUTATION_TYPES.DEPENDENCY_REMOVE,
                                taskId: targetDep.task_id,
                                taskTitle: childTask.title,
                                dependsOnTaskId: targetDep.depends_on_task_id,
                                dependsOnTaskTitle: parentTask.title,
                                details: `Remove prerequisite link to enable concurrent execution.`
                            }
                        ],
                        projectedImpact: {
                            projectedCompletion: {
                                before: sim.baseline.projectedEnd,
                                after: sim.scenario.projectedEnd,
                                deltaDays: sim.delta.scheduleVarianceDays
                            },
                            health: {
                                before: sim.baseline.healthScore,
                                after: sim.scenario.healthScore,
                                scoreDelta: sim.delta.healthScoreDelta
                            },
                            criticalTasks: {
                                before: sim.baseline.criticalTasksCount,
                                after: sim.scenario.criticalTasksCount
                            },
                            bottlenecks: {
                                before: sim.baseline.bottlenecksCount,
                                after: sim.scenario.bottlenecksCount
                            },
                            workloadConcentration: {
                                before: sim.baseline.workloadConcentrationScore,
                                after: sim.scenario.workloadConcentrationScore
                            }
                        },
                        evidence: [
                            `Both tasks sit on the critical path (slack = 0)`,
                            `Simulated schedule compression: ${Math.abs(daysSaved)} day(s) recovered`
                        ],
                        risks: [
                            "User must confirm that no implicit technical dependency exists between these two tasks before approving."
                        ],
                        warnings: [
                            "User must confirm that no implicit technical dependency exists between these two tasks before approving."
                        ],
                        assumptions: [
                            "Team has sufficient concurrent staffing to work on both tasks simultaneously."
                        ],
                        baseStateHash,
                        generatedAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        status: SCENARIO_STATUS.PROPOSED
                    });
                }
            }
        }
    }

    // ========================================================
    // STRATEGY E: SCOPE PRESSURE
    // ========================================================
    if (proposals.length === 0 && isDrifting) {
        proposals.push({
            proposalId: `prop_${crypto.randomUUID()}`,
            projectId,
            title: `Schedule Feasibility Alert (Scope Pressure)`,
            strategy: REPLANNING_STRATEGIES.SCOPE_PRESSURE,
            rationale: `Remaining work (${twin.tasks.remainingEstimatedHours}h across ${twin.tasks.incomplete} incomplete tasks) exceeds the available schedule under the current dependency structure.`,
            proposedChanges: [],
            projectedImpact: {
                projectedCompletion: {
                    before: twin.project.endDate,
                    after: null,
                    deltaDays: projectedDuration - plannedDuration
                },
                health: {
                    before: 50,
                    after: 50,
                    scoreDelta: 0
                },
                criticalTasks: {
                    before: (twin.criticalPath.criticalTasks || []).length,
                    after: (twin.criticalPath.criticalTasks || []).length
                },
                bottlenecks: {
                    before: twin.bottlenecks.count,
                    after: twin.bottlenecks.count
                },
                workloadConcentration: {
                    before: 0,
                    after: 0
                }
            },
            evidence: [
                `Project deadline: ${twin.project.endDate || "Unset"}`,
                `Planned duration: ${plannedDuration} days vs. Critical path: ${projectedDuration} days`,
                `Remaining incomplete tasks: ${twin.tasks.incomplete}`
            ],
            risks: [
                "Schedule recovery is mathematically infeasible without adjusting project deadline or scope."
            ],
            warnings: [
                "Schedule recovery is mathematically infeasible without adjusting project deadline or scope."
            ],
            assumptions: [
                "Existing task estimates reflect genuine baseline effort."
            ],
            baseStateHash,
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: SCENARIO_STATUS.PROPOSED
        });
    }

    // Store generated proposals in in-memory repository
    proposals.forEach((p) => {
        proposalStore.set(p.proposalId, p);
    });

    return {
        projectId,
        generatedAt: new Date().toISOString(),
        totalProposals: proposals.length,
        baseStateHash,
        proposals
    };
};

/**
 * Retrieves a single proposal by ID.
 */
export const getProjectProposal = async (projectId, proposalId, userId) => {
    if (userId && isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
    }
    const proposal = proposalStore.get(proposalId);
    if (!proposal || proposal.projectId !== projectId) {
        const error = new Error(`Proposal '${proposalId}' not found.`);
        error.statusCode = 404;
        throw error;
    }
    return proposal;
};

/**
 * Lists all active proposals for a project.
 */
export const listProjectProposals = async (projectId, userId) => {
    if (userId && isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
    }
    const list = [];
    for (const p of proposalStore.values()) {
        if (p.projectId === projectId) {
            list.push(p);
        }
    }
    return list.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
};

/**
 * Explicitly marks a proposal as APPROVED.
 * Does NOT execute it immediately; execution requires an explicit execute call.
 */
export const approveProjectProposal = async (projectId, proposalId, userId) => {
    const proposal = proposalStore.get(proposalId);
    if (!proposal || proposal.projectId !== projectId) {
        const error = new Error(`Proposal '${proposalId}' not found.`);
        error.statusCode = 404;
        throw error;
    }

    if (userId && isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
    }

    if (proposal.status === SCENARIO_STATUS.EXECUTED) {
        const error = new Error("Proposal has already been executed.");
        error.statusCode = 400;
        throw error;
    }

    // Check expiration
    if (new Date(proposal.expiresAt) < new Date()) {
        proposal.status = SCENARIO_STATUS.EXPIRED;
        const error = new Error("Proposal has expired. Please generate a fresh replanning plan.");
        error.statusCode = 400;
        throw error;
    }

    proposal.status = SCENARIO_STATUS.APPROVED;
    proposal.approvedBy = userId;
    proposal.approvedAt = new Date().toISOString();

    return proposal;
};

/**
 * Explicitly marks a proposal as REJECTED.
 */
export const rejectProjectProposal = async (projectId, proposalId, userId, reason = "") => {
    const proposal = proposalStore.get(proposalId);
    if (!proposal || proposal.projectId !== projectId) {
        const error = new Error(`Proposal '${proposalId}' not found.`);
        error.statusCode = 404;
        throw error;
    }

    if (userId && isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
    }

    proposal.status = SCENARIO_STATUS.REJECTED;
    proposal.rejectedBy = userId;
    proposal.rejectedAt = new Date().toISOString();
    proposal.rejectionReason = reason;

    return proposal;
};

/**
 * Clears proposal store (used for test teardown).
 */
export const clearProposalStore = () => {
    proposalStore.clear();
};
