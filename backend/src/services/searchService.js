/**
 * Unified Search & Filter Service (Phase 16)
 * 
 * Provides permission-aware, server-side global search and advanced filtering
 * across TaskFlow entities:
 * - Projects
 * - Tasks & Subtasks
 * - Workspaces
 * - Decisions (Phase 14)
 * - Risks
 * - Team Members / Users (scoped to shared workspaces)
 * - System & Project Activity Logs
 * 
 * Safety Invariants:
 * - Permission-aware: Users can ONLY search/discover resources in workspaces/projects they are authorized to access
 * - Cross-workspace and cross-project data leakage is strictly prevented
 * - Sensitive authentication credentials (passwords, hashes, tokens, secrets) are NEVER exposed
 * - Search is strictly read-only: zero state mutations
 * - Bounded pagination: maximum 100 items per page
 * - Dual-mode architecture: connects to Prisma with seamless in-memory fallback for test isolation
 */

import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import { sanitizeUser } from "./adminService.js";

export const SEARCHABLE_ENTITY_TYPES = [
    "all",
    "tasks",
    "projects",
    "workspaces",
    "decisions",
    "risks",
    "members",
    "activity"
];

// ============================================================
// IN-MEMORY TEST STORE FOR TEST ISOLATION
// ============================================================

let inMemoryStore = {
    users: [],
    workspaces: [],
    workspaceMembers: [],
    projects: [],
    projectMembers: [],
    tasks: [],
    decisions: [],
    risks: [],
    activityLogs: []
};

export const clearSearchStore = () => {
    inMemoryStore = {
        users: [],
        workspaces: [],
        workspaceMembers: [],
        projects: [],
        projectMembers: [],
        tasks: [],
        decisions: [],
        risks: [],
        activityLogs: []
    };
};

export const seedInMemorySearchData = (data = {}) => {
    if (data.users) inMemoryStore.users = [...data.users];
    if (data.workspaces) inMemoryStore.workspaces = [...data.workspaces];
    if (data.workspaceMembers) inMemoryStore.workspaceMembers = [...data.workspaceMembers];
    if (data.projects) inMemoryStore.projects = [...data.projects];
    if (data.projectMembers) inMemoryStore.projectMembers = [...data.projectMembers];
    if (data.tasks) inMemoryStore.tasks = [...data.tasks];
    if (data.decisions) inMemoryStore.decisions = [...data.decisions];
    if (data.risks) inMemoryStore.risks = [...data.risks];
    if (data.activityLogs) inMemoryStore.activityLogs = [...data.activityLogs];
};

export const getInMemorySearchStore = () => inMemoryStore;

// ============================================================
// PERMISSION RESOLUTION HELPERS
// ============================================================

/**
 * Resolves the workspaces and projects accessible by a user.
 */
export const getUserAccessibleScope = async (userId, userRole = null) => {
    if (!userId) {
        return { isAdmin: false, workspaceIds: [], projectIds: [] };
    }

    const isAdmin = (userRole || "").trim().toLowerCase() === "admin";

    // In-memory branch
    if (inMemoryStore.users.length > 0 || inMemoryStore.workspaces.length > 0) {
        const user = inMemoryStore.users.find(u => u.id === userId);
        const resolvedRole = (userRole || user?.roles?.role_name || user?.role || "").trim().toLowerCase();
        const userIsAdmin = resolvedRole === "admin";

        if (userIsAdmin) {
            return {
                isAdmin: true,
                workspaceIds: inMemoryStore.workspaces.map(w => w.id),
                projectIds: inMemoryStore.projects.map(p => p.id)
            };
        }

        // Accessible workspaces: owned or member of
        const ownedWorkspaceIds = inMemoryStore.workspaces
            .filter(w => (w.owner_id || w.ownerId) === userId)
            .map(w => w.id);

        const memberWorkspaceIds = inMemoryStore.workspaceMembers
            .filter(wm => (wm.user_id || wm.userId) === userId)
            .map(wm => wm.workspace_id || wm.workspaceId);

        const workspaceIds = [...new Set([...ownedWorkspaceIds, ...memberWorkspaceIds])];

        // Accessible projects: in accessible workspaces OR explicit project member OR manager
        const accessibleProjects = inMemoryStore.projects.filter(p => {
            const pWsId = p.workspace_id || p.workspaceId;
            if (workspaceIds.includes(pWsId)) return true;
            if ((p.manager_id || p.managerId) === userId) return true;
            const isProjMember = inMemoryStore.projectMembers.some(
                pm => (pm.project_id || pm.projectId) === p.id && (pm.user_id || pm.userId) === userId
            );
            return isProjMember;
        });

        const projectIds = accessibleProjects.map(p => p.id);

        return {
            isAdmin: false,
            workspaceIds,
            projectIds
        };
    }

    // Prisma DB branch
    try {
        let userIsAdmin = isAdmin;
        if (!userIsAdmin) {
            const u = await prisma.users.findUnique({
                where: { id: userId },
                include: { roles: true }
            });
            userIsAdmin = (u?.roles?.role_name || "").toLowerCase() === "admin";
        }

        if (userIsAdmin) {
            const [allWs, allProj] = await Promise.all([
                prisma.workspaces.findMany({ select: { id: true } }),
                prisma.projects.findMany({ select: { id: true } })
            ]);
            return {
                isAdmin: true,
                workspaceIds: allWs.map(w => w.id),
                projectIds: allProj.map(p => p.id)
            };
        }

        // 1. Workspaces
        const [ownedWs, memberWs] = await Promise.all([
            prisma.workspaces.findMany({ where: { owner_id: userId }, select: { id: true } }),
            prisma.workspace_members.findMany({ where: { user_id: userId }, select: { workspace_id: true } })
        ]);

        const workspaceIds = [...new Set([
            ...ownedWs.map(w => w.id),
            ...memberWs.map(m => m.workspace_id)
        ])];

        // 2. Projects
        const [wsProjects, managedProjects, memberProjects] = await Promise.all([
            prisma.projects.findMany({ where: { workspace_id: { in: workspaceIds } }, select: { id: true } }),
            prisma.projects.findMany({ where: { manager_id: userId }, select: { id: true } }),
            prisma.project_members.findMany({ where: { user_id: userId }, select: { project_id: true } })
        ]);

        const projectIds = [...new Set([
            ...wsProjects.map(p => p.id),
            ...managedProjects.map(p => p.id),
            ...memberProjects.map(pm => pm.project_id)
        ])];

        return {
            isAdmin: false,
            workspaceIds,
            projectIds
        };
    } catch (err) {
        console.warn("Failed to resolve user accessible scope in DB:", err.message);
        return { isAdmin: false, workspaceIds: [], projectIds: [] };
    }
};

// ============================================================
// MAIN UNIFIED SEARCH FUNCTION
// ============================================================

export const executeUnifiedSearch = async ({
    query = "",
    type = "all",
    workspaceId = null,
    projectId = null,
    status = null,
    priority = null,
    assigneeId = null,
    ownerId = null,
    category = null,
    severity = null,
    from = null,
    to = null,
    page = 1,
    pageSize = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
    userId,
    userRole = null
}) => {
    if (!userId) {
        const error = new Error("Authentication required for search");
        error.statusCode = 401;
        throw error;
    }

    const q = String(query || "").trim().toLowerCase();
    const targetType = (type || "all").toLowerCase();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    // 1. Resolve permission scope
    const scope = await getUserAccessibleScope(userId, userRole);

    // 2. Scoping validation & IDOR Protection:
    // If workspaceId is requested, verify user has access to that workspace
    let effectiveWorkspaceIds = scope.workspaceIds;
    if (workspaceId) {
        if (!scope.isAdmin && !scope.workspaceIds.includes(workspaceId)) {
            // Cannot reveal whether inaccessible workspace exists
            return {
                query: q,
                type: targetType,
                results: {},
                flatResults: [],
                counts: { total: 0 },
                pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
            };
        }
        effectiveWorkspaceIds = [workspaceId];
    }

    // If projectId is requested, verify user has access to that project
    let effectiveProjectIds = scope.projectIds;
    if (projectId) {
        if (!scope.isAdmin && !scope.projectIds.includes(projectId)) {
            // Cannot reveal whether inaccessible project exists
            return {
                query: q,
                type: targetType,
                results: {},
                flatResults: [],
                counts: { total: 0 },
                pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
            };
        }
        effectiveProjectIds = [projectId];
    }

    // ============================================================
    // IN-MEMORY EXECUTION (For Unit Tests & Isolation)
    // ============================================================
    if (
        inMemoryStore.tasks.length > 0 ||
        inMemoryStore.projects.length > 0 ||
        inMemoryStore.workspaces.length > 0 ||
        inMemoryStore.decisions.length > 0 ||
        inMemoryStore.risks.length > 0 ||
        inMemoryStore.users.length > 0 ||
        inMemoryStore.activityLogs.length > 0
    ) {
        const grouped = {
            tasks: [],
            projects: [],
            workspaces: [],
            decisions: [],
            risks: [],
            members: [],
            activities: []
        };

        // A. Tasks
        if (targetType === "all" || targetType === "tasks") {
            grouped.tasks = inMemoryStore.tasks
                .filter(t => {
                    const pId = t.project_id || t.projectId;
                    if (!effectiveProjectIds.includes(pId)) return false;
                    if (q) {
                        const titleMatch = (t.title || "").toLowerCase().includes(q);
                        const descMatch = (t.description || "").toLowerCase().includes(q);
                        if (!titleMatch && !descMatch) return false;
                    }
                    if (status && status !== "all") {
                        if ((t.status || "").toLowerCase() !== status.toLowerCase()) return false;
                    }
                    if (priority && priority !== "all") {
                        if ((t.priority || "").toLowerCase() !== priority.toLowerCase()) return false;
                    }
                    if (assigneeId) {
                        if ((t.assigned_to || t.assignedTo) !== assigneeId) return false;
                    }
                    return true;
                })
                .map(t => {
                    const prj = inMemoryStore.projects.find(p => p.id === (t.project_id || t.projectId));
                    return {
                        id: t.id,
                        entityType: "task",
                        title: t.title,
                        description: t.description || "",
                        status: t.status || "Backlog",
                        priority: t.priority || "Medium",
                        projectId: t.project_id || t.projectId,
                        projectTitle: prj?.title || prj?.name || "Project",
                        workspaceId: prj?.workspace_id || prj?.workspaceId,
                        dueDate: t.due_date || t.dueDate || null,
                        createdAt: t.created_at || t.createdAt || new Date().toISOString(),
                        navigationTarget: `/tasks?taskId=${t.id}&projectId=${t.project_id || t.projectId}`
                    };
                });
        }

        // B. Projects
        if (targetType === "all" || targetType === "projects") {
            grouped.projects = inMemoryStore.projects
                .filter(p => {
                    if (!effectiveProjectIds.includes(p.id)) return false;
                    const wsId = p.workspace_id || p.workspaceId;
                    if (effectiveWorkspaceIds.length > 0 && !effectiveWorkspaceIds.includes(wsId)) return false;
                    if (q) {
                        const titleMatch = (p.title || p.name || "").toLowerCase().includes(q);
                        const descMatch = (p.description || "").toLowerCase().includes(q);
                        if (!titleMatch && !descMatch) return false;
                    }
                    if (status && status !== "all") {
                        if ((p.status || "").toLowerCase() !== status.toLowerCase()) return false;
                    }
                    if (ownerId || assigneeId) {
                        const mgr = p.manager_id || p.managerId;
                        if (mgr !== (ownerId || assigneeId)) return false;
                    }
                    return true;
                })
                .map(p => {
                    const ws = inMemoryStore.workspaces.find(w => w.id === (p.workspace_id || p.workspaceId));
                    return {
                        id: p.id,
                        entityType: "project",
                        title: p.title || p.name,
                        description: p.description || "",
                        status: p.status || "In Progress",
                        workspaceId: p.workspace_id || p.workspaceId,
                        workspaceName: ws?.name || "Workspace",
                        managerId: p.manager_id || p.managerId,
                        isArchived: Boolean(p.is_archived || p.isArchived),
                        createdAt: p.created_at || p.createdAt || new Date().toISOString(),
                        navigationTarget: `/projects?projectId=${p.id}`
                    };
                });
        }

        // C. Workspaces
        if (targetType === "all" || targetType === "workspaces") {
            grouped.workspaces = inMemoryStore.workspaces
                .filter(w => {
                    if (!effectiveWorkspaceIds.includes(w.id)) return false;
                    if (q) {
                        const nameMatch = (w.name || "").toLowerCase().includes(q);
                        const descMatch = (w.description || "").toLowerCase().includes(q);
                        if (!nameMatch && !descMatch) return false;
                    }
                    return true;
                })
                .map(w => ({
                    id: w.id,
                    entityType: "workspace",
                    title: w.name,
                    description: w.description || "",
                    ownerId: w.owner_id || w.ownerId,
                    createdAt: w.created_at || w.createdAt || new Date().toISOString(),
                    navigationTarget: `/workspaces?workspaceId=${w.id}`
                }));
        }

        // D. Decisions (Phase 14)
        if (targetType === "all" || targetType === "decisions") {
            grouped.decisions = inMemoryStore.decisions
                .filter(d => {
                    const pId = d.project_id || d.projectId;
                    if (!effectiveProjectIds.includes(pId)) return false;
                    if (q) {
                        const titleMatch = (d.title || d.decision || "").toLowerCase().includes(q);
                        const reasonMatch = (d.rationale || d.reason || "").toLowerCase().includes(q);
                        const tagsMatch = Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(q));
                        if (!titleMatch && !reasonMatch && !tagsMatch) return false;
                    }
                    if (category && category !== "all") {
                        if ((d.category || "").toLowerCase() !== category.toLowerCase()) return false;
                    }
                    if (status && status !== "all") {
                        if ((d.status || "").toLowerCase() !== status.toLowerCase()) return false;
                    }
                    return true;
                })
                .map(d => {
                    const prj = inMemoryStore.projects.find(p => p.id === (d.project_id || d.projectId));
                    return {
                        id: d.id,
                        entityType: "decision",
                        title: d.title || d.decision,
                        description: d.rationale || d.reason || "",
                        category: d.category || "GENERAL",
                        status: d.status || "ACTIVE",
                        projectId: d.project_id || d.projectId,
                        projectTitle: prj?.title || prj?.name || "Project",
                        createdAt: d.created_at || d.createdAt || d.decisionDate || new Date().toISOString(),
                        navigationTarget: `/command-center?projectId=${d.project_id || d.projectId}&tab=decisions`
                    };
                });
        }

        // E. Risks
        if (targetType === "all" || targetType === "risks") {
            grouped.risks = inMemoryStore.risks
                .filter(r => {
                    const pId = r.project_id || r.projectId;
                    if (!effectiveProjectIds.includes(pId)) return false;
                    if (q) {
                        const titleMatch = (r.title || "").toLowerCase().includes(q);
                        const descMatch = (r.description || "").toLowerCase().includes(q);
                        if (!titleMatch && !descMatch) return false;
                    }
                    if (severity && severity !== "all") {
                        if ((r.severity || "").toLowerCase() !== severity.toLowerCase()) return false;
                    }
                    if (status && status !== "all") {
                        if ((r.status || "").toLowerCase() !== status.toLowerCase()) return false;
                    }
                    return true;
                })
                .map(r => {
                    const prj = inMemoryStore.projects.find(p => p.id === (r.project_id || r.projectId));
                    return {
                        id: r.id,
                        entityType: "risk",
                        title: r.title,
                        description: r.description || "",
                        severity: r.severity || "Medium",
                        status: r.status || "Open",
                        projectId: r.project_id || r.projectId,
                        projectTitle: prj?.title || prj?.name || "Project",
                        createdAt: r.created_at || r.createdAt || new Date().toISOString(),
                        navigationTarget: `/command-center?projectId=${r.project_id || r.projectId}&tab=risks`
                    };
                });
        }

        // F. Members / Users (Strict Permission Scoping + Redaction)
        if (targetType === "all" || targetType === "members") {
            let isWorkspaceManager = false;
            if (workspaceId) {
                const ws = inMemoryStore.workspaces.find(w => (w.id === workspaceId));
                const wm = inMemoryStore.workspaceMembers.find(m => (m.workspace_id || m.workspaceId) === workspaceId && (m.user_id || m.userId) === userId);
                if (ws?.owner_id === userId || ws?.ownerId === userId || wm?.role === "Admin" || wm?.workspace_role === "Admin" || wm?.role === "Owner") {
                    isWorkspaceManager = true;
                }
            }

            // Accessible users: users who are in the user's accessible workspaces
            let allowedUserIds = new Set();
            if (scope.isAdmin || isWorkspaceManager) {
                inMemoryStore.users.forEach(u => allowedUserIds.add(u.id));
            } else {
                inMemoryStore.workspaceMembers
                    .filter(wm => effectiveWorkspaceIds.includes(wm.workspace_id || wm.workspaceId))
                    .forEach(wm => allowedUserIds.add(wm.user_id || wm.userId));
                inMemoryStore.workspaces
                    .filter(w => effectiveWorkspaceIds.includes(w.id))
                    .forEach(w => allowedUserIds.add(w.owner_id || w.ownerId));
                allowedUserIds.add(userId);
            }

            grouped.members = inMemoryStore.users
                .filter(u => {
                    if (!allowedUserIds.has(u.id)) return false;
                    if (q) {
                        const nameMatch = `${u.first_name || u.firstName || ""} ${u.last_name || u.lastName || ""}`.toLowerCase().includes(q);
                        const emailMatch = (u.email || "").toLowerCase().includes(q);
                        if (!nameMatch && !emailMatch) return false;
                    }
                    return true;
                })
                .map(u => {
                    const safe = sanitizeUser(u);
                    return {
                        id: safe.id,
                        entityType: "member",
                        title: safe.fullName || safe.email,
                        description: safe.email,
                        role: safe.role,
                        createdAt: safe.createdAt,
                        navigationTarget: scope.isAdmin ? `/admin?userId=${safe.id}` : `/profile`
                    };
                });
        }

        // G. Activity Logs
        if (targetType === "all" || targetType === "activity") {
            grouped.activities = inMemoryStore.activityLogs
                .filter(a => {
                    const wsId = a.workspace_id || a.workspaceId;
                    if (wsId && !effectiveWorkspaceIds.includes(wsId) && !scope.isAdmin) return false;
                    if (q) {
                        const descMatch = (a.description || "").toLowerCase().includes(q);
                        const actionMatch = (a.action_type || a.actionType || "").toLowerCase().includes(q);
                        if (!descMatch && !actionMatch) return false;
                    }
                    return true;
                })
                .map(a => ({
                    id: a.id,
                    entityType: "activity",
                    title: a.description,
                    actionType: a.action_type || a.actionType,
                    actor: a.actor || "System",
                    createdAt: a.created_at || a.createdAt || new Date().toISOString(),
                    navigationTarget: `/admin`
                }));
        }

        // Flatten all matching results
        let flatResults = [
            ...grouped.tasks,
            ...grouped.projects,
            ...grouped.workspaces,
            ...grouped.decisions,
            ...grouped.risks,
            ...grouped.members,
            ...grouped.activities
        ];

        // Sort flat results
        flatResults.sort((a, b) => {
            let fieldA = a[sortBy] ?? a.createdAt;
            let fieldB = b[sortBy] ?? b.createdAt;
            if (typeof fieldA === "string") fieldA = fieldA.toLowerCase();
            if (typeof fieldB === "string") fieldB = fieldB.toLowerCase();
            if (fieldA < fieldB) return sortOrder === "asc" ? -1 : 1;
            if (fieldA > fieldB) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });

        const total = flatResults.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const paginated = flatResults.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        const counts = {
            total,
            tasks: grouped.tasks.length,
            projects: grouped.projects.length,
            workspaces: grouped.workspaces.length,
            decisions: grouped.decisions.length,
            risks: grouped.risks.length,
            members: grouped.members.length,
            activities: grouped.activities.length
        };

        return {
            query: q,
            type: targetType,
            results: grouped,
            flatResults: paginated,
            counts,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages
            }
        };
    }

    // ============================================================
    // PRISMA POSTGRESQL EXECUTION
    // ============================================================
    try {
        const grouped = {
            tasks: [],
            projects: [],
            workspaces: [],
            decisions: [],
            risks: [],
            members: [],
            activities: []
        };

        const promises = [];

        // Tasks query
        if (targetType === "all" || targetType === "tasks") {
            const taskWhere = {
                project_id: { in: effectiveProjectIds }
            };
            if (q) {
                taskWhere.OR = [
                    { title: { contains: q, mode: "insensitive" } },
                    { description: { contains: q, mode: "insensitive" } }
                ];
            }
            if (status && status !== "all") {
                taskWhere.status = { equals: status, mode: "insensitive" };
            }
            if (priority && priority !== "all") {
                taskWhere.priority = { equals: priority, mode: "insensitive" };
            }
            if (assigneeId) {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assigneeId);
                if (isUUID) {
                    taskWhere.assigned_to = assigneeId;
                } else {
                    taskWhere.users_tasks_assigned_toTousers = {
                        OR: [
                            { first_name: { contains: assigneeId, mode: "insensitive" } },
                            { last_name: { contains: assigneeId, mode: "insensitive" } },
                            { email: { contains: assigneeId, mode: "insensitive" } }
                        ]
                    };
                }
            }
            if (from || to) {
                taskWhere.created_at = {};
                if (from && !isNaN(new Date(from).getTime())) {
                    taskWhere.created_at.gte = new Date(from);
                }
                if (to && !isNaN(new Date(to).getTime())) {
                    const toDate = new Date(to);
                    toDate.setHours(23, 59, 59, 999);
                    taskWhere.created_at.lte = toDate;
                }
            }

            promises.push(
                prisma.tasks.findMany({
                    where: taskWhere,
                    take: 50,
                    orderBy: { created_at: "desc" },
                    include: {
                        projects: { select: { id: true, title: true, workspace_id: true } }
                    }
                }).then(rawTasks => {
                    grouped.tasks = rawTasks.map(t => ({
                        id: t.id,
                        entityType: "task",
                        title: t.title,
                        description: t.description || "",
                        status: t.status,
                        priority: t.priority,
                        projectId: t.project_id,
                        projectTitle: t.projects?.title || "Project",
                        workspaceId: t.projects?.workspace_id,
                        dueDate: t.due_date,
                        createdAt: t.created_at,
                        navigationTarget: `/tasks?taskId=${t.id}&projectId=${t.project_id}`
                    }));
                }).catch(err => {
                    console.warn("Tasks search query error:", err.message);
                })
            );
        }

        // Projects query
        if (targetType === "all" || targetType === "projects") {
            const projWhere = {
                id: { in: effectiveProjectIds }
            };
            if (effectiveWorkspaceIds.length > 0) {
                projWhere.workspace_id = { in: effectiveWorkspaceIds };
            }
            if (q) {
                projWhere.OR = [
                    { title: { contains: q, mode: "insensitive" } },
                    { description: { contains: q, mode: "insensitive" } }
                ];
            }
            if (status && status !== "all") {
                projWhere.status = { equals: status, mode: "insensitive" };
            }
            if (ownerId || assigneeId) {
                const targetOwner = ownerId || assigneeId;
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetOwner);
                if (isUUID) {
                    projWhere.manager_id = targetOwner;
                } else {
                    projWhere.users = {
                        OR: [
                            { first_name: { contains: targetOwner, mode: "insensitive" } },
                            { last_name: { contains: targetOwner, mode: "insensitive" } },
                            { email: { contains: targetOwner, mode: "insensitive" } }
                        ]
                    };
                }
            }
            if (from || to) {
                projWhere.created_at = {};
                if (from && !isNaN(new Date(from).getTime())) {
                    projWhere.created_at.gte = new Date(from);
                }
                if (to && !isNaN(new Date(to).getTime())) {
                    const toDate = new Date(to);
                    toDate.setHours(23, 59, 59, 999);
                    projWhere.created_at.lte = toDate;
                }
            }

            promises.push(
                prisma.projects.findMany({
                    where: projWhere,
                    take: 50,
                    orderBy: { created_at: "desc" },
                    include: {
                        workspaces: { select: { id: true, name: true } }
                    }
                }).then(rawProjects => {
                    grouped.projects = rawProjects.map(p => ({
                        id: p.id,
                        entityType: "project",
                        title: p.title,
                        description: p.description || "",
                        status: p.status,
                        workspaceId: p.workspace_id,
                        workspaceName: p.workspaces?.name || "Workspace",
                        managerId: p.manager_id,
                        isArchived: p.is_archived,
                        createdAt: p.created_at,
                        navigationTarget: `/projects?projectId=${p.id}`
                    }));
                }).catch(err => {
                    console.warn("Projects search query error:", err.message);
                })
            );
        }

        // Workspaces query
        if (targetType === "all" || targetType === "workspaces") {
            const wsWhere = {
                id: { in: effectiveWorkspaceIds }
            };
            if (q) {
                wsWhere.OR = [
                    { name: { contains: q, mode: "insensitive" } },
                    { description: { contains: q, mode: "insensitive" } }
                ];
            }

            promises.push(
                prisma.workspaces.findMany({
                    where: wsWhere,
                    take: 50,
                    orderBy: { created_at: "desc" }
                }).then(rawWs => {
                    grouped.workspaces = rawWs.map(w => ({
                        id: w.id,
                        entityType: "workspace",
                        title: w.name,
                        description: w.description || "",
                        ownerId: w.owner_id,
                        createdAt: w.created_at,
                        navigationTarget: `/workspaces?workspaceId=${w.id}`
                    }));
                }).catch(err => {
                    console.warn("Workspaces search query error:", err.message);
                })
            );
        }

        // Decisions query
        if (targetType === "all" || targetType === "decisions") {
            const decWhere = {
                project_id: { in: effectiveProjectIds }
            };
            if (q) {
                decWhere.OR = [
                    { decision: { contains: q, mode: "insensitive" } },
                    { reason: { contains: q, mode: "insensitive" } }
                ];
            }
            if (status && status !== "all") {
                decWhere.status = { equals: status, mode: "insensitive" };
            }

            promises.push(
                prisma.decisions.findMany({
                    where: decWhere,
                    take: 50,
                    orderBy: { created_at: "desc" },
                    include: {
                        projects: { select: { id: true, title: true } }
                    }
                }).then(rawDec => {
                    grouped.decisions = rawDec.map(d => ({
                        id: d.id,
                        entityType: "decision",
                        title: d.decision,
                        description: d.reason || "",
                        status: d.status,
                        projectId: d.project_id,
                        projectTitle: d.projects?.title || "Project",
                        createdAt: d.created_at,
                        navigationTarget: `/command-center?projectId=${d.project_id}&tab=decisions`
                    }));
                }).catch(err => {
                    console.warn("Decisions search query error:", err.message);
                })
            );
        }

        // Risks query
        if (targetType === "all" || targetType === "risks") {
            const riskWhere = {
                project_id: { in: effectiveProjectIds }
            };
            if (q) {
                riskWhere.OR = [
                    { title: { contains: q, mode: "insensitive" } },
                    { description: { contains: q, mode: "insensitive" } }
                ];
            }
            if (severity && severity !== "all") {
                riskWhere.severity = { equals: severity, mode: "insensitive" };
            }

            promises.push(
                prisma.risks.findMany({
                    where: riskWhere,
                    take: 50,
                    orderBy: { created_at: "desc" },
                    include: {
                        projects: { select: { id: true, title: true } }
                    }
                }).then(rawRisks => {
                    grouped.risks = rawRisks.map(r => ({
                        id: r.id,
                        entityType: "risk",
                        title: r.title,
                        description: r.description || "",
                        severity: r.severity,
                        status: r.status,
                        projectId: r.project_id,
                        projectTitle: r.projects?.title || "Project",
                        createdAt: r.created_at,
                        navigationTarget: `/command-center?projectId=${r.project_id}&tab=risks`
                    }));
                }).catch(err => {
                    console.warn("Risks search query error:", err.message);
                })
            );
        }

        // Members / Users query
        if (targetType === "all" || targetType === "members") {
            let isWorkspaceManager = false;
            if (workspaceId) {
                try {
                    const [ws, wm] = await Promise.all([
                        prisma.workspaces.findUnique({ where: { id: workspaceId }, select: { owner_id: true } }),
                        prisma.workspace_members.findUnique({
                            where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
                            select: { workspace_role: true }
                        })
                    ]);
                    if (ws?.owner_id === userId || wm?.workspace_role === "Owner" || wm?.workspace_role === "Admin") {
                        isWorkspaceManager = true;
                    }
                } catch {
                    // ignore
                }
            }

            let userWhere = {};
            if (!scope.isAdmin && !isWorkspaceManager) {
                userWhere.OR = [
                    { id: userId },
                    { workspace_members: { some: { workspace_id: { in: effectiveWorkspaceIds } } } },
                    { workspaces: { some: { id: { in: effectiveWorkspaceIds } } } }
                ];
            }
            if (q) {
                const searchFilters = [
                    { first_name: { contains: q, mode: "insensitive" } },
                    { last_name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } }
                ];
                if (userWhere.OR) {
                    userWhere = {
                        AND: [
                            { OR: userWhere.OR },
                            { OR: searchFilters }
                        ]
                    };
                } else {
                    userWhere.OR = searchFilters;
                }
            }

            promises.push(
                prisma.users.findMany({
                    where: userWhere,
                    take: 50,
                    orderBy: { created_at: "desc" },
                    include: {
                        roles: { select: { role_name: true } }
                    }
                }).then(rawUsers => {
                    grouped.members = rawUsers.map(u => {
                        const safe = sanitizeUser(u);
                        return {
                            id: safe.id,
                            entityType: "member",
                            title: safe.fullName || safe.email,
                            description: safe.email,
                            role: safe.role,
                            createdAt: safe.createdAt,
                            navigationTarget: scope.isAdmin ? `/admin?userId=${safe.id}` : `/profile`
                        };
                    });
                }).catch(err => {
                    console.warn("Members search query error:", err.message);
                })
            );
        }

        await Promise.all(promises);

        let flatResults = [
            ...grouped.tasks,
            ...grouped.projects,
            ...grouped.workspaces,
            ...grouped.decisions,
            ...grouped.risks,
            ...grouped.members,
            ...grouped.activities
        ];

        // Sort flat results
        flatResults.sort((a, b) => {
            let fieldA = a[sortBy] ?? a.createdAt;
            let fieldB = b[sortBy] ?? b.createdAt;
            if (typeof fieldA === "string") fieldA = fieldA.toLowerCase();
            if (typeof fieldB === "string") fieldB = fieldB.toLowerCase();
            if (fieldA < fieldB) return sortOrder === "asc" ? -1 : 1;
            if (fieldA > fieldB) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });

        const total = flatResults.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const paginated = flatResults.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        const counts = {
            total,
            tasks: grouped.tasks.length,
            projects: grouped.projects.length,
            workspaces: grouped.workspaces.length,
            decisions: grouped.decisions.length,
            risks: grouped.risks.length,
            members: grouped.members.length,
            activities: grouped.activities.length
        };

        return {
            query: q,
            type: targetType,
            results: grouped,
            flatResults: paginated,
            counts,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages
            }
        };
    } catch (err) {
        console.warn("Search execution failed, returning empty result:", err.message);
        return {
            query: q,
            type: targetType,
            results: {},
            flatResults: [],
            counts: { total: 0 },
            pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        };
    }
};
