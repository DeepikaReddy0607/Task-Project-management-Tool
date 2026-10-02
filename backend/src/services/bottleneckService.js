import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { calculateCriticalPath } from "./criticalPathService.js";

// ============================================================
// CONSTANTS & CLASSIFICATIONS
// ============================================================

export const BOTTLENECK_SEVERITIES = {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW"
};

export const BOTTLENECK_TYPES = {
    CRITICAL_PATH_BOTTLENECK: "CRITICAL_PATH_BOTTLENECK",
    DEPENDENCY_BOTTLENECK: "DEPENDENCY_BOTTLENECK",
    DEADLINE_BOTTLENECK: "DEADLINE_BOTTLENECK",
    WORKLOAD_IMPACT: "WORKLOAD_IMPACT"
};

export const determineBottleneckSeverity = (score) => {
    if (score >= 80) return BOTTLENECK_SEVERITIES.CRITICAL;
    if (score >= 60) return BOTTLENECK_SEVERITIES.HIGH;
    if (score >= 35) return BOTTLENECK_SEVERITIES.MEDIUM;
    return BOTTLENECK_SEVERITIES.LOW;
};

/**
 * Computes downstream dependency depth and transitive blocked task counts.
 * 
 * @param {string} taskId
 * @param {Map<string, Array<string>>} adjacencyList
 * @param {Map<string, Object>} nodes
 * @returns {{ directCount: number, transitiveCount: number, maxDepth: number, blockedTasks: Array<Object> }}
 */
export const analyzeDownstreamReach = (taskId, adjacencyList, nodes) => {
    const directSuccessors = adjacencyList.get(taskId) || [];
    const visited = new Set();
    const queue = directSuccessors.map((sId) => ({ id: sId, depth: 1 }));
    let maxDepth = 0;
    const directIncomplete = [];
    const allIncomplete = [];

    directSuccessors.forEach((sId) => {
        const node = nodes.get(sId);
        if (node && !node.is_archived && node.status !== "Completed") {
            directIncomplete.push(node);
        }
    });

    while (queue.length > 0) {
        const { id, depth } = queue.shift();
        if (!visited.has(id)) {
            visited.add(id);
            if (depth > maxDepth) maxDepth = depth;

            const node = nodes.get(id);
            if (node && !node.is_archived && node.status !== "Completed") {
                allIncomplete.push(node);
            }

            const nextSuccessors = adjacencyList.get(id) || [];
            nextSuccessors.forEach((nextId) => {
                if (!visited.has(nextId)) {
                    queue.push({ id: nextId, depth: depth + 1 });
                }
            });
        }
    }

    return {
        directCount: directIncomplete.length,
        transitiveCount: allIncomplete.length,
        maxDepth,
        blockedTasks: allIncomplete.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority
        }))
    };
};

/**
 * PURE IN-MEMORY BOTTLENECK DETECTION ENGINE
 * 
 * Evaluates all active tasks against the project CPM graph and calculates
 * explainable, deterministic bottleneck scores, classifications, and reasons.
 * 
 * Only INCOMPLETE tasks can be bottlenecks.
 * 
 * @param {Object} params
 * @param {Object} params.project Project model object
 * @param {Array<Object>} params.tasks Array of task objects
 * @param {Array<Object>} [params.dependencies] Optional explicit dependencies
 * @param {Object} [params.cpmResult] Precomputed CPM result (optional)
 * @param {Date} [params.startOfToday]
 * @returns {{
 *   projectId: string,
 *   projectTitle: string,
 *   hasCycle: boolean,
 *   bottlenecks: Array<Object>,
 *   summary: Object
 * }}
 */
export const detectBottlenecks = ({
    project = null,
    tasks = [],
    dependencies = null,
    cpmResult = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    // 1. Obtain CPM result using the SAME graph
    const cpm = cpmResult || calculateCriticalPath({
        project,
        tasks,
        dependencies,
        startOfToday
    });

    const projectId = project?.id || cpm.projectId || "unknown-project";
    const projectTitle = project?.title || cpm.projectTitle || "Project";

    // If graph has a cycle, bottleneck calculation cannot proceed reliably
    if (cpm.hasCycle) {
        return {
            projectId,
            projectTitle,
            hasCycle: true,
            bottlenecks: [],
            summary: {
                totalBottlenecks: 0,
                criticalSeverityCount: 0,
                highSeverityCount: 0,
                primaryBottleneck: null,
                message: "Cannot detect bottlenecks: dependency graph contains a cycle."
            },
            error: "Dependency graph contains a circular dependency (cycle)"
        };
    }

    const { nodes: cpmNodes, graph } = cpm;
    if (!graph || cpmNodes.length === 0) {
        return {
            projectId,
            projectTitle,
            hasCycle: false,
            bottlenecks: [],
            summary: {
                totalBottlenecks: 0,
                criticalSeverityCount: 0,
                highSeverityCount: 0,
                primaryBottleneck: null,
                message: "No active tasks in project."
            }
        };
    }

    // Map CPM node properties by task ID
    const cpmNodeMap = new Map();
    cpmNodes.forEach((n) => {
        cpmNodeMap.set(n.taskId, n);
    });

    const evaluatedBottlenecks = [];

    // 2. Evaluate each incomplete task
    graph.nodes.forEach((task, taskId) => {
        // Exclude completed or archived tasks
        if (task.is_archived || task.status === "Completed") {
            return;
        }

        const cpmNode = cpmNodeMap.get(taskId);
        if (!cpmNode) return;

        const isCritical = cpmNode.isCritical;
        const totalSlack = cpmNode.totalSlack;
        const durationDays = cpmNode.durationDays;
        const estimatedHours = task.estimated_hours ? Number(task.estimated_hours) : null;

        // Downstream reach analysis
        const reach = analyzeDownstreamReach(taskId, graph.adjacencyList, graph.nodes);
        const { directCount, transitiveCount, maxDepth, blockedTasks } = reach;

        // Deadline analysis
        let isOverdue = false;
        let daysOverdue = 0;
        let daysUntilDue = null;

        if (task.due_date) {
            const due = new Date(task.due_date);
            const diffDays = Math.round((due.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                isOverdue = true;
                daysOverdue = Math.abs(diffDays);
            } else {
                daysUntilDue = diffDays;
            }
        }

        // ========================================================
        // 3. DETERMINISTIC SCORING FORMULA (0 - 100)
        // ========================================================
        let score = 0;
        const reasons = [];
        const detectedTypes = new Set();

        // A. DOWNSTREAM IMPACT (Up to 35 points)
        if (directCount > 0) {
            const directPts = Math.min(25, directCount * 8);
            score += directPts;
            reasons.push(`Directly blocks ${directCount} downstream task${directCount > 1 ? "s" : ""}`);
            detectedTypes.add(BOTTLENECK_TYPES.DEPENDENCY_BOTTLENECK);
        }

        if (transitiveCount > directCount) {
            const cascadeCount = transitiveCount - directCount;
            const cascadePts = Math.min(10, cascadeCount * 2);
            score += cascadePts;
            reasons.push(`Cascades to block ${transitiveCount} total downstream task${transitiveCount > 1 ? "s" : ""}`);
        }

        // B. CRITICAL PATH & SLACK (Up to 40 points)
        if (isCritical) {
            score += 25;
            reasons.push("Task is on the critical path with zero slack");
            detectedTypes.add(BOTTLENECK_TYPES.CRITICAL_PATH_BOTTLENECK);
            if (isOverdue) {
                score += 15;
                reasons.push("Critical path is actively slipping due to overdue schedule");
            }
        } else if (totalSlack === 1) {
            score += 15;
            reasons.push("Near-critical task with only 1 day of slack");
        } else if (totalSlack === 2) {
            score += 8;
            reasons.push("Low slack task (2 days remaining)");
        }


        // C. DEADLINE PRESSURE (Up to 20 points)
        if (isOverdue) {
            score += Math.min(20, 14 + Math.min(daysOverdue * 2, 6));
            reasons.push(`Task is overdue by ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}`);
            detectedTypes.add(BOTTLENECK_TYPES.DEADLINE_BOTTLENECK);
        } else if (daysUntilDue === 0) {
            score += 15;
            reasons.push("Task is due today");
            detectedTypes.add(BOTTLENECK_TYPES.DEADLINE_BOTTLENECK);
        } else if (daysUntilDue !== null && daysUntilDue <= 3) {
            score += 10;
            reasons.push(`Task deadline is in ${daysUntilDue} day${daysUntilDue > 1 ? "s" : ""}`);
            if (directCount > 0) {
                detectedTypes.add(BOTTLENECK_TYPES.DEADLINE_BOTTLENECK);
            }
        } else if (daysUntilDue !== null && daysUntilDue <= 7) {
            score += 5;
            reasons.push("Task deadline is approaching this week");
        }

        // D. TASK PRIORITY (Up to 10 points)
        const priorityStr = String(task.priority || "Medium").toLowerCase();
        if (priorityStr === "critical") {
            score += 10;
            reasons.push("Critical priority task");
        } else if (priorityStr === "high") {
            score += 7;
            reasons.push("High priority task");
        } else if (priorityStr === "medium") {
            score += 3;
        }

        // E. EFFORT & DEPTH (Up to 10 points)
        if (maxDepth >= 3) {
            score += 5;
            reasons.push(`Deep dependency chain (${maxDepth} levels downstream)`);
        } else if (maxDepth >= 2) {
            score += 3;
            reasons.push(`Multi-level dependency chain (${maxDepth} levels)`);
        }

        if (estimatedHours && estimatedHours >= 24) {
            score += 5;
            reasons.push(`Heavy effort requirement (~${estimatedHours}h estimated)`);
            detectedTypes.add(BOTTLENECK_TYPES.WORKLOAD_IMPACT);
        } else if (estimatedHours && estimatedHours >= 16) {
            score += 3;
            reasons.push(`Substantial effort (~${estimatedHours}h estimated)`);
        }

        // Normalize score 0 - 100
        const finalScore = Math.min(100, Math.max(0, score));
        const severity = determineBottleneckSeverity(finalScore);

        // Assign primary bottleneck type
        let primaryType = BOTTLENECK_TYPES.DEPENDENCY_BOTTLENECK;
        if (detectedTypes.has(BOTTLENECK_TYPES.CRITICAL_PATH_BOTTLENECK) && (directCount > 0 || isOverdue)) {
            primaryType = BOTTLENECK_TYPES.CRITICAL_PATH_BOTTLENECK;
        } else if (detectedTypes.has(BOTTLENECK_TYPES.DEADLINE_BOTTLENECK) && isOverdue) {
            primaryType = BOTTLENECK_TYPES.DEADLINE_BOTTLENECK;
        } else if (detectedTypes.has(BOTTLENECK_TYPES.DEPENDENCY_BOTTLENECK)) {
            primaryType = BOTTLENECK_TYPES.DEPENDENCY_BOTTLENECK;
        } else if (detectedTypes.has(BOTTLENECK_TYPES.WORKLOAD_IMPACT)) {
            primaryType = BOTTLENECK_TYPES.WORKLOAD_IMPACT;
        } else if (detectedTypes.has(BOTTLENECK_TYPES.CRITICAL_PATH_BOTTLENECK)) {
            primaryType = BOTTLENECK_TYPES.CRITICAL_PATH_BOTTLENECK;
        }

        // Only include tasks that exhibit genuine bottleneck signals:
        // (directCount > 0 OR isCritical with low slack OR isOverdue with dependencies OR score >= 35)
        const isTrueBottleneck =
            directCount > 0 ||
            (isCritical && (isOverdue || (daysUntilDue !== null && daysUntilDue <= 3))) ||
            finalScore >= 35;

        if (isTrueBottleneck) {
            evaluatedBottlenecks.push({
                taskId,
                id: taskId,
                title: task.title,
                status: task.status,
                priority: task.priority || "Medium",
                severity,
                score: finalScore,
                type: primaryType,
                types: Array.from(detectedTypes),
                isCritical,
                totalSlack,
                durationDays,
                estimatedHours,
                blockedDownstreamCount: directCount,
                transitiveBlockedCount: transitiveCount,
                blockedTasks,
                isOverdue,
                daysOverdue,
                dueDate: task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : null,
                assignee: task.users_tasks_assigned_toTousers ? {
                    id: task.users_tasks_assigned_toTousers.id,
                    name: `${task.users_tasks_assigned_toTousers.first_name || ""} ${task.users_tasks_assigned_toTousers.last_name || ""}`.trim() || task.users_tasks_assigned_toTousers.email
                } : null,
                reasons
            });
        }
    });

    // ========================================================
    // 4. DETERMINISTIC SORTING
    // ========================================================
    const severityRank = {
        [BOTTLENECK_SEVERITIES.CRITICAL]: 4,
        [BOTTLENECK_SEVERITIES.HIGH]: 3,
        [BOTTLENECK_SEVERITIES.MEDIUM]: 2,
        [BOTTLENECK_SEVERITIES.LOW]: 1
    };

    evaluatedBottlenecks.sort((a, b) => {
        // 1. Severity rank descending
        const aSev = severityRank[a.severity] || 0;
        const bSev = severityRank[b.severity] || 0;
        if (bSev !== aSev) {
            return bSev - aSev;
        }

        // 2. Bottleneck score descending
        if (b.score !== a.score) {
            return b.score - a.score;
        }

        // 3. Critical-path membership (critical first)
        if (a.isCritical !== b.isCritical) {
            return a.isCritical ? -1 : 1;
        }

        // 4. Downstream impact descending
        if (b.blockedDownstreamCount !== a.blockedDownstreamCount) {
            return b.blockedDownstreamCount - a.blockedDownstreamCount;
        }

        // 5. Due date ascending (earliest first, no due date last)
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (aDue !== bDue) {
            return aDue - bDue;
        }

        // 6. Task ID ascending (tie-breaker)
        return String(a.taskId).localeCompare(String(b.taskId));
    });

    // 5. Summary metrics
    const criticalCount = evaluatedBottlenecks.filter((b) => b.severity === BOTTLENECK_SEVERITIES.CRITICAL).length;
    const highCount = evaluatedBottlenecks.filter((b) => b.severity === BOTTLENECK_SEVERITIES.HIGH).length;
    const topBottleneck = evaluatedBottlenecks[0] || null;

    let summaryMessage = "No significant bottlenecks detected in this project.";
    if (topBottleneck) {
        summaryMessage = `Primary bottleneck is "${topBottleneck.title}" (${topBottleneck.severity}, score: ${topBottleneck.score}/100) blocking ${topBottleneck.blockedDownstreamCount} downstream task${topBottleneck.blockedDownstreamCount > 1 ? "s" : ""}.`;
    }

    return {
        projectId,
        projectTitle,
        hasCycle: false,
        bottlenecks: evaluatedBottlenecks,
        summary: {
            totalBottlenecks: evaluatedBottlenecks.length,
            criticalSeverityCount: criticalCount,
            highSeverityCount: highCount,
            primaryBottleneck: topBottleneck ? {
                taskId: topBottleneck.taskId,
                title: topBottleneck.title,
                severity: topBottleneck.severity,
                score: topBottleneck.score
            } : null,
            message: summaryMessage
        }
    };
};

/**
 * Fetches live project data from database and computes Bottlenecks.
 * READ-ONLY: Never mutates database records.
 * 
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getProjectBottlenecks = async (projectId, userId) => {
    // 1. Verify user project access
    const project = await verifyProjectAccess(projectId, userId);

    // 2. Fetch project tasks and dependencies in single efficient queries
    const [tasks, dependencies] = await Promise.all([
        prisma.tasks.findMany({
            where: {
                project_id: projectId,
                is_archived: false
            },
            include: {
                users_tasks_assigned_toTousers: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                }
            }
        }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: {
                    project_id: projectId,
                    is_archived: false
                },
                tasks_task_dependencies_depends_on_task_idTotasks: {
                    project_id: projectId,
                    is_archived: false
                }
            }
        })
    ]);

    const startOfToday = getStartOfTodayUtc();

    return detectBottlenecks({
        project,
        tasks,
        dependencies,
        startOfToday
    });
};

export default {
    BOTTLENECK_SEVERITIES,
    BOTTLENECK_TYPES,
    determineBottleneckSeverity,
    analyzeDownstreamReach,
    detectBottlenecks,
    getProjectBottlenecks
};
