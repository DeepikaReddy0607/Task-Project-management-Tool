import {
    getUserPreferences,
    updateUserPreferences,
    resetUserPreferences,
} from "../services/preferenceService.js";

export const getPreferencesController = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User not authenticated",
            });
        }

        const preferences = await getUserPreferences(userId);
        return res.status(200).json({
            success: true,
            message: "User preferences retrieved successfully",
            preferences,
            data: preferences,
        });
    } catch (error) {
        console.error("Get preferences error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve user preferences",
        });
    }
};

export const updatePreferencesController = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User not authenticated",
            });
        }

        if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Bad request: No preferences provided to update",
            });
        }

        const updated = await updateUserPreferences(userId, req.body);
        return res.status(200).json({
            success: true,
            message: "User preferences updated successfully",
            preferences: updated,
            data: updated,
        });
    } catch (error) {
        console.error("Update preferences error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to update user preferences",
        });
    }
};

export const resetPreferencesController = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User not authenticated",
            });
        }

        const reset = await resetUserPreferences(userId);
        return res.status(200).json({
            success: true,
            message: "User preferences reset to factory defaults",
            preferences: reset,
            data: reset,
        });
    } catch (error) {
        console.error("Reset preferences error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to reset user preferences",
        });
    }
};
