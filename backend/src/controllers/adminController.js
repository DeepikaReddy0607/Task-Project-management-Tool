/**
 * Admin Controller (Phase 15)
 * 
 * Handles HTTP requests for administrative dashboard and operations.
 * Protected by authMiddleware + requireAdmin middleware.
 */

import {
    getAdminOverview,
    getAdminUsers,
    getAdminUserById,
    updateUserRole,
    updateUserStatus,
    getAdminWorkspaces,
    getAdminWorkspaceById,
    getAdminProjects,
    getAdminProjectById,
    getAdminActivity
} from "../services/adminService.js";

export const getOverviewController = async (req, res) => {
    try {
        const overview = await getAdminOverview();
        return res.status(200).json({
            success: true,
            data: overview
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve admin overview"
        });
    }
};

export const getUsersController = async (req, res) => {
    try {
        const { search, role, status, page, limit, sortBy, sortOrder } = req.query;
        const result = await getAdminUsers({
            search,
            role,
            status,
            page,
            limit,
            sortBy,
            sortOrder
        });

        return res.status(200).json({
            success: true,
            data: result.users,
            pagination: result.pagination
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve users"
        });
    }
};

export const getUserByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await getAdminUserById(id);

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve user"
        });
    }
};

export const updateUserRoleController = async (req, res) => {
    try {
        const { id } = req.params;
        const role = req.body.role || req.body.roleName;

        if (!role) {
            return res.status(400).json({
                success: false,
                message: "Role is required in request body"
            });
        }

        const actorUserId = req.user?.userId || req.user?.id;
        const updated = await updateUserRole(id, role, actorUserId);

        return res.status(200).json({
            success: true,
            message: `User role successfully updated to ${updated.role}`,
            data: updated
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to update user role"
        });
    }
};

export const updateUserStatusController = async (req, res) => {
    try {
        const { id } = req.params;
        let isActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive boolean is required in request body"
            });
        }

        const actorUserId = req.user?.userId || req.user?.id;
        const updated = await updateUserStatus(id, isActive, actorUserId);

        return res.status(200).json({
            success: true,
            message: `User successfully ${updated.isActive ? "activated" : "deactivated"}`,
            data: updated
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to update user status"
        });
    }
};

export const getWorkspacesController = async (req, res) => {
    try {
        const { search, page, limit, sortBy, sortOrder } = req.query;
        const result = await getAdminWorkspaces({ search, page, limit, sortBy, sortOrder });

        return res.status(200).json({
            success: true,
            data: result.workspaces,
            pagination: result.pagination
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve workspaces"
        });
    }
};

export const getWorkspaceByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const workspace = await getAdminWorkspaceById(id);

        return res.status(200).json({
            success: true,
            data: workspace
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve workspace"
        });
    }
};

export const getProjectsController = async (req, res) => {
    try {
        const { search, status, workspaceId, page, limit, sortBy, sortOrder } = req.query;
        const result = await getAdminProjects({ search, status, workspaceId, page, limit, sortBy, sortOrder });

        return res.status(200).json({
            success: true,
            data: result.projects,
            pagination: result.pagination
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve projects"
        });
    }
};

export const getProjectByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await getAdminProjectById(id);

        return res.status(200).json({
            success: true,
            data: project
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve project"
        });
    }
};

export const getActivityController = async (req, res) => {
    try {
        const { page, limit, actionType, entityType, userId } = req.query;
        const result = await getAdminActivity({ page, limit, actionType, entityType, userId });

        return res.status(200).json({
            success: true,
            data: result.activities,
            pagination: result.pagination
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve activity logs"
        });
    }
};
