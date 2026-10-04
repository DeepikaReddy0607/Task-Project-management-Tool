/**
 * Decision Controller (Phase 14)
 * 
 * HTTP Request handlers for the authoritative project Decision Log.
 * Enforces server-side project authorization, input validation, and proper HTTP status codes.
 */

import { verifyProjectAccess } from "../services/projectRiskService.js";
import {
    createDecision,
    getProjectDecisions,
    getDecisionById,
    updateDecision,
    deleteDecision,
    supersedeDecision,
    getDecisionIntelligenceDetails
} from "../services/decisionLogService.js";

const resolveUserId = (req) => {
    return req.user?.id || req.user?.userId || null;
};

const resolveProjectId = (req) => {
    return req.params.projectId || req.params.id || null;
};

/**
 * POST /api/projects/:projectId/decisions
 */
export const createDecisionHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const userId = resolveUserId(req);

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID is required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await createDecision({
            ...req.body,
            projectId,
            userId
        });

        return res.status(201).json({
            success: true,
            message: "Decision recorded successfully",
            data: result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        if (error.statusCode === 400 || error.message?.includes("required")) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: error.message } });
        }
        next(error);
    }
};

/**
 * GET /api/projects/:projectId/decisions
 */
export const getProjectDecisionsHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const userId = resolveUserId(req);

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID is required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await getProjectDecisions(projectId, req.query);

        return res.status(200).json({
            success: true,
            message: "Decisions retrieved successfully",
            ...result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        next(error);
    }
};

/**
 * GET /api/projects/:projectId/decisions/:decisionId
 */
export const getDecisionByIdHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const decisionId = req.params.decisionId;
        const userId = resolveUserId(req);

        if (!projectId || !decisionId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID and Decision ID are required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await getDecisionById(projectId, decisionId);

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        next(error);
    }
};

/**
 * PATCH /api/projects/:projectId/decisions/:decisionId
 */
export const updateDecisionHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const decisionId = req.params.decisionId;
        const userId = resolveUserId(req);

        if (!projectId || !decisionId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID and Decision ID are required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await updateDecision(projectId, decisionId, req.body, userId);

        return res.status(200).json({
            success: true,
            message: "Decision updated successfully",
            data: result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        next(error);
    }
};

/**
 * DELETE /api/projects/:projectId/decisions/:decisionId
 */
export const deleteDecisionHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const decisionId = req.params.decisionId;
        const userId = resolveUserId(req);

        if (!projectId || !decisionId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID and Decision ID are required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await deleteDecision(projectId, decisionId, userId);

        return res.status(200).json({
            success: true,
            message: "Decision deleted successfully",
            ...result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        next(error);
    }
};

/**
 * POST /api/projects/:projectId/decisions/:decisionId/supersede
 */
export const supersedeDecisionHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const decisionId = req.params.decisionId;
        const userId = resolveUserId(req);

        if (!projectId || !decisionId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID and Decision ID are required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await supersedeDecision(projectId, decisionId, req.body, userId);

        return res.status(201).json({
            success: true,
            message: "Decision superseded successfully",
            data: result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        if (error.statusCode === 400 || error.message?.includes("required")) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: error.message } });
        }
        next(error);
    }
};

/**
 * GET /api/projects/:projectId/decisions/:decisionId/intelligence
 */
export const getDecisionIntelligenceHandler = async (req, res, next) => {
    try {
        const projectId = resolveProjectId(req);
        const decisionId = req.params.decisionId;
        const userId = resolveUserId(req);

        if (!projectId || !decisionId) {
            return res.status(400).json({
                success: false,
                error: { code: "BAD_REQUEST", message: "Project ID and Decision ID are required" }
            });
        }

        await verifyProjectAccess(projectId, userId);

        const result = await getDecisionIntelligenceDetails(projectId, decisionId);

        return res.status(200).json({
            success: true,
            message: "Decision intelligence retrieved successfully",
            data: result
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: error.message } });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: error.message } });
        }
        next(error);
    }
};
