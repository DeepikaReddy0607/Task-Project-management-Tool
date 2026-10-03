import crypto from "crypto";
import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { calculateProjectRiskMetrics, verifyProjectAccess, determineRiskLevel } from "./projectRiskService.js";
import { scoreAndRankTasksInMemory, READINESS_STATES } from "./taskPriorityService.js";

/**
 * Helper: deep clone data structures to guarantee ZERO mutation of Prisma references
 */
const deepClone = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;
    return JSON.parse(JSON.stringify(obj));
};

/**
 * Helper: Format date nicely
 */
const formatDate = (date) => {
    if (!date) return "No date";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
};

/**
 * Retrieves projects accessible to the user across all workspace memberships.
 */
export const getUserAccessibleProjects = async (userId) => {
    const memberships = await prisma.workspace_members.findMany({
        where: { user_id: userId },
        select: { workspace_id: true }
    });
    const workspaceIds = memberships.map((m) => m.workspace_id);

    return prisma.projects.findMany({
        where: {
            workspace_id: { in: workspaceIds },
            is_archived: false
        },
        select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            status: true,
            start_date: true,
            end_date: true,
            workspace_id: true,
            manager_id: true
        },
        orderBy: { created_at: "desc" }
    });
};

/**
 * Canonical task resolver for What-If simulation and task actions.
 * Resolves task title to real task record using exact, case-insensitive, trimmed matching.
 * Context-aware:
 * - If inside a project, prefers tasks in that project.
 * - If on My Tasks, prefers tasks assigned to the user.
 * - If multiple duplicates exist across projects, returns AMBIGUOUS with list of projects.
 * - Does NOT use unsafe fuzzy matching that could select the wrong task.
 */
export const findAccessibleTaskByTitle = async ({
    title,
    userId,
    contextProjectId = null,
    pageContext = null
}) => {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
        return { found: false, reason: "EMPTY_TITLE" };
    }

    const accessibleProjects = await getUserAccessibleProjects(userId);
    if (!accessibleProjects || accessibleProjects.length === 0) {
        return { found: false, reason: "NO_PROJECTS" };
    }
    const accessibleProjectIds = accessibleProjects.map((p) => p.id);

    // Exact case-insensitive title lookup across accessible projects
    const candidateTasks = await prisma.tasks.findMany({
        where: {
            title: { equals: cleanTitle, mode: "insensitive" },
            project_id: { in: accessibleProjectIds },
            is_archived: false
        },
        include: {
            projects: {
                select: { id: true, title: true, is_archived: true }
            },
            users_tasks_assigned_toTousers: {
                select: { id: true, first_name: true, last_name: true, email: true }
            }
        }
    });

    // Ensure exact trimmed equality (case-insensitive)
    let exactMatches = candidateTasks.filter(
        (t) => t.title.trim().toLowerCase() === cleanTitle.toLowerCase()
    );

    if (exactMatches.length === 0) {
        // Fallback: If title was normalized without leading 'Task', check if 'Task <title>' exists
        if (!cleanTitle.toLowerCase().startsWith("task ")) {
            const fallbackTasks = await prisma.tasks.findMany({
                where: {
                    title: { equals: `Task ${cleanTitle}`, mode: "insensitive" },
                    project_id: { in: accessibleProjectIds },
                    is_archived: false
                },
                include: {
                    projects: {
                        select: { id: true, title: true, is_archived: true }
                    },
                    users_tasks_assigned_toTousers: {
                        select: { id: true, first_name: true, last_name: true, email: true }
                    }
                }
            });
            if (fallbackTasks.length === 1) {
                return {
                    found: true,
                    task: fallbackTasks[0],
                    taskId: fallbackTasks[0].id,
                    projectId: fallbackTasks[0].project_id,
                    projectTitle: fallbackTasks[0].projects?.title || "Project"
                };
            }
        }

        return {
            found: false,
            reason: "NOT_FOUND",
            title: cleanTitle
        };
    }

    if (exactMatches.length === 1) {
        return {
            found: true,
            task: exactMatches[0],
            taskId: exactMatches[0].id,
            projectId: exactMatches[0].project_id,
            projectTitle: exactMatches[0].projects?.title || "Project"
        };
    }

    // Multiple tasks with identical title:
    // 1. Prefer current project if inside a project
    if (contextProjectId) {
        const inCurrentProject = exactMatches.filter((t) => t.project_id === contextProjectId);
        if (inCurrentProject.length === 1) {
            return {
                found: true,
                task: inCurrentProject[0],
                taskId: inCurrentProject[0].id,
                projectId: inCurrentProject[0].project_id,
                projectTitle: inCurrentProject[0].projects?.title || "Project"
            };
        }
        if (inCurrentProject.length > 1) {
            return {
                found: false,
                reason: "AMBIGUOUS",
                title: cleanTitle,
                duplicates: inCurrentProject
            };
        }
    }

    // 2. If on My Tasks, prefer task assigned to current user
    if (pageContext === "tasks") {
        const assignedToUser = exactMatches.filter((t) => t.assigned_to === userId);
        if (assignedToUser.length === 1) {
            return {
                found: true,
                task: assignedToUser[0],
                taskId: assignedToUser[0].id,
                projectId: assignedToUser[0].project_id,
                projectTitle: assignedToUser[0].projects?.title || "Project"
            };
        }
    }

    // 3. Ambiguous across projects: do NOT guess arbitrarily
    return {
        found: false,
        reason: "AMBIGUOUS",
        title: cleanTitle,
        duplicates: exactMatches
    };
};

/**
 * Fetches all necessary project, task, and risk data for simulation in a single read-only transaction.
 * STRICT READ-ONLY: Never updates, creates, or deletes database records.
 */
export const fetchProjectSimulationData = async (projectId, userId) => {
    const project = await verifyProjectAccess(projectId, userId);

    const [tasks, risks] = await Promise.all([
        prisma.tasks.findMany({
            where: { project_id: projectId },
            include: {
                projects: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true,
                        end_date: true,
                        workspace_id: true,
                        is_archived: true
                    }
                },
                users_tasks_assigned_toTousers: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true
                    }
                },
                task_dependencies_task_dependencies_depends_on_task_idTotasks: {
                    include: {
                        tasks_task_dependencies_task_idTotasks: {
                            select: {
                                id: true,
                                title: true,
                                status: true,
                                is_archived: true,
                                priority: true,
                                due_date: true
                            }
                        }
                    }
                },
                task_dependencies_task_dependencies_task_idTotasks: {
                    include: {
                        tasks_task_dependencies_depends_on_task_idTotasks: {
                            select: {
                                id: true,
                                title: true,
                                status: true,
                                is_archived: true,
                                priority: true,
                                due_date: true
                            }
                        }
                    }
                }
            }
        }),
        prisma.risks ? prisma.risks.findMany({
            where: { project_id: projectId },
            include: {
                users: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                }
            }
        }) : []
    ]);

    return {
        project,
        tasks,
        risks
    };
};

/**
 * Builds baseline summary metrics from raw project data
 */
const extractSummaryMetrics = (riskAnalysis, prioritizedTasks) => {
    return {
        riskScore: riskAnalysis.riskScore,
        riskLevel: riskAnalysis.riskLevel,
        completionPercentage: riskAnalysis.metrics.completionPercentage,
        totalTasks: riskAnalysis.metrics.totalTasks,
        completedTasks: riskAnalysis.metrics.completedTasks,
        incompleteTasks: riskAnalysis.metrics.incompleteTasks,
        overdueTasks: riskAnalysis.metrics.overdueTasks,
        highPriorityIncomplete: riskAnalysis.metrics.highPriorityIncomplete,
        activeBlockers: riskAnalysis.metrics.activeBlockers,
        blockedTasks: riskAnalysis.metrics.blockedTasks,
        daysUntilDeadline: riskAnalysis.metrics.daysUntilDeadline,
        isDeadlinePassed: riskAnalysis.metrics.isDeadlinePassed,
        workloadConcentration: riskAnalysis.metrics.workloadConcentration,
        primaryRisk: riskAnalysis.primaryRisk,
        topPriorities: (prioritizedTasks || []).slice(0, 5).map((t) => ({
            taskId: t.taskId || t.id,
            title: t.title,
            priorityScore: t.priorityScore,
            priorityLevel: t.priorityLevel,
            readiness: t.readiness,
            rank: t.rank,
            dueDateFormatted: t.dueDateFormatted
        }))
    };
};

/**
 * Simulates a hypothetical what-if scenario entirely in memory.
 * 
 * Safety invariants:
 * - ZERO database mutations (0 writes/updates/deletes)
 * - ZERO real-time socket events emitted
 * - ZERO proactive alerts created
 * - Strict project authorization enforced (403 on denied access)
 * 
 * Supported scenarios:
 * 1. "complete_task": hypothetically completes a task, unblocks downstream tasks, recalculates risk & priority
 * 2. "change_priority": hypothetically adjusts task priority enum, recalculates risk & priority ranking
 * 3. "change_deadline": hypothetically shifts project or task deadline, recalculates deadline pressure & risk
 * 4. "resolve_blocker": hypothetically resolves a blocker, unblocking downstream dependencies
 * 5. "assign_task": hypothetically reassigns a task, recalculating team workload balance
 * 6. "multi": applies multiple hypothetical changes in sequence into a single coherent projected state
 */
export const simulateWhatIf = async ({
    userId,
    projectId,
    scenario = "complete_task",
    taskId = null,
    targetTaskTitle = null,
    priority = null,
    daysOffset = null,
    newDate = null,
    assigneeId = null,
    assigneeName = null,
    changes = [],
    params = {},
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!projectId) {
        const error = new Error("Project ID is required for simulation");
        error.statusCode = 400;
        throw error;
    }

    // 1. Fetch live project state (READ-ONLY)
    const { project: rawProject, tasks: rawTasks, risks: rawRisks } = await fetchProjectSimulationData(projectId, userId);

    // 2. Clone models to ensure pristine in-memory isolation
    const baselineProject = deepClone(rawProject);
    const baselineTasks = deepClone(rawTasks);
    const baselineRisks = deepClone(rawRisks);

    // 3. Compute baseline metrics using canonical engines
    const baselineRiskAnalysis = calculateProjectRiskMetrics({
        project: baselineProject,
        tasks: baselineTasks,
        risks: baselineRisks,
        startOfToday
    });

    const baselineActiveTasks = baselineTasks.filter((t) => !t.is_archived && t.status !== "Completed");
    const baselinePrioritized = scoreAndRankTasksInMemory(baselineActiveTasks, {
        startOfToday,
        projectId
    });

    const baselineSummary = extractSummaryMetrics(baselineRiskAnalysis, baselinePrioritized);

    // 4. Prepare cloned projected models
    const projectedProject = deepClone(baselineProject);
    const projectedTasks = deepClone(baselineTasks);
    const projectedRisks = deepClone(baselineRisks);

    const appliedChanges = [];
    const unblockedTasks = [];
    const warnings = [];

    // Helper: Find a task in projectedTasks by ID or exact trimmed Title
    const findTask = (id, title) => {
        if (id) {
            const found = projectedTasks.find((t) => t.id === id);
            if (found) return found;
        }
        if (title) {
            const cleanTitle = String(title).trim().toLowerCase();
            return projectedTasks.find((t) => t.title && t.title.trim().toLowerCase() === cleanTitle) || null;
        }
        return null;
    };

    // Helper: Mark a task completed in memory and update downstream dependency references
    const markTaskCompletedInMemory = (taskToComplete) => {
        if (!taskToComplete) return;
        taskToComplete.status = "Completed";

        // Update downstream references so prerequisite status is recognized as "Completed"
        projectedTasks.forEach((other) => {
            const upstream = other.task_dependencies_task_dependencies_task_idTotasks || [];
            upstream.forEach((dep) => {
                if (dep.tasks_task_dependencies_depends_on_task_idTotasks?.id === taskToComplete.id) {
                    dep.tasks_task_dependencies_depends_on_task_idTotasks.status = "Completed";
                }
            });
        });

        // Detect which downstream tasks were previously blocked and are now fully unblocked
        baselinePrioritized.forEach((bTask) => {
            if (bTask.readiness === READINESS_STATES.BLOCKED && bTask.blockedBy?.some((bl) => bl.id === taskToComplete.id)) {
                // Check if other task now has any REMAINING incomplete prerequisites
                const projOther = projectedTasks.find((t) => t.id === bTask.taskId);
                if (projOther) {
                    const remainingUpstream = (projOther.task_dependencies_task_dependencies_task_idTotasks || [])
                        .filter((dep) => {
                            const p = dep.tasks_task_dependencies_depends_on_task_idTotasks;
                            return p && !p.is_archived && p.status !== "Completed";
                        });

                    if (remainingUpstream.length === 0) {
                        unblockedTasks.push({
                            id: projOther.id,
                            taskId: projOther.id,
                            title: projOther.title,
                            priority: projOther.priority
                        });
                    } else {
                        warnings.push(`Task "${projOther.title}" is still blocked by ${remainingUpstream.map((r) => `"${r.tasks_task_dependencies_depends_on_task_idTotasks.title}"`).join(", ")}.`);
                    }
                }
            }
        });
    };

    // Normalize scenario changes list
    const changeList = scenario === "multi" && Array.isArray(changes) && changes.length > 0
        ? changes
        : [{
            type: scenario,
            taskId: taskId || params.taskId,
            targetTaskTitle: targetTaskTitle || params.targetTaskTitle,
            priority: priority || params.priority,
            daysOffset: daysOffset !== null ? daysOffset : params.daysOffset,
            newDate: newDate || params.newDate,
            assigneeId: assigneeId || params.assigneeId,
            assigneeName: assigneeName || params.assigneeName
        }];

    // 5. Apply each hypothetical change in sequence to projected data
    for (const ch of changeList) {
        const chType = ch.type || scenario;

        if (chType === "complete_task") {
            const task = findTask(ch.taskId, ch.targetTaskTitle);
            if (!task) {
                warnings.push(`Task "${ch.targetTaskTitle || ch.taskId || "unknown"}" was not found in project.`);
                continue;
            }
            if (task.status === "Completed") {
                warnings.push(`Task "${task.title}" is already completed.`);
                continue;
            }

            markTaskCompletedInMemory(task);
            appliedChanges.push({
                type: "complete_task",
                target: "task",
                taskId: task.id,
                taskTitle: task.title,
                description: `Hypothetically marked "${task.title}" as completed`
            });

        } else if (chType === "resolve_blocker") {
            let blockerTask = findTask(ch.taskId, ch.targetTaskTitle);

            // If no specific blocker specified, find the most impactful active blocker in the project
            if (!blockerTask) {
                const activeIncomplete = projectedTasks.filter((t) => !t.is_archived && t.status !== "Completed");
                let maxBlocked = 0;
                activeIncomplete.forEach((t) => {
                    const downstream = t.task_dependencies_task_dependencies_depends_on_task_idTotasks || [];
                    const activeDownstream = downstream.filter((d) => {
                        const target = d.tasks_task_dependencies_task_idTotasks;
                        return target && !target.is_archived && target.status !== "Completed";
                    });
                    if (activeDownstream.length > maxBlocked) {
                        maxBlocked = activeDownstream.length;
                        blockerTask = t;
                    }
                });
            }

            if (!blockerTask) {
                warnings.push("No active blocking tasks found to resolve.");
                continue;
            }

            markTaskCompletedInMemory(blockerTask);
            appliedChanges.push({
                type: "resolve_blocker",
                target: "task",
                taskId: blockerTask.id,
                taskTitle: blockerTask.title,
                description: `Hypothetically resolved blocker "${blockerTask.title}"`
            });

        } else if (chType === "change_priority") {
            const task = findTask(ch.taskId, ch.targetTaskTitle);
            if (!task) {
                warnings.push(`Task "${ch.targetTaskTitle || ch.taskId || "unknown"}" was not found in project.`);
                continue;
            }

            const rawPrio = String(ch.priority || "Medium").trim();
            const normalizedPrio = rawPrio.charAt(0).toUpperCase() + rawPrio.slice(1).toLowerCase();
            const oldPrio = task.priority || "Medium";
            task.priority = normalizedPrio;

            appliedChanges.push({
                type: "change_priority",
                target: "task",
                taskId: task.id,
                taskTitle: task.title,
                fromPriority: oldPrio,
                toPriority: normalizedPrio,
                description: `Changed priority of "${task.title}" from ${oldPrio} to ${normalizedPrio}`
            });

        } else if (chType === "change_deadline") {
            const offset = ch.daysOffset !== undefined && ch.daysOffset !== null ? Number(ch.daysOffset) : null;
            const explicitDate = ch.newDate ? new Date(ch.newDate) : null;

            if (ch.taskId || ch.targetTaskTitle) {
                // Task deadline change
                const task = findTask(ch.taskId, ch.targetTaskTitle);
                if (!task) {
                    warnings.push(`Task "${ch.targetTaskTitle || ch.taskId}" not found.`);
                    continue;
                }

                let newDueDate;
                if (explicitDate && !isNaN(explicitDate.getTime())) {
                    newDueDate = explicitDate;
                } else if (offset !== null) {
                    const baseDate = task.due_date ? new Date(task.due_date) : startOfToday;
                    newDueDate = new Date(baseDate.getTime() + offset * 86400000);
                }

                if (newDueDate) {
                    const oldDateStr = task.due_date ? formatDate(task.due_date) : "None";
                    task.due_date = newDueDate.toISOString();
                    appliedChanges.push({
                        type: "change_deadline",
                        target: "task",
                        taskId: task.id,
                        taskTitle: task.title,
                        from: oldDateStr,
                        to: formatDate(newDueDate),
                        description: `Shifted deadline for task "${task.title}" to ${formatDate(newDueDate)}`
                    });
                }
            } else {
                // Project deadline change
                let newProjEnd;
                if (explicitDate && !isNaN(explicitDate.getTime())) {
                    newProjEnd = explicitDate;
                } else if (offset !== null) {
                    const baseDate = projectedProject.end_date ? new Date(projectedProject.end_date) : startOfToday;
                    newProjEnd = new Date(baseDate.getTime() + offset * 86400000);
                }

                if (newProjEnd) {
                    const oldProjEndStr = projectedProject.end_date ? formatDate(projectedProject.end_date) : "None";
                    projectedProject.end_date = newProjEnd.toISOString();
                    appliedChanges.push({
                        type: "change_deadline",
                        target: "project",
                        from: oldProjEndStr,
                        to: formatDate(newProjEnd),
                        daysOffset: offset,
                        description: `Shifted project deadline ${offset !== null ? (offset >= 0 ? `+${offset}` : `${offset}`) + " days" : ""} to ${formatDate(newProjEnd)}`
                    });
                }
            }

        } else if (chType === "assign_task" || chType === "reassign_task") {
            const task = findTask(ch.taskId, ch.targetTaskTitle);
            if (!task) {
                warnings.push(`Task "${ch.targetTaskTitle || ch.taskId}" not found.`);
                continue;
            }

            const targetUserId = ch.assigneeId || null;
            const targetUserName = ch.assigneeName || (targetUserId ? "Team Member" : "Unassigned");
            const previousAssignee = task.users_tasks_assigned_toTousers
                ? `${task.users_tasks_assigned_toTousers.first_name} ${task.users_tasks_assigned_toTousers.last_name}`.trim()
                : "Unassigned";

            task.assigned_to = targetUserId;
            task.users_tasks_assigned_toTousers = targetUserId ? {
                id: targetUserId,
                first_name: targetUserName.split(" ")[0] || targetUserName,
                last_name: targetUserName.split(" ").slice(1).join(" ") || "",
                email: ""
            } : null;

            appliedChanges.push({
                type: "assign_task",
                target: "task",
                taskId: task.id,
                taskTitle: task.title,
                from: previousAssignee,
                to: targetUserName,
                description: `Reassigned "${task.title}" from ${previousAssignee} to ${targetUserName}`
            });
        }
    }

    // 6. Compute projected metrics using canonical engines
    const projectedRiskAnalysis = calculateProjectRiskMetrics({
        project: projectedProject,
        tasks: projectedTasks,
        risks: projectedRisks,
        startOfToday
    });

    const projectedActiveTasks = projectedTasks.filter((t) => !t.is_archived && t.status !== "Completed");
    const projectedPrioritized = scoreAndRankTasksInMemory(projectedActiveTasks, {
        startOfToday,
        projectId
    });

    const projectedSummary = extractSummaryMetrics(projectedRiskAnalysis, projectedPrioritized);

    // 7. Calculate structured impacts with direction & delta
    const impacts = [];

    // A. Risk Score Impact
    const riskScoreDelta = projectedSummary.riskScore - baselineSummary.riskScore;
    let riskDirection = "unchanged";
    if (riskScoreDelta < 0) riskDirection = "improved";
    else if (riskScoreDelta > 0) riskDirection = "worsened";

    impacts.push({
        category: "risk",
        metric: "riskScore",
        direction: riskDirection,
        baselineValue: baselineSummary.riskScore,
        projectedValue: projectedSummary.riskScore,
        delta: riskScoreDelta,
        explanation: riskScoreDelta === 0
            ? `Project risk score remains at ${baselineSummary.riskScore} (${baselineSummary.riskLevel})`
            : `Project risk score ${riskScoreDelta < 0 ? "decreases" : "increases"} by ${Math.abs(riskScoreDelta)} points (${baselineSummary.riskLevel} ${baselineSummary.riskScore} → ${projectedSummary.riskLevel} ${projectedSummary.riskScore})`
    });

    // B. Completion Percentage Impact
    const completionDelta = projectedSummary.completionPercentage - baselineSummary.completionPercentage;
    let completionDirection = "unchanged";
    if (completionDelta > 0) completionDirection = "improved";
    else if (completionDelta < 0) completionDirection = "worsened";

    if (completionDelta !== 0 || baselineSummary.completionPercentage > 0) {
        impacts.push({
            category: "completion",
            metric: "completionPercentage",
            direction: completionDirection,
            baselineValue: baselineSummary.completionPercentage,
            projectedValue: projectedSummary.completionPercentage,
            delta: completionDelta,
            explanation: completionDelta === 0
                ? `Project completion remains at ${baselineSummary.completionPercentage}%`
                : `Project completion increases from ${baselineSummary.completionPercentage}% to ${projectedSummary.completionPercentage}% (+${completionDelta}%)`
        });
    }

    // C. Overdue Tasks Impact
    const overdueDelta = projectedSummary.overdueTasks - baselineSummary.overdueTasks;
    let overdueDirection = "unchanged";
    if (overdueDelta < 0) overdueDirection = "improved";
    else if (overdueDelta > 0) overdueDirection = "worsened";

    if (baselineSummary.overdueTasks > 0 || projectedSummary.overdueTasks > 0) {
        impacts.push({
            category: "overdue",
            metric: "overdueTasks",
            direction: overdueDirection,
            baselineValue: baselineSummary.overdueTasks,
            projectedValue: projectedSummary.overdueTasks,
            delta: overdueDelta,
            explanation: overdueDelta === 0
                ? `Overdue tasks remain at ${baselineSummary.overdueTasks}`
                : `Overdue tasks ${overdueDelta < 0 ? "reduced" : "increased"} from ${baselineSummary.overdueTasks} to ${projectedSummary.overdueTasks}`
        });
    }

    // D. Active Blockers Impact
    const blockersDelta = projectedSummary.activeBlockers - baselineSummary.activeBlockers;
    let blockersDirection = "unchanged";
    if (blockersDelta < 0) blockersDirection = "improved";
    else if (blockersDelta > 0) blockersDirection = "worsened";

    if (baselineSummary.activeBlockers > 0 || projectedSummary.activeBlockers > 0) {
        impacts.push({
            category: "dependencies",
            metric: "activeBlockers",
            direction: blockersDirection,
            baselineValue: baselineSummary.activeBlockers,
            projectedValue: projectedSummary.activeBlockers,
            delta: blockersDelta,
            explanation: blockersDelta === 0
                ? `Active blockers remain at ${baselineSummary.activeBlockers}`
                : `Active blockers ${blockersDelta < 0 ? "reduced" : "increased"} from ${baselineSummary.activeBlockers} to ${projectedSummary.activeBlockers}`
        });
    }

    // E. Downstream Unblocked Tasks
    if (unblockedTasks.length > 0) {
        impacts.push({
            category: "dependencies",
            metric: "unblockedTasks",
            direction: "improved",
            baselineValue: 0,
            projectedValue: unblockedTasks.length,
            delta: unblockedTasks.length,
            tasks: unblockedTasks,
            explanation: `Unblocked ${unblockedTasks.length} downstream task${unblockedTasks.length > 1 ? "s" : ""}: ${unblockedTasks.map((t) => `"${t.title}"`).join(", ")}`
        });
    }

    // F. Priority Queue Shift Impact
    const baseTop = baselinePrioritized[0] || null;
    const projTop = projectedPrioritized[0] || null;

    if (baseTop && projTop && (baseTop.id !== projTop.id || baseTop.priorityScore !== projTop.priorityScore)) {
        impacts.push({
            category: "priorities",
            metric: "topPriorityTask",
            direction: "improved",
            baselineValue: baseTop.title,
            projectedValue: projTop.title,
            explanation: baseTop.id !== projTop.id
                ? `Top priority task shifts from "${baseTop.title}" (${baseTop.priorityScore}) to "${projTop.title}" (${projTop.priorityScore})`
                : `Score for top priority task "${projTop.title}" updated to ${projTop.priorityScore}`
        });
    }

    // G. Workload Concentration Impact
    const baseWorkload = baselineSummary.workloadConcentration;
    const projWorkload = projectedSummary.workloadConcentration;
    if (baseWorkload || projWorkload) {
        const basePct = baseWorkload ? baseWorkload.percentage : 0;
        const projPct = projWorkload ? projWorkload.percentage : 0;
        const workloadDelta = projPct - basePct;
        let wlDirection = "unchanged";
        if (workloadDelta < 0) wlDirection = "improved";
        else if (workloadDelta > 0) wlDirection = "worsened";

        impacts.push({
            category: "workload",
            metric: "workloadConcentration",
            direction: wlDirection,
            baselineValue: basePct,
            projectedValue: projPct,
            delta: workloadDelta,
            explanation: wlDirection === "improved"
                ? `Workload concentration relieved from ${basePct}% to ${projPct}%`
                : `Workload concentration is ${projPct}%`
        });
    }

    // 8. Formulate Recommendations
    const recommendations = [];
    if (unblockedTasks.length > 0) {
        recommendations.push(`Next priority: Immediately pick up "${unblockedTasks[0].title}" once unblocked.`);
    }
    if (projectedSummary.overdueTasks > 0) {
        recommendations.push(`Address remaining ${projectedSummary.overdueTasks} overdue task${projectedSummary.overdueTasks > 1 ? "s" : ""} to restore project velocity.`);
    }
    if (projectedSummary.riskScore < baselineSummary.riskScore) {
        recommendations.push(`Executing this action would yield an immediate ${baselineSummary.riskScore - projectedSummary.riskScore} point risk reduction.`);
    } else if (projectedSummary.riskScore > baselineSummary.riskScore) {
        recommendations.push(`Caution: This change increases project risk by ${projectedSummary.riskScore - baselineSummary.riskScore} points.`);
    }
    if (recommendations.length === 0) {
        recommendations.push("Maintain steady execution to hit upcoming project milestones.");
    }

    // 9. Format Quackie Conversational Response
    const formattedReply = formatWhatIfReply({
        projectTitle: rawProject.title,
        changes: appliedChanges,
        baseline: baselineSummary,
        projected: projectedSummary,
        impacts,
        unblockedTasks,
        warnings,
        recommendations
    });

    let emotion = "happy";
    if (riskScoreDelta < -5 || completionDelta > 10 || unblockedTasks.length > 0) {
        emotion = "excited";
    } else if (riskScoreDelta > 5) {
        emotion = "worried";
    } else {
        emotion = "thinking";
    }

    const simulationResult = {
        simulationId: `sim_${crypto.randomUUID()}`,
        scenario,
        projectId,
        projectTitle: rawProject.title,
        baseline: baselineSummary,
        projected: projectedSummary,
        changes: appliedChanges,
        impacts,
        unblockedTasks,
        warnings,
        recommendations,
        reply: formattedReply,
        emotion
    };

    return simulationResult;
};

/**
 * Formats structured simulation into Quackie chat response
 */
export const formatWhatIfReply = ({
    projectTitle,
    changes = [],
    baseline,
    projected,
    impacts = [],
    unblockedTasks = [],
    warnings = [],
    recommendations = []
}) => {
    let reply = `🔮 **What-If Simulation**\n\n`;

    // 1. Changes applied
    if (changes.length > 0) {
        reply += `**Hypothetical Change:**\n`;
        changes.forEach((c) => {
            reply += `• ${c.description}\n`;
        });
        reply += `\n`;
    }

    // 2. Baseline state
    reply += `**Current State:**\n`;
    reply += `• Project risk: **${baseline.riskLevel}** (${baseline.riskScore}/100)\n`;
    reply += `• Completion: **${baseline.completionPercentage}%** (${baseline.completedTasks}/${baseline.totalTasks} tasks)\n`;
    if (baseline.overdueTasks > 0) {
        reply += `• Overdue tasks: **${baseline.overdueTasks}**\n`;
    }
    if (baseline.activeBlockers > 0) {
        reply += `• Active blockers: **${baseline.activeBlockers}** (blocking ${baseline.blockedTasks} tasks)\n`;
    }
    if (baseline.daysUntilDeadline !== null) {
        reply += `• Deadline: ${baseline.isDeadlinePassed ? `Passed ${Math.abs(baseline.daysUntilDeadline)} days ago` : `${baseline.daysUntilDeadline} days remaining`}\n`;
    }
    reply += `\n`;

    // 3. Projected state
    reply += `**Projected Outcome:**\n`;
    const scoreDiff = projected.riskScore - baseline.riskScore;
    const scoreDiffStr = scoreDiff < 0 ? ` (${scoreDiff} pts)` : scoreDiff > 0 ? ` (+${scoreDiff} pts)` : ` (no change)`;
    reply += `• Project risk: **${projected.riskLevel}** (${projected.riskScore}/100)${scoreDiffStr}\n`;
    reply += `• Completion: **${projected.completionPercentage}%** (${projected.completedTasks}/${projected.totalTasks} tasks)\n`;
    if (unblockedTasks.length > 0) {
        reply += `• 🟢 **Unblocks:** ${unblockedTasks.map((t) => `"${t.title}"`).join(", ")}\n`;
    }
    if (projected.overdueTasks !== baseline.overdueTasks) {
        reply += `• Remaining overdue tasks: **${projected.overdueTasks}**\n`;
    }
    if (projected.activeBlockers !== baseline.activeBlockers) {
        reply += `• Active blockers: **${projected.activeBlockers}**\n`;
    }
    reply += `\n`;

    // 4. Key Impacts
    if (impacts.length > 0) {
        reply += `**Key Impacts:**\n`;
        impacts.slice(0, 4).forEach((imp) => {
            const icon = imp.direction === "improved" ? "✅" : imp.direction === "worsened" ? "⚠️" : "ℹ️";
            reply += `${icon} ${imp.explanation}\n`;
        });
        reply += `\n`;
    }

    // 5. Warnings
    if (warnings.length > 0) {
        reply += `**Note:**\n`;
        warnings.forEach((w) => {
            reply += `• ⚠️ ${w}\n`;
        });
        reply += `\n`;
    }

    // 6. Actionable Next Steps
    if (recommendations.length > 0) {
        reply += `**Recommended Next Step:**\n`;
        recommendations.forEach((r) => {
            reply += `• ${r}\n`;
        });
    }

    return reply.trim();
};

/**
 * Natural Language Query Parser for What-If questions.
 * Extracts scenario, target task title, priority, deadline offsets, etc.
 */
export const parseWhatIfQuery = async ({ text, context = {}, userId }) => {
    const rawText = String(text || "").trim();
    const lower = rawText.toLowerCase();

    // Check if prompt matches simulation intent
    const isSimulationQuery =
        /^(?:what\s+if|suppose|simulate|what\s+happens\s+if)\b/i.test(lower) ||
        /\b(?:what\s+if|what\s+happens\s+if|what\s+would\s+happen\s+if|simulate\s+completing|suppose\s+we)\b/i.test(lower);

    if (!isSimulationQuery) {
        return null;
    }

    // 1. Determine scenario type
    let scenario = "complete_task";
    let daysOffset = null;
    let newDate = null;
    let priority = null;
    let targetTaskTitle = null;

    // Check priority value in prompt
    const prioMatch = lower.match(/\b(critical|high|medium|low)\b/i);
    if (prioMatch) {
        const rawP = prioMatch[1].toLowerCase();
        priority = rawP.charAt(0).toUpperCase() + rawP.slice(1);
    }

    const isPriorityScenario =
        /\b(?:priority|priorities)\b/i.test(lower) ||
        /\b(?:becomes?|changes?\s+to|set\s+to|is\s+set\s+to)\s+(?:critical|high|medium|low)\b/i.test(lower) ||
        (priority !== null && /\b(?:change|set|make|becomes?|is)\b/i.test(lower) && !/complete|finish|resolve/i.test(lower));

    const isDeadlineScenario =
        /\b(?:deadline|due\s+date)\b/i.test(lower) ||
        /\b(?:moves?\s+by|extend(?:ed)?\s+by|delay(?:ed)?\s+by|pushed\s+back\s+by|postpone(?:d)?\s+by)\s*[+-]?\d+\s*days?\b/i.test(lower) ||
        (/\bdays?\b/i.test(lower) && !/complete|finish|resolve/i.test(lower));

    const isBlockerScenario =
        /\b(?:the\s+blockers?|this\s+blocker|active\s+blockers?|resolve\s+(?:the\s+)?blockers?)\b/i.test(lower);

    if (isDeadlineScenario) {
        scenario = "change_deadline";
    } else if (isPriorityScenario) {
        scenario = "change_priority";
    } else if (isBlockerScenario) {
        scenario = "resolve_blocker";
    } else {
        scenario = "complete_task";
    }

    // 2. Extract target task title
    const quotedMatch = rawText.match(/['"‘“](.+?)['"’”]/);
    if (quotedMatch) {
        targetTaskTitle = quotedMatch[1].trim();
    } else if (scenario === "change_priority") {
        // "What if API Testing becomes High priority?"
        // "What if API Testing is High priority?"
        // "What if we change API Testing to High priority?"
        const prioChangeMatch = rawText.match(
            /(?:what\s+if|suppose|simulate|what\s+happens\s+if)\s+(?:we\s+)?(?:change|set|make)?\s*(.+?)\s+(?:becomes?|is(?:\s+set\s+to)?|changes?\s+to|priority\s+is|priority\s+becomes?|to)\s+(?:critical|high|medium|low)/i
        ) || rawText.match(
            /(?:change|set|make)\s+(?:the\s+priority\s+of\s+)?(.+?)\s+to\s+(?:critical|high|medium|low)/i
        ) || rawText.match(
            /(?:what\s+if|suppose|simulate)\s+(.+?)\s+priority\s+(?:is|becomes?|to)\s+(?:critical|high|medium|low)/i
        );

        if (prioChangeMatch) {
            targetTaskTitle = prioChangeMatch[1].trim();
        }
    } else if (scenario === "complete_task") {
        // "What if I complete API Testing today?"
        // "What if we complete API Testing?"
        // "What happens if I complete API Testing?"
        const completeMatch = rawText.match(
            /(?:complete|completing|finish|finishing|resolve|resolving|close|closing)\s+(?:task\s+)?(.+?)(?:\s+(?:today|tomorrow|by|soon|now)|\?|$)/i
        ) || rawText.match(
            /(?:what\s+if|what\s+happens\s+if|suppose)\s+(?:task\s+)?(.+?)\s+(?:is|gets?|was)\s+(?:completed?|finished?|done|resolved?)\??$/i
        );

        if (completeMatch) {
            targetTaskTitle = completeMatch[1].trim();
        }
    } else if (scenario === "change_deadline") {
        const taskDeadlineMatch = rawText.match(
            /(?:what\s+if|suppose)\s+(?:task\s+)?(.+?)\s+(?:deadline|due\s+date)/i
        );
        if (taskDeadlineMatch) {
            targetTaskTitle = taskDeadlineMatch[1].trim();
        }
    }

    // Clean up extracted task title
    if (targetTaskTitle) {
        targetTaskTitle = targetTaskTitle
            .replace(/^(?:the\s+task\s+|task\s+|a\s+task\s+|the\s+priority\s+of\s+|priority\s+of\s+|the\s+)/i, "")
            .replace(/\s+(?:priority|priorities)$/i, "")
            .replace(/[.,!?;:]+$/, "")
            .trim();

        if (/^(?:i|we|it|this|that|a|the)$/i.test(targetTaskTitle)) {
            targetTaskTitle = null;
        }
    }

    // 3. Extract deadline offsets or dates
    if (scenario === "change_deadline" || isDeadlineScenario) {
        const offsetMatch = rawText.match(/(?:by|extend\s+by|delay\s+by|pushed\s+back\s+by|moves\s+by)\s*([+-]?\d+)\s*days?/i);
        if (offsetMatch) {
            daysOffset = parseInt(offsetMatch[1], 10);
            if (/earlier|sooner|shorten|up\s+by/i.test(lower)) {
                daysOffset = -Math.abs(daysOffset);
            }
        } else {
            const numDaysMatch = rawText.match(/(\d+)\s*days?/i);
            if (numDaysMatch) {
                const n = parseInt(numDaysMatch[1], 10);
                daysOffset = /earlier|sooner|shorten/i.test(lower) ? -n : n;
            }
        }

        const dateMatch = rawText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (dateMatch) {
            newDate = dateMatch[1];
        }
    }

    return {
        isSimulationQuery: true,
        scenario,
        targetTaskTitle,
        priority,
        daysOffset,
        newDate,
        rawText
    };
};

export default {
    simulateWhatIf,
    formatWhatIfReply,
    parseWhatIfQuery,
    fetchProjectSimulationData,
    findAccessibleTaskByTitle,
    getUserAccessibleProjects
};
