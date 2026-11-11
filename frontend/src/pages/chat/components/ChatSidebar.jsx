import React from "react";
import {
  FiHash,
  FiLock,
  FiPlus,
  FiSearch,
  FiChevronDown,
  FiLayers,
} from "react-icons/fi";

export default function ChatSidebar({
  workspaces = [],
  activeWorkspaceId,
  onSelectWorkspace,
  channels = [],
  conversations = [],
  unreadCounts = {},
  activeTarget,
  onSelectTarget,
  searchQuery,
  onSearchChange,
  presenceMap = {},
  currentUserId,
  onOpenCreateChannel,
  onOpenNewDM,
}) {
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Search filter
  const query = (searchQuery || "").toLowerCase().trim();

  const filteredChannels = channels.filter((ch) =>
    ch.name.toLowerCase().includes(query) || (ch.topic && ch.topic.toLowerCase().includes(query))
  );

  const filteredConversations = conversations.filter((c) => {
    const title = c.title || "";
    const memberNames = (c.otherMembers || []).map((m) => `${m.first_name} ${m.last_name}`).join(" ");
    return title.toLowerCase().includes(query) || memberNames.toLowerCase().includes(query);
  });

  return (
    <aside className="flex h-full w-64 md:w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-canvas-soft)] select-none">
      {/* Workspace Switcher Header */}
      <div className="relative border-b border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface)]">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] block mb-1">
          Workspace
        </label>
        {workspaces.length > 1 ? (
          <div className="relative">
            <select
              value={activeWorkspaceId || ""}
              onChange={(e) => onSelectWorkspace(e.target.value)}
              className="w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 pr-8 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-brand)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
              size={14}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <FiLayers className="text-[var(--color-brand)]" size={16} />
            <span className="truncate text-sm font-semibold text-[var(--color-text)]">
              {currentWorkspace?.name || "Workspace"}
            </span>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="p-3">
        <div className="relative">
          <FiSearch
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
            size={14}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search channels or DMs..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-subtle)] transition focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
          />
        </div>
      </div>

      {/* Channels & DMs Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* CHANNELS SECTION */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Channels ({filteredChannels.length})
            </span>
            <button
              type="button"
              onClick={onOpenCreateChannel}
              title="Create Channel"
              aria-label="Create Channel"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-brand)] transition"
            >
              <FiPlus size={14} />
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {filteredChannels.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-[var(--color-text-subtle)] italic">
                {query ? "No channels match search" : "No channels available"}
              </p>
            ) : (
              filteredChannels.map((channel) => {
                const isActive =
                  activeTarget?.type === "channel" && activeTarget.id === channel.id;
                const isPrivate = channel.type === "PRIVATE";
                const unread = unreadCounts[channel.id] || 0;

                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() =>
                      onSelectTarget({ type: "channel", id: channel.id, data: channel })
                    }
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
                      isActive
                        ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)] font-semibold shadow-xs"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {isPrivate ? (
                      <FiLock className="shrink-0 text-[var(--color-text-subtle)]" size={13} />
                    ) : (
                      <FiHash className="shrink-0 text-[var(--color-text-subtle)]" size={14} />
                    )}
                    <span className="truncate flex-1">{channel.name}</span>
                    {unread > 0 && !isActive && (
                      <span className="inline-flex items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                        {unread}
                      </span>
                    )}
                    {channel.isArchived && (
                      <span className="text-[9px] uppercase px-1 rounded bg-slate-200 text-slate-600">
                        Archived
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* DIRECT MESSAGES SECTION */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Direct Messages ({filteredConversations.length})
            </span>
            <button
              type="button"
              onClick={onOpenNewDM}
              title="New Message"
              aria-label="New Direct Message"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-brand)] transition"
            >
              <FiPlus size={14} />
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {filteredConversations.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-[var(--color-text-subtle)] italic">
                {query ? "No direct messages match" : "No direct messages yet"}
              </p>
            ) : (
              filteredConversations.map((conv) => {
                const isActive =
                  activeTarget?.type === "conversation" && activeTarget.id === conv.id;
                const unread = unreadCounts[conv.id] || 0;

                const otherUser =
                  conv.otherMembers?.[0] ||
                  (conv.members?.find((m) => (m.userId || m.user?.id) !== currentUserId)?.user) ||
                  {};

                const isOnline =
                  otherUser?.id &&
                  presenceMap[otherUser.id]?.status?.toUpperCase() === "ONLINE";

                const displayName =
                  conv.title ||
                  ([otherUser.first_name, otherUser.last_name].filter(Boolean).join(" ")) ||
                  "Direct Message";

                const initials = (
                  [otherUser.first_name?.[0], otherUser.last_name?.[0]].filter(Boolean).join("") ||
                  displayName[0] ||
                  "U"
                ).toUpperCase();

                const lastMsgSnippet = conv.lastMessage?.content
                  ? conv.lastMessage.is_deleted
                    ? "Deleted message"
                    : conv.lastMessage.content
                  : null;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() =>
                      onSelectTarget({ type: "conversation", id: conv.id, data: conv })
                    }
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                      isActive
                        ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)] font-semibold shadow-xs"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {/* Avatar with Presence Indicator */}
                    <div className="relative shrink-0">
                      {otherUser.profile_picture ? (
                        <img
                          src={otherUser.profile_picture}
                          alt={displayName}
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[10px] font-bold text-[var(--color-text)]">
                          {initials}
                        </div>
                      )}
                      {/* Presence Dot */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--color-surface)] ${
                          isOnline ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                        title={isOnline ? "Online" : "Offline"}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{displayName}</div>
                      {lastMsgSnippet && (
                        <div className="truncate text-[10px] text-[var(--color-text-subtle)]">
                          {lastMsgSnippet}
                        </div>
                      )}
                    </div>

                    {unread > 0 && !isActive && (
                      <span className="inline-flex items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
