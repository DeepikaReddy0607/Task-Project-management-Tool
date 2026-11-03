import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import {
    createNotification,
    normalizeNotificationType,
    VALID_NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_MAP,
    shouldDeliverNotification
} from "../services/notificationService.js";
import { normalizeProjectRoleName } from "../services/projectService.js";

describe("PHASE 20: Collaboration Reliability & Integration Fixes Test Suite", () => {
    let server;
    let baseApiUrl;
    let ownerUser;
    let memberUserA;
    let memberUserB;
    let ownerToken;
    let memberTokenA;
    let memberTokenB;
    let testWorkspace;
    let testProject;
    let testTask;

    before(async () => {
        const teamRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!teamRole) throw new Error("Team Member role missing in database");

        // 1. Create or upsert test users
        ownerUser = await prisma.users.upsert({
            where: { email: "phase20_owner@taskflow.dev" },
            update: {},
            create: {
                email: "phase20_owner@taskflow.dev",
                first_name: "Phase20",
                last_name: "Owner",
                password_hash: "mock_password_hash",
                role_id: teamRole.id,
            },
        });

        memberUserA = await prisma.users.upsert({
            where: { email: "phase20_member_a@taskflow.dev" },
            update: {},
            create: {
                email: "phase20_member_a@taskflow.dev",
                first_name: "Member",
                last_name: "Alpha",
                password_hash: "mock_password_hash",
                role_id: teamRole.id,
            },
        });

        memberUserB = await prisma.users.upsert({
            where: { email: "phase20_member_b@taskflow.dev" },
            update: {},
            create: {
                email: "phase20_member_b@taskflow.dev",
                first_name: "Member",
                last_name: "Beta",
                password_hash: "mock_password_hash",
                role_id: teamRole.id,
            },
        });

        const secret = process.env.JWT_SECRET || "fallback_secret";
        ownerToken = jwt.sign({ userId: ownerUser.id, email: ownerUser.email }, secret, { expiresIn: "2h" });
        memberTokenA = jwt.sign({ userId: memberUserA.id, email: memberUserA.email }, secret, { expiresIn: "2h" });
        memberTokenB = jwt.sign({ userId: memberUserB.id, email: memberUserB.email }, secret, { expiresIn: "2h" });

        // 2. Create test workspace
        testWorkspace = await prisma.workspaces.create({
            data: {
                name: "Phase 20 Test Workspace",
                description: "Test Workspace for Phase 20 Collaboration Suite",
                owner_id: ownerUser.id,
                workspace_members: {
                    create: [
                        { user_id: ownerUser.id, workspace_role: "Owner" },
                        { user_id: memberUserA.id, workspace_role: "Member" },
                        { user_id: memberUserB.id, workspace_role: "Member" }
                    ]
                }
            }
        });

        // 3. Create test project under workspace
        testProject = await prisma.projects.create({
            data: {
                title: "Phase 20 Test Project",
                description: "Test Project for Collaboration Reliability",
                workspace_id: testWorkspace.id,
                manager_id: ownerUser.id,
                status: "Active",
                project_members: {
                    create: [
                        { user_id: ownerUser.id, role_id: teamRole.id },
                        { user_id: memberUserA.id, role_id: teamRole.id },
                    ]
                }
            }
        });

        // 4. Create test task assigned to memberUserA
        testTask = await prisma.tasks.create({
            data: {
                title: "Phase 20 Collaboration Task",
                description: "Task for testing comments and assignments",
                project_id: testProject.id,
                created_by: ownerUser.id,
                assigned_to: memberUserA.id,
                status: "To Do",
                priority: "Medium"
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        // Clean up test records safely
        try {
            const userIds = [ownerUser?.id, memberUserA?.id, memberUserB?.id].filter(Boolean);
            if (testTask?.id) {
                await prisma.comments.deleteMany({ where: { task_id: testTask.id } }).catch(() => {});
                await prisma.tasks.deleteMany({ where: { id: testTask.id } }).catch(() => {});
            }
            if (testProject?.id) {
                await prisma.project_members.deleteMany({ where: { project_id: testProject.id } }).catch(() => {});
                await prisma.projects.deleteMany({ where: { id: testProject.id } }).catch(() => {});
            }
            if (testWorkspace?.id) {
                await prisma.activity_logs.deleteMany({ where: { workspace_id: testWorkspace.id } }).catch(() => {});
                await prisma.workspace_members.deleteMany({ where: { workspace_id: testWorkspace.id } }).catch(() => {});
                await prisma.workspaces.deleteMany({ where: { id: testWorkspace.id } }).catch(() => {});
            }
            if (userIds.length > 0) {
                await prisma.activity_logs.deleteMany({ where: { user_id: { in: userIds } } }).catch(() => {});
                await prisma.notifications.deleteMany({ where: { user_id: { in: userIds } } }).catch(() => {});
                await prisma.user_preferences.deleteMany({ where: { user_id: { in: userIds } } }).catch(() => {});
                await prisma.users.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
            }
        } catch (cleanupErr) {
            console.warn("Cleanup warning:", cleanupErr.message);
        } finally {
            if (server) {
                if (typeof server.closeAllConnections === "function") {
                    server.closeAllConnections();
                }
                await new Promise((resolve) => server.close(resolve));
            }
        }
    });

    test("1. Comment creation on assigned task succeeds without HTTP 500", async () => {
        // Owner comments on task assigned to Member A
        const res = await fetch(`${baseApiUrl}/tasks/${testTask.id}/comments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ content: "Testing comment on assigned task in Phase 20" })
        });

        assert.equal(res.status, 201, "Expected HTTP 201 for comment creation");
        const body = await res.json();
        assert.ok(body.comment, "Expected created comment in response");
        assert.equal(body.comment.content, "Testing comment on assigned task in Phase 20");
    });

    test("2. Comment notification persistence: type normalized to 'comment' in database", async () => {
        const notif = await prisma.notifications.findFirst({
            where: {
                user_id: memberUserA.id,
                related_entity_id: testTask.id
            },
            orderBy: { created_at: "desc" }
        });

        assert.ok(notif, "Expected notification to be persisted for assigned user");
        assert.equal(notif.type, "comment", "Expected type to be normalized to 'comment' matching chk_notification_type");
        assert.ok(notif.message.includes(testTask.title));
    });

    test("3. Task assignment notification persistence: type normalized to 'assignment'", async () => {
        // Add memberUserB to project first so assignment is valid
        const teamRole = await prisma.roles.findFirst({ where: { role_name: "Team Member" } });
        await prisma.project_members.create({
            data: {
                project_id: testProject.id,
                user_id: memberUserB.id,
                role_id: teamRole.id
            }
        });

        // Reassign task to Member B
        const res = await fetch(`${baseApiUrl}/tasks/${testTask.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ assignedTo: memberUserB.id })
        });

        assert.equal(res.status, 200, "Expected HTTP 200 for task update");

        const notif = await prisma.notifications.findFirst({
            where: {
                user_id: memberUserB.id,
                related_entity_id: testTask.id
            },
            orderBy: { created_at: "desc" }
        });

        assert.ok(notif, "Expected assignment notification for Member B");
        assert.equal(notif.type, "assignment", "Expected normalized type 'assignment'");
    });

    test("4. Project update notification persistence: type normalized to 'update'", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ description: "Updated project description in Phase 20" })
        });

        assert.equal(res.status, 200, "Expected HTTP 200 for project update");

        const notif = await prisma.notifications.findFirst({
            where: {
                user_id: memberUserA.id,
                related_entity_id: testProject.id
            },
            orderBy: { created_at: "desc" }
        });

        assert.ok(notif, "Expected project update notification for memberUserA");
        assert.equal(notif.type, "update", "Expected normalized type 'update'");
    });

    test("5. Due-date notification persistence: type normalized to 'due_date'", async () => {
        const directNotif = await createNotification({
            userId: memberUserA.id,
            type: "DUE_DATE_APPROACHING",
            message: `Task "${testTask.title}" is due within 24 hours.`,
            relatedEntityType: "TASK",
            relatedEntityId: testTask.id
        });

        assert.ok(directNotif, "Expected due date notification to be created");
        assert.equal(directNotif.type, "due_date", "Expected normalized type 'due_date'");

        const dbRecord = await prisma.notifications.findUnique({
            where: { id: directNotif.id }
        });
        assert.equal(dbRecord.type, "due_date");
    });

    test("6. Invalid notification type rejection: invalid types throw or reject", async () => {
        // Direct rejection on completely unmapped type
        assert.equal(normalizeNotificationType("INVALID_UNKNOWN_TYPE"), null);

        await assert.rejects(
            async () => {
                await createNotification({
                    userId: memberUserA.id,
                    type: "COMPLETELY_INVALID_RANDOM_TYPE",
                    message: "Test message"
                });
            },
            {
                name: "Error",
                message: /Invalid notification type/
            }
        );
    });

    test("7. Workspace role updates using { role } payload (frontend format)", async () => {
        const res = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/members/${memberUserA.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ role: "Admin" })
        });

        assert.equal(res.status, 200, "Expected HTTP 200 using { role } payload");
        const body = await res.json();
        assert.equal(body.member.workspaceRole || body.member.role, "Admin");

        const updatedDb = await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: testWorkspace.id,
                    user_id: memberUserA.id
                }
            }
        });
        assert.equal(updatedDb.workspace_role, "Admin");
    });

    test("8. Workspace role updates using { workspaceRole } payload (backend format)", async () => {
        const res = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/members/${memberUserA.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ workspaceRole: "Member" })
        });

        assert.equal(res.status, 200, "Expected HTTP 200 using { workspaceRole } payload");
        const body = await res.json();
        assert.equal(body.member.workspaceRole || body.member.role, "Member");

        const updatedDb = await prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: testWorkspace.id,
                    user_id: memberUserA.id
                }
            }
        });
        assert.equal(updatedDb.workspace_role, "Member");
    });

    test("9. Invalid workspace role rejection with HTTP 400", async () => {
        const res = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/members/${memberUserA.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ role: "Superuser" })
        });

        assert.equal(res.status, 400, "Expected HTTP 400 for invalid role 'Superuser'");
        const body = await res.json();
        assert.equal(body.message, "Invalid workspace role");
    });

    test("10. Project role mapping for 'Member' and 'Team Member'", async () => {
        // Direct normalization test
        assert.equal(normalizeProjectRoleName("Member"), "Team Member");
        assert.equal(normalizeProjectRoleName("member"), "Team Member");
        assert.equal(normalizeProjectRoleName("Team Member"), "Team Member");
        assert.equal(normalizeProjectRoleName("admin"), "Admin");

        // Update project member role using 'Member' alias
        const resAlias = await fetch(`${baseApiUrl}/projects/${testProject.id}/members/${memberUserB.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ role: "Member" })
        });

        assert.equal(resAlias.status, 200, "Expected HTTP 200 for role 'Member' alias");
        const bodyAlias = await resAlias.json();
        assert.equal(bodyAlias.member.roles.role_name, "Team Member");

        // Update project member role using explicit 'Admin'
        const resAdmin = await fetch(`${baseApiUrl}/projects/${testProject.id}/members/${memberUserB.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ role: "Admin" })
        });

        assert.equal(resAdmin.status, 200, "Expected HTTP 200 for role 'Admin'");
        const bodyAdmin = await resAdmin.json();
        assert.equal(bodyAdmin.member.roles.role_name, "Admin");
    });

    test("11. Unauthorized role changes are rejected with HTTP 403", async () => {
        // Member A (regular member) attempts to change Member B's workspace role
        const resWorkspace = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/members/${memberUserB.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberTokenA}`
            },
            body: JSON.stringify({ role: "Admin" })
        });

        assert.equal(resWorkspace.status, 403, "Expected HTTP 403 for unauthorized workspace role update");

        // Reset Member B project role to Team Member
        await prisma.project_members.update({
            where: {
                project_id_user_id: {
                    project_id: testProject.id,
                    user_id: memberUserB.id
                }
            },
            data: {
                role_id: (await prisma.roles.findFirst({ where: { role_name: "Team Member" } })).id
            }
        });

        // Member A (team member) attempts to update Member B's project role
        const resProject = await fetch(`${baseApiUrl}/projects/${testProject.id}/members/${memberUserB.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${memberTokenA}`
            },
            body: JSON.stringify({ role: "Admin" })
        });

        assert.equal(resProject.status, 403, "Expected HTTP 403 for unauthorized project role update");
    });

    test("12. Notification preferences and DND filtering remain functional", async () => {
        // Enable DND for Member A
        await prisma.user_preferences.upsert({
            where: { user_id: memberUserA.id },
            update: { dnd_enabled: true },
            create: {
                user_id: memberUserA.id,
                dnd_enabled: true
            }
        });

        // Notification should not be delivered when DND is enabled
        const allowedWhenDnd = await shouldDeliverNotification(memberUserA.id, "NEW_COMMENT");
        assert.equal(allowedWhenDnd, false, "Notification delivery should be blocked when DND is enabled");

        const suppressedNotif = await createNotification({
            userId: memberUserA.id,
            type: "NEW_COMMENT",
            message: "This should be suppressed"
        });
        assert.equal(suppressedNotif, null, "Expected null notification when suppressed by DND");

        // Disable DND
        await prisma.user_preferences.update({
            where: { user_id: memberUserA.id },
            data: { dnd_enabled: false, mentions_and_comments: true }
        });

        const allowedWhenNotDnd = await shouldDeliverNotification(memberUserA.id, "NEW_COMMENT");
        assert.equal(allowedWhenNotDnd, true, "Notification delivery should be allowed when DND is disabled");

        const deliveredNotif = await createNotification({
            userId: memberUserA.id,
            type: "NEW_COMMENT",
            message: "This should be delivered"
        });
        assert.ok(deliveredNotif, "Expected notification to be delivered when DND is disabled");
        assert.equal(deliveredNotif.type, "comment", "Expected type 'comment'");
    });
});
