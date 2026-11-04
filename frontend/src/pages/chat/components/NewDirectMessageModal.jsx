import React, { useState } from "react";
import { FiX, FiSearch, FiUser, FiLoader, FiMessageSquare } from "react-icons/fi";
import { getOrCreateDirectConversation } from "../../../services/api/chatApi";

export default function NewDirectMessageModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceMembers = [],
  currentUserId,
  presenceMap = {},
  onSelectConversation,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  // Filter out current user and map members
  const otherMembers = workspaceMembers
    .map((m) => {
      const u = m.users || m.user || m;
      const uId = u.id || m.user_id || m.userId;
      const firstName = u.first_name || u.firstName || "";
      const lastName = u.last_name || u.lastName || "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || u.name || "Member";
      const email = u.email || "";
      const role = m.workspace_role || m.role || u.role || "Member";
      const profilePicture = u.profile_picture || u.profilePicture || null;

      return {
        id: uId,
        firstName,
        lastName,
        fullName,
        email,
        role,
        profilePicture,
      };
    })
    .filter((m) => m.id && m.id !== currentUserId);

  const filteredMembers = otherMembers.filter((m) => {
    const q = searchTerm.toLowerCase().trim();
    return (
      m.fullName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  const handleSelectMember = async (member) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await getOrCreateDirectConversation(workspaceId, member.id);
      if (res?.conversation) {
        onSelectConversation(res.conversation);
        onClose();
        setSearchTerm("");
      }
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Failed to start direct conversation"
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
        className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)] overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
              <FiMessageSquare size={18} />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              New Direct Message
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

        {/* Search */}
        <div className="border-b border-[var(--color-border)] p-4 bg-[var(--color-canvas)]">
          <div className="relative">
            <FiSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
              size={15}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search team members by name or email..."
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-subtle)] transition focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
              autoFocus
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-3 rounded-lg bg-[var(--color-danger-soft)] p-2.5 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {/* Member List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {submitting ? (
            <div className="flex h-36 items-center justify-center">
              <FiLoader className="animate-spin text-[var(--color-brand)]" size={24} />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-8 text-center">
              <FiUser className="mx-auto text-[var(--color-text-subtle)] mb-2" size={24} />
              <p className="text-xs text-[var(--color-text-muted)]">
                {searchTerm
                  ? "No team members matched your search"
                  : "No other members found in this workspace"}
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isOnline = presenceMap[member.id]?.status === "ONLINE";
              const initials = (
                [member.firstName?.[0], member.lastName?.[0]].filter(Boolean).join("") ||
                member.fullName[0] ||
                "U"
              ).toUpperCase();

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleSelectMember(member)}
                  disabled={submitting}
                  className="flex w-full items-center justify-between rounded-xl p-2.5 text-left transition hover:bg-[var(--color-surface-sage)] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {member.profilePicture ? (
                        <img
                          src={member.profilePicture}
                          alt={member.fullName}
                          className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-text)] ring-1 ring-[var(--color-border)]">
                          {initials}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface)] ${
                          isOnline ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[var(--color-text)] group-hover:text-[var(--color-brand-hover)]">
                        {member.fullName}
                      </div>
                      {member.email && (
                        <div className="truncate text-[11px] text-[var(--color-text-subtle)]">
                          {member.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 rounded-md bg-[var(--color-canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                    {member.role}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
