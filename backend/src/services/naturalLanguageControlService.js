/**
 * Natural Language Project Control Service (Phase 7)
 * 
 * Provides deterministic, explainable natural-language intent recognition,
 * entity extraction, and control routing.
 * 
 * Safety invariants:
 * - 100% deterministic (no external LLM or probabilistic black-box API)
 * - Traceable intent classification with rule/pattern documentation
 * - Zero silent state mutation: read/simulate/prepare only
 * - Disambiguation guard for underspecified requests
 */

export const INTENT_CATEGORIES = {
    READ: "READ",
    EXPLANATION: "EXPLANATION",
    SIMULATION: "SIMULATION",
    ACTION_PREPARATION: "ACTION_PREPARATION",
    APPROVAL: "APPROVAL",
    EXECUTION: "EXECUTION"
};

export const INTENTS = {
    // Read Intents
    PROJECT_STATUS: "PROJECT_STATUS",
    PROJECT_HEALTH: "PROJECT_HEALTH",
    CRITICAL_PATH: "CRITICAL_PATH",
    BOTTLENECKS: "BOTTLENECKS",
    DEADLINE_RISK: "DEADLINE_RISK",
    SCHEDULE_DRIFT: "SCHEDULE_DRIFT",
    BLOCKERS: "BLOCKERS",
    RISKS: "RISKS",
    DECISIONS: "DECISIONS",
    PROJECT_MEMORY: "PROJECT_MEMORY",
    PROJECT_HISTORY: "PROJECT_HISTORY",
    PROJECT_REPLAY: "PROJECT_REPLAY",
    TEAM_CAPACITY: "TEAM_CAPACITY",
    NEXT_ACTIONS: "NEXT_ACTIONS",
    PORTFOLIO_STATUS: "PORTFOLIO_STATUS",
    PORTFOLIO_RISK: "PORTFOLIO_RISK",
    APPROVAL_QUEUE: "APPROVAL_QUEUE",
    RECENT_CHANGES: "RECENT_CHANGES",
    RECOMMENDATIONS: "RECOMMENDATIONS",
    EXECUTIVE_SUMMARY: "EXECUTIVE_SUMMARY",
    TASK_DEPENDENCIES: "TASK_DEPENDENCIES",

    // Explanation Intents
    EXPLAIN_HEALTH: "EXPLAIN_HEALTH",
    EXPLAIN_RISK: "EXPLAIN_RISK",
    EXPLAIN_BOTTLENECK: "EXPLAIN_BOTTLENECK",
    EXPLAIN_RECOMMENDATION: "EXPLAIN_RECOMMENDATION",
    EXPLAIN_DECISION: "EXPLAIN_DECISION",
    EXPLAIN_SCHEDULE_DRIFT: "EXPLAIN_SCHEDULE_DRIFT",
    EXPLAIN_CRITICAL_PATH: "EXPLAIN_CRITICAL_PATH",

    // Simulation Intents
    SIMULATE_TASK_DELAY: "SIMULATE_TASK_DELAY",
    SIMULATE_TASK_COMPLETION: "SIMULATE_TASK_COMPLETION",
    SIMULATE_RESOURCE_CHANGE: "SIMULATE_RESOURCE_CHANGE",
    SIMULATE_SCOPE_CHANGE: "SIMULATE_SCOPE_CHANGE",
    SIMULATE_DATE_CHANGE: "SIMULATE_DATE_CHANGE",
    SIMULATE_GENERIC_SCENARIO: "SIMULATE_GENERIC_SCENARIO",

    // Action Preparation Intents
    PREPARE_RECOVERY_PLAN: "PREPARE_RECOVERY_PLAN",
    PREPARE_ACTION_PLAN: "PREPARE_ACTION_PLAN",
    PREPARE_REPLAN: "PREPARE_REPLAN",
    PREPARE_TASK_UPDATE: "PREPARE_TASK_UPDATE",
    PREPARE_ASSIGNMENT_CHANGE: "PREPARE_ASSIGNMENT_CHANGE",
    PREPARE_DECISION: "PREPARE_DECISION",

    // Approval Intents
    SHOW_APPROVALS: "SHOW_APPROVALS",
    EXPLAIN_APPROVAL: "EXPLAIN_APPROVAL",
    PREPARE_APPROVAL: "PREPARE_APPROVAL",

    // Execution Intents
    EXECUTE_APPROVED_ACTION: "EXECUTE_APPROVED_ACTION",

    // Dependency Shockwave Intents (Phase 8)
    DEPENDENCY_SHOCKWAVE: "DEPENDENCY_SHOCKWAVE",
    STRESS_TEST: "STRESS_TEST",
    PROJECT_RESILIENCE: "PROJECT_RESILIENCE",

    // Intervention Impact Engine Intents (Phase 9)
    INTERVENTION_EVALUATION: "INTERVENTION_EVALUATION",
    INTERVENTION_COMPARISON: "INTERVENTION_COMPARISON",

    // Project Chaos / Failure Laboratory Intents (Phase 10)
    CHAOS_LAB_RUN: "CHAOS_LAB_RUN",
    FAILURE_THRESHOLD: "FAILURE_THRESHOLD",
    PROJECT_SENSITIVITY: "PROJECT_SENSITIVITY",
    MOST_DANGEROUS_COMPONENT: "MOST_DANGEROUS_COMPONENT",

    // Project Red Team Intents (Phase 11)
    RED_TEAM_RUN: "RED_TEAM_RUN",
    CHALLENGE_ASSUMPTION: "CHALLENGE_ASSUMPTION",

    // Counterfactual Time Machine Intents (Phase 12)
    COUNTERFACTUAL_RUN: "COUNTERFACTUAL_RUN",
    COUNTERFACTUAL_COMPARE: "COUNTERFACTUAL_COMPARE",

    // Admin Dashboard Intents (Phase 15)
    ADMIN_OVERVIEW: "ADMIN_OVERVIEW",
    ADMIN_USERS: "ADMIN_USERS",
    ADMIN_WORKSPACES: "ADMIN_WORKSPACES",
    PREPARE_ROLE_CHANGE: "PREPARE_ROLE_CHANGE",
    PREPARE_USER_DEACTIVATE: "PREPARE_USER_DEACTIVATE",

    // Search & Filters Intent (Phase 16)
    SEARCH: "SEARCH"
};

/**
 * Mapping intents to categories and primary intelligence engines.
 */
export const INTENT_METADATA = {
    [INTENTS.SEARCH]: { category: INTENT_CATEGORIES.READ, engines: ["searchService"] },
    [INTENTS.ADMIN_OVERVIEW]: { category: INTENT_CATEGORIES.READ, engines: ["adminService"] },
    [INTENTS.ADMIN_USERS]: { category: INTENT_CATEGORIES.READ, engines: ["adminService"] },
    [INTENTS.ADMIN_WORKSPACES]: { category: INTENT_CATEGORIES.READ, engines: ["adminService"] },
    [INTENTS.PREPARE_ROLE_CHANGE]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["adminService"] },
    [INTENTS.PREPARE_USER_DEACTIVATE]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["adminService"] },
    [INTENTS.RED_TEAM_RUN]: { category: INTENT_CATEGORIES.READ, engines: ["projectRedTeamService"] },
    [INTENTS.CHALLENGE_ASSUMPTION]: { category: INTENT_CATEGORIES.READ, engines: ["projectRedTeamService"] },
    [INTENTS.COUNTERFACTUAL_RUN]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["counterfactualTimeMachineService"] },
    [INTENTS.COUNTERFACTUAL_COMPARE]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["counterfactualTimeMachineService"] },
    [INTENTS.PROJECT_STATUS]: { category: INTENT_CATEGORIES.READ, engines: ["projectBriefingService", "digitalTwinService"] },
    [INTENTS.PROJECT_HEALTH]: { category: INTENT_CATEGORIES.READ, engines: ["projectHealthService"] },
    [INTENTS.CRITICAL_PATH]: { category: INTENT_CATEGORIES.READ, engines: ["criticalPathService"] },
    [INTENTS.BOTTLENECKS]: { category: INTENT_CATEGORIES.READ, engines: ["bottleneckService"] },
    [INTENTS.DEADLINE_RISK]: { category: INTENT_CATEGORIES.READ, engines: ["deadlineRiskService", "monteCarloForecastService"] },
    [INTENTS.SCHEDULE_DRIFT]: { category: INTENT_CATEGORIES.READ, engines: ["scheduleDriftService"] },
    [INTENTS.BLOCKERS]: { category: INTENT_CATEGORIES.READ, engines: ["projectCoordinatorService", "standupService"] },
    [INTENTS.RISKS]: { category: INTENT_CATEGORIES.READ, engines: ["projectRiskService"] },
    [INTENTS.DECISIONS]: { category: INTENT_CATEGORIES.READ, engines: ["decisionIntelligenceService"] },
    [INTENTS.PROJECT_MEMORY]: { category: INTENT_CATEGORIES.READ, engines: ["projectMemoryService"] },
    [INTENTS.PROJECT_HISTORY]: { category: INTENT_CATEGORIES.READ, engines: ["projectTimelineService", "projectHistoryService"] },
    [INTENTS.PROJECT_REPLAY]: { category: INTENT_CATEGORIES.READ, engines: ["projectReplayService"] },
    [INTENTS.TEAM_CAPACITY]: { category: INTENT_CATEGORIES.READ, engines: ["teamIntelligenceService"] },
    [INTENTS.NEXT_ACTIONS]: { category: INTENT_CATEGORIES.READ, engines: ["nextActionService"] },
    [INTENTS.PORTFOLIO_STATUS]: { category: INTENT_CATEGORIES.READ, engines: ["portfolioIntelligenceService", "executiveBriefingService"] },
    [INTENTS.PORTFOLIO_RISK]: { category: INTENT_CATEGORIES.READ, engines: ["portfolioIntelligenceService", "resourceConflictService"] },
    [INTENTS.APPROVAL_QUEUE]: { category: INTENT_CATEGORIES.READ, engines: ["projectReplanningService", "projectCoordinatorService"] },
    [INTENTS.RECENT_CHANGES]: { category: INTENT_CATEGORIES.READ, engines: ["projectTimelineService", "projectCoordinatorService"] },
    [INTENTS.RECOMMENDATIONS]: { category: INTENT_CATEGORIES.READ, engines: ["nextActionService", "recommendationService"] },
    [INTENTS.EXECUTIVE_SUMMARY]: { category: INTENT_CATEGORIES.READ, engines: ["executiveBriefingService", "stakeholderBriefingService"] },
    [INTENTS.TASK_DEPENDENCIES]: { category: INTENT_CATEGORIES.READ, engines: ["taskDependencyService", "criticalPathService"] },

    [INTENTS.EXPLAIN_HEALTH]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["projectHealthService", "intelligenceExplanationService"] },
    [INTENTS.EXPLAIN_RISK]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["deadlineRiskService", "intelligenceExplanationService"] },
    [INTENTS.EXPLAIN_BOTTLENECK]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["bottleneckService", "intelligenceExplanationService"] },
    [INTENTS.EXPLAIN_RECOMMENDATION]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["nextActionService", "intelligenceExplanationService"] },
    [INTENTS.EXPLAIN_DECISION]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["decisionIntelligenceService", "intelligenceExplanationService"] },
    [INTENTS.EXPLAIN_SCHEDULE_DRIFT]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["scheduleDriftService", "intelligenceExplanationService"] },
    [INTENTS.EXPLAIN_CRITICAL_PATH]: { category: INTENT_CATEGORIES.EXPLANATION, engines: ["criticalPathService", "intelligenceExplanationService"] },

    [INTENTS.SIMULATE_TASK_DELAY]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["scenarioSimulationService"] },
    [INTENTS.SIMULATE_TASK_COMPLETION]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["scenarioSimulationService"] },
    [INTENTS.SIMULATE_RESOURCE_CHANGE]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["scenarioSimulationService"] },
    [INTENTS.SIMULATE_SCOPE_CHANGE]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["scenarioSimulationService"] },
    [INTENTS.SIMULATE_DATE_CHANGE]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["scenarioSimulationService"] },
    [INTENTS.SIMULATE_GENERIC_SCENARIO]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["scenarioSimulationService"] },

    [INTENTS.PREPARE_RECOVERY_PLAN]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["actionPlanService", "projectReplanningService"] },
    [INTENTS.PREPARE_ACTION_PLAN]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["actionPlanService"] },
    [INTENTS.PREPARE_REPLAN]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["projectReplanningService"] },
    [INTENTS.PREPARE_TASK_UPDATE]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["projectReplanningService"] },
    [INTENTS.PREPARE_ASSIGNMENT_CHANGE]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["projectReplanningService"] },
    [INTENTS.PREPARE_DECISION]: { category: INTENT_CATEGORIES.ACTION_PREPARATION, engines: ["decisionLogService"] },

    [INTENTS.SHOW_APPROVALS]: { category: INTENT_CATEGORIES.APPROVAL, engines: ["projectReplanningService"] },
    [INTENTS.EXPLAIN_APPROVAL]: { category: INTENT_CATEGORIES.APPROVAL, engines: ["projectReplanningService", "intelligenceExplanationService"] },
    [INTENTS.PREPARE_APPROVAL]: { category: INTENT_CATEGORIES.APPROVAL, engines: ["projectReplanningService"] },

    [INTENTS.EXECUTE_APPROVED_ACTION]: { category: INTENT_CATEGORIES.EXECUTION, engines: ["replanningExecutionService"] },

    [INTENTS.DEPENDENCY_SHOCKWAVE]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["dependencyShockwaveService"] },
    [INTENTS.STRESS_TEST]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["dependencyShockwaveService"] },
    [INTENTS.PROJECT_RESILIENCE]: { category: INTENT_CATEGORIES.READ, engines: ["dependencyShockwaveService"] },

    [INTENTS.INTERVENTION_EVALUATION]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["interventionImpactService"] },
    [INTENTS.INTERVENTION_COMPARISON]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["interventionImpactService"] },

    [INTENTS.CHAOS_LAB_RUN]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["projectChaosService", "dependencyShockwaveService"] },
    [INTENTS.FAILURE_THRESHOLD]: { category: INTENT_CATEGORIES.SIMULATION, engines: ["projectChaosService"] },
    [INTENTS.PROJECT_SENSITIVITY]: { category: INTENT_CATEGORIES.READ, engines: ["projectChaosService"] },
    [INTENTS.MOST_DANGEROUS_COMPONENT]: { category: INTENT_CATEGORIES.READ, engines: ["projectChaosService"] }
};

/**
 * Extracts entities like task names, project names, duration, numbers from natural text.
 */
export const extractEntities = (text = "") => {
    const raw = String(text || "").trim();
    const entities = {
        taskId: null,
        taskName: null,
        projectId: null,
        projectName: null,
        workspaceId: null,
        userName: null,
        durationDays: null,
        durationHours: null,
        percentage: null,
        count: null,
        date: null,
        proposalId: null,
        direction: null
    };

    // 1. Proposal ID (e.g. "proposal prop-123", "proposal 123", "proposal-abc")
    const propMatch = raw.match(/\bproposal(?:\s+id)?[:\s]+['"‘“]?([a-zA-Z0-9_\-]+)['"’”]?/i);
    if (propMatch && !/^(?:it|the|this|that|pending|approved|all|a|an)$/i.test(propMatch[1])) {
        entities.proposalId = propMatch[1];
    } else {
        const idMatch = raw.match(/\b(prop-[a-zA-Z0-9_\-]+)\b/i);
        if (idMatch) {
            entities.proposalId = idMatch[1];
        }
    }

    // 2. Project ID / Name (e.g. "in project Alpha", "for project proj-123", "project 'Project Beta'")
    const projMatch = raw.match(/\b(?:in|for|on)\s+project\s+['"‘“]?([^'”".,!?\n]+)['"’”]?/i) ||
                      raw.match(/\bproject\s+['"‘“]?([a-zA-Z0-9_\-]+)['"’”]?/i);
    if (projMatch) {
        const val = projMatch[1].trim();
        if (/^proj-[a-zA-Z0-9_\-]+$/i.test(val) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
            entities.projectId = val;
        } else {
            entities.projectName = val;
        }
    }

    // 3. Workspace (e.g. "in workspace Alpha", "workspace ws-123")
    const wsMatch = raw.match(/\b(?:in|across)\s+workspace\s+['"‘“]?([^'”".,!?\n]+)['"’”]?/i);
    if (wsMatch) {
        entities.workspaceId = wsMatch[1].trim();
    }

    // 4. Task references (e.g. "task 'API Development'", "task t-1", "if API development slips", "task X")
    const taskQuoted = raw.match(/\btask\s+['"‘“]([^'”"]+)['"’”]/i) ||
                       raw.match(/['"‘“]([^'”"]+)['"’”]\s+(?:slips|is delayed|completes)/i) ||
                       raw.match(/\btask\s+([a-zA-Z0-9_\-]+)\b/i);
    if (taskQuoted) {
        const tVal = taskQuoted[1].trim();
        if (/^(?:t|task)[-_]?[0-9a-zA-Z_\-]+$/i.test(tVal)) {
            entities.taskId = tVal;
        } else {
            entities.taskName = tVal;
        }
    } else {
        // Fallback: "what if <Phrase> slips by 3 days"
        const whatIfTaskMatch = raw.match(/(?:what\s+if|what\s+happens\s+if)\s+(.+?)\s+(?:slips|is delayed|is completed|completes|moves)/i);
        if (whatIfTaskMatch) {
            let candidate = whatIfTaskMatch[1].replace(/^(?:the\s+|this\s+|task\s+)/i, "").trim();
            if (candidate && !/^(?:we|scope|deadline)/i.test(candidate)) {
                entities.taskName = candidate;
            }
        }
        // Fallback: "shockwave for <Task>", "stress-test <Task>", "what breaks if <Task>"
        const shockwaveTaskMatch = raw.match(/\b(?:shockwave\s+(?:for|on)|stress[- ]test|breaks\s+if|affected\s+if)\s+['"‘“]?([^'”".,!?\n]+)['"’”]?/i);
        if (shockwaveTaskMatch) {
            let candidate = shockwaveTaskMatch[1].replace(/^(?:the\s+|this\s+|task\s+)/i, "").trim();
            if (candidate && !/^(?:we|scope|deadline|project)/i.test(candidate)) {
                if (/^(?:t|task)[-_]?[0-9a-zA-Z_\-]+$/i.test(candidate)) {
                    entities.taskId = candidate;
                } else {
                    entities.taskName = candidate;
                }
            }
        }
    }

    // 5. User / Assignee (e.g. "to Alice", "user Bob", "reassign to Charlie", "reassign this task to Bob")
    const userMatch = raw.match(/\b(?:reassign(?:\s+[^.\n]+)?\s+to|assigned\s+to|user)\s+['"‘“]?([a-zA-Z0-9_\-]+)['"’”]?/i);
    if (userMatch) {
        entities.userName = userMatch[1].trim();
    }

    // 6. Numbers & Durations
    // Days
    const daysMatch = raw.match(/\b(\d+(?:\.\d+)?)[-\s]*(?:days?|d)\b/i);
    if (daysMatch) {
        entities.durationDays = parseFloat(daysMatch[1]);
    }
    // Hours
    const hoursMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    if (hoursMatch) {
        entities.durationHours = parseFloat(hoursMatch[1]);
    }
    // Weeks
    const weeksMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:weeks?|w)\b/i);
    if (weeksMatch) {
        entities.durationDays = parseFloat(weeksMatch[1]) * 7;
    }
    // People count (e.g. "add two people", "add 3 people", "remove 1 person", "add one developer")
    const wordNums = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const peopleMatch = raw.match(/\b(?:add|remove)\s+(\d+|one|two|three|four|five)\s*(?:people|persons?|members?|resources?|developers?|devs?|engineers?)\b/i);
    if (peopleMatch) {
        const rawCount = peopleMatch[1].toLowerCase();
        entities.count = wordNums[rawCount] || parseInt(rawCount, 10);
    }
    if (entities.count === null) {
        const countMatch = raw.match(/\b(?:with\s+)?(\d+)\s*(?:tests?|scenarios?|iterations?|shocks?|runs?)\b/i);
        if (countMatch) {
            entities.count = parseInt(countMatch[1], 10);
        }
    }
    // Percentage (e.g. "increases by 10%", "15 percent")
    const pctMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:%|percent)\b/i);
    if (pctMatch) {
        entities.percentage = parseFloat(pctMatch[1]);
    }

    // Direction (delay vs advance vs add vs remove)
    if (/\b(?:slips?|delayed?|postponed?|slip)\b/i.test(raw)) {
        entities.direction = "DELAY";
    } else if (/\b(?:completed?|early|accelerated?|finishes?)\b/i.test(raw)) {
        entities.direction = "ADVANCE";
    } else if (/\b(?:add|increase|expand)\b/i.test(raw)) {
        entities.direction = "ADD";
    } else if (/\b(?:remove|decrease|reduce)\b/i.test(raw)) {
        entities.direction = "REMOVE";
    }

    return entities;
};

/**
 * Deterministically parses a natural language query and returns the classified intent,
 * extracted entities, required intelligence engines, confidence, and any disambiguation requirements.
 */
export const parseNaturalLanguageQuery = (query = "", context = {}) => {
    const raw = String(query || "").trim();
    const lower = raw.toLowerCase();
    const entities = extractEntities(raw);

    // Merge context entities if not explicitly parsed
    if (!entities.projectId && context.projectId) entities.projectId = context.projectId;
    if (!entities.workspaceId && context.workspaceId) entities.workspaceId = context.workspaceId;
    if (!entities.taskId && context.taskId) entities.taskId = context.taskId;

    let matchedIntent = null;
    let confidence = 0.9;
    let missingParameters = [];
    let clarificationRequired = null;

    // ============================================================
    // 1. EXECUTION INTENTS (Requires existing approval; strict guard)
    // ============================================================
    if (/\b(?:execute|apply|implement)\s+(?:the\s+)?(?:approved\s+)?proposal\b/i.test(lower) ||
        /\b(?:execute|apply)\s+it\b/i.test(lower)) {
        matchedIntent = INTENTS.EXECUTE_APPROVED_ACTION;
        if (!entities.proposalId && !context.proposalId) {
            missingParameters.push("proposalId");
            clarificationRequired = "Please specify which approved proposal you want to execute.";
        }
    }

    // ============================================================
    // 2. APPROVAL INTENTS
    // ============================================================
    else if (/\b(?:show|view|list|get)\s+(?:pending\s+)?approvals?\b/i.test(lower) ||
             /\b(?:what\s+is\s+pending\s+approval|approval\s+queue)\b/i.test(lower)) {
        matchedIntent = INTENTS.SHOW_APPROVALS;
    }
    else if (/\b(?:explain|why)\s+(?:approve|approval|the\s+proposal)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_APPROVAL;
    }
    else if (/\b(?:prepare|stage)\s+(?:for\s+)?approval\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_APPROVAL;
    }

    // ============================================================
    // 3. ACTION PREPARATION INTENTS
    // ============================================================
    else if (/\b(?:prepare|create|generate)\s+(?:a\s+|the\s+)?recovery\s+plan\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_RECOVERY_PLAN;
    }
    else if (/\b(?:prepare|create|generate)\s+(?:a\s+|the\s+)?action\s+plan\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_ACTION_PLAN;
    }
    else if (/\b(?:prepare|generate|draft)\s+(?:the\s+)?(?:proposed\s+)?(?:replan|replanning)\b/i.test(lower) ||
             /\bprepare\s+(?:the\s+)?proposed\s+changes\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_REPLAN;
    }
    else if (/\bprepare\s+(?:task\s+)?reassignment\b/i.test(lower) ||
             /\bprepare\s+reassigning\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_ASSIGNMENT_CHANGE;
        if (!entities.taskId && !entities.taskName) missingParameters.push("taskId");
        if (!entities.userName) missingParameters.push("userName");
        if (missingParameters.length > 0) {
            clarificationRequired = `Please specify ${missingParameters.join(" and ")} for the reassignment proposal.`;
        }
    }
    else if (/\bprepare\s+(?:these\s+|the\s+)?task\s+changes?\b/i.test(lower) ||
             /\bprepare\s+task\s+update\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_TASK_UPDATE;
    }
    else if (/\b(?:prepare|record|create|add|log)\s+(?:a\s+)?decision\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_DECISION;
    }
    else if (/\b(?:change\s+(?:user\s+)?.*role|promote\s+user|demote\s+user|change\s+role)\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_ROLE_CHANGE;
    }
    else if (/\b(?:deactivate\s+user|activate\s+user|disable\s+user\s+account)\b/i.test(lower)) {
        matchedIntent = INTENTS.PREPARE_USER_DEACTIVATE;
    }

    // ============================================================
    // 3.35 PROJECT RED TEAM INTENTS (Phase 11)
    // ============================================================
    else if (/\b(?:red\s*team|adversarial\s+analysis|challenge\s+(?:this\s+)?project|find\s+weak\s+assumptions|find\s+hidden\s+(?:project\s+)?vulnerabilities|what\s+assumptions\s+are\s+fragile)\b/i.test(lower)) {
        matchedIntent = INTENTS.RED_TEAM_RUN;
    }
    else if (/\b(?:challenge\s+(?:our\s+)?(?:project\s+)?assumptions?|challenge\s+(?:our\s+)?(?:deadline|estimates?|critical\s+path|dependencies)|find\s+single\s+points?\s+of\s+failure)\b/i.test(lower)) {
        matchedIntent = INTENTS.CHALLENGE_ASSUMPTION;
    }

    // ============================================================
    // 3.36 COUNTERFACTUAL TIME MACHINE INTENTS (Phase 12)
    // ============================================================
    else if (/\b(?:show\s+actual\s+versus\s+what-?if\s+history|what\s+would\s+have\s+happened\s+if\s+we\s+had\s+replanned\s+earlier|compare\s+counterfactual(?:\s+scenarios)?)\b/i.test(lower)) {
        matchedIntent = INTENTS.COUNTERFACTUAL_COMPARE;
    }
    else if (/\b(?:counterfactual|what\s+would\s+have\s+happened)\b/i.test(lower) ||
             (/\bwhat\s+(?:if\s+we\s+had|if\s+we\s+finished|if\s+we\s+completed|if\s+we\s+assigned|if\s+we\s+removed|if\s+we\s+acted|if\s+we\s+made|what\s+if)\b/i.test(lower) &&
              /\b(?:earlier|later|different\s+decision|acted\s+on\s+this\s+risk|removed\s+this\s+dependency|another\s+person|another\s+available\s+member)\b/i.test(lower))) {
        matchedIntent = INTENTS.COUNTERFACTUAL_RUN;
    }

    // ============================================================
    // 3.4 PROJECT CHAOS / FAILURE LABORATORY INTENTS (Phase 10)
    // ============================================================
    else if (/\b(?:try\s+to\s+break\s+(?:this\s+)?project|run\s+(?:a\s+)?chaos\s+test|chaos\s+lab|multiple\s+disruptions|most\s+dangerous\s+scenarios)\b/i.test(lower)) {
        matchedIntent = INTENTS.CHAOS_LAB_RUN;
    }
    else if (/\b(?:failure\s+threshold|find\s+(?:the\s+)?failure\s+threshold)\b/i.test(lower)) {
        matchedIntent = INTENTS.FAILURE_THRESHOLD;
    }
    else if (/\b(?:weakest\s+area|project'?s\s+weakest|most\s+sensitive\s+dimension|project\s+sensitivity)\b/i.test(lower)) {
        matchedIntent = INTENTS.PROJECT_SENSITIVITY;
    }
    else if (/\b(?:most\s+dangerous\s+(?:task|component)|find\s+(?:the\s+)?most\s+dangerous|single\s+point\s+of\s+failure)\b/i.test(lower)) {
        matchedIntent = INTENTS.MOST_DANGEROUS_COMPONENT;
    }

    // ============================================================
    // 3.5 DEPENDENCY SHOCKWAVE & STRESS-TEST INTENTS (Phase 8)
    // ============================================================
    else if (/\b(?:shockwave|stress[- ]test|how\s+far\s+will\s+(?:this\s+)?delay\s+propagate|what\s+breaks\s+if|resilient\s+is\s+this\s+project|which\s+task\s+would\s+cause\s+the\s+most\s+damage|which\s+dependency\s+is\s+most\s+dangerous|what\s+tasks\s+will\s+be\s+affected\s+if)\b/i.test(lower) ||
             (/\bwhat\s+happens\s+if\b/i.test(lower) && /\b(?:is\s+delayed|delayed|becomes\s+blocked)\b/i.test(lower))) {
        if (/\b(?:which\s+task\s+would\s+cause\s+the\s+most\s+damage|stress[- ]test\s+(?:the\s+)?project)\b/i.test(lower)) {
            matchedIntent = INTENTS.STRESS_TEST;
        } else if (/\b(?:resilient|resilience|containment|which\s+dependency\s+is\s+most\s+dangerous)\b/i.test(lower)) {
            matchedIntent = INTENTS.PROJECT_RESILIENCE;
        } else {
            matchedIntent = INTENTS.DEPENDENCY_SHOCKWAVE;
            if (!entities.taskId && !entities.taskName && !context.taskId) {
                missingParameters.push("taskId");
                clarificationRequired = "Please specify which task you want to run shockwave analysis on.";
            }
        }
    }

    // ============================================================
    // 3.6 INTERVENTION IMPACT INTENTS (Phase 9)
    // ============================================================
    else if (/\b(?:compare\s+.*(?:versus|vs|with|against)|compare\s+(?:all\s+)?interventions?|compare\s+options?)\b/i.test(lower)) {
        matchedIntent = INTENTS.INTERVENTION_COMPARISON;
    }
    else if (/\b(?:what\s+happens\s+if\s+(?:i\s+|we\s+)?reassign|what\s+happens\s+if\s+(?:we\s+)?add\s+(?:a\s+|\d+\s+|one\s+)?(?:developer|resource|member)|would\s+moving\s+(?:this\s+)?deadline\s+help|what\s+if\s+we\s+increase\s+(?:the\s+)?estimate|simulate\s+(?:the\s+)?(?:recommended\s+)?recovery\s+action|which\s+intervention\s+reduces|evaluate\s+intervention|what\s+would\s+improve\s+this\s+project\s+without\s+overloading)\b/i.test(lower)) {
        matchedIntent = INTENTS.INTERVENTION_EVALUATION;
    }

    // ============================================================
    // 4. SIMULATION INTENTS ("What if...")
    // ============================================================
    else if (/\b(?:what\s+if|what\s+happens\s+if|simulate)\b/i.test(lower)) {
        // A. Resource Change ("what if we add two people", "what if we reassign")
        if (/\b(?:add|remove)\s+(?:\d+|one|two|three|four|five)\s*(?:people|persons?|members?|resources?)\b/i.test(lower) ||
            /\breassign\b/i.test(lower)) {
            matchedIntent = INTENTS.SIMULATE_RESOURCE_CHANGE;
        }
        // B. Scope Change ("what if scope increases by 10%")
        else if (/\bscope\s+(?:increases?|grows?|expands?|decreases?)\b/i.test(lower)) {
            matchedIntent = INTENTS.SIMULATE_SCOPE_CHANGE;
        }
        // C. Deadline Change ("what if the deadline moves by 5 days")
        else if (/\bdeadline\s+(?:moves?|shifts?|slips?|changes?|extends?)\b/i.test(lower)) {
            matchedIntent = INTENTS.SIMULATE_DATE_CHANGE;
        }
        // D. Task Completion ("what if this task is completed today")
        else if (/\b(?:completed?|finishes?|done)\s+(?:today|now|early)\b/i.test(lower)) {
            matchedIntent = INTENTS.SIMULATE_TASK_COMPLETION;
            if (!entities.taskId && !entities.taskName && !context.taskId) {
                missingParameters.push("taskId");
                clarificationRequired = "Please specify which task you want to simulate completing.";
            }
        }
        // E. Task Delay ("what if task slips by 4 days", "what if this task is delayed 3 days")
        else if (/\b(?:slips?|delayed?|postponed?)\b/i.test(lower) || entities.durationDays !== null) {
            matchedIntent = INTENTS.SIMULATE_TASK_DELAY;
            if (!entities.taskId && !entities.taskName && !context.taskId) {
                missingParameters.push("taskId");
            }
            if (entities.durationDays === null) {
                missingParameters.push("durationDays");
            }
            if (missingParameters.length > 0) {
                clarificationRequired = `Please specify the ${missingParameters.join(" and ")} for the delay simulation.`;
            }
        }
        // F. Generic Simulation
        else {
            matchedIntent = INTENTS.SIMULATE_GENERIC_SCENARIO;
        }
    }

    // ============================================================
    // 5. EXPLANATION INTENTS ("Why...", "Explain...")
    // ============================================================
    else if (/\b(?:why\s+is\s+(?:project\s+)?health|explain\s+(?:project\s+)?health|why\s+health\s+declining)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_HEALTH;
    }
    else if (/\b(?:why\s+(?:is\s+)?(?:this\s+)?risk|explain\s+(?:the\s+)?(?:deadline\s+)?risk)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_RISK;
    }
    else if (/\b(?:why\s+is\s+.*bottleneck|explain\s+bottlenecks?)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_BOTTLENECK;
    }
    else if (/\b(?:why\s+is\s+.*on\s+(?:the\s+)?critical\s+path|explain\s+critical\s+path)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_CRITICAL_PATH;
    }
    else if (/\b(?:why\s+did\s+(?:the\s+)?schedule\s+drift|explain\s+(?:schedule\s+)?drift)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_SCHEDULE_DRIFT;
    }
    else if (/\b(?:why\s+was\s+this\s+decision|explain\s+decision)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_DECISION;
    }
    else if (/\b(?:explain\s+this\s+recommendation|why\s+do\s+you\s+recommend|why\s+suggested)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXPLAIN_RECOMMENDATION;
    }

    // ============================================================
    // 6. READ INTENTS
    // ============================================================
    // Admin Overview (Phase 15)
    else if (/\b(?:system\s+overview|admin\s+overview|platform\s+overview|how\s+many\s+users(?:\s+are\s+in\s+the\s+system)?|how\s+many\s+active\s+users(?:\s+do\s+we\s+have)?|admin\s+dashboard|platform\s+administration)\b/i.test(lower)) {
        matchedIntent = INTENTS.ADMIN_OVERVIEW;
    }
    // Admin Users (Phase 15)
    else if (/\b(?:show\s+users|list\s+users|admin\s+users|how\s+many\s+admins|how\s+many\s+project\s+managers)\b/i.test(lower)) {
        matchedIntent = INTENTS.ADMIN_USERS;
    }
    // Admin Workspaces (Phase 15)
    else if (/\b(?:how\s+many\s+workspaces|list\s+workspaces\s+admin|admin\s+workspaces)\b/i.test(lower)) {
        matchedIntent = INTENTS.ADMIN_WORKSPACES;
    }
    // Search & Filters (Phase 16)
    else if (/\b(?:search\s+(?:for\s+)?|find\s+(?:tasks?|projects?|decisions?|risks?|workspaces?|members?)|look\s+up\s+)\b/i.test(lower)) {
        matchedIntent = INTENTS.SEARCH;
    }
    // Task Dependencies (Phase 13)
    else if (/\b(?:what\s+does\s+.*block|show\s+dependencies|task\s+dependencies|dependency\s+graph|is\s+.*blocked|what\s+is\s+blocking\s+(?:task\s+|this\s+task)|prerequisites?\s+(?:for|of))\b/i.test(lower)) {
        matchedIntent = INTENTS.TASK_DEPENDENCIES;
    }
    // Blockers
    else if (/\b(?:what\s+is\s+blocking|show\s+(?:me\s+)?blockers|blocked\s+tasks|unresolved\s+blockers)\b/i.test(lower)) {
        matchedIntent = INTENTS.BLOCKERS;
    }
    // Critical Path
    else if (/\b(?:which\s+tasks\s+are\s+on\s+(?:the\s+)?critical\s+path|show\s+critical\s+path|critical\s+tasks)\b/i.test(lower)) {
        matchedIntent = INTENTS.CRITICAL_PATH;
    }
    // Bottlenecks
    else if (/\b(?:major\s+bottlenecks|show\s+bottlenecks|what\s+are\s+the\s+bottlenecks)\b/i.test(lower)) {
        matchedIntent = INTENTS.BOTTLENECKS;
    }
    // Deadline Risk & Tasks at Risk
    else if (/\b(?:tasks?\s+at\s+risk|likely\s+to\s+miss\s+(?:their\s+)?deadlines?|deadline\s+risks?)\b/i.test(lower)) {
        matchedIntent = INTENTS.DEADLINE_RISK;
    }
    // Schedule Drift
    else if (/\b(?:schedule\s+drift|how\s+much\s+(?:has\s+)?(?:the\s+)?schedule\s+drifted|slippage)\b/i.test(lower)) {
        matchedIntent = INTENTS.SCHEDULE_DRIFT;
    }
    // Team Capacity & Overload
    else if (/\b(?:who\s+is\s+overloaded|team\s+capacity|team\s+workload|workload\s+distribution)\b/i.test(lower)) {
        matchedIntent = INTENTS.TEAM_CAPACITY;
    }
    // Next Actions
    else if (/\b(?:what\s+should\s+i\s+(?:work\s+on|do)\s+next|next\s+actions?|daily\s+priorities)\b/i.test(lower)) {
        matchedIntent = INTENTS.NEXT_ACTIONS;
    }
    // Project Memory
    else if (/\b(?:recurring\s+(?:problems?|issues?|patterns?)|project\s+memory|historical\s+lessons)\b/i.test(lower)) {
        matchedIntent = INTENTS.PROJECT_MEMORY;
    }
    // Project History & Time-frame
    else if (/\b(?:what\s+happened\s+during\s+the\s+last|project\s+history|timeline\s+events)\b/i.test(lower)) {
        matchedIntent = INTENTS.PROJECT_HISTORY;
    }
    // Project Replay
    else if (/\b(?:replay\s+project|project\s+replay|rewind\s+project)\b/i.test(lower)) {
        matchedIntent = INTENTS.PROJECT_REPLAY;
    }
    // Decisions (Phase 4 & Phase 14)
    else if (/\b(?:what\s+decisions?\s+(?:affected|were\s+made)|show\s+(?:project\s+|recent\s+)?decisions|pending\s+decisions|decision\s+log|decision\s+history|what\s+was\s+decided|which\s+decisions\s+were\s+superseded|decisions?\s+(?:about|related\s+to))\b/i.test(lower)) {
        matchedIntent = INTENTS.DECISIONS;
    }
    // Recent Changes
    else if (/\b(?:what\s+changed\s+(?:since\s+yesterday|today)|recent\s+changes?|recent\s+activity)\b/i.test(lower)) {
        matchedIntent = INTENTS.RECENT_CHANGES;
    }
    // Risks
    else if (/\b(?:show\s+open\s+risks|project\s+risks|high\s+severity\s+risks)\b/i.test(lower)) {
        matchedIntent = INTENTS.RISKS;
    }
    // Portfolio Status
    else if (/\b(?:which\s+projects\s+are\s+at\s+risk|portfolio\s+status|projects\s+need\s+attention)\b/i.test(lower)) {
        matchedIntent = INTENTS.PORTFOLIO_STATUS;
    }
    // Portfolio Risk
    else if (/\b(?:portfolio\s+risk|cross-project\s+conflicts?|shared\s+bottlenecks)\b/i.test(lower)) {
        matchedIntent = INTENTS.PORTFOLIO_RISK;
    }
    // Recommendations
    else if (/\b(?:what\s+should\s+we\s+do|show\s+recommendations?|remediation\s+steps)\b/i.test(lower)) {
        matchedIntent = INTENTS.RECOMMENDATIONS;
    }
    // Executive / Stakeholder Summary
    else if (/\b(?:executive\s+summary|stakeholder\s+update|executive\s+briefing)\b/i.test(lower)) {
        matchedIntent = INTENTS.EXECUTIVE_SUMMARY;
    }
    // Health
    else if (/\b(?:project\s+health|health\s+score|is\s+the\s+project\s+healthy)\b/i.test(lower)) {
        matchedIntent = INTENTS.PROJECT_HEALTH;
    }
    // General Project Status
    else if (/\b(?:project\s+status|status\s+of\s+the\s+project|how\s+is\s+the\s+project\s+doing)\b/i.test(lower)) {
        matchedIntent = INTENTS.PROJECT_STATUS;
    }
    // Fallback
    else {
        confidence = 0.3;
        matchedIntent = INTENTS.PROJECT_STATUS;
    }

    const isAmbiguous = missingParameters.length > 0;
    const meta = INTENT_METADATA[matchedIntent] || { category: INTENT_CATEGORIES.READ, engines: [] };

    return {
        rawQuery: raw,
        intent: matchedIntent,
        intentCategory: meta.category,
        confidence,
        isAmbiguous,
        entities,
        missingParameters,
        clarificationRequired,
        requiredEngines: meta.engines,
        suggestedOperation: isAmbiguous ? "CLARIFY" : meta.category
    };
};
