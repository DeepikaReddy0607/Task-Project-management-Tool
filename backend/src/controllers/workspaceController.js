import {
    createWorkspace,
    getUserWorkspaces,
    getWorkspaceById,
    addWorkspaceMember,
    getWorkspaceMembers,
    removeWorkspaceMember,
    updateWorkspaceMemberRole,
    updateWorkspace,
    deleteWorkspace
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

const getAll = async (req, res, next) => {
    try {

        const workspaces = await getUserWorkspaces(
            req.user.userId
        );

        return res.status(200).json({
            message: "Workspaces retrieved successfully",
            workspaces
        });

    } catch (error) {
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
                message: "Workspace ID is required"
            });
        }

        const workspace = await getWorkspaceById(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Workspace retrieved successfully",
            workspace
        });

    } catch (error) {

        if (error.message === "Workspace not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const addMember = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        const {
            userId,
            workspaceRole
        } = req.body;

        // Validate workspace ID
        if (!id) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        // Validate target user
        if (!userId) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        // Validate workspace role
        if (!workspaceRole) {
            return res.status(400).json({
                message: "Workspace role is required"
            });
        }

        const membership = await addWorkspaceMember(
            id,
            req.user.userId,
            userId,
            workspaceRole
        );

        return res.status(201).json({
            message: "Workspace member added successfully",
            membership
        });

    } catch (error) {

        if (
            error.message === "Workspace not found" ||
            error.message === "User not found"
        ) {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message === "Workspace access denied" ||
            error.message ===
                "Only workspace Owner or Admin can add members"
        ) {
            return res.status(403).json({
                message: error.message
            });
        }

        if (
            error.message === "Invalid workspace role" ||
            error.message ===
                "User is already a member of this workspace"
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getMembers = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        // Validate workspace ID
        if (!id) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        const members = await getWorkspaceMembers(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Workspace members retrieved successfully",
            members
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

const removeMember = async (req, res, next) => {
    try {

        const {
            id,
            userId
        } = req.params;

        // Validate workspace ID
        if (!id) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        // Validate target user ID
        if (!userId) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        const result = await removeWorkspaceMember(
            id,
            req.user.userId,
            userId
        );

        return res.status(200).json({
            message: "Workspace member removed successfully",
            result
        });

    } catch (error) {

        if (
            error.message === "Workspace not found" ||
            error.message ===
                "User is not a member of this workspace"
        ) {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message === "Workspace access denied" ||
            error.message ===
                "Only workspace Owner or Admin can remove members"
        ) {
            return res.status(403).json({
                message: error.message
            });
        }

        if (
            error.message ===
            "Workspace owner cannot be removed"
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const updateMemberRole = async (req, res, next) => {
    try {

        const {
            id,
            userId
        } = req.params;

        const {
            workspaceRole
        } = req.body;

        // Validate workspace ID
        if (!id) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        // Validate target user ID
        if (!userId) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        // Validate workspace role
        if (!workspaceRole) {
            return res.status(400).json({
                message: "Workspace role is required"
            });
        }

        const updatedMember = await updateWorkspaceMemberRole(
            id,
            req.user.userId,
            userId,
            workspaceRole
        );

        return res.status(200).json({
            message: "Workspace member role updated successfully",
            member: updatedMember
        });

    } catch (error) {

        if (
            error.message === "Workspace not found" ||
            error.message ===
                "User is not a member of this workspace"
        ) {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message === "Workspace access denied" ||
            error.message ===
                "Only workspace Owner can update member roles"
        ) {
            return res.status(403).json({
                message: error.message
            });
        }

        if (
            error.message === "Invalid workspace role" ||
            error.message ===
                "Workspace owner role cannot be changed"
        ) {
            return res.status(400).json({
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

        const {
            name,
            description
        } = req.body;

        // Validate workspace ID
        if (!id) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        // At least one field must be provided
        if (name === undefined && description === undefined) {
            return res.status(400).json({
                message: "Name or description is required"
            });
        }

        const workspace = await updateWorkspace(
            id,
            req.user.userId,
            name,
            description
        );

        return res.status(200).json({
            message: "Workspace updated successfully",
            workspace
        });

    } catch (error) {

        if (
            error.message === "Workspace not found"
        ) {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message === "Workspace access denied" ||
            error.message ===
                "Only workspace Owner can update workspace"
        ) {
            return res.status(403).json({
                message: error.message
            });
        }

        if (
            error.message === "Workspace name cannot be empty"
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const remove = async (req, res, next) => {
    try {

        const {
            id
        } = req.params;

        // Validate workspace ID
        if (!id) {
            return res.status(400).json({
                message: "Workspace ID is required"
            });
        }

        const result = await deleteWorkspace(
            id,
            req.user.userId
        );

        return res.status(200).json({
            message: "Workspace deleted successfully",
            result
        });

    } catch (error) {

        if (error.message === "Workspace not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (
            error.message === "Workspace access denied" ||
            error.message ===
                "Only workspace Owner can delete workspace"
        ) {
            return res.status(403).json({
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
    addMember,
    getMembers,
    removeMember,
    updateMemberRole,
    update,
    remove
};