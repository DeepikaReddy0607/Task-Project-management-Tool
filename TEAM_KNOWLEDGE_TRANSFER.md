# TASKFLOW — THREE-MEMBER TEAM KNOWLEDGE TRANSFER GUIDE

**Document Purpose:** Cross-training and module mastery guide for all three team members (Deepika Reddy, Geethika Sai, and Aria Patel) to ensure every member can confidently explain, demonstrate, and defend any component of TaskFlow during the project review.  
**Repository:** `Task-Project-management-Tool`  
**Review Standard:** Software Engineering Lab Project Review & Faculty Defense  

---

## 1. TEAM ORIENTATION & CORE PRINCIPLES

In our upcoming faculty project review, evaluators will not only assess individual contributions but will also test whether all team members understand the end-to-end architecture, database relationships, data flow, and security invariants.

### Foundational Principles to Know
1. **Zero Silent Mutation Invariant:**
   - Evaluators love to ask: *"Can your AI or Command Center accidentally delete or change tasks without the manager knowing?"*
   - **Answer:** **No.** TaskFlow enforces a strict safety protocol:
     $$\text{Request} \longrightarrow \text{Interpretation} \longrightarrow \text{Simulation} \longrightarrow \text{Evidence} \longrightarrow \text{Approval Center} \longrightarrow \text{Execution}$$
     No mutations occur until the user explicitly approves the proposal.
2. **Deterministic Intelligence vs. External LLM:**
   - Evaluators will ask: *"What if OpenAI/Gemini is down or internet fails? Does your app crash?"*
   - **Answer:** **No.** TaskFlow's core intelligence (Critical Path, Bottlenecks, Health Scorecard, What-If Simulation, Dependency Shockwave) is **100% deterministic local TypeScript/JavaScript code**. External Gemini LLM is an optional layer in `quackieProvider.js`; if the key is missing or call fails, it gracefully falls back to the local engine.
3. **Database Concurrency & Stale-State Protection:**
   - Evaluators will ask: *"What if two users change the project while an action plan is waiting for approval?"*
   - **Answer:** Before executing an approved proposal, TaskFlow recalculates a SHA-256 state hash of the project (`SHA256(Project + Tasks + Dependencies)`). If the live hash doesn't match `proposal.baseStateHash`, execution is rejected with HTTP 409 Conflict (`PROPOSAL_STALE`).

---

## 2. MODULE-BY-MODULE KNOWLEDGE TRANSFER

---

### MODULE 1: Authentication, Email OTP & Security Hardening
- **What It Does:** Manages two-stage user registration, email verification using 6-digit OTPs, JWT authentication, session caching, rate limiting, and single-use password resets.
- **Why It Exists:** Protects application data against unauthorized access, prevents bot registrations, and ensures only verified email owners can access workspaces.
- **How It Works:**
  1. Registration (`POST /api/auth/register`) creates a record in `pending_registrations` with a bcrypt password hash and a keyed HMAC-SHA256 hash of the OTP.
  2. Gmail SMTP sends the 6-digit code.
  3. Verification (`POST /api/auth/verify-otp`) validates the code in constant time, deletes the pending record, and atomically creates a permanent `users` record (`has_completed_onboarding: false`).
  4. Login generates a 1-day signed JWT.
- **Important Backend Files:**
  - `backend/src/services/otpService.js` (OTP generation, HMAC-SHA256, atomic promotion)
  - `backend/src/services/authService.js` (User registration, login, single-use reset tokens)
  - `backend/src/middleware/authMiddleware.js` (JWT signature validation, revocation cache)
  - `backend/src/middleware/rateLimiter.js` (Sliding-window IP and account rate limiters)
- **Important Frontend Files:**
  - `frontend/src/pages/auth/Register.jsx`
  - `frontend/src/pages/auth/VerifyOtp.jsx`
  - `frontend/src/pages/auth/Login.jsx`
  - `frontend/src/components/auth/ProtectedRoute.jsx`
- **Database Models:** `pending_registrations`, `users`, `roles`, `used_password_reset_tokens`.
- **API Endpoints:** `POST /api/auth/register`, `/verify-otp`, `/resend-otp`, `/login`, `/forgot-password`, `/reset-password`.
- **Common Failure Scenarios:**
  - *OTP expired:* Fails with HTTP 400 after 5 minutes.
  - *5 incorrect attempts:* Inactivates OTP hash and responds with HTTP 429.
  - *Rate limit exceeded:* Returns HTTP 429 Too Many Requests.
- **How to Demonstrate in Viva:**
  1. Register with a fresh email address.
  2. Show that you cannot log in until verified (demonstrate the pending registration error message).
  3. Open inbox, enter OTP, show instant redirect to login.
  4. Log in and show redirect to `/onboarding`.

---

### MODULE 2: Workspaces, Projects & Role-Based Access Control (RBAC)
- **What It Does:** Enforces multi-tenancy. Projects exist inside workspaces; tasks exist inside projects. Manages team invitations, member roles, and access boundaries.
- **Why It Exists:** Guarantees enterprise tenant isolation so users cannot view or tamper with projects outside their authorized workspaces.
- **How It Works:**
  - Workspaces have an `Owner`, `Admin`, and `Member`. Only Owners and Admins can create projects or invite teammates.
  - Project management access is validated via `backend/src/utils/projectAuthorization.js`, executing live PostgreSQL joins against `workspace_members`.
- **Important Backend Files:**
  - `backend/src/services/workspaceService.js`
  - `backend/src/services/projectService.js`
  - `backend/src/utils/projectAuthorization.js`
- **Important Frontend Files:**
  - `frontend/src/pages/workspaces/Workspaces.jsx`
  - `frontend/src/pages/projects/Projects.jsx`
- **Database Models:** `workspaces`, `workspace_members`, `projects`, `project_members`.
- **API Endpoints:**
  - `POST/GET /api/workspaces`
  - `POST/DELETE /api/workspaces/:id/members`
  - `POST/GET/PUT /api/workspaces/:id/projects`
  - `PATCH /api/projects/:id/archive`, `/restore`
- **Common Failure Scenarios:**
  - *Reversed project dates:* Creating a project with `startDate > endDate` throws HTTP 400 Bad Request.
  - *Duplicate membership:* Adding an existing member throws HTTP 409 Conflict.
- **How to Demonstrate in Viva:**
  1. Open Workspaces page. Create a workspace "FinTech Platform".
  2. Use the member search to find a colleague and add them as "Admin".
  3. Create a project "Payment Gateway". Attempt to set start date to tomorrow and end date to yesterday; show the validation rejection banner. Correct dates and save.

---

### MODULE 3: Task Management, Subtasks & Kanban Drag-and-Drop
- **What It Does:** Provides interactive task lifecycle management (`Backlog` $\rightarrow$ `To Do` $\rightarrow$ `In Progress` $\rightarrow$ `Review` $\rightarrow$ `Completed`), subtasks with dynamic progress percentages, and an interactive Kanban board with real-time updates.
- **Why It Exists:** The operational engine for daily team execution and task tracking.
- **How It Works:**
  - Kanban board renders cards by status column.
  - Dragging a card triggers an optimistic UI update, then dispatches `PATCH /api/tasks/:id/status`.
  - If the backend rejects the update (e.g. unfinished prerequisite), the client rolls back the card to its previous column and displays an alert.
  - Successful updates trigger a WebSocket event `task.status_updated` to all connected clients.
- **Important Backend Files:**
  - `backend/src/services/taskService.js`
  - `backend/src/services/subtaskService.js`
  - `backend/src/controllers/taskController.js`
- **Important Frontend Files:**
  - `frontend/src/pages/tasks/Tasks.jsx`
  - `frontend/src/pages/kanban/Kanban.jsx`
  - `frontend/src/components/kanban/KanbanColumn.jsx`
  - `frontend/src/components/tasks/SubtaskSection.jsx`
- **Database Models:** `tasks`, `subtasks`, `task_dependencies`.
- **API Endpoints:** `POST/GET/PUT /api/tasks`, `PATCH /api/tasks/:id/status`, `POST /api/tasks/:id/duplicate`, `POST/PUT/DELETE /api/subtasks`.
- **Common Failure Scenarios:**
  - *Moving a blocked task:* Backend checks dependencies; if blocked, status change can be rejected or flagged.
  - *Network disconnection during drag:* Card snaps back to original position (optimistic rollback).
- **How to Demonstrate in Viva:**
  1. Open Kanban board (`/kanban`).
  2. Drag a task from "To Do" to "In Progress".
  3. Open a second browser tab; show that the card moved in real time without refreshing!
  4. Open task details, add three subtasks, mark one "Done", and show the subtask progress bar update to 33%.

---

### MODULE 4: Task Dependencies, Graph Theory & Shockwave Analysis
- **What It Does:** Models project tasks as a Directed Acyclic Graph (DAG), prevents circular deadlocks using Kahn's algorithm, calculates Critical Path Method (CPM) metrics, and models dependency shockwaves.
- **Why It Exists:** Eliminates the blind spot where a delay on one task secretly derails the entire project milestone.
- **How It Works:**
  - Stored in `task_dependencies` (`task_id` depends on `depends_on_task_id`).
  - When linking Task A to depend on Task B, `criticalPathService.js` runs **Kahn's Topological Sort Algorithm**. If in-degrees cannot reach zero across all nodes, a cycle is detected and the request is aborted with HTTP 409 Conflict (`DEPENDENCY_CYCLE`).
  - Critical Path Method runs a Forward Pass (calculating Early Start and Early Finish) and a Backward Pass (Late Start and Late Finish). Tasks with $\text{Total Slack} = 0$ constitute the Critical Path.
- **Important Backend Files:**
  - `backend/src/services/taskDependencyService.js`
  - `backend/src/services/criticalPathService.js`
  - `backend/src/services/dependencyShockwaveService.js`
  - `backend/src/services/bottleneckService.js`
- **Important Frontend Files:**
  - `frontend/src/components/tasks/TaskDependencySection.jsx`
  - `frontend/src/components/intelligence/ProjectDependencyGraph.jsx`
  - `frontend/src/components/intelligence/DependencyShockwavePanel.jsx`
- **Database Models:** `task_dependencies`, `tasks`.
- **API Endpoints:** `POST/DELETE /api/tasks/:id/dependencies`, `POST /api/intelligence/shockwave`.
- **How to Demonstrate in Viva:**
  1. Open a task's dependencies section. Link Task 2 to depend on Task 1.
  2. Now attempt to link Task 1 to depend on Task 2 (creating a cycle).
  3. Show the faculty that TaskFlow intercepts this with an explicit error: *"Circular dependency detected. Adding this dependency would create a cycle in the project graph."*
  4. Open Project Intelligence tab; point to the red-highlighted Critical Path tasks and explain Total Slack = 0.

---

### MODULE 5: Project Command Center & Approval Center
- **What It Does:** A natural-language control room allowing managers to ask questions ("Why is health at risk?", "What if API Testing slips 3 days?"), inspect verifiable evidence, and execute replanning actions with state-hash safety.
- **Why It Exists:** Replaces cumbersome manual schedule adjustments with automated, safe, explainable recommendations.
- **How It Works:**
  - Deterministic intent classification (`naturalLanguageControlService.js`) maps user queries to structured analytical routines without relying on unpredictable external LLMs.
  - When an action plan is proposed, the system captures `baseStateHash = SHA256(Project + Tasks + Dependencies)`.
  - Proposals are staged in the **Approval Center** (`status: PROPOSED`).
  - When the manager clicks "Approve" and "Execute", the backend re-verifies that the live project hash matches `baseStateHash`. If verified, changes are executed inside a Prisma database transaction.
- **Important Backend Files:**
  - `backend/src/services/naturalLanguageControlService.js`
  - `backend/src/services/intelligenceQueryService.js`
  - `backend/src/services/intelligenceApprovalService.js`
  - `backend/src/services/replanningExecutionService.js`
- **Important Frontend Files:**
  - `frontend/src/pages/ProjectCommandCenterPage.jsx`
  - `frontend/src/components/intelligence/ProjectCommandCenter.jsx`
  - `frontend/src/components/coordination/ApprovalCenter.jsx`
- **Database Models:** `tasks`, `projects`, `activity_logs`.
- **API Endpoints:** `POST /api/intelligence/query`, `POST /api/intelligence/prepare-proposal`, `POST /api/intelligence/execute-action`.
- **How to Demonstrate in Viva:**
  1. Navigate to `/command-center?projectId=...`.
  2. Click the preset: *"What happens if I reassign API Testing to Bob?"*
  3. Show the instant explanation and evidence metrics.
  4. Click *"Prepare Action Proposal"* $\rightarrow$ show the proposal staged in the Approval Center.
  5. Explain the state hash check to the faculty to demonstrate enterprise software engineering rigor!

---

### MODULE 6: Quackie Assistant & Coordination Briefings
- **What It Does:** An omnipresent intelligent assistant dock supporting Mentor, Socratic, Executive, and Tactical modes. Also generates automated standup summaries and executive briefings.
- **Why It Exists:** Enhances team communication, onboarding, and managerial oversight.
- **How It Works:**
  - Prompts are hydrated with active workspace and task context.
  - If `GEMINI_API_KEY` is present, routes through Google Gemini API; otherwise, runs local deterministic intelligence.
  - Standup generator analyzes `activity_logs` and completed task timestamps over the past 24 hours to automatically draft standup reports.
- **Important Backend Files:**
  - `backend/src/services/quackieService.js`
  - `backend/src/services/quackieProvider.js`
  - `backend/src/services/standupService.js`
  - `backend/src/services/personalBriefingService.js`
- **Important Frontend Files:**
  - `frontend/src/components/assistant/QuackieAssistant.jsx`
  - `frontend/src/components/coordination/StandupPanel.jsx`
  - `frontend/src/components/coordination/DailyBriefingPanel.jsx`
- **How to Demonstrate in Viva:**
  1. Click Quackie in the bottom-right corner.
  2. Ask: *"What are my top priorities today?"*
  3. Show Quackie analyze your assigned tasks and overdue items in clean markdown.
  4. Open `/coordination` $\rightarrow$ Standup tab; show the automatically generated standup summary.

---

### MODULE 7: Real-Time Chat & Collaboration
- **What It Does:** Full-featured in-app team messaging supporting 1-to-1 Direct Messages, public/private Channels, threaded replies, emoji reactions, read receipts, and message pinning.
- **Why It Exists:** Keeps project communications directly tied to project context rather than fragmented across external apps.
- **How It Works:**
  - Backed by Socket.IO rooms (`workspace_<id>`, `channel_<id>`).
  - Messages are persisted in `taskflow.messages`.
  - Read receipts are recorded in `message_read_receipts` with timestamp tracking.
- **Important Backend Files:**
  - `backend/src/services/chatService.js`
  - `backend/src/controllers/chatController.js`
  - `backend/src/socket.js`
- **Important Frontend Files:**
  - `frontend/src/pages/chat/Chat.jsx`
  - `frontend/src/pages/chat/components/` (`MessageItem.jsx`, `MessageComposer.jsx`, `ChannelList.jsx`)
- **Database Models:** `conversations`, `conversation_members`, `channels`, `channel_members`, `messages`, `message_reactions`, `message_read_receipts`, `message_pins`.
- **How to Demonstrate in Viva:**
  1. Open Chat (`/chat`). Send a message in `#general`.
  2. React with an emoji (e.g. 👍).
  3. Reply in a thread and pin the message.
  4. Show real-time receipt updates.

---

## 3. PRESENTATION DEMONSTRATION SCRIPT (10-MINUTE DEFENSE)

| Time | Presenter | Module & Flow | What to Say to Faculty |
|---|---|---|---|
| **0:00 - 2:00** | Deepika Reddy | **Architecture & Registration** | *"TaskFlow is built on React 19, Express 5, and PostgreSQL with Prisma 7. Notice our registration uses timing-safe HMAC-SHA256 OTP verification to guarantee zero spam accounts."* |
| **2:00 - 4:00** | Geethika Sai | **Workspaces, Kanban & Realtime** | *"Here is our Kanban board. Notice that dragging a card executes optimistic UI rendering with automatic rollback on error. In this second tab, you can see the update arrived in real time via Socket.IO."* |
| **4:00 - 6:30** | Aria Patel | **Task Dependencies & Kahn's Algorithm** | *"Unlike standard tools, TaskFlow models tasks as a Directed Acyclic Graph. Watch what happens if I create a dependency loop: Kahn's algorithm detects the cycle and rejects the request with HTTP 409."* |
| **6:30 - 8:30** | Deepika Reddy | **Command Center & Stale-State Protection** | *"In our Command Center, natural-language commands are evaluated deterministically. Changes require explicit manager approval in the Approval Center and are protected by cryptographic state hashing."* |
| **8:30 - 10:00** | All Members | **Testing & Conclusion** | *"We have verified 1,116 automated tests across backend, frontend, and Selenium journeys with 100% pass rates. TaskFlow is fully deployed on Vercel and Render."* |
