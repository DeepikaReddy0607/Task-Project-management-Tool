import {
    processMessage,
    getOverdueTasks,
    recommendNextTask,
    getFocusDailyMission,
    summarizeProject,
    getProjectBlockers,
    getProactiveContext,
    parseTaskCreationProposal
} from "../services/quackieService.js";
import { analyzeProjectRisk } from "../services/projectRiskService.js";
import { getProjectXRay } from "../services/projectXRayService.js";
import { simulateWhatIf } from "../services/whatIfService.js";

export const chat = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { message, context, conversationHistory } = req.body;

        const result = await processMessage({
            message,
            context,
            conversationHistory,
            userId
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie chat error:", error);
        return res.status(500).json({
            success: false,
            reply: "🦆 Sorry, I encountered an error while analyzing your TaskFlow workspace.",
            emotion: "worried",
            error: error.message
        });
    }
};

export const getOverdue = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId } = req.query;

        const result = await getOverdueTasks({
            userId,
            projectId: projectId || null
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie overdue error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch overdue tasks.",
            error: error.message
        });
    }
};

export const getRecommendation = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId, taskId, page } = req.query;

        const result = await getFocusDailyMission({
            userId,
            projectId: projectId || null,
            taskId: taskId || null,
            page: page || null
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie recommendation error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate task recommendation.",
            error: error.message
        });
    }
};

export const getFocusMission = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId, taskId, page } = req.query;

        const result = await getFocusDailyMission({
            userId,
            projectId: projectId || null,
            taskId: taskId || null,
            page: page || null
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie focus mission error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate daily focus mission.",
            error: error.message
        });
    }
};

export const getSummary = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required."
            });
        }

        const result = await summarizeProject({
            projectId,
            userId
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie project summary error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate project summary.",
            error: error.message
        });
    }
};

export const getBlockers = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required."
            });
        }

        const result = await getProjectBlockers({
            projectId,
            userId
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie project blockers error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate project blockers.",
            error: error.message
        });
    }
};

export const getContext = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page, projectId, taskId } = req.query;

        const result = await getProactiveContext({
            page: page || "dashboard",
            projectId: projectId || null,
            taskId: taskId || null,
            userId
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie proactive context error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch proactive context.",
            error: error.message
        });
    }
};

export const parseProposal = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { text, context } = req.body;

        const result = await parseTaskCreationProposal({
            text,
            context,
            userId
        });

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Quackie task proposal error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to parse task proposal.",
            error: error.message
        });
    }
};

export const getProjectRisk = async (req, res) => {
    try {
        const userId = req.user.userId;
        const projectId = req.params.projectId || req.query.projectId;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required."
            });
        }

        const risk = await analyzeProjectRisk(projectId, userId);

        return res.status(200).json({
            success: true,
            risk
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }
        console.error("Quackie project risk error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to analyze project risk.",
            error: error.message
        });
    }
};

export const getXRay = async (req, res) => {
    try {
        const userId = req.user.userId;
        const projectId = req.params.projectId || req.query.projectId;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required."
            });
        }

        const xray = await getProjectXRay(projectId, userId);

        return res.status(200).json({
            success: true,
            xray
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }
        console.error("Quackie project X-Ray error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate project X-Ray.",
            error: error.message
        });
    }
};

export const simulate = async (req, res) => {
    try {
        const userId = req.user.userId;
        const projectId = req.params.projectId || req.body.projectId;
        const {
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
        } = req.body;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required for simulation."
            });
        }

        const simulation = await simulateWhatIf({
            userId,
            projectId,
            scenario: scenario || "complete_task",
            taskId,
            targetTaskTitle,
            priority,
            daysOffset,
            newDate,
            assigneeId,
            assigneeName,
            changes,
            params: params || {}
        });

        return res.status(200).json({
            success: true,
            simulation,
            reply: simulation.reply,
            emotion: simulation.emotion
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }
        console.error("Quackie simulation error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to simulate what-if scenario.",
            error: error.message
        });
    }
};

