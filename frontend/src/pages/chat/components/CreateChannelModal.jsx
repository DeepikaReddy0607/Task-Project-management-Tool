import React, { useState } from "react";
import { FiX, FiHash, FiLock, FiLoader } from "react-icons/fi";
import { createChannel } from "../../../services/api/chatApi";

export default function CreateChannelModal({
  isOpen,
  onClose,
  workspaceId,
  onChannelCreated,
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");

    if (!cleanName) {
      setError("Please enter a valid channel name.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        workspaceId,
        name: cleanName,
        topic: topic.trim() || undefined,
        description: description.trim() || undefined,
        type: isPrivate ? "PRIVATE" : "PUBLIC",
      };

      const res = await createChannel(payload);
      if (res?.channel) {
        onChannelCreated(res.channel);
        onClose();
        setName("");
        setTopic("");
        setDescription("");
        setIsPrivate(false);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Failed to create channel"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
              <FiHash size={18} />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              Create a Channel
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-[var(--color-danger-soft)] p-3 text-xs text-[var(--color-danger)]">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text)] mb-1">
              Channel Name <span className="text-[var(--color-danger)]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-subtle)] font-bold">
                #
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, "-")
                      .replace(/[^a-z0-9-_]/g, "")
                  )
                }
                placeholder="e.g. project-updates"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] py-2 pl-7 pr-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] transition focus:border-[var(--color-brand)] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            </div>
            <span className="mt-1 block text-[11px] text-[var(--color-text-subtle)]">
              Lowercase alphanumeric, hyphens, and underscores only.
            </span>
          </div>

          {/* Topic Field */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text)] mb-1">
              Topic <span className="text-[var(--color-text-subtle)] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] transition focus:border-[var(--color-brand)] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
          </div>

          {/* Description Field */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text)] mb-1">
              Description <span className="text-[var(--color-text-subtle)] font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this channel..."
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)] transition focus:border-[var(--color-brand)] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] resize-none"
            />
          </div>

          {/* Privacy Switch */}
          <div className="rounded-xl border border-[var(--color-border)] p-3 bg-[var(--color-canvas)]">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
              />
              <div className="text-xs">
                <span className="font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                  <FiLock size={12} className="text-[var(--color-brand)]" />
                  Make private
                </span>
                <p className="mt-0.5 text-[var(--color-text-muted)]">
                  When a channel is private, it can only be viewed or joined by invitation.
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand)] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--color-brand-hover)] transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <FiLoader className="animate-spin" size={13} />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Channel</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
