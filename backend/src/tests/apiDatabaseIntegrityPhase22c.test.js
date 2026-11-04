import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { createBatchActivities } from "../services/activityService.js";
import { loginUser } from "../services/authService.js";

describe("PHASE 22C: API & Database Integrity, Pagination, and Calendar Bounding Test Suite", () => {
    let server;
    let baseApiUrl;
    let testUser;
    let memberUser;
    let testWorkspace;
    let testProject;
    let authHeader;
    const testPassword = "Password123!";

    before(async () => {
        const userRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!userRole) throw new Error("Team Member role missing");

        const passwordHash = await bcrypt.hash(testPassword, 10);

        // 1. Create or upsert primary test user
        testUser = await prisma.users.upsert({
            where: { email: "phase22c_admin@taskflow.dev" },
            update: { password_hash: passwordHash, is_active: true },
            create: {
                email: "phase22c_admin@taskflow.dev",
                first_name: "Phase22C",
                last_name: "Admin",
                password_hash: passwordHash,
                role_id: userRole.id,
                is_active: true
            }
        });

        // 2. Create secondary test user for membership tests
        memberUser = await prisma.users.upsert({
            where: { email: "phase22c_member@taskflow.dev" },
            update: { password_hash: passwordHash, is_active: true },
            create: {
                email: "phase22c_member@taskflow.dev",
                first_name: "Phase22C",
                last_name: "Member",
                password_hash: passwordHash,
                role_id: userRole.id,
                is_active: true
            }
        });

        // 3. Create test workspace owned by testUser
        testWorkspace = await prisma.workspaces.create({
            data: {
                name: "Phase 22C Integrity Workspace " + Date.now(),
                description: "Workspace for Phase 22C API & DB Integrity Tests",
                owner_id: testUser.id,
                workspace_members: {
                    create: {
                        user_id: testUser.id,
                        workspace_role: "Owner"
                    }
                }
            }
        });

        // 4. Create test project in workspace
        testProject = await prisma.projects.create({
            data: {
                workspace_id: testWorkspace.id,
                title: "Phase 22C Integrity Project",
                description: "Test Project",
                category: "Engineering",
                priority: "High",
                status: "Planning",
                start_date: new Date("2026-06-01T00:00:00Z"),
                end_date: new Date("2026-06-30T23:59:59Z"),
                manager_id: testUser.id,
                project_members: {
                    create: {
                        user_id: testUser.id,
                        role_id: userRole.id
                    }
                }
            }
        });

        // 5. Generate Auth JWT
        const token = jwt.sign(
            { userId: testUser.id, id: testUser.id, email: testUser.email },
            process.env.JWT_SECRET || "default_jwt_secret",
            { expiresIn: "2h" }
        );
        authHeader = `Bearer ${token}`;

        // 6. Start test server
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        try {
            if (testProject?.id) {
                await prisma.task_dependencies.deleteMany({
                    where: { tasks_task_dependencies_task_idTotasks: { project_id: testProject.id } }
                });
                await prisma.subtasks.deleteMany({
                    where: { tasks: { project_id: testProject.id } }
                });
                await prisma.tasks.deleteMany({
                    where: { project_id: testProject.id } }
                );
                await prisma.project_members.deleteMany({
                    where: { project_id: testProject.id } }
                );
                await prisma.projects.delete({
                    where: { id: testProject.id } }
                );
            }
            if (testWorkspace?.id) {
                await prisma.activity_logs.deleteMany({
                    where: { workspace_id: testWorkspace.id }
                });
                await prisma.workspace_members.deleteMany({
                    where: { workspace_id: testWorkspace.id }
                });
                await prisma.workspaces.delete({
                    where: { id: testWorkspace.id }
                });
            }
            if (testUser?.id) {
                await prisma.notifications.deleteMany({
                    where: { user_id: testUser.id }
                });
                await prisma.activity_logs.deleteMany({
                    where: { user_id: testUser.id }
                });
                await prisma.users.delete({ where: { id: testUser.id } });
            }
            if (memberUser?.id) {
                await prisma.notifications.deleteMany({
                    where: { user_id: memberUser.id }
                });
                await prisma.activity_logs.deleteMany({
                    where: { user_id: memberUser.id }
                });
                await prisma.users.delete({ where: { id: memberUser.id } });
            }
        } catch (err) {
            console.error("Phase 22C cleanup error:", err);
        } finally {
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
        }
    });

    // ============================================================
    // TASK 1 — DATABASE CONSTRAINT ERROR HANDLING
    // ============================================================

    test("1. Project creation with startDate > endDate is rejected with HTTP 400 Bad Request", async () => {
        const res = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/projects`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                title: "Invalid Dates Project",
                startDate: "2026-10-01T00:00:00Z",
                endDate: "2026-09-01T00:00:00Z"
            })
        });

        const body = await res.json();
        assert.equal(res.status, 400, "Should return HTTP 400 Bad Request");
        assert.ok(
            body.message.includes("start date cannot be after end date") ||
            body.message.includes("violates database validation constraint"),
            `Expected clean date constraint message, received: ${body.message}`
        );
        // Ensure no raw SQL / internals leaked
        assert.equal(body.sql, undefined);
        assert.equal(body.clientVersion, undefined);
        assert.ok(!body.message.includes("SELECT"));
        assert.ok(!body.message.includes("chk_project_dates"));
    });

    test("2. Project update with startDate > endDate is rejected with HTTP 400 Bad Request", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                startDate: "2026-08-01T00:00:00Z",
                endDate: "2026-07-01T00:00:00Z"
            })
        });

        const body = await res.json();
        assert.equal(res.status, 400, "Should return HTTP 400 Bad Request");
        assert.ok(
            body.message.includes("start date cannot be after end date"),
            `Expected clean date message, got: ${body.message}`
        );
    });

    test("3. Task creation with startDate > dueDate is rejected with HTTP 400 Bad Request", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                title: "Invalid Task Dates",
                startDate: "2026-06-15T00:00:00Z",
                dueDate: "2026-06-10T00:00:00Z",
                priority: "Medium"
            })
        });

        const body = await res.json();
        assert.equal(res.status, 400, "Should return HTTP 400 Bad Request");
        assert.ok(
            body.message.includes("start date cannot be after due date") ||
            body.message.includes("violates database validation constraint"),
            `Expected clean task date constraint message, got: ${body.message}`
        );
    });

    test("4. Duplicate workspace member addition returns HTTP 409 Conflict with sanitized message", async () => {
        // Add member first time
        const firstRes = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/members`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                userId: memberUser.id,
                workspaceRole: "Member"
            })
        });
        assert.equal(firstRes.status, 201, "First addition should succeed");

        // Attempt duplicate addition
        const dupRes = await fetch(`${baseApiUrl}/workspaces/${testWorkspace.id}/members`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                userId: memberUser.id,
                workspaceRole: "Member"
            })
        });

        const body = await dupRes.json();
        assert.equal(dupRes.status, 409, "Duplicate member addition should return HTTP 409 Conflict");
        assert.ok(
            body.message.includes("already a member of this workspace") ||
            body.message.includes("already exists"),
            `Expected conflict message, got: ${body.message}`
        );
        // Ensure no raw SQL or Prisma internals leaked
        assert.ok(!JSON.stringify(body).includes("uq_workspace_member"));
        assert.ok(!JSON.stringify(body).includes("prisma"));
    });

    // ============================================================
    // TASK 2 — API PAGINATION
    // ============================================================

    test("5. GET /api/notifications returns paginated results with metadata", async () => {
        // Seed 5 notifications for testUser
        for (let i = 1; i <= 5; i++) {
            await prisma.notifications.create({
                data: {
                    user_id: testUser.id,
                    type: "assignment",
                    message: `Test Notification ${i}`
                }
            });
        }

        const res = await fetch(`${baseApiUrl}/notifications?page=1&limit=2`, {
            headers: { Authorization: authHeader }
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.data), "data must be an array");
        assert.equal(body.data.length, 2, "Should return exactly 2 items for limit=2");
        assert.ok(body.pagination, "Pagination metadata must be present");
        assert.equal(body.pagination.page, 1);
        assert.equal(body.pagination.limit, 2);
        assert.ok(body.pagination.total >= 5);
        assert.ok(body.pagination.totalPages >= 3);
    });

    test("6. GET /api/notifications rejects invalid page or limit with HTTP 400 Bad Request", async () => {
        const invalidPageRes = await fetch(`${baseApiUrl}/notifications?page=0&limit=10`, {
            headers: { Authorization: authHeader }
        });
        assert.equal(invalidPageRes.status, 400);
        const pageBody = await invalidPageRes.json();
        assert.ok(pageBody.message.includes("page parameter"));

        const excessiveLimitRes = await fetch(`${baseApiUrl}/notifications?page=1&limit=200`, {
            headers: { Authorization: authHeader }
        });
        assert.equal(excessiveLimitRes.status, 400);
        const limitBody = await excessiveLimitRes.json();
        assert.ok(limitBody.message.includes("limit parameter") || limitBody.message.includes("100"));
    });

    test("7. GET /api/projects/:projectId/tasks returns paginated tasks with page/limit", async () => {
        // Seed 4 tasks in testProject
        for (let i = 1; i <= 4; i++) {
            await prisma.tasks.create({
                data: {
                    project_id: testProject.id,
                    title: `Paginated Task ${i}`,
                    priority: "Medium",
                    status: "To Do",
                    created_by: testUser.id,
                    assigned_to: testUser.id
                }
            });
        }

        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks?page=1&limit=2`, {
            headers: { Authorization: authHeader }
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(Array.isArray(body.tasks), "tasks must be an array for compatibility");
        assert.equal(body.tasks.length, 2, "Should return 2 tasks for page=1&limit=2");
        assert.ok(body.pagination, "pagination metadata must be present");
        assert.equal(body.pagination.page, 1);
        assert.equal(body.pagination.limit, 2);
        assert.ok(body.pagination.total >= 4);
    });

    test("8. GET /api/projects/:projectId/tasks defaults safely when pagination params are omitted", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks`, {
            headers: { Authorization: authHeader }
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(Array.isArray(body.tasks), "tasks must be an array");
        assert.ok(body.tasks.length >= 4, "Should return all active tasks when unpaginated");
        assert.ok(body.pagination, "pagination metadata must be present even when omitted");
        assert.equal(body.pagination.page, 1);
        assert.equal(body.pagination.total, body.tasks.length);
    });

    test("9. GET /api/projects/:projectId/tasks rejects limit > 100 with HTTP 400 Bad Request", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks?page=1&limit=150`, {
            headers: { Authorization: authHeader }
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.ok(body.message.includes("limit parameter") || body.message.includes("100"));
    });

    // ============================================================
    // TASK 3 — CALENDAR DATE BOUNDING
    // ============================================================

    test("10. GET /api/calendar bounds events within requested startDate and endDate", async () => {
        // Create 2 tasks: one in June 2026, one in July 2026
        const juneTask = await prisma.tasks.create({
            data: {
                project_id: testProject.id,
                title: "June Calendar Task",
                start_date: new Date("2026-06-10T09:00:00Z"),
                due_date: new Date("2026-06-15T17:00:00Z"),
                priority: "High",
                status: "To Do",
                created_by: testUser.id,
                assigned_to: testUser.id
            }
        });

        const julyTask = await prisma.tasks.create({
            data: {
                project_id: testProject.id,
                title: "July Calendar Task",
                start_date: new Date("2026-07-10T09:00:00Z"),
                due_date: new Date("2026-07-15T17:00:00Z"),
                priority: "Medium",
                status: "To Do",
                created_by: testUser.id,
                assigned_to: testUser.id
            }
        });

        // Query only June 2026 window
        const res = await fetch(
            `${baseApiUrl}/calendar?startDate=2026-06-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.999Z`,
            { headers: { Authorization: authHeader } }
        );

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.events), "events must be an array");

        // Verify all returned events fall within the June window
        const startWindow = new Date("2026-06-01T00:00:00.000Z").getTime();
        const endWindow = new Date("2026-06-30T23:59:59.999Z").getTime();

        for (const evt of body.events) {
            const t = new Date(evt.date).getTime();
            assert.ok(t >= startWindow, `Event ${evt.title} date ${evt.date} is before June start`);
            assert.ok(t <= endWindow, `Event ${evt.title} date ${evt.date} is after June end`);
        }

        // Verify juneTask is present and julyTask is absent
        const foundJune = body.events.some((e) => e.sourceId === juneTask.id);
        const foundJuly = body.events.some((e) => e.sourceId === julyTask.id);
        assert.equal(foundJune, true, "June task events must be present");
        assert.equal(foundJuly, false, "July task events must be excluded by bounding window");
    });

    test("11. GET /api/calendar rejects reversed date ranges (startDate > endDate) with HTTP 400", async () => {
        const res = await fetch(
            `${baseApiUrl}/calendar?startDate=2026-07-01T00:00:00Z&endDate=2026-06-01T00:00:00Z`,
            { headers: { Authorization: authHeader } }
        );

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.success, false);
        assert.ok(body.message.includes("startDate cannot be after endDate"));
    });

    test("12. GET /api/calendar rejects invalid date formats with HTTP 400 Bad Request", async () => {
        const res = await fetch(
            `${baseApiUrl}/calendar?startDate=not-a-real-date&endDate=2026-06-01T00:00:00Z`,
            { headers: { Authorization: authHeader } }
        );

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.success, false);
        assert.ok(body.message.includes("Invalid startDate format"));
    });

    test("13. GET /api/calendar excludes tasks where both start_date and due_date are null", async () => {
        const nullDatesTask = await prisma.tasks.create({
            data: {
                project_id: testProject.id,
                title: "Null Dates Task Should Not Appear",
                start_date: null,
                due_date: null,
                priority: "Low",
                status: "To Do",
                created_by: testUser.id,
                assigned_to: testUser.id
            }
        });

        const res = await fetch(`${baseApiUrl}/calendar`, {
            headers: { Authorization: authHeader }
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        const hasNullDatesTask = body.events.some((e) => e.sourceId === nullDatesTask.id);
        assert.equal(hasNullDatesTask, false, "Tasks with no dates must be excluded from calendar");
    });

    // ============================================================
    // TASK 4 & 5 — QUERY PERFORMANCE & ROUTE REGISTRATION
    // ============================================================

    test("14. createBatchActivities batch inserts logs in a single call", async () => {
        const activities = [
            {
                workspaceId: testWorkspace.id,
                userId: testUser.id,
                actionType: "LOGIN",
                entityType: "USER",
                entityId: testUser.id,
                description: "Batch activity test 1"
            },
            {
                workspaceId: testWorkspace.id,
                userId: testUser.id,
                actionType: "LOGIN",
                entityType: "USER",
                entityId: testUser.id,
                description: "Batch activity test 2"
            }
        ];

        const result = await createBatchActivities(activities);
        assert.equal(result?.count ?? result, 2, "Should insert 2 activities in batch");

        const inserted = await prisma.activity_logs.findMany({
            where: {
                workspace_id: testWorkspace.id,
                description: { startsWith: "Batch activity test" }
            }
        });
        assert.equal(inserted.length, 2);
    });

    test("15. User login executes cleanly with batch activity logging across workspaces", async () => {
        const loginRes = await loginUser(testUser.email, testPassword);
        assert.ok(loginRes.token, "Login should return JWT token");
        assert.equal(loginRes.user.email, testUser.email);
    });

    test("16. Task dependency endpoint operates cleanly without duplicate route layer collisions", async () => {
        // Create 2 tasks for dependency link
        const taskA = await prisma.tasks.create({
            data: {
                project_id: testProject.id,
                title: "Task A For Dep",
                priority: "Medium",
                status: "To Do",
                created_by: testUser.id,
                assigned_to: testUser.id
            }
        });
        const taskB = await prisma.tasks.create({
            data: {
                project_id: testProject.id,
                title: "Task B For Dep",
                priority: "Medium",
                status: "To Do",
                created_by: testUser.id,
                assigned_to: testUser.id
            }
        });

        // Add dependency
        const depRes = await fetch(`${baseApiUrl}/tasks/${taskB.id}/dependencies`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                dependsOnTaskId: taskA.id
            })
        });

        assert.equal(depRes.status, 201, "Dependency creation should succeed");

        // Duplicate dependency should return 409
        const dupDepRes = await fetch(`${baseApiUrl}/tasks/${taskB.id}/dependencies`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader
            },
            body: JSON.stringify({
                dependsOnTaskId: taskA.id
            })
        });
        assert.equal(dupDepRes.status, 409, "Duplicate dependency must return 409 Conflict");
    });
});
