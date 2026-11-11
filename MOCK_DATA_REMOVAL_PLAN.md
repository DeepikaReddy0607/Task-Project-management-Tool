# TASKFLOW — MOCK DATA REMOVAL & CLEANUP PLAN

> [!IMPORTANT]
> **EXECUTION STATUS: FULLY EXECUTED & VERIFIED (November 11, 2026)**
> All phases and items described in this plan have been executed successfully. All Class A production mock data, synthetic fallbacks, and dead prototype files have been eliminated. Zero database mutations or deletions were executed. Test suites pass at 100% (45/45 Frontend, 1,065/1,065 Backend). See [MOCK_DATA_CLEANUP_REPORT.md](file:///d:/Projects/Task-Project-management-Tool/MOCK_DATA_CLEANUP_REPORT.md) for full execution evidence.

**Document Purpose:** Actionable, risk-mitigated plan for removing residual mock data, prototype fixtures, and artificial fallback values without disrupting live database data, test suites, or production stability.
**Execution Phase:** Post-Audit Maintenance
**Constraint Invariant:** Strict separation between safe source-code cleanup and database integrity. ZERO destructive database operations (`DELETE`, `TRUNCATE`, `DROP`).

---

## 1. CLEANUP STRATEGY & RISK ASSESSMENT

To ensure total system stability, cleanup must follow a 4-phase rollout:
1. **Phase 1 (Safe UI Bug Fixes):** Repair the live production display bug in `Projects.jsx` by swapping the legacy `projectUsers` lookup for actual workspace members.
2. **Phase 2 (API Fallback Decoupling):** Replace synthetic fallback values in intelligence panels with truthful UI error banners.
3. **Phase 3 (Prototype File Deprecation):** Safely retire unused files in `frontend/src/data/`.
4. **Phase 4 (Preservation of Test Fixtures & Seeds):** Explicitly protect backend in-memory test stores and database seed scripts so that test suites continue to pass at 100%.

---

## 2. DETAILED ACTION PLAN BY FILE

---

### ITEM 1: Fix Manager Name Display & Risk Form Defaults in `Projects.jsx`
- **File:** `frontend/src/pages/projects/Projects.jsx`
- **Priority:** **P0 — Critical Production Fix**
- **Existing Problematic Code:**
  ```javascript
  // Line 12
  import { projectOptions, projectUsers } from "../../data/projectMockData";
  // Line 41
  const emptyRiskForm = { title: "", description: "", severity: "Medium", probability: "Medium", ownerId: "user-geethika", mitigationPlan: "" };
  // Line 93
  const [memberUserId, setMemberUserId] = useState("user-noah");
  // Line 134
  const getUser = (id) => projectUsers.find((user) => user.id === id);
  ```
- **Root Cause:** When database projects load with UUID manager IDs, `getUser(project.managerId)` searches `projectUsers` (which only contains static string IDs like `"user-geethika"`) and returns `undefined`. As a result, the project card displays no manager name, and the "Add Risk" owner dropdown contains blank values.
- **Proposed Safe Replacement:**
  1. Use the existing workspace member state or load members via `getWorkspaceMembers(workspaceId)`.
  2. Implement dynamic member lookup:
     ```javascript
     const getUser = (id) => {
       const member = workspaceMembers.find((m) => m.user_id === id || m.id === id || m.users?.id === id);
       if (!member) return { name: "Unassigned" };
       const u = member.users || member;
       return {
         id,
         name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || "Unknown Member"
       };
     };
     ```
  3. Set `emptyRiskForm.ownerId` to the current user's ID (`user?.id`).
  4. Set `memberUserId` to the first available member in `workspaceMembers[0]?.user_id || ""`.
  5. Replace `projectOptions.categories`, `priorities`, `statuses` with local canonical constants.
  6. Remove the import of `projectMockData.js`.
- **Verification Steps:**
  1. Open Projects page in browser (`/projects`).
  2. Confirm project cards display actual creator/manager names (e.g. "Geethika Sai Unnam" or the authenticated user's name).
  3. Open "Add Risk" modal; verify the "Owner" dropdown lists actual workspace members.
  4. Submit a risk; verify in network tab that `ownerId` is a valid UUID, and the backend returns HTTP 201 Created.

---

### ITEM 2: Remove Hardcoded Synthetic Fallbacks in `InterventionImpactPanel.jsx`
- **File:** `frontend/src/components/intelligence/InterventionImpactPanel.jsx`
- **Priority:** **P1 — High (Truthful UI Error Handling)**
- **Existing Problematic Code:**
  ```javascript
  // Lines 50-95
  } catch {
    // Graceful fallback for mock/demo environments
    setEvaluation({
      supported: true,
      projectId,
      impactScore: 82,
      classification: "HIGH_POSITIVE_IMPACT",
      ...
      baseStateHash: "mock-hash-abc123e89f76a"
    });
  }
  ```
  ```javascript
  // Lines 137-155
  } catch (_) {
    setComparison({
      comparisonMatrix: {
        optionsCount: 3,
        recommendedOption: { optionId: "Option A", score: 82, ... },
        ...
      }
    });
  }
  ```
  ```javascript
  // Lines 175-184
  } catch (err) {
    setPreparedProposal({
      proposalId: `prop-intv-${Date.now()}`,
      title: `Intervention Proposal: ${interventionType}`,
      ...
    });
  }
  ```
- **Root Cause:** When an API failure or timeout occurs, catch blocks suppress the error and inject synthetic 82% positive scores and fake option comparisons. If a user subsequently clicks "Execute", the backend rejects the proposal because `prop-intv-...` does not exist in the database.
- **Proposed Safe Replacement:**
  1. In `handleEvaluate`, replace the synthetic fallback with:
     ```javascript
     } catch (err) {
       setError(err.response?.data?.message || "Telemetry service temporarily unavailable for this project.");
       setEvaluation(null);
     }
     ```
  2. In `handleCompare`, set `comparison` to `null` and set an explicit error state.
  3. In `handleStageProposal`, display an error toast: `toast.error("Failed to stage proposal. Please retry.")`.
- **Verification Steps:**
  1. Simulate an API timeout or point to an invalid project ID.
  2. Confirm the UI renders a clean, user-friendly error card rather than an artificial 82% score.
  3. Restore standard network connectivity; verify that real evaluations populate with genuine metrics.

---

### ITEM 3: Remove `"user-mock"` Fallback in `PortfolioScenarioBuilder.jsx`
- **File:** `frontend/src/components/intelligence/PortfolioScenarioBuilder.jsx`
- **Priority:** **P1 — High (Prevent Invalid API Payloads)**
- **Existing Problematic Code:**
  ```javascript
  // Line 21
  params.userId = selectedUserId || members[0]?.userId || "user-mock";
  ```
- **Proposed Safe Replacement:**
  ```javascript
  const targetUserId = selectedUserId || members[0]?.userId;
  if (!targetUserId) {
    setError("Please select a team member or add members to the workspace before simulating an unavailable resource.");
    setSimulating(false);
    return;
  }
  params.userId = targetUserId;
  ```
- **Verification Steps:**
  1. Open Portfolio Scenario Builder with zero members loaded.
  2. Verify that clicking "Simulate" displays an informative validation notice rather than sending `"user-mock"` to the server.

---

### ITEM 4: Remove Health Score Loading Fallback in `ProjectCommandCenter.jsx`
- **File:** `frontend/src/components/intelligence/ProjectCommandCenter.jsx`
- **Priority:** **P2 — Medium (Visual Polish)**
- **Existing Problematic Code:**
  ```javascript
  // Lines 110-111
  const healthScore = healthData?.score ?? healthData?.healthScore ?? 85;
  const healthStatus = healthData?.status ?? healthData?.healthStatus ?? "HEALTHY";
  ```
- **Proposed Safe Replacement:**
  ```javascript
  const healthScore = healthData?.score ?? healthData?.healthScore ?? null;
  const healthStatus = healthData?.status ?? healthData?.healthStatus ?? "LOADING";
  ```
  In the JSX badge:
  ```javascript
  <span className="...">
    {healthScore !== null ? `${healthStatus} (${healthScore}/100)` : "Analyzing Telemetry..."}
  </span>
  ```
- **Verification Steps:**
  1. Navigate to `/command-center?projectId=...`.
  2. Notice that the badge displays "Analyzing Telemetry..." during the fetch, transitioning directly to the actual calculated score (e.g. `HEALTHY (92/100)`).

---

### ITEM 5: Safely Archive or Delete Unused Prototype Files
- **Files:**
  - `frontend/src/data/profileMockData.js`
  - `frontend/src/data/taskMockData.js`
  - `frontend/src/data/workspaceMockData.js`
  - `frontend/src/data/projectMockData.js`
- **Priority:** **P2 — Medium (Code Hygiene)**
- **Safety Precondition:** Completed after Item 1 has decoupled `Projects.jsx` from `projectUsers`.
- **Action:** Delete the four files from `frontend/src/data/`.
- **Verification Steps:**
  1. Run `npm run build` in `frontend/`.
  2. Confirm the build completes with zero missing import errors.
  3. Run `npm test` in `frontend/`. Verify all 45 Vitest tests pass.

---

## 3. WHAT NOT TO REMOVE (STRICT PRESERVATION LIST)

The following items were inspected and MUST BE PRESERVED:
1. **`backend/src/services/adminService.js` In-Memory Store (`inMemoryStore`):**
   - *Reason:* Required for unit test isolation (`adminDashboardPhase15.test.js`). It allows testing role demotion logic without modifying real admin credentials in the database.
2. **`backend/src/services/attachmentService.js` In-Memory Arrays:**
   - *Reason:* Required for running cross-phase attachment tests without physical disk write side effects.
3. **`backend/src/scripts/seedRoles.js` and `seedAdmin.js`:**
   - *Reason:* Required for initializing fresh database deployments with standard system roles (`Admin`, `Project Manager`, `Team Member`).
4. **`frontend/src/styles/tokens.css`:**
   - *Reason:* Contains standard CSS color definitions, typography variables, and layout metrics used across shadcn and Tailwind UI components.
5. **Existing Production Records in PostgreSQL:**
   - *Reason:* Real registered users, active projects, tasks, and activity logs must be strictly preserved.

---

## 4. VERIFICATION & REGRESSION CHECKLIST

After executing source-code cleanup:
- [ ] Run Frontend Linter: `cd frontend && npm run lint`
- [ ] Run Frontend Production Build: `cd frontend && npm run build`
- [ ] Run Frontend Unit Tests: `cd frontend && npm test` (Expect 45/45 pass)
- [ ] Run Backend Automated Tests: `cd backend && npm test` (Expect 1054/1054 pass)
- [ ] Execute E2E Selenium Test: `python tests/selenium/test_deployed_production.py`
- [ ] Manual Check: Verify project cards display actual manager names in UI.
- [ ] Manual Check: Verify risk modal owner dropdown shows live team members.
- [ ] Manual Check: Verify Command Center loads live metrics without fake fallback scores.