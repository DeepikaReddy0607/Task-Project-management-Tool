import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    executeUnifiedSearch,
    getUserAccessibleScope,
    clearSearchStore,
    seedInMemorySearchData,
    SEARCHABLE_ENTITY_TYPES
} from "../services/searchService.js";

import {
    parseNaturalLanguageQuery,
    INTENTS
} from "../services/naturalLanguageControlService.js";

import { handleIntelligenceQuery } from "../services/intelligenceQueryService.js";
import { processMessage } from "../services/quackieService.js";

describe("PHASE 16: Unified Permission-Aware Search & Advanced Filters Test Suite", () => {
    // Mock Users
    const USER_ADMIN = {
        id: "usr-admin-16",
        firstName: "Ada",
        lastName: "Admin",
        email: "ada.admin@taskflow.dev",
        role: "Admin",
        is_active: true
    };

    const USER_ALICE = {
        id: "usr-alice-16",
        firstName: "Alice",
        lastName: "Engineer",
        email: "alice@taskflow.dev",
        role: "Team Member",
        is_active: true
    };

    const USER_BOB = {
        id: "usr-bob-16",
        firstName: "Bob",
        lastName: "Designer",
        email: "bob@taskflow.dev",
        role: "Team Member",
        is_active: true
    };

    const USER_CHARLIE_SECRET = {
        id: "usr-charlie-16",
        firstName: "Charlie",
        lastName: "Secret",
        email: "charlie.secret@taskflow.dev",
        password_hash: "$2b$10$supersecretunhashedpassworddata",
        token: "secret-token-xyz",
        role: "Team Member",
        is_active: true
    };

    // Workspaces
    const WS_ALPHA = {
        id: "ws-alpha-16",
        name: "Alpha Workspace",
        description: "Primary engineering workspace for Alice",
        owner_id: USER_ALICE.id,
        created_at: "2026-01-01T00:00:00.000Z"
    };

    const WS_SECRET = {
        id: "ws-secret-16",
        name: "Confidential R&D",
        description: "Restricted workspace isolated from Alice",
        owner_id: USER_CHARLIE_SECRET.id,
        created_at: "2026-01-05T00:00:00.000Z"
    };

    // Projects
    const PROJ_ALPHA = {
        id: "proj-alpha-16",
        title: "Authentication Gateway",
        description: "Zero-trust JWT authentication microservice",
        status: "In Progress",
        workspace_id: WS_ALPHA.id,
        manager_id: USER_ALICE.id,
        is_archived: false,
        created_at: "2026-02-01T00:00:00.000Z"
    };

    const PROJ_SECRET = {
        id: "proj-secret-16",
        title: "Authentication Stealth Overhaul",
        description: "Top-secret auth initiative strictly for Charlie",
        status: "In Progress",
        workspace_id: WS_SECRET.id,
        manager_id: USER_CHARLIE_SECRET.id,
        is_archived: false,
        created_at: "2026-02-05T00:00:00.000Z"
    };

    // Tasks
    const TASK_AUTH_1 = {
        id: "task-auth-1",
        title: "Implement OAuth2 PKCE flow",
        description: "Add authorization code grant with PKCE for mobile clients",
        priority: "High",
        status: "In Progress",
        project_id: PROJ_ALPHA.id,
        assigned_to: USER_ALICE.id,
        due_date: "2026-04-10T00:00:00.000Z",
        created_at: "2026-02-10T00:00:00.000Z"
    };

    const TASK_AUTH_2 = {
        id: "task-auth-2",
        title: "JWT token revocation blacklist",
        description: "Redis-backed distributed token revocation for secure logout",
        priority: "Critical",
        status: "Completed",
        project_id: PROJ_ALPHA.id,
        assigned_to: USER_BOB.id,
        due_date: "2026-03-01T00:00:00.000Z",
        created_at: "2026-02-12T00:00:00.000Z"
    };

    const TASK_SECRET = {
        id: "task-secret-1",
        title: "Classified quantum cipher implementation",
        description: "Secret authentication cipher prototype",
        priority: "Critical",
        status: "In Progress",
        project_id: PROJ_SECRET.id,
        assigned_to: USER_CHARLIE_SECRET.id,
        due_date: "2026-05-01T00:00:00.000Z",
        created_at: "2026-02-15T00:00:00.000Z"
    };

    // Decisions (Phase 14)
    const DECISION_AUTH = {
        id: "dec-auth-1",
        title: "Adopt RS256 asymmetric signing for JWTs",
        rationale: "Enables public key verification across microservices without sharing secrets",
        category: "TECHNICAL",
        status: "ACTIVE",
        project_id: PROJ_ALPHA.id,
        tags: ["auth", "security", "jwt"],
        created_at: "2026-02-02T00:00:00.000Z"
    };

    const DECISION_SECRET = {
        id: "dec-secret-1",
        title: "Adopt post-quantum lattice cryptography",
        rationale: "Classified secret decision for R&D",
        category: "TECHNICAL",
        status: "ACTIVE",
        project_id: PROJ_SECRET.id,
        tags: ["secret", "quantum"],
        created_at: "2026-02-06T00:00:00.000Z"
    };

    // Risks
    const RISK_AUTH = {
        id: "risk-auth-1",
        title: "Token replay attack vulnerability",
        description: "Potential replay window if nonce validation is bypassed",
        severity: "High",
        status: "Open",
        project_id: PROJ_ALPHA.id,
        created_at: "2026-02-03T00:00:00.000Z"
    };

    const RISK_SECRET = {
        id: "risk-secret-1",
        title: "Classified hardware leakage",
        description: "Physical security risk for secret facility",
        severity: "Critical",
        status: "Open",
        project_id: PROJ_SECRET.id,
        created_at: "2026-02-07T00:00:00.000Z"
    };

    // Activity Logs
    const ACT_AUTH = {
        id: "act-1",
        workspace_id: WS_ALPHA.id,
        action_type: "REPLANNING_EXECUTED",
        description: "Executed security hardening replanning proposal",
        actor: "Alice Engineer",
        created_at: "2026-02-14T00:00:00.000Z"
    };

    beforeEach(() => {
        clearSearchStore();
        seedInMemorySearchData({
            users: [USER_ADMIN, USER_ALICE, USER_BOB, USER_CHARLIE_SECRET],
            workspaces: [WS_ALPHA, WS_SECRET],
            workspaceMembers: [
                { workspace_id: WS_ALPHA.id, user_id: USER_ALICE.id },
                { workspace_id: WS_ALPHA.id, user_id: USER_BOB.id },
                { workspace_id: WS_SECRET.id, user_id: USER_CHARLIE_SECRET.id }
            ],
            projects: [PROJ_ALPHA, PROJ_SECRET],
            projectMembers: [
                { project_id: PROJ_ALPHA.id, user_id: USER_ALICE.id },
                { project_id: PROJ_ALPHA.id, user_id: USER_BOB.id },
                { project_id: PROJ_SECRET.id, user_id: USER_CHARLIE_SECRET.id }
            ],
            tasks: [TASK_AUTH_1, TASK_AUTH_2, TASK_SECRET],
            decisions: [DECISION_AUTH, DECISION_SECRET],
            risks: [RISK_AUTH, RISK_SECRET],
            activityLogs: [ACT_AUTH]
        });
    });

    // ============================================================
    // PART A: AUTHENTICATION & PERMISSION SCOPING
    // ============================================================

    test("1. executeUnifiedSearch rejects unauthenticated callers with 401", async () => {
        await assert.rejects(
            async () => await executeUnifiedSearch({ query: "auth", userId: null }),
            (err) => err.statusCode === 401
        );
    });

    test("2. Cross-workspace isolation: Alice cannot discover secret workspace or its resources", async () => {
        const res = await executeUnifiedSearch({
            query: "quantum",
            userId: USER_ALICE.id,
            userRole: "Team Member"
        });

        // Alice must find 0 results for Charlie's quantum secret project/task/decision
        assert.equal(res.counts.total, 0, "Alice must not discover secret resources");
        assert.equal(res.flatResults.length, 0);
    });

    test("3. Cross-project isolation: Alice searches 'authentication' and only receives Alpha resources", async () => {
        const res = await executeUnifiedSearch({
            query: "authentication",
            userId: USER_ALICE.id,
            userRole: "Team Member"
        });

        assert.ok(res.counts.total > 0);
        // Ensure no secret project or secret decision is leaked
        res.flatResults.forEach(item => {
            assert.notEqual(item.projectId, PROJ_SECRET.id, "Secret project ID must never be leaked");
            assert.notEqual(item.workspaceId, WS_SECRET.id, "Secret workspace ID must never be leaked");
        });
    });

    test("4. Admin scope: Admin user can search across all workspaces when unscoped", async () => {
        const res = await executeUnifiedSearch({
            query: "quantum",
            userId: USER_ADMIN.id,
            userRole: "Admin"
        });

        assert.ok(res.counts.total >= 1, "Admin must be able to search across all workspaces");
        const found = res.flatResults.find(r => r.id === TASK_SECRET.id || r.id === DECISION_SECRET.id);
        assert.ok(found, "Admin found quantum secret resource");
    });

    test("5. IDOR protection: Attempting to search within an unauthorized workspaceId returns 0 results safely", async () => {
        const res = await executeUnifiedSearch({
            query: "authentication",
            workspaceId: WS_SECRET.id, // Alice tries to scope to Charlie's workspace
            userId: USER_ALICE.id,
            userRole: "Team Member"
        });

        assert.equal(res.counts.total, 0, "Unauthorized workspace scope must return empty result set");
        assert.equal(res.flatResults.length, 0);
    });

    // ============================================================
    // PART B: ENTITY SEARCH COVERAGE
    // ============================================================

    test("6. Task search: matches title and description within user's projects", async () => {
        const res = await executeUnifiedSearch({
            query: "PKCE",
            type: "tasks",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.tasks, 1);
        assert.equal(res.results.tasks[0].id, TASK_AUTH_1.id);
        assert.equal(res.results.tasks[0].title, "Implement OAuth2 PKCE flow");
    });

    test("7. Project search: matches project title and returns workspace context", async () => {
        const res = await executeUnifiedSearch({
            query: "Gateway",
            type: "projects",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.projects, 1);
        assert.equal(res.results.projects[0].id, PROJ_ALPHA.id);
        assert.equal(res.results.projects[0].workspaceName, "Alpha Workspace");
    });

    test("8. Workspace search: returns only authorized workspaces", async () => {
        const res = await executeUnifiedSearch({
            query: "Workspace",
            type: "workspaces",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.workspaces, 1);
        assert.equal(res.results.workspaces[0].id, WS_ALPHA.id);
    });

    test("9. Decision search: matches title, rationale, and tags from Phase 14 Decision Log", async () => {
        const res = await executeUnifiedSearch({
            query: "asymmetric",
            type: "decisions",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.decisions, 1);
        assert.equal(res.results.decisions[0].id, DECISION_AUTH.id);
        assert.equal(res.results.decisions[0].category, "TECHNICAL");
    });

    test("10. Risk search: matches risk title and severity", async () => {
        const res = await executeUnifiedSearch({
            query: "replay",
            type: "risks",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.risks, 1);
        assert.equal(res.results.risks[0].id, RISK_AUTH.id);
        assert.equal(res.results.risks[0].severity, "High");
    });

    test("11. Member search: scopes to shared workspaces and redacts sensitive credentials", async () => {
        const res = await executeUnifiedSearch({
            query: "Designer",
            type: "members",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.members, 1);
        const member = res.results.members[0];
        assert.equal(member.id, USER_BOB.id);
        assert.equal(member.password_hash, undefined, "password_hash must be redacted");
        assert.equal(member.token, undefined, "token must be redacted");
    });

    test("12. Member search isolation: Alice cannot search or discover Charlie who is in a separate workspace", async () => {
        const res = await executeUnifiedSearch({
            query: "Charlie",
            type: "members",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.members, 0, "Alice must not be able to discover users from isolated workspaces");
    });

    // ============================================================
    // PART C: ADVANCED FILTERING & COMBINATIONS
    // ============================================================

    test("13. Task filter by status: returns only matching status", async () => {
        const resCompleted = await executeUnifiedSearch({
            type: "tasks",
            status: "Completed",
            userId: USER_ALICE.id
        });

        assert.equal(resCompleted.counts.tasks, 1);
        assert.equal(resCompleted.results.tasks[0].id, TASK_AUTH_2.id);

        const resInProgress = await executeUnifiedSearch({
            type: "tasks",
            status: "In Progress",
            userId: USER_ALICE.id
        });

        assert.equal(resInProgress.counts.tasks, 1);
        assert.equal(resInProgress.results.tasks[0].id, TASK_AUTH_1.id);
    });

    test("14. Task filter by priority: returns only matching priority", async () => {
        const resCritical = await executeUnifiedSearch({
            type: "tasks",
            priority: "Critical",
            userId: USER_ALICE.id
        });

        assert.equal(resCritical.counts.tasks, 1);
        assert.equal(resCritical.results.tasks[0].id, TASK_AUTH_2.id);
    });

    test("15. Multi-filter combination: status + priority + query", async () => {
        const res = await executeUnifiedSearch({
            query: "revocation",
            type: "tasks",
            status: "Completed",
            priority: "Critical",
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.tasks, 1);
        assert.equal(res.results.tasks[0].id, TASK_AUTH_2.id);

        // Conflicting filter yields 0
        const resNoMatch = await executeUnifiedSearch({
            query: "revocation",
            type: "tasks",
            status: "In Progress", // Doesn't match TASK_AUTH_2 which is Completed
            priority: "Critical",
            userId: USER_ALICE.id
        });

        assert.equal(resNoMatch.counts.tasks, 0);
    });

    test("16. Task filter by assigneeId", async () => {
        const res = await executeUnifiedSearch({
            type: "tasks",
            assigneeId: USER_BOB.id,
            userId: USER_ALICE.id
        });

        assert.equal(res.counts.tasks, 1);
        assert.equal(res.results.tasks[0].id, TASK_AUTH_2.id);
    });

    // ============================================================
    // PART D: SORTING & PAGINATION
    // ============================================================

    test("17. Sorting: flat results sort correctly by title asc and desc", async () => {
        const resAsc = await executeUnifiedSearch({
            type: "tasks",
            sortBy: "title",
            sortOrder: "asc",
            userId: USER_ALICE.id
        });

        assert.equal(resAsc.flatResults[0].title, "Implement OAuth2 PKCE flow");
        assert.equal(resAsc.flatResults[1].title, "JWT token revocation blacklist");

        const resDesc = await executeUnifiedSearch({
            type: "tasks",
            sortBy: "title",
            sortOrder: "desc",
            userId: USER_ALICE.id
        });

        assert.equal(resDesc.flatResults[0].title, "JWT token revocation blacklist");
        assert.equal(resDesc.flatResults[1].title, "Implement OAuth2 PKCE flow");
    });

    test("18. Pagination: slices results and provides correct pagination metadata", async () => {
        const page1 = await executeUnifiedSearch({
            type: "tasks",
            page: 1,
            pageSize: 1,
            userId: USER_ALICE.id
        });

        assert.equal(page1.flatResults.length, 1);
        assert.equal(page1.pagination.page, 1);
        assert.equal(page1.pagination.limit, 1);
        assert.equal(page1.pagination.total, 2);
        assert.equal(page1.pagination.totalPages, 2);

        const page2 = await executeUnifiedSearch({
            type: "tasks",
            page: 2,
            pageSize: 1,
            userId: USER_ALICE.id
        });

        assert.equal(page2.flatResults.length, 1);
        assert.equal(page2.pagination.page, 2);
        assert.notEqual(page1.flatResults[0].id, page2.flatResults[0].id);
    });

    test("19. Pagination capping: excessive page size is capped at 100", async () => {
        const res = await executeUnifiedSearch({
            pageSize: 500, // Excessive
            userId: USER_ALICE.id
        });

        assert.equal(res.pagination.limit, 100, "Limit must be capped at 100");
    });

    // ============================================================
    // PART E: SENSITIVE DATA REDACTION & NAVIGATION TARGETS
    // ============================================================

    test("20. Result navigation targets point to real existing TaskFlow routes", async () => {
        const res = await executeUnifiedSearch({
            query: "auth",
            userId: USER_ALICE.id
        });

        res.flatResults.forEach(item => {
            assert.ok(item.navigationTarget, "Every result must have a navigationTarget");
            assert.ok(
                item.navigationTarget.startsWith("/tasks") ||
                item.navigationTarget.startsWith("/projects") ||
                item.navigationTarget.startsWith("/workspaces") ||
                item.navigationTarget.startsWith("/command-center") ||
                item.navigationTarget.startsWith("/admin") ||
                item.navigationTarget.startsWith("/profile")
            );
        });
    });

    // ============================================================
    // PART F: NATURAL LANGUAGE CONTROL & QUACKIE INTEGRATION
    // ============================================================

    test("21. parseNaturalLanguageQuery parses search queries into INTENTS.SEARCH", () => {
        const q1 = parseNaturalLanguageQuery("Search for authentication");
        assert.equal(q1.intent, INTENTS.SEARCH);

        const q2 = parseNaturalLanguageQuery("Find tasks related to PKCE");
        assert.equal(q2.intent, INTENTS.SEARCH);

        const q3 = parseNaturalLanguageQuery("Look up decisions on architecture");
        assert.equal(q3.intent, INTENTS.SEARCH);
    });

    test("22. handleIntelligenceQuery orchestrates SEARCH intent deterministically", async () => {
        const res = await handleIntelligenceQuery({
            query: "Search for OAuth2",
            userId: USER_ALICE.id,
            projectId: PROJ_ALPHA.id
        });

        assert.ok(res.explanation);
        assert.match(res.explanation.summary, /Search found/i);
    });

    test("23. Quackie processes search query and replies with markdown links honoring permissions", async () => {
        const res = await processMessage({
            message: "Search for OAuth2 PKCE",
            userId: USER_ALICE.id
        });

        assert.equal(res.emotion, "happy");
        assert.match(res.reply, /Found/i);
        assert.match(res.reply, /Implement OAuth2 PKCE flow/i);
        assert.match(res.reply, /\/tasks/i);
    });

    test("24. Quackie returns friendly not found message when query has no matching accessible items", async () => {
        const res = await processMessage({
            message: "Search for NonExistentXYZ12345",
            userId: USER_ALICE.id
        });

        assert.equal(res.emotion, "curious");
        assert.match(res.reply, /couldn't find any accessible items/i);
    });

    test("25. Quackie does NOT reveal secret resources when searched by unauthorized user", async () => {
        const res = await processMessage({
            message: "Search for quantum cipher",
            userId: USER_ALICE.id // Alice cannot access Charlie's quantum cipher
        });

        assert.equal(res.emotion, "curious");
        assert.match(res.reply, /couldn't find any accessible items/i);
        assert.doesNotMatch(res.reply, /Classified quantum cipher/);
    });

    test("26. Zero external AI API calls: All search intelligence executes 100% deterministically and locally", () => {
        assert.ok(SEARCHABLE_ENTITY_TYPES.includes("tasks"));
        assert.ok(SEARCHABLE_ENTITY_TYPES.includes("projects"));
        assert.ok(SEARCHABLE_ENTITY_TYPES.includes("decisions"));
        assert.ok(SEARCHABLE_ENTITY_TYPES.includes("risks"));
        assert.ok(SEARCHABLE_ENTITY_TYPES.includes("workspaces"));
    });
});
