/**
 * Search Controller (Phase 16)
 * 
 * Handles HTTP requests for unified, permission-aware global search
 * and advanced multi-entity filtering.
 */

import { executeUnifiedSearch } from "../services/searchService.js";

export const searchController = async (req, res) => {
    try {
        const {
            q,
            query,
            type,
            workspaceId,
            projectId,
            status,
            priority,
            assigneeId,
            ownerId,
            category,
            severity,
            from,
            to,
            page,
            pageSize,
            limit,
            sortBy,
            sortOrder
        } = req.query;

        const effectiveQuery = q !== undefined ? q : (query !== undefined ? query : "");
        const effectiveLimit = pageSize !== undefined ? pageSize : limit;
        const userId = req.user?.userId || req.user?.id;
        const userRole = req.user?.role;

        const result = await executeUnifiedSearch({
            query: effectiveQuery,
            type,
            workspaceId,
            projectId,
            status,
            priority,
            assigneeId,
            ownerId,
            category,
            severity,
            from,
            to,
            page,
            pageSize: effectiveLimit,
            sortBy,
            sortOrder,
            userId,
            userRole
        });

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to execute search"
        });
    }
};
