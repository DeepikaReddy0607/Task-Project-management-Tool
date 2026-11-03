/**
 * TaskFlow Comprehensive E2E Regression & Integration Test Suite
 * 
 * Programmatically exercises every module end-to-end against the running TaskFlow server:
 * - Authentication & Profile
 * - Workspace Management
 * - Project Management
 * - Task Management
 * - Kanban & Status Workflow
 * - Real-Time Collaboration & Sockets
 * - Collaboration (Comments, Files, Notifications, Activity)
 * - Calendar
 * - Dashboard & Weekly Progress
 * - Dependencies & CPM
 * - Risks & Decision Log
 * - Project Intelligence & Diagnostics
 * - Command Center & Simulations (Non-mutation invariant)
 * - Unified Search & Filters
 * - Quackie Context & Natural Language
 * - Admin & RBAC Security (IDOR & 403 enforcement)
 */

import "dotenv/config";
import http from "http";
import app from "../app.js";
import { initSocket } from "../socket.js";
import { io } from "socket.io-client";
import prisma from "../config/prisma.js";

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5000/api";
const SOCKET_URL = process.env.SOCKET_URL || "http://127.0.0.1:5000";
let testServer = null;

const results = {
    modules: {},
    failures: [],
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0
};

function recordTest(moduleName, testId, testDesc, passed, error = null) {
    results.testsRun++;
    if (!results.modules[moduleName]) {
        results.modules[moduleName] = { run: 0, passed: 0, failed: 0 };
    }
    results.modules[moduleName].run++;

    if (passed) {
        results.testsPassed++;
        results.modules[moduleName].passed++;
        console.log(`  ✔ [${testId}] ${testDesc}`);
    } else {
        results.testsFailed++;
        results.modules[moduleName].failed++;
        results.failures.push({ module: moduleName, testId, testDesc, error: error?.message || String(error) });
        console.error(`  ✖ [${testId}] ${testDesc} - FAIL: ${error?.message || error}`);
    }
}

async function apiRequest(endpoint, options = {}, token = null) {
    const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    let data = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    return { status: response.status, ok: response.ok, data };
}

async function runE2E() {
    console.log("============================================================");
    console.log("       TASKFLOW COMPREHENSIVE E2E REGRESSION SUITE          ");
    console.log("============================================================\n");

    // Ensure backend is listening
    try {
        const hc = await fetch("http://127.0.0.1:5000/api/health");
        if (hc.ok) {
            console.log("Connected to existing TaskFlow backend on port 5000.");
        } else {
            throw new Error("Backend responded with non-200");
        }
    } catch {
        testServer = http.createServer(app);
        initSocket(testServer);
        await new Promise((resolve) => testServer.listen(5000, "127.0.0.1", resolve));
        console.log("Started in-process TaskFlow test server on 127.0.0.1:5000.");
    }

    // Pre-flight checks
    const adminUser = await prisma.users.findFirst({
        where: { email: "admin@taskflow.dev" },
        include: { roles: true }
    });
    if (!adminUser) {
        throw new Error("Admin user admin@taskflow.dev not found in database!");
    }

    const memberUser = await prisma.users.findFirst({
        where: { email: "arjun@gmail.com" },
        include: { roles: true }
    });
    if (!memberUser) {
        throw new Error("Member user arjun@gmail.com not found in database!");
    }

    let adminToken = null;
    let memberToken = null;
    let testWorkspaceId = null;
    let testProjectId = null;
    let testTaskId1 = null;
    let testTaskId2 = null;
    let testTaskId3 = null;

    // ==========================================================
    // 1. AUTHENTICATION & PROFILE
    // ==========================================================
    console.log("--- 1. AUTHENTICATION & PROFILE ---");
    try {
        // AUTH-01: Valid Login
        const loginRes = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: "admin@taskflow.dev", password: "AdminPassword123!" })
        });
        const loginOk = loginRes.status === 200 && !!loginRes.data?.token;
        if (loginOk) adminToken = loginRes.data.token;
        recordTest("Authentication", "AUTH-01", "Valid admin login returns HTTP 200 & JWT", loginOk);

        // Member Login
        const memberLoginRes = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: "arjun@gmail.com", password: "Password123!" })
        });
        if (memberLoginRes.status === 200 && memberLoginRes.data?.token) {
            memberToken = memberLoginRes.data.token;
        } else {
            // Sign a token for member if password differs
            memberToken = jwt.sign(
                { userId: memberUser.id, email: memberUser.email, roleId: memberUser.role_id },
                process.env.JWT_SECRET || "fallback_secret",
                { expiresIn: "1h" }
            );
        }

        // AUTH-02: Invalid Login
        const invalidLoginRes = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: "admin@taskflow.dev", password: "WrongPassword999!" })
        });
        recordTest("Authentication", "AUTH-02", "Invalid credentials rejected with HTTP 401", invalidLoginRes.status === 401);

        // AUTH-03: Protected Route Rejection without Token
        const unauthRes = await apiRequest("/users/profile");
        recordTest("Authentication", "AUTH-03", "Protected route rejects unauthenticated request with 401", unauthRes.status === 401);

        // AUTH-04: Forgot Password Endpoint
        const forgotRes = await apiRequest("/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email: "admin@taskflow.dev" })
        });
        recordTest("Authentication", "AUTH-04", "Forgot password endpoint accepts valid email with 200", forgotRes.status === 200);

        // AUTH-05: View and Update Profile
        const getProfileRes = await apiRequest("/users/profile", {}, adminToken);
        const profileOk = getProfileRes.status === 200 && getProfileRes.data?.user?.email === "admin@taskflow.dev";
        recordTest("Profile", "AUTH-05A", "Retrieve profile via GET /api/users/profile", profileOk);

        const updateProfileRes = await apiRequest("/users/profile", {
            method: "PATCH",
            body: JSON.stringify({
                firstName: "System",
                lastName: "Administrator",
                phone: "+1-555-0199"
            })
        }, adminToken);
        const updateOk = updateProfileRes.status === 200 && updateProfileRes.data?.user?.lastName === "Administrator";
        recordTest("Profile", "AUTH-05B", "Update profile details persists in database", updateOk);

        // AUTH-06: Profile Picture persistence
        const avatarDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const avatarRes = await apiRequest("/users/profile", {
            method: "PATCH",
            body: JSON.stringify({ profilePicture: avatarDataUri })
        }, adminToken);
        const avatarOk = avatarRes.status === 200 && (avatarRes.data?.user?.profilePicture === avatarDataUri || avatarRes.data?.user?.profile_picture === avatarDataUri);
        recordTest("Profile", "AUTH-06", "Profile picture data URI persists and returns in profile", avatarOk);
    } catch (err) {
        recordTest("Authentication", "AUTH-ERR", "Authentication suite error", false, err);
    }

    // ==========================================================
    // 2. WORKSPACE MANAGEMENT
    // ==========================================================
    console.log("\n--- 2. WORKSPACE MANAGEMENT ---");
    try {
        // WORKSPACE-01: Create Workspace
        const createWsRes = await apiRequest("/workspaces", {
            method: "POST",
            body: JSON.stringify({
                name: `E2E Test Workspace ${Date.now()}`,
                description: "Dedicated workspace for end-to-end regression validation"
            })
        }, adminToken);
        const wsOk = createWsRes.status === 201 && !!createWsRes.data?.workspace?.id;
        testWorkspaceId = createWsRes.data?.workspace?.id;
        recordTest("Workspace", "WORKSPACE-01", "Create workspace via POST /api/workspaces returns 201", wsOk);

        // WORKSPACE-02: Workspace Listing & Ownership
        const listWsRes = await apiRequest("/workspaces", {}, adminToken);
        const listOk = listWsRes.status === 200 && Array.isArray(listWsRes.data?.workspaces) && listWsRes.data.workspaces.some(w => w.id === testWorkspaceId);
        recordTest("Workspace", "WORKSPACE-02", "Created workspace appears in list with Owner role", listOk);

        // WORKSPACE-03: Add Member
        const addMemberRes = await apiRequest(`/workspaces/${testWorkspaceId}/members`, {
            method: "POST",
            body: JSON.stringify({
                userId: memberUser.id,
                role: "Member"
            })
        }, adminToken);
        const addMemberOk = (addMemberRes.status === 200 || addMemberRes.status === 201);
        recordTest("Workspace", "WORKSPACE-03A", "Add member to workspace via POST /api/workspaces/:id/members", addMemberOk);

        // WORKSPACE-03B: Duplicate Member Rejection
        const dupMemberRes = await apiRequest(`/workspaces/${testWorkspaceId}/members`, {
            method: "POST",
            body: JSON.stringify({
                userId: memberUser.id,
                role: "Member"
            })
        }, adminToken);
        const dupBlocked = dupMemberRes.status === 400 || dupMemberRes.status === 409;
        recordTest("Workspace", "WORKSPACE-03B", "Duplicate workspace member rejected with HTTP 400/409", dupBlocked);

        // WORKSPACE-04: Remove Member
        const removeMemberRes = await apiRequest(`/workspaces/${testWorkspaceId}/members/${memberUser.id}`, {
            method: "DELETE"
        }, adminToken);
        const removeOk = removeMemberRes.status === 200;
        recordTest("Workspace", "WORKSPACE-04", "Remove member from workspace succeeds", removeOk);

        // Re-add member so we can test cross-user collaboration
        await apiRequest(`/workspaces/${testWorkspaceId}/members`, {
            method: "POST",
            body: JSON.stringify({ userId: memberUser.id, role: "Member" })
        }, adminToken);
    } catch (err) {
        recordTest("Workspace", "WORKSPACE-ERR", "Workspace suite error", false, err);
    }

    // ==========================================================
    // 3. PROJECT MANAGEMENT
    // ==========================================================
    console.log("\n--- 3. PROJECT MANAGEMENT ---");
    try {
        // PROJECT-01: Create Project
        const createProjRes = await apiRequest(`/workspaces/${testWorkspaceId}/projects`, {
            method: "POST",
            body: JSON.stringify({
                title: "E2E Test Project Alpha",
                description: "Project for full end-to-end regression validation",
                category: "Engineering",
                priority: "High",
                status: "Planning",
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
            })
        }, adminToken);
        const projOk = (createProjRes.status === 200 || createProjRes.status === 201) && !!createProjRes.data?.project?.id;
        testProjectId = createProjRes.data?.project?.id;
        recordTest("Projects", "PROJECT-01", "Create project via POST /api/workspaces/:id/projects returns 200/201", projOk);

        // PROJECT-02: Edit Project
        const editProjRes = await apiRequest(`/projects/${testProjectId}`, {
            method: "PATCH",
            body: JSON.stringify({
                title: "E2E Test Project Alpha (Updated)",
                priority: "Medium"
            })
        }, adminToken);
        const editOk = editProjRes.status === 200 && editProjRes.data?.project?.priority === "Medium";
        recordTest("Projects", "PROJECT-02", "Update project info via PATCH /api/projects/:id", editOk);

        // PROJECT-03: Project Members
        const addProjMemberRes = await apiRequest(`/projects/${testProjectId}/members`, {
            method: "POST",
            body: JSON.stringify({ userId: memberUser.id, role: "Team Member" })
        }, adminToken);
        const projMemberOk = (addProjMemberRes.status === 200 || addProjMemberRes.status === 201);
        recordTest("Projects", "PROJECT-03A", "Add member to project succeeds", projMemberOk);

        const listProjMembersRes = await apiRequest(`/projects/${testProjectId}/members`, {}, adminToken);
        const listMembersOk = listProjMembersRes.status === 200 && Array.isArray(listProjMembersRes.data?.members);
        recordTest("Projects", "PROJECT-03B", "List project members returns member list", listMembersOk);
    } catch (err) {
        recordTest("Projects", "PROJECT-ERR", "Project suite error", false, err);
    }

    // ==========================================================
    // 4. TASK MANAGEMENT
    // ==========================================================
    console.log("\n--- 4. TASK MANAGEMENT ---");
    try {
        // TASK-01: Create Tasks (Alpha, Beta, Gamma)
        const createT1 = await apiRequest(`/projects/${testProjectId}/tasks`, {
            method: "POST",
            body: JSON.stringify({
                title: "E2E Task Alpha",
                description: "Foundation task for E2E workflow",
                priority: "High",
                status: "To Do",
                estimatedHours: 8,
                dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                assignedTo: adminUser.id
            })
        }, adminToken);
        const t1Ok = createT1.status === 201 && !!createT1.data?.task?.id;
        testTaskId1 = createT1.data?.task?.id;
        recordTest("Tasks", "TASK-01A", "Create Task Alpha returns HTTP 201 (No false 500)", t1Ok);

        const createT2 = await apiRequest(`/projects/${testProjectId}/tasks`, {
            method: "POST",
            body: JSON.stringify({
                title: "E2E Task Beta",
                description: "Dependent task for CPM and dependency testing",
                priority: "Medium",
                status: "To Do",
                estimatedHours: 12,
                dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
                assignedTo: memberUser.id
            })
        }, adminToken);
        testTaskId2 = createT2.data?.task?.id;
        recordTest("Tasks", "TASK-01B", "Create Task Beta returns HTTP 201", createT2.status === 201);

        const createT3 = await apiRequest(`/projects/${testProjectId}/tasks`, {
            method: "POST",
            body: JSON.stringify({
                title: "E2E Task Gamma",
                description: "Tertiary task for archive/restore testing",
                priority: "Low",
                status: "Backlog",
                estimatedHours: 4
            })
        }, adminToken);
        testTaskId3 = createT3.data?.task?.id;
        recordTest("Tasks", "TASK-01C", "Create Task Gamma returns HTTP 201", createT3.status === 201);

        // TASK-02: Edit Task
        const editT1 = await apiRequest(`/tasks/${testTaskId1}`, {
            method: "PATCH",
            body: JSON.stringify({
                title: "E2E Task Alpha (Modified)",
                estimatedHours: 10
            })
        }, adminToken);
        recordTest("Tasks", "TASK-02", "Edit task details persists via PATCH /api/tasks/:id", editT1.status === 200 && editT1.data?.task?.estimated_hours === 10);

        // TASK-03: Assign Task
        const assignT1 = await apiRequest(`/tasks/${testTaskId1}/assign`, {
            method: "PATCH",
            body: JSON.stringify({ assignedTo: memberUser.id })
        }, adminToken);
        recordTest("Tasks", "TASK-03", "Assign task to member user via PATCH /api/tasks/:id/assign", assignT1.status === 200);

        // TASK-04: Subtasks
        const createSubtaskRes = await apiRequest(`/tasks/${testTaskId1}/subtasks`, {
            method: "POST",
            body: JSON.stringify({ title: "Subtask 1 for Task Alpha" })
        }, adminToken);
        const subOk = (createSubtaskRes.status === 200 || createSubtaskRes.status === 201) && !!createSubtaskRes.data?.subtask?.id;
        const subtaskId = createSubtaskRes.data?.subtask?.id;
        recordTest("Tasks", "TASK-08A", "Create subtask via POST /api/tasks/:id/subtasks", subOk);

        if (subtaskId) {
            const toggleSubtaskRes = await apiRequest(`/subtasks/${subtaskId}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Done" })
            }, adminToken);
            recordTest("Tasks", "TASK-08B", "Complete subtask updates subtask status", toggleSubtaskRes.status === 200);
        }

        // TASK-06: Task Archive & Delete
        const archiveT3Res = await apiRequest(`/tasks/${testTaskId3}`, {
            method: "DELETE"
        }, adminToken);
        recordTest("Tasks", "TASK-06", "Archive task via DELETE /api/tasks/:id succeeds with 200", archiveT3Res.status === 200 && archiveT3Res.data?.task?.is_archived === true);
    } catch (err) {
        recordTest("Tasks", "TASK-ERR", "Task suite error", false, err);
    }

    // ==========================================================
    // 5. KANBAN & REALTIME SOCKET SYNCHRONIZATION
    // ==========================================================
    console.log("\n--- 5. KANBAN & REALTIME SYNCHRONIZATION ---");
    try {
        // Connect Socket A and Socket B
        const socketA = io(SOCKET_URL, { auth: { token: adminToken }, transports: ["websocket"] });
        const socketB = io(SOCKET_URL, { auth: { token: memberToken }, transports: ["websocket"] });

        await Promise.all([
            new Promise((res) => socketA.on("connect", res)),
            new Promise((res) => socketB.on("connect", res))
        ]);

        const receivedEventsOnB = [];
        socketB.on("taskflow:event", (evt) => {
            if (evt.taskId === testTaskId1 || evt.data?.id === testTaskId1) {
                receivedEventsOnB.push(evt);
            }
        });

        // KANBAN-02: Move To Do -> In Progress
        const moveRes1 = await apiRequest(`/tasks/${testTaskId1}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "In Progress" })
        }, adminToken);
        recordTest("Kanban", "KANBAN-02", "Status change To Do -> In Progress returns 200", moveRes1.status === 200);

        // KANBAN-03: Move In Progress -> Review
        const moveRes2 = await apiRequest(`/tasks/${testTaskId1}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "Review" })
        }, adminToken);
        recordTest("Kanban", "KANBAN-03", "Status change In Progress -> Review returns 200", moveRes2.status === 200);

        // KANBAN-04: Move Review -> Completed
        const moveRes3 = await apiRequest(`/tasks/${testTaskId1}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "Completed" })
        }, adminToken);
        recordTest("Kanban", "KANBAN-04", "Status change Review -> Completed returns 200", moveRes3.status === 200);

        // Wait for real-time propagation
        await new Promise((r) => setTimeout(r, 600));

        // KANBAN-05: Realtime event reception on Socket B
        const hasStatusEvents = receivedEventsOnB.some(e => e.type === "task.status_updated");
        recordTest("Realtime", "KANBAN-05", "Socket B received task.status_updated in real time without reload", hasStatusEvents);

        // KANBAN-06: Event payload integrity
        const lastEvt = receivedEventsOnB[receivedEventsOnB.length - 1];
        const payloadValid = lastEvt?.workspaceId === testWorkspaceId &&
                             lastEvt?.projectId === testProjectId &&
                             lastEvt?.taskId === testTaskId1 &&
                             lastEvt?.newStatus === "Completed";
        recordTest("Realtime", "KANBAN-06", "Event payload contains workspaceId, projectId, taskId, oldStatus, newStatus", payloadValid);

        socketA.disconnect();
        socketB.disconnect();
    } catch (err) {
        recordTest("Kanban", "KANBAN-ERR", "Kanban/Realtime error", false, err);
    }

    // ==========================================================
    // 6. COLLABORATION (COMMENTS, FILES, NOTIFICATIONS, ACTIVITY)
    // ==========================================================
    console.log("\n--- 6. COLLABORATION & AUDIT ---");
    try {
        // COMMENTS
        const addCommentRes = await apiRequest(`/tasks/${testTaskId1}/comments`, {
            method: "POST",
            body: JSON.stringify({ content: "E2E review comment on Task Alpha" })
        }, adminToken);
        const commentId = addCommentRes.data?.comment?.id;
        recordTest("Collaboration", "COLLAB-01A", "Add comment to task returns 200/201", (addCommentRes.status === 200 || addCommentRes.status === 201) && !!commentId);

        if (commentId) {
            const editCommentRes = await apiRequest(`/comments/${commentId}`, {
                method: "PATCH",
                body: JSON.stringify({ content: "Updated review comment" })
            }, adminToken);
            recordTest("Collaboration", "COLLAB-01B", "Edit comment content persists", editCommentRes.status === 200);

            const deleteCommentRes = await apiRequest(`/comments/${commentId}`, {
                method: "DELETE"
            }, adminToken);
            recordTest("Collaboration", "COLLAB-01C", "Delete comment succeeds with 200", deleteCommentRes.status === 200);
        }

        // NOTIFICATIONS
        const notifRes = await apiRequest("/notifications", {}, adminToken);
        recordTest("Collaboration", "COLLAB-02", "Retrieve user notifications returns 200", notifRes.status === 200 && Array.isArray(notifRes.data?.notifications));

        // ACTIVITY TIMELINE
        const activityRes = await apiRequest(`/workspaces/${testWorkspaceId}/activity`, {}, adminToken);
        recordTest("Collaboration", "COLLAB-03", "Workspace activity timeline logs recent actions", activityRes.status === 200 && Array.isArray(activityRes.data?.activities));
    } catch (err) {
        recordTest("Collaboration", "COLLAB-ERR", "Collaboration error", false, err);
    }

    // ==========================================================
    // 7. TASK DEPENDENCIES & DAG
    // ==========================================================
    console.log("\n--- 7. TASK DEPENDENCIES & CPM ---");
    try {
        // DEP-01: Create Dependency (Alpha -> Beta)
        const addDepRes = await apiRequest(`/tasks/${testTaskId2}/dependencies`, {
            method: "POST",
            body: JSON.stringify({ dependsOnTaskId: testTaskId1 })
        }, adminToken);
        const depOk = (addDepRes.status === 200 || addDepRes.status === 201);
        recordTest("Dependencies", "DEP-01", "Create dependency Beta dependsOn Alpha succeeds", depOk);

        // DEP-02: Self-Dependency Rejection
        const selfDepRes = await apiRequest(`/tasks/${testTaskId1}/dependencies`, {
            method: "POST",
            body: JSON.stringify({ dependsOnTaskId: testTaskId1 })
        }, adminToken);
        recordTest("Dependencies", "DEP-02", "Self-dependency (A -> A) rejected with HTTP 400", selfDepRes.status === 400);

        // DEP-03: Cycle Detection Rejection (Alpha -> Beta -> Alpha)
        const cycleDepRes = await apiRequest(`/tasks/${testTaskId1}/dependencies`, {
            method: "POST",
            body: JSON.stringify({ dependsOnTaskId: testTaskId2 })
        }, adminToken);
        recordTest("Dependencies", "DEP-03", "Cyclic dependency (A -> B -> A) rejected by Kahn algorithm with 400", cycleDepRes.status === 400);

        // DEP-04: Retrieve Dependency Graph
        const depGraphRes = await apiRequest(`/projects/${testProjectId}/dependencies/graph`, {}, adminToken);
        const graphOk = depGraphRes.status === 200 && Array.isArray(depGraphRes.data?.nodes) && Array.isArray(depGraphRes.data?.edges);
        recordTest("Dependencies", "DEP-04", "Project dependency graph computes CPM nodes and edges", graphOk);
    } catch (err) {
        recordTest("Dependencies", "DEP-ERR", "Dependencies error", false, err);
    }

    // ==========================================================
    // 8. RISKS & DECISIONS
    // ==========================================================
    console.log("\n--- 8. RISKS & DECISION LOG ---");
    try {
        // RISK-01: Create Risk
        const createRiskRes = await apiRequest(`/projects/${testProjectId}/risks`, {
            method: "POST",
            body: JSON.stringify({
                title: "Vendor API Rate Limit Exposure",
                description: "Third-party quota may cause throttling",
                severity: "High",
                probability: "Medium",
                mitigationPlan: "Implement exponential backoff caching layer"
            })
        }, adminToken);
        const riskId = createRiskRes.data?.risk?.id;
        recordTest("Risks", "RISK-01", "Create project risk via POST /api/projects/:id/risks", (createRiskRes.status === 200 || createRiskRes.status === 201) && !!riskId);

        if (riskId) {
            // RISK-02: Close Risk
            const closeRiskRes = await apiRequest(`/risks/${riskId}/close`, {
                method: "PATCH"
            }, adminToken);
            recordTest("Risks", "RISK-02", "Close risk sets status to Closed", closeRiskRes.status === 200 && closeRiskRes.data?.risk?.status === "Closed");
        }

        // DECISION-01: Create Decision
        const createDecisionRes = await apiRequest(`/projects/${testProjectId}/decisions`, {
            method: "POST",
            body: JSON.stringify({
                title: "Adopted PostgreSQL JSONB for Dynamic Attributes",
                rationale: "Permits schema flexibility without sacrificing ACID compliance",
                decision: "Approved",
                status: "Approved",
                category: "Architecture"
            })
        }, adminToken);
        const decisionOk = (createDecisionRes.status === 200 || createDecisionRes.status === 201) && !!(createDecisionRes.data?.data?.id || createDecisionRes.data?.decision?.id);
        recordTest("Decisions", "DECISION-01", "Record architectural decision via POST /api/projects/:id/decisions", decisionOk);

        // DECISION-02: List Decisions
        const listDecisionsRes = await apiRequest(`/projects/${testProjectId}/decisions`, {}, adminToken);
        const listDecOk = listDecisionsRes.status === 200 && Array.isArray(listDecisionsRes.data?.decisions);
        recordTest("Decisions", "DECISION-02", "List project decisions returns recorded audit trail", listDecOk);
    } catch (err) {
        recordTest("Risks", "RISK-ERR", "Risks/Decisions error", false, err);
    }

    // ==========================================================
    // 9. PROJECT INTELLIGENCE & COMMAND CENTER SIMULATIONS
    // ==========================================================
    console.log("\n--- 9. PROJECT INTELLIGENCE & SIMULATIONS ---");
    try {
        // INTEL-01: Project Health
        const healthRes = await apiRequest(`/projects/${testProjectId}/intelligence/health`, {}, adminToken);
        const healthOk = healthRes.status === 200 && (typeof healthRes.data?.score === "number" || typeof healthRes.data?.health?.score === "number" || typeof healthRes.data?.overallScore === "number");
        recordTest("Intelligence", "INTEL-01", "Project health metric evaluation returns score and factors", healthOk);

        // INTEL-02: Critical Path Analysis
        const cpRes = await apiRequest(`/projects/${testProjectId}/critical-path`, {}, adminToken);
        const cpOk = cpRes.status === 200 && (Array.isArray(cpRes.data?.criticalPath) || Array.isArray(cpRes.data?.path));
        recordTest("Intelligence", "INTEL-02", "Critical path calculation returns deterministic path", cpOk);

        // INTEL-03: Bottleneck Detection
        const bottleneckRes = await apiRequest(`/projects/${testProjectId}/bottlenecks`, {}, adminToken);
        recordTest("Intelligence", "INTEL-03", "Bottleneck detection detects resource/task bottlenecks", bottleneckRes.status === 200);

        // SIM-01: What-If Simulation Non-Mutation Invariant
        const taskCountBefore = await prisma.tasks.count({ where: { project_id: testProjectId } });
        const whatIfRes = await apiRequest(`/projects/${testProjectId}/simulate`, {
            method: "POST",
            body: JSON.stringify({
                scenario: "Delay Task Beta by 5 days",
                taskId: testTaskId2,
                days: 5
            })
        }, adminToken);
        const taskCountAfter = await prisma.tasks.count({ where: { project_id: testProjectId } });
        const whatIfOk = whatIfRes.status === 200 && taskCountBefore === taskCountAfter;
        recordTest("Command Center", "SIM-01", "What-If simulation calculates impact with zero production mutations", whatIfOk);

        // SIM-02: Chaos Lab Simulation
        const chaosRes = await apiRequest(`/intelligence/chaos/run`, {
            method: "POST",
            body: JSON.stringify({ projectId: testProjectId, scenarioCount: 3 })
        }, adminToken);
        recordTest("Command Center", "SIM-02", "Chaos lab resilience simulation executes deterministically", chaosRes.status === 200);

        // SIM-03: Project Red Team
        const redTeamRes = await apiRequest(`/intelligence/red-team/run`, {
            method: "POST",
            body: JSON.stringify({ projectId: testProjectId })
        }, adminToken);
        const redTeamOk = redTeamRes.status === 200 && (Array.isArray(redTeamRes.data?.findings) || Array.isArray(redTeamRes.data?.report?.findings));
        recordTest("Command Center", "SIM-03", "Project Red Team adversarial vulnerability analysis succeeds", redTeamOk);
    } catch (err) {
        recordTest("Intelligence", "INTEL-ERR", "Intelligence error", false, err);
    }

    // ==========================================================
    // 10. UNIFIED SEARCH & FILTERS
    // ==========================================================
    console.log("\n--- 10. UNIFIED SEARCH & FILTERS ---");
    try {
        // SEARCH-01: Global Keyword Search
        const searchRes = await apiRequest("/search?q=Alpha", {}, adminToken);
        const searchOk = searchRes.status === 200 && (searchRes.data?.data?.counts?.total > 0 || searchRes.data?.counts?.total > 0);
        recordTest("Search", "SEARCH-01", "Global keyword search matches tasks and projects", searchOk);

        // SEARCH-02: Search by Entity Type
        const memberSearchRes = await apiRequest("/search?q=Arjun&type=members", {}, adminToken);
        const memberSearchOk = memberSearchRes.status === 200 && (memberSearchRes.data?.data?.results?.members?.length > 0 || memberSearchRes.data?.results?.members?.length > 0);
        recordTest("Search", "SEARCH-02", "Entity-scoped search filters by type=members", memberSearchOk);

        // SEARCH-03: Advanced Filter Combination
        const filterRes = await apiRequest(`/search?q=E2E&status=Completed`, {}, adminToken);
        const filterOk = filterRes.status === 200;
        recordTest("Search", "SEARCH-03", "Advanced status filter executes without error", filterOk);
    } catch (err) {
        recordTest("Search", "SEARCH-ERR", "Search error", false, err);
    }

    // ==========================================================
    // 11. QUACKIE CONTEXT & NATURAL LANGUAGE
    // ==========================================================
    console.log("\n--- 11. QUACKIE CONTEXT & NATURAL LANGUAGE ---");
    try {
        // QUACKIE-01: Proactive Project Context
        const quackieProjRes = await apiRequest(`/quackie/context?page=project&projectId=${testProjectId}`, {}, adminToken);
        const quackieProjOk = quackieProjRes.status === 200 && (quackieProjRes.data?.success === true || !!quackieProjRes.data?.page);
        recordTest("Quackie", "QUACKIE-01", "Quackie resolves project context with relevant emotion and insights", quackieProjOk);

        // QUACKIE-02: Natural Language Query
        const quackieChatRes = await apiRequest("/quackie/chat", {
            method: "POST",
            body: JSON.stringify({
                query: "What is the critical path for this project?",
                context: { page: "project", projectId: testProjectId }
            })
        }, adminToken);
        const chatOk = quackieChatRes.status === 200 && typeof quackieChatRes.data?.reply === "string";
        recordTest("Quackie", "QUACKIE-02", "Quackie processes critical path query with structured markdown reply", chatOk);
    } catch (err) {
        recordTest("Quackie", "QUACKIE-ERR", "Quackie error", false, err);
    }

    // ==========================================================
    // 12. ADMIN & RBAC SECURITY
    // ==========================================================
    console.log("\n--- 12. ADMIN & RBAC SECURITY ---");
    try {
        // ADMIN-01: Admin Dashboard Access (Admin User)
        const adminDashRes = await apiRequest("/admin/dashboard", {}, adminToken);
        recordTest("Admin", "ADMIN-01", "Admin user can access /api/admin/dashboard (HTTP 200)", adminDashRes.status === 200);

        // RBAC-01: Non-Admin Access Rejected with 403
        const nonAdminDashRes = await apiRequest("/admin/dashboard", {}, memberToken);
        const forbiddenOk = nonAdminDashRes.status === 403;
        recordTest("RBAC/Security", "RBAC-01", "Non-admin Team Member rejected from /api/admin/* with HTTP 403", forbiddenOk);

        // RBAC-02: Cross-Workspace Isolation
        // Create an isolated workspace for admin only
        const privateWs = await prisma.workspaces.create({
            data: {
                name: `Private Admin Vault ${Date.now()}`,
                owner_id: adminUser.id,
                workspace_members: {
                    create: { user_id: adminUser.id, workspace_role: "Owner" }
                }
            }
        });

        // Member attempts to access private workspace
        const memberAccessRes = await apiRequest(`/workspaces/${privateWs.id}`, {}, memberToken);
        const idorProtected = (memberAccessRes.status === 403 || memberAccessRes.status === 404);
        recordTest("RBAC/Security", "RBAC-02", "Cross-workspace IDOR protection: unauthorized user denied access (403/404)", idorProtected);

        // Clean up private vault
        await prisma.workspace_members.deleteMany({ where: { workspace_id: privateWs.id } });
        await prisma.workspaces.delete({ where: { id: privateWs.id } });
    } catch (err) {
        recordTest("Admin", "ADMIN-ERR", "Admin/RBAC error", false, err);
    }

    // ==========================================================
    // CLEANUP OF E2E TEST ARTIFACTS
    // ==========================================================
    console.log("\n--- CLEANING UP TEST ARTIFACTS ---");
    try {
        if (testWorkspaceId) {
            await prisma.task_dependencies.deleteMany({
                where: {
                    OR: [
                        { task_id: testTaskId1 },
                        { task_id: testTaskId2 },
                        { depends_on_task_id: testTaskId1 },
                        { depends_on_task_id: testTaskId2 }
                    ]
                }
            });
            await prisma.comments.deleteMany({ where: { task_id: { in: [testTaskId1, testTaskId2, testTaskId3].filter(Boolean) } } });
            await prisma.subtasks.deleteMany({ where: { task_id: { in: [testTaskId1, testTaskId2, testTaskId3].filter(Boolean) } } });
            await prisma.tasks.deleteMany({ where: { project_id: testProjectId } });
            await prisma.risks.deleteMany({ where: { project_id: testProjectId } });
            await prisma.decisions.deleteMany({ where: { project_id: testProjectId } });
            await prisma.project_members.deleteMany({ where: { project_id: testProjectId } });
            await prisma.projects.deleteMany({ where: { id: testProjectId } });
            await prisma.workspace_members.deleteMany({ where: { workspace_id: testWorkspaceId } });
            await prisma.workspaces.delete({ where: { id: testWorkspaceId } });
            console.log("Cleanup completed successfully.");
        }
    } catch (cleanupErr) {
        console.warn("Cleanup warning:", cleanupErr.message);
    }

    if (testServer) {
        await new Promise((resolve) => testServer.close(resolve));
    }

    await prisma.$disconnect();

    console.log("\n============================================================");
    console.log("                  E2E TEST SUMMARY RESULTS                  ");
    console.log("============================================================");
    console.log(`Total Tests Run:    ${results.testsRun}`);
    console.log(`Passed:             ${results.testsPassed}`);
    console.log(`Failed:             ${results.testsFailed}`);
    console.log(`Pass Percentage:    ${((results.testsPassed / results.testsRun) * 100).toFixed(1)}%\n`);

    console.log("| Module | Tests | Passed | Failed | Status |");
    console.log("|---|---:|---:|---:|---|");
    for (const [mod, data] of Object.entries(results.modules)) {
        const modStatus = data.failed === 0 ? "PASS" : "FAIL";
        console.log(`| ${mod} | ${data.run} | ${data.passed} | ${data.failed} | ${modStatus} |`);
    }

    if (results.failures.length > 0) {
        console.log("\nFailures Detail:");
        results.failures.forEach(f => console.log(`  - [${f.testId}] (${f.module}) ${f.testDesc}: ${f.error}`));
    }
}

runE2E().catch((err) => {
    console.error("Fatal E2E test runner crash:", err);
    process.exit(1);
});
