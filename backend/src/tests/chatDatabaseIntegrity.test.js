import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../config/prisma.js";

describe("TASKFLOW CHAT: Phase 1 Database Architecture & Integrity Test Suite", () => {
    let testWorkspace;
    let testProject;
    let realUserA;
    let realUserB;
    let realUserC;

    before(async () => {
        // Query existing active users from database to respect the dynamic real user invariant
        const existingUsers = await prisma.users.findMany({
            where: { is_active: true },
            take: 3,
        });

        if (existingUsers.length >= 3) {
            realUserA = existingUsers[0];
            realUserB = existingUsers[1];
            realUserC = existingUsers[2];
        } else {
            // If fewer than 3 users exist, find role to create test users
            const role = await prisma.roles.findFirst();
            if (!role) throw new Error("No roles found in database");

            while (existingUsers.length < 3) {
                const idx = existingUsers.length + 1;
                const user = await prisma.users.create({
                    data: {
                        email: `chat_test_user_${idx}_${Date.now()}@taskflow.dev`,
                        first_name: `ChatUser${idx}`,
                        last_name: "Tester",
                        password_hash: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
                        role_id: role.id,
                        is_active: true,
                    },
                });
                existingUsers.push(user);
            }
            realUserA = existingUsers[0];
            realUserB = existingUsers[1];
            realUserC = existingUsers[2];
        }

        // Query or create workspace for testing
        testWorkspace = await prisma.workspaces.findFirst();
        if (!testWorkspace) {
            testWorkspace = await prisma.workspaces.create({
                data: {
                    name: "Chat Test Workspace",
                    owner_id: realUserA.id,
                },
            });
        }

        // Ensure realUserA, realUserB, realUserC are workspace members
        for (const u of [realUserA, realUserB, realUserC]) {
            await prisma.workspace_members.upsert({
                where: {
                    workspace_id_user_id: {
                        workspace_id: testWorkspace.id,
                        user_id: u.id,
                    },
                },
                update: {},
                create: {
                    workspace_id: testWorkspace.id,
                    user_id: u.id,
                    workspace_role: "Member",
                },
            });
        }

        // Query or create project for testing
        testProject = await prisma.projects.findFirst({
            where: { workspace_id: testWorkspace.id },
        });

        if (!testProject) {
            testProject = await prisma.projects.create({
                data: {
                    workspace_id: testWorkspace.id,
                    title: "Chat Test Project",
                    manager_id: realUserA.id,
                },
            });
        }
    });

    after(async () => {
        // Clean up test chat data created in the test workspace
        await prisma.conversations.deleteMany({
            where: { workspace_id: testWorkspace.id, title: { contains: "ChatTest" } },
        });
        await prisma.channels.deleteMany({
            where: { workspace_id: testWorkspace.id, name: { startsWith: "test-chat" } },
        });
        await prisma.$disconnect();
    });

    describe("1. Direct Messaging (1-to-1 & Group DMs)", () => {
        const computeDmSignature = (userId1, userId2) => {
            return [userId1, userId2].sort().join(":");
        };

        test("should create a 1-to-1 conversation with deterministic DM signature", async () => {
            const dmSig = computeDmSignature(realUserA.id, realUserB.id);

            // Clean any preexisting conversation for this pair
            await prisma.conversations.deleteMany({
                where: { workspace_id: testWorkspace.id, dm_signature: dmSig },
            });

            const conversation = await prisma.conversations.create({
                data: {
                    workspace_id: testWorkspace.id,
                    type: "DIRECT",
                    title: "ChatTest 1-on-1",
                    dm_signature: dmSig,
                    created_by: realUserA.id,
                    conversation_members: {
                        create: [
                            { user_id: realUserA.id, role: "MEMBER" },
                            { user_id: realUserB.id, role: "MEMBER" },
                        ],
                    },
                },
                include: {
                    conversation_members: true,
                },
            });

            assert.ok(conversation.id);
            assert.strictEqual(conversation.type, "DIRECT");
            assert.strictEqual(conversation.dm_signature, dmSig);
            assert.strictEqual(conversation.conversation_members.length, 2);
        });

        test("should enforce uniqueness and reject duplicate 1-to-1 conversations in the same workspace", async () => {
            const dmSig = computeDmSignature(realUserA.id, realUserB.id);

            await assert.rejects(
                async () => {
                    await prisma.conversations.create({
                        data: {
                            workspace_id: testWorkspace.id,
                            type: "DIRECT",
                            title: "ChatTest Duplicate DM",
                            dm_signature: dmSig,
                            created_by: realUserB.id,
                        },
                    });
                },
                (err) => {
                    // Prisma code P2002 corresponds to unique constraint violation
                    return err.code === "P2002" || err.message.includes("uq_conversation_workspace_dm_signature");
                }
            );
        });

        test("should allow multiple Group DMs with dm_signature = NULL", async () => {
            const group1 = await prisma.conversations.create({
                data: {
                    workspace_id: testWorkspace.id,
                    type: "GROUP",
                    title: "ChatTest Group 1",
                    dm_signature: null,
                    created_by: realUserA.id,
                    conversation_members: {
                        create: [
                            { user_id: realUserA.id, role: "OWNER" },
                            { user_id: realUserB.id, role: "MEMBER" },
                            { user_id: realUserC.id, role: "MEMBER" },
                        ],
                    },
                },
                include: { conversation_members: true },
            });

            const group2 = await prisma.conversations.create({
                data: {
                    workspace_id: testWorkspace.id,
                    type: "GROUP",
                    title: "ChatTest Group 2",
                    dm_signature: null,
                    created_by: realUserB.id,
                    conversation_members: {
                        create: [
                            { user_id: realUserA.id, role: "MEMBER" },
                            { user_id: realUserB.id, role: "OWNER" },
                            { user_id: realUserC.id, role: "MEMBER" },
                        ],
                    },
                },
                include: { conversation_members: true },
            });

            assert.ok(group1.id);
            assert.ok(group2.id);
            assert.notStrictEqual(group1.id, group2.id);
            assert.strictEqual(group1.conversation_members.length, 3);
            assert.strictEqual(group2.conversation_members.length, 3);
        });

        test("should prevent duplicate membership in the same conversation", async () => {
            const conv = await prisma.conversations.create({
                data: {
                    workspace_id: testWorkspace.id,
                    type: "GROUP",
                    title: "ChatTest Duplicate Member Test",
                    created_by: realUserA.id,
                },
            });

            await prisma.conversation_members.create({
                data: {
                    conversation_id: conv.id,
                    user_id: realUserA.id,
                },
            });

            await assert.rejects(
                async () => {
                    await prisma.conversation_members.create({
                        data: {
                            conversation_id: conv.id,
                            user_id: realUserA.id,
                        },
                    });
                },
                (err) => err.code === "P2002" || err.message.includes("uq_conversation_member")
            );
        });
    });

    describe("2. Workspace and Project Channels", () => {
        test("should create a workspace-level channel with members", async () => {
            const channelName = `test-chat-ws-${Date.now()}`;
            const channel = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: channelName,
                    topic: "General workspace discussion",
                    description: "Workspace-wide announcements and team chat",
                    type: "PUBLIC",
                    created_by: realUserA.id,
                    channel_members: {
                        create: [
                            { user_id: realUserA.id, role: "OWNER" },
                            { user_id: realUserB.id, role: "MEMBER" },
                        ],
                    },
                },
                include: { channel_members: true },
            });

            assert.ok(channel.id);
            assert.strictEqual(channel.project_id, null);
            assert.strictEqual(channel.name, channelName);
            assert.strictEqual(channel.channel_members.length, 2);
        });

        test("should create a project-level channel tied to a specific project", async () => {
            const channelName = `test-chat-proj-${Date.now()}`;
            const channel = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    project_id: testProject.id,
                    name: channelName,
                    topic: "Project sprint chatter",
                    type: "PUBLIC",
                    created_by: realUserA.id,
                    channel_members: {
                        create: [
                            { user_id: realUserA.id, role: "OWNER" },
                            { user_id: realUserC.id, role: "MEMBER" },
                        ],
                    },
                },
                include: { channel_members: true },
            });

            assert.ok(channel.id);
            assert.strictEqual(channel.project_id, testProject.id);
            assert.strictEqual(channel.channel_members.length, 2);
        });

        test("should reject duplicate membership in the same channel", async () => {
            const channel = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: `test-chat-dup-${Date.now()}`,
                    created_by: realUserA.id,
                },
            });

            await prisma.channel_members.create({
                data: { channel_id: channel.id, user_id: realUserA.id },
            });

            await assert.rejects(
                async () => {
                    await prisma.channel_members.create({
                        data: { channel_id: channel.id, user_id: realUserA.id },
                    });
                },
                (err) => err.code === "P2002" || err.message.includes("uq_channel_member")
            );
        });
    });

    describe("3. Messages: Channel vs Conversation Target Mutual Exclusivity", () => {
        let channel;
        let conversation;

        before(async () => {
            channel = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: `test-chat-msg-${Date.now()}`,
                    created_by: realUserA.id,
                },
            });

            conversation = await prisma.conversations.create({
                data: {
                    workspace_id: testWorkspace.id,
                    type: "GROUP",
                    title: "ChatTest Msg Group",
                    created_by: realUserA.id,
                },
            });
        });

        test("should successfully create a message in a channel", async () => {
            const msg = await prisma.messages.create({
                data: {
                    channel_id: channel.id,
                    conversation_id: null,
                    sender_id: realUserA.id,
                    content: "Hello Channel!",
                    message_type: "TEXT",
                },
            });

            assert.ok(msg.id);
            assert.strictEqual(msg.channel_id, channel.id);
            assert.strictEqual(msg.conversation_id, null);
            assert.strictEqual(msg.content, "Hello Channel!");
        });

        test("should successfully create a message in a conversation", async () => {
            const msg = await prisma.messages.create({
                data: {
                    channel_id: null,
                    conversation_id: conversation.id,
                    sender_id: realUserB.id,
                    content: "Hello Direct Conversation!",
                    message_type: "TEXT",
                },
            });

            assert.ok(msg.id);
            assert.strictEqual(msg.channel_id, null);
            assert.strictEqual(msg.conversation_id, conversation.id);
            assert.strictEqual(msg.content, "Hello Direct Conversation!");
        });

        test("should fail with check constraint violation if both channel_id and conversation_id are provided", async () => {
            await assert.rejects(
                async () => {
                    await prisma.messages.create({
                        data: {
                            channel_id: channel.id,
                            conversation_id: conversation.id,
                            sender_id: realUserA.id,
                            content: "Illegal dual-target message",
                        },
                    });
                },
                (err) => {
                    // Check constraint violation
                    return err.message.includes("chk_messages_target") || err.code === "P2010";
                }
            );
        });

        test("should fail with check constraint violation if neither channel_id nor conversation_id is provided", async () => {
            await assert.rejects(
                async () => {
                    await prisma.messages.create({
                        data: {
                            channel_id: null,
                            conversation_id: null,
                            sender_id: realUserA.id,
                            content: "Illegal orphan message",
                        },
                    });
                },
                (err) => {
                    return err.message.includes("chk_messages_target") || err.code === "P2010";
                }
            );
        });
    });

    describe("4. Thread Replies, Editing & Soft Deletion", () => {
        let parentMsg;
        let testChan;

        before(async () => {
            testChan = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: `test-chat-thread-${Date.now()}`,
                    created_by: realUserA.id,
                },
            });

            parentMsg = await prisma.messages.create({
                data: {
                    channel_id: testChan.id,
                    sender_id: realUserA.id,
                    content: "Original root message for threading",
                },
            });
        });

        test("should support thread reply referencing parent_message_id", async () => {
            const reply = await prisma.messages.create({
                data: {
                    channel_id: testChan.id,
                    sender_id: realUserB.id,
                    content: "Thread reply to root message",
                    parent_message_id: parentMsg.id,
                },
                include: { parent_message: true },
            });

            assert.ok(reply.id);
            assert.strictEqual(reply.parent_message_id, parentMsg.id);
            assert.strictEqual(reply.parent_message.id, parentMsg.id);

            // Verify fetching parent includes replies
            const parentWithReplies = await prisma.messages.findUnique({
                where: { id: parentMsg.id },
                include: { thread_replies: true },
            });
            assert.strictEqual(parentWithReplies.thread_replies.length, 1);
            assert.strictEqual(parentWithReplies.thread_replies[0].id, reply.id);
        });

        test("should support message editing with is_edited and edited_at timestamps", async () => {
            const editedTimestamp = new Date();
            const editedMsg = await prisma.messages.update({
                where: { id: parentMsg.id },
                data: {
                    content: "Updated root message content",
                    is_edited: true,
                    edited_at: editedTimestamp,
                },
            });

            assert.strictEqual(editedMsg.content, "Updated root message content");
            assert.strictEqual(editedMsg.is_edited, true);
            assert.ok(editedMsg.edited_at);
        });

        test("should support soft deletion with is_deleted and deleted_at timestamps", async () => {
            const deletedTimestamp = new Date();
            const softDeletedMsg = await prisma.messages.update({
                where: { id: parentMsg.id },
                data: {
                    is_deleted: true,
                    deleted_at: deletedTimestamp,
                },
            });

            assert.strictEqual(softDeletedMsg.is_deleted, true);
            assert.ok(softDeletedMsg.deleted_at);

            // Message still exists in database for audit/tombstone presentation
            const retrieved = await prisma.messages.findUnique({
                where: { id: parentMsg.id },
            });
            assert.ok(retrieved);
            assert.strictEqual(retrieved.is_deleted, true);
        });
    });

    describe("5. Message Reactions, Read Receipts & Pins", () => {
        let testMsg;
        let testChan;

        before(async () => {
            testChan = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: `test-chat-reactions-${Date.now()}`,
                    created_by: realUserA.id,
                },
            });

            testMsg = await prisma.messages.create({
                data: {
                    channel_id: testChan.id,
                    sender_id: realUserA.id,
                    content: "Message for testing reactions, read receipts and pins",
                },
            });
        });

        test("should add reactions and enforce unique emoji per user per message", async () => {
            const reaction = await prisma.message_reactions.create({
                data: {
                    message_id: testMsg.id,
                    user_id: realUserB.id,
                    emoji: "🚀",
                },
            });

            assert.ok(reaction.id);
            assert.strictEqual(reaction.emoji, "🚀");

            // Adding different emoji from same user should succeed
            const reaction2 = await prisma.message_reactions.create({
                data: {
                    message_id: testMsg.id,
                    user_id: realUserB.id,
                    emoji: "👍",
                },
            });
            assert.ok(reaction2.id);

            // Adding identical emoji from same user should fail unique constraint
            await assert.rejects(
                async () => {
                    await prisma.message_reactions.create({
                        data: {
                            message_id: testMsg.id,
                            user_id: realUserB.id,
                            emoji: "🚀",
                        },
                    });
                },
                (err) => err.code === "P2002" || err.message.includes("uq_message_reaction_user_emoji")
            );
        });

        test("should record read receipts and prevent duplicate receipts for the same user", async () => {
            const receipt = await prisma.message_read_receipts.create({
                data: {
                    message_id: testMsg.id,
                    user_id: realUserB.id,
                },
            });

            assert.ok(receipt.id);
            assert.ok(receipt.read_at);

            // Duplicate read receipt for same user and message must fail unique constraint
            await assert.rejects(
                async () => {
                    await prisma.message_read_receipts.create({
                        data: {
                            message_id: testMsg.id,
                            user_id: realUserB.id,
                        },
                    });
                },
                (err) => err.code === "P2002" || err.message.includes("uq_message_read_receipt")
            );
        });

        test("should pin a message and enforce that a message cannot be pinned more than once", async () => {
            const pin = await prisma.message_pins.create({
                data: {
                    message_id: testMsg.id,
                    channel_id: testChan.id,
                    pinned_by: realUserA.id,
                },
            });

            assert.ok(pin.id);
            assert.strictEqual(pin.message_id, testMsg.id);

            // Duplicate pin on same message must fail unique constraint
            await assert.rejects(
                async () => {
                    await prisma.message_pins.create({
                        data: {
                            message_id: testMsg.id,
                            channel_id: testChan.id,
                            pinned_by: realUserB.id,
                        },
                    });
                },
                (err) => err.code === "P2002" || err.message.includes("uq_message_pin_message")
            );
        });
    });

    describe("6. Foreign Key Cascading Deletions", () => {
        test("should cascade delete all members, messages, reactions, receipts and pins when channel is deleted", async () => {
            const chan = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: `test-chat-cascade-${Date.now()}`,
                    created_by: realUserA.id,
                    channel_members: {
                        create: [{ user_id: realUserA.id }, { user_id: realUserB.id }],
                    },
                },
            });

            const msg = await prisma.messages.create({
                data: {
                    channel_id: chan.id,
                    sender_id: realUserA.id,
                    content: "Message doomed to cascade",
                },
            });

            await prisma.message_reactions.create({
                data: { message_id: msg.id, user_id: realUserB.id, emoji: "🔥" },
            });

            await prisma.message_read_receipts.create({
                data: { message_id: msg.id, user_id: realUserB.id },
            });

            await prisma.message_pins.create({
                data: { message_id: msg.id, channel_id: chan.id, pinned_by: realUserA.id },
            });

            // Delete the channel
            await prisma.channels.delete({ where: { id: chan.id } });

            // Verify cascading cleanup
            const remainingMembers = await prisma.channel_members.count({ where: { channel_id: chan.id } });
            const remainingMsgs = await prisma.messages.count({ where: { channel_id: chan.id } });
            const remainingReactions = await prisma.message_reactions.count({ where: { message_id: msg.id } });
            const remainingReceipts = await prisma.message_read_receipts.count({ where: { message_id: msg.id } });
            const remainingPins = await prisma.message_pins.count({ where: { message_id: msg.id } });

            assert.strictEqual(remainingMembers, 0);
            assert.strictEqual(remainingMsgs, 0);
            assert.strictEqual(remainingReactions, 0);
            assert.strictEqual(remainingReceipts, 0);
            assert.strictEqual(remainingPins, 0);
        });

        test("should cascade delete all members, messages and pins when conversation is deleted", async () => {
            const conv = await prisma.conversations.create({
                data: {
                    workspace_id: testWorkspace.id,
                    type: "GROUP",
                    title: "ChatTest Cascade Conv",
                    created_by: realUserA.id,
                    conversation_members: {
                        create: [{ user_id: realUserA.id }, { user_id: realUserC.id }],
                    },
                },
            });

            const msg = await prisma.messages.create({
                data: {
                    conversation_id: conv.id,
                    sender_id: realUserA.id,
                    content: "Conv message doomed to cascade",
                },
            });

            await prisma.message_pins.create({
                data: { message_id: msg.id, conversation_id: conv.id, pinned_by: realUserA.id },
            });

            // Delete conversation
            await prisma.conversations.delete({ where: { id: conv.id } });

            const remainingMembers = await prisma.conversation_members.count({ where: { conversation_id: conv.id } });
            const remainingMsgs = await prisma.messages.count({ where: { conversation_id: conv.id } });
            const remainingPins = await prisma.message_pins.count({ where: { conversation_id: conv.id } });

            assert.strictEqual(remainingMembers, 0);
            assert.strictEqual(remainingMsgs, 0);
            assert.strictEqual(remainingPins, 0);
        });
    });

    describe("7. Dynamic Real User Invariant Enforcement", () => {
        test("should reject creating a message with non-existent sender_id", async () => {
            const validChan = await prisma.channels.create({
                data: {
                    workspace_id: testWorkspace.id,
                    name: `test-chat-fk-${Date.now()}`,
                    created_by: realUserA.id,
                },
            });

            const fakeUserId = "00000000-0000-0000-0000-000000000000";

            await assert.rejects(
                async () => {
                    await prisma.messages.create({
                        data: {
                            channel_id: validChan.id,
                            sender_id: fakeUserId,
                            content: "Message from ghost user",
                        },
                    });
                },
                (err) => err.code === "P2003" // Foreign key constraint violation
            );
        });

        test("should reject creating a channel with non-existent created_by user", async () => {
            const fakeUserId = "00000000-0000-0000-0000-000000000000";

            await assert.rejects(
                async () => {
                    await prisma.channels.create({
                        data: {
                            workspace_id: testWorkspace.id,
                            name: `test-chat-ghost-${Date.now()}`,
                            created_by: fakeUserId,
                        },
                    });
                },
                (err) => err.code === "P2003"
            );
        });
    });
});
