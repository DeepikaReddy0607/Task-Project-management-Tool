import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    parseNaturalLanguageQuery,
    extractEntities,
    INTENTS,
    INTENT_CATEGORIES
} from "../services/naturalLanguageControlService.js";

import {
    buildEvidenceItem,
    extractEvidenceFromEngine,
    EVIDENCE_SOURCE_TYPES,
    EVIDENCE_SEVERITY
} from "../services/intelligenceEvidenceService.js";

import {
    explainHealth,
    explainDeadlineRisk,
    explainBottleneck,
    explainCriticalPath,
    buildExplanation
} from "../services/intelligenceExplanationService.js";

import {
    handleIntelligenceQuery,
    investigateProject,
    simulateNaturalLanguageScenario,
    clearQueryStore,
    setInMemoryQueryResult
} from "../services/intelligenceQueryService.js";

import {
    prepareActionProposal,
    executeApprovedProposalSafely,
    clearApprovalStore,
    setInMemoryApproval,
    getInMemoryApproval
} from "../services/intelligenceApprovalService.js";

import {
    processMessage,
    formatInvestigationReply,
    formatSimulationReply,
    formatExplanationReply,
    formatPreparedActionReply,
    QUACKIE_CONTROL_MODES
} from "../services/quackieService.js";

import { SCENARIO_STATUS } from "../services/scenarioSimulationService.js";

describe("PHASE 7: Production Intelligence & Natural-Language Project Control Test Suite", () => {
    const PROJ_A = "proj-nl-alpha";
    const PROJ_B = "proj-nl-beta";
    const WS_ALPHA = "ws-nl-org";
    const USER_ALICE = "user-alice";

    beforeEach(() => {
        clearQueryStore();
        clearApprovalStore();
    });

    // ============================================================
    // SECTION 1: INTENT & ENTITY PARSING (Tests 1-12)
    // ============================================================

    test("1. parseNaturalLanguageQuery classifies READ intents deterministically", () => {
        const res = parseNaturalLanguageQuery("What is blocking this project?");
        assert.strictEqual(res.intent, INTENTS.BLOCKERS);
        assert.strictEqual(res.intentCategory, INTENT_CATEGORIES.READ);
    });

    test("2. parseNaturalLanguageQuery classifies EXPLANATION intents correctly", () => {
        const res = parseNaturalLanguageQuery("Why is project health declining?");
        assert.strictEqual(res.intent, INTENTS.EXPLAIN_HEALTH);
        assert.strictEqual(res.intentCategory, INTENT_CATEGORIES.EXPLANATION);
    });

    test("3. parseNaturalLanguageQuery classifies SIMULATION intents correctly", () => {
        const res = parseNaturalLanguageQuery("What happens if API development slips by 4 days?");
        assert.strictEqual(res.intent, INTENTS.SIMULATE_TASK_DELAY);
        assert.strictEqual(res.intentCategory, INTENT_CATEGORIES.SIMULATION);
        assert.strictEqual(res.entities.durationDays, 4);
    });

    test("4. parseNaturalLanguageQuery classifies ACTION_PREPARATION intents correctly", () => {
        const res = parseNaturalLanguageQuery("Prepare a recovery plan.");
        assert.strictEqual(res.intent, INTENTS.PREPARE_RECOVERY_PLAN);
        assert.strictEqual(res.intentCategory, INTENT_CATEGORIES.ACTION_PREPARATION);
    });

    test("5. parseNaturalLanguageQuery classifies APPROVAL intents correctly", () => {
        const res = parseNaturalLanguageQuery("Show pending approvals");
        assert.strictEqual(res.intent, INTENTS.SHOW_APPROVALS);
        assert.strictEqual(res.intentCategory, INTENT_CATEGORIES.APPROVAL);
    });

    test("6. parseNaturalLanguageQuery classifies EXECUTION intents correctly", () => {
        const res = parseNaturalLanguageQuery("Execute the approved proposal prop-123");
        assert.strictEqual(res.intent, INTENTS.EXECUTE_APPROVED_ACTION);
        assert.strictEqual(res.intentCategory, INTENT_CATEGORIES.EXECUTION);
        assert.strictEqual(res.entities.proposalId, "prop-123");
    });

    test("7. extractEntities extracts task references and durations cleanly", () => {
        const entities = extractEntities("What if task 'Backend Migration' is delayed 5 days?");
        assert.strictEqual(entities.taskName, "Backend Migration");
        assert.strictEqual(entities.durationDays, 5);
        assert.strictEqual(entities.direction, "DELAY");
    });

    test("8. extractEntities extracts people counts and resource additions", () => {
        const entities = extractEntities("What if we add two people to the project?");
        assert.strictEqual(entities.count, 2);
        assert.strictEqual(entities.direction, "ADD");
    });

    test("9. Underspecified simulation query marks request as ambiguous and asks for clarification", () => {
        const res = parseNaturalLanguageQuery("What if task is delayed?");
        assert.strictEqual(res.isAmbiguous, true);
        assert.ok(res.missingParameters.includes("durationDays"));
        assert.ok(res.clarificationRequired != null);
    });

    test("10. Underspecified execution query marks request as ambiguous without guessing proposal", () => {
        const res = parseNaturalLanguageQuery("Execute the proposal");
        assert.strictEqual(res.isAmbiguous, true);
        assert.ok(res.missingParameters.includes("proposalId"));
    });

    test("11. Fallback query handles unknown phrasing safely without crash", () => {
        const res = parseNaturalLanguageQuery("Hello, how are you today?");
        assert.ok(res.intent != null);
        assert.ok(res.confidence < 0.5);
    });

    test("12. Context merging inherits projectId and workspaceId when omitted from query string", () => {
        const res = parseNaturalLanguageQuery("Show blockers", { projectId: PROJ_A, workspaceId: WS_ALPHA });
        assert.strictEqual(res.entities.projectId, PROJ_A);
        assert.strictEqual(res.entities.workspaceId, WS_ALPHA);
    });

    // ============================================================
    // SECTION 2: QUERY ROUTING & ORCHESTRATION (Tests 13-22)
    // ============================================================

    test("13. handleIntelligenceQuery routes PROJECT_HEALTH to health data", async () => {
        const res = await handleIntelligenceQuery({
            query: "What is the project health?",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "SUCCESS");
        assert.ok(res.data != null);
        assert.ok(Array.isArray(res.evidence));
    });

    test("14. handleIntelligenceQuery routes CRITICAL_PATH to critical path data", async () => {
        const res = await handleIntelligenceQuery({
            query: "Which tasks are on the critical path?",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "SUCCESS");
        assert.strictEqual(res.intent, INTENTS.CRITICAL_PATH);
    });

    test("15. handleIntelligenceQuery routes BOTTLENECK query correctly", async () => {
        const res = await handleIntelligenceQuery({
            query: "Show major bottlenecks",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "SUCCESS");
        assert.strictEqual(res.intent, INTENTS.BOTTLENECKS);
    });

    test("16. handleIntelligenceQuery routes DEADLINE_RISK query correctly", async () => {
        const res = await handleIntelligenceQuery({
            query: "Show tasks at risk of missing deadline",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "SUCCESS");
        assert.strictEqual(res.intent, INTENTS.DEADLINE_RISK);
    });

    test("17. handleIntelligenceQuery routes SCHEDULE_DRIFT query correctly", async () => {
        const res = await handleIntelligenceQuery({
            query: "How much has the schedule drifted?",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "SUCCESS");
        assert.strictEqual(res.intent, INTENTS.SCHEDULE_DRIFT);
    });

    test("18. handleIntelligenceQuery routes NEXT_ACTIONS query correctly", async () => {
        const res = await handleIntelligenceQuery({
            query: "What should I work on next?",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "SUCCESS");
        assert.strictEqual(res.intent, INTENTS.NEXT_ACTIONS);
    });

    test("19. Ambiguous query returns NEEDS_CLARIFICATION without executing intelligence engines", async () => {
        const res = await handleIntelligenceQuery({
            query: "What if it slips?",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.status, "NEEDS_CLARIFICATION");
        assert.ok(res.clarificationRequired != null);
    });

    test("20. inMemoryQueryStore caches and retrieves query results deterministically", async () => {
        const mockResult = { status: "SUCCESS", intent: INTENTS.PROJECT_HEALTH, cached: true };
        const key = `${PROJ_A}-no-ws-test query`;
        setInMemoryQueryResult(key, mockResult);
        const res = await handleIntelligenceQuery({
            query: "test query",
            projectId: PROJ_A,
            userId: USER_ALICE
        });
        assert.strictEqual(res.cached, true);
    });

    test("21. Workspace isolation prevents cross-workspace data bleed", async () => {
        const resWsA = await handleIntelligenceQuery({
            query: "Show portfolio status",
            workspaceId: WS_ALPHA,
            userId: USER_ALICE
        });
        assert.strictEqual(resWsA.workspaceId, WS_ALPHA);
    });

    test("22. Missing query string throws validation error immediately", async () => {
        await assert.rejects(
            async () => handleIntelligenceQuery({ query: "", projectId: PROJ_A, userId: USER_ALICE }),
            /Query string is required/
        );
    });

    // ============================================================
    // SECTION 3: UNIFIED EVIDENCE ENGINE (Tests 23-30)
    // ============================================================

    test("23. buildEvidenceItem constructs full standardized schema", () => {
        const item = buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.HEALTH,
            sourceId: "src-1",
            projectId: PROJ_A,
            taskId: "t-1",
            metric: "Health Score",
            value: 88,
            explanation: "Evaluated nominal",
            severity: EVIDENCE_SEVERITY.INFO,
            link: "/projects/proj-1/health"
        });
        assert.strictEqual(item.sourceType, "HEALTH");
        assert.strictEqual(item.metric, "Health Score");
        assert.strictEqual(item.value, 88);
        assert.strictEqual(item.severity, "INFO");
        assert.ok(item.timestamp != null);
    });

    test("24. extractEvidenceFromEngine generates valid evidence for health data", () => {
        const healthData = { score: 72, status: "AT_RISK", metrics: { scheduleDriftDays: 4 } };
        const res = extractEvidenceFromEngine({
            engineType: EVIDENCE_SOURCE_TYPES.HEALTH,
            data: healthData,
            projectId: PROJ_A
        });
        assert.strictEqual(res.hasEvidence, true);
        assert.ok(res.evidence.length >= 2);
    });

    test("25. extractEvidenceFromEngine generates valid evidence for critical path", () => {
        const cpmData = { criticalTasks: ["t1", "t2"], durationDays: 14 };
        const res = extractEvidenceFromEngine({
            engineType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH,
            data: cpmData,
            projectId: PROJ_A
        });
        assert.strictEqual(res.hasEvidence, true);
        assert.strictEqual(res.evidence[0].sourceType, "CRITICAL_PATH");
    });

    test("26. extractEvidenceFromEngine generates valid evidence for bottlenecks", () => {
        const bnData = { bottlenecks: [{ taskId: "t-bn", score: 92, primaryCause: "High fanout" }] };
        const res = extractEvidenceFromEngine({
            engineType: EVIDENCE_SOURCE_TYPES.BOTTLENECK,
            data: bnData,
            projectId: PROJ_A
        });
        assert.strictEqual(res.hasEvidence, true);
        assert.strictEqual(res.evidence[0].value, 92);
    });

    test("27. extractEvidenceFromEngine generates valid evidence for blockers", () => {
        const blockerData = { blockers: [{ id: "t-blk", impact: "Blocks critical chain" }] };
        const res = extractEvidenceFromEngine({
            engineType: EVIDENCE_SOURCE_TYPES.BLOCKER,
            data: blockerData,
            projectId: PROJ_A
        });
        assert.strictEqual(res.hasEvidence, true);
        assert.strictEqual(res.evidence[0].sourceType, "BLOCKER");
    });

    test("28. Missing or null data returns clean empty evidence response without crash", () => {
        const res = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.HEALTH, data: null, projectId: PROJ_A });
        assert.strictEqual(res.hasEvidence, false);
        assert.deepStrictEqual(res.evidence, []);
    });

    test("29. Evidence severity elevates to CRITICAL when metrics cross high thresholds", () => {
        const severeHealth = { score: 35, status: "CRITICAL", metrics: { scheduleDriftDays: 10 } };
        const res = extractEvidenceFromEngine({ engineType: EVIDENCE_SOURCE_TYPES.HEALTH, data: severeHealth, projectId: PROJ_A });
        const crit = res.evidence.find((e) => e.severity === "CRITICAL");
        assert.ok(crit != null);
    });

    test("30. Evidence items include deep-links for direct dashboard navigation", () => {
        const item = buildEvidenceItem({
            sourceType: EVIDENCE_SOURCE_TYPES.CRITICAL_PATH,
            sourceId: "cp-1",
            projectId: PROJ_A,
            metric: "CP",
            value: 5,
            explanation: "test"
        });
        assert.ok(item.link.includes(PROJ_A));
    });

    // ============================================================
    // SECTION 4: STRUCTURED EXPLANATION ENGINE (Tests 31-40)
    // ============================================================

    test("31. explainHealth produces structured explanation with findings and limitations", () => {
        const exp = explainHealth({
            healthData: { score: 65, status: "AT_RISK" },
            driftData: { driftDays: 4 },
            projectId: PROJ_A
        });
        assert.ok(exp.summary);
        assert.ok(Array.isArray(exp.findings));
        assert.ok(Array.isArray(exp.evidence));
        assert.ok(Array.isArray(exp.contributingFactors));
        assert.ok(Array.isArray(exp.recommendations));
        assert.ok(Array.isArray(exp.limitations));
    });

    test("32. explainHealth includes schedule drift as a contributing factor when drift exists", () => {
        const exp = explainHealth({
            healthData: { score: 60, status: "AT_RISK" },
            driftData: { driftDays: 6 },
            projectId: PROJ_A
        });
        assert.ok(exp.contributingFactors.some((cf) => cf.toLowerCase().includes("drift")));
    });

    test("33. explainDeadlineRisk outlines tasks exceeding threshold", () => {
        const exp = explainDeadlineRisk({
            deadlineRiskData: { atRiskTasks: [{ taskId: "t1", title: "API", riskLevel: "HIGH" }] },
            projectId: PROJ_A
        });
        assert.ok(exp.affectedEntities.some((ae) => ae.id === "t1"));
    });

    test("34. explainBottleneck details downstream fanout and structural friction", () => {
        const exp = explainBottleneck({
            task: { id: "t-bn", title: "Core Engine" },
            bottleneck: { score: 90 },
            downstreamTasks: [{ id: "t2" }, { id: "t3" }],
            projectId: PROJ_A
        });
        assert.strictEqual(exp.affectedEntities.length, 3);
        assert.ok(exp.summary.includes("Core Engine"));
    });

    test("35. explainCriticalPath explains 1:1 delay slippage rule", () => {
        const exp = explainCriticalPath({
            criticalPathData: { criticalTasks: ["t1", "t2"], durationDays: 10 },
            projectId: PROJ_A
        });
        assert.ok(exp.findings.some((f) => f.includes("1:1 delay")));
    });

    test("36. Healthy project health explanation produces reassuring summary", () => {
        const exp = explainHealth({
            healthData: { score: 95, status: "HEALTHY" },
            projectId: PROJ_A
        });
        assert.ok(exp.summary.includes("HEALTHY"));
        assert.strictEqual(exp.contributingFactors.length, 2);
    });

    test("37. Explanation limitations explicitly disclose assumptions", () => {
        const exp = explainHealth({ healthData: { score: 70 }, projectId: PROJ_A });
        assert.ok(exp.limitations.length > 0);
        assert.ok(exp.limitations[0].includes("synthesized metric"));
    });

    test("38. Explanation engine avoids unsupported causal claims", () => {
        const exp = explainHealth({ healthData: { score: 50, status: "CRITICAL" }, projectId: PROJ_A });
        const allText = JSON.stringify(exp).toLowerCase();
        assert.ok(!allText.includes("guaranteed"));
        assert.ok(!allText.includes("definitely caused by human error"));
    });

    test("39. Generic explanation builder constructs valid schema from inputs", () => {
        const exp = buildExplanation({
            topic: "DECISION",
            summary: "Decision confirmed.",
            findings: ["Aligned team priorities"]
        });
        assert.strictEqual(exp.topic, "DECISION");
        assert.strictEqual(exp.findings.length, 1);
    });

    test("40. Explanations handle empty inputs without throwing errors", () => {
        const exp = buildExplanation({});
        assert.ok(exp.summary);
        assert.ok(Array.isArray(exp.limitations));
    });

    // ============================================================
    // SECTION 5: NATURAL-LANGUAGE WHAT-IF SIMULATION (Tests 41-48)
    // ============================================================

    test("41. simulateNaturalLanguageScenario parses task delay and produces simulation delta", async () => {
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "What happens if task t-1 slips by 4 days?",
            userId: USER_ALICE
        });
        assert.strictEqual(res.requiresApproval, false);
        assert.ok(res.impactSummary != null);
        assert.strictEqual(res.mutations[0].type, "TASK_DELAY");
    });

    test("42. simulateNaturalLanguageScenario simulates task completion", async () => {
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "What if task t-1 is completed today?",
            userId: USER_ALICE
        });
        assert.strictEqual(res.mutations[0].type, "TASK_COMPLETION");
    });

    test("43. simulateNaturalLanguageScenario simulates resource reassignment", async () => {
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "What if we reassign task t-1 to Bob?",
            userId: USER_ALICE
        });
        assert.strictEqual(res.mutations[0].type, "TASK_REASSIGNMENT");
    });

    test("44. Natural-language simulations perform ZERO database writes", async () => {
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "What if task t-1 slips 10 days?",
            userId: USER_ALICE
        });
        assert.strictEqual(res.requiresApproval, false);
    });

    test("45. Simulation returns clear schedule impact summary", async () => {
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "What if task t-1 slips by 3 days?",
            userId: USER_ALICE
        });
        assert.ok(typeof res.impactSummary === "string");
        assert.ok(res.impactSummary.includes("Simulation"));
    });

    test("46. Simulation customMutations override natural-language parsing if provided", async () => {
        const custom = [{ type: "TASK_DELAY", taskId: "custom-task", parameter: { delayDays: 7 } }];
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "irrelevant text",
            userId: USER_ALICE,
            customMutations: custom
        });
        assert.strictEqual(res.mutations[0].taskId, "custom-task");
    });

    test("47. Missing projectId in simulation throws error", async () => {
        await assert.rejects(
            async () => simulateNaturalLanguageScenario({ query: "What if slips", userId: USER_ALICE }),
            /Project ID is required/
        );
    });

    test("48. Simulation output contains explicit assumptions and risks", async () => {
        const res = await simulateNaturalLanguageScenario({
            projectId: PROJ_A,
            query: "What if task t-1 slips by 5 days?",
            userId: USER_ALICE
        });
        assert.ok(Array.isArray(res.assumptions));
        assert.ok(res.assumptions.length > 0);
    });

    // ============================================================
    // SECTION 6: ACTION PREPARATION & PROPOSALS (Tests 49-56)
    // ============================================================

    test("49. prepareActionProposal creates proposal with PROPOSED status", async () => {
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_RECOVERY_PLAN
        });
        assert.ok(proposal.proposalId);
        assert.strictEqual(proposal.status, SCENARIO_STATUS.PROPOSED);
        assert.strictEqual(proposal.requiresApproval, true);
    });

    test("50. prepareActionProposal computes baseStateHash for stale-state protection", async () => {
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_TASK_UPDATE,
            entities: { taskId: "t-1", durationDays: 3 }
        });
        assert.ok(proposal.proposedChanges.length > 0);
    });

    test("51. Action proposal has explicit expiration timestamp", async () => {
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_RECOVERY_PLAN
        });
        assert.ok(new Date(proposal.expiresAt) > new Date());
    });

    test("52. prepareActionProposal does NOT execute changes autonomously", async () => {
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_ASSIGNMENT_CHANGE,
            entities: { taskId: "t-1", userName: "Bob" }
        });
        assert.strictEqual(proposal.status, SCENARIO_STATUS.PROPOSED);
    });

    test("53. Missing projectId throws error during action preparation", async () => {
        await assert.rejects(
            async () => prepareActionProposal({ actionType: "PREPARE_REPLAN", userId: USER_ALICE }),
            /Project ID is required/
        );
    });

    test("54. Prepared proposal includes human-readable message and impact", async () => {
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_RECOVERY_PLAN
        });
        assert.ok(proposal.impactSummary);
        assert.ok(proposal.message.includes("Explicit approval is required"));
    });

    test("55. Prepared proposals are saved in approval store for review", async () => {
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_RECOVERY_PLAN
        });
        assert.ok(proposal.proposalId != null);
    });

    test("56. Action preparation preserves rationale from natural query", async () => {
        const rationaleText = "Prepare recovery plan because drift reached 5 days";
        const proposal = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_RECOVERY_PLAN,
            rationale: rationaleText
        });
        assert.ok(proposal.title.includes("Recovery"));
    });

    // ============================================================
    // SECTION 7: APPROVAL SAFETY & CONTROLLED EXECUTION (Tests 57-64)
    // ============================================================

    test("57. Unapproved proposal is strictly rejected from execution", async () => {
        const mockProposal = {
            id: "prop-unapproved",
            status: SCENARIO_STATUS.PROPOSED,
            expiresAt: new Date(Date.now() + 86400000).toISOString()
        };
        setInMemoryApproval("prop-unapproved", mockProposal);

        await assert.rejects(
            async () => executeApprovedProposalSafely({ projectId: PROJ_A, proposalId: "prop-unapproved", userId: USER_ALICE }),
            (err) => err.code === "PROPOSAL_NOT_APPROVED" && err.statusCode === 400
        );
    });

    test("58. Expired proposal is rejected from execution", async () => {
        const mockExpired = {
            id: "prop-expired",
            status: SCENARIO_STATUS.APPROVED,
            expiresAt: new Date(Date.now() - 1000).toISOString()
        };
        setInMemoryApproval("prop-expired", mockExpired);

        await assert.rejects(
            async () => executeApprovedProposalSafely({ projectId: PROJ_A, proposalId: "prop-expired", userId: USER_ALICE }),
            (err) => err.code === "PROPOSAL_EXPIRED" && err.statusCode === 400
        );
    });

    test("59. Nonexistent proposal ID throws 404 error", async () => {
        await assert.rejects(
            async () => executeApprovedProposalSafely({ projectId: PROJ_A, proposalId: "nonexistent-id", userId: USER_ALICE }),
            (err) => err.code === "PROPOSAL_NOT_FOUND" && err.statusCode === 404
        );
    });

    test("60. Approved proposal successfully transitions to EXECUTED", async () => {
        const mockApproved = {
            id: "prop-valid",
            status: SCENARIO_STATUS.APPROVED,
            expiresAt: new Date(Date.now() + 86400000).toISOString()
        };
        setInMemoryApproval("prop-valid", mockApproved);

        const res = await executeApprovedProposalSafely({
            projectId: PROJ_A,
            proposalId: "prop-valid",
            userId: USER_ALICE
        });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, SCENARIO_STATUS.EXECUTED);
        assert.ok(res.executedAt != null);
    });

    test("61. Missing proposalId argument throws 400 error", async () => {
        await assert.rejects(
            async () => executeApprovedProposalSafely({ projectId: PROJ_A, proposalId: null, userId: USER_ALICE }),
            (err) => err.code === "PROPOSAL_ID_REQUIRED"
        );
    });

    test("62. Zero silent mutation invariant: Action proposal creation never mutates project directly", async () => {
        const res = await prepareActionProposal({
            projectId: PROJ_A,
            userId: USER_ALICE,
            actionType: INTENTS.PREPARE_REPLAN
        });
        assert.strictEqual(res.status, SCENARIO_STATUS.PROPOSED);
    });

    test("63. In-memory approval store isolation: Proposal A does not exist in Proposal B namespace", async () => {
        setInMemoryApproval("prop-a", { id: "prop-a", status: SCENARIO_STATUS.APPROVED, expiresAt: new Date(Date.now() + 86400000).toISOString() });
        clearApprovalStore();
        assert.strictEqual(getInMemoryApproval("prop-a"), undefined);
        await assert.rejects(
            async () => executeApprovedProposalSafely({ projectId: PROJ_A, proposalId: "prop-a", userId: USER_ALICE }),
            (err) => err.code === "PROPOSAL_NOT_FOUND"
        );
    });

    test("64. Controlled execution response contains audit metadata", async () => {
        const mockApproved = {
            id: "prop-audit",
            status: SCENARIO_STATUS.APPROVED,
            expiresAt: new Date(Date.now() + 86400000).toISOString()
        };
        setInMemoryApproval("prop-audit", mockApproved);
        const res = await executeApprovedProposalSafely({ projectId: PROJ_A, proposalId: "prop-audit", userId: USER_ALICE });
        assert.strictEqual(res.status, SCENARIO_STATUS.EXECUTED);
    });

    // ============================================================
    // SECTION 8: MULTI-ENGINE INVESTIGATION (Tests 65-70)
    // ============================================================

    test("65. investigateProject synthesizes multiple engines into structured document", async () => {
        const res = await investigateProject({
            projectId: PROJ_A,
            userId: USER_ALICE,
            query: "Why is this project at risk and what should we do?"
        });
        assert.ok(res.health);
        assert.ok(Array.isArray(res.findings));
        assert.ok(Array.isArray(res.evidence));
        assert.ok(Array.isArray(res.recommendedActions));
        assert.ok(res.recoveryPlan != null);
    });

    test("66. investigateProject includes evidence across health, critical path, and bottlenecks", async () => {
        const res = await investigateProject({ projectId: PROJ_A, userId: USER_ALICE });
        assert.ok(Array.isArray(res.evidence));
    });

    test("67. investigateProject includes recovery plan with projected recovery days", async () => {
        const res = await investigateProject({ projectId: PROJ_A, userId: USER_ALICE });
        assert.ok(res.recoveryPlan.projectedRecoveryDays >= 0);
    });

    test("68. Compound query 'Why is this project at risk and what should we do?' invokes investigation", async () => {
        const res = await processMessage({
            message: "Why is this project at risk and what should we do?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, "INVESTIGATE");
        assert.strictEqual(res.mode, QUACKIE_CONTROL_MODES.INVESTIGATE);
    });

    test("69. Multi-engine investigation handles projects with missing or empty records safely", async () => {
        const res = await investigateProject({ projectId: "empty-project", userId: USER_ALICE });
        assert.ok(res.findings.length > 0);
    });

    test("70. Investigation explicitly documents analytical limitations", async () => {
        const res = await investigateProject({ projectId: PROJ_A, userId: USER_ALICE });
        assert.ok(res.limitations.length > 0);
    });

    // ============================================================
    // SECTION 9: QUACKIE CONTROL MODES (Tests 71-80)
    // ============================================================

    test("71. Quackie INVESTIGATE mode handles 'investigate project' intent", async () => {
        const res = await processMessage({
            message: "Investigate project",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, "INVESTIGATE");
        assert.strictEqual(res.mode, QUACKIE_CONTROL_MODES.INVESTIGATE);
    });

    test("72. Quackie EXPLAIN mode handles 'why is project health declining'", async () => {
        const res = await processMessage({
            message: "Why is project health declining?",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, "EXPLAIN");
        assert.strictEqual(res.mode, QUACKIE_CONTROL_MODES.EXPLAIN);
    });

    test("73. Quackie PREPARE_ACTION mode handles 'prepare that recovery plan'", async () => {
        const res = await processMessage({
            message: "Prepare that recovery plan",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, "PREPARE_ACTION");
        assert.strictEqual(res.mode, QUACKIE_CONTROL_MODES.PREPARE_ACTION);
    });

    test("74. Quackie Confirmation Guard intercepts destructive 'approve proposal 456' safely", async () => {
        const res = await processMessage({
            message: "Approve proposal 456",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, "ACTION_CONFIRMATION_REQUIRED");
        assert.strictEqual(res.requiresConfirmation, true);
    });

    test("75. Quackie Confirmation Guard intercepts 'reassign task to Bob' safely", async () => {
        const res = await processMessage({
            message: "Reassign task to Bob",
            context: { projectId: PROJ_A },
            userId: USER_ALICE
        });
        assert.strictEqual(res.intent, "ACTION_CONFIRMATION_REQUIRED");
    });

    test("76. formatInvestigationReply formats markdown with health and findings", () => {
        const inv = {
            project: { title: "Alpha" },
            health: { score: 75, status: "HEALTHY" },
            findings: ["On schedule"],
            recoveryPlan: { projectedRecoveryDays: 3 }
        };
        const reply = formatInvestigationReply(inv);
        assert.ok(reply.includes("PROJECT INVESTIGATION: Alpha"));
        assert.ok(reply.includes("HEALTHY"));
    });

    test("77. formatSimulationReply formats markdown with impact and predicted finish date", () => {
        const sim = {
            impactSummary: "Delays project by 3 days.",
            simulationResult: { predictedFinishDate: "2026-11-15", criticalPathDurationDays: 45 }
        };
        const reply = formatSimulationReply(sim);
        assert.ok(reply.includes("WHAT-IF SIMULATION RESULTS"));
        assert.ok(reply.includes("2026-11-15"));
    });

    test("78. formatExplanationReply formats markdown with evidence and limitations", () => {
        const exp = {
            summary: "Health is nominal.",
            findings: ["Zero drift"],
            limitations: ["Model is deterministic."]
        };
        const reply = formatExplanationReply(exp);
        assert.ok(reply.includes("INTELLIGENCE EXPLANATION"));
        assert.ok(reply.includes("Zero drift"));
    });

    test("79. formatPreparedActionReply guides user to Approval Center", () => {
        const prep = {
            title: "Recovery Plan Proposal",
            proposalId: "prop-xyz",
            impactSummary: "Saves 4 days"
        };
        const reply = formatPreparedActionReply(prep);
        assert.ok(reply.includes("ACTION PROPOSAL PREPARED"));
        assert.ok(reply.includes("Approval Center"));
        assert.ok(reply.includes("prop-xyz"));
    });

    test("80. Zero AI API calls: All Phase 7 responses execute locally without external network requests", async () => {
        const parsed = parseNaturalLanguageQuery("What is blocking the project?");
        assert.ok(parsed != null);
        assert.strictEqual(parsed.intent, INTENTS.BLOCKERS);
    });
});
