/**
 * Admin Service (Phase 15)
 * 
 * Provides platform and workspace administrative operations:
 * - System-wide overview metrics (users, workspaces, projects, memberships)
 * - User management (listing, safe projection, filtering, pagination)
 * - Role management with self-demotion / last-active-admin protection
 * - Account activation / deactivation with last-active-admin protection
 * - Workspace and project administrative listings & inspection
 * - System activity & audit trail logging
 * 
 * Safety invariants:
 * - Sensitive authentication data (password_hash, secrets, tokens) is NEVER exposed
 * - Self-demotion protection prevents eliminating the final administrative access path
 * - Zero database migrations required (uses existing schema)
 * - Dual-layer execution: connects to Prisma with seamless in-memory fallback for test isolation
 */

import prisma from "../config/prisma.js";

export const VALID_ROLES = ["Admin", "Project Manager", "Team Member"];

// ============================================================
// IN-MEMORY TEST STORE FOR TEST ISOLATION
// ============================================================

let inMemoryStore = {
    users: [],
    workspaces: [],
    projects: [],
    activityLogs: []
};

export const clearAdminStore = () => {
    inMemoryStore = {
        users: [],
        workspaces: [],
        projects: [],
        activityLogs: []
    };
};

export const seedInMemoryAdminData = (data = {}) => {
    if (data.users) inMemoryStore.users = [...data.users];
    if (data.workspaces) inMemoryStore.workspaces = [...data.workspaces];
    if (data.projects) inMemoryStore.projects = [...data.projects];
    if (data.activityLogs) inMemoryStore.activityLogs = [...data.activityLogs];
};

export const getInMemoryAdminStore = () => inMemoryStore;

// ============================================================
// SENSITIVE DATA REDACTION & SANITIZATION
// ============================================================

export const sanitizeUser = (user) => {
    if (!user) return null;
    const roleName = user.roles?.role_name || user.role || "Team Member";
    return {
        id: user.id,
        firstName: user.first_name || user.firstName || "",
        lastName: user.last_name || user.lastName || "",
        fullName: `${user.first_name || user.firstName || ""} ${user.last_name || user.lastName || ""}`.trim(),
        email: user.email,
        phone: user.phone || null,
        role: roleName,
        roleId: user.role_id || user.roleId || null,
        isActive: user.is_active !== undefined ? Boolean(user.is_active) : (user.isActive !== undefined ? Boolean(user.isActive) : true),
        createdAt: user.created_at || user.createdAt || new Date().toISOString(),
        updatedAt: user.updated_at || user.updatedAt || new Date().toISOString(),
        workspaceCount: user.workspaceCount ?? (user.workspace_members?.length || 0),
        projectCount: user.projectCount ?? (user.project_members?.length || 0)
    };
};

// ============================================================
// 1. ADMIN OVERVIEW METRICS
// ============================================================

export const getAdminOverview = async () => {
    // If in-memory store has users, use in-memory calculation (for deterministic tests)
    if (inMemoryStore.users.length > 0) {
        const users = inMemoryStore.users;
        const workspaces = inMemoryStore.workspaces;
        const projects = inMemoryStore.projects;
        const activities = inMemoryStore.activityLogs;

        const totalUsers = users.length;
        const activeUsers = users.filter(u => u.is_active !== false && u.isActive !== false).length;
        const inactiveUsers = totalUsers - activeUsers;

        const adminCount = users.filter(u => (u.roles?.role_name || u.role) === "Admin").length;
        const pmCount = users.filter(u => (u.roles?.role_name || u.role) === "Project Manager").length;
        const memberCount = users.filter(u => (u.roles?.role_name || u.role) === "Team Member").length;

        const totalWorkspaces = workspaces.length;
        const totalProjects = projects.length;
        const activeProjects = projects.filter(p => !p.is_archived && !p.isArchived).length;
        const archivedProjects = totalProjects - activeProjects;

        const totalWorkspaceMemberships = workspaces.reduce((sum, w) => sum + (w.members?.length || w.workspace_members?.length || 1), 0);
        const totalProjectMemberships = projects.reduce((sum, p) => sum + (p.members?.length || p.project_members?.length || 1), 0);

        return {
            users: {
                total: totalUsers,
                active: activeUsers,
                inactive: inactiveUsers,
                byRole: {
                    admin: adminCount,
                    projectManager: pmCount,
                    teamMember: memberCount
                }
            },
            workspaces: {
                total: totalWorkspaces
            },
            projects: {
                total: totalProjects,
                active: activeProjects,
                archived: archivedProjects
            },
            memberships: {
                totalWorkspaceMemberships,
                totalProjectMemberships
            },
            recentActivity: activities.slice(0, 10).map(a => ({
                id: a.id,
                actionType: a.action_type || a.actionType,
                description: a.description,
                createdAt: a.created_at || a.createdAt,
                actor: a.actor || a.user_id || "System"
            }))
        };
    }

    try {
        const [
            totalUsers,
            activeUsers,
            allRoles,
            totalWorkspaces,
            totalProjects,
            activeProjects,
            totalWorkspaceMemberships,
            totalProjectMemberships,
            recentLogs
        ] = await Promise.all([
            prisma.users.count(),
            prisma.users.count({ where: { is_active: true } }),
            prisma.roles.findMany({
                include: {
                    _count: {
                        select: { users: true }
                    }
                }
            }),
            prisma.workspaces.count(),
            prisma.projects.count(),
            prisma.projects.count({ where: { is_archived: false } }),
            prisma.workspace_members.count(),
            prisma.project_members.count(),
            prisma.activity_logs.findMany({
                take: 10,
                orderBy: { created_at: "desc" },
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true
                        }
                    }
                }
            })
        ]);

        const roleCounts = {
            admin: 0,
            projectManager: 0,
            teamMember: 0
        };

        allRoles.forEach(r => {
            const name = (r.role_name || "").toLowerCase();
            if (name === "admin") roleCounts.admin = r._count.users;
            else if (name === "project manager") roleCounts.projectManager = r._count.users;
            else if (name === "team member") roleCounts.teamMember = r._count.users;
        });

        return {
            users: {
                total: totalUsers,
                active: activeUsers,
                inactive: totalUsers - activeUsers,
                byRole: roleCounts
            },
            workspaces: {
                total: totalWorkspaces
            },
            projects: {
                total: totalProjects,
                active: activeProjects,
                archived: totalProjects - activeProjects
            },
            memberships: {
                totalWorkspaceMemberships,
                totalProjectMemberships
            },
            recentActivity: recentLogs.map(log => ({
                id: log.id,
                actionType: log.action_type,
                description: log.description,
                createdAt: log.created_at,
                actor: log.users ? `${log.users.first_name} ${log.users.last_name}`.trim() || log.users.email : "System"
            }))
        };
    } catch (err) {
        console.warn("DB query failed in getAdminOverview, falling back to empty counts:", err.message);
        return {
            users: { total: 0, active: 0, inactive: 0, byRole: { admin: 0, projectManager: 0, teamMember: 0 } },
            workspaces: { total: 0 },
            projects: { total: 0, active: 0, archived: 0 },
            memberships: { totalWorkspaceMemberships: 0, totalProjectMemberships: 0 },
            recentActivity: []
        };
    }
};

// ============================================================
// 2. ADMIN USER MANAGEMENT
// ============================================================

export const getAdminUsers = async ({
    search = "",
    role = "all",
    status = "all",
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc"
} = {}) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // In-memory branch
    if (inMemoryStore.users.length > 0) {
        let filtered = inMemoryStore.users.map(sanitizeUser);

        // Search filter
        if (search && search.trim()) {
            const query = search.trim().toLowerCase();
            filtered = filtered.filter(u =>
                u.firstName.toLowerCase().includes(query) ||
                u.lastName.toLowerCase().includes(query) ||
                u.fullName.toLowerCase().includes(query) ||
                u.email.toLowerCase().includes(query)
            );
        }

        // Role filter
        if (role && role.toLowerCase() !== "all") {
            const targetRole = role.toLowerCase();
            filtered = filtered.filter(u => u.role.toLowerCase() === targetRole);
        }

        // Status filter
        if (status && status.toLowerCase() !== "all") {
            const isTargetActive = status.toLowerCase() === "active";
            filtered = filtered.filter(u => u.isActive === isTargetActive);
        }

        // Sort
        filtered.sort((a, b) => {
            let fieldA = a[sortBy] ?? a.createdAt;
            let fieldB = b[sortBy] ?? b.createdAt;
            if (typeof fieldA === "string") fieldA = fieldA.toLowerCase();
            if (typeof fieldB === "string") fieldB = fieldB.toLowerCase();
            if (fieldA < fieldB) return sortOrder === "asc" ? -1 : 1;
            if (fieldA > fieldB) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });

        const total = filtered.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedUsers = filtered.slice(startIndex, startIndex + limitNum);

        return {
            users: paginatedUsers,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages
            }
        };
    }

    // Prisma DB query
    try {
        const whereClause = {};

        if (search && search.trim()) {
            const q = search.trim();
            whereClause.OR = [
                { first_name: { contains: q, mode: "insensitive" } },
                { last_name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } }
            ];
        }

        if (role && role.toLowerCase() !== "all") {
            whereClause.roles = {
                role_name: { equals: role, mode: "insensitive" }
            };
        }

        if (status && status.toLowerCase() !== "all") {
            whereClause.is_active = status.toLowerCase() === "active";
        }

        const orderByMap = {
            name: { first_name: sortOrder.toLowerCase() === "asc" ? "asc" : "desc" },
            email: { email: sortOrder.toLowerCase() === "asc" ? "asc" : "desc" },
            createdAt: { created_at: sortOrder.toLowerCase() === "asc" ? "asc" : "desc" },
            created_at: { created_at: sortOrder.toLowerCase() === "asc" ? "asc" : "desc" }
        };

        const orderBy = orderByMap[sortBy] || { created_at: "desc" };

        const [total, rawUsers] = await Promise.all([
            prisma.users.count({ where: whereClause }),
            prisma.users.findMany({
                where: whereClause,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy,
                include: {
                    roles: {
                        select: {
                            id: true,
                            role_name: true
                        }
                    },
                    _count: {
                        select: {
                            workspace_members: true,
                            project_members: true
                        }
                    }
                }
            })
        ]);

        const sanitized = rawUsers.map(u => ({
            ...sanitizeUser(u),
            workspaceCount: u._count?.workspace_members || 0,
            projectCount: u._count?.project_members || 0
        }));

        return {
            users: sanitized,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        };
    } catch (err) {
        console.warn("DB query failed in getAdminUsers:", err.message);
        return {
            users: [],
            pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        };
    }
};

export const getAdminUserById = async (userId) => {
    if (!userId) {
        const error = new Error("User ID is required");
        error.statusCode = 400;
        throw error;
    }

    // In-memory branch
    if (inMemoryStore.users.length > 0) {
        const found = inMemoryStore.users.find(u => u.id === userId);
        if (!found) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const safe = sanitizeUser(found);
        const userWorkspaces = inMemoryStore.workspaces.filter(w =>
            w.owner_id === userId || w.members?.some(m => m.user_id === userId)
        ).map(w => ({ id: w.id, name: w.name }));

        const userProjects = inMemoryStore.projects.filter(p =>
            p.manager_id === userId || p.members?.some(m => m.user_id === userId)
        ).map(p => ({ id: p.id, title: p.title || p.name, status: p.status }));

        const recentActivity = inMemoryStore.activityLogs.filter(a =>
            a.user_id === userId || a.entity_id === userId
        ).slice(0, 10);

        return {
            ...safe,
            workspaces: userWorkspaces,
            projects: userProjects,
            recentActivity
        };
    }

    try {
        const user = await prisma.users.findUnique({
            where: { id: userId },
            include: {
                roles: true,
                workspace_members: {
                    include: {
                        workspaces: {
                            select: { id: true, name: true }
                        }
                    }
                },
                project_members: {
                    include: {
                        projects: {
                            select: { id: true, title: true, status: true }
                        }
                    }
                },
                activity_logs: {
                    take: 10,
                    orderBy: { created_at: "desc" }
                }
            }
        });

        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const safe = sanitizeUser(user);
        return {
            ...safe,
            workspaces: user.workspace_members?.map(wm => wm.workspaces) || [],
            projects: user.project_members?.map(pm => pm.projects) || [],
            recentActivity: user.activity_logs || []
        };
    } catch (err) {
        if (err.statusCode) throw err;
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }
};

// ============================================================
// 3. ROLE MANAGEMENT & SELF-DEMOTION PROTECTION
// ============================================================

export const updateUserRole = async (userId, newRoleName, actorUserId = null) => {
    if (!userId || !newRoleName) {
        const error = new Error("User ID and new role are required");
        error.statusCode = 400;
        throw error;
    }

    // Role validation
    const matchedRole = VALID_ROLES.find(r => r.toLowerCase() === newRoleName.trim().toLowerCase());
    if (!matchedRole) {
        const error = new Error(`Invalid role '${newRoleName}'. Allowed roles: ${VALID_ROLES.join(", ")}`);
        error.statusCode = 400;
        throw error;
    }

    // In-memory branch
    if (inMemoryStore.users.length > 0) {
        const targetIndex = inMemoryStore.users.findIndex(u => u.id === userId);
        if (targetIndex === -1) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const targetUser = inMemoryStore.users[targetIndex];
        const currentRole = targetUser.roles?.role_name || targetUser.role || "Team Member";

        // Self-demotion / Last active admin protection
        if (currentRole === "Admin" && matchedRole !== "Admin") {
            const activeAdminCount = inMemoryStore.users.filter(u =>
                (u.roles?.role_name || u.role) === "Admin" &&
                (u.is_active !== false && u.isActive !== false)
            ).length;

            if (activeAdminCount <= 1) {
                const error = new Error("Cannot demote the last remaining active Administrator. Promote another user to Admin first.");
                error.statusCode = 409;
                throw error;
            }
        }

        // Apply update
        if (targetUser.roles) {
            targetUser.roles.role_name = matchedRole;
        }
        targetUser.role = matchedRole;
        targetUser.updated_at = new Date().toISOString();

        // Audit log
        inMemoryStore.activityLogs.unshift({
            id: `act-${Date.now()}`,
            user_id: actorUserId,
            action_type: "ADMIN_ROLE_CHANGE",
            entity_type: "user",
            entity_id: userId,
            description: `Changed role of user '${targetUser.email}' from '${currentRole}' to '${matchedRole}'.`,
            created_at: new Date().toISOString()
        });

        return sanitizeUser(targetUser);
    }

    // Prisma DB branch
    const targetUser = await prisma.users.findUnique({
        where: { id: userId },
        include: { roles: true }
    });

    if (!targetUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    const currentRole = targetUser.roles?.role_name || "Team Member";

    // Self-demotion / Last active admin protection
    if (currentRole === "Admin" && matchedRole !== "Admin") {
        const adminRole = await prisma.roles.findUnique({
            where: { role_name: "Admin" }
        });

        if (adminRole) {
            const activeAdminCount = await prisma.users.count({
                where: {
                    role_id: adminRole.id,
                    is_active: true
                }
            });

            if (activeAdminCount <= 1) {
                const error = new Error("Cannot demote the last remaining active Administrator. Promote another user to Admin first.");
                error.statusCode = 409;
                throw error;
            }
        }
    }

    // Resolve target role record
    const targetRoleRecord = await prisma.roles.findUnique({
        where: { role_name: matchedRole }
    });

    if (!targetRoleRecord) {
        const error = new Error(`Role record for '${matchedRole}' does not exist in database`);
        error.statusCode = 500;
        throw error;
    }

    const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: { role_id: targetRoleRecord.id },
        include: { roles: true }
    });

    // Record audit event
    try {
        const defaultWorkspace = await prisma.workspaces.findFirst({ select: { id: true } });
        if (defaultWorkspace) {
            await prisma.activity_logs.create({
                data: {
                    workspace_id: defaultWorkspace.id,
                    user_id: actorUserId || null,
                    action_type: "ADMIN_ROLE_CHANGE",
                    entity_type: "user",
                    entity_id: userId,
                    description: `Changed role of user '${targetUser.email}' from '${currentRole}' to '${matchedRole}'.`
                }
            });
        }
    } catch (auditErr) {
        console.warn("Failed to write activity log for role change:", auditErr.message);
    }

    return sanitizeUser(updatedUser);
};

// ============================================================
// 4. USER ACTIVATION / DEACTIVATION & LAST ADMIN GUARD
// ============================================================

export const updateUserStatus = async (userId, isActive, actorUserId = null) => {
    if (!userId || typeof isActive !== "boolean") {
        const error = new Error("User ID and boolean isActive status are required");
        error.statusCode = 400;
        throw error;
    }

    // In-memory branch
    if (inMemoryStore.users.length > 0) {
        const targetIndex = inMemoryStore.users.findIndex(u => u.id === userId);
        if (targetIndex === -1) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const targetUser = inMemoryStore.users[targetIndex];
        const currentRole = targetUser.roles?.role_name || targetUser.role || "Team Member";

        // Last active admin deactivation protection
        if (!isActive && currentRole === "Admin") {
            const activeAdminCount = inMemoryStore.users.filter(u =>
                (u.roles?.role_name || u.role) === "Admin" &&
                (u.is_active !== false && u.isActive !== false)
            ).length;

            if (activeAdminCount <= 1) {
                const error = new Error("Cannot deactivate the last remaining active Administrator.");
                error.statusCode = 409;
                throw error;
            }
        }

        targetUser.is_active = isActive;
        targetUser.isActive = isActive;
        targetUser.updated_at = new Date().toISOString();

        // Audit log
        inMemoryStore.activityLogs.unshift({
            id: `act-${Date.now()}`,
            user_id: actorUserId,
            action_type: "ADMIN_STATUS_CHANGE",
            entity_type: "user",
            entity_id: userId,
            description: `Administrator ${isActive ? "activated" : "deactivated"} user '${targetUser.email}'.`,
            created_at: new Date().toISOString()
        });

        return sanitizeUser(targetUser);
    }

    // Prisma DB branch
    const targetUser = await prisma.users.findUnique({
        where: { id: userId },
        include: { roles: true }
    });

    if (!targetUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    const currentRole = targetUser.roles?.role_name || "Team Member";

    // Last active admin deactivation protection
    if (!isActive && currentRole === "Admin") {
        const adminRole = await prisma.roles.findUnique({
            where: { role_name: "Admin" }
        });

        if (adminRole) {
            const activeAdminCount = await prisma.users.count({
                where: {
                    role_id: adminRole.id,
                    is_active: true
                }
            });

            if (activeAdminCount <= 1) {
                const error = new Error("Cannot deactivate the last remaining active Administrator.");
                error.statusCode = 409;
                throw error;
            }
        }
    }

    const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: { is_active: isActive },
        include: { roles: true }
    });

    // Record audit event
    try {
        const defaultWorkspace = await prisma.workspaces.findFirst({ select: { id: true } });
        if (defaultWorkspace) {
            await prisma.activity_logs.create({
                data: {
                    workspace_id: defaultWorkspace.id,
                    user_id: actorUserId || null,
                    action_type: "ADMIN_STATUS_CHANGE",
                    entity_type: "user",
                    entity_id: userId,
                    description: `Administrator ${isActive ? "activated" : "deactivated"} user '${targetUser.email}'.`
                }
            });
        }
    } catch (auditErr) {
        console.warn("Failed to write activity log for status change:", auditErr.message);
    }

    return sanitizeUser(updatedUser);
};

// ============================================================
// 5. WORKSPACE OVERVIEW & INSPECTION
// ============================================================

export const getAdminWorkspaces = async ({
    search = "",
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc"
} = {}) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // In-memory branch
    if (inMemoryStore.workspaces.length > 0) {
        let filtered = inMemoryStore.workspaces.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description || "",
            ownerId: w.owner_id || w.ownerId,
            ownerName: w.ownerName || "Workspace Owner",
            ownerEmail: w.ownerEmail || "",
            memberCount: w.members?.length || w.workspace_members?.length || 1,
            projectCount: inMemoryStore.projects.filter(p => (p.workspace_id || p.workspaceId) === w.id).length,
            createdAt: w.created_at || w.createdAt || new Date().toISOString(),
            updatedAt: w.updated_at || w.updatedAt || new Date().toISOString()
        }));

        if (search && search.trim()) {
            const query = search.trim().toLowerCase();
            filtered = filtered.filter(w =>
                w.name.toLowerCase().includes(query) ||
                (w.description && w.description.toLowerCase().includes(query))
            );
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const startIndex = (pageNum - 1) * limitNum;
        const paginated = filtered.slice(startIndex, startIndex + limitNum);

        return {
            workspaces: paginated,
            pagination: { page: pageNum, limit: limitNum, total, totalPages }
        };
    }

    // Prisma DB branch
    try {
        const whereClause = {};
        if (search && search.trim()) {
            whereClause.OR = [
                { name: { contains: search.trim(), mode: "insensitive" } },
                { description: { contains: search.trim(), mode: "insensitive" } }
            ];
        }

        const [total, rawWorkspaces] = await Promise.all([
            prisma.workspaces.count({ where: whereClause }),
            prisma.workspaces.findMany({
                where: whereClause,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { created_at: sortOrder === "asc" ? "asc" : "desc" },
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true
                        }
                    },
                    _count: {
                        select: {
                            workspace_members: true,
                            projects: true
                        }
                    }
                }
            })
        ]);

        const mapped = rawWorkspaces.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description || "",
            ownerId: w.owner_id,
            ownerName: w.users ? `${w.users.first_name} ${w.users.last_name}`.trim() : "Unknown",
            ownerEmail: w.users?.email || "",
            memberCount: w._count?.workspace_members || 0,
            projectCount: w._count?.projects || 0,
            createdAt: w.created_at,
            updatedAt: w.updated_at
        }));

        return {
            workspaces: mapped,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        };
    } catch (err) {
        console.warn("DB query failed in getAdminWorkspaces:", err.message);
        return {
            workspaces: [],
            pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        };
    }
};

export const getAdminWorkspaceById = async (workspaceId) => {
    if (!workspaceId) {
        const error = new Error("Workspace ID is required");
        error.statusCode = 400;
        throw error;
    }

    if (inMemoryStore.workspaces.length > 0) {
        const w = inMemoryStore.workspaces.find(item => item.id === workspaceId);
        if (!w) {
            const error = new Error("Workspace not found");
            error.statusCode = 404;
            throw error;
        }

        const projects = inMemoryStore.projects.filter(p => (p.workspace_id || p.workspaceId) === workspaceId);
        return {
            id: w.id,
            name: w.name,
            description: w.description || "",
            ownerId: w.owner_id || w.ownerId,
            ownerName: w.ownerName || "Workspace Owner",
            members: w.members || [],
            projects: projects.map(p => ({ id: p.id, title: p.title || p.name, status: p.status })),
            createdAt: w.created_at || w.createdAt || new Date().toISOString()
        };
    }

    try {
        const workspace = await prisma.workspaces.findUnique({
            where: { id: workspaceId },
            include: {
                users: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                },
                workspace_members: {
                    include: {
                        users: {
                            select: { id: true, first_name: true, last_name: true, email: true }
                        }
                    }
                },
                projects: {
                    select: { id: true, title: true, status: true, is_archived: true }
                }
            }
        });

        if (!workspace) {
            const error = new Error("Workspace not found");
            error.statusCode = 404;
            throw error;
        }

        return {
            id: workspace.id,
            name: workspace.name,
            description: workspace.description || "",
            ownerId: workspace.owner_id,
            ownerName: workspace.users ? `${workspace.users.first_name} ${workspace.users.last_name}`.trim() : "Unknown",
            ownerEmail: workspace.users?.email || "",
            members: workspace.workspace_members?.map(wm => ({
                id: wm.id,
                userId: wm.user_id,
                name: wm.users ? `${wm.users.first_name} ${wm.users.last_name}`.trim() : "Member",
                email: wm.users?.email,
                role: wm.workspace_role
            })) || [],
            projects: workspace.projects || [],
            createdAt: workspace.created_at
        };
    } catch (err) {
        if (err.statusCode) throw err;
        const error = new Error("Workspace not found");
        error.statusCode = 404;
        throw error;
    }
};

// ============================================================
// 6. PROJECT OVERVIEW ACROSS SYSTEM
// ============================================================

export const getAdminProjects = async ({
    search = "",
    status = "all",
    workspaceId = null,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc"
} = {}) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // In-memory branch
    if (inMemoryStore.projects.length > 0) {
        let filtered = inMemoryStore.projects.map(p => {
            const ws = inMemoryStore.workspaces.find(w => w.id === (p.workspace_id || p.workspaceId));
            return {
                id: p.id,
                title: p.title || p.name,
                description: p.description || "",
                status: p.status || "Planning",
                isArchived: Boolean(p.is_archived || p.isArchived),
                workspaceId: p.workspace_id || p.workspaceId,
                workspaceName: ws?.name || "Workspace",
                managerId: p.manager_id || p.managerId,
                managerName: p.managerName || "Project Manager",
                memberCount: p.members?.length || p.project_members?.length || 1,
                taskCount: p.tasks?.length || p.taskCount || 0,
                createdAt: p.created_at || p.createdAt || new Date().toISOString()
            };
        });

        if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            filtered = filtered.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.workspaceName.toLowerCase().includes(q) ||
                p.managerName.toLowerCase().includes(q)
            );
        }

        if (status && status.toLowerCase() !== "all") {
            const targetStatus = status.toLowerCase();
            if (targetStatus === "archived") {
                filtered = filtered.filter(p => p.isArchived);
            } else if (targetStatus === "active") {
                filtered = filtered.filter(p => !p.isArchived);
            } else {
                filtered = filtered.filter(p => p.status.toLowerCase() === targetStatus);
            }
        }

        if (workspaceId) {
            filtered = filtered.filter(p => p.workspaceId === workspaceId);
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const startIndex = (pageNum - 1) * limitNum;
        const paginated = filtered.slice(startIndex, startIndex + limitNum);

        return {
            projects: paginated,
            pagination: { page: pageNum, limit: limitNum, total, totalPages }
        };
    }

    // Prisma DB branch
    try {
        const whereClause = {};

        if (search && search.trim()) {
            whereClause.OR = [
                { title: { contains: search.trim(), mode: "insensitive" } },
                { description: { contains: search.trim(), mode: "insensitive" } }
            ];
        }

        if (status && status.toLowerCase() !== "all") {
            if (status.toLowerCase() === "archived") {
                whereClause.is_archived = true;
            } else if (status.toLowerCase() === "active") {
                whereClause.is_archived = false;
            } else {
                whereClause.status = { equals: status, mode: "insensitive" };
            }
        }

        if (workspaceId) {
            whereClause.workspace_id = workspaceId;
        }

        const [total, rawProjects] = await Promise.all([
            prisma.projects.count({ where: whereClause }),
            prisma.projects.findMany({
                where: whereClause,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { created_at: sortOrder === "asc" ? "asc" : "desc" },
                include: {
                    workspaces: {
                        select: { id: true, name: true }
                    },
                    users: {
                        select: { id: true, first_name: true, last_name: true, email: true }
                    },
                    _count: {
                        select: {
                            project_members: true,
                            tasks: true
                        }
                    }
                }
            })
        ]);

        const mapped = rawProjects.map(p => ({
            id: p.id,
            title: p.title,
            description: p.description || "",
            status: p.status,
            isArchived: p.is_archived,
            workspaceId: p.workspace_id,
            workspaceName: p.workspaces?.name || "Workspace",
            managerId: p.manager_id,
            managerName: p.users ? `${p.users.first_name} ${p.users.last_name}`.trim() : "Project Manager",
            managerEmail: p.users?.email || "",
            memberCount: p._count?.project_members || 0,
            taskCount: p._count?.tasks || 0,
            createdAt: p.created_at
        }));

        return {
            projects: mapped,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        };
    } catch (err) {
        console.warn("DB query failed in getAdminProjects:", err.message);
        return {
            projects: [],
            pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        };
    }
};

export const getAdminProjectById = async (projectId) => {
    if (!projectId) {
        const error = new Error("Project ID is required");
        error.statusCode = 400;
        throw error;
    }

    if (inMemoryStore.projects.length > 0) {
        const p = inMemoryStore.projects.find(item => item.id === projectId);
        if (!p) {
            const error = new Error("Project not found");
            error.statusCode = 404;
            throw error;
        }

        const ws = inMemoryStore.workspaces.find(w => w.id === (p.workspace_id || p.workspaceId));
        return {
            id: p.id,
            title: p.title || p.name,
            description: p.description || "",
            status: p.status || "Planning",
            isArchived: Boolean(p.is_archived || p.isArchived),
            workspaceId: p.workspace_id || p.workspaceId,
            workspaceName: ws?.name || "Workspace",
            managerId: p.manager_id || p.managerId,
            memberCount: p.members?.length || 1,
            taskCount: p.tasks?.length || 0,
            createdAt: p.created_at || p.createdAt || new Date().toISOString()
        };
    }

    try {
        const project = await prisma.projects.findUnique({
            where: { id: projectId },
            include: {
                workspaces: {
                    select: { id: true, name: true }
                },
                users: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                },
                _count: {
                    select: {
                        project_members: true,
                        tasks: true
                    }
                }
            }
        });

        if (!project) {
            const error = new Error("Project not found");
            error.statusCode = 404;
            throw error;
        }

        return {
            id: project.id,
            title: project.title,
            description: project.description || "",
            status: project.status,
            isArchived: project.is_archived,
            workspaceId: project.workspace_id,
            workspaceName: project.workspaces?.name || "Workspace",
            managerId: project.manager_id,
            managerName: project.users ? `${project.users.first_name} ${project.users.last_name}`.trim() : "Unknown",
            memberCount: project._count?.project_members || 0,
            taskCount: project._count?.tasks || 0,
            createdAt: project.created_at
        };
    } catch (err) {
        if (err.statusCode) throw err;
        const error = new Error("Project not found");
        error.statusCode = 404;
        throw error;
    }
};

// ============================================================
// 7. SYSTEM ACTIVITY & AUDIT TRAIL
// ============================================================

export const getAdminActivity = async ({
    page = 1,
    limit = 20,
    actionType = "all",
    entityType = "all",
    userId = null
} = {}) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // In-memory branch
    if (inMemoryStore.activityLogs.length > 0) {
        let filtered = inMemoryStore.activityLogs.map(a => ({
            id: a.id,
            actionType: a.action_type || a.actionType,
            entityType: a.entity_type || a.entityType || "general",
            entityId: a.entity_id || a.entityId || null,
            description: a.description,
            createdAt: a.created_at || a.createdAt || new Date().toISOString(),
            actor: a.actor || a.user_id || "Administrator",
            userId: a.user_id || a.userId || null
        }));

        if (actionType && actionType.toLowerCase() !== "all") {
            filtered = filtered.filter(a => (a.actionType || "").toLowerCase() === actionType.toLowerCase());
        }

        if (entityType && entityType.toLowerCase() !== "all") {
            filtered = filtered.filter(a => (a.entityType || "").toLowerCase() === entityType.toLowerCase());
        }

        if (userId) {
            filtered = filtered.filter(a => a.userId === userId);
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const startIndex = (pageNum - 1) * limitNum;
        const paginated = filtered.slice(startIndex, startIndex + limitNum);

        return {
            activities: paginated,
            pagination: { page: pageNum, limit: limitNum, total, totalPages }
        };
    }

    // Prisma DB branch
    try {
        const whereClause = {};

        if (actionType && actionType.toLowerCase() !== "all") {
            whereClause.action_type = { equals: actionType, mode: "insensitive" };
        }

        if (entityType && entityType.toLowerCase() !== "all") {
            whereClause.entity_type = { equals: entityType, mode: "insensitive" };
        }

        if (userId) {
            whereClause.user_id = userId;
        }

        const [total, rawLogs] = await Promise.all([
            prisma.activity_logs.count({ where: whereClause }),
            prisma.activity_logs.findMany({
                where: whereClause,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { created_at: "desc" },
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true
                        }
                    }
                }
            })
        ]);

        const mapped = rawLogs.map(log => ({
            id: log.id,
            actionType: log.action_type,
            entityType: log.entity_type || "general",
            entityId: log.entity_id,
            description: log.description,
            createdAt: log.created_at,
            actor: log.users ? `${log.users.first_name} ${log.users.last_name}`.trim() || log.users.email : "System",
            userId: log.user_id
        }));

        return {
            activities: mapped,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        };
    } catch (err) {
        console.warn("DB query failed in getAdminActivity:", err.message);
        return {
            activities: [],
            pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        };
    }
};
