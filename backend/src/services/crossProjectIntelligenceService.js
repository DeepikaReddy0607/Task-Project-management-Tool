import prisma from "../config/prisma.js";
import { getStartOfTodayUtc } from "./taskService.js";

const inMemoryCrossProjectStore = new Map();

export const clearCrossProjectStore = () => {
    inMemoryCrossProjectStore.clear();
};

export const setInMemoryCrossProjectData = (workspaceId, data) => {
    inMemoryCrossProjectStore.set(workspaceId, data);
};

/**
 * Calculates Cross-Project Intelligence across authorized projects in a workspace.
 */
export const calculateCrossProjectIntelligence = ({
    workspaceId,
    projects = [],
    tasks = [],
    members = [],
    dependencies = [],
    startOfToday = getStartOfTodayUtc()
}) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (inMemoryCrossProjectStore.has(workspaceId)) {
        return inMemoryCrossProjectStore.get(workspaceId);
    }

    const activeProjects = (projects || []).filter((p) => !p.is_archived);
    const activeTasks = (tasks || []).filter((t) => !t.is_archived);
    const projectMap = new Map();
    activeProjects.forEach((p) => projectMap.set(p.id, p));

    // 1. Shared Member Analysis
    // Group active tasks by assigned user
    const userProjectMap = new Map(); // userId -> Set<projectId>
    const userTaskStats = new Map(); // userId -> { active, critical, overdue, hours, tasksByProject }

    activeTasks.forEach((t) => {
        const uId = t.assigned_to;
        if (!uId) return;

        if (!userProjectMap.has(uId)) {
            userProjectMap.set(uId, new Set());
            userTaskStats.set(uId, {
                userId: uId,
                name: t.users_tasks_assigned_toTousers ? `${t.users_tasks_assigned_toTousers.first_name || ""} ${t.users_tasks_assigned_toTousers.last_name || ""}`.trim() || t.users_tasks_assigned_toTousers.email : "Member",
                activeTaskCount: 0,
                criticalTaskCount: 0,
                overdueTaskCount: 0,
                totalEstimatedHours: 0,
                projectTasks: new Map() // projectId -> Array<task>
            });
        }

        userProjectMap.get(uId).add(t.project_id);
        const stats = userTaskStats.get(uId);

        if (t.status !== "Completed") {
            stats.activeTaskCount++;
            stats.totalEstimatedHours += Number(t.estimated_hours || 0);

            if (t.priority === "High" || t.priority === "Critical") {
                stats.criticalTaskCount++;
            }

            if (t.due_date && new Date(t.due_date) < startOfToday) {
                stats.overdueTaskCount++;
            }

            if (!stats.projectTasks.has(t.project_id)) {
                stats.projectTasks.set(t.project_id, []);
            }
            stats.projectTasks.get(t.project_id).push(t);
        }
    });

    const sharedMembers = [];
    userProjectMap.forEach((pIds, uId) => {
        if (pIds.size >= 2) {
            const stats = userTaskStats.get(uId);
            const projectDetails = Array.from(pIds).map((pId) => ({
                projectId: pId,
                title: projectMap.get(pId)?.title || "Project",
                taskCount: stats.projectTasks.get(pId)?.length || 0
            }));

            // Calculate cross-project workload score (0 - 100)
            const workloadScore = Math.min(
                100,
                Math.round(
                    stats.activeTaskCount * 10 +
                    stats.criticalTaskCount * 15 +
                    stats.overdueTaskCount * 20 +
                    (pIds.size - 1) * 15
                )
            );

            sharedMembers.push({
                userId: uId,
                name: stats.name,
                projectIds: Array.from(pIds),
                projects: projectDetails,
                projectCount: pIds.size,
                activeTaskCount: stats.activeTaskCount,
                criticalTaskCount: stats.criticalTaskCount,
                overdueTaskCount: stats.overdueTaskCount,
                totalEstimatedHours: stats.totalEstimatedHours,
                workloadScore
            });
        }
    });

    // 2. Cross-Project Resource Conflicts
    // Conflict flags when a member is on multiple critical tasks or overdue work across projects
    const resourceConflicts = [];
    sharedMembers.forEach((sm) => {
        if (sm.criticalTaskCount >= 2 || (sm.criticalTaskCount >= 1 && sm.overdueTaskCount >= 1)) {
            resourceConflicts.push({
                userId: sm.userId,
                name: sm.name,
                type: "CROSS_PROJECT_RESOURCE_CONCENTRATION",
                severity: sm.criticalTaskCount >= 3 || sm.overdueTaskCount >= 2 ? "HIGH" : "MEDIUM",
                projectsInvolved: sm.projects.map((p) => p.title),
                explanation: `${sm.name} is assigned to ${sm.criticalTaskCount} critical and ${sm.overdueTaskCount} overdue task(s) across ${sm.projectCount} projects.`,
                disclaimer: "Detected scheduling pressure signal, not an assessment of individual capacity or performance."
            });
        }
    });

    // 3. Cross-Project Deadline Conflicts
    // Tasks due within a 3-day window across DIFFERENT projects for the same assignee
    const deadlineConflicts = [];
    const windowDays = 3;

    userTaskStats.forEach((stats, uId) => {
        const userIncompleteTasks = [];
        stats.projectTasks.forEach((pTasks, pId) => {
            pTasks.forEach((t) => {
                if (t.due_date) {
                    userIncompleteTasks.push({ ...t, pId });
                }
            });
        });

        for (let i = 0; i < userIncompleteTasks.length; i++) {
            for (let j = i + 1; j < userIncompleteTasks.length; j++) {
                const t1 = userIncompleteTasks[i];
                const t2 = userIncompleteTasks[j];

                if (t1.pId !== t2.pId) {
                    const d1 = new Date(t1.due_date).getTime();
                    const d2 = new Date(t2.due_date).getTime();
                    const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);

                    if (diffDays <= windowDays) {
                        deadlineConflicts.push({
                            userId: uId,
                            userName: stats.name,
                            taskA: { id: t1.id, title: t1.title, dueDate: t1.due_date, projectTitle: projectMap.get(t1.pId)?.title || "Project A" },
                            taskB: { id: t2.id, title: t2.title, dueDate: t2.due_date, projectTitle: projectMap.get(t2.pId)?.title || "Project B" },
                            gapDays: Math.round(diffDays),
                            type: "CROSS_PROJECT_DEADLINE_PRESSURE",
                            severity: diffDays === 0 ? "HIGH" : "MEDIUM",
                            explanation: `Concurrent deadlines (${Math.round(diffDays)} day(s) apart) in '${projectMap.get(t1.pId)?.title}' and '${projectMap.get(t2.pId)?.title}'.`
                        });
                    }
                }
            }
        }
    });

    // 4. Shared Dependencies
    const sharedDependencies = [];
    (dependencies || []).forEach((dep) => {
        const tChild = activeTasks.find((t) => t.id === dep.task_id);
        const tParent = activeTasks.find((t) => t.id === dep.depends_on_task_id);
        if (tChild && tParent && tChild.project_id !== tParent.project_id) {
            sharedDependencies.push({
                sourceTaskId: tParent.id,
                sourceTaskTitle: tParent.title,
                sourceProjectId: tParent.project_id,
                sourceProjectTitle: projectMap.get(tParent.project_id)?.title || "Project",
                targetTaskId: tChild.id,
                targetTaskTitle: tChild.title,
                targetProjectId: tChild.project_id,
                targetProjectTitle: projectMap.get(tChild.project_id)?.title || "Project"
            });
        }
    });

    // 5. Cross-Project Bottlenecks
    const crossProjectBottlenecks = sharedMembers
        .filter((sm) => sm.workloadScore >= 60 || sm.criticalTaskCount >= 2)
        .map((sm) => ({
            userId: sm.userId,
            name: sm.name,
            projects: sm.projects.map((p) => p.title),
            workloadScore: sm.workloadScore,
            criticalTasks: sm.criticalTaskCount,
            overdueTasks: sm.overdueTaskCount,
            severity: sm.workloadScore >= 80 ? "CRITICAL" : "HIGH",
            evidence: `High cross-project workload concentration across ${sm.projectCount} active projects with ${sm.criticalTaskCount} critical tasks.`
        }));

    return {
        workspaceId,
        totalProjects: activeProjects.length,
        sharedMembersCount: sharedMembers.length,
        sharedMembers,
        resourceConflicts,
        deadlineConflicts,
        sharedDependencies,
        crossProjectBottlenecks,
        disclaimer: "Cross-project observations represent structural resource allocation and schedule alignments without evaluating employee performance."
    };
};

/**
 * Retrieve cross-project intelligence with authorization check.
 */
export const getCrossProjectIntelligence = async (workspaceId, userId) => {
    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (inMemoryCrossProjectStore.has(workspaceId)) {
        return inMemoryCrossProjectStore.get(workspaceId);
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

    // Fetch projects user is authorized to see
    const projects = await prisma.projects.findMany({
        where: { workspace_id: workspaceId, is_archived: false },
        include: {
            project_members: { select: { user_id: true } }
        }
    });

    const authorizedProjects = projects.filter((p) =>
        membership.workspace_role === "Owner" ||
        membership.workspace_role === "Admin" ||
        p.manager_id === userId ||
        p.project_members.some((m) => m.user_id === userId)
    );

    const projectIds = authorizedProjects.map((p) => p.id);

    const [tasks, dependencies] = await Promise.all([
        prisma.tasks.findMany({
            where: { project_id: { in: projectIds }, is_archived: false },
            include: {
                users_tasks_assigned_toTousers: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                }
            }
        }),
        prisma.task_dependencies.findMany({
            where: {
                tasks_task_dependencies_task_idTotasks: { project_id: { in: projectIds }, is_archived: false },
                tasks_task_dependencies_depends_on_task_idTotasks: { project_id: { in: projectIds }, is_archived: false }
            }
        })
    ]);

    return calculateCrossProjectIntelligence({
        workspaceId,
        projects: authorizedProjects,
        tasks,
        dependencies
    });
};
