import {
    createRisk,
    getProjectRisks,
    updateRisk,
    closeRisk
} from "../services/riskService.js";


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
            req.user.id,
            title,
            description,
            severity,
            probability,
            ownerId,
            mitigationPlan,
            status
        );

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
            req.user.id,
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
            req.user.id,
            req.body
        );

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
            req.user.id
        );

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