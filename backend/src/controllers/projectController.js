import {
    createProject, 
    getWorkspaceProjects, 
    getProject,
    updateProject,
    archiveProject,
    addMember
} from "../services/projectService.js";


const create = async (req, res, next) => {
    try {

        const {
            workspaceId
        } = req.params;

        const {
            title,
            description,
            category,
            priority,
            status,
            startDate,
            endDate
        } = req.body;


        // Validate workspace ID
        if (!workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }


        // Validate project title
        if (!title || !title.trim()) {
            return res.status(400).json({
                message: "Project title is required"
            });
        }


        const project = await createProject(
            workspaceId,
            req.user.userId,
            title.trim(),
            description,
            category,
            priority,
            status,
            startDate,
            endDate
        );


        return res.status(201).json({
            message: "Project created successfully",
            project
        });

    } catch (error) {

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getAll = async (req, res, next) => {
    try {
        const {
            workspaceId
        } = req.params;

        if (!workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        const projects = await getWorkspaceProjects(
            workspaceId,
            req.user.userId
        );

        return res.status(200).json({
            message: "Projects retrieved successfully",
            projects
        });

    } catch (error) {

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getOne = async (req, res, next) => {
    try {
        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const project = await getProject(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Project retrieved successfully",
            project
        });

    } catch (error) {

        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Project access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        if (
            req.body.title !== undefined &&
            (!req.body.title || !req.body.title.trim())
        ) {
            return res.status(400).json({
                message: "Project title cannot be empty"
            });
        }

        const project = await updateProject(
            id,
            req.user.userId,
            req.body
        );

        return res.status(200).json({
            message: "Project updated successfully",
            project
        });

    } catch (error) {

        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Project access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const archive = async (req, res, next) => {
    try {
        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const project = await archiveProject(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Project archived successfully",
            project
        });

    } catch (error) {

        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message === "Project access denied" ||
            error.message === "Project is already archived"
        ) {
            return res.status(
                error.message === "Project access denied"
                    ? 403
                    : 400
            ).json({
                message: error.message
            });
        }

        next(error);
    }
};

const addMember = async (req, res, next) => {
    try {
        const {
            id: projectId
        } = req.params;

        const {
            userId,
            role
        } = req.body;

        if (!projectId) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        if (!userId) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        if (!role || !role.trim()) {
            return res.status(400).json({
                message: "Project role is required"
            });
        }

        const projectMember = await addProjectMember(
            projectId,
            req.user.userId,
            userId,
            role.trim()
        );

        return res.status(201).json({
            message: "Project member added successfully",
            member: projectMember
        });

    } catch (error) {

        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "User not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        if (error.message === "Invalid project role") {
            return res.status(400).json({
                message: error.message
            });
        }

        if (error.message === "User is already a project member") {
            return res.status(409).json({
                message: error.message
            });
        }

        next(error);
    }
};

export {
    create,
    getAll,
    getOne,
    update,
    archive,
    addMember
};