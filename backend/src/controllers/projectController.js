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
import { getProjectCriticalPath } from "../services/criticalPathService.js";
import { getProjectBottlenecks } from "../services/bottleneckService.js";
import { getProjectDigitalTwin } from "../services/digitalTwinService.js";
import { getProjectHealth, calculateProjectHealth } from "../services/projectHealthService.js";
import { getProjectScheduleDrift, calculateScheduleDrift } from "../services/scheduleDriftService.js";
import { getProjectDeadlineRisks, calculateDeadlineRisks } from "../services/deadlineRiskService.js";
import { getProjectPreMortem, runPreMortemAnalysis } from "../services/preMortemService.js";
import { getProjectTeamIntelligence, calculateTeamWorkload, calculateKnowledgeConcentration } from "../services/teamIntelligenceService.js";
import {
    createProjectScenario,
    getProjectScenario,
    listProjectScenarios,
    simulateProjectScenario
} from "../services/scenarioSimulationService.js";
import { compareProjectScenarios } from "../services/scenarioComparisonService.js";
import {
    generateReplanningProposals,
    getProjectProposal,
    listProjectProposals,
    approveProjectProposal,
    rejectProjectProposal
} from "../services/projectReplanningService.js";
import { getProjectRecommendations } from "../services/recommendationService.js";
import { executeReplanningProposal } from "../services/replanningExecutionService.js";
import { verifyProjectAccess } from "../services/projectRiskService.js";
import { getProjectHealthHistory } from "../services/projectHistoryService.js";
import { getProjectTimeline } from "../services/projectTimelineService.js";
import { getProjectDecisionIntelligence } from "../services/decisionIntelligenceService.js";
import { getProjectMemory } from "../services/projectMemoryService.js";
import { replayProjectPointInTime, replayProjectPeriod } from "../services/projectReplayService.js";
import { runProjectDiagnosis } from "../services/projectDiagnosisService.js";
import { runProjectAutopsy } from "../services/projectAutopsyService.js";
import { getProjectForecast } from "../services/monteCarloForecastService.js";
import { getProbabilisticCriticalPath } from "../services/probabilisticCriticalPathService.js";
import { getProjectScopeIntelligence } from "../services/scopeIntelligenceService.js";
import { getCrossProjectIntelligence } from "../services/crossProjectIntelligenceService.js";
import { getResourceConflicts } from "../services/resourceConflictService.js";
import { getPortfolioIntelligence } from "../services/portfolioIntelligenceService.js";
import { simulatePortfolioScenario } from "../services/portfolioSimulationService.js";
import { getProjectBriefing } from "../services/projectBriefingService.js";
import { getPersonalBriefing } from "../services/personalBriefingService.js";
import { getWorkspaceExecutiveBriefing } from "../services/executiveBriefingService.js";
import { getProjectNextActions, getWorkspaceNextActions } from "../services/nextActionService.js";
import { getProjectStandup, getPersonalStandup } from "../services/standupService.js";
import { getProjectStakeholderBriefing } from "../services/stakeholderBriefingService.js";
import { getProjectCoordination, getWorkspaceCoordination } from "../services/projectCoordinatorService.js";
import { getProjectActionPlan, getProjectRecoveryPlan, getDailyActionPlan } from "../services/actionPlanService.js";


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

const getCriticalPath = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required"
            });
        }

        const criticalPathData = await getProjectCriticalPath(projectId, req.user.userId);

        if (criticalPathData.hasCycle) {
            return res.status(200).json({
                success: false,
                message: "Dependency graph contains a circular dependency (cycle)",
                data: criticalPathData
            });
        }

        return res.status(200).json({
            success: true,
            message: "Critical path analysis retrieved successfully",
            data: criticalPathData
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};

const getBottlenecks = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required"
            });
        }

        const bottleneckData = await getProjectBottlenecks(projectId, req.user.userId);

        if (bottleneckData.hasCycle) {
            return res.status(200).json({
                success: false,
                message: "Dependency graph contains a circular dependency (cycle)",
                data: bottleneckData
            });
        }

        return res.status(200).json({
            success: true,
            message: "Project bottleneck analysis retrieved successfully",
            data: bottleneckData
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};

const getDigitalTwin = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }
        const data = await getProjectDigitalTwin(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Digital Twin retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getHealth = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }
        const data = await getProjectHealth(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project health scorecard retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getDrift = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }
        const data = await getProjectScheduleDrift(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Schedule drift analysis retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getDeadlineRisk = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }
        const data = await getProjectDeadlineRisks(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Deadline risk analysis retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getPreMortem = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }
        const data = await getProjectPreMortem(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Predictive pre-mortem analysis retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getTeamIntelligence = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }
        const data = await getProjectTeamIntelligence(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Team capacity and resilience analysis retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getIntelligenceOverview = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }

        const digitalTwin = await getProjectDigitalTwin(projectId, req.user.userId);
        const health = calculateProjectHealth(digitalTwin);
        const drift = calculateScheduleDrift(digitalTwin);
        const deadlineRisks = calculateDeadlineRisks(digitalTwin);
        const preMortem = runPreMortemAnalysis(digitalTwin);
        const teamWorkload = calculateTeamWorkload(digitalTwin);
        const knowledgeRisk = calculateKnowledgeConcentration(digitalTwin);

        return res.status(200).json({
            success: true,
            message: "Project intelligence overview retrieved successfully",
            data: {
                projectId,
                digitalTwin,
                health,
                drift,
                deadlineRisks,
                criticalPath: digitalTwin.criticalPath,
                bottlenecks: digitalTwin.bottlenecks,
                preMortem,
                teamWorkload,
                knowledgeRisk
            }
        });
    } catch (error) {
        if (error.statusCode === 404 || error.message === "Project not found") {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message === "Project access denied") {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

// ============================================================
// PHASE 3: SCENARIOS & REPLANNING HANDLERS
// ============================================================

const getScenarios = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await listProjectScenarios(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project scenarios retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const createScenario = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { name, description, mutations } = req.body || {};
        const data = await createProjectScenario({
            projectId,
            userId: req.user.userId,
            name,
            description,
            mutations
        });
        return res.status(201).json({ success: true, message: "Scenario created successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getScenario = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { scenarioId } = req.params;
        const data = await getProjectScenario(projectId, scenarioId, req.user.userId);
        return res.status(200).json({ success: true, message: "Scenario retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const simulateScenario = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { scenarioId } = req.params;
        const { mutations } = req.body || {};
        const data = await simulateProjectScenario({
            projectId,
            userId: req.user.userId,
            scenarioId,
            mutations
        });
        return res.status(200).json({ success: true, message: "Scenario simulated successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const compareScenarios = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { scenarioIds, scenarios } = req.body || {};
        const data = await compareProjectScenarios({
            projectId,
            userId: req.user.userId,
            scenarioIds,
            scenarios
        });
        return res.status(200).json({ success: true, message: "Scenarios compared successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getReplanningProposals = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await listProjectProposals(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Replanning proposals retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const generateReplanning = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { strategy } = req.body || req.query || {};
        const data = await generateReplanningProposals({
            projectId,
            userId: req.user.userId,
            strategy
        });
        return res.status(200).json({ success: true, message: "Replanning proposals generated successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getProposal = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { proposalId } = req.params;
        const data = await getProjectProposal(projectId, proposalId, req.user.userId);
        return res.status(200).json({ success: true, message: "Proposal retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const approveProposal = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { proposalId } = req.params;
        const data = await approveProjectProposal(projectId, proposalId, req.user.userId);
        return res.status(200).json({ success: true, message: "Proposal approved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.statusCode === 400) {
            return res.status(400).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const rejectProposal = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { proposalId } = req.params;
        const { reason } = req.body || {};
        const data = await rejectProjectProposal(projectId, proposalId, req.user.userId, reason);
        return res.status(200).json({ success: true, message: "Proposal rejected successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const executeProposal = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const { proposalId } = req.params;
        const data = await executeReplanningProposal({
            projectId,
            proposalId,
            userId: req.user.userId
        });
        return res.status(200).json({ success: true, message: "Proposal executed successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.statusCode === 409 || error.code === "PROPOSAL_STALE") {
            return res.status(409).json({ success: false, code: "PROPOSAL_STALE", message: error.message });
        }
        if (error.statusCode === 400 || error.code?.startsWith("PROPOSAL_")) {
            return res.status(400).json({ success: false, code: error.code || "BAD_REQUEST", message: error.message });
        }
        next(error);
    }
};

const getRecommendations = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectRecommendations({ projectId, userId: req.user.userId });
        return res.status(200).json({ success: true, message: "Project recommendations retrieved successfully", data });
    } catch (error) {
        if (error.statusCode === 404 || error.message?.includes("not found")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.statusCode === 403 || error.message?.includes("denied")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

// ============================================================
// PHASE 4: HISTORICAL & MEMORY CONTROLLER HANDLERS
// ============================================================

const getHealthHistory = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProjectHealthHistory(projectId, req.query);
        return res.status(200).json({ success: true, message: "Health history retrieved successfully", data });
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

const getTimeline = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProjectTimeline(projectId, req.query);
        return res.status(200).json({ success: true, message: "Project timeline retrieved successfully", data });
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

const getDecisions = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProjectDecisionIntelligence(projectId, req.query);
        return res.status(200).json({ success: true, message: "Decision intelligence retrieved successfully", data });
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

const getMemory = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProjectMemory(projectId, req.query);
        return res.status(200).json({ success: true, message: "Project memory retrieved successfully", data });
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

const getReplay = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        let data;
        if (req.query.from && req.query.to) {
            data = await replayProjectPeriod(projectId, req.query);
        } else {
            const timestamp = req.query.timestamp || req.query.targetDate || new Date().toISOString();
            data = await replayProjectPointInTime(projectId, timestamp);
        }
        return res.status(200).json({ success: true, message: "Project replay retrieved successfully", data });
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

const getDiagnosis = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await runProjectDiagnosis(projectId, req.query);
        return res.status(200).json({ success: true, message: "Project diagnosis completed successfully", data });
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

const getAutopsy = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const force = req.query.force === "true";
        const data = await runProjectAutopsy(projectId, { force });
        return res.status(200).json({ success: true, message: "Project autopsy retrieved successfully", data });
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

const getForecast = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProjectForecast(projectId, req.user.userId, {
            iterations: req.query.iterations ? Number(req.query.iterations) : undefined,
            seed: req.query.seed ? Number(req.query.seed) : undefined
        });
        return res.status(200).json({ success: true, message: "Project schedule forecast generated successfully", data });
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

const getProbabilisticCP = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProbabilisticCriticalPath(projectId, req.user.userId, {
            iterations: req.query.iterations ? Number(req.query.iterations) : undefined,
            seed: req.query.seed ? Number(req.query.seed) : undefined
        });
        return res.status(200).json({ success: true, message: "Probabilistic critical path analyzed successfully", data });
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

const getScope = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const data = await getProjectScopeIntelligence(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project scope intelligence retrieved successfully", data });
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

const getResourcePressure = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Project ID is required" } });
        }
        await verifyProjectAccess(projectId, req.user.userId);
        const twin = await getProjectDigitalTwin(projectId, req.user.userId);
        const workload = calculateTeamWorkload(twin);
        return res.status(200).json({ success: true, message: "Project resource pressure retrieved successfully", data: workload });
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

const getPortfolio = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId;
        if (!workspaceId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Workspace ID is required" } });
        }
        const data = await getPortfolioIntelligence(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Portfolio intelligence retrieved successfully", data });
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

const getCrossProject = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId;
        if (!workspaceId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Workspace ID is required" } });
        }
        const data = await getCrossProjectIntelligence(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Cross-project intelligence retrieved successfully", data });
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

const getResourceConflictsController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId;
        if (!workspaceId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Workspace ID is required" } });
        }
        const data = await getResourceConflicts(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Resource conflicts retrieved successfully", data });
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

const getPortfolioRiskMapController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId;
        if (!workspaceId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Workspace ID is required" } });
        }
        const data = await getPortfolioIntelligence(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Portfolio risk map retrieved successfully", data: data.riskConcentration });
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

const simulatePortfolioScenarioController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId;
        const { scenarioType, parameters } = req.body;
        if (!workspaceId) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Workspace ID is required" } });
        }
        if (!scenarioType) {
            return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "scenarioType is required" } });
        }

        const membership = await prisma.workspace_members.findFirst({
            where: { workspace_id: workspaceId, user_id: req.user.userId }
        });
        if (!membership) {
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Workspace access denied" } });
        }

        const projects = await prisma.projects.findMany({
            where: { workspace_id: workspaceId, is_archived: false },
            include: { project_members: { select: { user_id: true } } }
        });

        const authorized = projects.filter((p) =>
            membership.workspace_role === "Owner" ||
            membership.workspace_role === "Admin" ||
            p.manager_id === req.user.userId ||
            p.project_members.some((m) => m.user_id === req.user.userId)
        );

        const projectIds = authorized.map((p) => p.id);

        const [tasks, dependencies, members, risks] = await Promise.all([
            prisma.tasks.findMany({
                where: { project_id: { in: projectIds }, is_archived: false }
            }),
            prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: { in: projectIds }, is_archived: false },
                    tasks_task_dependencies_depends_on_task_idTotasks: { project_id: { in: projectIds }, is_archived: false }
                }
            }),
            prisma.project_members.findMany({ where: { project_id: { in: projectIds } } }),
            prisma.risks.findMany({ where: { project_id: { in: projectIds } } })
        ]);

        const projectsData = authorized.map((p) => ({
            project: p,
            tasks: tasks.filter((t) => t.project_id === p.id),
            dependencies: dependencies.filter((d) => {
                const t = tasks.find((item) => item.id === d.task_id);
                return t && t.project_id === p.id;
            }),
            members: members.filter((m) => m.project_id === p.id),
            risks: risks.filter((r) => r.project_id === p.id)
        }));

        const data = simulatePortfolioScenario({
            workspaceId,
            scenarioType,
            params: parameters || {},
            projectsData
        });

        return res.status(200).json({ success: true, message: "Portfolio scenario simulated successfully", data });
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

const getBriefingController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectBriefing(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project briefing retrieved successfully", data });
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

const getStandupController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectStandup(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project standup retrieved successfully", data });
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

const getNextActionsController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectNextActions(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Next actions retrieved successfully", data });
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

const getCoordinationController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectCoordination(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project coordination state retrieved successfully", data });
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

const getStakeholderBriefingController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectStakeholderBriefing(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Stakeholder briefing retrieved successfully", data });
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

const getActionPlanController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectActionPlan(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project action plan retrieved successfully", data });
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

const getRecoveryPlanController = async (req, res, next) => {
    try {
        const projectId = req.params.projectId || req.params.id;
        const data = await getProjectRecoveryPlan(projectId, req.user.userId);
        return res.status(200).json({ success: true, message: "Project recovery plan retrieved successfully", data });
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

const getPersonalBriefingController = async (req, res, next) => {
    try {
        const data = await getPersonalBriefing(req.user.userId, req.query.workspaceId || null);
        return res.status(200).json({ success: true, message: "Personal briefing retrieved successfully", data });
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

const getPersonalStandupController = async (req, res, next) => {
    try {
        const data = await getPersonalStandup(req.user.userId, req.query.workspaceId || null);
        return res.status(200).json({ success: true, message: "Personal standup retrieved successfully", data });
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

const getPersonalActionPlanController = async (req, res, next) => {
    try {
        const data = await getDailyActionPlan(req.user.userId, req.query.workspaceId || null);
        return res.status(200).json({ success: true, message: "Personal action plan retrieved successfully", data });
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

const getWorkspaceBriefingController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId || req.params.id;
        const data = await getWorkspaceExecutiveBriefing(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Workspace briefing retrieved successfully", data });
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

const getWorkspaceCoordinationController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId || req.params.id;
        const data = await getWorkspaceCoordination(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Workspace coordination retrieved successfully", data });
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

const getWorkspaceApprovalsController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId || req.params.id;
        const data = await getWorkspaceCoordination(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Workspace approvals retrieved successfully", data: data.approvals || [] });
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

const getWorkspaceActionsController = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId || req.params.id;
        const data = await getWorkspaceNextActions(workspaceId, req.user.userId);
        return res.status(200).json({ success: true, message: "Workspace actions retrieved successfully", data });
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
    simulateProjectWhatIf,
    getCriticalPath,
    getBottlenecks,
    getDigitalTwin,
    getHealth,
    getDrift,
    getDeadlineRisk,
    getPreMortem,
    getTeamIntelligence,
    getIntelligenceOverview,
    getScenarios,
    createScenario,
    getScenario,
    simulateScenario,
    compareScenarios,
    getReplanningProposals,
    generateReplanning,
    getProposal,
    approveProposal,
    rejectProposal,
    executeProposal,
    getRecommendations,
    getHealthHistory,
    getTimeline,
    getDecisions,
    getMemory,
    getReplay,
    getDiagnosis,
    getAutopsy,
    getForecast,
    getProbabilisticCP,
    getScope,
    getResourcePressure,
    getPortfolio,
    getCrossProject,
    getResourceConflictsController,
    getPortfolioRiskMapController,
    simulatePortfolioScenarioController,
    getBriefingController,
    getStandupController,
    getNextActionsController,
    getCoordinationController,
    getStakeholderBriefingController,
    getActionPlanController,
    getRecoveryPlanController,
    getPersonalBriefingController,
    getPersonalStandupController,
    getPersonalActionPlanController,
    getWorkspaceBriefingController,
    getWorkspaceCoordinationController,
    getWorkspaceApprovalsController,
    getWorkspaceActionsController
};
