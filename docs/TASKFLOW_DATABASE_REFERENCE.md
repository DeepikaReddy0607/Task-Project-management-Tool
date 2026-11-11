# TASKFLOW — COMPLETE DATABASE SCHEMA & DATA MODEL REFERENCE

**Database Engine:** PostgreSQL 16  
**ORM:** Prisma 7 (`@prisma/client: ^7.9.1`)  
**Schema Namespace:** `taskflow`  
**Migration Path:** `backend/prisma/migrations/`  
**Schema File:** `backend/prisma/schema.prisma`  
**Verification Date:** November 11, 2026  

---

## 1. DATABASE DESIGN OVERVIEW

The TaskFlow persistence layer is built on a relational architecture in PostgreSQL under the `taskflow` database schema. It enforces:
1. **Strong Referential Integrity:** Foreign keys on all parent-child hierarchies with appropriate cascade (`ON DELETE CASCADE`) or restrict rules (`ON UPDATE NO ACTION`).
2. **Composite Indexes:** Optimized composite indexes on high-throughput query paths (e.g. `(workspace_id, is_archived, created_at DESC)`, `(project_id, status)`).
3. **Database Check Constraints:** Data validation rules (`chk_project_dates`, `chk_task_dates`, `chk_task_priority`, `chk_task_status`) that reject invalid inputs directly at the storage engine level.
4. **Tenant Isolation:** Hierarchical scoping where all tasks, channels, attachments, and activity logs trace back to an authenticated workspace.

---

## 2. COMPLETE PRISMA MODELS INVENTORY

---

### 1. Model: `users`
- **Purpose:** Stores core user accounts, authentication credentials, roles, and profile attributes.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `role_id` (UUID, Foreign Key $\rightarrow$ `roles.id`)
  - `first_name` (VARCHAR 50, required)
  - `last_name` (VARCHAR 50, required)
  - `email` (VARCHAR 255, unique, required)
  - `password_hash` (TEXT, required, bcrypt hash)
  - `phone` (VARCHAR 15, nullable)
  - `profile_picture` (TEXT, nullable)
  - `is_active` (BOOLEAN, default: `true`)
  - `has_completed_onboarding` (BOOLEAN, default: `false`, added in Migration 002)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Foreign Keys & Relations:**
  - `roles`: `fk_users_role` $\rightarrow$ `roles(id)`
  - Outgoing relations: `workspace_members`, `workspaces` (as owner), `project_members`, `projects` (as manager), `tasks` (as creator/assignee), `comments`, `attachments`, `decisions`, `risks`, `notifications`, `activity_logs`, `user_preferences`, `conversations`, `messages`.
- **Indexes:** `idx_users_role_id` on `role_id`, Unique index on `email`.
- **Related Features:** Authentication, Profile, RBAC, Onboarding, Activity Tracking.

---

### 2. Model: `roles`
- **Purpose:** System-level role definitions for global authorization.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `role_name` (VARCHAR 30, unique, e.g. "Admin", "Project Manager", "Team Member")
  - `description` (TEXT, nullable)
- **Foreign Keys & Relations:** Referenced by `users.role_id` and `project_members.role_id`.
- **Related Features:** RBAC, Administration, Project Memberships.

---

### 3. Model: `pending_registrations`
- **Purpose:** Secure staging table for prospective user registrations awaiting 6-digit email OTP verification.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `email` (VARCHAR 255, unique, required)
  - `first_name`, `last_name` (VARCHAR 50)
  - `phone` (VARCHAR 15, nullable)
  - `password_hash` (TEXT, pre-computed bcrypt hash)
  - `otp_hash` (VARCHAR 128, keyed HMAC-SHA256 hash of OTP)
  - `otp_expires_at` (TIMESTAMPTZ, 5-minute expiry)
  - `verification_attempts` (INT, default 0, ceiling 5)
  - `last_resend_at` (TIMESTAMPTZ, nullable)
  - `resend_count` (INT, default 0, ceiling 5)
- **Indexes:**
  - `uq_pending_registrations_email` (UNIQUE on `email`)
  - `idx_pending_registrations_email` on `email`
  - `idx_pending_registrations_expires` on `otp_expires_at`
- **Related Features:** User Registration, Email OTP Verification, Brute-Force Rate Limiting.

---

### 4. Model: `workspaces`
- **Purpose:** Top-level multi-tenant boundary grouping projects, channels, and team members.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `name` (VARCHAR 100, required)
  - `description` (TEXT, nullable)
  - `owner_id` (UUID, Foreign Key $\rightarrow$ `users.id`)
- **Foreign Keys & Relations:**
  - `users`: `fk_workspaces_owner` $\rightarrow$ `users(id)`
  - Outgoing relations: `workspace_members`, `projects`, `labels`, `activity_logs`, `conversations`, `channels`.
- **Related Features:** Workspace Management, Multi-Tenancy, Team Collaboration.

---

### 5. Model: `workspace_members`
- **Purpose:** Join table establishing user membership and permissions within a workspace.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `workspace_id` (UUID, Foreign Key $\rightarrow$ `workspaces.id`, Cascade Delete)
  - `user_id` (UUID, Foreign Key $\rightarrow$ `users.id`, Cascade Delete)
  - `workspace_role` (VARCHAR 30, values: "Owner", "Admin", "Member")
  - `joined_at` (TIMESTAMPTZ)
- **Indexes:**
  - `uq_workspace_member` (UNIQUE composite on `[workspace_id, user_id]`)
  - `idx_workspace_members_user_id` on `user_id`
- **Related Features:** Workspace Authorization, Team Invitations, Access Control.

---

### 6. Model: `projects`
- **Purpose:** Core work container representing projects with timelines, priorities, and assigned managers.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `workspace_id` (UUID, Foreign Key $\rightarrow$ `workspaces.id`, Cascade Delete)
  - `title` (VARCHAR 150, required)
  - `description` (TEXT, nullable)
  - `category` (VARCHAR 50, nullable)
  - `priority` (VARCHAR 20, default: "Medium")
  - `status` (VARCHAR 20, default: "Planning", values: "Planning", "In Progress", "On Track", "At Risk", "Complete")
  - `start_date`, `end_date` (DATE, validated by check constraint `chk_project_dates`)
  - `manager_id` (UUID, Foreign Key $\rightarrow$ `users.id`)
  - `is_archived` (BOOLEAN, default: `false`)
- **Indexes:**
  - `idx_projects_workspace_active` on `(workspace_id, is_archived, created_at DESC)`
- **Related Features:** Project Management, Project Overview, Critical Path, Archival.

---

### 7. Model: `project_members`
- **Purpose:** Assigns users to specific projects with assigned roles (Manager, Contributor).
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `project_id` (UUID, Foreign Key $\rightarrow$ `projects.id`, Cascade Delete)
  - `user_id` (UUID, Foreign Key $\rightarrow$ `users.id`, Cascade Delete)
  - `role_id` (UUID, Foreign Key $\rightarrow$ `roles.id`)
- **Indexes:**
  - `uq_project_member` (UNIQUE composite on `[project_id, user_id]`)
  - `idx_project_members_user_id` on `user_id`
- **Related Features:** Project Access Authorization, Task Assignment Validation.

---

### 8. Model: `tasks`
- **Purpose:** Primary actionable work unit containing scheduling metadata, priority, status, and estimates.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `project_id` (UUID, Foreign Key $\rightarrow$ `projects.id`, Cascade Delete)
  - `title` (VARCHAR 200, required)
  - `description` (TEXT, nullable)
  - `priority` (VARCHAR 20, default: "Medium", values: "Low", "Medium", "High", "Critical")
  - `status` (VARCHAR 20, default: "Backlog", values: "Backlog", "To Do", "In Progress", "Review", "Completed")
  - `start_date`, `due_date` (DATE, validated by check constraint `chk_task_dates`)
  - `estimated_hours` (DECIMAL(6,2), nullable)
  - `assigned_to` (UUID, nullable, Foreign Key $\rightarrow$ `users.id`)
  - `created_by` (UUID, Foreign Key $\rightarrow$ `users.id`)
  - `is_archived` (BOOLEAN, default: `false`)
- **Indexes:**
  - `idx_tasks_assigned_to` on `assigned_to`
  - `idx_tasks_assigned_active_due` on `(assigned_to, is_archived, due_date ASC)`
  - `idx_tasks_created_by` on `created_by`
  - `idx_tasks_due_date` on `due_date`
  - `idx_tasks_project_id` on `project_id`
  - `idx_tasks_project_active_created` on `(project_id, is_archived, created_at DESC)`
  - `idx_tasks_project_status` on `(project_id, status)`
  - `idx_tasks_status` on `status`
- **Related Features:** Task Management, Kanban Board, Calendar, Critical Path Method.

---

### 9. Model: `subtasks`
- **Purpose:** Granular breakdown items belonging to a parent task.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `task_id` (UUID, Foreign Key $\rightarrow$ `tasks.id`, Cascade Delete)
  - `title` (VARCHAR 200, required)
  - `description` (TEXT, nullable)
  - `status` (VARCHAR 20, default: "To Do", values: "To Do", "In Progress", "Done")
  - `due_date` (DATE, nullable)
- **Indexes:**
  - `idx_subtasks_task_id` on `task_id`
  - `idx_subtasks_due_date` on `due_date`
- **Related Features:** Subtask Management, Task Completion Progress.

---

### 10. Model: `task_dependencies`
- **Purpose:** Self-referential join table modeling directed dependency relationships between tasks.
- **Primary Key:** Composite `[task_id, depends_on_task_id]` (`pk_task_dependencies`)
- **Semantics:**
  - `task_id`: Downstream / Dependent Task (blocked).
  - `depends_on_task_id`: Upstream / Prerequisite Task (blocks).
- **Foreign Keys:**
  - `task_id` $\rightarrow$ `tasks.id` (Cascade Delete)
  - `depends_on_task_id` $\rightarrow$ `tasks.id` (Cascade Delete)
- **Indexes:**
  - `idx_task_dependencies_depends_on` on `depends_on_task_id`
- **Related Features:** Dependency Graph, Circular Dependency Prevention, Critical Path Method, Dependency Shockwave.

---

### 11. Model: `attachments`
- **Purpose:** Metadata records linking physical uploaded files to projects or tasks.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `task_id` (UUID, nullable, Foreign Key $\rightarrow$ `tasks.id`, Cascade Delete)
  - `project_id` (UUID, nullable, Foreign Key $\rightarrow$ `projects.id`, Cascade Delete)
  - `uploaded_by` (UUID, Foreign Key $\rightarrow$ `users.id`)
  - `file_name` (VARCHAR 255, original filename)
  - `file_url` (TEXT, relative physical storage path)
  - `file_type` (VARCHAR 100, MIME type)
  - `file_size` (BIGINT, file size in bytes)
- **Indexes:**
  - `idx_attachments_project_id` on `project_id`
  - `idx_attachments_task_id` on `task_id`
  - `idx_attachments_uploaded_by` on `uploaded_by`
- **Related Features:** File Management, Document Attachments, Authorized Streaming Downloads.

---

### 12. Model: `comments`
- **Purpose:** Threaded discussions and notes attached to individual tasks.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `task_id` (UUID, Foreign Key $\rightarrow$ `tasks.id`, Cascade Delete)
  - `user_id` (UUID, Foreign Key $\rightarrow$ `users.id`)
  - `content` (TEXT, required)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Indexes:**
  - `idx_comments_task_id` on `task_id`
  - `idx_comments_user_id` on `user_id`
  - `idx_comments_created_at` on `created_at`
- **Related Features:** Task Comments, Team Collaboration, Mention Notifications.

---

### 13. Model: `risks`
- **Purpose:** Risk register records tracking project vulnerabilities, severity, probability, and mitigation plans.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `project_id` (UUID, Foreign Key $\rightarrow$ `projects.id`, Cascade Delete)
  - `title` (VARCHAR 200, required)
  - `description` (TEXT, nullable)
  - `severity` (VARCHAR 20, default: "Medium", values: "Low", "Medium", "High", "Critical")
  - `probability` (VARCHAR 20, default: "Medium", values: "Low", "Medium", "High")
  - `owner_id` (UUID, nullable, Foreign Key $\rightarrow$ `users.id`)
  - `mitigation_plan` (TEXT, nullable)
  - `status` (VARCHAR 20, default: "Open", values: "Open", "Closed")
- **Indexes:**
  - `idx_risks_project_id` on `project_id`
  - `idx_risks_owner_id` on `owner_id`
  - `idx_risks_status` on `status`
- **Related Features:** Risk Management, Project Health Scorecard, Pre-Mortem Analysis.

---

### 14. Model: `decisions`
- **Purpose:** Architectural and strategic decision log tracking choices, context, rationales, and statuses.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `project_id` (UUID, Foreign Key $\rightarrow$ `projects.id`, Cascade Delete)
  - `decision` (TEXT, required choice description)
  - `reason` (TEXT, architectural justification)
  - `decision_date` (DATE)
  - `owner_id` (UUID, nullable, Foreign Key $\rightarrow$ `users.id`)
  - `status` (VARCHAR 20, default: "Proposed", values: "Proposed", "Approved", "Superseded")
- **Indexes:**
  - `idx_decisions_project_id` on `project_id`
  - `idx_decisions_date` on `decision_date`
  - `idx_decisions_status` on `status`
- **Related Features:** Decision Log, Project Memory, Command Center Telemetry.

---

### 15. Model: `notifications`
- **Purpose:** User-directed alert notifications with deduplication keys and delivery tracking.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `user_id` (UUID, Foreign Key $\rightarrow$ `users.id`, Cascade Delete)
  - `type` (VARCHAR 50, e.g. "TASK_ASSIGNMENT", "DEADLINE_REMINDER", "COMMENT_ADDED")
  - `title` (VARCHAR 200, nullable)
  - `message` (TEXT, required)
  - `severity` (VARCHAR 20, default: "INFO", values: "INFO", "WARNING", "CRITICAL")
  - `is_read` (BOOLEAN, default: `false`)
  - `project_id`, `task_id` (UUID, nullable foreign keys)
  - `dedupe_key` (VARCHAR 255, nullable unique identifier per user)
- **Indexes:**
  - `idx_notifications_dedupe_unique` (UNIQUE composite on `[user_id, dedupe_key]`)
  - `idx_notifications_user_created` on `(user_id, created_at DESC)`
  - `idx_notifications_unread` on `(user_id, is_read)`
- **Related Features:** In-App Notifications, Email Alerts, Due Date Sweeper.

---

### 16. Model: `activity_logs`
- **Purpose:** Immutable audit events capturing operational changes across workspaces.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `workspace_id` (UUID, Foreign Key $\rightarrow$ `workspaces.id`, Cascade Delete)
  - `user_id` (UUID, nullable, Foreign Key $\rightarrow$ `users.id`)
  - `action_type` (VARCHAR 50, e.g. "CREATE", "UPDATE", "STATUS_CHANGE", "LOGIN")
  - `entity_type` (VARCHAR 30, e.g. "TASK", "PROJECT", "WORKSPACE", "USER")
  - `entity_id` (UUID, nullable)
  - `description` (TEXT, human-readable summary)
  - `created_at` (TIMESTAMPTZ)
- **Indexes:**
  - `idx_activity_logs_created_at` on `created_at`
  - `idx_activity_logs_workspace_id` on `workspace_id`
  - `idx_activity_logs_entity` on `(entity_type, entity_id)`
- **Related Features:** Activity Timeline, Administrative Audit Feeds, Replay History.

---

### 17. Model: `project_health_snapshots`
- **Purpose:** Periodic captures of calculated multi-dimensional project health scores and state hashes.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `project_id` (UUID, Foreign Key $\rightarrow$ `projects.id`, Cascade Delete)
  - `health_score` (INT, 0–100)
  - `health_status` (VARCHAR 20, "HEALTHY", "WATCH", "AT_RISK", "CRITICAL")
  - Dimensional breakdown scores: `schedule_score`, `critical_path_score`, `execution_score`, `bottleneck_score`, `dependency_score`, `workload_score`, `risk_score` (INT)
  - `state_hash` (VARCHAR 64, SHA-256 state hash)
  - `metadata` (JSONB, raw breakdown data)
- **Indexes:**
  - `idx_health_snapshots_project_captured` on `(project_id, captured_at)`
- **Related Features:** Project Health History, Trend Analysis, X-Ray Diagnostic.

---

### 18. Model: `user_preferences`
- **Purpose:** Granular configuration of UI appearance, notification channels, and quiet hours.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields:**
  - `user_id` (UUID, unique, Foreign Key $\rightarrow$ `users.id`, Cascade Delete)
  - `theme` (VARCHAR 20, default: "system", values: "light", "dark", "system")
  - `interface_density` (VARCHAR 20, default: "comfortable")
  - `quiet_hours_enabled` (BOOLEAN, default: `false`)
  - `quiet_hours_start`, `quiet_hours_end` (VARCHAR 10, default: "22:00", "08:00")
  - `dnd_enabled` (BOOLEAN, default: `false`)
  - `default_workspace_id`, `last_workspace_id`, `last_project_id` (UUID nullable references)
- **Related Features:** Settings Page, Appearance, Notification Filtering.

---

### 19. Models: `conversations` & `conversation_members`
- **Purpose:** Direct 1-to-1 and group messaging threads.
- **Primary Key:** `id` (UUID, `gen_random_uuid()`)
- **Important Fields (`conversations`):**
  - `workspace_id` (UUID, Cascade Delete)
  - `type` (VARCHAR 20, default: "DIRECT")
  - `dm_signature` (VARCHAR 150, unique composite signature for idempotent DM resolution)
- **Indexes:**
  - `uq_conversation_workspace_dm_signature` (UNIQUE on `[workspace_id, dm_signature]`)
- **Related Features:** Real-Time Direct Messaging, Chat Phase 2.

---

### 20. Models: `channels`, `channel_members`, `messages`, `message_reactions`, `message_pins`
- **Purpose:** Public/private discussion channels, threaded messages, reactions, and pinned announcements.
- **Important Fields (`messages`):**
  - `channel_id`, `conversation_id` (UUID nullable references)
  - `sender_id` (UUID, Foreign Key $\rightarrow$ `users.id`)
  - `content` (TEXT, message body)
  - `parent_message_id` (UUID, nullable self-reference for threaded replies)
  - `is_edited`, `is_deleted` (BOOLEAN)
  - `attachments` (JSONB)
- **Related Features:** Real-Time Chat, Message Threading, Emoji Reactions, Pinned Messages.

---

## 3. UNUSED MODELS & DISCREPANCIES AUDIT

1. **Unused Table: `labels` & `task_labels`:**
   - *Status:* Defined in `schema.prisma` (lines 80–91, 216–225) with unique index `uq_workspace_label`.
   - *Findings:* Backend schema supports task labels, but the active frontend task creation form currently uses text tags rather than normalized relational label lookups. The tables are harmless and ready for future tagging UI enhancements.
2. **Missing Endpoints:**
   - All frontend API calls mapped to backend Express routes were verified; zero dangling frontend calls with 404 responses were identified.
3. **Dedicated Password Reset Table (`used_password_reset_tokens`):**
   - Managed directly via raw SQL migration in `authService.js` (`ensureUsedPasswordResetTokensTable`) to guarantee single-use token invalidation without requiring a separate Prisma generator rerun.
