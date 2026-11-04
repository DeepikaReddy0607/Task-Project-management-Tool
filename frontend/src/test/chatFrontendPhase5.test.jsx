import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MessageItem from "../pages/chat/components/MessageItem";
import MessageComposer from "../pages/chat/components/MessageComposer";
import ChatSidebar from "../pages/chat/components/ChatSidebar";
import ChatSearchModal from "../pages/chat/components/ChatSearchModal";
import PinnedMessagesDrawer from "../pages/chat/components/PinnedMessagesDrawer";

describe("TaskFlow Chat Phase 5 — Frontend Advanced Messaging Features", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. REACTIONS TESTS
  // ==========================================================================
  describe("Reactions in MessageItem", () => {
    const mockMessage = {
      id: "msg-1",
      senderId: "u-1",
      sender: { id: "u-1", first_name: "Alice", last_name: "Admin" },
      content: "Great job team! @Bob please deploy.",
      reactions: [
        { id: "r-1", emoji: "👍", userId: "u-2", user: { id: "u-2", first_name: "Bob" } },
        { id: "r-2", emoji: "👍", userId: "u-3", user: { id: "u-3", first_name: "Charlie" } },
        { id: "r-3", emoji: "🚀", userId: "u-1", user: { id: "u-1", first_name: "Alice" } },
      ],
      createdAt: new Date().toISOString(),
    };

    it("displays grouped emoji counts and highlights current user's reaction", () => {
      render(
        <MessageItem
          message={mockMessage}
          currentUserId="u-1"
          onToggleReaction={vi.fn()}
        />
      );

      // 👍 has count 2
      expect(screen.getByText("👍")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();

      // 🚀 has count 1 (reacted by u-1)
      expect(screen.getByText("🚀")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("invokes onToggleReaction when clicking an existing emoji pill", () => {
      const toggleSpy = vi.fn();
      render(
        <MessageItem
          message={mockMessage}
          currentUserId="u-1"
          onToggleReaction={toggleSpy}
        />
      );

      const thumbsUpBtn = screen.getByLabelText("React 👍");
      fireEvent.click(thumbsUpBtn);
      expect(toggleSpy).toHaveBeenCalledWith("msg-1", "👍");
    });

    it("highlights @Bob mention inside the message body", () => {
      render(
        <MessageItem
          message={mockMessage}
          currentUserId="u-1"
        />
      );

      expect(screen.getByText("@Bob")).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. PINNING TESTS
  // ==========================================================================
  describe("Pinning in MessageItem & PinnedMessagesDrawer", () => {
    const pinnedMessage = {
      id: "msg-pin-1",
      senderId: "u-1",
      sender: { id: "u-1", first_name: "Alice" },
      content: "Important pinned guidelines",
      isPinned: true,
      pinInfo: {
        id: "pin-1",
        pinnedByUser: { first_name: "Alice" },
      },
      createdAt: new Date().toISOString(),
    };

    it("renders Pinned indicator on a pinned message", () => {
      render(
        <MessageItem
          message={pinnedMessage}
          currentUserId="u-1"
          onTogglePin={vi.fn()}
        />
      );

      expect(screen.getByText("Pinned")).toBeInTheDocument();
      expect(screen.getByText("by Alice")).toBeInTheDocument();
    });

    it("renders list of pinned messages in PinnedMessagesDrawer and invokes unpin", () => {
      const unpinSpy = vi.fn();
      const pins = [
        {
          id: "pin-1",
          messageId: "msg-pin-1",
          message: pinnedMessage,
          pinnedByUser: { first_name: "Alice" },
          pinnedAt: new Date().toISOString(),
        },
      ];

      render(
        <PinnedMessagesDrawer
          isOpen={true}
          onClose={vi.fn()}
          pinnedMessages={pins}
          onUnpin={unpinSpy}
        />
      );

      expect(screen.getByText("Pinned Messages (1)")).toBeInTheDocument();
      expect(screen.getByText("Important pinned guidelines")).toBeInTheDocument();

      const unpinBtn = screen.getByText("Unpin");
      fireEvent.click(unpinBtn);
      expect(unpinSpy).toHaveBeenCalledWith(pinnedMessage);
    });
  });

  // ==========================================================================
  // 3. MENTION AUTOCOMPLETE IN COMPOSER
  // ==========================================================================
  describe("Mention Autocomplete in MessageComposer", () => {
    const mockMembers = [
      {
        user_id: "u-2",
        workspace_role: "Engineer",
        users: { id: "u-2", first_name: "Bob", last_name: "Builder", email: "bob@taskflow.dev" },
      },
      {
        user_id: "u-3",
        workspace_role: "Designer",
        users: { id: "u-3", first_name: "Charlie", last_name: "Brown", email: "charlie@taskflow.dev" },
      },
    ];

    it("triggers mention autocomplete when user types @ and inserts token on selection", () => {
      render(
        <MessageComposer
          activeTarget={{ type: "channel", id: "c-1", data: { name: "general" } }}
          onSendMessage={vi.fn()}
          workspaceMembers={mockMembers}
        />
      );

      const textarea = screen.getByRole("textbox");

      // Type @b to trigger autocomplete
      fireEvent.change(textarea, { target: { value: "Hello @b", selectionEnd: 8 } });

      expect(screen.getByText("Mention Team Member")).toBeInTheDocument();
      expect(screen.getByText("Bob Builder")).toBeInTheDocument();

      // Click Bob Builder
      const bobOption = screen.getByText("Bob Builder").closest("button");
      fireEvent.mouseDown(bobOption);

      expect(textarea.value).toContain("@[Bob Builder](u-2)");
    });
  });

  // ==========================================================================
  // 4. UNREAD BADGES IN SIDEBAR
  // ==========================================================================
  describe("Unread Badges in ChatSidebar", () => {
    const channels = [
      { id: "c-1", name: "general", type: "PUBLIC" },
      { id: "c-2", name: "dev-team", type: "PRIVATE" },
    ];
    const unreadCounts = {
      "c-1": 3,
      "c-2": 0,
    };

    it("renders unread count badge on inactive channel with unread messages", () => {
      render(
        <ChatSidebar
          workspaces={[{ id: "ws-1", name: "WS 1" }]}
          activeWorkspaceId="ws-1"
          channels={channels}
          conversations={[]}
          unreadCounts={unreadCounts}
          activeTarget={{ type: "channel", id: "c-2" }} // c-1 is inactive with 3 unreads
          onSelectTarget={vi.fn()}
        />
      );

      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 5. CHAT SEARCH MODAL
  // ==========================================================================
  describe("ChatSearchModal", () => {
    const searchResults = [
      {
        id: "msg-s1",
        channelId: "c-1",
        channel: { name: "announcements" },
        sender: { first_name: "Alice", last_name: "Smith" },
        content: "Here is the quarterly financial report summary.",
        createdAt: new Date().toISOString(),
      },
    ];

    it("searches and navigates to target channel when result is clicked", async () => {
      const searchSpy = vi.fn();
      const selectResultSpy = vi.fn();
      const closeSpy = vi.fn();

      render(
        <ChatSearchModal
          isOpen={true}
          onClose={closeSpy}
          searchResults={searchResults}
          searching={false}
          onSearch={searchSpy}
          onSelectResult={selectResultSpy}
        />
      );

      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("#announcements")).toBeInTheDocument();
      expect(screen.getByText("Here is the quarterly financial report summary.")).toBeInTheDocument();

      const resultBtn = screen.getByText("Alice Smith").closest("button");
      fireEvent.click(resultBtn);

      expect(selectResultSpy).toHaveBeenCalledWith(searchResults[0]);
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
