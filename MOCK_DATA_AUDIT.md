# TASKFLOW — COMPREHENSIVE MOCK DATA & HARDCODED VALUES AUDIT

> [!NOTE]
> **REMEDIATION STATUS: COMPLETE & FULLY VERIFIED (November 11, 2026)**
> All Class A and Class D production-facing mock data, synthetic fallback payloads, fabricated default health metrics, fake user identifiers, and dead prototype files identified in this audit have been completely remediated. See [MOCK_DATA_CLEANUP_REPORT.md](file:///d:/Projects/Task-Project-management-Tool/MOCK_DATA_CLEANUP_REPORT.md) for full execution evidence and test verification.

**Audit Date:** November 11, 2026
**Auditor:** Antigravity AI Engineering Suite
**Scope:** Full repository (`frontend/src`, `backend/src`, database seeds, scripts, tests)
**Classification System:**
- **Class A:** Development seed data
- **Class B:** Test fixture
- **Class C:** UI placeholder
- **Class D:** Hardcoded production-facing data
- **Class E:** API fallback data
- **Class F:** Simulated workflow
- **Class G:** Legitimate static configuration

---

## EXECUTIVE SUMMARY OF FINDINGS

A forensic audit of all source files in the TaskFlow codebase was performed. We evaluated whether numbers, charts, cards, users, and tasks originate from real PostgreSQL database queries or if synthetic/static values are present.

### Key Takeaways:
1. **Core Dashboards & Analytics Are Real:** The primary Personal Dashboard (`Dashboard.jsx`), Reports & Analytics (`Reports.jsx`), and Productivity Velocity (`Productivity.jsx`) calculate 100% of their metrics dynamically from live PostgreSQL database records using Prisma aggregations (`tasks.count`, `groupBy`, cycle time calculations).
2. **Four Dead Prototype Mock Files Exist in `frontend/src/data/`:** `projectMockData.js`, `taskMockData.js`, `workspaceMockData.js`, and `profileMockData.js` contain legacy mock objects created during early UI prototyping. Their primary data arrays are no longer imported in the active task, dashboard, or workspace views.
3. **One Critical UI Defect in `Projects.jsx`:** `frontend/src/pages/projects/Projects.jsx` imports `projectUsers` from `../../data/projectMockData` and performs `getUser(project.managerId)`. Because real projects have UUID manager IDs, this lookup returns `undefined`, causing manager names to render as blank on the project overview cards.
4. **Three Client-Side Catch Fallbacks in Intelligence Panels:** `InterventionImpactPanel.jsx` and `PortfolioScenarioBuilder.jsx` contain fallback catch blocks that populate synthetic impact metrics (`impactScore: 82`, `"user-mock"`) when an API call encounters a network failure.
5. **Backend In-Memory Stores are Isolated Test Fixtures:** Backend stores in `adminService.js` and `attachmentService.js` are legitimate test fixtures (Class B) that only populate when explicitly seeded by unit test suites and remain empty during live production operation.

---

## ITEMIZED AUDIT FINDINGS

---

### Finding 1: Unused Prototype Project & User Mock Data
- **Feature Name:** Early UI Prototype Data Store
- **File Path & Line Number:** `frontend/src/data/projectMockData.js` (Lines 1–101)
- **Classification:** **Class D** (Legacy Prototype Fixture)
- **Exact Hardcoded / Mock Values:**
  - `projectWorkspaces`: `[{ id: "workspace-taskflow", name: "TaskFlow Studio" }, ...]`
  - `projectUsers`: `[{ id: "user-geethika", name: "Geethika Sai Unnam" }, { id: "user-aria", name: "Aria Patel" }, { id: "user-james", ... }, { id: "user-maya", ... }, { id: "user-noah", ... }]`
  - `initialProjects`: 3 static mock projects (`project-product-launch`, `project-design-system`, `project-weekly-planning`) with fake risks and dates.
- **Where It Appears in UI:** Formerly displayed on early project lists; currently only `projectUsers` is referenced by `Projects.jsx`.
- **Can It Reach Production?** Yes, bundle includes this file.
- **Is It Used as a Fallback When API Fails?** No.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Remove `initialProjects` and `projectWorkspaces`. Replace `projectUsers` with live workspace member API calls (`getWorkspaceMembers`).
- **Risk of Removing It:** Low, provided `Projects.jsx` is updated to look up managers from workspace members.

---

### Finding 2: Unused Prototype Task Mock Data
- **Feature Name:** Early Task Prototype Fixture
- **File Path & Line Number:** `frontend/src/data/taskMockData.js` (Lines 4–12)
- **Classification:** **Class D** (Legacy Prototype Fixture)
- **Exact Hardcoded / Mock Values:**
  - `initialTasks`: 7 static dummy tasks (`task-launch-brief`, `task-launch-copy`, `task-design-audit`, etc.) assigned to `user-geethika`, `user-aria`, and `user-james`.
- **Where It Appears in UI:** Nowhere in active routes. `Tasks.jsx` loads tasks via `getMyTasks()` API.
- **Can It Reach Production?** Bundled by Vite, but never rendered.
- **Is It Used as a Fallback When API Fails?** No.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Delete `initialTasks` array completely; retain canonical `taskStatuses` and `taskPriorities` if needed, or centralize them into a shared constants file.
- **Risk of Removing It:** Zero risk.

---

### Finding 3: Unused Prototype Workspace Mock Data
- **Feature Name:** Early Workspace Prototype Fixture
- **File Path & Line Number:** `frontend/src/data/workspaceMockData.js` (Lines 1–39)
- **Classification:** **Class D** (Legacy Prototype Fixture)
- **Exact Hardcoded / Mock Values:**
  - `currentWorkspaceUser`: `{ id: "user-geethika", name: "Geethika Sai Unnam", globalRole: "Member" }`
  - `initialWorkspaces`: `[{ id: "workspace-taskflow", name: "TaskFlow Studio" }, { id: "workspace-personal", ... }]`
  - `availableMembers`: `[{ id: "user-lena", ... }, { id: "user-noah", ... }, { id: "user-maya", ... }]`
- **Where It Appears in UI:** Nowhere in active routes. `Workspaces.jsx` loads all data from `getWorkspaces()` and `getWorkspaceMembers()`.
- **Can It Reach Production?** Bundled by Vite, but unreferenced.
- **Is It Used as a Fallback When API Fails?** No.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Delete file or keep as development fixture in a test directory.
- **Risk of Removing It:** Zero risk.

---

### Finding 4: Unused Profile Mock Data
- **Feature Name:** Early Profile Prototype Fixture
- **File Path & Line Number:** `frontend/src/data/profileMockData.js` (Lines 1–9)
- **Classification:** **Class D** (Legacy Prototype Fixture)
- **Exact Hardcoded / Mock Values:**
  - `initialProfile`: `{ id: "user-geethika", firstName: "Geethika", lastName: "Sai Unnam", email: "geethika@taskflow.dev", phone: "+91 98765 43210", role: "Member" }`
- **Where It Appears in UI:** Nowhere. `Profile.jsx` fetches live profile via `getProfile()`.
- **Can It Reach Production?** Bundled by Vite, but unreferenced.
- **Is It Used as a Fallback When API Fails?** No.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Delete file safely.
- **Risk of Removing It:** Zero risk.

---

### Finding 5: Residual `projectUsers` Lookup & Hardcoded Defaults in `Projects.jsx`
- **Feature Name:** Project Overview Cards & Risk Owner Dropdown
- **File Path & Line Number:** `frontend/src/pages/projects/Projects.jsx`
  - Line 12: `import { projectOptions, projectUsers } from "../../data/projectMockData";`
  - Line 41: `const emptyRiskForm = { title: "", description: "", severity: "Medium", probability: "Medium", ownerId: "user-geethika", mitigationPlan: "" };`
  - Line 93: `const [memberUserId, setMemberUserId] = useState("user-noah");`
  - Line 134: `const getUser = (id) => projectUsers.find((user) => user.id === id);`
  - Line 414: `const manager = getUser(project.managerId);`
  - Line 492: `selectedProject?.members.map((member) => { const user = getUser(member.userId); return <option value={member.userId}>{user?.name}</option>; })`
- **Classification:** **Class D** (Hardcoded Production Bug)
- **Where It Appears in UI:**
  1. On each Project Card in the project grid, the manager display shows blank (`undefined`) instead of the manager's real name.
  2. In the "Add Risk" modal dialog, the owner dropdown shows blank options or defaults to `"user-geethika"`.
  3. In the "Add Member" dialog, the initial selected member defaults to `"user-noah"`.
- **Can It Reach Production?** YES. Currently deployed and visible in production.
- **Is It Used as a Fallback When API Fails?** Used directly during standard render.
- **Does It Affect Database Records?** If a user submits the risk form without changing the owner, the frontend attempts to send `ownerId: "user-geethika"` to PostgreSQL, causing a UUID foreign key conversion error (`22P02: Invalid input syntax for type uuid`).
- **Recommended Replacement:**
  1. In `Projects.jsx`, fetch workspace members using `getWorkspaceMembers(workspaceId)`.
  2. Implement `getUser = (id) => workspaceMembers.find(m => m.user_id === id || m.id === id)`.
  3. Default `ownerId` to the current logged-in user's UUID.
  4. Default `memberUserId` to the first available member's UUID.
- **Risk of Removing It:** High improvement value. Fixes a visible production bug where project managers appear blank.

---

### Finding 6: Synthetic Fallback in Intervention Evaluation
- **Feature Name:** Intervention Impact Evaluation Panel
- **File Path & Line Number:** `frontend/src/components/intelligence/InterventionImpactPanel.jsx` (Lines 51–94)
- **Classification:** **Class E** (API Fallback Data)
- **Exact Hardcoded / Mock Values:**
  ```javascript
  setEvaluation({
    supported: true,
    projectId,
    impactScore: 82,
    classification: "HIGH_POSITIVE_IMPACT",
    scoringFactors: [
      "Schedule recovery of +2.1 day(s) (+17 pts)",
      "Project health improvement of +9 pts (+9 pts)",
      "1 structural bottleneck(s) resolved (+8 pts)",
      "Critical path reduction of 2 task(s) (+10 pts)",
      "Workload pressure added: +7h (-11 pts)"
    ],
    recommendation: { verdict: "RECOMMENDED_WITH_TRADE_OFFS", ... },
    baseStateHash: "mock-hash-abc123e89f76a"
  });
  ```
- **Where It Appears in UI:** Displayed in the Intervention Impact Panel under Project Command Center if the backend API `/api/intelligence/evaluate-intervention` fails or times out.
- **Can It Reach Production?** YES. Activates in production if network fails.
- **Is It Used as a Fallback When API Fails?** Yes, directly in the `catch` block.
- **Does It Affect Database Records?** No (simulation only).
- **Recommended Replacement:** Replace catch fallback with `setError("Unable to evaluate intervention on live project telemetry. Please check backend connectivity.")` and render an error card.
- **Risk of Removing It:** Safe; ensures the user sees honest error states rather than fictitious 82% impact scores.

---

### Finding 7: Synthetic Fallback in Intervention Comparison
- **Feature Name:** Intervention Comparison Matrix
- **File Path & Line Number:** `frontend/src/components/intelligence/InterventionImpactPanel.jsx` (Lines 138–154)
- **Classification:** **Class E** (API Fallback Data)
- **Exact Hardcoded / Mock Values:**
  ```javascript
  setComparison({
    comparisonMatrix: {
      optionsCount: 3,
      recommendedOption: {
        optionId: "Option A",
        name: "Option A: Reassign Task",
        score: 82,
        verdict: "HIGHLY_RECOMMENDED"
      },
      rankedOptions: [
        { rank: 1, optionId: "Option A", score: 82, recoveryDays: 2.1 },
        { rank: 2, optionId: "Option B", score: 76, recoveryDays: 3.0 },
        { rank: 3, optionId: "Option C", score: 62, recoveryDays: 1.2 }
      ]
    }
  });
  ```
- **Where It Appears in UI:** Displayed in the "Compare Options" tab of Intervention Impact Panel if `/api/intelligence/compare-interventions` fails.
- **Can It Reach Production?** YES. Activates upon network failure.
- **Is It Used as a Fallback When API Fails?** Yes.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Remove mock catch block; render standard API error toast.
- **Risk of Removing It:** Safe.

---

### Finding 8: Synthetic Fallback Proposal Staging
- **Feature Name:** Intervention Proposal Staging
- **File Path & Line Number:** `frontend/src/components/intelligence/InterventionImpactPanel.jsx` (Lines 176–182)
- **Classification:** **Class E** (API Fallback Data)
- **Exact Hardcoded / Mock Values:**
  ```javascript
  setPreparedProposal({
    proposalId: `prop-intv-${Date.now()}`,
    title: `Intervention Proposal: ${interventionType}`,
    status: "PROPOSED",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    message: "Intervention proposal staged for Approval Center review..."
  });
  ```
- **Where It Appears in UI:** Displayed when user clicks "Stage Proposal for Approval" if API call fails.
- **Can It Reach Production?** YES.
- **Is It Used as a Fallback When API Fails?** Yes.
- **Does It Affect Database Records?** No, but causes an issue if user later tries to execute this fake proposal ID because the backend has no record of `prop-intv-...`.
- **Recommended Replacement:** Show an error notification if proposal preparation fails.
- **Risk of Removing It:** Safe.

---

### Finding 9: Hardcoded `"user-mock"` Fallback in Portfolio Scenario Builder
- **Feature Name:** Cross-Project Portfolio Scenario Simulator
- **File Path & Line Number:** `frontend/src/components/intelligence/PortfolioScenarioBuilder.jsx` (Line 21)
- **Classification:** **Class D** (Hardcoded Parameter Bug)
- **Exact Hardcoded / Mock Value:**
  `params.userId = selectedUserId || members[0]?.userId || "user-mock";`
- **Where It Appears in UI:** Sent in JSON payload to `POST /api/workspaces/:id/intelligence/simulate` when user runs an "Assignee Unavailable" simulation in a workspace with zero loaded members.
- **Can It Reach Production?** YES.
- **Is It Used as a Fallback When API Fails?** Used prior to API dispatch.
- **Does It Affect Database Records?** No, but backend will fail UUID validation on `"user-mock"`.
- **Recommended Replacement:** If no members exist, disable the simulate button and require the user to invite team members first.
- **Risk of Removing It:** Safe; prevents sending invalid non-UUID strings to the server.

---

### Finding 10: Command Center Loading Fallback Values
- **Feature Name:** Project Command Center Health Badge
- **File Path & Line Number:** `frontend/src/components/intelligence/ProjectCommandCenter.jsx` (Lines 110–111)
- **Classification:** **Class C** (UI Placeholder Fallback)
- **Exact Hardcoded / Mock Values:**
  `const healthScore = healthData?.score ?? healthData?.healthScore ?? 85;`
  `const healthStatus = healthData?.status ?? healthData?.healthStatus ?? "HEALTHY";`
- **Where It Appears in UI:** In the top header badge before telemetry finishes loading.
- **Can It Reach Production?** YES (briefly displays during initial fetch).
- **Is It Used as a Fallback When API Fails?** Yes, if health data is null.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Display `"..."` or a skeleton loader when `healthData` is null, rather than displaying an arbitrary score of 85.
- **Risk of Removing It:** Low visual risk.

---

### Finding 11: Backend Admin In-Memory Store
- **Feature Name:** Platform Admin Service Dual-Layer Store
- **File Path & Line Number:** `backend/src/services/adminService.js` (Lines 28–51, 83–136)
- **Classification:** **Class B** (Legitimate Test Isolation Fixture)
- **Exact Code:**
  ```javascript
  let inMemoryStore = { users: [], workspaces: [], projects: [], activityLogs: [] };
  export const seedInMemoryAdminData = (data = {}) => { ... };
  export const getAdminOverview = async () => {
    if (inMemoryStore.users.length > 0) { ... in-memory math ... }
    // live Prisma queries:
    const [totalUsers, activeUsers, ...] = await Promise.all([ prisma.users.count(), ... ]);
  ```
- **Where It Appears in UI:** Only triggered when `seedInMemoryAdminData()` is explicitly called by Node test runner. In production, `inMemoryStore.users` is `[]`, so live database queries always execute.
- **Can It Reach Production?** The code exists in the file, but will never activate in production because no production route calls `seedInMemoryAdminData`.
- **Is It Used as a Fallback When API Fails?** No.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Keep as is. It allows non-destructive unit testing of admin math without polluting production databases.
- **Risk of Removing It:** High risk to automated test suite (would break Phase 15 admin unit tests).

---

### Finding 12: Backend Attachment In-Memory Store
- **Feature Name:** Attachment Service Tenant Access Fixture
- **File Path & Line Number:** `backend/src/services/attachmentService.js` (Lines 73–89)
- **Classification:** **Class B** (Legitimate Test Isolation Fixture)
- **Exact Code:**
  ```javascript
  if (inMemoryProjects.length > 0) {
    const project = inMemoryProjects.find(p => p.id === projectId);
    ...
  }
  ```
- **Where It Appears in UI:** Only during unit test execution.
- **Can It Reach Production?** Dormant in production.
- **Is It Used as a Fallback When API Fails?** No.
- **Does It Affect Database Records?** No.
- **Recommended Replacement:** Retain for test suite stability.
- **Risk of Removing It:** High risk to unit test suites.

---

## SUMMARY OF FINDINGS BY CLASSIFICATION

| Classification | Count | Identified Locations | Risk Level |
|---|---|---|---|
| **Class A (Dev Seed Data)** | 2 | `backend/src/scripts/seedRoles.js`, `backend/src/scripts/seedAdmin.js` | Zero (Standard DB initialization scripts) |
| **Class B (Test Fixtures)** | 4 | `backend/src/services/adminService.js`, `attachmentService.js`, test suites | Zero (Essential for test isolation) |
| **Class C (UI Placeholders)** | 1 | `ProjectCommandCenter.jsx` (defaults health badge to 85 while loading) | Low |
| **Class D (Hardcoded Data / Prototype Bugs)** | 5 | `Projects.jsx` (`projectUsers` lookup, `ownerId: "user-geethika"`), `PortfolioScenarioBuilder.jsx` (`"user-mock"`), `projectMockData.js`, `taskMockData.js`, `workspaceMockData.js`, `profileMockData.js` | **Medium-High (Causes blank manager name on live cards)** |
| **Class E (API Fallback Data)** | 3 | `InterventionImpactPanel.jsx` (fake 82% score on catch), `handleCompare` (fake options on catch), `handleStageProposal` (fake ID on catch) | Medium (Masks network failures) |
| **Class F (Simulated Workflows)** | 1 | `WhatIf.jsx` / `quackieController.js` (Read-only simulation sandbox - designed by spec) | Zero (Intended simulation feature) |
| **Class G (Legitimate Static Configuration)**| 4 | `tokens.css` (Design colors), `taskStatuses`, `taskPriorities`, `ALLOWED_MIME_TYPES` | Zero (Standard static configuration) |