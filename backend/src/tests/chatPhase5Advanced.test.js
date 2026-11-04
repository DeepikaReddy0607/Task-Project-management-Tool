import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../app.js";
import prisma from "../config/prisma.js";

describe("TASKFLOW CHAT: Phase 5 Advanced Messaging (Reactions, Pins, Mentions, Search, Unread) Test Suite", () => {
    let server;
    let baseUrl;
    let userA; // Workspace Owner
    let userB; // Workspace Member
    let userOutside; // Workspace 2 Owner
    let tokenA;
    let tokenB;
    let tokenOutside;

    let workspace;
    let workspaceOutside;
    let channelPublic;
    let channelPrivate;
    let testMessage;
    let conversation;

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
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No roles found in database");

        async function getOrCreateUser(email, firstName, lastName) {
            let u = await prisma.users.findUnique({ where: { email } });
            if (!u) {
                u = await prisma.users.create({
                    data: {
                        email,
                        password_hash: "hashed_secret_test",
                        first_name: firstName,
                        last_name: lastName,
                        role_id: role.id,
                        is_active: true,
                    },
                });
            }
            return u;
        }

        userA = await getOrCreateUser("chat5_userA@taskflow.dev", "Alice", "Admin");
        userB = await getOrCreateUser("chat5_userB@taskflow.dev", "Bob", "Builder");
        userOutside = await getOrCreateUser("chat5_outside@taskflow.dev", "Oscar", "Outside");

        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, process.env.JWT_SECRET || "default_jwt_secret_dev");
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, process.env.JWT_SECRET || "default_jwt_secret_dev");
        tokenOutside = jwt.sign({ userId: userOutside.id, email: userOutside.email }, process.env.JWT_SECRET || "default_jwt_secret_dev");

        // Create test workspace
        workspace = await prisma.workspaces.create({
            data: {
                name: "Phase 5 Test Workspace",
                owner_id: userA.id,
                workspace_members: {
                    create: [
                        { user_id: userA.id, workspace_role: "Owner" },
                        { user_id: userB.id, workspace_role: "Member" },
                    ],
                },
            },
        });

        workspaceOutside = await prisma.workspaces.create({
            data: {
                name: "Outside Workspace",
                owner_id: userOutside.id,
                workspace_members: {
                    create: [{ user_id: userOutside.id, workspace_role: "Owner" }],
                },
            },
        });

        // Create public channel
        channelPublic = await prisma.channels.create({
            data: {
                workspace_id: workspace.id,
                name: "phase5-public",
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

        // Create private channel (only User A)
        channelPrivate = await prisma.channels.create({
            data: {
                workspace_id: workspace.id,
                name: "phase5-private-admin",
                type: "PRIVATE",
                created_by: userA.id,
                channel_members: {
                    create: [{ user_id: userA.id, role: "OWNER" }],
                },
            },
        });

        // Create direct conversation between A and B
        const dmSig = [userA.id, userB.id].sort().join(":");
        conversation = await prisma.conversations.create({
            data: {
                workspace_id: workspace.id,
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

        // Create a root message in public channel
        testMessage = await prisma.messages.create({
            data: {
                channel_id: channelPublic.id,
                sender_id: userA.id,
                content: "Welcome to Phase 5 test channel! Please review the project documentation.",
            },
        });

        // Start HTTP test server
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}/api`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        // Cleanup test workspace data
        if (workspace) {
            await prisma.workspaces.delete({ where: { id: workspace.id } }).catch(() => {});
        }
        if (workspaceOutside) {
            await prisma.workspaces.delete({ where: { id: workspaceOutside.id } }).catch(() => {});
        }
    });

    // =========================================================================
    // 1. MESSAGE REACTIONS TESTS
    // =========================================================================
    describe("1. Message Reactions", () => {
        test("POST /api/chat/messages/:id/reactions adds reaction and prevents duplicate by same user", async () => {
            const res1 = await request(`/chat/messages/${testMessage.id}/reactions`, {
                method: "POST",
                token: tokenA,
                body: { emoji: "👍" },
            });
            assert.equal(res1.status, 201);
            assert.equal(res1.data.success, true);
            assert.equal(res1.data.reaction.emoji, "👍");
            assert.equal(res1.data.reaction.userId, userA.id);

            // Re-adding same reaction by same user is handled idempotently
            const res2 = await request(`/chat/messages/${testMessage.id}/reactions`, {
                method: "POST",
                token: tokenA,
                body: { emoji: "👍" },
            });
            assert.equal(res2.status, 201);
            assert.equal(res2.data.reaction.emoji, "👍");

            // User B adds another reaction
            const res3 = await request(`/chat/messages/${testMessage.id}/reactions`, {
                method: "POST",
                token: tokenB,
                body: { emoji: "🚀" },
            });
            assert.equal(res3.status, 201);
            assert.equal(res3.data.reaction.emoji, "🚀");
        });

        test("GET /api/chat/messages returns updated reactions with user details", async () => {
            const res = await request(`/chat/messages?channelId=${channelPublic.id}`, {
                token: tokenA,
            });
            assert.equal(res.status, 200);
            const msg = res.data.messages.find((m) => m.id === testMessage.id);
            assert.ok(msg);
            assert.ok(msg.reactions.length >= 2);
            assert.ok(msg.reactions.some((r) => r.emoji === "👍" && r.userId === userA.id));
            assert.ok(msg.reactions.some((r) => r.emoji === "🚀" && r.userId === userB.id));
        });

        test("DELETE /api/chat/messages/:id/reactions/:emoji removes reaction", async () => {
            const res = await request(`/chat/messages/${testMessage.id}/reactions/${encodeURIComponent("👍")}`, {
                method: "DELETE",
                token: tokenA,
            });
            assert.equal(res.status, 200);
            assert.equal(res.data.success, true);

            // Verify in message history
            const histRes = await request(`/chat/messages?channelId=${channelPublic.id}`, {
                token: tokenA,
            });
            const msg = histRes.data.messages.find((m) => m.id === testMessage.id);
            assert.ok(!msg.reactions.some((r) => r.emoji === "👍" && r.userId === userA.id));
        });

        test("POST /api/chat/messages/:id/reactions rejects unauthorized cross-workspace access with 403", async () => {
            const res = await request(`/chat/messages/${testMessage.id}/reactions`, {
                method: "POST",
                token: tokenOutside,
                body: { emoji: "❤️" },
            });
            assert.equal(res.status, 403);
        });
    });

    // =========================================================================
    // 2. MESSAGE PINNING TESTS
    // =========================================================================
    describe("2. Message Pinning", () => {
        test("POST /api/chat/messages/:id/pin pins a message (Channel Owner / Admin)", async () => {
            const res = await request(`/chat/messages/${testMessage.id}/pin`, {
                method: "POST",
                token: tokenA,
            });
            assert.equal(res.status, 201);
            assert.equal(res.data.success, true);
            assert.equal(res.data.pin.messageId, testMessage.id);
            assert.equal(res.data.pin.pinnedBy, userA.id);
        });

        test("GET /api/chat/channels/:id/pins retrieves pinned messages", async () => {
            const res = await request(`/chat/channels/${channelPublic.id}/pins`, {
                token: tokenB,
            });
            assert.equal(res.status, 200);
            assert.equal(res.data.success, true);
            assert.ok(Array.isArray(res.data.pins));
            assert.ok(res.data.pins.some((p) => p.messageId === testMessage.id));
        });

        test("DELETE /api/chat/messages/:id/pin unpins message", async () => {
            const res = await request(`/chat/messages/${testMessage.id}/pin`, {
                method: "DELETE",
                token: tokenA,
            });
            assert.equal(res.status, 200);
            assert.equal(res.data.success, true);

            const pinsRes = await request(`/chat/channels/${channelPublic.id}/pins`, {
                token: tokenA,
            });
            assert.ok(!pinsRes.data.pins.some((p) => p.messageId === testMessage.id));
        });

        test("POST /api/chat/messages/:id/pin in conversation allows conversation members to pin", async () => {
            const convMsg = await prisma.messages.create({
                data: {
                    conversation_id: conversation.id,
                    sender_id: userB.id,
                    content: "Direct conversation message to pin",
                },
            });

            const pinRes = await request(`/chat/messages/${convMsg.id}/pin`, {
                method: "POST",
                token: tokenB,
            });
            assert.equal(pinRes.status, 201);
            assert.equal(pinRes.data.pin.messageId, convMsg.id);

            const listRes = await request(`/chat/conversations/${conversation.id}/pins`, {
                token: tokenA,
            });
            assert.equal(listRes.status, 200);
            assert.ok(listRes.data.pins.some((p) => p.messageId === convMsg.id));
        });
    });

    // =========================================================================
    // 3. @MENTIONS TESTS
    // =========================================================================
    describe("3. @Mentions & Notifications", () => {
        test("POST /api/chat/messages with @Bob dispatches notification to Bob", async () => {
            const res = await request("/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    channelId: channelPublic.id,
                    content: "Hey @Bob, please check the Phase 5 release requirements!",
                },
            });
            assert.equal(res.status, 201);

            // Verify notification created in DB for User B
            const notifs = await prisma.notifications.findMany({
                where: {
                    user_id: userB.id,
                    related_entity_type: "chat_message",
                    related_entity_id: res.data.message.id,
                },
            });

            assert.ok(notifs.length >= 1);
            assert.ok(notifs[0].message.includes("Alice"));
            assert.ok(notifs[0].message.includes("#phase5-public"));
        });

        test("POST /api/chat/messages does not notify sender if self-mentioned", async () => {
            const res = await request("/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    channelId: channelPublic.id,
                    content: "Notes to @Alice for later review",
                },
            });
            assert.equal(res.status, 201);

            const notifs = await prisma.notifications.findMany({
                where: {
                    user_id: userA.id,
                    related_entity_type: "chat_message",
                    related_entity_id: res.data.message.id,
                },
            });
            assert.equal(notifs.length, 0);
        });
    });

    // =========================================================================
    // 4. MESSAGE SEARCH TESTS
    // =========================================================================
    describe("4. Message Search & Tenant Isolation", () => {
        before(async () => {
            // Seed a message in the private channel
            await prisma.messages.create({
                data: {
                    channel_id: channelPrivate.id,
                    sender_id: userA.id,
                    content: "Confidential confidential_alpha keyword for admins only",
                },
            });
        });

        test("GET /api/chat/search finds messages by keyword within workspace", async () => {
            const res = await request(`/chat/search?workspaceId=${workspace.id}&q=review`, {
                token: tokenA,
            });
            assert.equal(res.status, 200);
            assert.equal(res.data.success, true);
            assert.ok(res.data.total >= 1);
            assert.ok(res.data.messages.some((m) => m.content.toLowerCase().includes("review")));
        });

        test("GET /api/chat/search strictly hides private channel messages from non-members", async () => {
            // User B is NOT in channelPrivate -> must not find "confidential_alpha"
            const resB = await request(`/chat/search?workspaceId=${workspace.id}&q=confidential_alpha`, {
                token: tokenB,
            });
            assert.equal(resB.status, 200);
            assert.equal(resB.data.total, 0);
            assert.equal(resB.data.messages.length, 0);

            // User A IS in channelPrivate (and is Owner) -> can find it
            const resA = await request(`/chat/search?workspaceId=${workspace.id}&q=confidential_alpha`, {
                token: tokenA,
            });
            assert.equal(resA.status, 200);
            assert.ok(resA.data.total >= 1);
        });

        test("GET /api/chat/search rejects unauthorized workspace search with 403", async () => {
            const res = await request(`/chat/search?workspaceId=${workspace.id}&q=test`, {
                token: tokenOutside,
            });
            assert.equal(res.status, 403);
        });
    });

    // =========================================================================
    // 5. UNREAD MESSAGE TRACKING & READ RECEIPTS
    // =========================================================================
    describe("5. Unread Message Tracking", () => {
        test("POST /api/chat/channels/:id/read marks channel read and updates unread counts", async () => {
            // User A sends a message in public channel
            await request("/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    channelId: channelPublic.id,
                    content: "New unread test message for Bob",
                },
            });

            // Bob checks unread counts
            const countsBefore = await request(`/chat/unread-counts?workspaceId=${workspace.id}`, {
                token: tokenB,
            });
            assert.equal(countsBefore.status, 200);
            assert.ok(countsBefore.data.unreadCounts[channelPublic.id] >= 1);

            // Bob marks channel as read
            const readRes = await request(`/chat/channels/${channelPublic.id}/read`, {
                method: "POST",
                token: tokenB,
            });
            assert.equal(readRes.status, 200);
            assert.equal(readRes.data.success, true);

            // Unread count is now 0 for Bob
            const countsAfter = await request(`/chat/unread-counts?workspaceId=${workspace.id}`, {
                token: tokenB,
            });
            assert.equal(countsAfter.data.unreadCounts[channelPublic.id], 0);
        });

        test("POST /api/chat/conversations/:id/read marks direct conversation read", async () => {
            // User A sends message in conversation to User B
            await request("/chat/messages", {
                method: "POST",
                token: tokenA,
                body: {
                    conversationId: conversation.id,
                    content: "Hello Bob in DM",
                },
            });

            const convsBefore = await request(`/chat/conversations?workspaceId=${workspace.id}`, {
                token: tokenB,
            });
            assert.equal(convsBefore.status, 200);
            const targetConv = convsBefore.data.conversations.find((c) => c.id === conversation.id);
            assert.ok(targetConv.unreadCount >= 1);

            // Bob marks conversation read
            const readRes = await request(`/chat/conversations/${conversation.id}/read`, {
                method: "POST",
                token: tokenB,
            });
            assert.equal(readRes.status, 200);

            const convsAfter = await request(`/chat/conversations?workspaceId=${workspace.id}`, {
                token: tokenB,
            });
            const afterConv = convsAfter.data.conversations.find((c) => c.id === conversation.id);
            assert.equal(afterConv.unreadCount, 0);
        });
    });
});
