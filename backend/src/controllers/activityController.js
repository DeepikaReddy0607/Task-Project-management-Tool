import {
    getWorkspaceActivities
} from "../services/activityService.js";

import {
    getWorkspaceById
} from "../services/workspaceService.js";

const getAll = async (req, res, next) => {
    try {
        const { workspaceId } = req.params;

        const {
            page = 1,
            limit = 20,
            actionType,
            entityType
        } = req.query;

        if (!workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        // Verify that the logged-in user belongs to the workspace
        await getWorkspaceById(
            workspaceId,
            req.user.id
        );

        const result = await getWorkspaceActivities(
            workspaceId,
            {
                page: Number(page),
                limit: Number(limit),
                actionType,
                entityType
            }
        );

        return res.status(200).json({
            message: "Activity timeline retrieved successfully",
            ...result
        });

    } catch (error) {
        next(error);
    }
};

export {
    getAll
};