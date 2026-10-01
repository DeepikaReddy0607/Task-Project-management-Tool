import api from "./axios";

// Send chat message with context and conversation history
export const sendQuackieMessage = async ({
    message,
    context = {},
    conversationHistory = []
}) => {
    const response = await api.post("/quackie/chat", {
        message,
        context,
        conversationHistory
    });
    return response.data;
};

// Get proactive context for current page/task/project
export const getQuackieContext = async ({
    page = "dashboard",
    projectId = null,
    taskId = null
} = {}) => {
    const response = await api.get("/quackie/context", {
        params: {
            page,
            projectId: projectId || undefined,
            taskId: taskId || undefined
        }
    });
    return response.data;
};

// Get overdue work
export const getQuackieOverdue = async (projectId = null) => {
    const response = await api.get("/quackie/overdue", {
        params: {
            projectId: projectId || undefined
        }
    });
    return response.data;
};

// Get task recommendation
export const getQuackieRecommendation = async (projectId = null) => {
    const response = await api.get("/quackie/recommendation", {
        params: {
            projectId: projectId || undefined
        }
    });
    return response.data;
};

// Get Quackie Focus Mode: Daily Mission / Smart Work Plan
export const getQuackieFocusMission = async ({ projectId = null, taskId = null, page = null } = {}) => {
    const response = await api.get("/quackie/focus", {
        params: {
            projectId: projectId || undefined,
            taskId: taskId || undefined,
            page: page || undefined
        }
    });
    return response.data;
};

// Get project summary
export const getQuackieProjectSummary = async (projectId) => {
    const response = await api.get(`/quackie/projects/${projectId}/summary`);
    return response.data;
};

// Get project blockers
export const getQuackieProjectBlockers = async (projectId) => {
    const response = await api.get(`/quackie/projects/${projectId}/blockers`);
    return response.data;
};

// Get project risk analysis
export const getQuackieProjectRisk = async (projectId) => {
    const response = await api.get(`/quackie/projects/${projectId}/risk`);
    return response.data;
};

// Get project X-Ray diagnostic
export const getQuackieProjectXRay = async (projectId) => {
    const response = await api.get(`/quackie/projects/${projectId}/xray`);
    return response.data;
};

// Parse task creation proposal
export const parseTaskProposal = async ({ text, context = {} }) => {
    const response = await api.post("/quackie/proposal", {
        text,
        context
    });
    return response.data;
};

// Get prioritized tasks (Smart Task Prioritization)
export const getQuackiePrioritizedTasks = async ({ projectId = null, limit = null, context = null, taskId = null } = {}) => {
    const response = await api.get("/tasks/prioritized", {
        params: {
            projectId: projectId || undefined,
            limit: limit || undefined,
            context: context || undefined,
            taskId: taskId || undefined
        }
    });
    return response.data;
};

// Simulate What-If predictive scenario (READ-ONLY)
export const simulateWhatIfScenario = async ({
    projectId,
    scenario = "complete_task",
    taskId = null,
    targetTaskTitle = null,
    priority = null,
    daysOffset = null,
    newDate = null,
    assigneeId = null,
    assigneeName = null,
    changes = [],
    params = {}
}) => {
    const response = await api.post(`/quackie/projects/${projectId}/simulate`, {
        scenario,
        taskId,
        targetTaskTitle,
        priority,
        daysOffset,
        newDate,
        assigneeId,
        assigneeName,
        changes,
        params
    });
    return response.data;
};
