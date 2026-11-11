# TASKFLOW — STRATEGIC IMPLEMENTATION & ENHANCEMENT ROADMAP

**Document Purpose:** Forward-looking engineering roadmap outlining immediate post-audit cleanup, production hardening, and advanced feature milestones for TaskFlow.  
**Roadmap Horizon:** November 2026 – March 2027  
**Current Milestone:** Lab Review & Production Parity  

---

## 1. EXECUTIVE AUDIT RECAP & STATUS SNAPSHOT

| Metric Category | Verified Count / Status | Notes & Codebase Reference |
|---|---|---|
| **Total Identified Features** | **54 Functional Modules** | Across 18 major functional categories (A through R). |
| **Fully Implemented Features** | **51 Modules (94.4%)** | Complete frontend, backend, database, and API integration. |
| **Verified Features** | **51 Modules (100% of Implemented)** | Empirically verified via automated test suites. |
| **Partially Implemented Features** | **3 Modules (5.6%)** | Minor display or fallback issues: `Projects.jsx` manager lookup, `InterventionImpactPanel.jsx` catch block, and `PortfolioScenarioBuilder.jsx` user-mock. |
| **Missing Core Features** | **0 Modules (0.0%)** | All SRS and advanced capabilities have matching implementations. |
| **Broken Core Features** | **0 Modules (0.0%)** | Zero fatal runtime exceptions across verified operational routes. |
| **Simulated Features (By Design)**| **1 Module** | What-If Scenario Sandbox (`WhatIf.jsx`) operates as read-only simulation. |
| **Verified Test Suites** | **1,116 Passing Tests** | 1,054 Backend Tests + 45 Frontend Tests + 17 Selenium Tests (0 failures). |
| **Critical Security Vulnerabilities**| **0 Critical Defects** | Mitigated: SQL injection prevented via Prisma, timing-safe OTP verification, sliding-window rate limiters, single-use reset tokens, and tenant-isolated file streaming downloads. |
| **Critical Performance Vulnerabilities**| **0 Blocking Defects** | All task list endpoints enforce `limit <= 100`, composite indexes added to Prisma schema, and cluster IPC socket relay implemented. |

---

## 2. PHASED IMPLEMENTATION TIMELINE

```
2026                        2026/2027
NOV 11 - NOV 15             NOV 16 - DEC 15             JAN 2027                    FEB - MAR 2027
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  PHASE 1: REVIEW     │    │  PHASE 2: PRODUCTION │    │  PHASE 3: ENTERPRISE │    │  PHASE 4: SCALE &    │
│  PARITY & CLEANUP    │───►│  CLOUD STORAGE & S3  │───►│  GANTT & TIMELINES   │───►│  INTEGRATIONS        │
│  - Fix Projects.jsx  │    │  - AWS S3 Pre-signed │    │  - Interactive Gantt │    │  - GitHub / Jira API │
│  - Remove Fallbacks  │    │  - Redis Rate Limits │    │  - Critical Path Drag│    │  - TOTP Authenticator│
│  - Finalize Defense  │    │  - Redis Socket.IO   │    │  - Baseline vs Live  │    │  - Webhook Triggers  │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘    └──────────────────────┘
```

---

## 3. DETAILED WORKSTREAMS & SPRINT BREAKDOWN

---

### SPRINT 1: Immediate Review Parity & Source Cleanup (Target: Nov 11 – Nov 15, 2026)
*Objective: Eliminate all residual prototype code and verify visual polish prior to faculty presentation.*

- [ ] **Task 1.1: Resolve Project Manager Display in `Projects.jsx` (Priority: P0)**
  - *Action:* Replace `import { projectUsers }` and `getUser(project.managerId)` with live member lookups against `getWorkspaceMembers(workspaceId)`.
  - *Outcome:* Project overview cards display actual manager names for all production projects.
  - *Files:* `frontend/src/pages/projects/Projects.jsx`.

- [ ] **Task 1.2: Decouple Synthetic Fallbacks in `InterventionImpactPanel.jsx` (Priority: P1)**
  - *Action:* Replace catch blocks returning fake 82% scores with standard error alerts: `setError("Intervention telemetry unavailable.")`.
  - *Outcome:* Truthful error state handling during backend disconnections.
  - *Files:* `frontend/src/components/intelligence/InterventionImpactPanel.jsx`.

- [ ] **Task 1.3: Prevent `"user-mock"` Dispatch in `PortfolioScenarioBuilder.jsx` (Priority: P1)**
  - *Action:* Enforce validation requiring at least one member to be present before enabling the "Simulate" button.
  - *Files:* `frontend/src/components/intelligence/PortfolioScenarioBuilder.jsx`.

- [ ] **Task 1.4: Retire Dead Prototype Files in `frontend/src/data/` (Priority: P2)**
  - *Action:* Safely delete `profileMockData.js`, `taskMockData.js`, `workspaceMockData.js`, and `projectMockData.js`.
  - *Outcome:* Zero unused mock files bundled in Vite distribution builds.

---

### SPRINT 2: Production Hardening & Cloud Storage (Target: Nov 16 – Dec 15, 2026)
*Objective: Migrate ephemeral container storage to distributed cloud infrastructure.*

- [ ] **Task 2.1: Cloud Object Storage Integration (AWS S3 / Cloudinary)**
  - *Action:* Replace local disk storage in `uploadMiddleware.js` with AWS S3 pre-signed upload URLs.
  - *Why:* On platforms like Render or AWS ECS, local disks are ephemeral. Storing files in S3 ensures attachments persist across container restarts.
  - *Files:* `backend/src/middleware/uploadMiddleware.js`, `backend/src/services/attachmentService.js`.

- [ ] **Task 2.2: Distributed Rate Limiting via Redis**
  - *Action:* Replace in-memory token buckets in `rateLimiter.js` with Redis-backed sliding-window limiters (`ioredis` + `rate-limiter-flexible`).
  - *Why:* Supports horizontal scaling across multiple load-balanced backend containers.

- [ ] **Task 2.3: Redis Adapter for Socket.IO**
  - *Action:* Implement `@socket.io/redis-adapter` in `backend/src/socket.js`.
  - *Why:* Allows WebSocket clients connected to separate server instances to broadcast real-time events to each other seamlessly.

---

### SPRINT 3: Enterprise Gantt & Interactive Timelines (Target: Jan 2027)
*Objective: Deliver interactive visual scheduling capabilities.*

- [ ] **Task 3.1: Interactive Gantt Chart Timeline View**
  - *Action:* Build an interactive Gantt chart component supporting drag-and-drop duration resizing and visual dependency connectors.
  - *Features:* Real-time recalculation of downstream early start dates as upstream task bars are dragged.

- [ ] **Task 3.2: Baseline vs. Live Milestone Slippage Visualizer**
  - *Action:* Allow managers to lock a "Project Baseline" upon kickoff. Render semi-transparent baseline shadow bars beneath live task bars to highlight schedule drift at a glance.

---

### SPRINT 4: Developer Ecosystem & Integrations (Target: Feb – Mar 2027)
*Objective: Integrate TaskFlow into engineering toolchains.*

- [ ] **Task 4.1: GitHub & GitLab Pull Request Linking**
  - *Action:* Expose webhook receiver `POST /api/integrations/github/webhook`. When a PR mentioning `Fixes #TASK-123` is merged, automatically transition the task to `Review` or `Completed`.

- [ ] **Task 4.2: Time-based One-Time Password (TOTP) Multi-Factor Auth**
  - *Action:* Add optional 2FA support using `speakeasy` and `qrcode` for Google Authenticator / Authy.

- [ ] **Task 4.3: Slack & Microsoft Teams Webhook Notifications**
  - *Action:* Allow projects to configure incoming webhook URLs for automated team notifications when critical path milestones slip.

---

## 4. HIGHEST-PRIORITY REMAINING WORK (IMMEDIATE PRE-REVIEW FOCUS)

1. **Verify Projects.jsx Visual Fix:** Apply the live member lookup to `Projects.jsx` so faculty members see their actual names displayed on project cards during the live demo.
2. **Review Defense Script:** Rehearse the 10-minute team defense script outlined in `TEAM_KNOWLEDGE_TRANSFER.md`.
3. **Double-Check Seed Admin Credentials:** Ensure the seed admin account (`admin@taskflow.dev`) is accessible for demonstrating the administrative overview and RBAC self-demotion guards.
