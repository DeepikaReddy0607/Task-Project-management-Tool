import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  FiX,
  FiHash,
  FiLock,
  FiUser,
  FiUsers,
  FiCalendar,
  FiLoader,
} from "react-icons/fi";
import {
  getChannelMembers,
  getConversationMembers,
} from "../../../services/api/chatApi";

export default function ChatInfoPanel({
  activeTarget,
  presenceMap = {},
  currentUserId,
  onClose,
}) {
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const isChannel = activeTarget?.type === "channel";
  const channelData = isChannel ? activeTarget.data : null;
  const conversationData = !isChannel ? activeTarget?.data : null;

  useEffect(() => {
    let active = true;
    if (!activeTarget?.id) return;

    async function loadMembers() {
      setLoadingMembers(true);
      try {
        if (isChannel) {
          const res = await getChannelMembers(activeTarget.id);
          if (active) setMembers(res.members || []);
        } else {
          const res = await getConversationMembers(activeTarget.id);
          if (active) setMembers(res.members || []);
        }
      } catch (err) {
        console.error("Failed to load members for info panel:", err);
      } finally {
        if (active) setLoadingMembers(false);
      }
    }

    loadMembers();

    return () => {
      active = false;
    };
  }, [activeTarget?.id, isChannel]);

  if (!activeTarget) return null;

  const targetName = isChannel
    ? channelData?.name || "channel"
    : conversationData?.title ||
      conversationData?.otherMembers?.[0]?.first_name ||
      "Direct Message";

  const otherUser = !isChannel
    ? conversationData?.otherMembers?.[0] ||
      conversationData?.members?.find((m) => (m.userId || m.user?.id) !== currentUserId)?.user
    : null;

  const isOtherOnline = otherUser?.id && presenceMap[otherUser.id]?.status?.toUpperCase() === "ONLINE";

  return (
    <aside className="flex h-full w-72 md:w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] select-none">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <h3 className="text-sm font-bold text-[var(--color-text)]">Details</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition"
        >
          <FiX size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Overview Card */}
        {isChannel ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
                {channelData?.type === "PRIVATE" ? <FiLock size={16} /> : <FiHash size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-base font-bold text-[var(--color-text)]">
                  {targetName}
                </h4>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {channelData?.type === "PRIVATE" ? "Private Channel" : "Public Channel"}
                </span>
              </div>
            </div>

            {channelData?.topic && (
              <div className="mt-3 rounded-lg bg-[var(--color-canvas)] p-2.5">
                <span className="block text-[10px] font-bold uppercase text-[var(--color-text-subtle)]">
                  Topic
                </span>
                <p className="mt-0.5 text-xs text-[var(--color-text)] leading-relaxed">
                  {channelData.topic}
                </p>
              </div>
            )}

            {channelData?.description && (
              <div className="mt-3">
                <span className="block text-[10px] font-bold uppercase text-[var(--color-text-subtle)]">
                  Description
                </span>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {channelData.description}
                </p>
              </div>
            )}

            {channelData?.created_at && (
              <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-text-subtle)]">
                <FiCalendar size={13} />
                <span>Created {dayjs(channelData.created_at).format("MMM D, YYYY")}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              {otherUser?.profile_picture ? (
                <img
                  src={otherUser.profile_picture}
                  alt={targetName}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xl font-bold text-[var(--color-brand-hover)] ring-2 ring-[var(--color-border)]">
                  {(otherUser?.first_name?.[0] || targetName[0] || "U").toUpperCase()}
                </div>
              )}
              <span
                className={`absolute bottom-0 right-0 h-4 w-4 rounded-full ring-2 ring-[var(--color-surface)] ${
                  isOtherOnline ? "bg-emerald-500" : "bg-slate-400"
                }`}
                title={isOtherOnline ? "Online" : "Offline"}
              />
            </div>

            <h4 className="text-base font-bold text-[var(--color-text)]">
              {targetName}
            </h4>
            {otherUser?.email && (
              <p className="text-xs text-[var(--color-text-muted)] truncate max-w-[220px]">
                {otherUser.email}
              </p>
            )}

            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
              <span
                className={`h-2 w-2 rounded-full ${
                  isOtherOnline ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              <span className="text-[var(--color-text-subtle)]">
                {isOtherOnline ? "Active now" : "Offline"}
              </span>
            </div>
          </div>
        )}

        <hr className="border-[var(--color-border)]" />

        {/* Members List Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
              <FiUsers size={14} />
              <span>Members ({members.length})</span>
            </div>
          </div>

          {loadingMembers ? (
            <div className="flex h-20 items-center justify-center">
              <FiLoader className="animate-spin text-[var(--color-brand)]" size={16} />
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs italic text-[var(--color-text-subtle)]">No members listed</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const u = m.user || {};
                const uId = u.id || m.userId;
                const name =
                  [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                  u.name ||
                  "Member";
                const isOnline = uId && presenceMap[uId]?.status?.toUpperCase() === "ONLINE";
                const initials = (
                  [u.first_name?.[0], u.last_name?.[0]].filter(Boolean).join("") || name[0] || "U"
                ).toUpperCase();

                return (
                  <div key={m.id || uId} className="flex items-center justify-between gap-2 py-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        {u.profile_picture ? (
                          <img
                            src={u.profile_picture}
                            alt={name}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[10px] font-bold text-[var(--color-text)]">
                            {initials}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-[var(--color-surface)] ${
                            isOnline ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                      </div>
                      <span className="truncate text-xs font-medium text-[var(--color-text)]">
                        {name}
                        {uId === currentUserId && (
                          <span className="ml-1 text-[10px] text-[var(--color-text-subtle)]">
                            (you)
                          </span>
                        )}
                      </span>
                    </div>

                    {m.role && m.role !== "MEMBER" && (
                      <span className="shrink-0 rounded bg-[var(--color-surface-sage)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-brand-hover)]">
                        {m.role}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
