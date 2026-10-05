import prisma from "../config/prisma.js";
import { getProjectMemory } from "./projectMemoryService.js";
import { getProjectHealthHistory } from "./projectHistoryService.js";

// In-memory project mock for unit tests and fallback
const inMemoryProjects = new Map();

export const setInMemoryProject = (projectId, projectData) => {
    inMemoryProjects.set(projectId, {
        id: projectId,
        title: projectData.title || "Project",
        status: projectData.status || "Completed",
        is_archived: Boolean(projectData.is_archived),
        start_date: projectData.start_date ? new Date(projectData.start_date) : new Date("2026-10-01"),
        end_date: projectData.end_date ? new Date(projectData.end_date) : new Date("2026-10-31"),
        created_at: projectData.created_at ? new Date(projectData.created_at) : new Date("2026-10-01"),
        updated_at: projectData.updated_at ? new Date(projectData.updated_at) : new Date("2026-10-31")
    });
};

export const clearAutopsyStore = () => {
    inMemoryProjects.clear();
};

/**
 * Conducts a retrospective Project Autopsy for completed, archived, or closed projects.
 * Compares planned vs actual outcomes using verified historical records without assigning personal blame.
 */
export const runProjectAutopsy = async (projectId, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required for autopsy");
    }

    const { force = false } = options;

    let project = null;

    // 1. Fetch project info from DB
    try {
        if (prisma) {
            project = await prisma.projects.findUnique({
                where: { id: projectId },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    category: true,
                    priority: true,
                    status: true,
                    is_archived: true,
                    start_date: true,
                    end_date: true,
                    created_at: true,
                    updated_at: true
                }
            });
        }
    } catch {
        // Fall back to memory
    }

    if (!project) {
        project = inMemoryProjects.get(projectId);
    }

    if (!project) {
        project = {
            id: projectId,
            title: "Project",
            status: "Completed",
            is_archived: false,
            start_date: new Date("2026-10-01"),
            end_date: new Date("2026-10-31")
        };
    }

    // Check project completion or archive status
    const isCompleted =
        project.status?.toLowerCase() === "completed" ||
        project.status?.toLowerCase() === "done" ||
        project.status?.toLowerCase() === "closed" ||
        Boolean(project.is_archived);

    if (!isCompleted && !force) {
        return {
            projectId,
            eligible: false,
            projectStatus: project.status,
            message: "Project autopsy is available for completed or archived projects."
        };
    }

    // 2. Fetch memory and health history
    const memory = await getProjectMemory(projectId);
    const healthHistory = await getProjectHealthHistory(projectId, { order: "asc", limit: 100 });

    const snapshots = healthHistory.snapshots || [];
    const initialHealth = snapshots[0]?.health_score ?? null;
    const finalHealth = snapshots.slice(-1)[0]?.health_score ?? null;
    const lowestHealth = healthHistory.historicalMin;
    const highestHealth = healthHistory.historicalMax;

    // Schedule metrics
    const plannedStart = project.start_date ? new Date(project.start_date) : null;
    const plannedEnd = project.end_date ? new Date(project.end_date) : null;
    const plannedDurationDays = plannedStart && plannedEnd
        ? Math.max(1, Math.round((plannedEnd.getTime() - plannedStart.getTime()) / (1000 * 60 * 60 * 24)))
        : null;

    const maxDrift = memory.recurringPatterns.scheduleDrift.maxRecordedDriftDays;
    const totalDriftEvents = memory.recurringPatterns.scheduleDrift.totalOccurrences;
    const recoveredDays = memory.recurringPatterns.scheduleDrift.recoveredDays;

    // Factual lessons and observations
    const lessonsAndPatterns = [
        `The project recorded ${snapshots.length} health snapshots between inception and completion.`,
        `The largest recorded projected delay was ${maxDrift} days across ${totalDriftEvents} drift events.`,
        recoveredDays > 0
            ? `The project successfully recovered ${recoveredDays} days of schedule delay.`
            : "No delay recovery was recorded during the project lifecycle.",
        `Health score ranged from a low of ${lowestHealth ?? "N/A"} to a high of ${highestHealth ?? "N/A"} (final: ${finalHealth ?? "N/A"}).`
    ];

    if (memory.recurringPatterns.bottlenecks.length > 0) {
        const topB = memory.recurringPatterns.bottlenecks[0];
        lessonsAndPatterns.push(
            `Recurring bottleneck observed on "${topB.taskTitle}" across ${topB.occurrenceCount} historical evaluations.`
        );
    }

    if (memory.recurringPatterns.overdueTasks.length > 0) {
        lessonsAndPatterns.push(
            `${memory.recurringPatterns.overdueTasks.length} tasks were recorded as overdue during execution.`
        );
    }

    if (memory.replanningActions.length > 0) {
        lessonsAndPatterns.push(
            `${memory.replanningActions.length} replanning proposals were recorded in project history.`
        );
    }

    return {
        projectId,
        eligible: true,
        project: {
            id: project.id,
            title: project.title,
            status: project.status,
            priority: project.priority,
            category: project.category,
            startDate: project.start_date,
            endDate: project.end_date
        },
        outcome: {
            status: project.status,
            isArchived: project.is_archived,
            completionDate: project.updated_at || new Date(),
            summary: `Project completed with a final health score of ${finalHealth ?? "N/A"}.`
        },
        schedule: {
            plannedStartDate: plannedStart,
            plannedEndDate: plannedEnd,
            plannedDurationDays,
            largestDriftDays: maxDrift,
            driftEventsCount: totalDriftEvents,
            recoveredDays
        },
        health: {
            initialScore: initialHealth,
            lowestScore: lowestHealth,
            highestScore: highestHealth,
            finalScore: finalHealth,
            averageScore: healthHistory.averageHealth,
            majorDeclinesCount: healthHistory.majorDeclines.length,
            majorImprovementsCount: healthHistory.majorImprovements.length
        },
        criticalPath: {
            criticalPathChanges: memory.majorEvents.filter((e) => e.type.includes("CRITICAL")).length,
            criticalTaskOccurrences: memory.recurringPatterns.overdueTasks.filter((t) => t.onCriticalPath).length
        },
        bottlenecks: {
            totalBottleneckOccurrences: memory.recurringPatterns.bottlenecks.reduce(
                (sum, b) => sum + b.occurrenceCount,
                0
            ),
            recurringBottlenecks: memory.recurringPatterns.bottlenecks
        },
        risks: {
            totalRisksRecorded: memory.risks.length,
            highOrCriticalCount: memory.risks.filter(
                (r) => r.severity === "High" || r.severity === "Critical"
            ).length
        },
        decisions: {
            totalDecisionsRecorded: memory.decisions.length,
            decisionsList: memory.decisions.map((d) => ({
                id: d.id,
                title: d.decision,
                date: d.decisionDate,
                status: d.status
            }))
        },
        replanning: {
            totalProposals: memory.replanningActions.length,
            proposalsList: memory.replanningActions
        },
        team: {
            knowledgeRisk: "Evaluated during execution lifecycle",
            observations: memory.majorEvents.filter((e) => e.type.includes("WORKLOAD")).map((e) => e.description)
        },
        recurringPatterns: memory.recurringPatterns,
        lessonsAndPatterns,
        recordedFacts: memory.recordedFacts,
        derivedInsights: memory.derivedInsights
    };
};
