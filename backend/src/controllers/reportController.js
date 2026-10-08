import {
    getTaskCompletion,
    getPendingOverdue,
    getTasksByPriority,
    getTasksByStatus,
    getDashboardAnalytics
} from "../services/reportService.js";

const getTaskCompletionReport = async (req, res) => {
    try {
        const { projectId } = req.query;
        const userId = req.user.id;

        const data = await getTaskCompletion(
            projectId || null,
            userId
        );

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error fetching task completion report:", error);

        if (error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                success: false,
                message: "Workspace access denied"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard analytics"
        });
    }
};

const getPendingOverdueReport = async (req, res) => {
    try {
        const { projectId } = req.query;
        const userId = req.user.id;

        const data = await getPendingOverdue(
            projectId || null,
            userId
        );

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error fetching pending/overdue report:", error);

        if (error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                success: false,
                message: "Workspace access denied"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard analytics"
        });
    }
};

const getPriorityReport = async (req, res) => {
    try {
        const { projectId } = req.query;
        const userId = req.user.id;

        const data = await getTasksByPriority(
            projectId || null,
            userId
        );

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error fetching priority report:", error);

        if (error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                success: false,
                message: "Workspace access denied"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard analytics"
        });
    }
};

const getStatusReport = async (req, res) => {
    try {
        const { projectId } = req.query;
        const userId = req.user.id;

        const data = await getTasksByStatus(
            projectId || null,
            userId
        );

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error fetching status report:", error);

        if (error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                success: false,
                message: "Workspace access denied"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard analytics"
        });
    }
};

const getDashboardReport = async (req, res) => {
    try {
        const { projectId } = req.query;
        const userId = req.user.id;

        const data = await getDashboardAnalytics(
            projectId || null,
            userId
        );

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error fetching dashboard analytics:", error);

        if (error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                success: false,
                message: "Workspace access denied"
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard analytics"
        });
    }
};

export {
    getTaskCompletionReport,
    getPendingOverdueReport,
    getPriorityReport,
    getStatusReport,
    getDashboardReport
};