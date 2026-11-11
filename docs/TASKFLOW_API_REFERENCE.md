# TASKFLOW — COMPLETE API REFERENCE SPECIFICATION

**API Version:** 1.0.0  
**Base URL (Production):** `https://task-project-management-tool.onrender.com/api`  
**Base URL (Development):** `http://localhost:5000/api`  
**Protocol:** HTTPS / JSON  
**Authentication Scheme:** HTTP Bearer Header (`Authorization: Bearer <JWT>`)  
**Audit Date:** November 11, 2026  

---

## 1. GLOBAL CONVENTIONS & STATUS CODES

| HTTP Status | Meaning & Standard Usage in TaskFlow |
|---|---|
| **200 OK** | Standard success response for queries, updates, and simulations. |
| **201 Created** | Successful creation of an entity (user, workspace, project, task, dependency, attachment). |
| **204 No Content** | Successful deletion or preflight CORS OPTIONS request. |
| **400 Bad Request** | Request validation failed (date reversals, missing fields, invalid formats, duration <= 0). |
| **401 Unauthorized**| Missing, expired, invalid, or revoked JWT bearer token. |
| **403 Forbidden** | Authenticated user lacks permission (non-Admin accessing admin route, or non-member accessing tenant data). |
| **404 Not Found** | Target resource ID does not exist. |
| **409 Conflict** | Database constraint violation (duplicate email, duplicate membership, circular dependency). |
| **429 Too Many Requests** | Rate limit threshold exceeded. |
| **500 Internal Error** | Unhandled server exception (sanitized to prevent leaking database internals). |

---

## 2. COMPLETE API ENDPOINTS INVENTORY

---

### A. AUTHENTICATION & IDENTITY (`/api/auth`)

#### 1. POST `/api/auth/register`
- **Purpose:** Initiates registration, hashes password, generates 6-digit OTP, and sends verification email.
- **Auth Required:** No (Public).
- **Rate Limit:** 10 attempts per hour per IP.
- **Request Body:**
  ```json
  {
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com",
    "password": "Password123!",
    "phone": "+1234567890"
  }
  ```
- **Response Structure (200 OK):**
  ```json
  {
    "message": "Verification code sent to your email",
    "email": "jane.doe@example.com"
  }
  ```
- **Controller / Service:** `authController.js` $\rightarrow$ `otpService.js` (`initiateRegistration`)
- **Database Models:** `pending_registrations`, `users`, `roles`
- **Validation:** Email format, password length >= 8, email uniqueness against `users` table.
- **Error Responses:** 400 Bad Request, 409 Conflict ("Email already registered"), 500 Email Dispatch Error.
- **Test Coverage:** `otpVerification.test.js`, `registrationRateLimitingPhase75.test.js`.

#### 2. POST `/api/auth/verify-otp`
- **Purpose:** Validates 6-digit OTP with timing-safe HMAC-SHA256 and atomically promotes pending registration to a permanent user.
- **Auth Required:** No.
- **Rate Limit:** 5 failed attempts maximum per pending registration.
- **Request Body:**
  ```json
  {
    "email": "jane.doe@example.com",
    "otp": "492817"
  }
  ```
- **Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Email verified successfully! You can now log in.",
    "user": {
      "id": "c1f7b09e-7164-4e2e-8367-73b320d7a048",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane.doe@example.com",
      "role": "Team Member"
    }
  }
  ```
- **Controller / Service:** `authController.js` $\rightarrow$ `otpService.js` (`verifyOtpAndCreateUser`)
- **Database Models:** `pending_registrations` (deleted), `users` (created)
- **Validation:** 6-digit numerical format, expiration within 5 minutes, attempt ceiling.
- **Error Responses:** 400 Bad Request ("Invalid code"), 404 ("No pending registration"), 429 ("Max attempts exceeded").
- **Test Coverage:** `otpVerification.test.js`, `onboardingRouting.test.js`.

#### 3. POST `/api/auth/resend-otp`
- **Purpose:** Dispatches a fresh OTP to the pending registration email.
- **Auth Required:** No.
- **Rate Limit:** Enforces 60-second cooldown between resends (max 5 resends).
- **Request Body:** `{ "email": "jane.doe@example.com" }`
- **Response Structure (200 OK):** `{ "message": "Verification code resent successfully" }`
- **Controller / Service:** `authController.js` $\rightarrow$ `otpService.js` (`resendRegistrationOtp`)
- **Test Coverage:** `otpVerification.test.js`.

#### 4. POST `/api/auth/login`
- **Purpose:** Authenticates user credentials, generates 1-day signed JWT, and batch logs LOGIN activities across user workspaces.
- **Auth Required:** No.
- **Rate Limit:** 30 attempts per 15 min per IP; 5 failed attempts per account.
- **Request Body:** `{ "email": "jane.doe@example.com", "password": "Password123!" }`
- **Response Structure (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": "c1f7b09e-7164-4e2e-8367-73b320d7a048",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane.doe@example.com",
      "role": "Team Member",
      "hasCompletedOnboarding": false
    }
  }
  ```
- **Controller / Service:** `authController.js` $\rightarrow$ `authService.js` (`loginUser`)
- **Database Models:** `users`, `roles`, `workspace_members`, `activity_logs`
- **Error Responses:** 400 Bad Request, 401 Unauthorized ("Invalid email or password" or "Please verify email first").
- **Test Coverage:** `loginRateLimitingPhase76.test.js`, `jwtCacheSecurityPhase22f31.test.js`.

#### 5. POST `/api/auth/forgot-password`
- **Purpose:** Generates a 15-minute cryptographically signed reset token and dispatches reset link via email.
- **Auth Required:** No.
- **Rate Limit:** 5 requests per hour.
- **Request Body:** `{ "email": "jane.doe@example.com" }`
- **Response Structure (200 OK):** `{ "message": "Password reset instructions sent to your email" }`
- **Controller / Service:** `authController.js` $\rightarrow$ `authService.js` (`forgotPassword`)
- **Test Coverage:** `securityPhase22b.test.js`.

#### 6. POST `/api/auth/reset-password`
- **Purpose:** Validates reset token, checks `used_password_reset_tokens` to prevent replay, and updates password hash.
- **Auth Required:** No.
- **Request Body:** `{ "token": "<jwt-token>", "password": "NewSecurePassword123!" }`
- **Response Structure (200 OK):** `{ "message": "Password reset successful" }`
- **Controller / Service:** `authController.js` $\rightarrow$ `authService.js` (`resetPassword`)
- **Database Models:** `users`, `used_password_reset_tokens`
- **Test Coverage:** `securityPhase22b.test.js`.

---

### B. USER MANAGEMENT & ONBOARDING (`/api/users`)

#### 7. GET `/api/users/profile`
- **Purpose:** Retrieves authenticated user's profile details.
- **Auth Required:** Yes (Bearer Token).
- **Response (200 OK):** `{ "id": "...", "firstName": "...", "lastName": "...", "email": "...", "phone": "...", "profilePicture": "..." }`
- **Controller / Service:** `userController.js` $\rightarrow$ `userService.js`
- **Test Coverage:** `userPreferences.test.js`.

#### 8. PUT `/api/users/profile`
- **Purpose:** Updates user profile attributes (first name, last name, phone, profile picture).
- **Auth Required:** Yes.
- **Request Body:** `{ "firstName": "Jane", "lastName": "Smith", "phone": "+987654321" }`
- **Controller / Service:** `userController.js` $\rightarrow$ `userService.js`

#### 9. POST `/api/users/change-password`
- **Purpose:** Updates password for authenticated user after verifying current password.
- **Auth Required:** Yes.
- **Request Body:** `{ "currentPassword": "...", "newPassword": "..." }`
- **Controller / Service:** `userController.js` $\rightarrow$ `userService.js`

#### 10. POST `/api/users/onboarding`
- **Purpose:** Marks `has_completed_onboarding = true` in PostgreSQL and records optional onboarding profile preferences.
- **Auth Required:** Yes.
- **Request Body:** `{ "role": "Fullstack Engineer", "experience": "Senior" }`
- **Response (200 OK):** `{ "success": true, "hasCompletedOnboarding": true }`
- **Controller / Service:** `userController.js` $\rightarrow$ `userService.js`
- **Database Models:** `users`
- **Test Coverage:** `onboardingRouting.test.js`.

---

### C. WORKSPACE MANAGEMENT (`/api/workspaces`)

#### 11. POST `/api/workspaces`
- **Purpose:** Creates a new workspace and assigns creator as `Owner`.
- **Auth Required:** Yes.
- **Request Body:** `{ "name": "Engineering Core", "description": "Core product workspace" }`
- **Response (201 Created):** `{ "id": "...", "name": "Engineering Core", "ownerId": "...", "workspaceRole": "Owner" }`
- **Controller / Service:** `workspaceController.js` $\rightarrow$ `workspaceService.js`
- **Database Models:** `workspaces`, `workspace_members`
- **Test Coverage:** `test_03_workspaces_projects_tasks.js`.

#### 12. GET `/api/workspaces`
- **Purpose:** Lists all workspaces where the authenticated user is a member.
- **Auth Required:** Yes.
- **Response (200 OK):** `{ "workspaces": [ { "id": "...", "name": "...", "workspaceRole": "Owner" } ] }`
- **Controller / Service:** `workspaceController.js` $\rightarrow$ `workspaceService.js`

#### 13. GET `/api/workspaces/:id/members`
- **Purpose:** Lists all members in a workspace.
- **Auth Required:** Yes (Workspace Member).
- **Controller / Service:** `workspaceController.js` $\rightarrow$ `workspaceService.js`

#### 14. POST `/api/workspaces/:id/members`
- **Purpose:** Adds a user to a workspace by user ID.
- **Auth Required:** Yes (Workspace Owner or Admin).
- **Request Body:** `{ "userId": "<uuid>", "workspaceRole": "Member" }`
- **Error Responses:** 403 Forbidden, 409 Conflict ("User is already a member").
- **Test Coverage:** `apiDatabaseIntegrityPhase22c.test.js`.

#### 15. PATCH `/api/workspaces/:id/members/:userId`
- **Purpose:** Updates a member's role (`Owner`, `Admin`, `Member`).
- **Auth Required:** Yes (Workspace Owner).

#### 16. DELETE `/api/workspaces/:id/members/:userId`
- **Purpose:** Removes a member from a workspace.
- **Auth Required:** Yes (Workspace Owner or Admin).

---

### D. PROJECT MANAGEMENT (`/api/projects`, `/api/workspaces/:id/projects`)

#### 17. POST `/api/workspaces/:workspaceId/projects`
- **Purpose:** Creates a project within a workspace.
- **Auth Required:** Yes (Workspace Owner or Admin).
- **Request Body:**
  ```json
  {
    "title": "API Microservices Refactor",
    "description": "Decompose monolithic gateway",
    "category": "Backend",
    "priority": "High",
    "status": "Planning",
    "startDate": "2026-11-15",
    "endDate": "2026-12-30"
  }
  ```
- **Validation:** `startDate <= endDate`.
- **Error Responses:** 400 Bad Request ("Project start date cannot be after end date"), 403 Forbidden.
- **Test Coverage:** `apiDatabaseIntegrityPhase22c.test.js`.

#### 18. GET `/api/workspaces/:workspaceId/projects`
- **Purpose:** Retrieves active or archived projects for a workspace.
- **Query Params:** `?archived=true` (optional).
- **Controller / Service:** `projectController.js` $\rightarrow$ `projectService.js`

#### 19. PUT `/api/projects/:id`
- **Purpose:** Updates project title, description, priority, category, status, and dates.
- **Auth Required:** Yes (Workspace Owner/Admin or Project Manager).
- **Validation:** `startDate <= endDate`.

#### 20. PATCH `/api/projects/:id/archive` & `/restore`
- **Purpose:** Archives or restores a project without deleting historical records.
- **Controller / Service:** `projectController.js` $\rightarrow$ `projectService.js`

#### 21. GET `/api/projects/:id/members` & POST `/api/projects/:id/members`
- **Purpose:** Lists and adds project contributors.
- **Database Models:** `project_members`, `roles`

---

### E. TASK & SUBTASK MANAGEMENT (`/api/tasks`, `/api/subtasks`)

#### 22. POST `/api/projects/:projectId/tasks`
- **Purpose:** Creates a new task in a project.
- **Auth Required:** Yes (Project/Workspace Member).
- **Request Body:**
  ```json
  {
    "title": "Implement Redis Cache",
    "description": "Cache session data and JWT verifications",
    "priority": "High",
    "status": "To Do",
    "startDate": "2026-11-15",
    "dueDate": "2026-11-20",
    "estimatedHours": 16,
    "assignedTo": "<user-uuid>"
  }
  ```
- **Validation:** `startDate <= dueDate`, `priority in [Low, Medium, High, Critical]`, `status in [Backlog, To Do, In Progress, Review, Completed]`.
- **Database Models:** `tasks`, `projects`, `users`
- **Test Coverage:** `apiDatabaseIntegrityPhase22c.test.js`.

#### 23. GET `/api/projects/:projectId/tasks`
- **Purpose:** Lists project tasks with pagination.
- **Query Params:** `?page=1&limit=20&status=In%20Progress&priority=High`
- **Validation:** `limit <= 100` (rejects `limit > 100` with 400 Bad Request).
- **Test Coverage:** `apiDatabaseIntegrityPhase22c.test.js`.

#### 24. PATCH `/api/tasks/:id/status`
- **Purpose:** Updates task status (used by Kanban drag-and-drop).
- **Request Body:** `{ "status": "Completed" }`
- **Realtime Dispatch:** Emits `task.status_updated` via Socket.IO.
- **Controller / Service:** `taskController.js` $\rightarrow$ `taskService.js`
- **Test Coverage:** `realtimeCollaboration.test.jsx`.

#### 25. POST `/api/tasks/:id/duplicate`
- **Purpose:** Deep clones a task with its subtasks into a new active task.
- **Controller / Service:** `taskController.js` $\rightarrow$ `taskService.js`

#### 26. POST `/api/tasks/:taskId/subtasks`
- **Purpose:** Creates a subtask under a parent task.
- **Request Body:** `{ "title": "Write unit tests", "status": "To Do", "dueDate": "2026-11-18" }`
- **Database Models:** `subtasks`, `tasks`
- **Test Coverage:** `taskPriorityStatus.test.jsx`.

#### 27. PUT `/api/subtasks/:id` & DELETE `/api/subtasks/:id`
- **Purpose:** Updates or deletes an individual subtask.

---

### F. TASK DEPENDENCIES (`/api/tasks/:taskId/dependencies`)

#### 28. POST `/api/tasks/:taskId/dependencies`
- **Purpose:** Creates a dependency link: `taskId` depends on `dependsOnTaskId`.
- **Auth Required:** Yes (Project Access).
- **Request Body:** `{ "dependsOnTaskId": "<prerequisite-uuid>" }`
- **Safety Invariant:** Evaluates Kahn's topological sort algorithm to prevent circular dependency cycles.
- **Response (201 Created):** `{ "task_id": "...", "depends_on_task_id": "...", "created_at": "..." }`
- **Error Responses:** 400 Bad Request (Self-dependency or cross-project), 409 Conflict ("Circular dependency detected").
- **Test Coverage:** `taskDependenciesPhase13.test.js`.

#### 29. DELETE `/api/tasks/:taskId/dependencies/:dependsOnTaskId`
- **Purpose:** Removes an existing dependency link.
- **Controller / Service:** `taskDependencyController.js` $\rightarrow$ `taskDependencyService.js`

#### 30. GET `/api/tasks/:taskId/dependencies`
- **Purpose:** Returns upstream tasks (blocked by) and downstream tasks (blocks) for a given task.

---

### G. CALENDAR (`/api/calendar`)

#### 31. GET `/api/calendar`
- **Purpose:** Retrieves date-bounded tasks and projects for calendar views.
- **Query Params:** `?startDate=2026-11-01&endDate=2026-11-30`
- **Validation:** Valid ISO date format; `startDate <= endDate`. Rejects reversed ranges with HTTP 400.
- **Database Models:** `tasks`, `projects`, `project_members`
- **Test Coverage:** `apiDatabaseIntegrityPhase22c.test.js`.

---

### H. COMMENTS & ATTACHMENTS (`/api/comments`, `/api/attachments`)

#### 32. POST `/api/tasks/:taskId/comments`
- **Purpose:** Adds a comment to a task.
- **Request Body:** `{ "content": "Integration tests are passing on develop." }`
- **Database Models:** `comments`, `notifications`

#### 33. POST `/api/attachments`
- **Purpose:** Uploads a physical file via Multer multipart form-data.
- **Request:** `file` multipart field, `projectId` or `taskId`.
- **Validation:** File size <= 25MB, extension not in dangerous set, MIME allowed.
- **Storage:** Persisted to `uploads/attachments/<uuid>.<ext>`.
- **Test Coverage:** `fileManagement.test.js`, `securityPhase21.test.js`.

#### 34. GET `/api/attachments/:id/download`
- **Purpose:** Securely streams a file download after verifying user's project/workspace membership.
- **Error Responses:** 401 Unauthorized, 403 Forbidden (Cross-workspace tenant isolation), 404 Not Found.
- **Test Coverage:** `securityPhase21.test.js`.

---

### I. DASHBOARDS, REPORTS & PRODUCTIVITY (`/api/reports`, `/api/productivity`)

#### 35. GET `/api/reports/dashboard`
- **Purpose:** Computes live task completion rate, pending vs overdue counts, priority distributions, and status breakdowns.
- **Query Params:** `?projectId=<uuid>&workspaceId=<uuid>` (optional scoping).
- **Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "completion": {
        "totalTasks": 48,
        "completedTasks": 32,
        "pendingTasks": 16,
        "completionRate": 66.7
      },
      "pendingOverdue": {
        "pendingTasks": 16,
        "overdueTasks": 2
      },
      "byPriority": [
        { "priority": "Critical", "count": 4 },
        { "priority": "High", "count": 12 },
        { "priority": "Medium", "count": 22 },
        { "priority": "Low", "count": 10 }
      ],
      "byStatus": [
        { "status": "Completed", "count": 32 },
        { "status": "In Progress", "count": 10 },
        { "status": "Review", "count": 4 },
        { "status": "To Do", "count": 2 }
      ]
    }
  }
  ```
- **Controller / Service:** `reportController.js` $\rightarrow$ `reportService.js`
- **Database Models:** `tasks`, `projects`, `workspace_members`
- **Test Coverage:** `apiDatabaseIntegrityPhase22c.test.js`.

#### 36. GET `/api/productivity`
- **Purpose:** Computes personal velocity, cycle times (hours and days), focus index (0–100), and 14-day completion trends.
- **Controller / Service:** `productivityController.js` $\rightarrow$ `productivityService.js`
- **Database Models:** `tasks`

---

### J. PLATFORM ADMINISTRATION (`/api/admin`)

#### 37. GET `/api/admin/overview`
- **Purpose:** Aggregates system-wide platform statistics (total users, active users, role breakdowns, total workspaces, projects, memberships).
- **Auth Required:** Yes (Role must be `Admin`).
- **Error Responses:** 401 Unauthorized, 403 Forbidden (Project Managers & Team Members).
- **Test Coverage:** `adminDashboardPhase15.test.js`.

#### 38. GET `/api/admin/users`
- **Purpose:** Lists all registered users with safe projection (never leaks `password_hash`). Supports filtering by role, status, and search query.

#### 39. PATCH `/api/admin/users/:userId/role`
- **Purpose:** Promotes or demotes user role. Protects last active Admin against self-demotion (HTTP 409).
- **Test Coverage:** `adminDashboardPhase15.test.js`.

#### 40. PATCH `/api/admin/users/:userId/status`
- **Purpose:** Activates or deactivates user accounts. Protects last active Admin against deactivation.

---

### K. COMMAND CENTER & DETERMINISTIC INTELLIGENCE (`/api/intelligence`)

#### 41. POST `/api/intelligence/query`
- **Purpose:** Processes natural-language project management queries using deterministic intent recognition.
- **Request Body:** `{ "query": "Why is project health at risk?", "projectId": "<uuid>" }`
- **Response Structure (200 OK):**
  ```json
  {
    "query": "Why is project health at risk?",
    "intent": "EXPLAIN_HEALTH",
    "intentCategory": "EXPLANATION",
    "explanation": {
      "summary": "Project health is at 62/100 (AT_RISK) driven by 2 critical path bottlenecks.",
      "findings": [
        "Schedule drift: +3 days over planned milestone",
        "2 critical tasks are blocked by unfinished upstream dependencies"
      ]
    },
    "evidence": [
      { "metric": "Schedule Drift", "value": "+3 days", "severity": "HIGH" },
      { "metric": "Critical Path Float", "value": "0 days", "severity": "CRITICAL" }
    ]
  }
  ```
- **Controller / Service:** `intelligenceController.js` $\rightarrow$ `naturalLanguageControlService.js`, `intelligenceQueryService.js`
- **Test Coverage:** `projectIntelligencePhase2.test.js`, `projectIntelligencePhase7.test.js`.

#### 42. POST `/api/intelligence/simulate`
- **Purpose:** Runs What-If scenario simulations (task delay, effort increase, resource reassignment) in memory without mutating database state.
- **Controller / Service:** `intelligenceController.js` $\rightarrow$ `scenarioSimulationService.js`

#### 43. POST `/api/intelligence/prepare-proposal`
- **Purpose:** Prepares an actionable replanning proposal and computes base state hash.
- **Controller / Service:** `intelligenceController.js` $\rightarrow$ `intelligenceApprovalService.js`

#### 44. POST `/api/intelligence/execute-action`
- **Purpose:** Executes an approved proposal transactionally after verifying state hash freshness.
- **Error Responses:** 400 Bad Request ("Proposal not approved"), 409 Conflict ("Project state changed; stale state detected").
- **Test Coverage:** `projectChaosPhase10.test.js`, `interventionImpactPhase9.test.js`.

#### 45. POST `/api/intelligence/shockwave`
- **Purpose:** Simulates downstream disruption propagation, buffer absorption, and containment index across the dependency graph.
- **Test Coverage:** `dependencyShockwavePhase8.test.js`.

---

### L. REAL-TIME CHAT & MESSAGING (`/api/chat`)

#### 46. POST `/api/chat/conversations/direct`
- **Purpose:** Initiates or idempotently retrieves a 1-to-1 direct messaging conversation between two users.
- **Database Models:** `conversations`, `conversation_members`
- **Test Coverage:** `chatApiPhase2.test.js`.

#### 47. POST `/api/chat/channels`
- **Purpose:** Creates a workspace or project channel (`PUBLIC` or `PRIVATE`).
- **Database Models:** `channels`, `channel_members`
- **Test Coverage:** `chatApiPhase2.test.js`.

#### 48. POST `/api/chat/messages`
- **Purpose:** Posts a message to a channel or direct conversation. Supports attachments and message threading (`parent_message_id`).
- **Database Models:** `messages`
- **Realtime Broadcast:** Emits `chat.message_sent` to room subscribers.
- **Test Coverage:** `chatRealtimePhase3.test.js`, `chatPhase5Advanced.test.js`.

#### 49. POST `/api/chat/messages/:id/reactions`
- **Purpose:** Adds an emoji reaction to a message.
- **Database Models:** `message_reactions`

#### 50. POST `/api/chat/messages/:id/pin`
- **Purpose:** Pins a message in a channel or conversation.
- **Database Models:** `message_pins`
