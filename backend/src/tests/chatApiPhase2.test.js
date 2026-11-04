import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../app.js";
import prisma from "../config/prisma.js";

describe("TASKFLOW CHAT: Phase 2 Backend APIs, Conversation Management & Authorization Test Suite", () => {
    let server;
    let baseUrl;
    let userA; // Workspace 1 Owner, Project 1 Manager
    let userB; // Workspace 1 Member, Project 1 Member
    let userC; // Workspace 1 Member (NOT in Project 1)
    let userOther; // Workspace 2 Owner (Cross-workspace isolation)
    let tokenA;
    let tokenB;
    let tokenC;
    let tokenOther;

    let workspace1;
    let workspace2;
    let project1;

    // Helper for authenticated HTTP requests
    async function request(path, options = {}) {
        const url = `${baseUrl}${path}`;
        const headers = {
            "Content-Type": "application/json",
            ...(options.token && { Authorization: `Bearer ${options.token}` }),
            ...(options.headers || {}),
        };

        const res = await fetch(url, {
            method: options.method || "GET",
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        let data = null;
        const text = await res.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }

        return {
            status: res.status,
            ok: res.ok,
            data,
        };
    }

    before(async () => {
        // Query active users from database to maintain dynamic real-user invariant
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No roles found in database");

        // Helper to find or create test user
        async function getOrCreateUser(email, firstName, lastName) {
            return await prisma.users.upsert({
                where: { email },
                update: { is_active: true },
                create: {
                    email,
                    first_name: firstName,
                    last_name: lastName,
                    password_hash: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
                    role_id: role.id,
                    is_active: true,
                },
            });
        }

        userA = await getOrCreateUser("chat_api_user_a@taskflow.dev", "Alice", "Chat");
        userB = await getOrCreateUser("chat_api_user_b@taskflow.dev", "Bob", "Chat");
        userC = await getOrCreateUser("chat_api_user_c@taskflow.dev", "Charlie", "Chat");
        userOther = await getOrCreateUser("chat_api_user_other@taskflow.dev", "Dave", "Isolated");

        // Sign tokens
        const secret = process.env.JWT_SECRET || "fallback_secret";
        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "1h" });
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, secret, { expiresIn: "1h" });
        tokenC = jwt.sign({ userId: userC.id, email: userC.email }, secret, { expiresIn: "1h" });
        tokenOther = jwt.sign({ userId: userOther.id, email: userOther.email }, secret, { expiresIn: "1h" });

        // Set up Workspace 1
        workspace1 = await prisma.workspaces.create({
            data: {
                name: `Chat Test WS 1 - ${Date.now()}`,
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

        // Set up Project 1 in Workspace 1 (UserA manager, UserB member, UserC NOT a member)
        project1 = await prisma.projects.create({
            data: {
                workspace_id: workspace1.id,
                title: `Chat Test Proj 1 - ${Date.now()}`,
                manager_id: userA.id,
                project_members: {
                    create: [
                        { user_id: userB.id, role_id: role.id },
                    ],
                },
            },
        });

        // Set up Workspace 2 (Isolated tenant)
        workspace2 = await prisma.workspaces.create({
            data: {
                name: `Chat Test WS 2 - ${Date.now()}`,
                owner_id: userOther.id,
                workspace_members: {
                    create: [
                        { user_id: userOther.id, workspace_role: "Owner" },
                    ],
                },
            },
        });

        // Start HTTP test server
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
        // Cleanup test resources
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
                        "chat_api_user_a@taskflow.dev",
                        "chat_api_user_b@taskflow.dev",
                        "chat_api_user_c@taskflow.dev",
                        "chat_api_user_other@taskflow.dev",
                    ],
                },
            },
        }).catch(() => {});

        await prisma.$disconnect();
    });

    describe("1. Conversation APIs (1-to-1 DMs & Group Chats)", () => {
        let dmConvId;
        let groupConvId;

        test("POST /api/chat/conversations/direct creates 1-to-1 conversation", async () => {
            const res = await request("/api/chat/conversations/direct", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    recipientId: userB.id,
                },
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.isExisting, false);
            assert.ok(res.data.conversation.id);
            assert.strictEqual(res.data.conversation.type, "DIRECT");
            assert.strictEqual(res.data.conversation.conversation_members.length, 2);

            dmConvId = res.data.conversation.id;
        });

        test("POST /api/chat/conversations/direct resolves duplicate idempotently (returns existing)", async () => {
            // UserB attempts to direct message UserA
            const res = await request("/api/chat/conversations/direct", {
                method: "POST",
                token: tokenB,
                body: {
                    workspaceId: workspace1.id,
                    recipientId: userA.id,
                },
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.isExisting, true);
            assert.strictEqual(res.data.conversation.id, dmConvId);
        });

        test("POST /api/chat/conversations/direct rejects self-messaging with 400", async () => {
            const res = await request("/api/chat/conversations/direct", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    recipientId: userA.id,
                },
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Cannot start a direct conversation with yourself"));
        });

        test("POST /api/chat/conversations/direct rejects recipient outside workspace with 400", async () => {
            const res = await request("/api/chat/conversations/direct", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    recipientId: userOther.id, // In workspace2, not workspace1
                },
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Recipient is not a member of this workspace"));
        });

        test("POST /api/chat/conversations/group creates group conversation with valid members", async () => {
            const res = await request("/api/chat/conversations/group", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    memberIds: [userB.id, userC.id],
                    title: "Feature Team Alpha",
                },
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.conversation.type, "GROUP");
            assert.strictEqual(res.data.conversation.title, "Feature Team Alpha");
            assert.strictEqual(res.data.conversation.conversation_members.length, 3);

            groupConvId = res.data.conversation.id;
        });

        test("GET /api/chat/conversations returns user's conversations with members and unread metadata", async () => {
            const res = await request(`/api/chat/conversations?workspaceId=${workspace1.id}`, {
                token: tokenA,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.ok(Array.isArray(res.data.conversations));
            assert.strictEqual(res.data.conversations.length, 2); // dmConv and groupConv
        });

        test("GET /api/chat/conversations/:conversationId returns conversation details", async () => {
            const res = await request(`/api/chat/conversations/${groupConvId}`, {
                token: tokenB,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.conversation.id, groupConvId);
            assert.strictEqual(res.data.conversation.title, "Feature Team Alpha");
        });

        test("GET /api/chat/conversations/:conversationId/members returns members with safe user projection", async () => {
            const res = await request(`/api/chat/conversations/${groupConvId}/members`, {
                token: tokenC,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.members.length, 3);

            // Verify safe projection: NEVER expose password_hash
            res.data.members.forEach((m) => {
                assert.ok(m.user.id);
                assert.ok(m.user.email);
                assert.strictEqual(m.user.password_hash, undefined);
            });
        });

        test("Non-member access to conversation is strictly rejected with 403 Forbidden", async () => {
            // Create private group with only UserA and UserB
            const privateConv = await prisma.conversations.create({
                data: {
                    workspace_id: workspace1.id,
                    type: "GROUP",
                    title: "Secret Executive Group",
                    created_by: userA.id,
                    conversation_members: {
                        create: [
                            { user_id: userA.id, role: "OWNER" },
                            { user_id: userB.id, role: "MEMBER" },
                        ],
                    },
                },
            });

            // UserC tries to read details of privateConv
            const res = await request(`/api/chat/conversations/${privateConv.id}`, {
                token: tokenC,
            });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("You are not a member of this conversation"));
        });
    });

    describe("2. Channel APIs (Workspace & Project Channels)", () => {
        let wsChannelId;
        let projChannelId;

        test("POST /api/chat/channels creates workspace channel and adds creator as OWNER", async () => {
            const res = await request("/api/chat/channels", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    name: "announcements",
                    topic: "Company wide updates",
                    description: "Official channel for all team news",
                    type: "PUBLIC",
                },
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.channel.name, "announcements");
            assert.strictEqual(res.data.channel.type, "PUBLIC");
            assert.strictEqual(res.data.channel.channel_members[0].user_id, userA.id);
            assert.strictEqual(res.data.channel.channel_members[0].role, "OWNER");

            wsChannelId = res.data.channel.id;
        });

        test("POST /api/chat/channels rejects duplicate channel name in same workspace with 409", async () => {
            const res = await request("/api/chat/channels", {
                method: "POST",
                token: tokenB,
                body: {
                    workspaceId: workspace1.id,
                    name: "announcements",
                },
            });

            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("already exists"));
        });

        test("POST /api/chat/channels creates project-scoped channel", async () => {
            const res = await request("/api/chat/channels", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    projectId: project1.id,
                    name: "sprint-planning",
                    topic: "Project 1 Sprint Tasks",
                    type: "PUBLIC",
                },
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.channel.project_id, project1.id);
            assert.strictEqual(res.data.channel.name, "sprint-planning");

            projChannelId = res.data.channel.id;
        });

        test("Project channel access: Project member (UserB) can access project channel", async () => {
            const res = await request(`/api/chat/channels/${projChannelId}`, {
                token: tokenB,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.channel.id, projChannelId);
        });

        test("Project channel access: Non-project member (UserC) is rejected with 403 Forbidden", async () => {
            const res = await request(`/api/chat/channels/${projChannelId}`, {
                token: tokenC,
            });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Project access denied"));
        });

        test("PATCH /api/chat/channels/:channelId updates channel metadata", async () => {
            const res = await request(`/api/chat/channels/${wsChannelId}`, {
                method: "PATCH",
                token: tokenA,
                body: {
                    topic: "Updated announcements topic",
                    description: "Updated description",
                },
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.channel.topic, "Updated announcements topic");
        });

        test("POST /api/chat/channels/:channelId/archive archives channel", async () => {
            const res = await request(`/api/chat/channels/${wsChannelId}/archive`, {
                method: "POST",
                token: tokenA,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.channel.is_archived, true);
        });

        test("Channel membership management: add and remove members", async () => {
            // Create active channel for membership tests
            const chanRes = await request("/api/chat/channels", {
                method: "POST",
                token: tokenA,
                body: {
                    workspaceId: workspace1.id,
                    name: "team-dev",
                },
            });
            const chanId = chanRes.data.channel.id;

            // UserA adds UserB as MODERATOR
            const addRes = await request(`/api/chat/channels/${chanId}/members`, {
                method: "POST",
                token: tokenA,
                body: {
                    userId: userB.id,
                    role: "MODERATOR",
                },
            });
            assert.strictEqual(addRes.status, 201);
            assert.strictEqual(addRes.data.member.role, "MODERATOR");

            // Verify member list
            const listRes = await request(`/api/chat/channels/${chanId}/members`, {
                token: tokenB,
            });
            assert.strictEqual(listRes.status, 200);
            assert.strictEqual(listRes.data.members.length, 2);

            // UserB removes self (self-leave)
            const removeRes = await request(`/api/chat/channels/${chanId}/members/${userB.id}`, {
                method: "DELETE",
                token: tokenB,
            });
            assert.strictEqual(removeRes.status, 200);
            assert.strictEqual(removeRes.data.success, true);
        });
    });

    describe("3. Message APIs (Sending, History, Threads, Editing, Soft Deletion)", () => {
        let activeChanId;
        let rootMessageId;

        before(async () => {
            const chan = await prisma.channels.create({
                data: {
                    workspace_id: workspace1.id,
                    name: "general-chat",
                    created_by: userA.id,
                    channel_members: {
                        create: [
                            { user_id: userA.id, role: "OWNER" },
                            { user_id: userB.id, role: "MEMBER" },
                        ],
                    },
                },
            });
            activeChanId = chan.id;
        });

        test("POST /api/chat/messages sends message to channel and updates last_message_at", async () => {
            const res = await request("/api/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    channelId: activeChanId,
                    content: "Hello team, welcome to the channel!",
                    messageType: "TEXT",
                },
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.ok(res.data.message.id);
            assert.strictEqual(res.data.message.content, "Hello team, welcome to the channel!");
            assert.strictEqual(res.data.message.sender_id, userA.id);

            rootMessageId = res.data.message.id;

            // Verify channel last_message_at updated
            const chan = await prisma.channels.findUnique({ where: { id: activeChanId } });
            assert.ok(chan.last_message_at);
        });

        test("POST /api/chat/messages rejects dual targets (channel + conversation) with 400", async () => {
            const res = await request("/api/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    channelId: activeChanId,
                    conversationId: "00000000-0000-0000-0000-000000000000",
                    content: "Illegal message",
                },
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("exactly one target"));
        });

        test("POST /api/chat/messages rejects empty content with 400", async () => {
            const res = await request("/api/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    channelId: activeChanId,
                    content: "   ",
                },
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("content cannot be empty"));
        });

        test("POST /api/chat/messages creates thread reply referencing parentMessageId", async () => {
            const res = await request("/api/chat/messages", {
                method: "POST",
                token: tokenB,
                body: {
                    channelId: activeChanId,
                    content: "Thanks Alice, excited to be here!",
                    parentMessageId: rootMessageId,
                },
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.message.parent_message_id, rootMessageId);
        });

        test("GET /api/chat/messages/:messageId/replies retrieves thread replies", async () => {
            const res = await request(`/api/chat/messages/${rootMessageId}/replies`, {
                token: tokenA,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.parentMessage.id, rootMessageId);
            assert.strictEqual(res.data.replies.length, 1);
            assert.strictEqual(res.data.replies[0].content, "Thanks Alice, excited to be here!");
        });

        test("GET /api/chat/messages paginates message history with cursor-based pagination", async () => {
            // Seed 4 additional messages in the channel
            for (let i = 1; i <= 4; i++) {
                await request("/api/chat/messages", {
                    method: "POST",
                    token: tokenA,
                    body: {
                        channelId: activeChanId,
                        content: `Test Message ${i}`,
                    },
                });
            }

            // Fetch page 1 with limit = 3
            const page1Res = await request(`/api/chat/messages?channelId=${activeChanId}&limit=3`, {
                token: tokenB,
            });

            assert.strictEqual(page1Res.status, 200);
            assert.strictEqual(page1Res.data.success, true);
            assert.strictEqual(page1Res.data.messages.length, 3);
            assert.strictEqual(page1Res.data.hasMore, true);
            assert.ok(page1Res.data.nextCursor);

            // Fetch page 2 using cursor
            const page2Res = await request(`/api/chat/messages?channelId=${activeChanId}&limit=3&cursor=${page1Res.data.nextCursor}`, {
                token: tokenB,
            });

            assert.strictEqual(page2Res.status, 200);
            assert.strictEqual(page2Res.data.success, true);
            assert.ok(page2Res.data.messages.length >= 1);
        });

        test("PATCH /api/chat/messages/:messageId allows author to edit message", async () => {
            const res = await request(`/api/chat/messages/${rootMessageId}`, {
                method: "PATCH",
                token: tokenA,
                body: {
                    content: "Hello team, welcome to the updated channel!",
                },
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.message.content, "Hello team, welcome to the updated channel!");
            assert.strictEqual(res.data.message.is_edited, true);
            assert.ok(res.data.message.edited_at);
        });

        test("PATCH /api/chat/messages/:messageId strictly rejects non-author edit with 403 Forbidden", async () => {
            // UserB attempts to edit UserA's message
            const res = await request(`/api/chat/messages/${rootMessageId}`, {
                method: "PATCH",
                token: tokenB,
                body: {
                    content: "Forged edit attempt by unauthorized user",
                },
            });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("You can only edit your own messages"));
        });

        test("DELETE /api/chat/messages/:messageId soft-deletes message and preserves history tombstone", async () => {
            const res = await request(`/api/chat/messages/${rootMessageId}`, {
                method: "DELETE",
                token: tokenA,
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);

            // History query should return tombstone text
            const historyRes = await request(`/api/chat/messages?channelId=${activeChanId}`, {
                token: tokenB,
            });

            const deletedInHistory = historyRes.data.messages.find((m) => m.id === rootMessageId);
            assert.ok(deletedInHistory);
            assert.strictEqual(deletedInHistory.isDeleted, true);
            assert.strictEqual(deletedInHistory.content, "This message was deleted.");
        });

        test("PATCH /api/chat/messages/:messageId rejects editing already deleted message with 400", async () => {
            const res = await request(`/api/chat/messages/${rootMessageId}`, {
                method: "PATCH",
                token: tokenA,
                body: {
                    content: "Attempt to revive deleted message",
                },
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Cannot edit a deleted message"));
        });
    });

    describe("4. Security, Multi-Tenant Isolation & IDOR Protection", () => {
        test("Cross-workspace query: UserOther in Workspace 2 cannot list Workspace 1 conversations (403)", async () => {
            const res = await request(`/api/chat/conversations?workspaceId=${workspace1.id}`, {
                token: tokenOther,
            });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Workspace access denied"));
        });

        test("Cross-workspace query: UserOther in Workspace 2 cannot list Workspace 1 channels (403)", async () => {
            const res = await request(`/api/chat/channels?workspaceId=${workspace1.id}`, {
                token: tokenOther,
            });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Workspace access denied"));
        });

        test("Cross-workspace post: UserOther cannot post message to Workspace 1 channel (403)", async () => {
            const chan = await prisma.channels.findFirst({ where: { workspace_id: workspace1.id } });

            const res = await request("/api/chat/messages", {
                method: "POST",
                token: tokenOther,
                body: {
                    channelId: chan.id,
                    content: "Intruder cross-workspace message",
                },
            });

            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.message.includes("Workspace access denied"));
        });

        test("Removed member access: User removed from workspace is immediately blocked with 403", async () => {
            // Remove UserC from Workspace 1
            await prisma.workspace_members.delete({
                where: {
                    workspace_id_user_id: {
                        workspace_id: workspace1.id,
                        user_id: userC.id,
                    },
                },
            });

            // UserC tries to access conversations
            const convRes = await request(`/api/chat/conversations?workspaceId=${workspace1.id}`, {
                token: tokenC,
            });
            assert.strictEqual(convRes.status, 403);

            // UserC tries to access channels
            const chanRes = await request(`/api/chat/channels?workspaceId=${workspace1.id}`, {
                token: tokenC,
            });
            assert.strictEqual(chanRes.status, 403);
        });

        test("Unauthenticated requests to any chat endpoint are rejected with 401 Unauthorized", async () => {
            const res = await request(`/api/chat/conversations?workspaceId=${workspace1.id}`);
            assert.strictEqual(res.status, 401);
        });
    });
});
