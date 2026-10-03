import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiSend, FiRefreshCw, FiChevronRight, FiZap, FiAlertCircle, FiCheck, FiCornerDownLeft } from "react-icons/fi";
import { TbCrystalBall } from "react-icons/tb";
import Quackie from "../brand/Quackie";
import { useAssistantContext } from "../../context/AssistantContext";

// Simple safe markdown renderer for assistant responses
function FormattedMessage({ text }) {
    if (!text) return null;

    const lines = text.split("\n");
    return (
        <div className="space-y-1.5 text-sm leading-relaxed text-[var(--color-text)]">
            {lines.map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return <div key={idx} className="h-1" />;
                }

                // Header lines (e.g. Overdue:, Recommended task:, etc.)
                if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
                    const content = trimmed.slice(2, -2);
                    return (
                        <p key={idx} className="font-semibold text-[var(--color-text)]">
                            {content}
                        </p>
                    );
                }

                // Bullet points
                if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
                    const content = trimmed.slice(2);
                    return (
                        <div key={idx} className="flex items-start gap-2 pl-1">
                            <span className="text-[var(--color-brand)] font-bold">•</span>
                            <span className="flex-1">{renderInline(content)}</span>
                        </div>
                    );
                }

                // Numbered lists (1. , 2. )
                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                    return (
                        <div key={idx} className="flex items-start gap-2 pl-1 font-medium">
                            <span className="text-[var(--color-text-subtle)]">{numMatch[1]}.</span>
                            <span className="flex-1">{renderInline(numMatch[2])}</span>
                        </div>
                    );
                }

                // Sub-items (indented list lines)
                if (line.startsWith("   ") || line.startsWith("\t")) {
                    return (
                        <div key={idx} className="pl-6 text-xs text-[var(--color-text-muted)]">
                            {renderInline(trimmed)}
                        </div>
                    );
                }

                // Regular line
                return (
                    <p key={idx}>
                        {renderInline(line)}
                    </p>
                );
            })}
        </div>
    );
}

// Render inline bold and tags
function renderInline(str) {
    if (!str) return "";
    const parts = str.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i} className="font-semibold text-[var(--color-text)]">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
            return <em key={i} className="text-[var(--color-text-muted)] italic">{part.slice(1, -1)}</em>;
        }
        return part;
    });
}

function QuackieAssistant() {
    const {
        isOpen,
        toggleAssistant,
        closeAssistant,
        currentEmotion,
        pageContext,
        proactiveData,
        messages,
        sendMessage,
        clearConversation,
        isThinking,
        executeTaskCreation,
        cancelTaskCreation
    } = useAssistantContext();

    const navigate = useNavigate();
    const [input, setInput] = useState("");
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isThinking, isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 150);
        }
    }, [isOpen]);

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || isThinking) return;
        const msg = input.trim();
        setInput("");
        sendMessage(msg);
    };

    const handleQuickAction = (actionText) => {
        if (actionText === "Open What-If Simulator" || actionText === "Simulate in What-If") {
            const pId = pageContext?.projectId || "";
            closeAssistant();
            navigate(`/what-if${pId ? `?projectId=${pId}` : ""}`);
            return;
        }
        if (isThinking) return;
        sendMessage(actionText);
    };

    // Context label for header
    const getContextBadgeLabel = () => {
        if (pageContext?.projectTitle) return `Project: ${pageContext.projectTitle}`;
        if (pageContext?.taskTitle) return `Task: ${pageContext.taskTitle}`;
        if (pageContext?.page === "project") return "Projects View";
        if (pageContext?.page === "tasks") return "My Tasks";
        if (pageContext?.page === "calendar") return "Calendar";
        if (pageContext?.page === "kanban") return "Kanban Board";
        return "Workspace Overview";
    };

    // Context-aware Quick Actions fallback definitions
    const getContextQuickActions = (ctx) => {
        if (ctx?.taskId) {
            return [
                "Explain this task",
                "What is blocking this task?",
                "What should I do next?",
                "Summarize its subtasks"
            ];
        }
        if (ctx?.projectId || ctx?.page === "project") {
            return [
                "What is the critical path?",
                "What are the bottlenecks?",
                "Summarize this project",
                "Simulate in What-If"
            ];
        }
        if (ctx?.page === "tasks") {
            return [
                "What should I work on next?",
                "Show my overdue work",
                "What should I focus on today?",
                "Can I finish everything due this week?"
            ];
        }
        if (ctx?.page === "calendar") {
            return [
                "What is due soon?",
                "What should I work on next?",
                "Do I have deadline conflicts?",
                "What is overdue?"
            ];
        }
        // Dashboard or default
        return [
            "What should I focus on today?",
            "Show my overdue work",
            "What needs attention?",
            "Open What-If Simulator"
        ];
    };

    // Determine current context type to prevent displaying mismatched actions
    const currentContextType = pageContext?.taskId
        ? "task"
        : (pageContext?.projectId || pageContext?.page === "project")
        ? "project"
        : pageContext?.page === "tasks"
        ? "tasks"
        : pageContext?.page === "calendar"
        ? "calendar"
        : "dashboard";

    const quickActionsToDisplay = (
        proactiveData?.quickActions && proactiveData?.contextType === currentContextType
    ) ? proactiveData.quickActions : getContextQuickActions(pageContext);

    return (
        <>
            {/* ----------------------------------------------------
                1. FLOATING ASSISTANT BUTTON
            ----------------------------------------------------- */}
            <div className="fixed bottom-6 right-6 z-50">
                <button
                    type="button"
                    onClick={toggleAssistant}
                    aria-label={isOpen ? "Close Quackie AI assistant" : "Ask Quackie"}
                    className="group relative flex items-center justify-center p-0 transition-transform duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded-full"
                >
                    {/* Mascot with subtle bounce when collapsed, paused when open */}
                    <div className={`relative flex items-center justify-center filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.12)] ${isOpen ? "" : "quackie-floating-bounce"}`}>
                        <Quackie
                            emotion={isOpen ? "happy" : currentEmotion}
                            decorative
                            size="sm"
                            className="!h-[50px] !w-[50px] transition-transform duration-200"
                        />
                    </div>

                    {/* Tooltip "Ask Quackie" on hover when collapsed */}
                    {!isOpen && (
                        <span
                            role="tooltip"
                            className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--color-text)] px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50"
                        >
                            Ask Quackie
                            <span className="absolute left-full top-1/2 -ml-1 -translate-y-1/2 border-4 border-transparent border-l-[var(--color-text)]" />
                        </span>
                    )}

                    {/* Proactive notification badge */}
                    {proactiveData?.badgeCount > 0 && !isOpen && (
                        <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 min-w-[18px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--color-surface)]">
                            {proactiveData.badgeCount > 99 ? "99+" : proactiveData.badgeCount}
                        </span>
                    )}
                </button>
            </div>

            {/* ----------------------------------------------------
                2. ASSISTANT PANEL
            ----------------------------------------------------- */}
            {isOpen && (
                <div
                    role="dialog"
                    aria-modal="false"
                    aria-label="Quackie TaskFlow Copilot"
                    className="fixed bottom-24 right-4 z-50 flex h-[620px] max-h-[calc(100vh-7.5rem)] w-[calc(100vw-2rem)] sm:w-[440px] flex-col rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] backdrop-blur-xl transition-all duration-200 overflow-hidden"
                >
                    {/* PANEL HEADER */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface-sage)]">
                                <Quackie
                                    emotion={currentEmotion}
                                    decorative
                                    size="sm"
                                    className="!h-8 !w-8"
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <h3 className="font-[var(--font-display)] text-sm font-bold text-[var(--color-text)]">
                                        Quackie
                                    </h3>
                                    <span className="rounded-full bg-[var(--color-brand-soft)] px-1.5 py-0.2 text-[10px] font-semibold text-[var(--color-brand-hover)]">
                                        Copilot
                                    </span>
                                </div>
                                <p className="text-[11px] text-[var(--color-text-muted)]">
                                    Your TaskFlow Copilot
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearConversation}
                                    title="Reset conversation"
                                    aria-label="Reset conversation"
                                    className="rounded-lg p-1.5 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
                                >
                                    <FiRefreshCw size={15} />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={closeAssistant}
                                aria-label="Close assistant"
                                className="rounded-lg p-1.5 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
                            >
                                <FiX size={18} />
                            </button>
                        </div>
                    </div>

                    {/* CONTEXT CHIP */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-canvas)_40%,var(--color-surface))] px-4 py-1.5 text-[11px]">
                        <span className="flex items-center gap-1 text-[var(--color-text-subtle)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
                            Active Context:
                        </span>
                        <span className="font-medium text-[var(--color-text)] truncate max-w-[240px]">
                            {getContextBadgeLabel()}
                        </span>
                    </div>

                    {/* CONVERSATION SCROLL AREA */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* 1. Proactive Welcome Card */}
                        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3.5 shadow-sm">
                            <div className="flex items-start gap-3">
                                <Quackie
                                    emotion={proactiveData?.emotion || currentEmotion}
                                    decorative
                                    size="sm"
                                    className="!h-9 !w-9 shrink-0"
                                />
                                <div className="space-y-1 flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[var(--color-text)]">
                                        {proactiveData?.greeting || "Hello there!"}
                                    </p>
                                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                        {proactiveData?.observation || "How can I help coordinate your TaskFlow workspace today?"}
                                    </p>

                                    {/* Actionable Proactive Alert Chips */}
                                    {proactiveData?.alerts?.length > 0 && (
                                        <div className="mt-2.5 space-y-1.5 border-t border-[var(--color-border)]/60 pt-2">
                                            {proactiveData.alerts.slice(0, 2).map((alert) => (
                                                <div
                                                    key={alert.id}
                                                    className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-surface)] p-2 text-xs border border-[var(--color-border)] shadow-2xs"
                                                >
                                                    <span className="truncate flex-1 text-[11px] font-medium text-[var(--color-text)]">
                                                        {alert.message}
                                                    </span>
                                                    {alert.taskId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleQuickAction("Explain this task")}
                                                            className="shrink-0 rounded-md bg-[var(--color-brand)] px-2 py-0.5 text-[10px] font-semibold text-white shadow-2xs transition hover:bg-[var(--color-brand-hover)]"
                                                        >
                                                            View Task
                                                        </button>
                                                    )}
                                                    {alert.projectId && !alert.taskId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleQuickAction("Summarize this project")}
                                                            className="shrink-0 rounded-md bg-[var(--color-brand)] px-2 py-0.5 text-[10px] font-semibold text-white shadow-2xs transition hover:bg-[var(--color-brand-hover)]"
                                                        >
                                                            Analyze Project
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Quick Actions */}
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                                Quick Actions
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {quickActionsToDisplay.map((action, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        disabled={isThinking}
                                        onClick={() => handleQuickAction(action)}
                                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] shadow-xs transition hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand-hover)] disabled:opacity-50"
                                    >
                                        <FiZap size={11} className="text-[var(--color-brand)]" />
                                        {action}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3. Messages List */}
                        {messages.map((msg) => {
                            const isUser = msg.role === "user";
                            return (
                                <div
                                    key={msg.id}
                                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                                >
                                    <div
                                        className={`max-w-[88%] rounded-2xl p-3.5 text-sm shadow-xs ${
                                            isUser
                                                ? "rounded-tr-xs bg-[var(--color-brand)] text-[var(--color-brand-contrast)]"
                                                : "rounded-tl-xs border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                                        }`}
                                    >
                                        {isUser ? (
                                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                        ) : (
                                            <FormattedMessage text={msg.content} />
                                        )}
                                    </div>

                                    {/* Action Confirmation Proposal Box (if task creation proposed) */}
                                    {!isUser && msg.suggestedAction?.readyForConfirmation && (
                                        <div className="mt-2.5 w-full max-w-[88%] rounded-xl border border-[var(--color-peach)] bg-[var(--color-peach-soft)] p-3 text-xs shadow-xs">
                                            <div className="flex items-center gap-1.5 font-semibold text-[var(--color-text)]">
                                                <FiAlertCircle className="text-[var(--color-peach)]" size={15} />
                                                <span>Confirmation Required</span>
                                            </div>
                                            <div className="mt-2 space-y-1 text-[var(--color-text-muted)]">
                                                <p><strong>Title:</strong> {msg.suggestedAction.taskData?.title}</p>
                                                <p><strong>Priority:</strong> {msg.suggestedAction.taskData?.priority}</p>
                                                <p><strong>Due:</strong> {msg.suggestedAction.taskData?.dueDateFormatted}</p>
                                                <p><strong>Project:</strong> {msg.suggestedAction.taskData?.projectTitle}</p>
                                            </div>
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    disabled={isThinking}
                                                    onClick={() => executeTaskCreation(msg.suggestedAction)}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 font-semibold text-white shadow-xs transition hover:bg-[var(--color-brand-hover)] disabled:opacity-50"
                                                >
                                                    <FiCheck size={13} />
                                                    Create task
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isThinking}
                                                    onClick={cancelTaskCreation}
                                                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-canvas-soft)]"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* What-If Simulator Deep-Link Action Button */}
                                    {!isUser && (
                                        msg.meta?.simulation ||
                                        msg.data?.simulation ||
                                        msg.data?.simulationId ||
                                        /🔮\s*\*\*What-If Simulation\*\*/i.test(msg.content || "")
                                    ) && (
                                        <div className="mt-2.5 w-full max-w-[88%] rounded-xl border border-[var(--color-brand)] bg-[var(--color-brand-soft)]/50 p-2.5 text-xs shadow-xs flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                                                <span className="text-base">🔮</span>
                                                <span>Explore in What-If Simulator</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const sim = msg.meta?.simulation || msg.data?.simulation || msg.data;
                                                    const pId = sim?.projectId || pageContext?.projectId || "";
                                                    const sc = sim?.scenario || "";
                                                    const tId = sim?.changes?.[0]?.taskId || "";
                                                    const params = new URLSearchParams();
                                                    if (pId) params.set("projectId", pId);
                                                    if (sc) params.set("scenario", sc);
                                                    if (tId) params.set("taskId", tId);
                                                    closeAssistant();
                                                    navigate(`/what-if${params.toString() ? `?${params.toString()}` : ""}`);
                                                }}
                                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--color-brand-hover)] shrink-0"
                                            >
                                                <span>Open What-If →</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Project Intelligence Deep-Link Action Button */}
                                    {!isUser && (
                                        /Critical Path|Bottleneck/i.test(msg.content || "") ||
                                        msg.data?.criticalPath ||
                                        msg.data?.bottlenecks
                                    ) && (
                                        <div className="mt-2.5 w-full max-w-[88%] rounded-xl border border-[var(--color-brand)] bg-[var(--color-brand-soft)]/50 p-2.5 text-xs shadow-xs flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                                                <span className="text-base">⚡</span>
                                                <span>View Project Intelligence</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const pId = msg.context?.projectId || pageContext?.projectId || "";
                                                    closeAssistant();
                                                    navigate(`/projects${pId ? `?projectId=${pId}&tab=intelligence` : ""}`);
                                                }}
                                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--color-brand-hover)] shrink-0"
                                            >
                                                <span>Open Intelligence →</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Thinking indicator */}
                        {isThinking && (
                            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] py-1 pl-1">
                                <Quackie
                                    emotion="thinking"
                                    decorative
                                    size="sm"
                                    className="!h-6 !w-6 animate-pulse"
                                />
                                <span>Quackie is analyzing TaskFlow data...</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* INPUT FOOTER */}
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-3">
                        <form onSubmit={handleFormSubmit} className="relative flex items-center">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask Quackie or 'Create a task...'"
                                className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-3.5 pr-10 text-sm text-[var(--color-text)] shadow-xs outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-brand)_15%,transparent)]"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isThinking}
                                aria-label="Send question to Quackie"
                                className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white shadow-xs transition hover:bg-[var(--color-brand-hover)] disabled:opacity-40"
                            >
                                <FiSend size={13} />
                            </button>
                        </form>
                        <p className="mt-1.5 text-center text-[10px] text-[var(--color-text-subtle)]">
                            Powered by live TaskFlow workspace context · Press Enter
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

export default QuackieAssistant;
