import React, { useState, useRef, useEffect } from "react";
import dayjs from "dayjs";
import {
  FiCornerUpLeft,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiX,
  FiSmile,
  FiBookmark,
} from "react-icons/fi";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀", "👀"];

export default function MessageItem({
  message,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  onTogglePin,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editInputRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [isEditing]);

  // Click outside to close emoji picker
  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  const sender = message.sender || {};
  const senderId = message.senderId || sender.id;
  const isAuthor = currentUserId && currentUserId === senderId;

  const fullName =
    [sender.first_name || sender.firstName, sender.last_name || sender.lastName]
      .filter(Boolean)
      .join(" ") ||
    sender.name ||
    "Team Member";

  const initials = (
    [sender.first_name?.[0] || sender.firstName?.[0], sender.last_name?.[0] || sender.lastName?.[0]]
      .filter(Boolean)
      .join("") ||
    fullName[0] ||
    "U"
  ).toUpperCase();

  const avatarUrl = sender.profile_picture || sender.profilePicture || null;
  const isDeleted = Boolean(message.isDeleted);
  const isEdited = Boolean(message.isEdited);
  const isPinned = Boolean(message.isPinned);
  const formattedTime = dayjs(message.createdAt).format("h:mm A");

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      handleCancelEdit();
      return;
    }
    await onEdit(message.id, editContent.trim());
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      onDelete(message.id);
    }
  };

  // Group reactions
  const groupedReactions = Object.values(
    (message.reactions || []).reduce((acc, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = {
          emoji: r.emoji,
          count: 0,
          users: [],
          hasReacted: false,
        };
      }
      acc[r.emoji].count += 1;
      acc[r.emoji].users.push(r.user || { id: r.userId, first_name: "Member" });
      if (r.userId === currentUserId || r.user?.id === currentUserId) {
        acc[r.emoji].hasReacted = true;
      }
      return acc;
    }, {})
  );

  // Parse and highlight @mentions in message content
  const renderMessageContent = (text) => {
    if (!text) return null;
    const parts = [];
    const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)|@([a-zA-Z0-9._-]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const mentionName = match[1] || match[3];
      parts.push(
        <span
          key={`mention-${match.index}`}
          className="inline-flex items-center rounded bg-[var(--color-surface-sage)] px-1.5 py-0.5 text-xs font-semibold text-[var(--color-brand-hover)] border border-[color-mix(in_srgb,var(--color-brand)_25%,transparent)]"
        >
          @{mentionName}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div
      className={`group relative flex items-start gap-3.5 px-4 py-2 hover:bg-[var(--color-surface-muted)] transition-colors duration-150 ${
        isEditing ? "bg-[var(--color-surface-muted)]" : ""
      } ${isPinned ? "border-l-2 border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-surface-sage)_30%,transparent)]" : ""}`}
      data-testid={`chat-message-${message.id}`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={fullName}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--color-border)]"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)] ring-1 ring-[var(--color-border)]">
            {initials}
          </div>
        )}
      </div>

      {/* Message Body */}
      <div className="flex-1 min-w-0">
        {/* Pinned Indicator Banner */}
        {isPinned && (
          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)]">
            <FiBookmark size={11} className="fill-[var(--color-brand)]" />
            <span>Pinned</span>
            {message.pinInfo?.pinnedByUser && (
              <span className="text-[10px] text-[var(--color-text-subtle)] font-normal">
                by {message.pinInfo.pinnedByUser.first_name}
              </span>
            )}
          </div>
        )}

        {/* Author Header */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {fullName}
          </span>
          <span className="text-[11px] text-[var(--color-text-subtle)]">
            {formattedTime}
          </span>
          {isEdited && !isDeleted && (
            <span className="text-[10px] text-[var(--color-text-subtle)] italic">
              (edited)
            </span>
          )}
        </div>

        {/* Parent reply preview if present */}
        {message.parent_message && (
          <div className="mb-1.5 flex items-center gap-1.5 rounded border-l-2 border-[var(--color-brand)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
            <FiCornerUpLeft className="shrink-0 text-[var(--color-brand)]" size={12} />
            <span className="font-medium text-[var(--color-text)]">
              {message.parent_message.sender?.first_name || "Reply"}:
            </span>
            <span className="truncate max-w-md">{message.parent_message.content}</span>
          </div>
        )}

        {/* Message Content or Edit Input */}
        {isEditing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              ref={editInputRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)] shadow-inner focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--color-brand)] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[var(--color-brand-hover)]"
              >
                <FiCheck size={12} /> Save
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)]"
              >
                <FiX size={12} /> Cancel
              </button>
              <span className="text-[10px] text-[var(--color-text-subtle)]">
                Press Enter to save, Esc to cancel
              </span>
            </div>
          </div>
        ) : isDeleted ? (
          <p className="text-sm italic text-[var(--color-text-subtle)]">
            This message was deleted.
          </p>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm text-[var(--color-text)] leading-relaxed">
            {renderMessageContent(message.content)}
          </div>
        )}

        {/* Reactions Section */}
        {groupedReactions.length > 0 && !isDeleted && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {groupedReactions.map((gr) => {
              const tooltipNames = gr.users
                .map((u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "Member")
                .slice(0, 3)
                .join(", ");
              const extraCount = gr.users.length - 3;
              const tooltip = extraCount > 0 ? `${tooltipNames} +${extraCount}` : tooltipNames;

              return (
                <button
                  key={gr.emoji}
                  type="button"
                  onClick={() => onToggleReaction && onToggleReaction(message.id, gr.emoji)}
                  title={tooltip}
                  aria-label={`React ${gr.emoji}`}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium transition ${
                    gr.hasReacted
                      ? "border border-[var(--color-brand)] bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]"
                      : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  <span>{gr.emoji}</span>
                  <span className="text-[11px] font-semibold">{gr.count}</span>
                </button>
              );
            })}

            {/* Quick Add Reaction Button */}
            {onToggleReaction && (
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-subtle)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition text-xs"
                title="Add reaction"
                aria-label="Add reaction"
              >
                +
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hover Action Toolbar */}
      {!isDeleted && !isEditing && (
        <div className="absolute right-4 top-2 hidden group-hover:flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 shadow-sm z-10">
          {/* Reaction Trigger */}
          {onToggleReaction && (
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                title="Add Reaction"
                aria-label="Add Reaction"
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
              >
                <FiSmile size={14} />
              </button>

              {/* Floating Emoji Picker Popover */}
              {showEmojiPicker && (
                <div className="absolute right-0 top-7 z-30 flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onToggleReaction(message.id, emoji);
                        setShowEmojiPicker(false);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-[var(--color-surface-muted)] hover:scale-110 transition"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pin / Unpin Button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(message)}
              title={isPinned ? "Unpin message" : "Pin message"}
              aria-label={isPinned ? "Unpin message" : "Pin message"}
              className={`rounded p-1 transition ${
                isPinned
                  ? "text-[var(--color-brand)] hover:bg-[var(--color-surface-sage)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <FiBookmark size={14} className={isPinned ? "fill-[var(--color-brand)]" : ""} />
            </button>
          )}

          {/* Reply Button */}
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(message)}
              title="Reply"
              aria-label="Reply to message"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
            >
              <FiCornerUpLeft size={14} />
            </button>
          )}

          {/* Edit / Delete Buttons */}
          {isAuthor && (
            <>
              <button
                type="button"
                onClick={handleStartEdit}
                title="Edit"
                aria-label="Edit message"
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
              >
                <FiEdit2 size={14} />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                title="Delete"
                aria-label="Delete message"
                className="rounded p-1 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition"
              >
                <FiTrash2 size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
