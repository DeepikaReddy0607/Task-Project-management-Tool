import {
    createWorkspace
} from "../services/workspaceService.js";


const create = async (req, res, next) => {
    try {

        // Get data from request body
        const {
            name,
            description
        } = req.body;

        // Validate workspace name
        if (!name || !name.trim()) {
            return res.status(400).json({
                message: "Workspace name is required"
            });
        }

        // Create workspace
        const workspace = await createWorkspace(
            req.user.userId,
            name.trim(),
            description
        );

        return res.status(201).json({
            message: "Workspace created successfully",
            workspace
        });

    } catch (error) {
        next(error);
    }
};


export {
    create
};