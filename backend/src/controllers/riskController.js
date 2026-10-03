import {
    createRisk,
    getProjectRisks,
    updateRisk,
    closeRisk
} from "../services/riskService.js";
import { emitRealtimeEvent } from "../socket.js";


// Create risk
const create = async (req, res, next) => {
    try {
        const { projectId } = req.params;

        const {
            title,
            description,
            severity,
            probability,
            ownerId,
            mitigationPlan,
            status
        } = req.body;

        const risk = await createRisk(
            projectId,
            req.user.userId,
            title,
            description,
            severity,
            probability,
            ownerId,
            mitigationPlan,
            status
        );

        emitRealtimeEvent({
            type: "risk.created",
            projectId,
            userId: req.user.userId,
            data: risk
        });

        res.status(201).json({
            message: "Risk created successfully",
            risk
        });

    } catch (error) {
        next(error);
    }
};


// Get project risks
const getAll = async (req, res, next) => {
    try {
        const { projectId } = req.params;

        const {
            sort,
            order
        } = req.query;

        const risks = await getProjectRisks(
            projectId,
            req.user.userId,
            sort || "severity",
            order || "desc"
        );

        res.status(200).json({
            message: "Risks retrieved successfully",
            risks
        });

    } catch (error) {
        next(error);
    }
};


// Update risk
const update = async (req, res, next) => {
    try {
        const { id } = req.params;

        const risk = await updateRisk(
            id,
            req.user.userId,
            req.body
        );

        emitRealtimeEvent({
            type: "risk.updated",
            projectId: risk.project_id,
            userId: req.user.userId,
            changes: req.body,
            data: risk
        });

        res.status(200).json({
            message: "Risk updated successfully",
            risk
        });

    } catch (error) {
        next(error);
    }
};


// Close risk
const close = async (req, res, next) => {
    try {
        const { id } = req.params;

        const risk = await closeRisk(
            id,
            req.user.userId
        );

        emitRealtimeEvent({
            type: "risk.updated",
            projectId: risk.project_id,
            userId: req.user.userId,
            changes: { status: "Closed" },
            data: risk
        });

        res.status(200).json({
            message: "Risk closed successfully",
            risk
        });

    } catch (error) {
        next(error);
    }
};


export {
    create,
    getAll,
    update,
    close
};