# TASKFLOW — FACULTY PROJECT REVIEW & VIVA DEFENSE QUESTIONS

**Target Audience:** Evaluators, External Examiners, and Project Review Committee  
**Total Curated Questions:** 65 In-Depth Questions and Code-Accurate Answers  
**Scope:** Architecture, React 19, Node.js, Express 5, PostgreSQL, Prisma 7, Security, Concurrency, Graph Theory, Intelligence, Testing, and Deployment  

---

## SECTION 1: ARCHITECTURE & SYSTEM DESIGN (Q1 – Q8)

#### Q1: What architectural pattern does TaskFlow follow, and why did you choose it over a monolithic full-stack framework like Next.js?
**Answer:** TaskFlow implements a decoupled three-tier client-server architecture: a React 19 single-page application (SPA) client, an Express 5 REST and WebSocket application server, and a PostgreSQL persistence layer. We separated the frontend from the backend rather than using a server-side rendering framework like Next.js because TaskFlow relies heavily on persistent, bi-directional, stateful WebSockets (Socket.IO) for real-time collaboration (chat, live kanban dragging, presence indicators). Serverless Next.js functions terminate rapidly and struggle with stateful WebSockets without third-party services. Decoupling also allowed us to deploy the frontend statically to Vercel's global CDN while hosting the Node.js application server on Render.

#### Q2: How does the application prevent cross-tenant data leakage between different workspaces?
**Answer:** Multi-tenancy is enforced through hierarchical foreign key constraints and server-side authorization checks. Every project, channel, and label is tied to a `workspace_id`. In `backend/src/utils/projectAuthorization.js` and middleware, incoming requests verify that `req.user.id` possesses an active record in `taskflow.workspace_members` for the target workspace. Even if an attacker knows a project's UUID, direct object access without workspace membership is blocked with HTTP 403 Forbidden.

#### Q3: What is the purpose of `app.set("trust proxy", 1)` in `backend/src/app.js`?
**Answer:** On platforms like Render or Cloudflare, client traffic passes through an edge reverse proxy / load balancer before reaching the Node.js process. By setting `trust proxy` to 1, Express trusts the first hop upstream and correctly populates `req.ip` from the `X-Forwarded-For` header. Without this setting, all incoming requests would appear to originate from the internal proxy's IP address (e.g., `10.x.x.x`), which would break IP-based rate limiting by grouping all worldwide users into a single rate limit bucket. Setting it strictly to 1 prevents IP spoofing by ignoring arbitrary client-supplied headers beyond the first proxy hop.

#### Q4: How does TaskFlow scale to utilize multi-core server processors?
**Answer:** In `backend/src/server.js`, TaskFlow supports cluster mode (`process.env.CLUSTER_MODE === "true"`). The primary process forks worker processes matching available CPU cores (`cluster.fork()`). The primary process manages inter-process communication (IPC) through `relayIpcMessage`, relaying standardized `TASKFLOW_*` WebSocket broadcasts across all worker processes so that a client connected to Worker 1 receives messages emitted on Worker 2.

#### Q5: How are background tasks handled in TaskFlow?
**Answer:** Background automation is managed using `node-cron` in `backend/src/server.js`. In cluster mode, the cron schedule is bound exclusively to the primary cluster process (`cluster.isPrimary`) to prevent duplicate executions across worker nodes. At 09:00 AM UTC daily (`0 9 * * *`), `dueDateNotificationService.js` queries tasks due within 24–48 hours and creates deduplicated notification records in `taskflow.notifications`.

#### Q6: How does TaskFlow handle centralized error handling without exposing database internals?
**Answer:** In `backend/src/app.js`, a centralized error-handling middleware intercepts all errors passed to `next(err)`. It inspects database error codes (`P2002` / `23505` $\rightarrow$ 409 Conflict, `23514` $\rightarrow$ 400 Bad Request, `P2025` $\rightarrow$ 404 Not Found, `22P02` $\rightarrow$ 400 Invalid UUID). If an unhandled 500 error occurs, it logs the stack trace to the server console but returns a sanitized JSON response `{ "success": false, "message": "Internal server error" }`, ensuring raw SQL queries, table schemas, and credentials are never exposed to clients.

#### Q7: What design system and CSS tokens does the frontend use?
**Answer:** The frontend uses Tailwind CSS 4 integrated with a custom tokenized design system defined in `frontend/src/styles/tokens.css`. Tokens include semantic color variables (`--color-brand`, `--color-surface`, `--color-border`), elevation shadow curves (`--shadow-sm`, `--shadow-md`, `--shadow-lg`), and standard radii (`--radius-md`, `--radius-xl`, `--radius-pill`), supporting consistent light and dark mode rendering across all UI cards and inputs.

#### Q8: How does code-splitting work on the frontend, and what happens on browser refresh?
**Answer:** In `frontend/src/routes/AppRoutes.jsx`, all page components are imported via `React.lazy()` (e.g. `const Kanban = lazy(() => import("../pages/kanban/Kanban"))`). Vite splits each page into an independent JavaScript chunk loaded on demand. To prevent 404 errors when a user refreshes deep links (e.g. `/kanban` or `/command-center`), `vercel.json` provides a rewrite rule redirecting all requests to `/index.html`, where React Router DOM resumes client routing.

---

## SECTION 2: AUTHENTICATION, JWT & SECURITY (Q9 – Q18)

#### Q9: Explain the complete registration and email OTP verification lifecycle.
**Answer:** Registration is split into two phases to eliminate unverified fake accounts:
1. `POST /api/auth/register`: The user submits name, email, password, and phone. The password is hashed using `bcrypt` (salt rounds: 10). The backend generates a cryptographically secure 6-digit number using `crypto.randomInt(100000, 1000000)` and hashes it using keyed HMAC-SHA256 (`crypto.createHmac("sha256", secret)`). These are stored in `taskflow.pending_registrations` with a 5-minute expiry. An email is dispatched via Gmail SMTP.
2. `POST /api/auth/verify-otp`: The user submits the 6-digit code. The backend recomputes the HMAC-SHA256 hash and compares it using `crypto.timingSafeEqual` to prevent timing attacks. In an atomic transaction (`prisma.$transaction`), the record is deleted from `pending_registrations` and inserted into `taskflow.users` with `has_completed_onboarding: false`.

#### Q10: Why do you store the OTP as an HMAC-SHA256 hash instead of plain text in `pending_registrations`?
**Answer:** Storing plain text OTPs is a security vulnerability; an attacker with read-only database dump access could immediately read active OTPs and verify arbitrary accounts. Storing a keyed HMAC-SHA256 hash ensures that even if the database table is exposed, an attacker cannot recover the plain OTP without the server-side `OTP_SECRET`.

#### Q11: How does TaskFlow prevent timing attacks during OTP verification?
**Answer:** Standard JavaScript string equality checks (`===`) terminate early as soon as the first mismatched character is detected, leaking timing variations. In `backend/src/services/otpService.js`, we use `crypto.timingSafeEqual(bufA, bufB)`, which executes in constant time regardless of where a character mismatch occurs.

#### Q12: How are brute-force OTP guessing attacks mitigated?
**Answer:** In `otpService.js`, each pending registration maintains a `verification_attempts` counter. If the submitted OTP does not match, the counter increments. Upon the 5th failed attempt, the `otp_hash` is permanently cleared (`null`), immediately invalidating the code. Subsequent attempts are rejected with HTTP 429 ("Maximum verification attempts exceeded").

#### Q13: What claims are embedded in TaskFlow's JWT, and what is its expiration policy?
**Answer:** The JWT is signed with `jsonwebtoken` using HMAC-SHA256 (`HS256`) and `process.env.JWT_SECRET`. It contains `{ userId, email, role }` and expires in 1 day (`expiresIn: "1d"`).

#### Q14: How does TaskFlow invalidate JWTs before their expiration date when an admin demotes or deactivates a user?
**Answer:** In `backend/src/middleware/authMiddleware.js`, we maintain an in-memory token cache and revocation map (`revokedUsersMap`). When an administrator changes a user's role (`updateUserRole`) or deactivates an account (`updateUserStatus`), the server invokes `invalidateUserTokens(userId)` and `revokeUser(userId)`. On subsequent requests, the middleware intercepts the token and rejects it with HTTP 401 Unauthorized, even if the cryptographic signature is technically valid.

#### Q15: How does TaskFlow prevent replay attacks with password reset tokens?
**Answer:** In `backend/src/services/authService.js`, we maintain a dedicated database table `taskflow.used_password_reset_tokens`. When a reset token is redeemed, its SHA-256 hash is inserted atomically. If a user or attacker attempts to reuse the same token, the database primary key constraint throws a unique collision, rejecting the request with HTTP 400 Bad Request.

#### Q16: How is rate limiting implemented across the application?
**Answer:** In `backend/src/middleware/rateLimiter.js`, we built in-memory sliding-window token bucket rate limiters:
- IP Login Limiter: 30 attempts per 15 minutes per IP.
- Account Login Limiter: 5 consecutive failed attempts per 15 minutes per email.
- Registration Limiter: 10 registration attempts per hour per IP.
- Forgot Password Limiter: 5 attempts per hour per IP.
Exceeded limits return HTTP 429 Too Many Requests with a `Retry-After` header.

#### Q17: What security protections are applied to file uploads?
**Answer:** In `backend/src/middleware/uploadMiddleware.js`:
1. Storage: Disk storage with cryptographic UUID renaming (`<uuid>.<ext>`) to prevent file collisions and directory traversal (`../`).
2. Extension Whitelist/Blacklist: Dangerous executable extensions (`.exe`, `.bat`, `.cmd`, `.sh`, `.php`, `.dll`, `.jar`) are strictly rejected.
3. MIME Type Validation: Enforces allowed types (JPEG, PNG, GIF, PDF, TXT, DOCX, XLSX, PPTX, ZIP).
4. Direct Access Prevention: In `backend/src/app.js`, direct static routing to `/uploads` is intercepted and blocked with HTTP 403 Forbidden. Files can only be streamed via `GET /api/attachments/:id/download`, which checks project membership.

#### Q18: What is IDOR, and how does TaskFlow prevent it?
**Answer:** Insecure Direct Object Reference (IDOR) occurs when an application exposes a direct database identifier (like `projectId` or `taskId`) and trusts client requests without checking ownership. TaskFlow prevents IDOR by requiring that every controller pass both the target resource ID and `req.user.id` to the service layer. The service layer executes a join against `workspace_members` or `project_members`. If the user does not belong to that entity, the operation is aborted with HTTP 403 Forbidden.

---

## SECTION 3: DATABASE DESIGN & PRISMA ORM (Q19 – Q28)

#### Q19: Why did you choose PostgreSQL over a NoSQL database like MongoDB?
**Answer:** Project management tools require strong relational guarantees: tasks belong to projects, tasks have subtasks, tasks depend on other tasks, and users have role memberships. Modeling dependencies, critical paths, and foreign key cascades (`ON DELETE CASCADE`) in MongoDB requires manual application-level referential integrity checks that are prone to orphaned records. PostgreSQL provides native ACID transactions, composite primary keys (`[task_id, depends_on_task_id]`), check constraints, and battle-tested foreign keys.

#### Q20: What is Prisma ORM, and how does it generate client queries?
**Answer:** Prisma is a next-generation Node.js/TypeScript ORM. It uses a declarative modeling schema (`backend/prisma/schema.prisma`). Running `npx prisma generate` compiles the schema into an optimized query engine client located in `backend/generated/prisma`. Prisma handles parameterized SQL queries automatically, eliminating SQL injection vulnerabilities.

#### Q21: Explain the schema design of the `task_dependencies` table.
**Answer:** `task_dependencies` is a self-referential many-to-many join table on the `tasks` table. It has a composite primary key `[task_id, depends_on_task_id]`.
- `task_id` is the downstream / dependent task (the task that is blocked).
- `depends_on_task_id` is the upstream / prerequisite task (the task that blocks).
Both columns have foreign keys referencing `tasks(id)` with `ON DELETE CASCADE`.

#### Q22: What happens in the database when a project is deleted?
**Answer:** Foreign keys referencing `projects(id)` in `tasks`, `project_members`, `attachments`, `decisions`, `risks`, `channels`, and `project_health_snapshots` are defined with `onDelete: Cascade`. Deleting a project automatically purges its tasks, attachments, and dependencies in a single atomic database operation.

#### Q23: Why do `projects` and `tasks` have `is_archived` flags instead of hard deletes?
**Answer:** In professional engineering management, audit trails and historical replays are critical. Hard-deleting projects or tasks breaks historical velocity calculations, removes activity log targets, and invalidates past decisions. By setting `is_archived = true`, the item is hidden from active operational views while preserving historical data integrity.

#### Q24: How does TaskFlow enforce date integrity at the database layer?
**Answer:** In addition to Express-level route validation, PostgreSQL check constraints are enforced:
- `chk_project_dates`: `start_date <= end_date`.
- `chk_task_dates`: `start_date <= due_date`.
If a query attempts to insert `start_date > due_date`, PostgreSQL aborts the transaction with code `23514`, which `app.js` translates to HTTP 400 Bad Request.

#### Q25: What is the purpose of the `dedupe_key` column in `taskflow.notifications`?
**Answer:** When automated background processes run (like the daily approaching due date sweeper or intelligence alerts), they can easily flood a user with duplicate alerts. The `dedupe_key` column is bound by a unique composite index `[user_id, dedupe_key]`. If the sweeper attempts to insert a second notification with the same dedupe key (e.g. `due-24h-task-<uuid>`), PostgreSQL rejects the duplicate write, guaranteeing exactly-once notification delivery.

#### Q26: What database migration files exist in the repository?
**Answer:** Three official SQL migrations exist in `backend/prisma/migrations/`:
1. `001_create_chat_models.sql`: Adds tables for channels, channel members, conversations, conversation members, messages, reactions, read receipts, and pins.
2. `002_add_onboarding_to_users.sql`: Adds `has_completed_onboarding` boolean column with default false and updates existing users to true.
3. `003_create_pending_registrations.sql`: Creates the staging table for OTP registrations with indexes on email and expiry.

#### Q27: How does TaskFlow optimize database query performance on large task lists?
**Answer:**
1. Composite indexing: `idx_tasks_project_active_created` on `(project_id, is_archived, created_at DESC)` and `idx_tasks_assigned_active_due` on `(assigned_to, is_archived, due_date ASC)`.
2. Safe pagination: Task queries require `page` and `limit` parameters, enforcing `limit <= 100` to prevent memory buffer exhaustion.
3. Field selection: Queries use Prisma `select` blocks to fetch only needed columns, avoiding transfer of large description or metadata blobs.

#### Q28: How does TaskFlow handle transactions?
**Answer:** TaskFlow uses `prisma.$transaction(async (tx) => { ... })`. For example, in `otpService.js`, deleting from `pending_registrations` and inserting into `users` is wrapped in a transaction. If user creation fails, the pending registration is not deleted, preventing inconsistent application states.

---

## SECTION 4: TASK DEPENDENCIES & GRAPH INTELLIGENCE (Q29 – Q38)

#### Q29: What graph data structure is used to represent task dependencies?
**Answer:** Project tasks and dependencies are modeled as a **Directed Acyclic Graph (DAG)**, represented in memory using an **Adjacency List** and an **In-Degree Map** (`backend/src/services/criticalPathService.js`). Nodes represent active tasks, and directed edges $(u \rightarrow v)$ represent dependency constraints where task $u$ must finish before task $v$ can start.

#### Q30: How does TaskFlow prevent circular dependencies? Explain the algorithm used.
**Answer:** Before inserting a dependency edge $B \rightarrow A$, `taskDependencyService.js` simulates the edge in memory and executes **Kahn's Topological Sort Algorithm** (`detectCycles` in `criticalPathService.js`):
1. Compute the in-degree (number of incoming prerequisite edges) for every node.
2. Enqueue all nodes with in-degree equal to 0.
3. While the queue is non-empty, dequeue node $u$, append it to the topological order, and decrement the in-degree of all successors $v$. If $v$'s in-degree becomes 0, enqueue $v$.
4. If the number of visited nodes is less than the total number of active nodes, a cycle exists. The candidate edge is rejected with HTTP 409 Conflict (`DEPENDENCY_CYCLE`).

#### Q31: What is the Critical Path Method (CPM), and how does TaskFlow calculate it?
**Answer:** The Critical Path is the sequence of dependent tasks that determines the minimum total duration of the project. A delay in any critical path task delays the entire project completion date. TaskFlow computes CPM in two passes:
1. **Forward Pass:** Computes Early Start ($ES$) and Early Finish ($EF$):
   $$ES = \max(\text{Predecessor } EF), \quad EF = ES + \text{durationDays}$$
2. **Backward Pass:** Computes Late Finish ($LF$) and Late Start ($LS$):
   $$LF = \min(\text{Successor } LS), \quad LS = LF - \text{durationDays}$$
3. **Total Float / Slack:**
   $$\text{Slack} = LS - ES = LF - EF$$
   Any task with $\text{Slack} = 0$ is a critical task.

#### Q32: How is task duration in days calculated in `criticalPathService.js`?
**Answer:** Task duration is resolved deterministically using a 3-step hierarchy:
1. If `estimated_hours > 0`: $\text{durationDays} = \max(1, \lceil \text{estimated\_hours} / 8 \rceil)$.
2. Else if `start_date` and `due_date` exist: $\text{durationDays} = \max(1, \text{difference in calendar days})$.
3. Otherwise: Defaults to 1 day.

#### Q33: What is a workflow bottleneck, and how does TaskFlow detect it?
**Answer:** In `backend/src/services/bottleneckService.js`, a bottleneck is a task that impedes downstream progress. TaskFlow calculates a composite bottleneck score based on:
1. **Out-degree Centrality:** Number of direct and indirect downstream tasks waiting on this task.
2. **Critical Path Position:** Whether the task is on the critical path ($\text{Slack} = 0$).
3. **Schedule Status:** Whether the task is overdue or lagging behind its estimated duration.
Tasks are categorized as `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` bottlenecks.

#### Q34: How is Project Health calculated? What are the 7 dimensions?
**Answer:** In `backend/src/services/projectHealthService.js`, project health is a weighted composite score (0–100) calculated across 7 dimensions:
1. Schedule Health (Weight: 20%) — penalizes schedule drift and overdue tasks.
2. Critical Path Health (Weight: 20%) — penalizes overdue critical tasks.
3. Execution Health (Weight: 15%) — evaluates completion ratio and blocked tasks.
4. Bottleneck Health (Weight: 15%) — penalizes critical and high bottlenecks.
5. Dependency Health (Weight: 10%) — evaluates graph structure and cycle freedom.
6. Workload Health (Weight: 10%) — checks for unassigned critical tasks and workload concentration > 60%.
7. Risk Register Health (Weight: 10%) — penalizes open critical/high risks.
*Invariant:* If a circular cycle is detected, the health score is strictly capped at 40 (`CRITICAL`).

#### Q35: What is the Dependency Shockwave Engine?
**Answer:** In `backend/src/services/dependencyShockwaveService.js`, the Shockwave Engine simulates what happens when a task experiences a disruption (e.g. 3-day delay or effort surge). It traverses downstream dependency paths, evaluates **Buffer Absorption** (whether downstream tasks have enough slack to absorb the delay without moving the project milestone), and calculates the blast radius of affected tasks and assignees. It is 100% read-only and causes zero database mutations.

#### Q36: What is the Project Chaos Lab?
**Answer:** In `backend/src/services/projectChaosService.js`, the Chaos Lab performs automated failure injections against an in-memory clone of the project graph (simulating resource dropouts, cascading task delays, and scope surges) to determine the project's breaking threshold and identify the most vulnerable component.

#### Q37: What is the Counterfactual Time Machine?
**Answer:** In `backend/src/services/counterfactualTimeMachineService.js`, the Time Machine answers retrospective "what-if" questions: *"What would have happened if we had finished Task 1 two days earlier?"* It forks the historical project state at that point in time, executes alternative branch simulations, and compares the counterfactual milestone with the actual milestone.

#### Q38: What is Monte Carlo milestone forecasting?
**Answer:** In `backend/src/services/monteCarloForecastService.js`, the engine runs 1,000 probabilistic simulation iterations. Instead of treating task durations as fixed, it models durations using triangular probability distributions (Optimistic, Most Likely, Pessimistic) to compute confidence intervals: $P_{50}$ (50% likelihood date), $P_{80}$, and $P_{95}$.

---

## SECTION 5: COMMAND CENTER, APPROVALS & QUACKIE (Q39 – Q48)

#### Q39: What is the Project Command Center, and how does it interpret user commands?
**Answer:** The Command Center (`ProjectCommandCenter.jsx`) is a natural-language operational interface. User queries are sent to `POST /api/intelligence/query`. In `naturalLanguageControlService.js`, the engine uses deterministic pattern-matching rules and token classifiers to map queries to 35+ canonical intents (e.g. `EXPLAIN_HEALTH`, `SIMULATE_TASK_DELAY`, `PREPARE_RECOVERY_PLAN`). It operates 100% deterministically without relying on third-party black-box models.

#### Q40: How does TaskFlow ensure that Command Center actions do not execute without permission?
**Answer:** TaskFlow enforces the **Zero Silent Mutation Invariant**. Mutation intents (such as task reassignments or deadline changes) are never executed immediately. The system generates an action proposal with status `PROPOSED` held in the **Approval Center**. Only when an authorized project manager explicitly reviews the proposal and clicks "Approve" can execution proceed.

#### Q41: Explain the Stale-State Protection mechanism in `intelligenceApprovalService.js`.
**Answer:** When an action proposal is prepared, the backend computes a SHA-256 state hash of the project:
$$\text{baseStateHash} = \text{SHA256}(\text{Project} + \text{Tasks} + \text{Dependencies})$$
When the manager later clicks "Execute", `executeApprovedProposalSafely` fetches the live project state from PostgreSQL and recomputes `currentLiveHash`. If any task was edited, added, or deleted in the interim, `currentLiveHash !== baseStateHash`. The execution is rejected with HTTP 409 Conflict (`PROPOSAL_STALE`), preventing unsafe state overwrites.

#### Q42: What is the Verifiable Evidence Engine?
**Answer:** In `backend/src/services/intelligenceEvidenceService.js`, every explanation generated by the Command Center is accompanied by structured, verifiable telemetry metrics (e.g. `Schedule Drift: +3 days`, `Critical Float: 0 days`, `Active Bottlenecks: 2`). This allows managers to audit the mathematical evidence behind any AI recommendation.

#### Q43: What is Quackie, and what modes does it support?
**Answer:** Quackie is TaskFlow's virtual project assistant dock. It supports 4 conversational modes:
1. **Mentor:** Encouraging, step-by-step guidance for junior team members.
2. **Socratic:** Asks guiding questions to help managers uncover hidden risks.
3. **Executive:** Concise, high-level summaries focusing on milestones and budget.
4. **Tactical:** Detailed technical guidance on blockers, PRs, and critical paths.

#### Q44: How does Quackie access live project information?
**Answer:** In `quackieController.js`, incoming requests trigger context hydration (`getUserAccessibleProjects`, `getUserOverdueTasks`). This data is injected into the prompt context so Quackie answers using verified database records rather than hallucinated facts.

#### Q45: Does Quackie use external AI or local code?
**Answer:** It uses a hybrid architecture with graceful fallback:
- In `backend/src/services/quackieProvider.js`, if `process.env.GEMINI_API_KEY` is present, it calls Google Gemini 1.5 Flash (`generateContent`).
- If no key is configured or the network call fails, it falls back to the deterministic local engine in `quackieService.js`, which generates structured markdown reports using local services.

#### Q46: What happens if a user asks Quackie to delete a project or execute an unsupported action?
**Answer:** Quackie contains a Safety Confirmation Guard. It intercepts destructive or mutation requests, informs the user that silent modifications are prohibited, and routes actionable requests to the Approval Center. Unsupported queries trigger a clarification response with suggested supported operations.

#### Q47: How does the Standup Generator work?
**Answer:** In `backend/src/services/standupService.js`, the generator queries `taskflow.activity_logs` and `tasks` for the target user over the preceding 24 hours. It groups items into:
1. *Completed Yesterday:* Tasks with `status = 'Completed'` and `updated_at >= now - 24h`.
2. *Working on Today:* Active tasks with `status in ['In Progress', 'To Do']`.
3. *Current Blockers:* Incomplete tasks that have unfinished upstream dependencies in `task_dependencies`.

#### Q48: How does the Daily Briefing work?
**Answer:** In `backend/src/services/personalBriefingService.js`, the briefing aggregates today's due tasks, overdue counts, new comments, and recommended next actions based on task priority scores.

---

## SECTION 6: FRONTEND, REACT & STATE MANAGEMENT (Q49 – Q54)

#### Q49: What state management libraries does TaskFlow use, and why did you avoid Redux?
**Answer:** TaskFlow uses native **React Context** (`SocketContext`, `AssistantContext`, `PreferencesContext`) combined with local component state (`useState`, `useCallback`, `useMemo`). We avoided Redux because TaskFlow's state is heavily real-time and domain-partitioned. Pages like Kanban, Tasks, and Chat manage their own server-synchronized data, making a monolithic global Redux store an unnecessary source of boilerplate and rerender overhead.

#### Q50: How does optimistic UI updating work on the Kanban board?
**Answer:** In `frontend/src/pages/kanban/Kanban.jsx`, when `moveTask(taskId, newStatus)` is called:
1. The previous state is saved in `previousTasks`.
2. `setTasks` immediately updates the task's status locally, causing the card to animate into the new column instantly.
3. The API call `updateTaskStatus(taskId, newStatus)` is dispatched.
4. If the call fails (catch block), `setTasks(previousTasks)` restores the previous state, and an error toast is displayed.

#### Q51: How does TaskFlow prevent duplicate event listeners in Socket.IO components?
**Answer:** In `frontend/src/context/SocketContext.jsx`, the custom hook `useSocketEvent(event, callback)` stores the callback in a `useRef`. The socket listener forwards events to `savedHandler.current(data)`. This ensures that component rerenders never attach duplicate socket listeners or cause memory leaks.

#### Q52: What is `useCallback` and `useMemo`, and where are they used in TaskFlow?
**Answer:**
- `useCallback` memoizes function definitions between rerenders. It is used in `Dashboard.jsx`, `Projects.jsx`, and `Kanban.jsx` for data-fetching functions (`loadDashboard`, `loadKanbanData`) to prevent infinite `useEffect` loops.
- `useMemo` memoizes expensive calculated values. It is used in `Dashboard.jsx` to compute task counts and percentages (`statistics`), and in `Reports.jsx` to generate Chart.js datasets only when underlying task arrays change.

#### Q53: How does the frontend handle token expiration or 401 Unauthorized responses?
**Answer:** In `frontend/src/services/api/axios.js`, an Axios response interceptor intercepts any HTTP 401 response. It immediately purges `taskflow_token` and `taskflow_user` from `localStorage` and redirects the browser to `/login`.

#### Q54: How are dialog modals made accessible in TaskFlow?
**Answer:** All modals (e.g. in `Projects.jsx`, `Tasks.jsx`, `Workspaces.jsx`) adhere to WAI-ARIA standards:
- Marked with `role="dialog"` and `aria-modal="true"`.
- Linked to title headings via `aria-labelledby`.
- Global keyboard listener intercepts the `Escape` key to close the dialog.

---

## SECTION 7: TESTING, QUALITY ASSURANCE & DEFECTS (Q55 – Q60)

#### Q55: What is the total test count and pass rate verified in this audit?
**Answer:**
- **Backend automated tests:** **1,054 passed / 1,054 total** across 58 test suites in 35 files.
- **Frontend automated tests:** **45 passed / 45 total** across 8 Vitest test files.
- **Selenium / E2E test journeys:** **17 passed / 17 total** across all critical user journeys.
- **Combined verified test count:** **1,116 passed tests with 100% pass rate**.

#### Q56: How did you test rate limiting without locking yourself out of tests?
**Answer:** Rate limiter middleware files (`rateLimiter.js`) export a `.reset()` method. In test suites like `securityPhase22b.test.js` and `loginRateLimitingPhase76.test.js`, `beforeEach(() => { loginRateLimiter.reset(); })` clears the sliding-window counters between test runs to ensure isolation.

#### Q57: Did you find any mock data in the codebase during this audit?
**Answer:** Yes. We performed a comprehensive audit and identified:
1. Four legacy prototype files in `frontend/src/data/` (`projectMockData.js`, etc.) which are largely unused.
2. A production bug in `Projects.jsx` where manager names were looked up in `projectUsers` (which only contained static IDs), causing blank manager names for real database projects.
3. Catch-block fallback objects in `InterventionImpactPanel.jsx` that display synthetic 82% scores when the API encounters network errors.
We documented the exact lines and created a safe `MOCK_DATA_REMOVAL_PLAN.md` to resolve them.

#### Q58: How do you know that backend test suites do not destroy production database data?
**Answer:** Test suites create isolated test users with prefixed emails (e.g. `test_*@taskflow.dev` or `phase22b_*@taskflow.dev`). Cleanup hooks (`after()`) delete only records matching those explicit test email prefixes. Furthermore, in-memory test stores (`adminService.js`) allow testing administrative math without touching database tables.

#### Q59: What is the difference between Vitest and Node's native test runner?
**Answer:**
- **Vitest:** Runs in the frontend environment with `jsdom`, simulating browser DOM APIs (`window`, `document`, `localStorage`) to test React component rendering, form validation, and user events.
- **Node.js Test Runner (`node:test`):** Lightweight, built-in test runner used for backend integration and unit tests, running directly against Express routes and PostgreSQL with zero external framework dependencies.

#### Q60: How does TaskFlow prevent SQL injection vulnerabilities?
**Answer:** TaskFlow uses Prisma ORM for all database operations. Prisma uses parameterized queries, treating all user inputs as literals rather than executable SQL code. Where raw SQL is used (such as creating the reset token table in `authService.js`), inputs are parameterized with `$1::uuid` or strictly validated.

---

## SECTION 8: LIMITATIONS & FUTURE ENHANCEMENTS (Q61 – Q65)

#### Q61: What are the current architectural limitations of TaskFlow?
**Answer:**
1. **Local Disk Attachment Storage:** Files are stored in `uploads/attachments/`. On ephemeral PaaS instances (like Render free tier), container restarts clear the disk. (Production requires S3 / Cloudinary).
2. **In-Memory Rate Limiting:** Rate limit buckets are stored in Node process memory. If the backend scales horizontally across multiple servers, a centralized Redis store is required.
3. **Optional External LLM:** Quackie runs on deterministic algorithms unless a `GEMINI_API_KEY` is configured.

#### Q62: If your application scales to 100,000 active users, where will the first bottleneck appear, and how will you resolve it?
**Answer:** The first bottleneck would appear in **PostgreSQL connection exhaustion** and **WebSocket connection memory**. To resolve it:
1. Enable a connection pooler like **PgBouncer** (already supported via Neon serverless pooling) to multiplex database queries.
2. Implement **Redis Adapter for Socket.IO** (`@socket.io/redis-adapter`) to distribute real-time event broadcasting across multiple stateless Express nodes.
3. Move in-memory rate limiters and JWT revocation maps to a shared **Redis cluster**.

#### Q63: Why does `Projects.jsx` have a bug displaying manager names, and how will you fix it?
**Answer:** In early development, `Projects.jsx` imported `projectUsers` from a mock data file. When the backend was connected, `project.managerId` became a PostgreSQL UUID. The helper `getUser(id)` searched `projectUsers` (which only contained dummy string IDs) and returned `undefined`. The fix is simple: load members from `getWorkspaceMembers(workspaceId)` and perform the lookup against the live member list.

#### Q64: What future improvements are planned for TaskFlow?
**Answer:**
1. Cloud object storage integration (AWS S3) with pre-signed upload URLs.
2. Gantt chart visualization with interactive drag-and-drop dependency linking.
3. Multi-factor authentication (TOTP via Google Authenticator).
4. Webhook integrations for GitHub / GitLab pull requests and Jira issue sync.

#### Q65: What was your team's division of responsibilities, and how did you collaborate?
**Answer:** Our three-member team collaborated using Git feature branching (`feature/*`) merged into `develop` with code reviews:
- **Deepika Reddy:** Backend architecture, authentication lifecycle, OTP verification, security rate limiters, database schema migrations, and Command Center intent engine.
- **Geethika Sai:** Frontend React SPA development, Kanban drag-and-drop, task management workflows, subtasks, and real-time Socket.IO collaboration hooks.
- **Aria Patel:** Analytical intelligence engines (Critical Path Method, Kahn's algorithm, Bottleneck detection, Dependency Shockwave), project health scorecard, automated test suites, and deployment to Vercel and Render.
All three members cross-reviewed modules to ensure complete end-to-end understanding.
