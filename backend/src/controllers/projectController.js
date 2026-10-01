import {
    createProject, 
    getWorkspaceProjects, 
    getProject,
    updateProject,
    archiveProject,
    addProjectMember,
    getProjectMembers,
    updateProjectMemberRole,
    removeProjectMember
} from "../services/projectService.js";
import { emitRealtimeEvent } from "../socket.js";
import { analyzeProjectRisk } from "../services/projectRiskService.js";
import { getProjectXRay } from "../services/projectXRayService.js";
import { simulateWhatIf } from "../services/whatIfService.js";


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

        emitRealtimeEvent({
            type: "project.created",
            workspaceId: project.workspace_id || workspaceId,
            projectId: project.id,
            userId: req.user.userId,
            data: project
        });

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

        emitRealtimeEvent({
            type: "project.updated",
            workspaceId: project.workspace_id,
            projectId: project.id,
            userId: req.user.userId,
            changes: req.body,
            data: project
        });

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

        emitRealtimeEvent({
            type: "project.archived",
            workspaceId: project.workspace_id,
            projectId: project.id,
            userId: req.user.userId,
            data: project
        });

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

        emitRealtimeEvent({
            type: "project.member_added",
            projectId,
            userId,
            data: projectMember
        });

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

        if (
            error.message ===
            "User is not a member of the workspace"
        ) {
            return res.status(400).json({
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

const getMembers = async (req, res, next) => {
    try {

        const {
            id: projectId
        } = req.params;

        if (!projectId) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const members = await getProjectMembers(
            projectId,
            req.user.userId
        );

        return res.status(200).json({
            message: "Project members retrieved successfully",
            members
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

const updateMemberRole = async (req, res, next) => {
    try {

        const {
            id: projectId,
            userId
        } = req.params;

        const {
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

        const updatedMember =
            await updateProjectMemberRole(
                projectId,
                req.user.userId,
                userId,
                role.trim()
            );

        emitRealtimeEvent({
            type: "project.member_role_changed",
            projectId,
            userId,
            changes: { role: role.trim() },
            data: updatedMember
        });

        return res.status(200).json({
            message: "Project member role updated successfully",
            member: updatedMember
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

        if (error.message === "Project member not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Invalid project role") {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

const removeMember = async (req, res, next) => {
    try {

        const {
            id: projectId,
            userId
        } = req.params;

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

        await removeProjectMember(
            projectId,
            req.user.userId,
            userId
        );

        emitRealtimeEvent({
            type: "project.member_removed",
            projectId,
            userId,
            data: { projectId, userId }
        });

        return res.status(200).json({
            message: "Project member removed successfully"
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

        if (error.message === "Project member not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getRisk = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const risk = await analyzeProjectRisk(id, req.user.userId);

        return res.status(200).json({
            message: "Project risk analysis retrieved successfully",
            risk
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const getXRay = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const xray = await getProjectXRay(id, req.user.userId);

        return res.status(200).json({
            message: "Project X-Ray retrieved successfully",
            xray
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                message: error.message
            });
        }

        next(error);
    }
};

const simulateProjectWhatIf = async (req, res, next) => {
    try {
        const { id: projectId } = req.params;
        const {
            scenario,
            taskId,
            targetTaskTitle,
            priority,
            daysOffset,
            newDate,
            assigneeId,
            assigneeName,
            changes,
            params
        } = req.body;

        if (!projectId) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const simulation = await simulateWhatIf({
            userId: req.user.userId,
            projectId,
            scenario: scenario || "complete_task",
            taskId,
            targetTaskTitle,
            priority,
            daysOffset,
            newDate,
            assigneeId,
            assigneeName,
            changes,
            params: params || {}
        });

        return res.status(200).json({
            message: "Simulation completed successfully",
            simulation,
            reply: simulation.reply,
            emotion: simulation.emotion
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
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
    update,
    archive,
    addMember,
    getMembers,
    updateMemberRole,
    removeMember,
    getRisk,
    getXRay,
    simulateProjectWhatIf
};