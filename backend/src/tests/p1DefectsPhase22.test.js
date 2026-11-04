import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import {
    VALID_SUBTASK_STATUSES,
    createSubtask,
    updateSubtask,
    updateSubtaskStatus
} from "../services/subtaskService.js";
import {
    VALID_TASK_PRIORITIES,
    VALID_TASK_STATUSES,
    calculateSubtaskProgress,
    createTask,
    updateTask
} from "../services/taskService.js";

describe("PHASE 22: P1 Defects Remediation Test Suite (Subtask Statuses & Task Priorities)", () => {
    let server;
    let baseApiUrl;
    let testUser;
    let userToken;
    let testWorkspace;
    let testProject;
    let testTask;

    before(async () => {
        const teamRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!teamRole) throw new Error("Team Member role missing in database");

        // 1. Setup test user
        testUser = await prisma.users.upsert({
            where: { email: "phase22_p1_tester@taskflow.dev" },
            update: {},
            create: {
                email: "phase22_p1_tester@taskflow.dev",
                first_name: "P1Defect",
                last_name: "Tester",
                password_hash: "mock_password_hash",
                role_id: teamRole.id
            }
        });

        const secret = process.env.JWT_SECRET || "fallback_secret";
        userToken = jwt.sign(
            { userId: testUser.id, email: testUser.email },
            secret,
            { expiresIn: "2h" }
        );

        // 2. Setup test workspace
        testWorkspace = await prisma.workspaces.create({
            data: {
                name: "Phase 22 P1 Verification Workspace",
                description: "Workspace for verifying P1 fixes",
                owner_id: testUser.id,
                workspace_members: {
                    create: [
                        { user_id: testUser.id, workspace_role: "Owner" }
                    ]
                }
            }
        });

        // 3. Setup test project
        testProject = await prisma.projects.create({
            data: {
                title: "Phase 22 P1 Project",
                description: "Project for P1 defect regression tests",
                workspace_id: testWorkspace.id,
                manager_id: testUser.id,
                status: "Active",
                project_members: {
                    create: [
                        { user_id: testUser.id, role_id: teamRole.id }
                    ]
                }
            }
        });

        // 4. Setup initial test task
        testTask = await prisma.tasks.create({
            data: {
                title: "Phase 22 Baseline Task",
                description: "Parent task for subtask testing",
                project_id: testProject.id,
                created_by: testUser.id,
                assigned_to: testUser.id,
                status: "In Progress",
                priority: "Medium"
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseApiUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        try {
            // Delete subtasks created during tests
            await prisma.subtasks.deleteMany({
                where: {
                    tasks: {
                        project_id: testProject?.id
                    }
                }
            });

            // Delete tasks
            await prisma.tasks.deleteMany({
                where: { project_id: testProject?.id }
            });

            // Delete project members & project
            if (testProject?.id) {
                await prisma.project_members.deleteMany({
                    where: { project_id: testProject.id }
                });
                await prisma.projects.delete({
                    where: { id: testProject.id }
                });
            }

            // Delete workspace members & workspace
            if (testWorkspace?.id) {
                await prisma.workspace_members.deleteMany({
                    where: { workspace_id: testWorkspace.id }
                });
                await prisma.workspaces.delete({
                    where: { id: testWorkspace.id }
                });
            }

            // Delete test user
            if (testUser?.id) {
                await prisma.users.delete({
                    where: { id: testUser.id }
                });
            }
        } catch (cleanupErr) {
            console.error("Cleanup error in Phase 22 test suite:", cleanupErr.message);
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    // =========================================================================
    // DEFECT 01: SUBTASK STATUS MISMATCH & PROGRESS CALCULATION TESTS
    // =========================================================================

    test("1. VALID_SUBTASK_STATUSES strictly exports canonical values: ['To Do', 'In Progress', 'Done']", () => {
        assert.deepEqual(VALID_SUBTASK_STATUSES, ["To Do", "In Progress", "Done"]);
    });

    test("2. POST /api/tasks/:taskId/subtasks creates subtask with 'To Do' (HTTP 201)", async () => {
        const res = await fetch(`${baseApiUrl}/tasks/${testTask.id}/subtasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "Subtask Step 1",
                description: "Initial subtask description",
                status: "To Do"
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.subtask.title, "Subtask Step 1");
        assert.equal(data.subtask.status, "To Do");

        // Verify direct DB persistence
        const inDb = await prisma.subtasks.findUnique({ where: { id: data.subtask.id } });
        assert.equal(inDb.status, "To Do");
    });

    test("3. PATCH /api/subtasks/:id updates subtask status to 'In Progress' (HTTP 200)", async () => {
        // Create a subtask
        const created = await prisma.subtasks.create({
            data: {
                task_id: testTask.id,
                title: "Subtask Step 2",
                status: "To Do"
            }
        });

        const res = await fetch(`${baseApiUrl}/subtasks/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                status: "In Progress"
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.subtask.status, "In Progress");

        const inDb = await prisma.subtasks.findUnique({ where: { id: created.id } });
        assert.equal(inDb.status, "In Progress");
    });

    test("4. PATCH /api/subtasks/:id/status updates status to 'Done' (HTTP 200)", async () => {
        const created = await prisma.subtasks.create({
            data: {
                task_id: testTask.id,
                title: "Subtask Step 3",
                status: "In Progress"
            }
        });

        const res = await fetch(`${baseApiUrl}/subtasks/${created.id}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                status: "Done"
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.subtask.status, "Done");

        const inDb = await prisma.subtasks.findUnique({ where: { id: created.id } });
        assert.equal(inDb.status, "Done");
    });

    test("5. calculateSubtaskProgress correctly calculates 0%, 50%, and 100% with 'Done' and 'Completed'", () => {
        assert.equal(calculateSubtaskProgress([]), 0);
        assert.equal(calculateSubtaskProgress(null), 0);

        // All 'Done'
        assert.equal(
            calculateSubtaskProgress([{ status: "Done" }, { status: "Done" }]),
            100
        );

        // 1 of 2 'Done'
        assert.equal(
            calculateSubtaskProgress([{ status: "Done" }, { status: "To Do" }]),
            50
        );

        // 1 'Done', 1 'In Progress', 1 'To Do' -> 33%
        assert.equal(
            calculateSubtaskProgress([
                { status: "Done" },
                { status: "In Progress" },
                { status: "To Do" }
            ]),
            33
        );

        // Backward compatibility: 'Completed' also recognized as finished
        assert.equal(
            calculateSubtaskProgress([{ status: "Completed" }, { status: "Done" }]),
            100
        );
    });

    test("6. POST /api/tasks/:taskId/subtasks rejects invalid status 'Completed' with HTTP 400 (NOT HTTP 500)", async () => {
        const res = await fetch(`${baseApiUrl}/tasks/${testTask.id}/subtasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "Subtask with invalid status Completed",
                status: "Completed"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid subtask status");
    });

    test("7. POST /api/tasks/:taskId/subtasks rejects invalid status 'Backlog' with HTTP 400 (NOT HTTP 500)", async () => {
        const res = await fetch(`${baseApiUrl}/tasks/${testTask.id}/subtasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "Subtask with invalid status Backlog",
                status: "Backlog"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid subtask status");
    });

    test("8. PATCH /api/subtasks/:id rejects invalid status 'Review' with HTTP 400 (NOT HTTP 500)", async () => {
        const created = await prisma.subtasks.create({
            data: {
                task_id: testTask.id,
                title: "Valid Subtask for Patch Reject",
                status: "To Do"
            }
        });

        const res = await fetch(`${baseApiUrl}/subtasks/${created.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                status: "Review"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid subtask status");
    });

    test("9. PATCH /api/subtasks/:id/status rejects invalid status 'Review' with HTTP 400 (NOT HTTP 500)", async () => {
        const created = await prisma.subtasks.create({
            data: {
                task_id: testTask.id,
                title: "Valid Subtask for Status Reject",
                status: "To Do"
            }
        });

        const res = await fetch(`${baseApiUrl}/subtasks/${created.id}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                status: "Review"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid subtask status");
    });

    test("10. Service layer rejects invalid subtask statuses directly with statusCode 400", async () => {
        await assert.rejects(
            async () => {
                await createSubtask(
                    testTask.id,
                    testUser.id,
                    "Invalid Subtask",
                    "Description",
                    "NonExistentStatus"
                );
            },
            (err) => {
                assert.equal(err.message, "Invalid subtask status");
                assert.equal(err.statusCode, 400);
                return true;
            }
        );
    });

    // =========================================================================
    // DEFECT 02: TASK PRIORITY "CRITICAL" CRASH REMEDIATION TESTS
    // =========================================================================

    test("11. VALID_TASK_PRIORITIES strictly exports canonical values: ['Low', 'Medium', 'High']", () => {
        assert.deepEqual(VALID_TASK_PRIORITIES, ["Low", "Medium", "High"]);
    });

    test("12. POST /api/projects/:projectId/tasks creates task with 'Low' priority (HTTP 201)", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "Low Priority Task",
                priority: "Low",
                status: "To Do"
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.task.priority, "Low");

        const inDb = await prisma.tasks.findUnique({ where: { id: data.task.id } });
        assert.equal(inDb.priority, "Low");
    });

    test("13. POST /api/projects/:projectId/tasks creates task with 'High' priority (HTTP 201)", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "High Priority Task",
                priority: "High",
                status: "To Do"
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.task.priority, "High");

        const inDb = await prisma.tasks.findUnique({ where: { id: data.task.id } });
        assert.equal(inDb.priority, "High");
    });

    test("14. PATCH /api/tasks/:id updates priority from Medium to High (HTTP 200)", async () => {
        const task = await prisma.tasks.create({
            data: {
                title: "Task for Priority Update",
                project_id: testProject.id,
                created_by: testUser.id,
                assigned_to: testUser.id,
                priority: "Medium",
                status: "To Do"
            }
        });

        const res = await fetch(`${baseApiUrl}/tasks/${task.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                priority: "High"
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.task.priority, "High");

        const inDb = await prisma.tasks.findUnique({ where: { id: task.id } });
        assert.equal(inDb.priority, "High");
    });

    test("15. POST /api/projects/:projectId/tasks rejects invalid priority 'Critical' with HTTP 400 (NOT HTTP 500)", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "Task with Critical Priority",
                priority: "Critical",
                status: "To Do"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid task priority");
    });

    test("16. PATCH /api/tasks/:id rejects invalid priority 'Critical' with HTTP 400 (NOT HTTP 500)", async () => {
        const res = await fetch(`${baseApiUrl}/tasks/${testTask.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                priority: "Critical"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid task priority");
    });

    test("17. POST /api/projects/:projectId/tasks rejects invalid priority 'Urgent' with HTTP 400 (NOT HTTP 500)", async () => {
        const res = await fetch(`${baseApiUrl}/projects/${testProject.id}/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: "Task with Urgent Priority",
                priority: "Urgent",
                status: "To Do"
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, "Invalid task priority");
    });

    test("18. Service layer rejects invalid task priority directly with statusCode 400", async () => {
        await assert.rejects(
            async () => {
                await createTask(
                    testProject.id,
                    testUser.id,
                    "Invalid Priority Task",
                    "Description",
                    "Critical"
                );
            },
            (err) => {
                assert.equal(err.message, "Invalid task priority");
                assert.equal(err.statusCode, 400);
                return true;
            }
        );

        await assert.rejects(
            async () => {
                await updateTask(testTask.id, testUser.id, {
                    priority: "Critical"
                });
            },
            (err) => {
                assert.equal(err.message, "Invalid task priority");
                assert.equal(err.statusCode, 400);
                return true;
            }
        );
    });
});
