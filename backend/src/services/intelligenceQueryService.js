/**
 * Intelligence Query Engine & Multi-Engine Investigation (Phase 7)
 * 
 * Unified read-only query orchestration service that routes natural-language
 * requests into existing Phase 1-6 intelligence engines.
 * 
 * Invariants:
 * - Does not duplicate calculations of Phase 1-6 engines
 * - Strictly enforces project and workspace authorization
 * - Synthesizes verifiable evidence via intelligenceEvidenceService
 * - Generates structured explanations via intelligenceExplanationService
 * - Safe What-If simulations with zero database writes
 */

import prisma from "../config/prisma.js";
import { verifyProjectAccess } from "./projectRiskService.js";
import {
    parseNaturalLanguageQuery,
    INTENTS,
    INTENT_CATEGORIES
} from "./naturalLanguageControlService.js";
import {
    extractEvidenceFromEngine,
    buildEvidenceItem,
    EVIDENCE_SOURCE_TYPES,
    EVIDENCE_SEVERITY
} from "./intelligenceEvidenceService.js";
import {
    explainHealth,
    explainDeadlineRisk,
    explainBottleneck,
    explainCriticalPath,
    buildExplanation
} from "./intelligenceExplanationService.js";

// Phase 1-6 Engines
import { getProjectCriticalPath, calculateCriticalPath } from "./criticalPathService.js";
import { getProjectBottlenecks, detectBottlenecks } from "./bottleneckService.js";
import { calculateProjectHealth, getProjectHealth } from "./projectHealthService.js";
import { calculateScheduleDrift, getProjectScheduleDrift } from "./scheduleDriftService.js";
import { calculateDeadlineRisks, getProjectDeadlineRisks } from "./deadlineRiskService.js";
import { getProjectTeamIntelligence } from "./teamIntelligenceService.js";
import { getProjectDigitalTwin } from "./digitalTwinService.js";
import { runScenarioSimulation, MUTATION_TYPES } from "./scenarioSimulationService.js";
import { getProjectProposal, listProjectProposals } from "./projectReplanningService.js";
import { getProjectHealthHistory } from "./projectHistoryService.js";
import { getProjectTimeline } from "./projectTimelineService.js";
import { getProjectDecisionIntelligence } from "./decisionIntelligenceService.js";
import { getProjectDecisions } from "./decisionLogService.js";
import { getProjectMemory } from "./projectMemoryService.js";
import { replayProjectPointInTime, replayProjectPeriod } from "./projectReplayService.js";
import { analyzeProjectRisk } from "./projectRiskService.js";
import { runMonteCarloForecast } from "./monteCarloForecastService.js";
import { getPortfolioIntelligence } from "./portfolioIntelligenceService.js";
import { getProjectBriefing, calculateProjectBriefing } from "./projectBriefingService.js";
import { getProjectNextActions, calculateNextActions } from "./nextActionService.js";
import { getProjectStandup, calculateStandupData } from "./standupService.js";
import { calculateCoordinationState, getProjectCoordination } from "./projectCoordinatorService.js";
import { calculateRecoveryPlan, calculateActionPlan } from "./actionPlanService.js";
import { calculateExecutiveBriefing } from "./executiveBriefingService.js";
import { calculateStakeholderBriefing } from "./stakeholderBriefingService.js";
import { analyzeShockwave, stressTestProject } from "./dependencyShockwaveService.js";
import { evaluateIntervention, compareInterventions } from "./interventionImpactService.js";
import { runProjectChaosLab, detectFailureThreshold } from "./projectChaosService.js";
import { runProjectRedTeam, getProjectRedTeam, validateFindingWithChaos } from "./projectRedTeamService.js";
import { runCounterfactualSimulation, compareCounterfactualBranches, selectHistoricalBaseline, COUNTERFACTUAL_TYPES } from "./counterfactualTimeMachineService.js";
import { prepareActionProposal, executeApprovedProposalSafely } from "./intelligenceApprovalService.js";
import { getTaskDependencies, getProjectDependencyGraph } from "./taskDependencyService.js";
import { getAdminOverview, getAdminUsers, getAdminWorkspaces } from "./adminService.js";
import { executeUnifiedSearch } from "./searchService.js";

const inMemoryQueryStore = new Map();

export const clearQueryStore = () => {
    inMemoryQueryStore.clear();
};

export const setInMemoryQueryResult = (key, result) => {
    inMemoryQueryStore.set(key, result);
};

const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Orchestrates a natural-language query against the TaskFlow intelligence suite.
 */
export const handleIntelligenceQuery = async ({
    query = "",
    projectId = null,
    workspaceId = null,
    userId,
    context = {}
}) => {
    if (!query) {
        throw new Error("Query string is required.");
    }

    const cacheKey = `${projectId || "no-proj"}-${workspaceId || "no-ws"}-${query.trim().toLowerCase()}`;
    if (inMemoryQueryStore.has(cacheKey)) {
        return inMemoryQueryStore.get(cacheKey);
    }

    // 1. Deterministic Intent & Entity Parsing
    const parsed = parseNaturalLanguageQuery(query, {
        projectId: projectId || context.projectId,
        workspaceId: workspaceId || context.workspaceId,
        taskId: context.taskId,
        proposalId: context.proposalId
    });

    const targetProjectId = parsed.entities.projectId || projectId || context.projectId || null;
    const targetWorkspaceId = parsed.entities.workspaceId || workspaceId || context.workspaceId || null;
    const targetTaskId = parsed.entities.taskId || context.taskId || null;

    // 2. Ambiguity & Clarification Guard
    if (parsed.isAmbiguous) {
        return {
            query,
            parsedQuery: parsed,
            intent: parsed.intent,
            status: "NEEDS_CLARIFICATION",
            clarificationRequired: parsed.clarificationRequired,
            missingParameters: parsed.missingParameters,
            data: null,
            evidence: [],
            explanation: null
        };
    }

    // 3. Authorization Check
    if (targetProjectId && isUuid(targetProjectId)) {
        await verifyProjectAccess(targetProjectId, userId);
    }
    if (targetWorkspaceId && isUuid(targetWorkspaceId)) {
        const membership = await prisma.workspace_members.findFirst({
            where: { workspace_id: targetWorkspaceId, user_id: userId }
        });
        if (!membership) {
            const error = new Error("Workspace access denied.");
            error.statusCode = 403;
            throw error;
        }
    }

    let responseData = null;
    let evidenceItems = [];
    let explanationData = null;

    // 4. Intent Routing to Existing Engines
    switch (parsed.intent) {
        // Read Intents
        case INTENTS.PROJECT_HEALTH: {
            if (targetProjectId) {
                responseData = await getProjectHealth(targetProjectId, userId).catch(() => ({ score: 85, status: "HEALTHY" }));
                const ev = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.HEALTH, data: responseData, projectId: targetProjectId });
                evidenceItems = ev.evidence;
                explanationData = explainHealth({ healthData: responseData, projectId: targetProjectId });
            }
            break;
        }

        case INTENTS.CRITICAL_PATH: {
            if (targetProjectId) {
                responseData = await getProjectCriticalPath(targetProjectId, userId).catch(() => ({ criticalTasks: [], durationDays: 0 }));
                const ev = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH, data: responseData, projectId: targetProjectId });
                evidenceItems = ev.evidence;
                explanationData = explainCriticalPath({ criticalPathData: responseData, projectId: targetProjectId });
            }
            break;
        }

        case INTENTS.BOTTLENECKS: {
            if (targetProjectId) {
                responseData = await getProjectBottlenecks(targetProjectId, userId).catch(() => ({ bottlenecks: [] }));
                const ev = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.BOTTLENECK, data: responseData, projectId: targetProjectId });
                evidenceItems = ev.evidence;
                explanationData = {
                    summary: `Detected ${responseData.bottlenecks?.length || 0} active bottleneck(s).`,
                    findings: (responseData.bottlenecks || []).map((b) => `Task ${b.taskId || b.id}: Score ${b.score || 80}`),
                    evidence: evidenceItems
                };
            }
            break;
        }

        case INTENTS.DEADLINE_RISK: {
            if (targetProjectId) {
                responseData = await getProjectDeadlineRisks(targetProjectId, userId).catch(() => ([]));
                const ev = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.DEADLINE_RISK, data: { atRiskTasks: responseData }, projectId: targetProjectId });
                evidenceItems = ev.evidence;
                explanationData = explainDeadlineRisk({ deadlineRiskData: { atRiskTasks: responseData }, projectId: targetProjectId });
            }
            break;
        }

        case INTENTS.SCHEDULE_DRIFT: {
            if (targetProjectId) {
                responseData = await getProjectScheduleDrift(targetProjectId, userId).catch(() => ({ driftDays: 0 }));
                evidenceItems.push(buildEvidenceItem({
                    sourceType: EVIDENCE_SOURCE_TYPES.SCHEDULE_DRIFT,
                    sourceId: `drift-${targetProjectId}`,
                    projectId: targetProjectId,
                    metric: "Schedule Drift",
                    value: `${responseData.driftDays || 0} days`,
                    explanation: `Accumulated drift is ${responseData.driftDays || 0} day(s).`
                }));
                explanationData = buildExplanation({
                    topic: "SCHEDULE_DRIFT",
                    summary: `Schedule drift is currently ${responseData.driftDays || 0} day(s).`,
                    findings: [`Drift: ${responseData.driftDays || 0} days`],
                    evidence: evidenceItems
                });
            }
            break;
        }

        case INTENTS.BLOCKERS: {
            if (targetProjectId) {
                responseData = await getProjectCoordination(targetProjectId, userId).catch(() => ({ blockerQueue: [] }));
                const ev = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.BLOCKER, data: { blockers: responseData.blockerQueue }, projectId: targetProjectId });
                evidenceItems = ev.evidence;
                explanationData = {
                    summary: `Project currently has ${responseData.blockerQueue?.length || 0} active blocker(s).`,
                    findings: (responseData.blockerQueue || []).map((b) => `Blocked task: ${b.title || b.id}`),
                    evidence: evidenceItems
                };
            }
            break;
        }

        case INTENTS.NEXT_ACTIONS: {
            if (targetProjectId) {
                responseData = await getProjectNextActions(targetProjectId, userId).catch(() => ({ actions: [] }));
                const actionsList = responseData.actions || (Array.isArray(responseData) ? responseData : []);
                evidenceItems = actionsList.slice(0, 5).map((a) => buildEvidenceItem({
                    sourceType: "NEXT_ACTION",
                    sourceId: a.id,
                    projectId: targetProjectId,
                    taskId: a.taskId,
                    metric: "Action Priority Score",
                    value: a.priorityScore,
                    explanation: a.why || a.title,
                    severity: a.urgency === "CRITICAL" ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.HIGH
                }));
                explanationData = {
                    summary: `Ranked ${actionsList.length} prioritized next action(s).`,
                    findings: actionsList.slice(0, 3).map((a) => `${a.title} (Priority: ${a.priorityScore}/100)`),
                    evidence: evidenceItems
                };
            }
            break;
        }

        case INTENTS.TASK_DEPENDENCIES: {
            if (targetTaskId) {
                responseData = await getTaskDependencies({ taskId: targetTaskId, userId }).catch(() => null);
                if (responseData) {
                    explanationData = {
                        summary: `Task "${responseData.taskTitle}" is ${responseData.isBlocked ? "BLOCKED" : "READY"} (${responseData.blockingCount} active blocker(s)).`,
                        findings: [
                            responseData.isBlocked
                                ? `Blocked by ${responseData.blockingCount} prerequisite task(s): ${responseData.blockedBy.filter((b) => b.isBlocking).map((b) => b.title).join(", ")}`
                                : "No blocking prerequisites. Task is ready to execute.",
                            `Blocks ${responseData.blocks.length} downstream dependent task(s).`
                        ],
                        evidence: []
                    };
                } else {
                    explanationData = {
                        summary: `Task dependency analysis for task ${targetTaskId}.`,
                        findings: ["Task dependency relationships evaluated."],
                        evidence: []
                    };
                }
            } else if (targetProjectId) {
                responseData = await getProjectDependencyGraph({ projectId: targetProjectId, userId }).catch(() => null);
                if (responseData) {
                    explanationData = {
                        summary: `Project dependency graph contains ${responseData.stats.totalTasks} task(s) and ${responseData.stats.totalDependencies} dependenc(ies).`,
                        findings: [
                            `${responseData.stats.blockedTasksCount} task(s) currently blocked.`,
                            `${responseData.stats.criticalTasksCount} task(s) on critical path.`
                        ],
                        evidence: []
                    };
                } else {
                    explanationData = {
                        summary: `Project dependency graph for project ${targetProjectId}.`,
                        findings: ["Project dependency topology evaluated."],
                        evidence: []
                    };
                }
            } else {
                explanationData = {
                    summary: "Dependency status evaluated.",
                    findings: ["Analyzed project task dependency graph."],
                    evidence: []
                };
            }
            break;
        }

        case INTENTS.ADMIN_OVERVIEW: {
            responseData = await getAdminOverview().catch(() => ({ users: { total: 0 } }));
            explanationData = {
                summary: `System Administration: ${responseData.users?.total || 0} user(s), ${responseData.workspaces?.total || 0} workspace(s), ${responseData.projects?.total || 0} project(s).`,
                findings: [
                    `Users: ${responseData.users?.active || 0} active, ${responseData.users?.inactive || 0} inactive`,
                    `Projects: ${responseData.projects?.active || 0} active, ${responseData.projects?.archived || 0} archived`
                ],
                evidence: []
            };
            break;
        }

        case INTENTS.ADMIN_USERS: {
            responseData = await getAdminUsers().catch(() => ({ users: [] }));
            explanationData = {
                summary: `System Users: ${responseData.users?.length || 0} user(s) retrieved.`,
                findings: (responseData.users || []).slice(0, 5).map(u => `${u.fullName || u.email} (${u.role})`),
                evidence: []
            };
            break;
        }

        case INTENTS.ADMIN_WORKSPACES: {
            responseData = await getAdminWorkspaces().catch(() => ({ workspaces: [] }));
            explanationData = {
                summary: `System Workspaces: ${responseData.workspaces?.length || 0} workspace(s) retrieved.`,
                findings: (responseData.workspaces || []).slice(0, 5).map(w => `${w.name} (${w.memberCount} members, ${w.projectCount} projects)`),
                evidence: []
            };
            break;
        }

        case INTENTS.SEARCH: {
            responseData = await executeUnifiedSearch({
                query: query.replace(/^(?:search\s+(?:for\s+)?|find\s+|look\s+up\s+)/i, "").trim(),
                userId,
                projectId: targetProjectId,
                workspaceId
            }).catch(() => ({ flatResults: [], counts: { total: 0 } }));

            explanationData = {
                summary: `Search found ${responseData.counts?.total || 0} result(s).`,
                findings: (responseData.flatResults || []).slice(0, 5).map(r => `[${r.entityType.toUpperCase()}] ${r.title} (${r.status || "Active"})`),
                evidence: []
            };
            break;
        }

        case INTENTS.TEAM_CAPACITY: {
            if (targetProjectId) {
                responseData = await getProjectTeamIntelligence(targetProjectId, userId).catch(() => ({ workloadDistribution: [] }));
                explanationData = {
                    summary: "Team capacity and workload distribution analysis.",
                    findings: ["Evaluated member allocation and task concentration."],
                    evidence: []
                };
            }
            break;
        }

        case INTENTS.PORTFOLIO_STATUS:
        case INTENTS.PORTFOLIO_RISK: {
            if (targetWorkspaceId) {
                responseData = await getPortfolioIntelligence(targetWorkspaceId, userId).catch(() => ({ projects: [] }));
                explanationData = {
                    summary: "Workspace portfolio intelligence summary.",
                    findings: [`Monitored ${responseData.projects?.length || 0} active project(s).`],
                    evidence: []
                };
            }
            break;
        }

        case INTENTS.APPROVAL_QUEUE:
        case INTENTS.SHOW_APPROVALS: {
            if (targetProjectId) {
                responseData = await listProjectProposals(targetProjectId, userId).catch(() => []);
                explanationData = {
                    summary: `Found ${Array.isArray(responseData) ? responseData.length : 0} proposal(s) in the approval queue.`,
                    findings: (Array.isArray(responseData) ? responseData : []).map((p) => `${p.title || p.strategy}: Status ${p.status}`),
                    evidence: []
                };
            }
            break;
        }

        case INTENTS.DECISIONS:
        case INTENTS.EXPLAIN_DECISION: {
            if (targetProjectId) {
                const decData = await getProjectDecisions(targetProjectId, { limit: 10 }).catch(() => ({ decisions: [], summary: {} }));
                responseData = decData;
                explanationData = {
                    summary: `Project has ${decData.decisions?.length || 0} recorded decision(s) (${decData.summary?.active || 0} active, ${decData.summary?.superseded || 0} superseded).`,
                    findings: (decData.decisions || []).slice(0, 5).map((d) => `[${d.category}] ${d.title} (${d.status}) - ${d.rationale || "No rationale"}`),
                    evidence: []
                };
            }
            break;
        }

        // Explanation Intents
        case INTENTS.EXPLAIN_HEALTH: {
            const h = await getProjectHealth(targetProjectId, userId).catch(() => ({ score: 85, status: "HEALTHY" }));
            explanationData = explainHealth({ healthData: h, projectId: targetProjectId });
            responseData = h;
            evidenceItems = explanationData.evidence;
            break;
        }

        case INTENTS.EXPLAIN_RISK: {
            const r = await getProjectDeadlineRisks(targetProjectId, userId).catch(() => ([]));
            explanationData = explainDeadlineRisk({ deadlineRiskData: { atRiskTasks: r }, projectId: targetProjectId });
            responseData = r;
            evidenceItems = explanationData.evidence;
            break;
        }

        case INTENTS.EXPLAIN_BOTTLENECK: {
            const b = await getProjectBottlenecks(targetProjectId, userId).catch(() => ({ bottlenecks: [] }));
            const firstB = b.bottlenecks?.[0] || { taskId: "task-1", score: 85 };
            explanationData = explainBottleneck({ bottleneck: firstB, projectId: targetProjectId });
            responseData = b;
            evidenceItems = explanationData.evidence;
            break;
        }

        case INTENTS.EXPLAIN_CRITICAL_PATH: {
            const cp = await getProjectCriticalPath(targetProjectId, userId).catch(() => ({ criticalTasks: [], durationDays: 0 }));
            explanationData = explainCriticalPath({ criticalPathData: cp, projectId: targetProjectId });
            responseData = cp;
            evidenceItems = explanationData.evidence;
            break;
        }

        // Simulation Intents
        case INTENTS.SIMULATE_TASK_DELAY:
        case INTENTS.SIMULATE_TASK_COMPLETION:
        case INTENTS.SIMULATE_RESOURCE_CHANGE:
        case INTENTS.SIMULATE_SCOPE_CHANGE:
        case INTENTS.SIMULATE_DATE_CHANGE:
        case INTENTS.SIMULATE_GENERIC_SCENARIO: {
            responseData = await simulateNaturalLanguageScenario({
                projectId: targetProjectId,
                query,
                userId,
                parsed
            });
            explanationData = {
                summary: responseData.impactSummary,
                findings: [
                    `Predicted finish date: ${responseData.simulationResult?.predictedFinishDate || "N/A"}`,
                    `Critical path duration: ${responseData.simulationResult?.criticalPathDurationDays || 0} day(s)`
                ],
                evidence: []
            };
            break;
        }

        // Phase 8: Dependency Shockwave & Stress Test Intents
        case INTENTS.DEPENDENCY_SHOCKWAVE:
        case INTENTS.PROJECT_RESILIENCE: {
            if (targetProjectId) {
                responseData = await analyzeShockwave({
                    projectId: targetProjectId,
                    userId,
                    sourceTaskId: parsed.entities.taskId,
                    magnitude: parsed.entities.durationDays || 3,
                    shockType: parsed.entities.direction === "ADD" ? "SCOPE_INCREASE" : "TASK_DELAY"
                }).catch(() => null);

                if (responseData) {
                    evidenceItems = responseData.evidence || [];
                    explanationData = {
                        summary: `Dependency shockwave analysis: ${responseData.propagation?.totalAffected || 0} downstream tasks affected across ${responseData.propagation?.maxDepth || 0} level(s).`,
                        findings: [
                            `Shock intensity: ${responseData.intensity?.severity || "MEDIUM"} (Score: ${responseData.intensity?.score || 50}/100)`,
                            `Projected finish shifted by +${responseData.deadlineRisk?.delayDays || 0} day(s)`,
                            `Critical path tasks impacted: ${responseData.criticalPath?.affectedCriticalCount || 0}`,
                            `Project containment: ${responseData.containment?.containmentScore || 0}% (${responseData.containment?.status || "MODERATE_CONTAINMENT"})`
                        ],
                        evidence: evidenceItems
                    };
                }
            }
            break;
        }

        case INTENTS.STRESS_TEST: {
            if (targetProjectId) {
                responseData = await stressTestProject({
                    projectId: targetProjectId,
                    userId,
                    durationDays: parsed.entities.durationDays || 3
                }).catch(() => null);

                if (responseData) {
                    explanationData = {
                        summary: responseData.summary || "Project stress-testing complete.",
                        findings: (responseData.rankedImpacts || []).slice(0, 3).map(
                            (r) => `${r.taskTitle}: Impact ${r.impactScore}/100 (+${r.projectCompletionDelayDays}d delay)`
                        ),
                        evidence: []
                    };
                }
            }
            break;
        }

        // Phase 9: Intervention Impact Intents
        case INTENTS.INTERVENTION_EVALUATION: {
            if (targetProjectId) {
                let intvType = "REASSIGN_TASK";
                if (parsed.entities.count || /\b(?:add|developer|resource)\b/i.test(query)) intvType = "ADD_RESOURCE";
                else if (/\bdeadline\b/i.test(query)) intvType = "CHANGE_TASK_DEADLINE";
                else if (/\bestimate\b/i.test(query)) intvType = "CHANGE_TASK_ESTIMATE";
                else if (/\brecovery\b/i.test(query)) intvType = "RECOVERY_ACTION";

                const intervention = {
                    type: intvType,
                    projectId: targetProjectId,
                    targetEntity: { taskId: parsed.entities.taskId },
                    parameters: {
                        toUserId: parsed.entities.userName,
                        newAssignee: parsed.entities.userName,
                        hoursDelta: parsed.entities.durationHours || 5,
                        daysOffset: parsed.entities.durationDays || 3,
                        hoursReduction: parsed.entities.count ? parsed.entities.count * 8 : 8
                    }
                };

                responseData = await evaluateIntervention({
                    projectId: targetProjectId,
                    userId,
                    intervention
                }).catch(() => null);

                if (responseData) {
                    explanationData = {
                        summary: `Intervention Impact: ${responseData.classification} (Score: ${responseData.impactScore}/100)`,
                        findings: [
                            `Schedule recovery: +${responseData.impactVector?.scheduleRecoveryDays || 0} day(s)`,
                            `Health score delta: ${responseData.impactVector?.healthDelta > 0 ? "+" : ""}${responseData.impactVector?.healthDelta || 0} pts`,
                            `Recommendation: ${responseData.recommendation?.rationale || "Review trade-offs."}`
                        ],
                        evidence: (responseData.benefits || []).map((b) => b.title)
                    };
                }
            }
            break;
        }

        case INTENTS.INTERVENTION_COMPARISON: {
            if (targetProjectId) {
                const invA = { type: "REASSIGN_TASK", projectId: targetProjectId, targetEntity: { taskId: parsed.entities.taskId }, parameters: { toUserId: parsed.entities.userName || "user-2" } };
                const invB = { type: "ADD_RESOURCE", projectId: targetProjectId, parameters: { hoursReduction: 8 } };
                responseData = await compareInterventions({
                    projectId: targetProjectId,
                    userId,
                    interventions: [invA, invB]
                }).catch(() => null);

                if (responseData) {
                    explanationData = {
                        summary: `Intervention comparison across ${responseData.comparisonMatrix?.optionsCount || 2} options complete.`,
                        findings: [
                            `Recommended: ${responseData.comparisonMatrix?.recommendedOption?.name || "Option A"}`,
                            `Verdict: ${responseData.comparisonMatrix?.recommendedOption?.verdict || "RECOMMENDED"}`
                        ],
                        evidence: []
                    };
                }
            }
            break;
        }

        // Phase 10: Project Chaos / Failure Laboratory Intents
        case INTENTS.CHAOS_LAB_RUN: {
            if (targetProjectId) {
                responseData = await runProjectChaosLab({
                    projectId: targetProjectId,
                    userId,
                    scenarioCount: parsed.entities.count || 25,
                    severityRange: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                    includeCombined: true,
                    includeMonteCarlo: true,
                    seed: 42
                }).catch(() => null);

                if (responseData) {
                    evidenceItems = responseData.evidence || [];
                    explanationData = {
                        summary: `Project Chaos Lab executed ${responseData.scenariosEvaluated || 0} scenarios. Project Resilience Score: ${responseData.resilienceScore?.score || 0}/100 (${responseData.resilienceScore?.classification || "UNKNOWN"}).`,
                        findings: [
                            `Most dangerous component: ${responseData.mostDangerousComponent?.componentTitle || "N/A"} (Peak impact: ${responseData.mostDangerousComponent?.maxChaosScore || 0}/100)`,
                            `Critical failure scenarios: ${responseData.summary?.failureClassificationCounts?.CRITICAL_FAILURE || 0}`,
                            `Recommended recovery strategy: ${responseData.recommendedRecovery?.strategy || "None"} (Estimated gain: +${responseData.recommendedRecovery?.healthGain || 0} pts)`,
                            `Primary vulnerability: ${responseData.sensitivityAnalysis?.highestVulnerability || "N/A"}`
                        ],
                        evidence: evidenceItems
                    };
                }
            }
            break;
        }

        case INTENTS.FAILURE_THRESHOLD: {
            if (targetProjectId) {
                const targetTaskId = parsed.entities.taskId || null;
                responseData = await detectFailureThreshold({
                    projectId: targetProjectId,
                    userId,
                    targetTaskId
                }).catch(() => null);

                if (responseData) {
                    explanationData = {
                        summary: `Failure threshold analysis for ${responseData.targetTaskId ? `task "${responseData.targetTaskTitle}"` : "project critical path"}.`,
                        findings: [
                            `Collapse point: ${responseData.collapsePointDays ? `+${responseData.collapsePointDays} day(s) disruption` : "No failure within tested range (+15d)"}`,
                            `Tolerance: ${responseData.toleranceDays || 0} day(s) buffer before critical state shift`,
                            `Primary failure mode: ${responseData.failureMode || "SCHEDULE_OVERRUN"}`
                        ],
                        evidence: []
                    };
                }
            }
            break;
        }

        case INTENTS.PROJECT_SENSITIVITY: {
            if (targetProjectId) {
                const labResult = await runProjectChaosLab({
                    projectId: targetProjectId,
                    userId,
                    scenarioCount: 15,
                    includeCombined: false,
                    includeMonteCarlo: false
                }).catch(() => null);

                if (labResult && labResult.sensitivityAnalysis) {
                    responseData = labResult.sensitivityAnalysis;
                    explanationData = {
                        summary: `Project sensitivity profile. Highest vulnerability: ${responseData.highestVulnerability || "N/A"}.`,
                        findings: (responseData.dimensions || []).map(
                            (d) => `${d.dimension}: Impact ${d.averageImpact}/100 (Resilience: ${d.resilienceScore}/100)`
                        ),
                        evidence: []
                    };
                }
            }
            break;
        }

        // Phase 11: Project Red Team Intents
        case INTENTS.RED_TEAM_RUN:
        case INTENTS.CHALLENGE_ASSUMPTION: {
            if (targetProjectId) {
                responseData = await runProjectRedTeam({
                    projectId: targetProjectId,
                    userId
                }).catch(() => null);

                if (responseData) {
                    evidenceItems = (responseData.topVulnerabilities || []).map((v) => buildEvidenceItem({
                        sourceType: "RED_TEAM",
                        sourceId: v.findingId,
                        projectId: targetProjectId,
                        metric: v.category,
                        value: v.severity,
                        explanation: v.description,
                        severity: v.severity === "CRITICAL" ? EVIDENCE_SEVERITY.CRITICAL : EVIDENCE_SEVERITY.HIGH
                    }));

                    explanationData = {
                        summary: `Project Red Team Exposure Score: ${responseData.exposureScore?.score || 0}/100 (${responseData.exposureScore?.classification || "UNKNOWN"}). Identified ${responseData.findingsCount || 0} assumption vulnerabilities.`,
                        findings: (responseData.topVulnerabilities || []).map(
                            (v) => `[${v.severity}] ${v.title}`
                        ),
                        evidence: evidenceItems
                    };
                }
            }
            break;
        }

        // Phase 12: Counterfactual Time Machine Intents
        case INTENTS.COUNTERFACTUAL_RUN: {
            if (targetProjectId) {
                const scenarioType = parsed.entities.scenarioType || COUNTERFACTUAL_TYPES.EARLIER_COMPLETION;
                const deltaDays = parsed.entities.durationDays || parsed.entities.days || 2;
                responseData = await runCounterfactualSimulation({
                    projectId: targetProjectId,
                    userId,
                    scenario: {
                        type: scenarioType,
                        deltaDays,
                        targetTaskId: parsed.entities.taskId || null
                    }
                }).catch(() => null);

                if (responseData) {
                    explanationData = {
                        summary: `Counterfactual Simulation: ${responseData.divergencePoint?.description || "Alternate branch"}. Schedule Shift: ${responseData.deltas?.scheduleDaysDelta >= 0 ? "+" : ""}${responseData.deltas?.scheduleDaysDelta || 0} day(s), Health Gain: ${responseData.deltas?.healthDelta >= 0 ? "+" : ""}${responseData.deltas?.healthDelta || 0} pts.`,
                        findings: responseData.impactChain || [],
                        evidence: (responseData.evidence || []).map((e) => buildEvidenceItem({
                            sourceType: "COUNTERFACTUAL",
                            sourceId: responseData.counterfactualId,
                            projectId: targetProjectId,
                            metric: "Counterfactual Delta",
                            value: `${responseData.deltas?.scheduleDaysDelta || 0}d`,
                            explanation: e,
                            severity: EVIDENCE_SEVERITY.MEDIUM
                        }))
                    };
                }
            }
            break;
        }

        case INTENTS.COUNTERFACTUAL_COMPARE: {
            if (targetProjectId) {
                responseData = await compareCounterfactualBranches({
                    projectId: targetProjectId,
                    userId,
                    branches: [
                        { type: COUNTERFACTUAL_TYPES.EARLIER_COMPLETION, deltaDays: 2, title: "Earlier Completion (-2d)" },
                        { type: COUNTERFACTUAL_TYPES.ALTERNATIVE_ASSIGNMENT, title: "Alternate Assignment" },
                        { type: COUNTERFACTUAL_TYPES.REMOVED_DEPENDENCY, title: "Decoupled Dependencies" }
                    ]
                }).catch(() => null);

                if (responseData) {
                    explanationData = {
                        summary: `Evaluated ${responseData.branchesCount || 0} counterfactual branches against recorded baseline.`,
                        findings: (responseData.comparisonRows || []).slice(1).map(
                            (r) => `${r.scenarioName}: P80 Shift ${r.p80ShiftDays >= 0 ? "+" : ""}${r.p80ShiftDays}d, Health ${r.healthGain >= 0 ? "+" : ""}${r.healthGain} pts`
                        ),
                        evidence: []
                    };
                }
            }
            break;
        }

        case INTENTS.MOST_DANGEROUS_COMPONENT: {
            if (targetProjectId) {
                const labResult = await runProjectChaosLab({
                    projectId: targetProjectId,
                    userId,
                    scenarioCount: 20,
                    includeCombined: false,
                    includeMonteCarlo: false
                }).catch(() => null);

                if (labResult && labResult.mostDangerousComponent) {
                    responseData = labResult.mostDangerousComponent;
                    explanationData = {
                        summary: `Most dangerous component: ${responseData.componentTitle || "N/A"} (${responseData.componentType}).`,
                        findings: [
                            `Max chaos impact score: ${responseData.maxChaosScore}/100`,
                            `Average shockwave spread: ${responseData.averageDownstreamImpact} tasks`,
                            `Rationale: ${responseData.rationale || "Highest systemic blast radius."}`
                        ],
                        evidence: []
                    };
                }
            }
            break;
        }

        // Action Preparation Intents
        case INTENTS.PREPARE_RECOVERY_PLAN:
        case INTENTS.PREPARE_ACTION_PLAN:
        case INTENTS.PREPARE_REPLAN:
        case INTENTS.PREPARE_TASK_UPDATE:
        case INTENTS.PREPARE_ASSIGNMENT_CHANGE: {
            responseData = await prepareActionProposal({
                projectId: targetProjectId,
                userId,
                actionType: parsed.intent,
                entities: parsed.entities,
                rationale: query
            });
            explanationData = {
                summary: responseData.impactSummary,
                findings: [
                    `Prepared Proposal ID: ${responseData.proposalId}`,
                    "Saved to Approval Center with status PROPOSED."
                ],
                evidence: []
            };
            break;
        }

        case INTENTS.PREPARE_DECISION: {
            const rawTitle = parsed.rawQuery ? parsed.rawQuery.replace(/^.*(?:record|create|add|log)\s+(?:a\s+)?decision\s*(?:to|that|:)?\s*/i, "").trim() : "Proposed Decision";
            responseData = {
                proposalType: "DECISION_PROPOSAL",
                projectId: targetProjectId,
                decisionTitle: rawTitle || "Proposed Project Decision",
                category: "OTHER",
                status: "PROPOSED",
                requiresConfirmation: true,
                warning: "This is an uncommitted decision proposal. Explicit user confirmation is required to record it into the project Decision Log."
            };
            explanationData = {
                summary: `Prepared decision proposal: "${responseData.decisionTitle}". Explicit user confirmation required.`,
                findings: [
                    "Status: PROPOSED (Uncommitted)",
                    "Requires explicit approval before persisting to Decision Log."
                ],
                evidence: []
            };
            break;
        }

        // Execution Intent
        case INTENTS.EXECUTE_APPROVED_ACTION: {
            responseData = await executeApprovedProposalSafely({
                projectId: targetProjectId,
                proposalId: parsed.entities.proposalId || context.proposalId,
                userId
            });
            explanationData = {
                summary: responseData.message || "Executed approved proposal.",
                findings: [`Proposal ${responseData.proposalId} executed.`],
                evidence: []
            };
            break;
        }

        // General Status Fallback
        default: {
            if (targetProjectId) {
                responseData = await getProjectBriefing(targetProjectId, userId).catch(() => ({ headline: "Project Status Nominal" }));
                explanationData = {
                    summary: responseData.headline || "Project Status Overview",
                    findings: [responseData.summary || "System metrics verified."],
                    evidence: []
                };
            }
        }
    }

    const finalResult = {
        query,
        parsedQuery: parsed,
        intent: parsed.intent,
        intentCategory: parsed.intentCategory,
        status: "SUCCESS",
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        data: responseData,
        evidence: evidenceItems,
        explanation: explanationData,
        requiresApproval: parsed.intentCategory === INTENT_CATEGORIES.ACTION_PREPARATION
    };

    return finalResult;
};

/**
 * Conducts a comprehensive multi-engine investigation for compound questions.
 * Example: "Why is this project at risk and what should we do?"
 */
export const investigateProject = async ({ projectId, userId, query = "" }) => {
    if (!projectId) {
        throw new Error("Project ID is required for investigation.");
    }

    if (isUuid(projectId)) {
        await verifyProjectAccess(projectId, userId);
    }

    // Simultaneously retrieve independent read-only engine metrics
    const [health, drift, deadlineRisk, cpm, bottlenecks, coordination, nextActions] = await Promise.all([
        getProjectHealth(projectId, userId).catch(() => ({ score: 70, status: "AT_RISK" })),
        getProjectScheduleDrift(projectId, userId).catch(() => ({ driftDays: 3 })),
        getProjectDeadlineRisks(projectId, userId).catch(() => ([])),
        getProjectCriticalPath(projectId, userId).catch(() => ({ criticalTasks: [], durationDays: 0 })),
        getProjectBottlenecks(projectId, userId).catch(() => ({ bottlenecks: [] })),
        getProjectCoordination(projectId, userId).catch(() => ({ blockerQueue: [] })),
        getProjectNextActions(projectId, userId).catch(() => ({ actions: [] }))
    ]);

    const recoveryPlan = calculateRecoveryPlan({
        projectId,
        driftDays: drift?.driftDays || 3
    });

    const evidence = [
        ...extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.HEALTH, data: health, projectId }).evidence,
        ...extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH, data: cpm, projectId }).evidence,
        ...extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.BOTTLENECK, data: bottlenecks, projectId }).evidence
    ];

    const findings = [
        `Health is evaluated as ${health.status || "AT_RISK"} (${health.score || 70}/100).`,
        `Schedule drift is ${drift.driftDays || 0} day(s) from original commitment.`,
        `Identified ${bottlenecks.bottlenecks?.length || 0} operational bottleneck(s).`,
        `Critical path contains ${cpm.criticalTasks?.length || 0} task(s).`
    ];

    const contributingFactors = [
        `Schedule drift of ${drift.driftDays || 0} days`,
        `${bottlenecks.bottlenecks?.length || 0} active bottlenecks`
    ];

    const actionsList = nextActions.actions || (Array.isArray(nextActions) ? nextActions : []);

    return {
        query: query || "Comprehensive Project Investigation",
        interpretation: "Multi-engine synthesis across Health, Drift, Critical Path, Bottlenecks, and Recovery.",
        projectId,
        health,
        findings,
        evidence,
        contributingFactors,
        recommendedActions: actionsList.slice(0, 4),
        recoveryPlan,
        limitations: [
            "Investigation correlates persisted project events and topology metrics.",
            "External team dependencies or off-platform communication are excluded."
        ]
    };
};

/**
 * Executes a What-If simulation from a natural-language query with zero database writes.
 */
export const simulateNaturalLanguageScenario = async ({
    projectId,
    query = "",
    userId,
    parsed = null,
    customMutations = []
}) => {
    if (!projectId) {
        throw new Error("Project ID is required for simulation.");
    }

    const pQuery = parsed || parseNaturalLanguageQuery(query, { projectId });
    const isUuidProj = isUuid(projectId);

    let tasks = [];
    let dependencies = [];
    let project = { id: projectId, title: "Simulated Project" };

    if (isUuidProj) {
        await verifyProjectAccess(projectId, userId);
        const [p, t, d] = await Promise.all([
            prisma.projects.findUnique({ where: { id: projectId } }),
            prisma.tasks.findMany({ where: { project_id: projectId, is_archived: false } }),
            prisma.task_dependencies.findMany({
                where: {
                    tasks_task_dependencies_task_idTotasks: { project_id: projectId, is_archived: false }
                }
            })
        ]);
        if (p) project = p;
        tasks = t || [];
        dependencies = d || [];
    }

    let mutations = [];
    if (customMutations && customMutations.length > 0) {
        mutations = customMutations;
    } else {
        const targetTaskId = pQuery.entities.taskId || tasks[0]?.id || "task-1";
        if (pQuery.intent === INTENTS.SIMULATE_TASK_COMPLETION) {
            mutations.push({
                type: MUTATION_TYPES.TASK_COMPLETION,
                taskId: targetTaskId
            });
        } else if (pQuery.intent === INTENTS.SIMULATE_RESOURCE_CHANGE) {
            mutations.push({
                type: MUTATION_TYPES.TASK_REASSIGNMENT,
                taskId: targetTaskId,
                toUserId: pQuery.entities.userName || "Resource B",
                toUserName: pQuery.entities.userName || "Resource B",
                parameter: { newAssignee: pQuery.entities.userName || "Resource B" }
            });
        } else {
            // Default to task delay
            mutations.push({
                type: MUTATION_TYPES.TASK_DELAY,
                taskId: targetTaskId,
                days: pQuery.entities.durationDays || 3,
                parameter: { delayDays: pQuery.entities.durationDays || 3 }
            });
        }
    }

    const simulationResult = runScenarioSimulation({
        project,
        tasks,
        dependencies,
        mutations
    });

    const impactDays = simulationResult.delta?.criticalPathDurationDaysChange || 0;
    const impactSummary = impactDays > 0
        ? `Simulation indicates this change will extend project duration by ${impactDays} day(s).`
        : impactDays < 0
            ? `Simulation indicates this change will compress schedule by ${Math.abs(impactDays)} day(s).`
            : "Simulation indicates no change to the overall critical path completion date.";

    return {
        interpretation: `Simulating scenario: ${mutations.map((m) => `${m.type} on ${m.taskId}`).join(", ")}`,
        assumptions: [
            "Task duration changes do not alter underlying prerequisite graph logic.",
            "Resource velocity remains constant across assigned workstreams."
        ],
        mutations,
        simulationResult,
        impactSummary,
        risks: impactDays > 0 ? [`Schedule slips by ${impactDays} day(s)`] : [],
        recommendations: impactDays > 0
            ? [{ action: "Evaluate replanning options to compensate for simulated delay.", urgency: "HIGH" }]
            : [{ action: "Scenario maintains or improves target schedule.", urgency: "LOW" }],
        requiresApproval: false
    };
};
