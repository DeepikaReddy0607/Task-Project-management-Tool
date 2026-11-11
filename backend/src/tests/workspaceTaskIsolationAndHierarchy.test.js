import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import * as taskService from "../services/taskService.js";
import * as subtaskService from "../services/subtaskService.js";
import * as projectService from "../services/projectService.js";

describe("Workspace and Project Isolation, Hierarchical Creation, Visibility & Membership Tests", () => {
    let testPassword = "Password123!";
    let userOwner;
    let userMemberB;
    let userMemberC;
    let userExternal;

    let wsChipmunks;
    let wsL;
    let projChipmunks1;
    let projL1;
    let defaultRole;

    const makeTask = (projId, uId, data = {}, wsId = null) => {
        return taskService.createTask(
            projId,
            uId,
            data.title,
            data.description || null,
            data.priority || "Medium",
            data.status || "To Do",
            data.startDate || null,
            data.dueDate || null,
            data.estimatedHours !== undefined ? data.estimatedHours : null,
            data.assignedTo !== undefined ? data.assignedTo : null,
            wsId
        );
    };

    const makeSubtask = (tId, uId, data = {}) => {
        return subtaskService.createSubtask(
            tId,
            uId,
            data.title,
            data.description || null,
            data.status || "To Do",
            data.dueDate || null,
            data.assignedTo || null
        );
    };

    before(async () => {
        defaultRole = await prisma.roles.findFirst({
            where: { role_name: "Team Member" }
        }) || (await prisma.roles.findFirst());

        const passwordHash = await bcrypt.hash(testPassword, 10);
        const runId = Date.now();

        // 1. Users
        userOwner = await prisma.users.create({
            data: {
                first_name: "Alvin",
                last_name: "Owner",
                email: `isoworkflow_${runId}_owner@taskflow.dev`,
                password_hash: passwordHash,
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        userMemberB = await prisma.users.create({
            data: {
                first_name: "Simon",
                last_name: "Developer",
                email: `isoworkflow_${runId}_simon@taskflow.dev`,
                password_hash: passwordHash,
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        userMemberC = await prisma.users.create({
            data: {
                first_name: "Theodore",
                last_name: "Designer",
                email: `isoworkflow_${runId}_theodore@taskflow.dev`,
                password_hash: passwordHash,
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        userExternal = await prisma.users.create({
            data: {
                first_name: "Outsider",
                last_name: "Visitor",
                email: `isoworkflow_${runId}_external@taskflow.dev`,
                password_hash: passwordHash,
                role_id: defaultRole.id,
                is_active: true,
                has_completed_onboarding: true
            }
        });

        // 2. Two distinct workspaces: Chipmunks and L
        wsChipmunks = await prisma.workspaces.create({
            data: {
                name: "Chipmunks",
                owner_id: userOwner.id
            }
        });

        wsL = await prisma.workspaces.create({
            data: {
                name: "L",
                owner_id: userOwner.id
            }
        });

        // Add userOwner and members to workspaces
        await prisma.workspace_members.createMany({
            data: [
                { workspace_id: wsChipmunks.id, user_id: userOwner.id, workspace_role: "Owner" },
                { workspace_id: wsChipmunks.id, user_id: userMemberB.id, workspace_role: "Member" },
                { workspace_id: wsChipmunks.id, user_id: userMemberC.id, workspace_role: "Member" },
                { workspace_id: wsL.id, user_id: userOwner.id, workspace_role: "Owner" }
            ]
        });

        // 3. Projects in each workspace
        projChipmunks1 = await prisma.projects.create({
            data: {
                title: "Chipmunks Music Album",
                workspace_id: wsChipmunks.id,
                manager_id: userOwner.id,
                status: "Planning",
                priority: "High"
            }
        });

        projL1 = await prisma.projects.create({
            data: {
                title: "Project L Core",
                workspace_id: wsL.id,
                manager_id: userOwner.id,
                status: "Planning",
                priority: "Medium"
            }
        });

        // Add userMemberB to projChipmunks1
        const contributorRole = await prisma.roles.findFirst({
            where: { role_name: "Contributor" }
        }) || defaultRole;

        await prisma.project_members.create({
            data: {
                project_id: projChipmunks1.id,
                user_id: userMemberB.id,
                role_id: contributorRole.id
            }
        });
    });

    after(async () => {
        await prisma.users.deleteMany({
            where: { email: { contains: "isoworkflow_" } }
        }).catch(() => {});
        await prisma.$disconnect();
    });

    // -------------------------------------------------------------
    // 1. Workspace & Project Isolation Tests
    // -------------------------------------------------------------

    test("1. Backend strictly rejects creating a task in Project L when specifying Chipmunks workspaceId", async () => {
        await assert.rejects(
            async () => {
                await makeTask(
                    projL1.id,
                    userOwner.id,
                    {
                        title: "Cross Workspace Task Leaker",
                        priority: "Medium",
                        status: "To Do"
                    },
                    wsChipmunks.id // Mismatched workspaceId!
                );
            },
            (err) => {
                assert.equal(err.statusCode, 400);
                assert.match(err.message, /Project does not belong to the specified workspace/i);
                return true;
            }
        );
    });

    test("2. Tasks created under Chipmunks project are strictly isolated to Chipmunks", async () => {
        const taskChipmunks = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Chipmunks Recording Vocals",
                priority: "High",
                status: "To Do"
            },
            wsChipmunks.id
        );

        assert.ok(taskChipmunks.id);
        assert.equal(taskChipmunks.project_id, projChipmunks1.id);

        const dbRecord = await prisma.tasks.findUnique({
            where: { id: taskChipmunks.id },
            include: { projects: true }
        });
        assert.equal(dbRecord.projects.workspace_id, wsChipmunks.id);
        assert.notEqual(dbRecord.projects.workspace_id, wsL.id);
    });

    test("3. Tasks created under L project are strictly isolated to L", async () => {
        const taskL = await makeTask(
            projL1.id,
            userOwner.id,
            {
                title: "L Project Architecture Document",
                priority: "Medium",
                status: "To Do"
            },
            wsL.id
        );

        assert.ok(taskL.id);
        assert.equal(taskL.project_id, projL1.id);

        const dbRecord = await prisma.tasks.findUnique({
            where: { id: taskL.id },
            include: { projects: true }
        });
        assert.equal(dbRecord.projects.workspace_id, wsL.id);
        assert.notEqual(dbRecord.projects.workspace_id, wsChipmunks.id);
    });

    test("4. Querying tasks by workspaceId returns only tasks for that workspace", async () => {
        const chipmunksTasks = await taskService.getMyTasks(userOwner.id, {
            workspaceId: wsChipmunks.id
        });
        const lTasks = await taskService.getMyTasks(userOwner.id, {
            workspaceId: wsL.id
        });

        assert.ok(chipmunksTasks.length >= 1);
        assert.ok(lTasks.length >= 1);

        for (const t of chipmunksTasks) {
            assert.equal(t.project_id, projChipmunks1.id);
        }

        for (const t of lTasks) {
            assert.equal(t.project_id, projL1.id);
        }
    });

    // -------------------------------------------------------------
    // 2. Hierarchical Creation Workflow Tests
    // -------------------------------------------------------------

    test("5. Hierarchical Creation: Workspace -> Project -> Task -> Subtask preserves relational integrity", async () => {
        // Step 1: Workspace
        const newWs = await prisma.workspaces.create({
            data: {
                name: "Hierarchy Test Workspace",
                owner_id: userOwner.id
            }
        });
        await prisma.workspace_members.create({
            data: {
                workspace_id: newWs.id,
                user_id: userOwner.id,
                workspace_role: "Owner"
            }
        });

        // Step 2: Project
        const newProj = await prisma.projects.create({
            data: {
                title: "Hierarchy Project",
                workspace_id: newWs.id,
                manager_id: userOwner.id,
                status: "Active",
                priority: "High"
            }
        });
        assert.equal(newProj.workspace_id, newWs.id);

        // Step 3: Task
        const newTask = await makeTask(
            newProj.id,
            userOwner.id,
            {
                title: "Hierarchy Master Task",
                priority: "High",
                status: "To Do"
            },
            newWs.id
        );
        assert.equal(newTask.project_id, newProj.id);

        // Step 4: Subtask
        const newSubtask = await makeSubtask(
            newTask.id,
            userOwner.id,
            {
                title: "Hierarchy Detail Subtask",
                status: "To Do"
            }
        );
        assert.equal(newSubtask.task_id, newTask.id);

        // Verify relational chain in database
        const loadedSubtask = await prisma.subtasks.findUnique({
            where: { id: newSubtask.id },
            include: {
                tasks: {
                    include: {
                        projects: {
                            include: {
                                workspaces: true
                            }
                        }
                    }
                }
            }
        });

        assert.equal(loadedSubtask.tasks.id, newTask.id);
        assert.equal(loadedSubtask.tasks.projects.id, newProj.id);
        assert.equal(loadedSubtask.tasks.projects.workspaces.id, newWs.id);
    });

    // -------------------------------------------------------------
    // 3. Task Visibility & Assignment Tests
    // -------------------------------------------------------------

    test("6. All project members see ALL tasks in project, including unassigned and other members' tasks", async () => {
        // Task assigned to Owner
        const taskA = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Task Assigned to Alvin",
                assignedTo: userOwner.id,
                status: "To Do"
            },
            wsChipmunks.id
        );

        // Task assigned to Member B (Simon)
        const taskB = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Task Assigned to Simon",
                assignedTo: userMemberB.id,
                status: "In Progress"
            },
            wsChipmunks.id
        );

        // Unassigned Task
        const taskUnassigned = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Unassigned Task in Chipmunks",
                assignedTo: null,
                status: "To Do"
            },
            wsChipmunks.id
        );

        assert.equal(taskUnassigned.assigned_to, null);

        // Simon (userMemberB) queries getMyTasks for projChipmunks1
        const simonTasks = await taskService.getMyTasks(userMemberB.id, {
            projectId: projChipmunks1.id
        });

        const simonTaskIds = simonTasks.map((t) => t.id);

        // Simon MUST see all three tasks!
        assert.ok(simonTaskIds.includes(taskA.id), "Simon must see task assigned to Alvin");
        assert.ok(simonTaskIds.includes(taskB.id), "Simon must see task assigned to himself");
        assert.ok(simonTaskIds.includes(taskUnassigned.id), "Simon must see unassigned task");

        // getProjectTasks for projChipmunks1 also returns all three tasks
        const projTasks = await taskService.getProjectTasks(projChipmunks1.id, userMemberB.id);
        const projTaskIds = projTasks.map((t) => t.id);
        assert.ok(projTaskIds.includes(taskA.id));
        assert.ok(projTaskIds.includes(taskB.id));
        assert.ok(projTaskIds.includes(taskUnassigned.id));
    });

    test("7. Task Assignment: Unassigned option saves null in PostgreSQL and remains visible", async () => {
        const task = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Task Initially Assigned to Simon",
                assignedTo: userMemberB.id,
                status: "To Do"
            }
        );
        assert.equal(task.assigned_to, userMemberB.id);

        // Reassign to Unassigned (null)
        const updated = await taskService.assignTask(task.id, userOwner.id, null);
        assert.equal(updated.assigned_to, null);

        // Check PostgreSQL record directly
        const dbRecord = await prisma.tasks.findUnique({
            where: { id: task.id }
        });
        assert.equal(dbRecord.assigned_to, null);

        // Verify task is still returned in getMyTasks and getProjectTasks
        const tasks = await taskService.getMyTasks(userMemberB.id, { projectId: projChipmunks1.id });
        assert.ok(tasks.some((t) => t.id === task.id));
    });

    test("8. Task Assignment: Reject assigning task to non-member of project", async () => {
        await assert.rejects(
            async () => {
                await makeTask(
                    projChipmunks1.id,
                    userOwner.id,
                    {
                        title: "Invalid Assignment Task",
                        assignedTo: userExternal.id // Not a project member
                    }
                );
            },
            (err) => {
                assert.equal(err.statusCode, 400);
                assert.match(err.message, /not a member of the project/i);
                return true;
            }
        );
    });

    // -------------------------------------------------------------
    // 4. Workspace vs Project Membership Access Isolation
    // -------------------------------------------------------------

    test("9. Workspace member without project membership is denied access to project tasks", async () => {
        // userMemberC is in wsChipmunks, but NOT in projChipmunks1
        await assert.rejects(
            async () => {
                await taskService.getProjectTasks(projChipmunks1.id, userMemberC.id);
            },
            (err) => {
                assert.equal(err.statusCode, 403);
                assert.match(err.message, /access denied/i);
                return true;
            }
        );
    });

    test("10. Add member grants project access, and removing member revokes it", async () => {
        // Add userMemberC to projChipmunks1
        await projectService.addProjectMember(
            projChipmunks1.id,
            userOwner.id,
            userMemberC.id,
            "Contributor"
        );

        // Now userMemberC CAN access project tasks
        const tasks = await taskService.getProjectTasks(projChipmunks1.id, userMemberC.id);
        assert.ok(Array.isArray(tasks.tasks));

        // Duplicate add is rejected with 409
        await assert.rejects(
            async () => {
                await projectService.addProjectMember(
                    projChipmunks1.id,
                    userOwner.id,
                    userMemberC.id,
                    "Contributor"
                );
            },
            (err) => {
                assert.equal(err.statusCode, 409);
                return true;
            }
        );

        // Remove userMemberC
        await projectService.removeProjectMember(
            projChipmunks1.id,
            userOwner.id,
            userMemberC.id
        );

        // Access is revoked again (403)
        await assert.rejects(
            async () => {
                await taskService.getProjectTasks(projChipmunks1.id, userMemberC.id);
            },
            (err) => {
                assert.equal(err.statusCode, 403);
                return true;
            }
        );
    });

    // -------------------------------------------------------------
    // 5. Archive & Restore Hierarchy Constraints
    // -------------------------------------------------------------

    test("11. Cannot create subtask on archived task", async () => {
        const task = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Task to be archived",
                status: "To Do"
            }
        );

        await taskService.archiveTask(task.id, userOwner.id);

        await assert.rejects(
            async () => {
                await makeSubtask(
                    task.id,
                    userOwner.id,
                    {
                        title: "Subtask on archived task"
                    }
                );
            },
            (err) => {
                assert.equal(err.statusCode, 400);
                assert.match(err.message, /Cannot add a subtask to an archived task/i);
                return true;
            }
        );
    });

    test("12. Cannot restore subtask if parent task is archived", async () => {
        const task = await makeTask(
            projChipmunks1.id,
            userOwner.id,
            {
                title: "Task for subtask restore test",
                status: "To Do"
            }
        );

        const subtask = await makeSubtask(
            task.id,
            userOwner.id,
            {
                title: "Subtask to archive and restore"
            }
        );

        await subtaskService.archiveSubtask(subtask.id, userOwner.id);
        await taskService.archiveTask(task.id, userOwner.id);

        await assert.rejects(
            async () => {
                await subtaskService.restoreSubtask(subtask.id, userOwner.id);
            },
            (err) => {
                assert.equal(err.statusCode, 400);
                assert.match(err.message, /Cannot restore subtask while its parent task is archived/i);
                return true;
            }
        );

        // Restore task first, then subtask restore succeeds
        await taskService.restoreTask(task.id, userOwner.id);
        const restoredSubtask = await subtaskService.restoreSubtask(subtask.id, userOwner.id);
        assert.equal(restoredSubtask.is_archived, false);
    });
});
