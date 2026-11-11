import React, { useRef, useEffect } from "react";
import dayjs from "dayjs";
import {
  FiHash,
  FiLock,
  FiInfo,
  FiLoader,
  FiMessageSquare,
  FiSearch,
  FiBookmark,
} from "react-icons/fi";
import MessageItem from "./MessageItem";
import MessageComposer from "./MessageComposer";

export default function ChatMainPanel({
  activeTarget,
  messages = [],
  loadingMessages = false,
  loadingMore = false,
  hasMoreMessages = false,
  onLoadOlderMessages,
  currentUserId,
  replyingToMessage,
  setReplyingToMessage,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTogglePin,
  pinnedMessages = [],
  onOpenPins,
  onOpenSearch,
  workspaceMembers = [],
  emitTyping,
  typingUsers = [],
  presenceMap = {},
  infoPanelOpen,
  onToggleInfoPanel,
}) {
  const scrollContainerRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const isAtBottomRef = useRef(true);

  // Keep track of scroll position
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;
  };

  // Auto-scroll to bottom on initial load or new message (if user was already near bottom)
  useEffect(() => {
    if (isAtBottomRef.current && typeof bottomAnchorRef.current?.scrollIntoView === "function") {
      bottomAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Target details
  const isChannel = activeTarget?.type === "channel";
  const channelData = isChannel ? activeTarget.data : null;
  const conversationData = !isChannel ? activeTarget?.data : null;

  const targetName = isChannel
    ? channelData?.name || "channel"
    : conversationData?.title ||
      conversationData?.otherMembers?.[0]?.first_name ||
      "Direct Message";

  const targetTopic = isChannel ? channelData?.topic : null;

  const otherUser = !isChannel
    ? conversationData?.otherMembers?.[0] ||
      conversationData?.members?.find((m) => (m.userId || m.user?.id) !== currentUserId)?.user
    : null;

  const isOtherOnline = otherUser?.id && presenceMap[otherUser.id]?.status?.toUpperCase() === "ONLINE";
  const otherLastSeen = otherUser?.id && presenceMap[otherUser.id]?.lastSeen;

  // Typing text formatting
  const typingText =
    typingUsers.length === 1
      ? `${typingUsers[0].first_name || "Someone"} is typing...`
      : typingUsers.length === 2
      ? `${typingUsers[0].first_name} and ${typingUsers[1].first_name} are typing...`
      : typingUsers.length > 2
      ? "Several people are typing..."
      : null;

  if (!activeTarget) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--color-surface)] p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
          <FiMessageSquare size={32} />
        </div>
        <h3 className="text-lg font-bold text-[var(--color-text)]">
          Welcome to TaskFlow Chat
        </h3>
        <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
          Select a channel or conversation from the sidebar to start collaborating with your team in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-[var(--color-surface)]">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 sm:px-6 bg-[var(--color-surface)]">
        <div className="flex items-center gap-3 min-w-0">
          {isChannel ? (
            <div className="flex items-center gap-2 min-w-0">
              {channelData?.type === "PRIVATE" ? (
                <FiLock className="shrink-0 text-[var(--color-brand)]" size={18} />
              ) : (
                <FiHash className="shrink-0 text-[var(--color-brand)]" size={18} />
              )}
              <h2 className="truncate text-base font-bold text-[var(--color-text)]">
                {targetName}
              </h2>
              {targetTopic && (
                <span className="hidden truncate text-xs text-[var(--color-text-subtle)] sm:inline">
                  — {targetTopic}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <span
                  className={`block h-3 w-3 rounded-full ring-2 ring-[var(--color-surface)] ${
                    isOtherOnline ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
              </div>
              <div>
                <h2 className="truncate text-base font-bold text-[var(--color-text)]">
                  {targetName}
                </h2>
                <span className="block text-[11px] text-[var(--color-text-subtle)] leading-none">
                  {isOtherOnline
                    ? "Online"
                    : otherLastSeen
                    ? `Offline · Last seen ${new Date(otherLastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Offline"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Search Button */}
          <button
            type="button"
            onClick={onOpenSearch}
            title="Search messages"
            aria-label="Search messages"
            className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
          >
            <FiSearch size={18} />
          </button>

          {/* Pinned Messages Button */}
          <button
            type="button"
            onClick={onOpenPins}
            title={`View pinned messages (${pinnedMessages.length})`}
            aria-label="View pinned messages"
            className="relative rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
          >
            <FiBookmark size={18} />
            {pinnedMessages.length > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white shadow-xs">
                {pinnedMessages.length}
              </span>
            )}
          </button>

          {/* Right Info Panel Toggle */}
          <button
            type="button"
            onClick={onToggleInfoPanel}
            title={infoPanelOpen ? "Hide Details" : "Show Details"}
            aria-label="Toggle conversation details"
            className={`rounded-lg p-2 transition ${
              infoPanelOpen
                ? "bg-[var(--color-surface-sage)] text-[var(--color-brand)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <FiInfo size={18} />
          </button>
        </div>
      </header>

      {/* Pinned Messages Top Banner (Clickable) */}
      {pinnedMessages.length > 0 && (
        <div
          onClick={onOpenPins}
          className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-sage)] px-4 py-1.5 text-xs text-[var(--color-brand-hover)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-surface-sage)_85%,var(--color-brand))]"
        >
          <div className="flex items-center gap-2 truncate">
            <FiBookmark size={13} className="fill-[var(--color-brand)] shrink-0" />
            <span className="font-semibold">
              {pinnedMessages.length} Pinned Message{pinnedMessages.length > 1 ? "s" : ""}:
            </span>
            <span className="truncate text-[var(--color-text-muted)]">
              {pinnedMessages[0]?.message?.content}
            </span>
          </div>
          <span className="text-[11px] font-semibold underline shrink-0 ml-2">View all</span>
        </div>
      )}

      {/* Message History Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 select-text"
      >
        {/* Load older messages button */}
        {hasMoreMessages && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={onLoadOlderMessages}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <FiLoader className="animate-spin" size={12} />
                  <span>Loading history...</span>
                </>
              ) : (
                <span>Load earlier messages</span>
              )}
            </button>
          </div>
        )}

        {/* Initial Loading Spinner */}
        {loadingMessages ? (
          <div className="flex h-48 items-center justify-center">
            <FiLoader className="animate-spin text-[var(--color-brand)]" size={24} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center px-4 text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
              {isChannel ? <FiHash size={20} /> : <FiMessageSquare size={20} />}
            </div>
            <h4 className="text-sm font-semibold text-[var(--color-text)]">
              {isChannel ? `Welcome to #${targetName}!` : `Conversation with ${targetName}`}
            </h4>
            <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-sm">
              {isChannel
                ? channelData?.description || "This is the start of the channel. Send a message to get started."
                : "This is the beginning of your direct message history. Say hello!"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {messages.map((msg, index) => {
              const prevMsg = messages[index - 1];
              const currentDate = dayjs(msg.createdAt).format("YYYY-MM-DD");
              const prevDate = prevMsg ? dayjs(prevMsg.createdAt).format("YYYY-MM-DD") : null;
              const isDifferentDay = currentDate !== prevDate;

              const dateLabel = dayjs(msg.createdAt).isSame(dayjs(), "day")
                ? "Today"
                : dayjs(msg.createdAt).isSame(dayjs().subtract(1, "day"), "day")
                ? "Yesterday"
                : dayjs(msg.createdAt).format("MMMM D, YYYY");

              return (
                <React.Fragment key={msg.id}>
                  {isDifferentDay && (
                    <div className="relative my-4 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[var(--color-border)]" />
                      </div>
                      <span className="relative rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] shadow-xs">
                        {dateLabel}
                      </span>
                    </div>
                  )}

                  <MessageItem
                    message={msg}
                    currentUserId={currentUserId}
                    onReply={(m) => setReplyingToMessage(m)}
                    onEdit={onEditMessage}
                    onDelete={onDeleteMessage}
                    onToggleReaction={onToggleReaction}
                    onTogglePin={onTogglePin}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div ref={bottomAnchorRef} />
      </div>

      {/* Typing Indicator Bar */}
      {typingText && (
        <div className="flex items-center gap-2 px-4 py-1 text-xs text-[var(--color-brand-hover)] italic bg-[var(--color-surface)]">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-brand)]" />
          </span>
          <span>{typingText}</span>
        </div>
      )}

      {/* Message Composer with Mention Autocomplete */}
      <MessageComposer
        activeTarget={activeTarget}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => setReplyingToMessage(null)}
        onSendMessage={onSendMessage}
        emitTyping={emitTyping}
        workspaceMembers={workspaceMembers}
      />
    </div>
  );
}
