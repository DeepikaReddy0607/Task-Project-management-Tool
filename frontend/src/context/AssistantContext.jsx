import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getQuackieContext, sendQuackieMessage } from "../services/api/quackieApi";
import { createTask as createTaskApi } from "../services/api/taskApi";
import { useSocketEvent } from "./SocketContext";

const AssistantContext = createContext(null);

export const AssistantProvider = ({ children }) => {
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [currentEmotion, setCurrentEmotion] = useState("happy");
    const [pageContext, setPageContextState] = useState({
        page: "dashboard",
        projectId: null,
        projectTitle: null,
        taskId: null,
        taskTitle: null
    });
    const [proactiveData, setProactiveData] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const prevPathRef = useRef(location.pathname);
    const pageContextRef = useRef(pageContext);
    const debounceTimerRef = useRef(null);

    // Keep pageContextRef in sync
    useEffect(() => {
        pageContextRef.current = pageContext;
    }, [pageContext]);

    // Determine base page type from URL
    const getPageFromPath = useCallback((pathname) => {
        if (pathname === "/") return "dashboard";
        if (pathname.startsWith("/tasks")) return "tasks";
        if (pathname.startsWith("/projects")) return "project";
        if (pathname.startsWith("/calendar")) return "calendar";
        if (pathname.startsWith("/kanban")) return "kanban";
        return "general";
    }, []);

    // Fetch proactive context from backend
    const fetchProactive = useCallback(async (ctxOverride = null) => {
        try {
            const token = localStorage.getItem("taskflow_token");
            if (!token) return;

            const ctx = ctxOverride || pageContextRef.current;

            const data = await getQuackieContext({
                page: ctx.page,
                projectId: ctx.projectId,
                taskId: ctx.taskId,
            });

            if (data.success) {
                setProactiveData(data);
                if (data.emotion) {
                    setCurrentEmotion(data.emotion);
                }
            }
        } catch (error) {
            console.error("Failed to load proactive Quackie context:", error);
        }
    }, []);

    // Debounced context refresh to avoid thrashing on rapid events
    const scheduleProactiveRefresh = useCallback((delay = 400) => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
            fetchProactive(pageContextRef.current);
            debounceTimerRef.current = null;
        }, delay);
    }, [fetchProactive]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // Determine whether a real-time event affects Quackie's current context
    const isEventRelevantToQuackie = useCallback((event, ctx) => {
        if (!event || !event.type) return false;
        const { type, projectId, taskId } = event;

        // Task details view (specific task active)
        if (ctx.taskId) {
            if (taskId && taskId === ctx.taskId) return true;
            if (event.data?.taskId === ctx.taskId || event.data?.id === ctx.taskId) return true;
            if (projectId && ctx.projectId && projectId === ctx.projectId) return true;
            return false;
        }

        // Project view
        if (ctx.page === "project") {
            if (ctx.projectId) {
                // Only refresh for events related to THIS project
                if (projectId && projectId === ctx.projectId) return true;
                if (event.data?.projectId === ctx.projectId) return true;
                if (event.data?.id === ctx.projectId && type.startsWith("project.")) return true;
                return false;
            }
            // General projects page
            return type.startsWith("project.") || type.startsWith("risk.");
        }

        // My Tasks view
        if (ctx.page === "tasks") {
            return type.startsWith("task.") || type.startsWith("subtask.");
        }

        // Kanban / Calendar view
        if (ctx.page === "kanban" || ctx.page === "calendar") {
            return type.startsWith("task.") || type.startsWith("subtask.") || type.startsWith("project.");
        }

        // Dashboard view (default)
        if (ctx.page === "dashboard") {
            return (
                type.startsWith("task.") ||
                type.startsWith("subtask.") ||
                type.startsWith("project.") ||
                type.startsWith("risk.")
            );
        }

        return true;
    }, []);

    // Subscribe to wildcard socket events
    useSocketEvent("*", (event) => {
        if (isEventRelevantToQuackie(event, pageContextRef.current)) {
            scheduleProactiveRefresh(400);
        }
    });

    // Resynchronize context on reconnect
    useSocketEvent("reconnect", () => {
        scheduleProactiveRefresh(100);
    });


// Handle route changes
useEffect(() => {
    const newPage = getPageFromPath(location.pathname);

    if (location.pathname === prevPathRef.current) {
        return;
    }

    prevPathRef.current = location.pathname;

    setPageContextState((prev) => ({
        ...prev,
        page: newPage,
        projectId:
            newPage === "project"
                ? prev.projectId
                : null,
        projectTitle:
            newPage === "project"
                ? prev.projectTitle
                : null,
        taskId:
            newPage === "tasks"
                ? prev.taskId
                : null,
        taskTitle:
            newPage === "tasks"
                ? prev.taskTitle
                : null,
    }));
}, [
    location.pathname,
    getPageFromPath,
]);


// Fetch proactive context when actual page context changes
useEffect(() => {
    fetchProactive(pageContext);
}, [
    pageContext.page,
    pageContext.projectId,
    pageContext.taskId,
    fetchProactive,
]);


// Set page context from Projects / Tasks pages
const setPageContext = useCallback((updater) => {
    setPageContextState((prev) => {
        return typeof updater === "function"
            ? updater(prev)
            : { ...prev, ...updater };
    });
}, []);

    // Toggle assistant panel
    const toggleAssistant = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    const openAssistant = useCallback(() => {
        setIsOpen(true);
    }, []);

    const closeAssistant = useCallback(() => {
        setIsOpen(false);
    }, []);

    // Send a message
    const sendMessage = useCallback(async (text) => {
        if (!text || !text.trim()) return;
        const userContent = text.trim();

        // Append user message immediately
        const userMsg = {
            id: `user-${Date.now()}`,
            role: "user",
            content: userContent,
            timestamp: new Date()
        };

        setMessages((prev) => [...prev, userMsg]);
        setIsThinking(true);
        setCurrentEmotion("thinking");

        try {
            // Build conversation history for context
            const history = messages.slice(-8).map((m) => ({
                role: m.role,
                content: m.content,
                context: m.context,
                suggestedAction: m.suggestedAction
            }));

            const response = await sendQuackieMessage({
                message: userContent,
                context: pageContext,
                conversationHistory: history
            });

            if (response.success) {
                const assistantMsg = {
                    id: `quackie-${Date.now()}`,
                    role: "assistant",
                    content: response.reply,
                    emotion: response.emotion || "happy",
                    suggestedAction: response.suggestedAction || null,
                    context: response.context || pageContext,
                    timestamp: new Date()
                };

                setMessages((prev) => [...prev, assistantMsg]);
                if (response.emotion) {
                    setCurrentEmotion(response.emotion);
                }
            } else {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `quackie-err-${Date.now()}`,
                        role: "assistant",
                        content: response.reply || "🦆 I had a problem processing that request.",
                        emotion: "worried",
                        timestamp: new Date()
                    }
                ]);
                setCurrentEmotion("worried");
            }
        } catch (error) {
            console.error("Quackie message error:", error);
            setMessages((prev) => [
                ...prev,
                {
                    id: `quackie-err-${Date.now()}`,
                    role: "assistant",
                    content: "🦆 I couldn't connect to TaskFlow services right now. Please try again in a moment.",
                    emotion: "worried",
                    timestamp: new Date()
                }
            ]);
            setCurrentEmotion("worried");
        } finally {
            setIsThinking(false);
        }
    }, [messages, pageContext]);

    // Clear messages
    const clearConversation = useCallback(() => {
        setMessages([]);
        if (proactiveData?.emotion) {
            setCurrentEmotion(proactiveData.emotion);
        } else {
            setCurrentEmotion("happy");
        }
    }, [proactiveData]);

    // Confirm and execute task creation via existing taskApi
    const executeTaskCreation = useCallback(async (actionData) => {
        if (!actionData?.taskData) return;
        const { title, priority, dueDate, projectId, projectTitle } = actionData.taskData;

        setIsThinking(true);
        try {
            await createTaskApi(projectId, {
                title,
                priority: priority || "Medium",
                status: "To Do",
                dueDate: dueDate || null
            });

            setMessages((prev) => [
                ...prev,
                {
                    id: `quackie-created-${Date.now()}`,
                    role: "assistant",
                    content: `🦆 **Success!** Created task **"${title}"** in project **${projectTitle || "current project"}**.\n\nPriority: ${priority} · Due: ${dueDate || "None"}`,
                    emotion: "excited",
                    timestamp: new Date()
                }
            ]);
            setCurrentEmotion("excited");
            // Refresh proactive info
            fetchProactive();
        } catch (error) {
            console.error("Task creation failed:", error);
            const errMsg = error.response?.data?.message || "Failed to create task.";
            setMessages((prev) => [
                ...prev,
                {
                    id: `quackie-create-err-${Date.now()}`,
                    role: "assistant",
                    content: `🦆 Sorry, I couldn't create that task: ${errMsg}`,
                    emotion: "worried",
                    timestamp: new Date()
                }
            ]);
            setCurrentEmotion("worried");
        } finally {
            setIsThinking(false);
        }
    }, [fetchProactive]);

    // Cancel task creation proposal
    const cancelTaskCreation = useCallback(() => {
        setMessages((prev) => [
            ...prev,
            {
                id: `quackie-cancel-${Date.now()}`,
                role: "assistant",
                content: "🦆 Task creation cancelled. Let me know what else I can help with!",
                emotion: "happy",
                context: {
                    pendingProposal: null,
                    pendingTaskDraft: null,
                    proposalCancelled: true
                },
                suggestedAction: null,
                timestamp: new Date()
            }
        ]);
        setCurrentEmotion("happy");
    }, []);

    const value = {
        isOpen,
        toggleAssistant,
        openAssistant,
        closeAssistant,
        currentEmotion,
        setCurrentEmotion,
        pageContext,
        setPageContext,
        proactiveData,
        fetchProactive,
        messages,
        sendMessage,
        clearConversation,
        isThinking,
        executeTaskCreation,
        cancelTaskCreation
    };

    return (
        <AssistantContext.Provider value={value}>
            {children}
        </AssistantContext.Provider>
    );
};

export const useAssistantContext = () => {
    const context = useContext(AssistantContext);
    if (!context) {
        throw new Error("useAssistantContext must be used within an AssistantProvider");
    }
    return context;
};

export default AssistantContext;
