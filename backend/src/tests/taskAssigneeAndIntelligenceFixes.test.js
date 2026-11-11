import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import app from "../app.js";
import prisma from "../config/prisma.js";
import * as taskService from "../services/taskService.js";
import * as projectService from "../services/projectService.js";
import digitalTwinService from "../services/digitalTwinService.js";
import { computeProjectStateHash, runScenarioSimulation, createProjectScenario } from "../services/scenarioSimulationService.js";
import { generateReplanningProposals, REPLANNING_STRATEGIES } from "../services/projectReplanningService.js";

describe("Four Core Fixes: Assignee Workflow, Replanning Engine, What-If Simulation & Direct Registration", () => {
    let server;
    let baseUrl;
    let testPassword = "Password123!";
    let testUserPM;
    let testUserMember;
    let testUserNonMember;
    let testWorkspace;
    let testProject;
    let defaultRole;

    before(async () => {
        process.env.DISABLE_RATE_LIMITING = "true";

        defaultRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        });
        if (!defaultRole) {
            defaultRole = await prisma.roles.findFirst();
        }

        // Clean up any remnants
        await prisma.users.deleteMany({
            where: { email: { contains: "fixestest_" } }
        }).catch(() => {});

        // 1. Create PM user
        testUserPM = await prisma.users.create({
            data: {
                first_name: "PM",
                last_name: "Lead",
                email: "fixestest_pm@taskflow.dev",
                password_hash: await bcrypt.hash(testPassword, 10),
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        // 2. Create Member user
        testUserMember = await prisma.users.create({
            data: {
                first_name: "Dev",
                last_name: "Member",
                email: "fixestest_member@taskflow.dev",
                password_hash: await bcrypt.hash(testPassword, 10),
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        // 3. Create Non-member user
        testUserNonMember = await prisma.users.create({
            data: {
                first_name: "External",
                last_name: "Stranger",
                email: "fixestest_stranger@taskflow.dev",
                password_hash: await bcrypt.hash(testPassword, 10),
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        // 4. Create Workspace
        testWorkspace = await prisma.workspaces.create({
            data: {
                name: "Fixes Test Workspace",
                owner_id: testUserPM.id
            }
        });

        await prisma.workspace_members.createMany({
            data: [
                { workspace_id: testWorkspace.id, user_id: testUserPM.id, workspace_role: "Owner" },
                { workspace_id: testWorkspace.id, user_id: testUserMember.id, workspace_role: "Member" }
            ]
        });

        // 5. Create Project where PM is manager_id
        testProject = await prisma.projects.create({
            data: {
                title: "Fixes Project",
                workspace_id: testWorkspace.id,
                manager_id: testUserPM.id,
                status: "Planning",
                priority: "High"
            }
        });

        // Add member to project (PM is manager, not in project_members)
        await prisma.project_members.create({
            data: {
                project_id: testProject.id,
                user_id: testUserMember.id,
                role_id: defaultRole.id
            }
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        // Clean up DB entities
        if (testProject) {
            await prisma.task_dependencies.deleteMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: testProject.id }
                }
            }).catch(() => {});
            await prisma.tasks.deleteMany({ where: { project_id: testProject.id } }).catch(() => {});
            await prisma.project_members.deleteMany({ where: { project_id: testProject.id } }).catch(() => {});
            await prisma.projects.delete({ where: { id: testProject.id } }).catch(() => {});
        }
        if (testWorkspace) {
            await prisma.workspace_members.deleteMany({ where: { workspace_id: testWorkspace.id } }).catch(() => {});
            await prisma.workspaces.delete({ where: { id: testWorkspace.id } }).catch(() => {});
        }
        await prisma.users.deleteMany({
            where: { email: { contains: "fixestest_" } }
        }).catch(() => {});

        await prisma.$disconnect().catch(() => {});
    });

    /* =========================================================================
       TASK 1: ASSIGNEE FUNCTIONALITY
    ========================================================================= */
    describe("Task 1: Assignee Management & Authorization", () => {
        let createdTaskId;

        test("1.1. getProjectMembers includes both project members and the project manager", async () => {
            const members = await projectService.getProjectMembers(testProject.id, testUserPM.id);
            assert.ok(Array.isArray(members));
            const pmEntry = members.find((m) => m.user_id === testUserPM.id);
            const memberEntry = members.find((m) => m.user_id === testUserMember.id);

            assert.ok(pmEntry, "Project Manager must be included in project members");
            assert.equal(pmEntry.roles.role_name, "Project Manager");
            assert.ok(memberEntry, "Regular project member must be included");
        });

        test("1.2. createTask allows unassigned task (assignedTo: null) without overriding to creator", async () => {
            const task = await taskService.createTask(
                testProject.id,
                testUserPM.id,
                "Unassigned Task",
                "No assignee specified",
                "Medium",
                "To Do",
                null,
                null,
                null,
                null
            );

            assert.ok(task.id);
            assert.equal(task.assigned_to, null, "Task should remain unassigned when null is passed");
            createdTaskId = task.id;
        });

        test("1.3. createTask allows assigning a valid project member", async () => {
            const task = await taskService.createTask(
                testProject.id,
                testUserPM.id,
                "Member Task",
                "",
                "High",
                "To Do",
                null,
                null,
                null,
                testUserMember.id
            );

            assert.equal(task.assigned_to, testUserMember.id);
        });

        test("1.4. createTask allows assigning the project manager", async () => {
            const task = await taskService.createTask(
                testProject.id,
                testUserPM.id,
                "PM Task",
                "",
                "High",
                "To Do",
                null,
                null,
                null,
                testUserPM.id
            );

            assert.equal(task.assigned_to, testUserPM.id);
        });

        test("1.5. createTask rejects non-eligible user with 400 Bad Request", async () => {
            await assert.rejects(
                async () => {
                    await taskService.createTask(
                        testProject.id,
                        testUserPM.id,
                        "Illegal Assignment",
                        "",
                        "Medium",
                        "To Do",
                        null,
                        null,
                        null,
                        testUserNonMember.id
                    );
                },
                (err) => {
                    assert.equal(err.message, "Assigned user is not a member of the project");
                    assert.equal(err.statusCode, 400);
                    return true;
                }
            );
        });

        test("1.6. updateTask persists assignee and rejects non-eligible assignee", async () => {
            // Assign to member
            const updated = await taskService.updateTask(
                createdTaskId,
                testUserPM.id,
                { assignedTo: testUserMember.id }
            );
            assert.equal(updated.assigned_to, testUserMember.id);

            // Re-read from DB
            const reloaded = await prisma.tasks.findUnique({
                where: { id: createdTaskId },
                include: { users_tasks_assigned_toTousers: true }
            });
            assert.equal(reloaded.assigned_to, testUserMember.id);
            assert.equal(reloaded.users_tasks_assigned_toTousers.first_name, "Dev");

            // Attempt to update to non-member
            await assert.rejects(
                async () => {
                    await taskService.updateTask(
                        createdTaskId,
                        testUserPM.id,
                        { assignedTo: testUserNonMember.id }
                    );
                },
                (err) => {
                    assert.equal(err.message, "Assigned user is not a member of the project");
                    assert.equal(err.statusCode, 400);
                    return true;
                }
            );

            // Clear assignee
            const cleared = await taskService.updateTask(
                createdTaskId,
                testUserPM.id,
                { assignedTo: null }
            );
            assert.equal(cleared.assigned_to, null);
        });

        test("1.7. getMyTasks includes users_tasks_assigned_toTousers projection", async () => {
            // Assign createdTaskId to testUserMember
            await taskService.updateTask(
                createdTaskId,
                testUserPM.id,
                { assignedTo: testUserMember.id }
            );

            const myTasks = await taskService.getMyTasks(testUserMember.id);
            const found = myTasks.find((t) => t.id === createdTaskId);
            assert.ok(found, "Task should be returned in getMyTasks");
            assert.ok(found.users_tasks_assigned_toTousers, "Assignee relation must be populated");
            assert.equal(found.users_tasks_assigned_toTousers.id, testUserMember.id);
            assert.equal(found.users_tasks_assigned_toTousers.first_name, "Dev");
        });
    });

    /* =========================================================================
       TASK 2 & 3: CRITICAL PATH PRE-PLANNING & WHAT-IF SIMULATION
    ========================================================================= */
    describe("Tasks 2 & 3: Intelligent Replanning & What-If Simulation Engines", () => {
        let taskA, taskB;

        before(async () => {
            taskA = await taskService.createTask(
                testProject.id,
                testUserPM.id,
                "Foundation Setup",
                "",
                "High",
                "In Progress",
                "2026-11-01",
                "2026-11-10",
                16,
                testUserPM.id
            );

            taskB = await taskService.createTask(
                testProject.id,
                testUserPM.id,
                "Frontend Integration",
                "",
                "Medium",
                "To Do",
                "2026-11-11",
                "2026-11-20",
                24,
                testUserMember.id
            );

            await prisma.task_dependencies.create({
                data: {
                    task_id: taskB.id,
                    depends_on_task_id: taskA.id
                }
            });
        });

        test("2.1. Digital twin returns dependencies.items and rawDependencies array", async () => {
            const twin = await digitalTwinService.getProjectDigitalTwin(testProject.id, testUserPM.id);
            assert.ok(twin);
            assert.ok(twin.dependencies);
            assert.ok(Array.isArray(twin.dependencies.items), "dependencies.items must be an array");
            assert.ok(Array.isArray(twin.rawDependencies), "rawDependencies must be an array");
            assert.equal(twin.dependencies.items.length, 1);
        });

        test("2.2. computeProjectStateHash accepts object dependencies with .items or rawDependencies without crashing", () => {
            const twinMock = {
                project: { id: testProject.id, title: "Mock" },
                tasks: [{ id: "t1", status: "To Do", priority: "High" }],
                dependencies: {
                    total: 1,
                    density: 0.5,
                    items: [{ task_id: "t2", depends_on_task_id: "t1" }]
                }
            };

            const hash = computeProjectStateHash(twinMock);
            assert.ok(hash);
            assert.equal(typeof hash, "string");
            assert.equal(hash.length, 64);
        });

        test("2.3. generateReplanningProposals executes successfully on actual project data without crashing", async () => {
            const result = await generateReplanningProposals({
                projectId: testProject.id,
                userId: testUserPM.id,
                strategy: REPLANNING_STRATEGIES.ALL
            });

            assert.ok(result);
            assert.ok(Array.isArray(result.proposals));
            assert.ok(result.baseStateHash);
        });

        test("3.1. createProjectScenario computes base state hash and creates in-memory scenario", async () => {
            const scenario = await createProjectScenario({
                projectId: testProject.id,
                userId: testUserPM.id,
                name: "Simulation Test Plan",
                mutations: [
                    {
                        type: "TASK_DELAY",
                        taskId: taskA.id,
                        days: 4
                    }
                ]
            });

            assert.ok(scenario);
            assert.ok(scenario.scenarioId);
            assert.equal(scenario.name, "Simulation Test Plan");
            assert.ok(scenario.baseStateHash);
        });

        test("3.2. runScenarioSimulation evaluates task delay without persisting changes to database", async () => {
            const twin = await digitalTwinService.getProjectDigitalTwin(testProject.id, testUserPM.id);

            const simResult = runScenarioSimulation({
                project: twin.project,
                tasks: twin.tasks.items,
                dependencies: twin.dependencies,
                projectMembers: twin.team.members,
                mutations: [
                    {
                        type: "TASK_DELAY",
                        taskId: taskA.id,
                        days: 5
                    }
                ],
                baseDigitalTwin: twin
            });

            assert.equal(simResult.valid, true);
            assert.ok(simResult.scenario);
            assert.ok(simResult.delta);

            // Verify live DB remains untouched
            const dbTaskA = await prisma.tasks.findUnique({ where: { id: taskA.id } });
            assert.equal(dbTaskA.due_date.toISOString().split("T")[0], "2026-11-10");
        });
    });

    /* =========================================================================
       TASK 4: DIRECT REGISTRATION WITHOUT OTP
    ========================================================================= */
    describe("Task 4: Direct Registration Without OTP Verification", () => {
        const newUserEmail = "fixestest_direct_user@taskflow.dev";

        test("4.1. Direct registration creates permanent user directly with password hashing", async () => {
            const res = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName: "Direct",
                    lastName: "Success",
                    email: newUserEmail,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.message, "User registered successfully");
            assert.ok(data.user);
            assert.equal(data.user.email, newUserEmail);

            // Verify DB permanent record
            const permanent = await prisma.users.findUnique({
                where: { email: newUserEmail },
                include: { roles: true }
            });
            assert.ok(permanent, "Permanent user must exist directly");
            assert.equal(permanent.has_completed_onboarding, false);
            assert.equal(permanent.roles.role_name, "Team Member");
            assert.equal(await bcrypt.compare(testPassword, permanent.password_hash), true);
        });

        test("4.2. Direct registered user can log in immediately with JWT token", async () => {
            const res = await fetch(`${baseUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: newUserEmail,
                    password: testPassword
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(data.token, "JWT token must be issued");
            assert.equal(data.user.email, newUserEmail);
        });

        test("4.3. Duplicate registration for same email returns 409 Conflict", async () => {
            const res = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName: "Direct",
                    lastName: "Success",
                    email: newUserEmail,
                    password: testPassword
                })
            });

            assert.equal(res.status, 409);
            const data = await res.json();
            assert.equal(data.message, "Email already registered");
        });
    });
});
