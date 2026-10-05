import { getProjectMemory } from "./projectMemoryService.js";

/**
 * Project Diagnosis Engine identifies recurring or significant project conditions
 * based on verified historical records.
 * Uses explainable evidence and strictly avoids unsupported causal blame.
 */
export const runProjectDiagnosis = async (projectId, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required for diagnosis");
    }

    const memory = await getProjectMemory(projectId, options);
    const diagnoses = [];

    const timeRange = {
        start: memory.period.start,
        end: memory.period.end
    };

    // 1. SCHEDULE INSTABILITY DIAGNOSIS
    const driftData = memory.recurringPatterns.scheduleDrift;
    if (driftData.totalOccurrences >= 2 || driftData.maxRecordedDriftDays >= 3) {
        const severity = driftData.maxRecordedDriftDays >= 7 ? "CRITICAL" : "HIGH";
        diagnoses.push({
            type: "SCHEDULE_INSTABILITY",
            severity,
            frequency: driftData.totalOccurrences,
            timeRange,
            evidence: [
                `Recorded ${driftData.totalOccurrences} schedule drift events during the analyzed period.`,
                `Maximum recorded schedule slippage reached ${driftData.maxRecordedDriftDays} days.`,
                driftData.recoveredDays > 0
                    ? `Project successfully recovered ${driftData.recoveredDays} days through corrective replanning.`
                    : "No delay recovery was recorded during the analyzed timeframe."
            ],
            affectedEntities: ["Schedule", "Project Deadline"],
            associatedFactors: [
                "Critical-path task delays",
                "Downstream dependency propagation",
                "Unadjusted milestone commitments"
            ],
            explanation: `The project experienced ${driftData.totalOccurrences} recorded schedule-drift events with up to ${driftData.maxRecordedDriftDays} days of delay.`
        });
    }

    // 2. BOTTLENECK RECURRENCE DIAGNOSIS
    const recurringBottlenecks = memory.recurringPatterns.bottlenecks;
    if (recurringBottlenecks.length > 0) {
        const top = recurringBottlenecks[0];
        const severity = top.highestSeverity === "CRITICAL" ? "CRITICAL" : "HIGH";
        diagnoses.push({
            type: "BOTTLENECK_RECURRENCE",
            severity,
            frequency: top.occurrenceCount,
            timeRange,
            evidence: recurringBottlenecks.map((b) => b.evidence),
            affectedEntities: recurringBottlenecks.map((b) => b.taskTitle),
            associatedFactors: [
                "High downstream dependency fan-out",
                "Single-resource task assignment",
                "Extended task estimation"
            ],
            explanation: `${recurringBottlenecks.length} tasks demonstrated recurring bottleneck characteristics across historical snapshots.`
        });
    }

    // 3. DEPENDENCY INSTABILITY DIAGNOSIS
    const depIssues = memory.recurringPatterns.dependencyIssues;
    if (depIssues.length > 0) {
        const dep = depIssues[0];
        diagnoses.push({
            type: "DEPENDENCY_INSTABILITY",
            severity: "MEDIUM",
            frequency: dep.count,
            timeRange,
            evidence: [dep.evidence],
            affectedEntities: ["Task Dependencies"],
            associatedFactors: [
                "Iterative workflow rearchitecting",
                "Dynamic task re-sequencing",
                "Evolving requirements"
            ],
            explanation: "Frequent dependency changes were recorded across the project timeline."
        });
    }

    // 4. WORKLOAD CONCENTRATION DIAGNOSIS
    const overdueTasks = memory.recurringPatterns.overdueTasks;
    if (overdueTasks.length > 0) {
        diagnoses.push({
            type: "TASK_OVERDUE_RECURRENCE",
            severity: overdueTasks[0].overdueOccurrences >= 3 ? "HIGH" : "MEDIUM",
            frequency: overdueTasks.length,
            timeRange,
            evidence: overdueTasks.map((t) => t.evidence),
            affectedEntities: overdueTasks.map((t) => t.taskTitle),
            associatedFactors: [
                "High task estimation relative to capacity",
                "Preceding dependency blockages",
                "Competing critical assignments"
            ],
            explanation: `${overdueTasks.length} tasks were recorded as repeatedly overdue during historical evaluations.`
        });
    }

    // 5. RISK ACCUMULATION DIAGNOSIS
    const highRisks = (memory.risks || []).filter(
        (r) => (r.severity === "High" || r.severity === "Critical") && r.status !== "Closed"
    );
    if (highRisks.length >= 2) {
        diagnoses.push({
            type: "RISK_ACCUMULATION",
            severity: highRisks.some((r) => r.severity === "Critical") ? "CRITICAL" : "HIGH",
            frequency: highRisks.length,
            timeRange,
            evidence: highRisks.map((r) => `Open ${r.severity} risk: "${r.title}"`),
            affectedEntities: highRisks.map((r) => r.title),
            associatedFactors: [
                "Unmitigated external technical blockers",
                "Schedule compression",
                "Unassigned mitigation ownership"
            ],
            explanation: `${highRisks.length} high or critical risks remain open in the project risk register.`
        });
    }

    // 6. REPLANNING FREQUENCY DIAGNOSIS
    const replanningCount = (memory.replanningActions || []).length;
    if (replanningCount >= 2) {
        diagnoses.push({
            type: "REPLANNING_FREQUENCY",
            severity: "LOW",
            frequency: replanningCount,
            timeRange,
            evidence: [`Recorded ${replanningCount} replanning proposal cycles in project history.`],
            affectedEntities: ["Replanning Engine"],
            associatedFactors: [
                "Active schedule intervention by management",
                "Response to detected schedule slippage",
                "Resource reallocation attempts"
            ],
            explanation: "Multiple replanning scenarios were generated to optimize project trajectory."
        });
    }

    // 7. DECISION VOLATILITY DIAGNOSIS (Phase 14)
    const supersededDecisions = (memory.decisions || []).filter(
        (d) => d.status === "SUPERSEDED" || d.status === "REVERSED"
    );
    if (supersededDecisions.length >= 2) {
        diagnoses.push({
            type: "DECISION_VOLATILITY",
            severity: supersededDecisions.length >= 4 ? "HIGH" : "MEDIUM",
            frequency: supersededDecisions.length,
            timeRange,
            evidence: supersededDecisions.map((d) => `Decision "${d.decision || d.title}" was superseded or reversed`),
            affectedEntities: supersededDecisions.map((d) => d.decision || d.title),
            associatedFactors: [
                "Shifting strategic or technical priorities",
                "Policy revisions after initial execution feedback",
                "Frequent realignment of project constraints"
            ],
            explanation: `${supersededDecisions.length} project decisions were superseded or reversed during the analyzed period.`
        });
    }

    // Default if no major pathologies
    if (diagnoses.length === 0) {
        diagnoses.push({
            type: "STABLE_EXECUTION",
            severity: "INFO",
            frequency: 1,
            timeRange,
            evidence: [
                "No recurring bottlenecks detected.",
                "Schedule drift maintained within safe margins.",
                "Health trend remains stable."
            ],
            affectedEntities: ["Project Baseline"],
            associatedFactors: ["Consistent milestone delivery", "Balanced team workload"],
            explanation: "The project has operated with no severe recurring instability patterns."
        });
    }

    return {
        projectId,
        analysisPeriod: timeRange,
        totalDiagnoses: diagnoses.length,
        diagnoses,
        recordedFacts: memory.recordedFacts,
        derivedInsights: memory.derivedInsights
    };
};
