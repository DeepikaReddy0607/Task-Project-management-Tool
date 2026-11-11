# TASKFLOW — COMPLETE TECHNICAL ARCHITECTURE SPECIFICATION

**System Architecture & Technical Reference Guide**  
**Repository:** `Task-Project-management-Tool`  
**Revision:** 2.4.0 (Production Verified)  
**Date:** November 11, 2026  

---

## 1. HIGH-LEVEL SYSTEM ARCHITECTURE

TaskFlow is architectured as a multi-tier, decoupled client-server web platform optimized for low latency, strict multi-tenant isolation, real-time collaboration, and deterministic algorithmic analysis.

```mermaid
flowchart TD
    subgraph Client ["Client Tier (Browser)"]
        SPA["React 19 Single Page App (Vite 8)"]
        Context["Context Providers (Auth, Socket, Preferences, Assistant)"]
        Axios["Axios Interceptor (Bearer JWT + Auto 401 Logout)"]
        SocketC["Socket.IO Client (Auto Reconnect & Room Sync)"]
        SPA --> Context
        Context --> Axios
        Context --> SocketC
    end

    subgraph Network ["Network & Edge Ingress"]
        VercelEdge["Vercel Edge Network (SPA Static Host)"]
        RenderEdge["Render Reverse Proxy (TLS Termination, trust proxy: 1)"]
    end

    subgraph Backend ["Application Tier (Node.js + Express 5)"]
        CORS["Strict CORS Validation (cors.js)"]
        RateLimiter["Sliding-Window Rate Limiters (rateLimiter.js)"]
        AuthMid["JWT Verification & Cache (authMiddleware.js)"]
        RBAC["RBAC & Tenant Guards (requireAdmin, projectAuthorization)"]
        Router["Express API Router (21 Route Files)"]
        Controllers["Controllers Layer (21 Controllers)"]
        Services["Domain & Intelligence Services (45+ Services)"]
        SocketS["Socket.IO Server (Room Isolation & IPC Relay)"]
        Cron["Node-Cron Scheduler (Approaching Due Date Sweeper)"]

        CORS --> RateLimiter --> AuthMid --> RBAC --> Router --> Controllers --> Services
        SocketS <--> Services
        Cron --> Services
    end

    subgraph Storage ["Persistence & Data Tier"]
        Prisma["Prisma 7 ORM (PgPool Connection Pooling)"]
        PG[("PostgreSQL 16 (taskflow Database Schema)")]
        Disk["Local Attachment Storage (uploads/attachments/)"]
        Prisma --> PG
        Services --> Prisma
        Services --> Disk
    end

    SPA -. Served via .-> VercelEdge
    Axios --> RenderEdge --> CORS
    SocketC <--> RenderEdge <--> SocketS
```

---

## 2. FRONTEND ARCHITECTURE

The frontend is constructed using **React 19**, **Vite 8**, and **Tailwind CSS 4**:

### Directory Structure & Responsibilities
- `frontend/src/pages/`: Page-level components corresponding to application routes (`Dashboard.jsx`, `Projects.jsx`, `Tasks.jsx`, `Kanban.jsx`, `Calendar.jsx`, `Reports.jsx`, `Productivity.jsx`, `Chat.jsx`, `WhatIf.jsx`, `ProjectCommandCenterPage.jsx`, `CoordinationPage.jsx`, `AdminDashboardPage.jsx`).
- `frontend/src/components/`: Modular UI widgets divided by functional domain (`activity/`, `admin/`, `assistant/`, `auth/`, `brand/`, `coordination/`, `dashboard/`, `decisions/`, `files/`, `intelligence/`, `kanban/`, `notifications/`, `onboarding/`, `projects/`, `search/`, `settings/`, `tasks/`, `ui/`).
- `frontend/src/layouts/`: Layout shells (`MainLayout.jsx`, `AuthLayout.jsx`) providing uniform sidebar navigation, top bar controls, user profile menus, and Quackie floating assistant docks.
- `frontend/src/context/`: Global reactive state providers:
  - `SocketContext.jsx`: Manages the lifecycle of the Socket.IO connection, active room subscriptions, and reconnection event handling.
  - `AssistantContext.jsx`: Manages Quackie assistant drawer open/close states, active conversation histories, and page context hydration (`setPageContext`).
  - `PreferencesContext.jsx`: Manages user interface settings (theme switching, interface density, quiet hours).
- `frontend/src/services/api/`: Domain-specific API client wrappers around a preconfigured Axios instance (`axios.js`).

### Performance & Bundle Optimization
- **Code-Splitting via `React.lazy` & `Suspense`:** In `frontend/src/routes/AppRoutes.jsx`, all primary routes are dynamically loaded (`lazy(() => import(...))`). This reduces the initial bundle size, allowing the initial login page to load in under 200ms.
- **Client Routing Rewrites:** `vercel.json` contains a rewrite rule routing all path patterns (`/(.*)`) to `/index.html` to prevent 404 errors during client-side deep linking and page refreshes.

---

## 3. BACKEND ARCHITECTURE

The backend is built on **Express 5** and **Node.js**:

### Middleware Pipeline Execution Order
1. `app.set("trust proxy", 1)`: Enables secure IP resolution (`req.ip`) behind Render/Cloudflare proxies without trusting arbitrary client spoofing headers.
2. `cors(getCorsOptions())`: Dynamic origin validator inspecting `ALLOWED_ORIGINS` and `FRONTEND_URL`. Rejects unauthorized origins with HTTP 403 Forbidden.
3. `express.json()`: Parses incoming JSON payloads up to configured body limits.
4. Direct Static `/uploads` Blocker: Explicitly intercepts any direct request to `/uploads` and returns HTTP 403 Forbidden to protect multi-tenant file attachments.
5. In-Memory Sliding-Window Rate Limiters:
   - `loginRateLimiter`: 30 attempts per 15 minutes per IP.
   - `loginAccountRateLimiter`: 5 failed attempts per 15 minutes per email.
   - `registerRateLimiter`: 10 registration requests per hour per IP.
   - `forgotPasswordRateLimiter`: 5 reset requests per hour per IP.
6. Authentication Middleware (`authMiddleware.js`): Verifies JWT signatures, cross-references token IDs against the active user cache and in-memory revocation list, and populates `req.user`.
7. Authorization Guards:
   - `requireAdmin.js`: Rejects requests from non-Admin users on `/api/admin/*` routes with HTTP 403.
   - `canManageProject` / `verifyProjectAccess`: Live database queries checking `workspace_members` and `project_members` tables.
8. Centralized Error Handling Middleware: Catches PostgreSQL/Prisma error codes (`P2002` duplicate unique key $\rightarrow$ 409 Conflict, `23514` check constraint violation $\rightarrow$ 400 Bad Request, `P2025` record not found $\rightarrow$ 404 Not Found) without exposing raw SQL or stack traces.

---

## 4. MERMAID ARCHITECTURAL WORKFLOWS

### Diagram 1: Registration and Email OTP Verification Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Reg as Register.jsx
    participant AuthRouter as authRoutes.js
    participant AuthCtrl as authController.js
    participant OTPService as otpService.js
    participant MailService as mailService.js
    participant DB as PostgreSQL (taskflow)
    participant Verify as VerifyOtp.jsx

    User->>Reg: Enters Name, Email, Password, Phone
    Reg->>AuthRouter: POST /api/auth/register
    AuthRouter->>AuthCtrl: register(req, res)
    AuthCtrl->>OTPService: initiateRegistration(data)
    OTPService->>DB: Check if email exists in users table
    Note over OTPService,DB: Fails with 409 if permanent user exists
    OTPService->>OTPService: Hash password (bcrypt rounds: 10)
    OTPService->>OTPService: Generate 6-digit OTP & keyed HMAC-SHA256
    OTPService->>DB: Upsert pending_registrations record
    OTPService->>MailService: sendRegistrationOtpEmail(email, otp, name)
    MailService-->>User: Delivers OTP email via Gmail SMTP
    AuthCtrl-->>Reg: HTTP 200 { message: "Verification code sent", email }
    Reg->>Verify: Navigate with { state: { email } }
    User->>Verify: Enters 6-digit OTP
    Verify->>AuthRouter: POST /api/auth/verify-otp
    AuthRouter->>AuthCtrl: verifyRegistrationOtp(req, res)
    AuthCtrl->>OTPService: verifyOtpAndCreateUser({ email, otp })
    OTPService->>DB: Lookup pending_registrations
    OTPService->>OTPService: Timing-safe HMAC comparison & expiry check
    OTPService->>DB: BEGIN TRANSACTION
    OTPService->>DB: DELETE FROM pending_registrations WHERE email = email
    OTPService->>DB: INSERT INTO users (has_completed_onboarding: false)
    OTPService->>DB: COMMIT TRANSACTION
    AuthCtrl-->>Verify: HTTP 201 { success: true, message: "Email verified" }
    Verify->>User: Redirects to /login
```

---

### Diagram 2: Login and Authorization Lifecycle
```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Login as Login.jsx
    participant AuthCtrl as authController.js
    participant AuthService as authService.js
    participant DB as PostgreSQL (taskflow)
    participant ProtectedRoute as ProtectedRoute.jsx
    participant Dashboard as Dashboard.jsx

    User->>Login: Submits email & password
    Login->>AuthCtrl: POST /api/auth/login
    AuthCtrl->>AuthService: loginUser(email, password)
    AuthService->>DB: Find unique user by email
    Note over AuthService,DB: Checks pending_registrations if user missing
    AuthService->>AuthService: Compare password hash with bcrypt
    AuthService->>DB: Load active workspace memberships
    AuthService->>AuthService: Sign JWT (userId, email, role, 1d expiry)
    AuthService->>DB: Batch log LOGIN event in activity_logs
    AuthCtrl-->>Login: HTTP 200 { token, user: { id, role, hasCompletedOnboarding } }
    Login->>Login: Store token & user in localStorage
    Login->>ProtectedRoute: Navigate to /
    ProtectedRoute->>ProtectedRoute: Inspect token & onboarding status
    alt First Time User (hasCompletedOnboarding == false)
        ProtectedRoute->>User: Redirect to /onboarding
    else Completed Onboarding (hasCompletedOnboarding == true)
        ProtectedRoute->>Dashboard: Render Dashboard
    end
```

---

### Diagram 3: Workspace, Project, and Task Lifecycle
```mermaid
stateDiagram-v2
    [*] --> WorkspaceCreated: POST /api/workspaces (Creator becomes Owner)
    WorkspaceCreated --> MemberInvited: POST /api/workspaces/:id/members (via Search)
    MemberInvited --> ProjectCreated: POST /api/projects (Owner/Admin only)

    state ProjectCreated {
        [*] --> Planning
        Planning --> InProgress: Start work
        InProgress --> AtRisk: Critical path slip detected
        AtRisk --> InProgress: Recovery plan approved
        InProgress --> Complete: All tasks completed
        Complete --> Archived: PATCH /api/projects/:id/archive
        Archived --> InProgress: PATCH /api/projects/:id/restore
    }

    state TaskLifecycle {
        [*] --> Backlog: Task Created
        Backlog --> ToDo: Prioritized
        ToDo --> InProgress: Assigned member begins work
        InProgress --> Review: Work submitted for review
        Review --> Completed: Approved & prerequisites verified
        Completed --> [*]
    }
```

---

### Diagram 4: Task Dependency & Cycle Detection Workflow
```mermaid
sequenceDiagram
    autonumber
    actor User as Team Member
    participant TaskUI as TaskDependencySection.jsx
    participant DepCtrl as taskDependencyController.js
    participant DepService as taskDependencyService.js
    participant CPM as criticalPathService.js
    participant DB as PostgreSQL (task_dependencies)
    participant Socket as Socket.IO Broadcast

    User->>TaskUI: Links Task A to depend on Task B (B -> A)
    TaskUI->>DepCtrl: POST /api/tasks/:taskId/dependencies { dependsOnTaskId }
    DepCtrl->>DepService: createDependency({ taskId, dependsOnTaskId, userId })
    DepService->>DepService: Validation: Prevent self-dependency (A != B)
    DepService->>DB: Verify both tasks exist, are active, and share project_id
    DepService->>DB: Fetch all existing project dependencies
    DepService->>DepService: In-memory simulation: candidate edge B -> A added
    DepService->>CPM: buildDependencyGraph(tasks, simulatedDependencies)
    DepService->>CPM: detectCycles(graph) (Kahn's Topological Sort)
    alt Cycle Detected (Topological sort incomplete)
        CPM-->>DepService: { hasCycle: true, cycleNodes: [...] }
        DepService-->>DepCtrl: Throw HTTP 409 "Circular dependency detected"
        DepCtrl-->>TaskUI: HTTP 409 Error Banner
    else Acyclic DAG Validated
        CPM-->>DepService: { hasCycle: false, topologicalOrder: [...] }
        DepService->>DB: INSERT INTO task_dependencies (task_id, depends_on_task_id)
        DepService->>DepService: Invalidate Shockwave & Intelligence Caches
        DepService->>Socket: emitDependencyRealtimeEvent("dependency.created")
        Socket-->>User: Realtime UI update
        DepCtrl-->>TaskUI: HTTP 201 Created
    end
```

---

### Diagram 5: Command Center Request & Stale-State Protected Execution Flow
```mermaid
sequenceDiagram
    autonumber
    actor Manager as Project Manager
    participant CC as ProjectCommandCenter.jsx
    participant IntelCtrl as intelligenceController.js
    participant NLControl as naturalLanguageControlService.js
    participant ApprvService as intelligenceApprovalService.js
    participant SimService as scenarioSimulationService.js
    participant ApprvCenter as ApprovalCenter.jsx
    participant ExecService as replanningExecutionService.js
    participant DB as PostgreSQL (Prisma)

    Manager->>CC: Enters command: "What if we reassign API Testing to Bob?"
    CC->>IntelCtrl: POST /api/intelligence/query { query, projectId }
    IntelCtrl->>NLControl: parseNaturalLanguageQuery(query)
    NLControl-->>IntelCtrl: Intent: SIMULATE_RESOURCE_CHANGE
    IntelCtrl->>SimService: runScenarioSimulation(projectId, mutations)
    SimService-->>IntelCtrl: Telemetry: Schedule recovery +2d, Health +9pts
    IntelCtrl-->>CC: Returns explanation, findings, and verifiable evidence

    Manager->>CC: Clicks "Prepare Action Proposal"
    CC->>IntelCtrl: POST /api/intelligence/prepare-proposal
    IntelCtrl->>ApprvService: prepareActionProposal({ projectId, actionType, entities })
    ApprvService->>DB: Load live tasks & dependencies
    ApprvService->>ApprvService: Calculate baseStateHash = SHA256(Project + Tasks + Deps)
    ApprvService->>ApprvService: Store proposal in Approval Store (status: PROPOSED)
    IntelCtrl-->>CC: HTTP 200 { proposalId, requiresApproval: true }

    Manager->>ApprvCenter: Opens Approval Center
    Manager->>ApprvCenter: Reviews impact vector & clicks "Approve Proposal"
    ApprvCenter->>IntelCtrl: POST /api/intelligence/proposals/:id/approve
    IntelCtrl->>ApprvService: Status transitioned to APPROVED

    Manager->>ApprvCenter: Clicks "Execute Approved Changes"
    ApprvCenter->>IntelCtrl: POST /api/intelligence/execute-action { proposalId }
    IntelCtrl->>ExecService: executeApprovedProposalSafely({ projectId, proposalId })
    ExecService->>DB: Fetch current live project state
    ExecService->>ExecService: Calculate currentLiveHash = SHA256(live state)
    alt Stale State Detected (currentLiveHash != proposal.baseStateHash)
        ExecService-->>IntelCtrl: Throw HTTP 409 "Project changed since proposal generated"
        IntelCtrl-->>ApprvCenter: HTTP 409 Conflict (Re-planning required)
    else Live Hash Matches
        ExecService->>DB: BEGIN TRANSACTION (Prisma.$transaction)
        ExecService->>DB: Apply task mutations (due dates, assignees, priorities)
        ExecService->>DB: Log audit record in activity_logs
        ExecService->>DB: COMMIT TRANSACTION
        ExecService-->>IntelCtrl: Success { executedAt, status: EXECUTED }
        IntelCtrl-->>ApprvCenter: HTTP 200 Changes Executed Live
    end
```

---

### Diagram 6: Coordination Intelligence Workflow
```mermaid
flowchart TD
    subgraph DataSources ["Live Database Telemetry"]
        Tasks["Active Tasks (tasks)"]
        Activities["Audit Logs (activity_logs)"]
        Risks["Risk Register (risks)"]
        Deps["Dependency Network (task_dependencies)"]
    end

    subgraph CoordinationEngines ["Coordination Intelligence Services"]
        BriefingEng["personalBriefingService.js"]
        StandupEng["standupService.js"]
        StakeholderEng["stakeholderBriefingService.js"]
        RecoveryEng["actionPlanService.js"]
    end

    subgraph OutputPanels ["Coordination Dashboard Panels"]
        DailyPanel["Daily Briefing Panel (Today's Priorities)"]
        StandupPanel["Standup Panel (Yesterday, Today, Blockers)"]
        StakeholderPanel["Stakeholder Panel (Milestone Projections)"]
        RecoveryPanel["Recovery Plan Panel (Pillars & Action Cards)"]
    end

    Tasks & Activities & Risks & Deps --> BriefingEng --> DailyPanel
    Tasks & Activities --> StandupEng --> StandupPanel
    Tasks & Risks & Deps --> StakeholderEng --> StakeholderPanel
    Tasks & Deps --> RecoveryEng --> RecoveryPanel
```

---

### Diagram 7: Quackie Assistant Request Workflow
```mermaid
flowchart TD
    User([User Prompt in Quackie Chat]) --> QuackieCtrl[quackieController.js]
    QuackieCtrl --> ContextHydration[Hydrate User & Active Project Context]
    ContextHydration --> GuardCheck{Is Command a Direct State Mutation?}

    GuardCheck -- Yes --> SafetyGuard[Safety Confirmation Guard: Convert to Action Proposal in Approval Center]
    SafetyGuard --> QuackieResponse([Inform User: Mutation Staged for Approval])

    GuardCheck -- No (Read / Analysis) --> CheckAPIKey{GEMINI_API_KEY Configured in .env?}

    CheckAPIKey -- Yes --> CallGemini[quackieProvider.js: Call Google Gemini 1.5 Flash]
    CallGemini --> GeminiSuccess{Gemini API Response OK?}
    GeminiSuccess -- Yes --> FormatLLMReply[Return AI-Synthesized Response]
    GeminiSuccess -- No (Network / Key Error) --> FallbackDeterministic

    CheckAPIKey -- No --> FallbackDeterministic[Deterministic Engine: quackieService.js]
    FallbackDeterministic --> DomainServices[Route to CPM, Bottlenecks, Health Scorecard, WhatIf]
    DomainServices --> FormatMarkdown[Format Structured Markdown with Icons & Metrics]
    FormatMarkdown --> QuackieResponse
    FormatLLMReply --> QuackieResponse
```

---

## 5. DATABASE ARCHITECTURE & CONSTRAINTS

TaskFlow operates in PostgreSQL 16 within the dedicated `taskflow` schema.
- **ACID Guarantee:** Multi-record operations (such as registration OTP verification and action plan execution) run within `prisma.$transaction()` blocks.
- **Constraints Enforced at DB Level:**
  - `uq_pending_registrations_email`: Unique index on pending registrations.
  - `uq_workspace_member`: Composite unique constraint on `(workspace_id, user_id)`.
  - `uq_project_member`: Composite unique constraint on `(project_id, user_id)`.
  - `pk_task_dependencies`: Composite primary key on `(task_id, depends_on_task_id)`.
  - `uq_workspace_label`: Composite unique constraint on `(workspace_id, name)`.
  - `chk_project_dates`: `start_date <= end_date`.
  - `chk_task_dates`: `start_date <= due_date`.

---

## 6. FILE STORAGE ARCHITECTURE

```
Client Browser (Upload)
      │
      ▼
POST /api/attachments (Multipart Form-Data)
      │
      ├─► Multer Storage Middleware (uploadMiddleware.js)
      │     ├─ Validates MIME type against ALLOWED_MIME_TYPES
      │     ├─ Rejects dangerous file extensions (.exe, .sh, .bat, .php)
      │     └─ Generates UUID filename: <uuid>.<ext>
      │
      ├─► Persisted to local disk: uploads/attachments/<filename>
      │
      └─► Metadata record inserted into PostgreSQL: taskflow.attachments
            (file_name, file_url, file_type, file_size, uploaded_by, project_id, task_id)

Client Browser (Download)
      │
      ▼
GET /api/attachments/:id/download (Authorized Stream)
      │
      ├─► Attachment Controller (attachmentController.js)
      │     ├─ Verifies user JWT authentication
      │     ├─ Checks user workspace & project membership (Tenant Isolation)
      │     └─ Resolves physical disk path: uploads/attachments/<filename>
      │
      └─► Streams file to client with Content-Disposition attachment header
```

---

## 7. REAL-TIME COLLABORATION ARCHITECTURE

Real-time collaboration is powered by **Socket.IO**:
- **Room Isolation:** Clients join specific project and workspace rooms upon opening a view (`socket.emit("join_project", projectId)`).
- **Event Bus:** Domain events are dispatched server-side using `emitRealtimeEvent(payload)` from `backend/src/socket.js`.
- **Clustering Support:** In cluster mode (`CLUSTER_MODE=true`), the primary Node.js process acts as an IPC message relay (`worker.on("message", relayIpcMessage)`), broadcasting socket events across all cluster worker processes.
- **Client Reactive Handling:** Frontend components use the custom hook `useSocketEvent(eventType, callback)` to listen for changes and update local React state optimistically or re-fetch telemetry.

---

## 8. DEPLOYMENT ARCHITECTURE

```mermaid
flowchart LR
    subgraph Internet ["Public Internet"]
        UserBrowser["User Browser"]
    end

    subgraph VercelEdgeHost ["Vercel Edge Platform"]
        VercelDNS["chipmunks-taskflow.vercel.app"]
        VercelSPA["Vite Static Build Output (HTML, JS, CSS, Assets)"]
        VercelRewrite["vercel.json SPA Routing Rewrite"]
        VercelDNS --> VercelRewrite --> VercelSPA
    end

    subgraph RenderPaaS ["Render Cloud PaaS"]
        RenderLB["task-project-management-tool.onrender.com"]
        RenderContainer["Node.js Container (Express 5 + Socket.IO)"]
        DiskMount["Container Local Storage (uploads/attachments/)"]
        RenderLB --> RenderContainer --> DiskMount
    end

    subgraph NeonDB ["Neon Serverless Cloud"]
        NeonProxy["Neon Connection Pooler (PgBouncer)"]
        PostgresInstance[("PostgreSQL 16 Engine (taskflow Schema)")]
        NeonProxy --> PostgresInstance
    end

    UserBrowser -- HTTPS (Initial Page Load) --> VercelDNS
    UserBrowser -- HTTPS REST API Requests --> RenderLB
    UserBrowser -- WSS WebSocket Connection --> RenderLB
    RenderContainer -- TLS Database Connection --> NeonProxy
```
