import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { calculateCriticalPath, calculateTaskDurationDays } from "./criticalPathService.js";
import { detectBottlenecks } from "./bottleneckService.js";

/**
 * Builds a deterministic Project Digital Twin in-memory snapshot.
 * 
 * Combines project metadata, tasks, dependencies, CPM critical path,
 * bottlenecks, team members, risks, and decisions from the current database state.
 * 
 * @param {Object} params
 * @param {Object} params.project Project model object
 * @param {Array<Object>} params.tasks Active project tasks
 * @param {Array<Object>} [params.dependencies] Task dependencies
 * @param {Array<Object>} [params.projectMembers] Project members
 * @param {Array<Object>} [params.risks] Project risks
 * @param {Array<Object>} [params.decisions] Project decisions
 * @param {Object} [params.cpmResult] Optional precomputed CPM result
 * @param {Object} [params.bottleneckResult] Optional precomputed bottleneck result
 * @param {Date} [params.startOfToday] Start of today in UTC
 * @returns {Object} Deterministic Digital Twin structured object
 */
export const buildDigitalTwin = ({
    project,
    tasks = [],
    dependencies = [],
    projectMembers = [],
    risks = [],
    decisions = [],
    cpmResult = null,
    bottleneckResult = null,
    startOfToday = getStartOfTodayUtc()
}) => {
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const projectId = project?.id || (activeTasks[0]?.project_id) || "unknown";
    const projectTitle = project?.title || "Untitled Project";

    // 1. Critical Path Analysis (reuse existing Phase 1A algorithm)
    const cpm = cpmResult || calculateCriticalPath({
        project,
        tasks: activeTasks,
        dependencies,
        startOfToday
    });

    // 2. Bottleneck Intelligence (reuse existing Phase 1A algorithm)
    const bottlenecks = bottleneckResult || detectBottlenecks({
        project,
        tasks: activeTasks,
        dependencies,
        cpmResult: cpm,
        startOfToday
    });

    // 3. Task Aggregations
    let totalTasks = activeTasks.length;
    let completedTasks = 0;
    let incompleteTasks = 0;
    let overdueTasks = 0;
    let dueSoonTasks = 0;
    let criticalTasksCount = 0;
    let blockedTasksCount = 0;
    let highPriorityCount = 0;
    let unassignedCount = 0;
    let totalEstimatedHours = 0;
    let remainingEstimatedHours = 0;

    const sevenDaysFromNow = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const criticalTaskIds = new Set(cpm.criticalTaskIds || cpm.criticalTasks || []);

    // Create lookup for incomplete task status to detect blocked tasks
    const incompleteTaskIds = new Set();
    activeTasks.forEach((t) => {
        if (t.status !== "Completed") {
            incompleteTaskIds.add(t.id);
        }
    });

    // Upstream dependency lookup: task_id depends on depends_on_task_id
    const taskPrerequisites = new Map();
    (dependencies || []).forEach((dep) => {
        const taskId = dep.task_id;
        const parentId = dep.depends_on_task_id;
        if (!taskPrerequisites.has(taskId)) {
            taskPrerequisites.set(taskId, []);
        }
        taskPrerequisites.get(taskId).push(parentId);
    });

    activeTasks.forEach((task) => {
        const isCompleted = task.status === "Completed";
        const hours = Number(task.estimated_hours || 0);
        totalEstimatedHours += hours;

        if (isCompleted) {
            completedTasks++;
        } else {
            incompleteTasks++;
            remainingEstimatedHours += hours;

            // Check overdue
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                if (!isNaN(dueDate.getTime()) && dueDate < startOfToday) {
                    overdueTasks++;
                } else if (!isNaN(dueDate.getTime()) && dueDate >= startOfToday && dueDate <= sevenDaysFromNow) {
                    dueSoonTasks++;
                }
            }

            // Check blocked: has prerequisites that are incomplete
            const prereqs = taskPrerequisites.get(task.id) || [];
            const hasIncompletePrereq = prereqs.some((pId) => incompleteTaskIds.has(pId));
            if (hasIncompletePrereq) {
                blockedTasksCount++;
            }
        }

        if (criticalTaskIds.has(task.id)) {
            criticalTasksCount++;
        }

        if (task.priority === "High" || task.priority === "Critical") {
            highPriorityCount++;
        }

        if (!task.assigned_to) {
            unassignedCount++;
        }
    });

    // 4. Dependency Metrics
    const totalDeps = (dependencies || []).length;
    const maxPossibleDeps = totalTasks > 1 ? totalTasks * (totalTasks - 1) : 1;
    const dependencyDensity = Number((totalDeps / maxPossibleDeps).toFixed(4));

    // Critical dependencies: where both parent and child are critical tasks
    let criticalDependenciesCount = 0;
    (dependencies || []).forEach((dep) => {
        if (criticalTaskIds.has(dep.task_id) && criticalTaskIds.has(dep.depends_on_task_id)) {
            criticalDependenciesCount++;
        }
    });

    // Blocked dependency chains: dependencies where parent is incomplete
    let blockedChainsCount = 0;
    (dependencies || []).forEach((dep) => {
        if (incompleteTaskIds.has(dep.depends_on_task_id) && incompleteTaskIds.has(dep.task_id)) {
            blockedChainsCount++;
        }
    });

    // 5. Team Workload Metrics
    const memberMap = new Map();
    (projectMembers || []).forEach((pm) => {
        const user = pm.users || {};
        memberMap.set(pm.user_id, {
            userId: pm.user_id,
            name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Unknown Member",
            email: user.email || "",
            role: pm.roles?.role_name || "Member",
            taskCount: 0,
            incompleteCount: 0,
            overdueCount: 0,
            criticalCount: 0,
            estimatedHours: 0,
            remainingHours: 0
        });
    });

    let unassignedHours = 0;
    let unassignedCriticalCount = 0;

    activeTasks.forEach((task) => {
        const hours = Number(task.estimated_hours || 0);
        const isCritical = criticalTaskIds.has(task.id);
        const isCompleted = task.status === "Completed";
        const isOverdue = !isCompleted && task.due_date && new Date(task.due_date) < startOfToday;

        if (task.assigned_to && memberMap.has(task.assigned_to)) {
            const m = memberMap.get(task.assigned_to);
            m.taskCount++;
            m.estimatedHours += hours;
            if (!isCompleted) {
                m.incompleteCount++;
                m.remainingHours += hours;
            }
            if (isOverdue) m.overdueCount++;
            if (isCritical) m.criticalCount++;
        } else if (!task.assigned_to) {
            unassignedHours += hours;
            if (isCritical) unassignedCriticalCount++;
        }
    });

    const teamMembersList = Array.from(memberMap.values());

    // 6. Risks Aggregation
    const openRisks = (risks || []).filter((r) => r.status !== "Closed" && r.status !== "Mitigated");
    const highRisks = openRisks.filter((r) => r.severity === "High" || r.severity === "Critical");
    const criticalRisks = openRisks.filter((r) => r.severity === "Critical");

    const riskSeverityDistribution = {
        CRITICAL: openRisks.filter((r) => r.severity === "Critical").length,
        HIGH: openRisks.filter((r) => r.severity === "High").length,
        MEDIUM: openRisks.filter((r) => r.severity === "Medium").length,
        LOW: openRisks.filter((r) => r.severity === "Low").length
    };

    // 7. Decisions Aggregation
    const activeDecisions = decisions || [];
    const openDecisions = activeDecisions.filter((d) => d.status === "Proposed" || d.status === "Pending");

    // 8. Schedule calculations
    const plannedStart = project?.start_date ? new Date(project.start_date) : null;
    const plannedEnd = project?.end_date ? new Date(project.end_date) : null;
    let plannedDurationDays = 0;
    if (plannedStart && plannedEnd && !isNaN(plannedStart.getTime()) && !isNaN(plannedEnd.getTime())) {
        plannedDurationDays = Math.max(1, Math.round((plannedEnd.getTime() - plannedStart.getTime()) / (1000 * 60 * 60 * 24)));
    } else if ((cpm.projectCriticalPathDays || cpm.projectDurationDays || 0) > 0) {
        plannedDurationDays = cpm.projectCriticalPathDays || cpm.projectDurationDays;
    }

    const projectedDurationDays = cpm.projectCriticalPathDays || cpm.projectDurationDays || 0;
    const remainingDurationDays = Math.max(0, cpm.projectCriticalPathDays || cpm.criticalPathDuration || 0);

    return {
        project: {
            id: projectId,
            title: projectTitle,
            description: project?.description || "",
            status: project?.status || "Planning",
            priority: project?.priority || "Medium",
            category: project?.category || "",
            startDate: plannedStart ? plannedStart.toISOString() : null,
            endDate: plannedEnd ? plannedEnd.toISOString() : null,
            plannedDurationDays,
            projectedDurationDays,
            remainingDurationDays,
            manager: project?.users ? {
                id: project.users.id,
                name: `${project.users.first_name || ""} ${project.users.last_name || ""}`.trim(),
                email: project.users.email
            } : null,
            workspaceId: project?.workspace_id || null,
            workspaceName: project?.workspaces?.name || ""
        },
        tasks: {
            total: totalTasks,
            completed: completedTasks,
            incomplete: incompleteTasks,
            overdue: overdueTasks,
            dueSoon: dueSoonTasks,
            critical: criticalTasksCount,
            blocked: blockedTasksCount,
            highPriority: highPriorityCount,
            unassigned: unassignedCount,
            totalEstimatedHours,
            remainingEstimatedHours,
            completionPercentage: totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 100,
            items: activeTasks
        },
        dependencies: {
            total: totalDeps,
            density: dependencyDensity,
            blockedChains: blockedChainsCount,
            criticalDependencies: criticalDependenciesCount,
            hasCycle: Boolean(cpm.hasCycle),
            cycleNodes: cpm.cycleNodes || []
        },
        criticalPath: {
            criticalTasks: cpm.criticalTaskIds || cpm.criticalTasks || [],
            criticalPath: cpm.criticalPath || [],
            allCriticalPaths: cpm.allCriticalPaths || [],
            criticalPathDuration: cpm.projectCriticalPathDays || cpm.criticalPathDuration || 0,
            projectDurationDays: cpm.projectCriticalPathDays || cpm.projectDurationDays || 0,
            hasCycle: Boolean(cpm.hasCycle),
            cycleNodes: cpm.cycleNodes || []
        },
        bottlenecks: {
            count: (bottlenecks.bottlenecks || bottlenecks.items || []).length,
            majorBottlenecksCount: (bottlenecks.bottlenecks || bottlenecks.items || []).filter((b) => b.severity === "CRITICAL" || b.severity === "HIGH").length,
            highestBottleneck: (bottlenecks.bottlenecks || bottlenecks.items || [])[0] || null,
            distribution: {
                CRITICAL: (bottlenecks.bottlenecks || bottlenecks.items || []).filter((b) => b.severity === "CRITICAL").length,
                HIGH: (bottlenecks.bottlenecks || bottlenecks.items || []).filter((b) => b.severity === "HIGH").length,
                MEDIUM: (bottlenecks.bottlenecks || bottlenecks.items || []).filter((b) => b.severity === "MEDIUM").length,
                LOW: (bottlenecks.bottlenecks || bottlenecks.items || []).filter((b) => b.severity === "LOW").length
            },
            items: bottlenecks.bottlenecks || bottlenecks.items || []
        },
        team: {
            memberCount: teamMembersList.length,
            members: teamMembersList,
            unassignedTasks: unassignedCount,
            unassignedHours,
            unassignedCriticalCount
        },
        risks: {
            total: (risks || []).length,
            open: openRisks.length,
            highRisksCount: highRisks.length,
            criticalRisksCount: criticalRisks.length,
            distribution: riskSeverityDistribution,
            items: openRisks
        },
        decisions: {
            total: activeDecisions.length,
            open: openDecisions.length,
            items: activeDecisions.slice(0, 5)
        },
        generatedAt: new Date().toISOString()
    };
};

/**
 * Fetches database records and constructs the Digital Twin for a given project.
 * Strictly verifies project access for the requesting user.
 * 
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<Object>} Digital Twin
 */
export const getProjectDigitalTwin = async (projectId, userId) => {
    // 1. Verify user project access
    const project = await verifyProjectAccess(projectId, userId);

    // 2. Efficient parallel fetch of all required project entities
    const [tasks, dependencies, members, risks, decisions] = await Promise.all([
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
        }),
        prisma.project_members.findMany({
            where: { project_id: projectId },
            include: {
                users: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                },
                roles: {
                    select: { id: true, role_name: true }
                }
            }
        }),
        prisma.risks.findMany({
            where: { project_id: projectId },
            orderBy: { created_at: "desc" }
        }),
        prisma.decisions.findMany({
            where: { project_id: projectId },
            orderBy: { decision_date: "desc" }
        })
    ]);

    const startOfToday = getStartOfTodayUtc();

    return buildDigitalTwin({
        project,
        tasks,
        dependencies,
        projectMembers: members,
        risks,
        decisions,
        startOfToday
    });
};

export default {
    buildDigitalTwin,
    getProjectDigitalTwin
};
