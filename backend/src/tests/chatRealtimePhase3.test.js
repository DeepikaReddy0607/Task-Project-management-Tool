import "dotenv/config";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import { io as Client } from "socket.io-client";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { initSocket, isUserOnline, getUserPresence } from "../socket.js";

describe("TASKFLOW CHAT: Phase 3 Socket.IO Real-Time Messaging, Presence & Typing Test Suite", () => {
    let server;
    let socketPort;
    let socketUrl;

    let userA; // Workspace 1 Owner, Project 1 Manager
    let userB; // Workspace 1 Member, Project 1 Member
    let userC; // Workspace 1 Member (NOT in Project 1)
    let userIsolated; // Workspace 2 Owner (Isolated tenant)
    let deactivatedUser;

    let tokenA;
    let tokenB;
    let tokenC;
    let tokenIsolated;
    let expiredToken;

    let workspace1;
    let workspace2;
    let project1;
    let channel1;
    let conversation1;

    // Helper to connect a socket client
    function connectSocket(token, extraOpts = {}) {
        return new Promise((resolve, reject) => {
            const socket = Client(socketUrl, {
                auth: { token },
                transports: ["websocket"],
                forceNew: true,
                reconnection: false,
                ...extraOpts,
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
                resolve(socket); // Resolve so caller can assert error
            });
        });
    }

    before(async () => {
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No roles found in database");

        // Helper to find or create test user
        async function getOrCreateUser(email, firstName, lastName, isActive = true) {
            return await prisma.users.upsert({
                where: { email },
                update: { is_active: isActive },
                create: {
                    email,
                    first_name: firstName,
                    last_name: lastName,
                    password_hash: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
                    role_id: role.id,
                    is_active: isActive,
                },
            });
        }

        userA = await getOrCreateUser("chat_rt_a@taskflow.dev", "Alice", "Realtime");
        userB = await getOrCreateUser("chat_rt_b@taskflow.dev", "Bob", "Realtime");
        userC = await getOrCreateUser("chat_rt_c@taskflow.dev", "Charlie", "Realtime");
        userIsolated = await getOrCreateUser("chat_rt_iso@taskflow.dev", "Dave", "Isolated");
        deactivatedUser = await getOrCreateUser("chat_rt_deact@taskflow.dev", "Deact", "User", false);

        const secret = process.env.JWT_SECRET || "fallback_secret";
        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "1h" });
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, secret, { expiresIn: "1h" });
        tokenC = jwt.sign({ userId: userC.id, email: userC.email }, secret, { expiresIn: "1h" });
        tokenIsolated = jwt.sign({ userId: userIsolated.id, email: userIsolated.email }, secret, { expiresIn: "1h" });
        expiredToken = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "-10s" });

        // Set up Workspace 1
        workspace1 = await prisma.workspaces.create({
            data: {
                name: `Chat RT WS 1 - ${Date.now()}`,
                owner_id: userA.id,
                workspace_members: {
                    create: [
                        { user_id: userA.id, workspace_role: "Owner" },
                        { user_id: userB.id, workspace_role: "Member" },
                        { user_id: userC.id, workspace_role: "Member" },
                    ],
                },
            },
        });

        // Set up Project 1 in Workspace 1 (UserA manager, UserB member, UserC NOT in project)
        project1 = await prisma.projects.create({
            data: {
                workspace_id: workspace1.id,
                title: `Chat RT Proj 1 - ${Date.now()}`,
                manager_id: userA.id,
                project_members: {
                    create: [{ user_id: userB.id, role_id: role.id }],
                },
            },
        });

        // Set up Workspace 2 (Isolated)
        workspace2 = await prisma.workspaces.create({
            data: {
                name: `Chat RT WS 2 - ${Date.now()}`,
                owner_id: userIsolated.id,
                workspace_members: {
                    create: [{ user_id: userIsolated.id, workspace_role: "Owner" }],
                },
            },
        });

        // Set up test channel in Workspace 1
        channel1 = await prisma.channels.create({
            data: {
                workspace_id: workspace1.id,
                name: "rt-general",
                type: "PUBLIC",
                created_by: userA.id,
                channel_members: {
                    create: [
                        { user_id: userA.id, role: "OWNER" },
                        { user_id: userB.id, role: "MEMBER" },
                    ],
                },
            },
        });

        // Set up direct conversation between UserA and UserB
        const dmSig = [userA.id, userB.id].sort().join(":");
        conversation1 = await prisma.conversations.create({
            data: {
                workspace_id: workspace1.id,
                type: "DIRECT",
                dm_signature: dmSig,
                created_by: userA.id,
                conversation_members: {
                    create: [
                        { user_id: userA.id, role: "MEMBER" },
                        { user_id: userB.id, role: "MEMBER" },
                    ],
                },
            },
        });

        // Start HTTP & Socket server
        server = http.createServer(app);
        initSocket(server);
        await new Promise((resolve) => server.listen(0, resolve));
        socketPort = server.address().port;
        socketUrl = `http://127.0.0.1:${socketPort}`;
    });

    after(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));

        if (workspace1) {
            await prisma.workspaces.delete({ where: { id: workspace1.id } }).catch(() => {});
        }
        if (workspace2) {
            await prisma.workspaces.delete({ where: { id: workspace2.id } }).catch(() => {});
        }

        await prisma.users.deleteMany({
            where: {
                email: {
                    in: [
                        "chat_rt_a@taskflow.dev",
                        "chat_rt_b@taskflow.dev",
                        "chat_rt_c@taskflow.dev",
                        "chat_rt_iso@taskflow.dev",
                        "chat_rt_deact@taskflow.dev",
                    ],
                },
            },
        }).catch(() => {});

        await prisma.$disconnect();
    });

    describe("1. Socket.IO Authentication & Connection Security", () => {
        test("should successfully connect with valid JWT token", async () => {
            const socket = await connectSocket(tokenA);
            assert.strictEqual(socket.connected, true);
            socket.close();
        });

        test("should reject connection when token is missing", async () => {
            const socket = await connectSocket(null);
            assert.strictEqual(socket.connected, false);
            socket.close();
        });

        test("should reject connection with invalid token signature", async () => {
            const socket = await connectSocket("invalid.bogus.token");
            assert.strictEqual(socket.connected, false);
            socket.close();
        });

        test("should reject connection with expired token", async () => {
            const socket = await connectSocket(expiredToken);
            assert.strictEqual(socket.connected, false);
            socket.close();
        });

        test("should reject connection for inactive or deactivated user", async () => {
            const deactivatedToken = jwt.sign(
                { userId: deactivatedUser.id, email: deactivatedUser.email },
                process.env.JWT_SECRET || "fallback_secret",
                { expiresIn: "1h" }
            );
            const socket = await connectSocket(deactivatedToken);
            assert.strictEqual(socket.connected, false);
            socket.close();
        });
    });

    describe("2. Dynamic Room Joining & Authorization", () => {
        let socketA;
        let socketC;
        let socketIso;

        before(async () => {
            socketA = await connectSocket(tokenA);
            socketC = await connectSocket(tokenC);
            socketIso = await connectSocket(tokenIsolated);
        });

        after(() => {
            if (socketA) socketA.close();
            if (socketC) socketC.close();
            if (socketIso) socketIso.close();
        });

        test("authorized user can join channel room", async () => {
            const ack = await new Promise((resolve) => {
                socketA.emit("chat:join_channel", { channelId: channel1.id }, resolve);
            });

            assert.strictEqual(ack.success, true);
            assert.strictEqual(ack.channelId, channel1.id);
        });

        test("cross-workspace user is strictly rejected when attempting to join channel", async () => {
            const ack = await new Promise((resolve) => {
                socketIso.emit("chat:join_channel", { channelId: channel1.id }, resolve);
            });

            assert.strictEqual(ack.success, false);
            assert.ok(ack.message.includes("Workspace access denied"));
        });

        test("non-project member is rejected from joining project-scoped channel", async () => {
            // Create project channel for project 1
            const projChan = await prisma.channels.create({
                data: {
                    workspace_id: workspace1.id,
                    project_id: project1.id,
                    name: "proj1-secret-planning",
                    created_by: userA.id,
                },
            });

            // UserC (in workspace 1, but NOT in project 1) tries to join
            const ack = await new Promise((resolve) => {
                socketC.emit("chat:join_channel", { channelId: projChan.id }, resolve);
            });

            assert.strictEqual(ack.success, false);
            assert.ok(ack.message.includes("Project access denied"));
        });

        test("conversation member can join direct conversation room", async () => {
            const ack = await new Promise((resolve) => {
                socketA.emit("chat:join_conversation", { conversationId: conversation1.id }, resolve);
            });

            assert.strictEqual(ack.success, true);
            assert.strictEqual(ack.conversationId, conversation1.id);
        });

        test("non-member is rejected from joining direct conversation room", async () => {
            // UserC tries to join DM between UserA and UserB
            const ack = await new Promise((resolve) => {
                socketC.emit("chat:join_conversation", { conversationId: conversation1.id }, resolve);
            });

            assert.strictEqual(ack.success, false);
            assert.ok(ack.message.includes("You are not a member of this conversation"));
        });
    });

    describe("3. Real-Time Message Flow & Persistence", () => {
        let socketA;
        let socketB;

        before(async () => {
            socketA = await connectSocket(tokenA);
            socketB = await connectSocket(tokenB);

            // Both join channel1
            await new Promise((resolve) => socketA.emit("chat:join_channel", { channelId: channel1.id }, resolve));
            await new Promise((resolve) => socketB.emit("chat:join_channel", { channelId: channel1.id }, resolve));
        });

        after(() => {
            if (socketA) socketA.close();
            if (socketB) socketB.close();
        });

        test("sending message via socket persists in database and broadcasts chat:message_created", async () => {
            const messagePromise = new Promise((resolve) => {
                socketB.once("chat:message_created", (msg) => {
                    resolve(msg);
                });
            });

            const ack = await new Promise((resolve) => {
                socketA.emit(
                    "chat:send_message",
                    {
                        channelId: channel1.id,
                        content: "Realtime hello from Alice via Socket!",
                        messageType: "TEXT",
                    },
                    resolve
                );
            });

            assert.strictEqual(ack.success, true);
            assert.ok(ack.message.id);
            assert.strictEqual(ack.message.content, "Realtime hello from Alice via Socket!");

            // Verify UserB received the broadcast
            const broadcastMsg = await messagePromise;
            assert.strictEqual(broadcastMsg.id, ack.message.id);
            assert.strictEqual(broadcastMsg.content, "Realtime hello from Alice via Socket!");
            assert.strictEqual(broadcastMsg.sender_id, userA.id);

            // Verify message is persisted in PostgreSQL
            const inDb = await prisma.messages.findUnique({ where: { id: ack.message.id } });
            assert.ok(inDb);
            assert.strictEqual(inDb.content, "Realtime hello from Alice via Socket!");
        });

        test("sending message via REST API broadcasts chat:message_created to socket room members", async () => {
            const messagePromise = new Promise((resolve) => {
                socketB.once("chat:message_created", (msg) => {
                    resolve(msg);
                });
            });

            // Post via REST API
            const res = await fetch(`${socketUrl}/api/chat/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${tokenA}`,
                },
                body: JSON.stringify({
                    channelId: channel1.id,
                    content: "Message sent via REST API, broadcast to Socket!",
                }),
            });

            const body = await res.json();
            assert.strictEqual(res.status, 201);
            assert.strictEqual(body.success, true);

            // UserB should receive real-time socket event
            const broadcastMsg = await messagePromise;
            assert.strictEqual(broadcastMsg.id, body.message.id);
            assert.strictEqual(broadcastMsg.content, "Message sent via REST API, broadcast to Socket!");
        });
    });

    describe("4. Typing Indicators & Ephemeral State", () => {
        let socketA;
        let socketB;

        before(async () => {
            socketA = await connectSocket(tokenA);
            socketB = await connectSocket(tokenB);

            await new Promise((resolve) => socketA.emit("chat:join_channel", { channelId: channel1.id }, resolve));
            await new Promise((resolve) => socketB.emit("chat:join_channel", { channelId: channel1.id }, resolve));
        });

        after(() => {
            if (socketA) socketA.close();
            if (socketB) socketB.close();
        });

        test("chat:typing_started is broadcast to room members without reflecting to sender", async () => {
            let senderReceived = false;
            socketA.once("chat:typing_started", () => {
                senderReceived = true;
            });

            const typingPromise = new Promise((resolve) => {
                socketB.once("chat:typing_started", (event) => {
                    resolve(event);
                });
            });

            socketA.emit("chat:typing_started", { channelId: channel1.id });

            const received = await typingPromise;
            assert.strictEqual(received.userId, userA.id);
            assert.strictEqual(received.channelId, channel1.id);
            assert.ok(received.timestamp);
            assert.strictEqual(senderReceived, false); // Sender does not see self typing
        });

        test("chat:typing_stopped is broadcast to room members", async () => {
            const stoppedPromise = new Promise((resolve) => {
                socketB.once("chat:typing_stopped", (event) => {
                    resolve(event);
                });
            });

            socketA.emit("chat:typing_stopped", { channelId: channel1.id });

            const received = await stoppedPromise;
            assert.strictEqual(received.userId, userA.id);
            assert.strictEqual(received.channelId, channel1.id);
        });
    });

    describe("5. Read Receipts", () => {
        let socketA;
        let socketB;
        let testMsgId;

        before(async () => {
            socketA = await connectSocket(tokenA);
            socketB = await connectSocket(tokenB);

            await new Promise((resolve) => socketA.emit("chat:join_channel", { channelId: channel1.id }, resolve));
            await new Promise((resolve) => socketB.emit("chat:join_channel", { channelId: channel1.id }, resolve));

            // Create test message from UserA
            const msg = await prisma.messages.create({
                data: {
                    channel_id: channel1.id,
                    sender_id: userA.id,
                    content: "Message to be read by UserB",
                },
            });
            testMsgId = msg.id;
        });

        after(() => {
            if (socketA) socketA.close();
            if (socketB) socketB.close();
        });

        test("emitting chat:read_receipt persists in database and broadcasts to room", async () => {
            const receiptPromise = new Promise((resolve) => {
                socketA.once("chat:read_receipt", (receipt) => {
                    resolve(receipt);
                });
            });

            const ack = await new Promise((resolve) => {
                socketB.emit("chat:read_receipt", { messageId: testMsgId }, resolve);
            });

            assert.strictEqual(ack.success, true);
            assert.strictEqual(ack.receipt.messageId, testMsgId);
            assert.strictEqual(ack.receipt.userId, userB.id);

            // Verify UserA received the broadcast
            const broadcastReceipt = await receiptPromise;
            assert.strictEqual(broadcastReceipt.messageId, testMsgId);
            assert.strictEqual(broadcastReceipt.userId, userB.id);

            // Verify persisted in PostgreSQL
            const inDb = await prisma.message_read_receipts.findUnique({
                where: {
                    message_id_user_id: {
                        message_id: testMsgId,
                        user_id: userB.id,
                    },
                },
            });
            assert.ok(inDb);
            assert.strictEqual(inDb.user_id, userB.id);
        });
    });

    describe("6. Online Presence & Multi-Socket Tabs", () => {
        let socketObserver;

        before(async () => {
            socketObserver = await connectSocket(tokenB);
        });

        after(() => {
            if (socketObserver) socketObserver.close();
        });

        test("connecting socket marks user online and broadcasts chat:presence_updated", async () => {
            const presencePromise = new Promise((resolve) => {
                socketObserver.once("chat:presence_updated", (event) => {
                    if (event.userId === userA.id) resolve(event);
                });
            });

            const socketA1 = await connectSocket(tokenA);
            assert.strictEqual(isUserOnline(userA.id), true);

            const presenceEvent = await presencePromise;
            assert.strictEqual(presenceEvent.userId, userA.id);
            assert.strictEqual(presenceEvent.status, "online");

            socketA1.close();
        });

        test("multi-tab presence: user remains online while another socket tab is active", async () => {
            // Tab 1 connects
            const tab1 = await connectSocket(tokenA);
            assert.strictEqual(isUserOnline(userA.id), true);

            // Tab 2 connects
            const tab2 = await connectSocket(tokenA);
            assert.strictEqual(isUserOnline(userA.id), true);

            let offlineEmitted = false;
            socketObserver.on("chat:presence_updated", (e) => {
                if (e.userId === userA.id && e.status === "offline") {
                    offlineEmitted = true;
                }
            });

            // Tab 1 closes
            tab1.close();
            await new Promise((r) => setTimeout(r, 100));

            // User should STILL be online because tab 2 is open!
            assert.strictEqual(isUserOnline(userA.id), true);
            assert.strictEqual(offlineEmitted, false);

            // Tab 2 closes -> now user transitions to offline
            const offlinePromise = new Promise((resolve) => {
                socketObserver.once("chat:presence_updated", (e) => {
                    if (e.userId === userA.id && e.status === "offline") resolve(e);
                });
            });

            tab2.close();
            const finalOfflineEvent = await offlinePromise;
            assert.strictEqual(finalOfflineEvent.status, "offline");
            assert.strictEqual(isUserOnline(userA.id), false);
        });

        test("chat:get_presence returns accurate status for requested users", async () => {
            const socketA = await connectSocket(tokenA);

            const ack = await new Promise((resolve) => {
                socketObserver.emit("chat:get_presence", { userIds: [userA.id, userC.id] }, resolve);
            });

            assert.strictEqual(ack.success, true);
            assert.strictEqual(ack.presence[userA.id].status, "online");
            assert.strictEqual(ack.presence[userC.id].status, "offline");

            socketA.close();
        });
    });

    describe("7. Message Modification & Deletion Real-Time Sync", () => {
        let socketA;
        let socketB;
        let testMsgId;

        before(async () => {
            socketA = await connectSocket(tokenA);
            socketB = await connectSocket(tokenB);

            await new Promise((resolve) => socketA.emit("chat:join_channel", { channelId: channel1.id }, resolve));
            await new Promise((resolve) => socketB.emit("chat:join_channel", { channelId: channel1.id }, resolve));

            const msg = await prisma.messages.create({
                data: {
                    channel_id: channel1.id,
                    sender_id: userA.id,
                    content: "Message before modification",
                },
            });
            testMsgId = msg.id;
        });

        after(() => {
            if (socketA) socketA.close();
            if (socketB) socketB.close();
        });

        test("editing message via REST emits chat:message_updated to room", async () => {
            const updatePromise = new Promise((resolve) => {
                socketB.once("chat:message_updated", (msg) => {
                    resolve(msg);
                });
            });

            await fetch(`${socketUrl}/api/chat/messages/${testMsgId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${tokenA}`,
                },
                body: JSON.stringify({ content: "Message after real-time modification" }),
            });

            const received = await updatePromise;
            assert.strictEqual(received.id, testMsgId);
            assert.strictEqual(received.content, "Message after real-time modification");
            assert.strictEqual(received.is_edited, true);
        });

        test("deleting message via REST emits chat:message_deleted to room", async () => {
            const deletePromise = new Promise((resolve) => {
                socketB.once("chat:message_deleted", (info) => {
                    resolve(info);
                });
            });

            await fetch(`${socketUrl}/api/chat/messages/${testMsgId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${tokenA}`,
                },
            });

            const received = await deletePromise;
            assert.strictEqual(received.messageId, testMsgId);
            assert.strictEqual(received.channelId, channel1.id);
        });
    });
});
