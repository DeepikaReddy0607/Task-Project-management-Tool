import { getUserProductivity } from "../services/productivityService.js";

export const getProductivity = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { workspaceId, projectId } = req.query;

        const data = await getUserProductivity(userId, { workspaceId, projectId });

        return res.status(200).json({
            message: "User productivity metrics retrieved successfully",
            data
        });
    } catch (error) {
        next(error);
    }
};
