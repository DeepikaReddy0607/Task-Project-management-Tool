# 00 — Repository & Architecture Audit

## 1. Executive Summary
This document provides an exhaustive, source-code-grounded architectural inventory of the TaskFlow project management platform as of November 2026. The audit examines the frontend React SPA, Express/Node.js API, PostgreSQL database layer via Prisma ORM, Socket.IO realtime layer, intelligence engines, and automated test suites.

---

## 2. Technology Stack & Runtime Profile

| Component | Technology | Version | Config / Entry Point |
|---|---|---|---|
| **Frontend Framework** | React + Vite | React 19.2.8, Vite 8.2.0 | `frontend/src/main.jsx`, `frontend/vite.config.js` |
| **Styling & Icons** | Tailwind CSS v4, React Icons | `@tailwindcss/vite ^4.3.3`, `react-icons ^5.7.0` | `frontend/src/index.css` |
| **Backend Runtime** | Node.js | v24.14.1 | `backend/src/server.js`, `backend/src/app.js` |
| **Database & ORM** | PostgreSQL + Prisma ORM | Prisma 7.9.1, `@prisma/adapter-pg` | `backend/prisma/schema.prisma`, `backend/src/config/prisma.js` |
| **Realtime Engine** | Socket.IO | Socket.IO 4.8.4 | `backend/src/socket.js`, `frontend/src/context/SocketContext.jsx` |
| **Authentication** | JWT (JSON Web Tokens) + Bcrypt | `jsonwebtoken ^9.0.3`, `bcrypt ^6.0.0` | `backend/src/middleware/authMiddleware.js` |
| **Background Cron** | Node-Cron | `node-cron ^4.6.0` | `backend/src/server.js` (9:00 AM daily due-date check) |
| **Browser Automation**| Playwright (Chrome) | Playwright 1.x (Chromium/System Chrome) | `tests/e2e/` |

---

## 3. Database Schema & Integrity Constraints (`taskflow` schema)

Direct inspection of `prisma/schema.prisma` and PostgreSQL system catalogs reveals 18 relational models:
1. `users`: Stores user identity, authentication hashes, contact numbers, avatars, and role foreign keys (`role_id`).
2. `roles`: Contains system-level RBAC roles (`Admin`, `Project Manager`, `Team Member`).
3. `workspaces`: Container for organizational teams; enforced owner constraint (`owner_id`).
4. `workspace_members`: Junction table mapping users to workspaces with roles (`Owner`, `Admin`, `Member`).
5. `projects`: Workstreams scoped to a workspace; check constraint `priority IN ('Low', 'Medium', 'High')`.
6. `project_members`: Project-level user memberships with roles (`Project Manager`, `Team Member`).
7. `tasks`: Primary task entities; check constraint `priority IN ('Low', 'Medium', 'High')` and `status IN ('Backlog', 'To Do', 'In Progress', 'Review', 'Completed')`.
8. `subtasks`: Granular task items; check constraint `status IN ('To Do', 'In Progress', 'Done')`.
9. `task_dependencies`: Directional DAG edges (`task_id`, `depends_on_task_id`) with cycle detection.
10. `decisions`: Architectural and operational decisions log (Phase 14); check constraint `status IN ('Proposed', 'Approved', 'Reversed')`.
11. `risks`: Predictive and registered project risks with severity/probability classifications.
12. `comments`: Contextual discussion threads attached to tasks.
13. `attachments` & `files`: Metadata tracking uploaded documents with mime-type safety.
14. `notifications`: In-app alert queue for assignments, deadline proximity, and mentions.
15. `activity_logs`: Immutable audit trail for user and system actions across workspaces.
16. `labels` & `task_labels`: Taxonomy tagging for tasks.
17. `project_health_snapshots`: Historical dimension scores for trend analysis.

---

## 4. Frontend Route Inventory

All routes registered in `frontend/src/routes/AppRoutes.jsx`:
- `/`: Dashboard (metrics, my tasks, weekly progress, recent projects)
- `/login`, `/register`, `/forgot-password`, `/reset-password`: Authentication lifecycle
- `/workspaces`: Workspace administration, member management, invitation
- `/projects`: Project listing, creation, risk matrix, X-Ray diagnostics
- `/tasks`: Comprehensive task list, filtering, assignment, subtasks, dependencies, comments
- `/kanban`: Interactive Kanban status board with drag-and-drop and realtime updates
- `/calendar`: Visual deadline planner with month navigation
- `/activity`: Workspace activity timeline
- `/reports`: Exportable project progress, status distribution, and velocity reports
- `/command-center`, `/project-command-center`: Executive project intelligence command center
- `/what-if`: What-If scenario simulations (non-mutating)
- `/portfolio`, `/portfolio-intelligence`: Cross-project portfolio analysis
- `/coordination`, `/coordination-dashboard`, `/briefing`, `/standup`, `/approval-center`: Autonomous Coordination
- `/admin`, `/admin/dashboard`: System administration (RBAC-enforced)
- `/search`: Dedicated unified search page
- `/onboarding`: First-time user onboarding flow

---

## 5. API Route Inventory

Mounted on Express (`backend/src/app.js`):
- `/api/auth`: Login, registration, password recovery, reset token validation
- `/api/users`: Profile retrieval, profile update, avatar URI persistence
- `/api/workspaces`: Workspace CRUD, member search, membership assignment
- `/api/projects`: Project lifecycle, project member management, critical path, bottlenecks, health
- `/api/tasks`: Task CRUD, assignment, status transition, subtasks, dependencies
- `/api/calendar`: Aggregated task and project deadlines by date range
- `/api/comments`: Task comments thread management
- `/api/notifications`: Alert queries, unread count, mark-as-read
- `/api/activities` & `/api/workspaces/:workspaceId/activity`: Workspace activity logging
- `/api/intelligence`: Query engine, simulation, shockwave, chaos lab, red team, counterfactual
- `/api/search`: Permission-aware global search across all 7 searchable entity types
- `/api/quackie`: Contextual assistant endpoints (`/context`, `/chat`, `/proposal`)
- `/api/admin`: Admin dashboard overview, user deactivation, system diagnostics

---

## 6. Implementation Status Matrix

| Module | Status | Notes |
|---|---|---|
| **Authentication & Profile** | Confirmed Existing | Complete with Quackie animated login, JWT persistence, avatar URI. |
| **Workspace Management** | Confirmed Existing | Owner/Admin permissions enforced, member search integrated. |
| **Project Management** | Confirmed Existing | Creation, metadata updates, member assignments, archiving. |
| **Task Management** | Confirmed Existing | Subtask progress calculation, assignment, priority constraints. |
| **Kanban Board** | Confirmed Existing | 5-column layout (`Backlog`, `To Do`, `In Progress`, `Review`, `Completed`). |
| **Realtime Sockets** | Confirmed Existing | Socket.IO room broadcasting with deduplication and in-place reconciliation. |
| **Collaboration & Activity** | Confirmed Existing | Comments, notifications, and activity audit logging. |
| **Task Dependencies** | Confirmed Existing | DAG cycle prevention (Kahn's algorithm), critical path CPM calculation. |
| **Project Intelligence** | Confirmed Existing | Health, Bottlenecks, Critical Path, Digital Twin, Schedule Drift. |
| **Simulations & Command Center** | Confirmed Existing | What-If, Dependency Shockwave, Chaos Lab, Red Team (100% non-mutating). |
| **Unified Search** | Confirmed Existing | Navbar Ctrl+K modal with 8 filter dimensions and permission awareness. |
| **Quackie Assistant** | Confirmed Existing | Context-aware assistant on page/project switch, markdown structured replies. |
| **Admin Dashboard** | Confirmed Existing | Strict frontend conditional view + backend HTTP 403 enforcement. |

---

## 7. Automated Test Suite Baseline
- **Backend automated test runner (`node --test`)**: 19 test suites, **812/812 tests passing**, duration ~5.4s.
- **Frontend production build (`npm run build`)**: Vite transforms 259 modules, outputting clean production bundle in 1.12s with exit code 0.
