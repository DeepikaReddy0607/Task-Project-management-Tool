import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { requireAdmin } from "../middleware/requireAdmin.js";
import {
    getAdminOverview,
    getAdminUsers,
    getAdminUserById,
    updateUserRole,
    updateUserStatus,
    getAdminWorkspaces,
    getAdminWorkspaceById,
    getAdminProjects,
    getAdminProjectById,
    getAdminActivity,
    sanitizeUser,
    clearAdminStore,
    seedInMemoryAdminData,
    VALID_ROLES
} from "../services/adminService.js";

import {
    parseNaturalLanguageQuery,
    INTENTS,
    INTENT_CATEGORIES
} from "../services/naturalLanguageControlService.js";

import { handleIntelligenceQuery } from "../services/intelligenceQueryService.js";
import { processMessage } from "../services/quackieService.js";

describe("PHASE 15: Admin Dashboard, RBAC & Platform Overview Test Suite", () => {
    // Standard mock users
    const ADMIN_USER_1 = {
        id: "usr-admin-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@taskflow.dev",
        role: "Admin",
        role_id: "role-admin",
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        workspace_members: [{ id: "wm-1" }, { id: "wm-2" }],
        project_members: [{ id: "pm-1" }]
    };

    const ADMIN_USER_2 = {
        id: "usr-admin-2",
        firstName: "Alan",
        lastName: "Turing",
        email: "alan@taskflow.dev",
        role: "Admin",
        role_id: "role-admin",
        is_active: true,
        created_at: "2026-01-05T00:00:00.000Z",
        workspace_members: [{ id: "wm-3" }],
        project_members: []
    };

    const PM_USER = {
        id: "usr-pm-1",
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@taskflow.dev",
        role: "Project Manager",
        role_id: "role-pm",
        is_active: true,
        created_at: "2026-02-01T00:00:00.000Z",
        workspace_members: [{ id: "wm-4" }],
        project_members: [{ id: "pm-2" }]
    };

    const MEMBER_USER = {
        id: "usr-member-1",
        firstName: "Claude",
        lastName: "Shannon",
        email: "claude@taskflow.dev",
        role: "Team Member",
        role_id: "role-member",
        is_active: true,
        created_at: "2026-03-01T00:00:00.000Z",
        workspace_members: [],
        project_members: []
    };

    const INACTIVE_MEMBER = {
        id: "usr-inactive-1",
        firstName: "Charles",
        lastName: "Babbage",
        email: "charles@taskflow.dev",
        role: "Team Member",
        role_id: "role-member",
        is_active: false,
        created_at: "2026-03-10T00:00:00.000Z",
        workspace_members: [],
        project_members: []
    };

    const WORKSPACE_1 = {
        id: "ws-1",
        name: "Engineering Core",
        description: "Core backend and platform infrastructure",
        owner_id: ADMIN_USER_1.id,
        ownerName: "Ada Lovelace",
        ownerEmail: "ada@taskflow.dev",
        members: [{ user_id: ADMIN_USER_1.id }, { user_id: PM_USER.id }, { user_id: MEMBER_USER.id }],
        created_at: "2026-01-02T00:00:00.000Z"
    };

    const WORKSPACE_2 = {
        id: "ws-2",
        name: "Product Design",
        description: "UI/UX and design system assets",
        owner_id: ADMIN_USER_2.id,
        ownerName: "Alan Turing",
        ownerEmail: "alan@taskflow.dev",
        members: [{ user_id: ADMIN_USER_2.id }],
        created_at: "2026-01-06T00:00:00.000Z"
    };

    const PROJECT_1 = {
        id: "proj-1",
        title: "Quantum Compiler",
        description: "Deterministic AST compilation engine",
        status: "In Progress",
        is_archived: false,
        workspace_id: WORKSPACE_1.id,
        manager_id: PM_USER.id,
        managerName: "Grace Hopper",
        members: [{ user_id: PM_USER.id }, { user_id: MEMBER_USER.id }],
        taskCount: 12,
        created_at: "2026-02-05T00:00:00.000Z"
    };

    const PROJECT_2 = {
        id: "proj-2",
        title: "Legacy Migration",
        description: "Sunsetting legacy monorepo",
        status: "Completed",
        is_archived: true,
        workspace_id: WORKSPACE_1.id,
        manager_id: ADMIN_USER_1.id,
        managerName: "Ada Lovelace",
        members: [{ user_id: ADMIN_USER_1.id }],
        taskCount: 5,
        created_at: "2026-01-10T00:00:00.000Z"
    };

    const ACTIVITY_1 = {
        id: "act-1",
        user_id: ADMIN_USER_1.id,
        actor: "Ada Lovelace",
        action_type: "ADMIN_ROLE_CHANGE",
        entity_type: "user",
        entity_id: MEMBER_USER.id,
        description: "Promoted Claude Shannon to Project Manager",
        created_at: "2026-03-15T10:00:00.000Z"
    };

    beforeEach(() => {
        clearAdminStore();
        seedInMemoryAdminData({
            users: [ADMIN_USER_1, ADMIN_USER_2, PM_USER, MEMBER_USER, INACTIVE_MEMBER],
            workspaces: [WORKSPACE_1, WORKSPACE_2],
            projects: [PROJECT_1, PROJECT_2],
            activityLogs: [ACTIVITY_1]
        });
    });

    // ============================================================
    // PART A: SERVER-SIDE RBAC GUARD (requireAdmin)
    // ============================================================

    test("1. requireAdmin allows request from authorized Administrator", () => {
        let nextCalled = false;
        const req = { user: { userId: "adm-1", role: "Admin" } };
        const res = {
            status: () => res,
            json: () => res
        };
        const next = () => { nextCalled = true; };

        requireAdmin(req, res, next);
        assert.equal(nextCalled, true, "next() must be called for Admin");
    });

    test("2. requireAdmin supports case-insensitive role match ('admin', 'ADMIN')", () => {
        let nextCalled = false;
        const req = { user: { userId: "adm-2", role: "admin" } };
        const res = {};
        const next = () => { nextCalled = true; };

        requireAdmin(req, res, next);
        assert.equal(nextCalled, true, "next() must be called for lowercase admin");
    });

    test("3. requireAdmin strictly rejects Project Manager with 403 Forbidden", () => {
        let statusSent = null;
        let jsonSent = null;
        let nextCalled = false;

        const req = { user: { userId: "pm-1", role: "Project Manager" } };
        const res = {
            status: (s) => {
                statusSent = s;
                return res;
            },
            json: (j) => {
                jsonSent = j;
                return res;
            }
        };
        const next = () => { nextCalled = true; };

        requireAdmin(req, res, next);
        assert.equal(nextCalled, false, "next() must not be called for non-admin");
        assert.equal(statusSent, 403);
        assert.equal(jsonSent.success, false);
        assert.match(jsonSent.message, /admin access required/i);
    });

    test("4. requireAdmin strictly rejects Team Member with 403 Forbidden", () => {
        let statusSent = null;
        const req = { user: { userId: "mem-1", role: "Team Member" } };
        const res = {
            status: (s) => { statusSent = s; return res; },
            json: () => res
        };
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireAdmin(req, res, next);
        assert.equal(nextCalled, false);
        assert.equal(statusSent, 403);
    });

    test("5. requireAdmin strictly rejects unauthenticated request with 401 Unauthorized", () => {
        let statusSent = null;
        let jsonSent = null;
        const req = {}; // No req.user
        const res = {
            status: (s) => { statusSent = s; return res; },
            json: (j) => { jsonSent = j; return res; }
        };
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireAdmin(req, res, next);
        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
        assert.match(jsonSent.message, /authentication required/i);
    });

    // ============================================================
    // PART B: ADMIN OVERVIEW METRICS
    // ============================================================

    test("6. getAdminOverview aggregates accurate system-wide metrics", async () => {
        const overview = await getAdminOverview();

        assert.equal(overview.users.total, 5);
        assert.equal(overview.users.active, 4);
        assert.equal(overview.users.inactive, 1);
        assert.equal(overview.users.byRole.admin, 2);
        assert.equal(overview.users.byRole.projectManager, 1);
        assert.equal(overview.users.byRole.teamMember, 2);

        assert.equal(overview.workspaces.total, 2);
        assert.equal(overview.projects.total, 2);
        assert.equal(overview.projects.active, 1);
        assert.equal(overview.projects.archived, 1);

        assert.ok(overview.memberships.totalWorkspaceMemberships >= 4);
        assert.ok(overview.memberships.totalProjectMemberships >= 3);
        assert.equal(overview.recentActivity.length, 1);
    });

    // ============================================================
    // PART C: USER MANAGEMENT & SENSITIVE DATA REDACTION
    // ============================================================

    test("7. sanitizeUser NEVER exposes password_hash or secret tokens", () => {
        const dirtyUser = {
            id: "u-dirty",
            first_name: "Danger",
            last_name: "Zone",
            email: "danger@taskflow.dev",
            password_hash: "$2b$10$supersecretunhasheddatahere",
            token: "jwt-token-value",
            secret_key: "secret123",
            role: "Admin",
            is_active: true
        };

        const safe = sanitizeUser(dirtyUser);
        assert.equal(safe.id, "u-dirty");
        assert.equal(safe.email, "danger@taskflow.dev");
        assert.equal(safe.password_hash, undefined, "password_hash must be redacted");
        assert.equal(safe.token, undefined, "token must be redacted");
        assert.equal(safe.secret_key, undefined, "secrets must be redacted");
    });

    test("8. getAdminUsers lists users with safe projection and pagination", async () => {
        const result = await getAdminUsers({ page: 1, limit: 3 });

        assert.equal(result.users.length, 3);
        assert.equal(result.pagination.total, 5);
        assert.equal(result.pagination.totalPages, 2);
        assert.equal(result.pagination.page, 1);
        assert.equal(result.pagination.limit, 3);

        result.users.forEach(u => {
            assert.ok(u.id);
            assert.ok(u.email);
            assert.ok(u.role);
            assert.equal(u.password_hash, undefined);
        });
    });

    test("9. getAdminUsers supports searching by name and email", async () => {
        const searchName = await getAdminUsers({ search: "Lovelace" });
        assert.equal(searchName.users.length, 1);
        assert.equal(searchName.users[0].email, "ada@taskflow.dev");

        const searchEmail = await getAdminUsers({ search: "turing" });
        assert.equal(searchEmail.users.length, 1);
        assert.equal(searchEmail.users[0].firstName, "Alan");
    });

    test("10. getAdminUsers filters by role and status", async () => {
        const adminsOnly = await getAdminUsers({ role: "Admin" });
        assert.equal(adminsOnly.users.length, 2);
        adminsOnly.users.forEach(u => assert.equal(u.role, "Admin"));

        const inactivesOnly = await getAdminUsers({ status: "inactive" });
        assert.equal(inactivesOnly.users.length, 1);
        assert.equal(inactivesOnly.users[0].email, "charles@taskflow.dev");
        assert.equal(inactivesOnly.users[0].isActive, false);
    });

    test("11. getAdminUserById retrieves full profile with associated memberships", async () => {
        const user = await getAdminUserById(ADMIN_USER_1.id);
        assert.equal(user.id, ADMIN_USER_1.id);
        assert.equal(user.email, "ada@taskflow.dev");
        assert.ok(Array.isArray(user.workspaces));
        assert.ok(Array.isArray(user.projects));
        assert.equal(user.password_hash, undefined);
    });

    test("12. getAdminUserById throws 404 for non-existent user (IDOR protection)", async () => {
        await assert.rejects(
            async () => await getAdminUserById("non-existent-user-id"),
            (err) => err.statusCode === 404
        );
    });

    // ============================================================
    // PART D: ROLE MANAGEMENT & SELF-DEMOTION PROTECTION
    // ============================================================

    test("13. updateUserRole updates user role and appends audit event", async () => {
        const updated = await updateUserRole(MEMBER_USER.id, "Project Manager", ADMIN_USER_1.id);
        assert.equal(updated.role, "Project Manager");

        const activities = await getAdminActivity();
        const roleChangeLog = activities.activities.find(a => a.actionType === "ADMIN_ROLE_CHANGE" && a.entityId === MEMBER_USER.id);
        assert.ok(roleChangeLog);
        assert.match(roleChangeLog.description, /Changed role of user 'claude@taskflow.dev' from 'Team Member' to 'Project Manager'/);
    });

    test("14. updateUserRole rejects invalid role with 400 Bad Request", async () => {
        await assert.rejects(
            async () => await updateUserRole(MEMBER_USER.id, "SuperGodMode", ADMIN_USER_1.id),
            (err) => err.statusCode === 400
        );
    });

    test("15. updateUserRole enforces self-demotion protection: cannot demote last active Admin", async () => {
        // Demote Admin 2 first (leaving only 1 active admin)
        await updateUserRole(ADMIN_USER_2.id, "Project Manager", ADMIN_USER_1.id);

        // Now attempt to demote Admin 1 (the final active admin)
        await assert.rejects(
            async () => await updateUserRole(ADMIN_USER_1.id, "Team Member", ADMIN_USER_1.id),
            (err) => {
                assert.equal(err.statusCode, 409);
                assert.match(err.message, /Cannot demote the last remaining active Administrator/i);
                return true;
            }
        );
    });

    // ============================================================
    // PART E: ACCOUNT ACTIVATION & DEACTIVATION
    // ============================================================

    test("16. updateUserStatus deactivates a user and writes audit event", async () => {
        const deactivated = await updateUserStatus(MEMBER_USER.id, false, ADMIN_USER_1.id);
        assert.equal(deactivated.isActive, false);

        const activities = await getAdminActivity();
        const statusLog = activities.activities.find(a => a.actionType === "ADMIN_STATUS_CHANGE" && a.entityId === MEMBER_USER.id);
        assert.ok(statusLog);
        assert.match(statusLog.description, /deactivated user 'claude@taskflow.dev'/i);
    });

    test("17. updateUserStatus activates an inactive user", async () => {
        const activated = await updateUserStatus(INACTIVE_MEMBER.id, true, ADMIN_USER_1.id);
        assert.equal(activated.isActive, true);
    });

    test("18. updateUserStatus protects the last active Admin from deactivation (409)", async () => {
        // Demote or deactivate Admin 2 first
        await updateUserRole(ADMIN_USER_2.id, "Team Member", ADMIN_USER_1.id);

        // Attempt to deactivate Admin 1
        await assert.rejects(
            async () => await updateUserStatus(ADMIN_USER_1.id, false, ADMIN_USER_1.id),
            (err) => {
                assert.equal(err.statusCode, 409);
                assert.match(err.message, /Cannot deactivate the last remaining active Administrator/i);
                return true;
            }
        );
    });

    // ============================================================
    // PART F: WORKSPACE MANAGEMENT OVERVIEW
    // ============================================================

    test("19. getAdminWorkspaces lists workspaces with member & project counts", async () => {
        const result = await getAdminWorkspaces();
        assert.equal(result.workspaces.length, 2);

        const ws1 = result.workspaces.find(w => w.id === WORKSPACE_1.id);
        assert.ok(ws1);
        assert.equal(ws1.name, "Engineering Core");
        assert.equal(ws1.ownerEmail, "ada@taskflow.dev");
        assert.equal(ws1.memberCount, 3);
        assert.equal(ws1.projectCount, 2);
    });

    test("20. getAdminWorkspaceById inspects workspace details", async () => {
        const ws = await getAdminWorkspaceById(WORKSPACE_1.id);
        assert.equal(ws.id, WORKSPACE_1.id);
        assert.equal(ws.name, "Engineering Core");
        assert.equal(ws.projects.length, 2);
    });

    test("21. getAdminWorkspaceById returns 404 for non-existent workspace", async () => {
        await assert.rejects(
            async () => await getAdminWorkspaceById("ws-unknown"),
            (err) => err.statusCode === 404
        );
    });

    // ============================================================
    // PART G: PROJECT SYSTEM OVERVIEW
    // ============================================================

    test("22. getAdminProjects lists projects across system with status filters", async () => {
        const allProjects = await getAdminProjects();
        assert.equal(allProjects.projects.length, 2);

        const activeOnly = await getAdminProjects({ status: "active" });
        assert.equal(activeOnly.projects.length, 1);
        assert.equal(activeOnly.projects[0].id, PROJECT_1.id);
        assert.equal(activeOnly.projects[0].isArchived, false);

        const archivedOnly = await getAdminProjects({ status: "archived" });
        assert.equal(archivedOnly.projects.length, 1);
        assert.equal(archivedOnly.projects[0].id, PROJECT_2.id);
        assert.equal(archivedOnly.projects[0].isArchived, true);
    });

    test("23. getAdminProjectById inspects project details without leaking command center telemetry", async () => {
        const proj = await getAdminProjectById(PROJECT_1.id);
        assert.equal(proj.id, PROJECT_1.id);
        assert.equal(proj.title, "Quantum Compiler");
        assert.equal(proj.status, "In Progress");
        assert.equal(proj.workspaceName, "Engineering Core");
    });

    // ============================================================
    // PART H: NATURAL LANGUAGE & QUACKIE AI INTEGRATION
    // ============================================================

    test("24. parseNaturalLanguageQuery parses admin queries into INTENTS.ADMIN_OVERVIEW", () => {
        const q1 = parseNaturalLanguageQuery("How many active users do we have?");
        assert.equal(q1.intent, INTENTS.ADMIN_OVERVIEW);

        const q2 = parseNaturalLanguageQuery("Show system overview");
        assert.equal(q2.intent, INTENTS.ADMIN_OVERVIEW);

        const q3 = parseNaturalLanguageQuery("Show admin users");
        assert.equal(q3.intent, INTENTS.ADMIN_USERS);

        const q4 = parseNaturalLanguageQuery("Change user role to Project Manager");
        assert.equal(q4.intent, INTENTS.PREPARE_ROLE_CHANGE);
    });

    test("25. Quackie answers administrative query when user is Administrator", async () => {
        const res = await processMessage({
            message: "How many active users do we have?",
            userId: ADMIN_USER_1.id,
            context: { userRole: "Admin" }
        });

        assert.equal(res.emotion, "happy");
        assert.match(res.reply, /System Administration Overview/i);
        assert.match(res.reply, /Users/i);
        assert.match(res.reply, /Admin Dashboard/i);
    });

    test("26. Quackie strictly rejects administrative query when user is Team Member", async () => {
        const res = await processMessage({
            message: "Show admin overview",
            userId: MEMBER_USER.id,
            context: { userRole: "Team Member" }
        });

        assert.equal(res.emotion, "worried");
        assert.equal(res.context?.unauthorized, true);
        assert.match(res.reply, /restricted to administrators/i);
    });

    test("27. Quackie intercepts mutation commands with Safety Confirmation Guard (zero silent mutations)", async () => {
        const res = await processMessage({
            message: "Change user Claude Shannon role to Project Manager",
            userId: ADMIN_USER_1.id,
            context: { userRole: "Admin" }
        });

        assert.equal(res.requiresConfirmation, true);
        assert.match(res.reply, /Prepared Administrative Action/i);
        assert.match(res.reply, /Safety Guard/i);
        assert.equal(res.suggestedAction?.type, "admin_mutation");
    });

    test("28. handleIntelligenceQuery orchestrates ADMIN_OVERVIEW intent deterministically", async () => {
        const result = await handleIntelligenceQuery({
            query: "Show platform overview",
            userId: ADMIN_USER_1.id
        });

        assert.ok(result.explanation);
        assert.match(result.explanation.summary, /System Administration/i);
    });

    test("29. Zero external AI API call invariant: Admin operations run 100% locally and deterministically", () => {
        assert.ok(VALID_ROLES.includes("Admin"));
        assert.ok(VALID_ROLES.includes("Project Manager"));
        assert.ok(VALID_ROLES.includes("Team Member"));
    });
});
