# 01 — Comprehensive E2E Test Inventory

## Overview
This inventory lists the complete test matrix designed and executed across all TaskFlow modules, personas, and boundary conditions.

| Test ID | Module | Scenario Description | Preconditions | Expected Outcome | Risk Level | Verification Method |
|---|---|---|---|---|---|---|
| **AUTH-01** | Authentication | Valid Login with admin credentials | Active admin in DB | HTTP 200, JWT returned, redirects to `/`, profile stored | P0 | Playwright UI + API |
| **AUTH-02** | Authentication | Invalid credentials rejection | Wrong password | HTTP 401, error message displayed, zero token leakage | P1 | Playwright UI + API |
| **AUTH-03** | Authentication | Unauthenticated access to protected route | No JWT header | HTTP 401 Unauthorized, redirected to `/login` | P1 | Playwright UI + API |
| **AUTH-04** | Authentication | Forgot password token generation | Registered email | HTTP 200, reset instructions initiated | P2 | API Integration |
| **AUTH-05A** | Profile | Retrieve user profile | Valid session | HTTP 200 with name, email, phone, role | P2 | API Integration |
| **AUTH-05B** | Profile | Update profile details | Valid session | HTTP 200, updated fields persist to PostgreSQL | P2 | API + DB query |
| **AUTH-06** | Profile | Upload and persist avatar image | Valid base64 URI | HTTP 200, avatar renders in navbar without reload | P3 | Playwright UI + API |
| **WORKSPACE-01**| Workspace | Create workspace | Authenticated user | HTTP 201, workspace created with Owner role | P1 | Playwright UI + API |
| **WORKSPACE-02**| Workspace | List workspaces and verify ownership | Active workspace | User sees only authorized workspaces | P1 | Playwright UI + API |
| **WORKSPACE-03A**| Workspace | Add member to workspace | User exists in DB | Member added with Member role, appears in list | P1 | Playwright UI + API |
| **WORKSPACE-03B**| Workspace | Reject duplicate member addition | Member already added | HTTP 400/409 duplicate rejection | P2 | API Integration |
| **WORKSPACE-04**| Workspace | Remove member from workspace | Member present | Member removed, access revoked immediately | P2 | API Integration |
| **WORKSPACE-05**| Workspace | Cross-workspace isolation (IDOR) | Unrelated user | HTTP 403/404 on foreign workspace queries | P0 | API Security Test |
| **PROJECT-01** | Projects | Create project inside workspace | Workspace access | HTTP 201, project appears in list | P1 | Playwright UI + API |
| **PROJECT-02** | Projects | Update project metadata | Project manager/owner | HTTP 200, title/dates/priority updated in DB | P2 | Playwright UI + API |
| **PROJECT-03A** | Projects | Add member to project | Workspace member | User added to project with Team Member role | P2 | API Integration |
| **PROJECT-03B** | Projects | List project members | Valid project | Returns complete member list | P2 | Playwright UI + API |
| **PROJECT-04** | Projects | Archive project | Project manager/owner | `is_archived: true`, leaves active project views | P2 | Playwright UI + API |
| **TASK-01A** | Tasks | Create task (no false 500) | Valid project | HTTP 201, task appears with Backlog/To Do status | P0 | Playwright UI + API |
| **TASK-01B** | Tasks | Assign task to project member | Valid member | Assignee set, notification queued | P1 | Playwright UI + API |
| **TASK-02** | Tasks | Edit task estimates and dates | Task exists | Updated fields persist accurately | P2 | Playwright UI + API |
| **TASK-03** | Tasks | Reassign task | Another member | Assignee changes, activity logged | P2 | Playwright UI + API |
| **TASK-04** | Tasks | Subtask creation and toggle | Parent task | Subtask status `Done` updates parent progress | P2 | Playwright UI + API |
| **TASK-06** | Tasks | Archive task | Task exists | `is_archived: true`, leaves active Kanban board | P2 | Playwright UI + API |
| **KANBAN-01** | Kanban | Render all 5 Kanban status columns | Valid project | Backlog, To Do, In Progress, Review, Completed visible | P1 | Playwright UI |
| **KANBAN-02** | Kanban | Transition To Do → In Progress | Active task | Status updates immediately in DB and UI | P0 | Playwright UI + API |
| **KANBAN-03** | Kanban | Transition In Progress → Review | Active task | Status updates immediately | P1 | Playwright UI + API |
| **KANBAN-04** | Kanban | Transition Review → Completed | Active task | Task marked completed with completion timestamp | P0 | Playwright UI + API |
| **REALTIME-01**| Realtime | Concurrent status update propagation | 2 active sockets | Client B updates card position without reload (<100ms) | P0 | Multi-client Playwright |
| **REALTIME-02**| Realtime | Room isolation & zero duplicate packets | Overlapping rooms | Chained room broadcasting delivers exactly 1 event | P1 | Socket.IO Client Test |
| **COLLAB-01** | Collaboration | Task comments CRUD | Active task | Comments add, edit, and delete successfully | P2 | Playwright UI + API |
| **COLLAB-02** | Collaboration | User notifications queue | Action triggered | Notification created and retrieved with unread count | P2 | Playwright UI + API |
| **COLLAB-03** | Collaboration | Workspace activity timeline | Action performed | Action logged into activity audit trail | P2 | Playwright UI + API |
| **DEP-01** | Dependencies | Create prerequisite dependency (A -> B) | 2 project tasks | Edge persisted, critical path updated | P1 | API Integration |
| **DEP-02** | Dependencies | Prevent self-dependency (A -> A) | Single task | HTTP 400 rejection | P1 | API Security Test |
| **DEP-03** | Dependencies | Prevent cyclic dependency (A -> B -> A) | Directed cycle | Kahn's algorithm rejects with HTTP 400 | P0 | Algorithm Test |
| **DEP-04** | Dependencies | Compute project CPM graph | DAG of tasks | Computes early/late start, slack, critical chain | P1 | API Integration |
| **RISK-01** | Risks | Register project risk | Active project | Risk created with severity/probability scores | P2 | Playwright UI + API |
| **RISK-02** | Risks | Close project risk | Open risk | Risk marked Closed | P2 | Playwright UI + API |
| **DECISION-01**| Decisions | Record architectural decision | Active project | Decision created with rationale and tags | P1 | Playwright UI + API |
| **DECISION-02**| Decisions | List decision audit trail | Project decisions | Retains chronological decision log | P2 | Playwright UI + API |
| **INTEL-01** | Intelligence | Project health metric evaluation | Tasks & metrics | Deterministic 0-100 score with dimension breakdown | P1 | API Integration |
| **INTEL-02** | Intelligence | Critical path calculation | Dependent tasks | Returns deterministic critical path list | P1 | API Integration |
| **INTEL-03** | Intelligence | Bottleneck detection | Workloads & slack | Identifies blocked tasks and saturated owners | P1 | API Integration |
| **SIM-01** | Command Center| What-If simulation non-mutation invariant| Active project | Calculates delta days with 0 production mutations | P0 | DB Verification + API |
| **SIM-02** | Command Center| Chaos lab resilience simulation | Active project | Monte Carlo failure threshold evaluation | P1 | API Integration |
| **SIM-03** | Command Center| Project Red Team adversarial analysis | Active project | Adversarial vulnerability analysis succeeds | P1 | API Integration |
| **SEARCH-01** | Search | Global keyword search | Search query | Matches tasks, projects, members within scope | P1 | Playwright UI + API |
| **SEARCH-02** | Search | Entity-scoped member search | `type=members` | Filters to users and redacts sensitive passwords | P1 | Playwright UI + API |
| **SEARCH-03** | Search | Multi-filter combination | Query + Status + Pri | Combines filters without 500 error | P2 | Playwright UI + API |
| **QUACKIE-01** | Quackie | Context resolution on page switch | Project view | Resolves project context with appropriate emotion | P1 | Playwright UI + API |
| **QUACKIE-02** | Quackie | Natural language intelligence query | Query string | Responds with structured markdown and no external AI call| P1 | Playwright UI + API |
| **ADMIN-01** | Admin | Admin user access to dashboard | Admin role | Dashboard renders system overview & user table | P1 | Playwright UI + API |
| **RBAC-01** | Security | Non-admin UI rejection | Team Member role | Renders "Administrator Access Required" card | P0 | Playwright UI |
| **RBAC-02** | Security | Non-admin API rejection | Team Member JWT | HTTP 403 Forbidden on `/api/admin/*` | P0 | API Security Test |
