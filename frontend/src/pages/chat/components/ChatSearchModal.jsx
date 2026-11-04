import React, { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import {
  FiSearch,
  FiX,
  FiHash,
  FiMessageSquare,
  FiLoader,
  FiArrowRight,
} from "react-icons/fi";

export default function ChatSearchModal({
  isOpen,
  onClose,
  searchResults = [],
  searching = false,
  onSearch,
  onSelectResult,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchTerm("");
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (val.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        onSearch(val.trim());
      }, 300);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 px-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)] overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface)]">
          <FiSearch size={18} className="text-[var(--color-text-subtle)] shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            placeholder="Search all messages in this workspace..."
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none"
          />
          {searching && (
            <FiLoader size={16} className="animate-spin text-[var(--color-brand)] mr-2 shrink-0" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {!searchTerm.trim() && searchResults.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
              <FiSearch className="mx-auto mb-2 text-[var(--color-text-subtle)]" size={24} />
              Type keyword to search messages across channels and direct messages.
            </div>
          ) : searching ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <FiLoader className="animate-spin text-[var(--color-brand)]" size={24} />
              <span className="text-xs text-[var(--color-text-subtle)]">Searching messages...</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
              No messages found matching &quot;{searchTerm}&quot;.
            </div>
          ) : (
            searchResults.map((msg) => {
              const isChannel = Boolean(msg.channelId);
              const containerTitle = isChannel
                ? `#${msg.channel?.name || "channel"}`
                : msg.conversation?.title || "Direct Message";

              const senderName =
                [msg.sender?.first_name, msg.sender?.last_name].filter(Boolean).join(" ") ||
                "Team Member";

              const formattedDate = dayjs(msg.createdAt).format("MMM D, YYYY h:mm A");

              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => {
                    onSelectResult(msg);
                    onClose();
                  }}
                  className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--color-surface-sage)] group border border-transparent hover:border-[var(--color-border)]"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-brand)]">
                    {isChannel ? <FiHash size={14} /> : <FiMessageSquare size={14} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-[var(--color-text)]">
                        {senderName}
                      </span>
                      <span className="rounded bg-[var(--color-canvas)] px-1.5 py-0.2 text-[10px] font-medium text-[var(--color-brand-hover)]">
                        {containerTitle}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-subtle)] ml-auto">
                        {formattedDate}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">
                      {msg.content}
                    </p>
                  </div>

                  <FiArrowRight
                    size={14}
                    className="shrink-0 text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100 transition mt-2"
                  />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
