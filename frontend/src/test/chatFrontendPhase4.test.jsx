import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import MessageItem from "../pages/chat/components/MessageItem";
import MessageComposer from "../pages/chat/components/MessageComposer";
import ChatSidebar from "../pages/chat/components/ChatSidebar";
import ChatMainPanel from "../pages/chat/components/ChatMainPanel";
import CreateChannelModal from "../pages/chat/components/CreateChannelModal";
import NewDirectMessageModal from "../pages/chat/components/NewDirectMessageModal";
import * as chatApi from "../services/api/chatApi";

describe("TaskFlow Chat Phase 4 — Frontend UI & Integration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. MessageItem Component Tests
  // ==========================================================================
  describe("MessageItem", () => {
    const mockMessage = {
      id: "msg-1",
      senderId: "u-1",
      sender: {
        id: "u-1",
        first_name: "Alice",
        last_name: "Smith",
        profile_picture: null,
      },
      content: "Hello everyone!",
      isEdited: false,
      isDeleted: false,
      createdAt: new Date("2026-11-04T12:00:00Z").toISOString(),
    };

    it("renders sender name, timestamp, and message content", () => {
      render(
        <MessageItem
          message={mockMessage}
          currentUserId="u-2"
          onReply={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Hello everyone!")).toBeInTheDocument();
      expect(screen.getByText("AS")).toBeInTheDocument(); // Initials
    });

    it("displays (edited) badge when message isEdited is true", () => {
      render(
        <MessageItem
          message={{ ...mockMessage, isEdited: true }}
          currentUserId="u-2"
          onReply={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText("(edited)")).toBeInTheDocument();
    });

    it("displays deleted tombstone placeholder when isDeleted is true", () => {
      render(
        <MessageItem
          message={{ ...mockMessage, isDeleted: true }}
          currentUserId="u-1"
          onReply={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText("This message was deleted.")).toBeInTheDocument();
      expect(screen.queryByText("Hello everyone!")).not.toBeInTheDocument();
    });

    it("allows author to enter edit mode, change text, and save", async () => {
      const editSpy = vi.fn().mockResolvedValue({});
      render(
        <MessageItem
          message={mockMessage}
          currentUserId="u-1"
          onReply={vi.fn()}
          onEdit={editSpy}
          onDelete={vi.fn()}
        />
      );

      const editBtn = screen.getByLabelText("Edit message");
      fireEvent.click(editBtn);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("Hello everyone!");

      fireEvent.change(textarea, { target: { value: "Updated content!" } });
      const saveBtn = screen.getByText("Save");
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(editSpy).toHaveBeenCalledWith("msg-1", "Updated content!");
    });
  });

  // ==========================================================================
  // 2. MessageComposer Component Tests
  // ==========================================================================
  describe("MessageComposer", () => {
    const activeTarget = {
      type: "channel",
      id: "chan-1",
      data: { name: "general" },
    };

    it("disables send button when textarea is empty", () => {
      render(
        <MessageComposer
          activeTarget={activeTarget}
          replyingToMessage={null}
          onCancelReply={vi.fn()}
          onSendMessage={vi.fn()}
          emitTyping={vi.fn()}
        />
      );

      const sendBtn = screen.getByLabelText("Send message");
      expect(sendBtn).toBeDisabled();
    });

    it("enables send button and submits message on click", async () => {
      const sendSpy = vi.fn().mockResolvedValue({});
      const emitTypingSpy = vi.fn();

      render(
        <MessageComposer
          activeTarget={activeTarget}
          replyingToMessage={null}
          onCancelReply={vi.fn()}
          onSendMessage={sendSpy}
          emitTyping={emitTypingSpy}
        />
      );

      const textarea = screen.getByPlaceholderText("Message #general...");
      fireEvent.change(textarea, { target: { value: "Hello TaskFlow!" } });

      const sendBtn = screen.getByLabelText("Send message");
      expect(sendBtn).not.toBeDisabled();

      fireEvent.click(sendBtn);
      expect(sendSpy).toHaveBeenCalledWith("Hello TaskFlow!");
      expect(textarea.value).toBe("");
    });

    it("displays replying preview banner and allows canceling", () => {
      const cancelReplySpy = vi.fn();
      const parentMsg = {
        id: "parent-1",
        content: "Original text",
        sender: { first_name: "Bob" },
      };

      render(
        <MessageComposer
          activeTarget={activeTarget}
          replyingToMessage={parentMsg}
          onCancelReply={cancelReplySpy}
          onSendMessage={vi.fn()}
          emitTyping={vi.fn()}
        />
      );

      expect(screen.getByText("Replying to Bob:")).toBeInTheDocument();
      expect(screen.getByText("Original text")).toBeInTheDocument();

      const cancelBtn = screen.getByLabelText("Cancel reply");
      fireEvent.click(cancelBtn);
      expect(cancelReplySpy).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. ChatSidebar Component Tests
  // ==========================================================================
  describe("ChatSidebar", () => {
    const mockChannels = [
      { id: "c-1", name: "general", type: "PUBLIC" },
      { id: "c-2", name: "leads-private", type: "PRIVATE" },
    ];
    const mockConversations = [
      {
        id: "conv-1",
        title: "Jane Doe",
        otherMembers: [{ id: "u-jane", first_name: "Jane", last_name: "Doe" }],
        lastMessage: { content: "See you later", is_deleted: false },
      },
    ];
    const mockWorkspaces = [
      { id: "ws-1", name: "Engineering Core" },
      { id: "ws-2", name: "Marketing" },
    ];

    it("renders channel list, direct messages, and workspace selector", () => {
      render(
        <ChatSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          channels={mockChannels}
          conversations={mockConversations}
          activeTarget={{ type: "channel", id: "c-1" }}
          onSelectTarget={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          presenceMap={{ "u-jane": { status: "ONLINE" } }}
          currentUserId="u-1"
          onOpenCreateChannel={vi.fn()}
          onOpenNewDM={vi.fn()}
        />
      );

      expect(screen.getByText("general")).toBeInTheDocument();
      expect(screen.getByText("leads-private")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("See you later")).toBeInTheDocument();
    });

    it("filters channels and DMs when search query is entered", () => {
      render(
        <ChatSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={vi.fn()}
          channels={mockChannels}
          conversations={mockConversations}
          activeTarget={{ type: "channel", id: "c-1" }}
          onSelectTarget={vi.fn()}
          searchQuery="leads"
          onSearchChange={vi.fn()}
          presenceMap={{}}
          currentUserId="u-1"
          onOpenCreateChannel={vi.fn()}
          onOpenNewDM={vi.fn()}
        />
      );

      expect(screen.getByText("leads-private")).toBeInTheDocument();
      expect(screen.queryByText("general")).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 4. ChatMainPanel Component Tests
  // ==========================================================================
  describe("ChatMainPanel", () => {
    const activeTarget = {
      type: "channel",
      id: "c-1",
      data: { name: "announcements", topic: "Company news" },
    };

    it("renders active channel header and topic", () => {
      render(
        <ChatMainPanel
          activeTarget={activeTarget}
          messages={[]}
          loadingMessages={false}
          loadingMore={false}
          hasMoreMessages={false}
          onLoadOlderMessages={vi.fn()}
          currentUserId="u-1"
          replyingToMessage={null}
          setReplyingToMessage={vi.fn()}
          onSendMessage={vi.fn()}
          onEditMessage={vi.fn()}
          onDeleteMessage={vi.fn()}
          emitTyping={vi.fn()}
          typingUsers={[]}
          presenceMap={{}}
          infoPanelOpen={true}
          onToggleInfoPanel={vi.fn()}
        />
      );

      expect(screen.getByText("announcements")).toBeInTheDocument();
      expect(screen.getByText("— Company news")).toBeInTheDocument();
    });

    it("displays typing indicator when user is typing", () => {
      render(
        <ChatMainPanel
          activeTarget={activeTarget}
          messages={[]}
          loadingMessages={false}
          loadingMore={false}
          hasMoreMessages={false}
          onLoadOlderMessages={vi.fn()}
          currentUserId="u-1"
          replyingToMessage={null}
          setReplyingToMessage={vi.fn()}
          onSendMessage={vi.fn()}
          onEditMessage={vi.fn()}
          onDeleteMessage={vi.fn()}
          emitTyping={vi.fn()}
          typingUsers={[{ id: "u-2", first_name: "Carlos" }]}
          presenceMap={{}}
          infoPanelOpen={true}
          onToggleInfoPanel={vi.fn()}
        />
      );

      expect(screen.getByText("Carlos is typing...")).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 5. CreateChannelModal Tests
  // ==========================================================================
  describe("CreateChannelModal", () => {
    it("submits new channel creation and invokes callback", async () => {
      const createSpy = vi.spyOn(chatApi, "createChannel").mockResolvedValue({
        channel: { id: "c-new", name: "launch-ready", type: "PUBLIC" },
      });

      const onCreatedSpy = vi.fn();
      const onCloseSpy = vi.fn();

      render(
        <CreateChannelModal
          isOpen={true}
          onClose={onCloseSpy}
          workspaceId="ws-1"
          onChannelCreated={onCreatedSpy}
        />
      );

      const nameInput = screen.getByPlaceholderText("e.g. project-updates");
      fireEvent.change(nameInput, { target: { value: "launch-ready" } });

      const submitBtn = screen.getByText("Create Channel");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith({
          workspaceId: "ws-1",
          name: "launch-ready",
          topic: undefined,
          description: undefined,
          type: "PUBLIC",
        });
        expect(onCreatedSpy).toHaveBeenCalledWith({
          id: "c-new",
          name: "launch-ready",
          type: "PUBLIC",
        });
        expect(onCloseSpy).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 6. NewDirectMessageModal Tests
  // ==========================================================================
  describe("NewDirectMessageModal", () => {
    const mockMembers = [
      {
        user_id: "u-2",
        workspace_role: "Member",
        users: {
          id: "u-2",
          first_name: "Diana",
          last_name: "Prince",
          email: "diana@taskflow.dev",
        },
      },
      {
        user_id: "u-1", // current user -> should be filtered out
        workspace_role: "Admin",
        users: { id: "u-1", first_name: "Self", email: "self@taskflow.dev" },
      },
    ];

    it("displays other workspace members and initiates conversation on click", async () => {
      const getOrCreateSpy = vi
        .spyOn(chatApi, "getOrCreateDirectConversation")
        .mockResolvedValue({
          conversation: { id: "conv-10", type: "DIRECT" },
        });

      const onSelectSpy = vi.fn();
      const onCloseSpy = vi.fn();

      render(
        <NewDirectMessageModal
          isOpen={true}
          onClose={onCloseSpy}
          workspaceId="ws-1"
          workspaceMembers={mockMembers}
          currentUserId="u-1"
          presenceMap={{ "u-2": { status: "ONLINE" } }}
          onSelectConversation={onSelectSpy}
        />
      );

      expect(screen.getByText("Diana Prince")).toBeInTheDocument();
      expect(screen.queryByText("Self")).not.toBeInTheDocument();

      const memberBtn = screen.getByText("Diana Prince").closest("button");
      fireEvent.click(memberBtn);

      await waitFor(() => {
        expect(getOrCreateSpy).toHaveBeenCalledWith("ws-1", "u-2");
        expect(onSelectSpy).toHaveBeenCalledWith({ id: "conv-10", type: "DIRECT" });
        expect(onCloseSpy).toHaveBeenCalled();
      });
    });
  });
});
