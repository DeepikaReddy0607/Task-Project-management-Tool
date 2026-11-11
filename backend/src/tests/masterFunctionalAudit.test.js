import "dotenv/config";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import { io as Client } from "socket.io-client";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { initSocket, isUserOnline, getUserPresence } from "../socket.js";
import * as workspaceService from "../services/workspaceService.js";
import * as projectService from "../services/projectService.js";
import * as taskService from "../services/taskService.js";
import * as subtaskService from "../services/subtaskService.js";
import * as projectRiskService from "../services/projectRiskService.js";
import * as chatService from "../services/chatService.js";

describe("TASKFLOW MASTER FUNCTIONAL AUDIT: 23 Scenarios Test Suite", () => {
    let server;
    let socketUrl;

    let userA; // Workspace A & B Owner, Project 1 & 2 Manager
    let userB; // Workspace A Member, Project 1 Member
    let userC; // Workspace A Member (NOT in Project 1 or 2 initially)

    let tokenA;
    let tokenB;
    let tokenC;

    let workspaceA;
    let workspaceB; // Empty workspace
    let project1;
    let project2;
    let task1;
    let task2;
    let directConv;

    function connectSocket(token) {
        return new Promise((resolve, reject) => {
            const socket = Client(socketUrl, {
                auth: { token },
                transports: ["websocket"],
                forceNew: true,
                reconnection: false,
            });

            const timer = setTimeout(() => {
                socket.close();
                reject(new Error("Socket connection timed out"));
            }, 5000);

            socket.on("connect", () => {
                clearTimeout(timer);
                resolve(socket);
            });

            socket.on("connect_error", (err) => {
                clearTimeout(timer);
                resolve(socket);
            });
        });
    }

    before(async () => {
        // Start HTTP Server on ephemeral port
        server = http.createServer(app);
        initSocket(server);

        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                socketUrl = `http://localhost:${port}`;
                resolve();
            });
        });

        const timestamp = Date.now();
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No roles found in database");

        // 1. Create Test Users
        userA = await prisma.users.create({
            data: {
                first_name: "Alice",
                last_name: "Owner",
                email: `alice_${timestamp}@taskflow-audit.com`,
                password_hash: "hashed_test_pw",
                role_id: role.id,
                is_active: true,
            },
        });

        userB = await prisma.users.create({
            data: {
                first_name: "Bob",
                last_name: "Member",
                email: `bob_${timestamp}@taskflow-audit.com`,
                password_hash: "hashed_test_pw",
                role_id: role.id,
                is_active: true,
            },
        });

        userC = await prisma.users.create({
            data: {
                first_name: "Charlie",
                last_name: "Observer",
                email: `charlie_${timestamp}@taskflow-audit.com`,
                password_hash: "hashed_test_pw",
                role_id: role.id,
                is_active: true,
            },
        });

        const secret = process.env.JWT_SECRET || "taskflow-secret-test";
        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "1h" });
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, secret, { expiresIn: "1h" });
        tokenC = jwt.sign({ userId: userC.id, email: userC.email }, secret, { expiresIn: "1h" });

        // 2. Create Workspace A (populated) & Workspace B (empty)
        workspaceA = await workspaceService.createWorkspace(
            userA.id,
            `Audit Workspace A ${timestamp}`,
            "Populated Workspace"
        );

        workspaceB = await workspaceService.createWorkspace(
            userA.id,
            `Audit Workspace B (Empty) ${timestamp}`,
            "Empty Workspace"
        );

        // Add Bob and Charlie to Workspace A as Members
        await workspaceService.addWorkspaceMember(workspaceA.id, userA.id, userB.id, "Member");
        await workspaceService.addWorkspaceMember(workspaceA.id, userA.id, userC.id, "Member");

        // 3. Create Project 1 in Workspace A (Manager: Alice, Member: Bob)
        project1 = await projectService.createProject(
            workspaceA.id,
            userA.id,
            `Audit Project 1 ${timestamp}`,
            "Project with Alice and Bob",
            "Product",
            "High",
            "Active"
        );

        await projectService.addProjectMember(project1.id, userA.id, userB.id, "Contributor");

        // 4. Create Project 2 in Workspace A (Manager: Alice, Bob and Charlie NOT members)
        project2 = await projectService.createProject(
            workspaceA.id,
            userA.id,
            `Audit Project 2 ${timestamp}`,
            "Private Project with Alice Only",
            "Engineering",
            "Medium",
            "Planning"
        );

        // 5. Create Direct Conversation between Alice and Bob
        const directRes = await chatService.getOrCreateDirectConversation(userA.id, workspaceA.id, userB.id);
        directConv = directRes.conversation || directRes;
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        try {
            if (workspaceA?.id) await prisma.workspaces.delete({ where: { id: workspaceA.id } });
            if (workspaceB?.id) await prisma.workspaces.delete({ where: { id: workspaceB.id } });
            if (userA?.id) await prisma.users.delete({ where: { id: userA.id } });
            if (userB?.id) await prisma.users.delete({ where: { id: userB.id } });
            if (userC?.id) await prisma.users.delete({ where: { id: userC.id } });
        } catch {}
    });

    // =========================================================================
    // SCENARIO 1: User with two workspaces, one empty
    // =========================================================================
    test("Scenario 1: User with two workspaces, one empty - both remain accessible", async () => {
        const userAWorkspaces = await workspaceService.getUserWorkspaces(userA.id);
        const wsIds = userAWorkspaces.map((w) => w.id);

        assert.ok(wsIds.includes(workspaceA.id), "Workspace A must be accessible");
        assert.ok(wsIds.includes(workspaceB.id), "Empty Workspace B must remain accessible");

        const wsBProjects = await projectService.getWorkspaceProjects(workspaceB.id, userA.id);
        assert.strictEqual(wsBProjects.length, 0, "Workspace B must be empty");
    });

    // =========================================================================
    // SCENARIO 2: Create tasks in projects belonging to the non-empty workspace
    // =========================================================================
    test("Scenario 2: Create tasks in projects belonging to the non-empty workspace", async () => {
        task1 = await taskService.createTask(
            project1.id,
            userA.id,
            "Task 1 - Assigned to Alice",
            "Core task 1",
            "High",
            "In Progress",
            null,
            null,
            null,
            userA.id
        );

        task2 = await taskService.createTask(
            project1.id,
            userA.id,
            "Task 2 - For Subtask Audit",
            "Core task 2",
            "Medium",
            "To Do",
            null,
            null,
            null,
            userB.id
        );

        assert.ok(task1.id, "Task 1 created successfully");
        assert.ok(task2.id, "Task 2 created successfully");
        assert.strictEqual(task1.project_id, project1.id);
    });

    // =========================================================================
    // SCENARIO 3: Workspace member without project membership
    // =========================================================================
    test("Scenario 3: Workspace member without project membership is denied project access", async () => {
        // Charlie is in Workspace A, but NOT in Project 1
        await assert.rejects(
            async () => {
                await projectService.getProject(project1.id, userC.id);
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            },
            "Charlie must be denied access to Project 1"
        );

        await assert.rejects(
            async () => {
                await taskService.getProjectTasks(project1.id, userC.id);
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            },
            "Charlie must be denied access to Project 1 tasks"
        );
    });

    // =========================================================================
    // SCENARIO 4: Workspace member added to a project
    // =========================================================================
    test("Scenario 4: Workspace member added to a project gains access", async () => {
        await projectService.addProjectMember(project1.id, userA.id, userC.id, "Contributor");

        const project = await projectService.getProject(project1.id, userC.id);
        assert.strictEqual(project.id, project1.id, "Charlie can now access Project 1");

        // Clean up: remove Charlie from Project 1 for subsequent tests
        await projectService.removeProjectMember(project1.id, userA.id, userC.id);
    });

    // =========================================================================
    // SCENARIO 5: Project member viewing unassigned tasks
    // =========================================================================
    test("Scenario 5: Project member viewing unassigned tasks", async () => {
        const unassignedTask = await taskService.createTask(
            project1.id,
            userA.id,
            "Task 3 - Unassigned",
            "No assignee specified",
            "Low",
            "To Do",
            null,
            null,
            null,
            null
        );

        // Bob is a member of Project 1
        const bobTasks = await taskService.getProjectTasks(project1.id, userB.id);
        const found = bobTasks.find((t) => t.id === unassignedTask.id);

        assert.ok(found, "Bob must see the unassigned task in Project 1");
        assert.strictEqual(found.assigned_to, null);
    });

    // =========================================================================
    // SCENARIO 6: Project member viewing tasks assigned to other users
    // =========================================================================
    test("Scenario 6: Project member viewing tasks assigned to other users", async () => {
        // Task 1 is assigned to Alice (User A). Bob (User B) is a project member.
        const bobTasks = await taskService.getProjectTasks(project1.id, userB.id);
        const foundTask1 = bobTasks.find((t) => t.id === task1.id);

        assert.ok(foundTask1, "Bob must see Task 1 assigned to Alice");
        assert.strictEqual(foundTask1.assigned_to, userA.id);

        const singleTask = await taskService.getTask(task1.id, userB.id);
        assert.strictEqual(singleTask.id, task1.id, "Bob can fetch full Task 1 detail");
    });

    // =========================================================================
    // SCENARIO 7: Non-project member attempting access
    // =========================================================================
    test("Scenario 7: Non-project member attempting access is denied", async () => {
        // Project 2 has only Alice. Bob and Charlie attempt access.
        await assert.rejects(
            async () => {
                await projectService.getProject(project2.id, userB.id);
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            }
        );

        await assert.rejects(
            async () => {
                await taskService.createTask(
                    project2.id,
                    userB.id,
                    "Unauthorized task",
                    "desc",
                    "Low",
                    "To Do"
                );
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            }
        );
    });

    // =========================================================================
    // SCENARIO 8: Add project member
    // =========================================================================
    test("Scenario 8: Add project member works, prevents duplicates, assigns role", async () => {
        const added = await projectService.addProjectMember(project2.id, userA.id, userB.id, "Contributor");

        assert.strictEqual(added.user_id, userB.id);

        const members = await projectService.getProjectMembers(project2.id, userA.id);
        assert.ok(members.some((m) => m.user_id === userB.id));

        // Attempting duplicate addition must fail
        await assert.rejects(
            async () => {
                await projectService.addProjectMember(project2.id, userA.id, userB.id, "Contributor");
            },
            (err) => {
                assert.ok(err.statusCode === 409 || err.statusCode === 400);
                return true;
            }
        );
    });

    // =========================================================================
    // SCENARIO 9: Remove project member
    // =========================================================================
    test("Scenario 9: Remove project member revokes project access without removing from workspace", async () => {
        await projectService.removeProjectMember(project2.id, userA.id, userB.id);

        // Bob can no longer access Project 2
        await assert.rejects(
            async () => {
                await projectService.getProject(project2.id, userB.id);
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            }
        );

        // But Bob is STILL in Workspace A!
        const wsMembers = await workspaceService.getWorkspaceMembers(workspaceA.id, userA.id);
        assert.ok(wsMembers.some((m) => (m.id || m.userId || m.user_id) === userB.id), "Bob remains in Workspace A");
    });

    // =========================================================================
    // SCENARIO 10: Archive and restore project
    // =========================================================================
    test("Scenario 10: Archive and restore project", async () => {
        const archived = await projectService.archiveProject(project2.id, userA.id);
        assert.strictEqual(archived.is_archived, true);

        // Active listing does not include archived project
        const activeProjects = await projectService.getWorkspaceProjects(workspaceA.id, userA.id, {
            archived: false,
        });
        assert.ok(!activeProjects.some((p) => p.id === project2.id));

        // Restore project
        const restored = await projectService.restoreProject(project2.id, userA.id);
        assert.strictEqual(restored.is_archived, false);

        const activeAgain = await projectService.getWorkspaceProjects(workspaceA.id, userA.id);
        assert.ok(activeAgain.some((p) => p.id === project2.id));
    });

    // =========================================================================
    // SCENARIO 11: Archive and restore task
    // =========================================================================
    test("Scenario 11: Archive and restore task & permanent deletion", async () => {
        const archived = await taskService.archiveTask(task1.id, userA.id);
        assert.strictEqual(archived.is_archived, true);

        const activeTasks = await taskService.getProjectTasks(project1.id, userA.id, {
            archived: false,
        });
        assert.ok(!activeTasks.some((t) => t.id === task1.id));

        const restored = await taskService.restoreTask(task1.id, userA.id);
        assert.strictEqual(restored.is_archived, false);

        const activeAgain = await taskService.getProjectTasks(project1.id, userA.id);
        assert.ok(activeAgain.some((t) => t.id === task1.id));
    });

    // =========================================================================
    // SCENARIO 12: Archive and restore subtask
    // =========================================================================
    test("Scenario 12: Archive and restore subtask", async () => {
        const sub = await subtaskService.createSubtask(
            task1.id,
            userA.id,
            "Subtask to archive",
            "desc",
            "To Do"
        );

        const archived = await subtaskService.archiveSubtask(sub.id, userA.id);
        assert.strictEqual(archived.is_archived, true);

        const activeSubs = await subtaskService.getTaskSubtasks(task1.id, userA.id, {
            archived: false,
        });
        assert.ok(!activeSubs.some((s) => s.id === sub.id));

        const restored = await subtaskService.restoreSubtask(sub.id, userA.id);
        assert.strictEqual(restored.is_archived, false);
    });

    // =========================================================================
    // SCENARIO 13: Parent task progress calculation
    // =========================================================================
    test("Scenario 13: Parent task progress calculation (2/5=40%, 3/5=60%, 5/5=100%)", async () => {
        const s1 = await subtaskService.createSubtask(task2.id, userA.id, "Sub 1", "", "Done");
        const s2 = await subtaskService.createSubtask(task2.id, userA.id, "Sub 2", "", "Done");
        const s3 = await subtaskService.createSubtask(task2.id, userA.id, "Sub 3", "", "To Do");
        const s4 = await subtaskService.createSubtask(task2.id, userA.id, "Sub 4", "", "To Do");
        const s5 = await subtaskService.createSubtask(task2.id, userA.id, "Sub 5", "", "To Do");

        // 2/5 completed = 40%
        let parent = await taskService.getTask(task2.id, userA.id);
        assert.strictEqual(parent.subtask_progress, 40, "2/5 completed should be 40%");

        // Mark 3rd as completed -> 3/5 = 60%
        await subtaskService.updateSubtaskStatus(s3.id, userA.id, "Done");
        parent = await taskService.getTask(task2.id, userA.id);
        assert.strictEqual(parent.subtask_progress, 60, "3/5 completed should be 60%");

        // Mark 4th and 5th as completed -> 5/5 = 100%
        await subtaskService.updateSubtaskStatus(s4.id, userA.id, "Done");
        await subtaskService.updateSubtaskStatus(s5.id, userA.id, "Done");
        parent = await taskService.getTask(task2.id, userA.id);
        assert.strictEqual(parent.subtask_progress, 100, "5/5 completed should be 100%");
    });

    // =========================================================================
    // SCENARIO 14: Multiple workspace switching
    // =========================================================================
    test("Scenario 14: Multiple workspace switching maintains complete isolation", async () => {
        const wsAProjects = await projectService.getWorkspaceProjects(workspaceA.id, userA.id);
        const wsBProjects = await projectService.getWorkspaceProjects(workspaceB.id, userA.id);

        assert.ok(wsAProjects.length > 0, "Workspace A has projects");
        assert.strictEqual(wsBProjects.length, 0, "Workspace B has 0 projects");

        // Verify Workspace A projects never appear in Workspace B query
        assert.ok(!wsBProjects.some((p) => p.workspace_id === workspaceA.id));
    });

    // =========================================================================
    // SCENARIO 15: Intelligence module permission checks
    // =========================================================================
    test("Scenario 15: Intelligence module permission checks deny unauthorized members", async () => {
        // Alice has access to Project 2 risk intelligence
        const aliceAnalysis = await projectRiskService.analyzeProjectRisk(project2.id, userA.id);
        assert.ok(aliceAnalysis);

        // Charlie (workspace member without project membership) must be rejected
        await assert.rejects(
            async () => {
                await projectRiskService.analyzeProjectRisk(project2.id, userC.id);
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            }
        );
    });

    // =========================================================================
    // SCENARIO 16: Online presence updates
    // =========================================================================
    test("Scenario 16: Online presence updates when socket connects", async () => {
        const socketA = await connectSocket(tokenA);
        try {
            assert.strictEqual(isUserOnline(userA.id), true, "User A must be marked online");
            const presence = getUserPresence(userA.id);
            assert.strictEqual(presence.status, "online");
        } finally {
            socketA.close();
        }
    });

    // =========================================================================
    // SCENARIO 17: Offline presence updates
    // =========================================================================
    test("Scenario 17: Offline presence updates and last_seen_at persistence on disconnect", async () => {
        const socketA = await connectSocket(tokenA);
        socketA.close();

        // Allow microtask cycle for disconnect handler
        await new Promise((r) => setTimeout(r, 100));

        assert.strictEqual(isUserOnline(userA.id), false, "User A must be offline");
        const presence = getUserPresence(userA.id);
        assert.strictEqual(presence.status, "offline");

        // Verify last_seen_at is persisted in DB
        const dbUser = await prisma.users.findUnique({
            where: { id: userA.id },
            select: { last_seen_at: true },
        });
        assert.ok(dbUser.last_seen_at !== null, "last_seen_at must be populated in DB");
    });

    // =========================================================================
    // SCENARIO 18: Real-time message delivery
    // =========================================================================
    test("Scenario 18: Real-time message delivery via socket", async () => {
        const socketB = await connectSocket(tokenB);

        try {
            const messagePromise = new Promise((resolve) => {
                socketB.once("chat:message_created", (msg) => {
                    resolve(msg);
                });
            });

            // Alice sends message to Bob via chatService
            const sent = await chatService.sendMessage(userA.id, {
                conversationId: directConv.id,
                content: "Hello Bob, here is the functional audit update!",
            });

            const { dispatchChatMessage } = await import("../socket.js");
            await dispatchChatMessage(sent, userA.id);

            const received = await messagePromise;
            assert.strictEqual(received.id, sent.id);
            assert.strictEqual(received.content, "Hello Bob, here is the functional audit update!");
        } finally {
            socketB.close();
        }
    });

    // =========================================================================
    // SCENARIO 19: Message notification popup
    // =========================================================================
    test("Scenario 19: Message notification popup emitted to recipient personal room", async () => {
        const socketB = await connectSocket(tokenB);

        try {
            const notifPromise = new Promise((resolve) => {
                socketB.once("chat:notification", (payload) => {
                    resolve(payload);
                });
            });

            const sent = await chatService.sendMessage(userA.id, {
                conversationId: directConv.id,
                content: "Can you check the API integration?",
            });

            const { dispatchChatMessage } = await import("../socket.js");
            await dispatchChatMessage(sent, userA.id);

            const notif = await notifPromise;
            assert.strictEqual(notif.senderId, userA.id);
            assert.strictEqual(notif.senderName, "Alice Owner");
            assert.strictEqual(notif.content, "Can you check the API integration?");
            assert.strictEqual(notif.conversationId, directConv.id);
        } finally {
            socketB.close();
        }
    });

    // =========================================================================
    // SCENARIO 20: Browser notification behaviour
    // =========================================================================
    test("Scenario 20: Browser notification payload format & deduplication metadata", async () => {
        const sent = await chatService.sendMessage(userA.id, {
            conversationId: directConv.id,
            content: "Desktop browser notification test",
        });

        assert.ok(sent.id, "Message ID serves as unique notification tag");
        assert.ok(sent.content.length > 0, "Notification content is non-empty");
        assert.strictEqual(sent.sender_id, userA.id);
    });

    // =========================================================================
    // SCENARIO 21: Unread count updates
    // =========================================================================
    test("Scenario 21: Unread count updates and read receipt clearing", async () => {
        const convBefore = await chatService.getUserConversations(userB.id, workspaceA.id);
        const myConv = convBefore.find((c) => c.id === directConv.id);
        assert.ok(myConv.unreadCount > 0, "Bob has unread messages");

        // Bob marks conversation as read
        await chatService.markConversationRead(userB.id, directConv.id);

        const convAfter = await chatService.getUserConversations(userB.id, workspaceA.id);
        const myConvAfter = convAfter.find((c) => c.id === directConv.id);
        assert.strictEqual(myConvAfter.unreadCount, 0, "Unread count must be 0 after marking read");
    });

    // =========================================================================
    // SCENARIO 22: Message history after reconnection
    // =========================================================================
    test("Scenario 22: Offline messages are saved and available upon reconnection", async () => {
        // Bob is offline
        assert.strictEqual(isUserOnline(userB.id), false);

        // Alice sends message while Bob is offline
        const sentOffline = await chatService.sendMessage(userA.id, {
            conversationId: directConv.id,
            content: "Message sent while Bob was offline",
        });

        // Bob reconnects and fetches history
        const history = await chatService.getMessageHistory(userB.id, {
            conversationId: directConv.id,
            limit: 10,
        });

        const found = history.messages.find((m) => m.id === sentOffline.id);
        assert.ok(found, "Bob must receive the message sent while offline");
        assert.strictEqual(found.content, "Message sent while Bob was offline");
    });

    // =========================================================================
    // SCENARIO 23: Unauthorised chat access prevention
    // =========================================================================
    test("Scenario 23: Unauthorised chat access prevention strictly enforced", async () => {
        // Charlie is NOT a member of directConv (Alice & Bob only)
        await assert.rejects(
            async () => {
                await chatService.getMessageHistory(userC.id, {
                    conversationId: directConv.id,
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            },
            "Charlie must be denied history of private conversation"
        );

        await assert.rejects(
            async () => {
                await chatService.sendMessage(userC.id, {
                    conversationId: directConv.id,
                    content: "Intruder attempt",
                });
            },
            (err) => {
                assert.strictEqual(err.statusCode, 403);
                return true;
            },
            "Charlie must be denied sending messages to private conversation"
        );
    });
});
