import React, { useState, useRef, useEffect, useCallback } from "react";
import { FiSend, FiX, FiCornerUpLeft, FiAtSign } from "react-icons/fi";

export default function MessageComposer({
  activeTarget,
  replyingToMessage,
  onCancelReply,
  onSendMessage,
  emitTyping,
  workspaceMembers = [],
}) {
  const [content, setContent] = useState("");
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Focus textarea when target changes or when replying
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeTarget?.id, replyingToMessage]);

  const targetName =
    activeTarget?.type === "channel"
      ? `#${activeTarget.data?.name || "channel"}`
      : activeTarget?.data?.title || activeTarget?.data?.name || "Direct Message";

  const handleTyping = useCallback(() => {
    if (emitTyping) {
      emitTyping(true);

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      typingTimerRef.current = setTimeout(() => {
        emitTyping(false);
      }, 3000);
    }
  }, [emitTyping]);

  // Filter mentionable members
  const mentionCandidates = workspaceMembers
    .map((m) => {
      const u = m.users || m.user || m;
      const uId = u.id || m.user_id || m.userId;
      const firstName = u.first_name || u.firstName || "";
      const lastName = u.last_name || u.lastName || "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || u.name || "Member";
      return {
        id: uId,
        firstName,
        lastName,
        fullName,
        email: u.email,
        profilePicture: u.profile_picture || u.profilePicture,
        role: m.workspace_role || m.role || u.role || "Member",
      };
    })
    .filter((m) => {
      if (!mentionQuery) return true;
      const q = mentionQuery.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
      );
    })
    .slice(0, 6);

  // Check mention trigger on text change
  const checkMentionTrigger = (text, cursorPos) => {
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf("@");

    if (lastAt !== -1) {
      const charBeforeAt = lastAt > 0 ? textBeforeCursor[lastAt - 1] : " ";
      if (/\s/.test(charBeforeAt)) {
        const query = textBeforeCursor.slice(lastAt + 1);
        if (!/\s/.test(query)) {
          setMentionQuery(query);
          setMentionIndex(0);
          return;
        }
      }
    }
    setMentionQuery(null);
  };

  const handleChange = (e) => {
    const newText = e.target.value;
    setContent(newText);
    handleTyping();
    checkMentionTrigger(newText, e.target.selectionEnd || 0);
  };

  const handleSelectMention = (member) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionEnd || content.length;
    const textBeforeCursor = content.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf("@");
    if (lastAt === -1) return;

    const before = content.slice(0, lastAt);
    const after = content.slice(cursorPos);
    const mentionToken = `@[${member.fullName}](${member.id}) `;
    const updated = before + mentionToken + after;

    setContent(updated);
    setMentionQuery(null);

    // Reposition cursor
    setTimeout(() => {
      if (textareaRef.current) {
        const nextPos = before.length + mentionToken.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleBlur = () => {
    if (emitTyping) {
      emitTyping(false);
    }
    // Small timeout so mention click registered before closing
    setTimeout(() => {
      setMentionQuery(null);
    }, 200);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    if (emitTyping) {
      emitTyping(false);
    }
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    setContent("");
    setMentionQuery(null);
    await onSendMessage(trimmed);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    // Navigate mention autocomplete
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const adjustHeight = (e) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const replySenderName =
    replyingToMessage?.sender?.first_name ||
    replyingToMessage?.sender?.firstName ||
    replyingToMessage?.sender?.name ||
    "Team Member";

  return (
    <div className="relative border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      {/* Mention Autocomplete Dropdown */}
      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-72 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-100">
          <div className="border-b border-[var(--color-border)] px-3 py-1.5 bg-[var(--color-surface-sage)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-hover)] flex items-center gap-1.5">
            <FiAtSign size={12} />
            <span>Mention Team Member</span>
          </div>
          <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
            {mentionCandidates.map((cand, idx) => {
              const isSelected = idx === mentionIndex;
              const initials = (
                [cand.firstName?.[0], cand.lastName?.[0]].filter(Boolean).join("") ||
                cand.fullName[0] ||
                "U"
              ).toUpperCase();

              return (
                <button
                  key={cand.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMention(cand);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    isSelected
                      ? "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)] font-semibold"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {cand.profilePicture ? (
                    <img
                      src={cand.profilePicture}
                      alt={cand.fullName}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[10px] font-bold">
                      {initials}
                    </div>
                  )}
                  <span className="truncate flex-1">{cand.fullName}</span>
                  <span className="text-[10px] text-[var(--color-text-subtle)] font-normal">
                    {cand.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Replying-to Preview Banner */}
      {replyingToMessage && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--color-surface-sage)] px-3 py-1.5 text-xs text-[var(--color-text)]">
          <div className="flex items-center gap-2 truncate">
            <FiCornerUpLeft className="shrink-0 text-[var(--color-brand)]" size={14} />
            <span className="font-semibold text-[var(--color-brand-hover)]">
              Replying to {replySenderName}:
            </span>
            <span className="truncate text-[var(--color-text-muted)]">
              {replyingToMessage.content}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition"
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* Composer Input Box */}
      <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => {
              handleChange(e);
              adjustHeight(e);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={`Message ${targetName}...`}
            className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3.5 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] transition focus:border-[var(--color-brand)] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            style={{ maxHeight: "160px" }}
          />
        </div>

        <button
          type="submit"
          disabled={!content.trim()}
          title="Send message"
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] text-white shadow-sm transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FiSend size={16} />
        </button>
      </form>
    </div>
  );
}
