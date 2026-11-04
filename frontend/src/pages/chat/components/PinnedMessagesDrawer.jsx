import React from "react";
import dayjs from "dayjs";
import { FiBookmark, FiX, FiLoader, FiTrash2 } from "react-icons/fi";

export default function PinnedMessagesDrawer({
  isOpen,
  onClose,
  pinnedMessages = [],
  loading = false,
  onUnpin,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm bg-[var(--color-surface)] shadow-2xl border-l border-[var(--color-border)] flex flex-col h-full animate-in slide-in-from-right duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
          <div className="flex items-center gap-2">
            <FiBookmark className="text-[var(--color-brand)] fill-[var(--color-brand)]" size={16} />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              Pinned Messages ({pinnedMessages.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pinned messages"
            className="rounded p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <FiLoader className="animate-spin text-[var(--color-brand)]" size={20} />
            </div>
          ) : pinnedMessages.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--color-text-muted)]">
              <FiBookmark className="mx-auto mb-2 text-[var(--color-text-subtle)]" size={24} />
              No pinned messages yet. Use the pin action on any message to keep important notes visible.
            </div>
          ) : (
            pinnedMessages.map((pin) => {
              const msg = pin.message || {};
              const sender = msg.sender || {};
              const senderName =
                [sender.first_name, sender.last_name].filter(Boolean).join(" ") ||
                sender.name ||
                "Team Member";

              const pinnerName =
                pin.pinnedByUser?.first_name || "Team Member";

              const formattedTime = dayjs(pin.pinnedAt || msg.createdAt).format("MMM D, h:mm A");

              return (
                <div
                  key={pin.id || pin.messageId}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-3 text-xs space-y-2 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--color-text)]">
                      {senderName}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-subtle)]">
                      {formattedTime}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-[var(--color-text)] leading-relaxed">
                    {msg.content}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-subtle)]">
                    <span>Pinned by {pinnerName}</span>
                    {onUnpin && (
                      <button
                        type="button"
                        onClick={() => onUnpin(msg)}
                        title="Unpin message"
                        className="rounded px-1.5 py-0.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition"
                      >
                        Unpin
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
