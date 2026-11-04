import React, { useState } from "react";
import MainLayout from "../../layouts/MainLayout";
import { useChatState } from "./useChatState";
import ChatSidebar from "./components/ChatSidebar";
import ChatMainPanel from "./components/ChatMainPanel";
import ChatInfoPanel from "./components/ChatInfoPanel";
import CreateChannelModal from "./components/CreateChannelModal";
import NewDirectMessageModal from "./components/NewDirectMessageModal";
import ChatSearchModal from "./components/ChatSearchModal";
import PinnedMessagesDrawer from "./components/PinnedMessagesDrawer";

export default function Chat() {
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isNewDMOpen, setIsNewDMOpen] = useState(false);

  const {
    currentUser,
    currentUserId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceMembers,
    channels,
    conversations,
    unreadCounts,
    activeTarget,
    setActiveTarget,
    messages,
    loadingMessages,
    loadingMore,
    hasMoreMessages,
    loadOlderMessages,
    handleSendMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleToggleReaction,
    handleTogglePin,
    pinnedMessages,
    loadingPins,
    pinnedPanelOpen,
    setPinnedPanelOpen,
    searchModalOpen,
    setSearchModalOpen,
    searchResults,
    searchingMessages,
    handleSearchMessages,
    emitTyping,
    typingUsers,
    presenceMap,
    infoPanelOpen,
    setInfoPanelOpen,
    searchQuery,
    setSearchQuery,
    replyingToMessage,
    setReplyingToMessage,
    refreshWorkspaceData,
  } = useChatState();

  const handleChannelCreated = (newChannel) => {
    refreshWorkspaceData();
    setActiveTarget({
      type: "channel",
      id: newChannel.id,
      data: newChannel,
    });
  };

  const handleConversationSelected = (conv) => {
    refreshWorkspaceData();
    setActiveTarget({
      type: "conversation",
      id: conv.id,
      data: conv,
    });
  };

  const handleSelectSearchResult = (searchMsg) => {
    if (searchMsg.channelId) {
      const channel = channels.find((c) => c.id === searchMsg.channelId) || {
        id: searchMsg.channelId,
        name: searchMsg.channel?.name || "channel",
      };
      setActiveTarget({ type: "channel", id: searchMsg.channelId, data: channel });
    } else if (searchMsg.conversationId) {
      const conv = conversations.find((c) => c.id === searchMsg.conversationId) || {
        id: searchMsg.conversationId,
        title: searchMsg.conversation?.title || "Direct Message",
      };
      setActiveTarget({ type: "conversation", id: searchMsg.conversationId, data: conv });
    }
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-8.5rem)] min-h-[580px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <div className="flex flex-1 h-full min-h-0 overflow-hidden">
          {/* Left Panel: Channels & DMs */}
          <ChatSidebar
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={setActiveWorkspaceId}
            channels={channels}
            conversations={conversations}
            unreadCounts={unreadCounts}
            activeTarget={activeTarget}
            onSelectTarget={setActiveTarget}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            presenceMap={presenceMap}
            currentUserId={currentUserId}
            onOpenCreateChannel={() => setIsCreateChannelOpen(true)}
            onOpenNewDM={() => setIsNewDMOpen(true)}
          />

          {/* Main Conversation & Composer */}
          <ChatMainPanel
            activeTarget={activeTarget}
            messages={messages}
            loadingMessages={loadingMessages}
            loadingMore={loadingMore}
            hasMoreMessages={hasMoreMessages}
            onLoadOlderMessages={loadOlderMessages}
            currentUserId={currentUserId}
            replyingToMessage={replyingToMessage}
            setReplyingToMessage={setReplyingToMessage}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onToggleReaction={handleToggleReaction}
            onTogglePin={handleTogglePin}
            pinnedMessages={pinnedMessages}
            onOpenPins={() => setPinnedPanelOpen(true)}
            onOpenSearch={() => setSearchModalOpen(true)}
            workspaceMembers={workspaceMembers}
            emitTyping={emitTyping}
            typingUsers={typingUsers}
            presenceMap={presenceMap}
            infoPanelOpen={infoPanelOpen}
            onToggleInfoPanel={() => setInfoPanelOpen((prev) => !prev)}
          />

          {/* Collapsible Right Info Panel */}
          {infoPanelOpen && activeTarget && (
            <ChatInfoPanel
              activeTarget={activeTarget}
              presenceMap={presenceMap}
              currentUserId={currentUserId}
              onClose={() => setInfoPanelOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Modals & Drawers */}
      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        onClose={() => setIsCreateChannelOpen(false)}
        workspaceId={activeWorkspaceId}
        onChannelCreated={handleChannelCreated}
      />

      <NewDirectMessageModal
        isOpen={isNewDMOpen}
        onClose={() => setIsNewDMOpen(false)}
        workspaceId={activeWorkspaceId}
        workspaceMembers={workspaceMembers}
        currentUserId={currentUserId}
        presenceMap={presenceMap}
        onSelectConversation={handleConversationSelected}
      />

      <ChatSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        searchResults={searchResults}
        searching={searchingMessages}
        onSearch={handleSearchMessages}
        onSelectResult={handleSelectSearchResult}
      />

      <PinnedMessagesDrawer
        isOpen={pinnedPanelOpen}
        onClose={() => setPinnedPanelOpen(false)}
        pinnedMessages={pinnedMessages}
        loading={loadingPins}
        onUnpin={handleTogglePin}
      />
    </MainLayout>
  );
}
