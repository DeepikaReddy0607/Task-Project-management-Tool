CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS taskflow;

SET search_path TO taskflow;


-- ==========================================
-- ROLES
-- ==========================================

CREATE TABLE taskflow.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    role_name VARCHAR(30) NOT NULL UNIQUE,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- USERS
-- ==========================================

CREATE TABLE taskflow.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    role_id UUID NOT NULL,

    first_name VARCHAR(50) NOT NULL,

    last_name VARCHAR(50) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    phone VARCHAR(15),

    profile_picture TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_users_role
        FOREIGN KEY (role_id)
        REFERENCES taskflow.roles(id)
);


-- ==========================================
-- WORKSPACES
-- ==========================================

CREATE TABLE taskflow.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    description TEXT,

    owner_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_workspaces_owner
        FOREIGN KEY (owner_id)
        REFERENCES taskflow.users(id)
);


-- ==========================================
-- WORKSPACE MEMBERS
-- ==========================================

CREATE TABLE taskflow.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    user_id UUID NOT NULL,

    workspace_role VARCHAR(30) NOT NULL,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    
    CONSTRAINT fk_workspace_members_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES taskflow.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_workspace_members_user
        FOREIGN KEY (user_id)
        REFERENCES taskflow.users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_workspace_member
        UNIQUE (workspace_id, user_id)
);

CREATE TABLE taskflow.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    title VARCHAR(150) NOT NULL,

    description TEXT,

    category VARCHAR(50),

    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',

    status VARCHAR(20) NOT NULL DEFAULT 'Planning',

    start_date DATE,

    end_date DATE,

    manager_id UUID NOT NULL,

    is_archived BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_projects_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES taskflow.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_projects_manager
        FOREIGN KEY (manager_id)
        REFERENCES taskflow.users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_project_priority
        CHECK (priority IN ('Low', 'Medium', 'High')),

    CONSTRAINT chk_project_status
        CHECK (
            status IN (
                'Planning',
                'Active',
                'On Hold',
                'Completed',
                'Archived'
            )
        ),

    CONSTRAINT chk_project_dates
        CHECK (
            end_date IS NULL
            OR start_date IS NULL
            OR end_date >= start_date
        )
);
CREATE TABLE taskflow.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,

    user_id UUID NOT NULL,

    role_id UUID NOT NULL,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_project_members_project
        FOREIGN KEY (project_id)
        REFERENCES taskflow.projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_members_user
        FOREIGN KEY (user_id)
        REFERENCES taskflow.users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_members_role
        FOREIGN KEY (role_id)
        REFERENCES taskflow.roles(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_project_member
        UNIQUE (project_id, user_id)
);

-- =========================================================
-- MODULE 4: TASK MANAGEMENT & ASSIGNMENT
-- =========================================================

CREATE TABLE taskflow.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',

    status VARCHAR(20) NOT NULL DEFAULT 'Backlog',

    start_date DATE,

    due_date DATE,

    estimated_hours NUMERIC(6,2),

    assigned_to UUID,

    created_by UUID NOT NULL,

    is_archived BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tasks_project
        FOREIGN KEY (project_id)
        REFERENCES taskflow.projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_tasks_assigned_to
        FOREIGN KEY (assigned_to)
        REFERENCES taskflow.users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_tasks_created_by
        FOREIGN KEY (created_by)
        REFERENCES taskflow.users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_task_priority
        CHECK (
            priority IN (
                'Low',
                'Medium',
                'High'
            )
        ),

    CONSTRAINT chk_task_status
        CHECK (
            status IN (
                'Backlog',
                'To Do',
                'In Progress',
                'Review',
                'Completed'
            )
        ),

    CONSTRAINT chk_task_dates
        CHECK (
            due_date IS NULL
            OR start_date IS NULL
            OR due_date >= start_date
        ),

    CONSTRAINT chk_task_estimated_hours
        CHECK (
            estimated_hours IS NULL
            OR estimated_hours >= 0
        )
);

-- =========================================================
-- MODULE 5: SUBTASKS
-- =========================================================

CREATE TABLE taskflow.subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    task_id UUID NOT NULL,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'To Do',

    due_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_subtasks_task
        FOREIGN KEY (task_id)
        REFERENCES taskflow.tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_subtask_status
        CHECK (
            status IN (
                'To Do',
                'In Progress',
                'Done'
            )
        )
);

-- =========================================================
-- INDEXES: TASKS & SUBTASKS
-- =========================================================

CREATE INDEX idx_tasks_project_id
ON taskflow.tasks(project_id);

CREATE INDEX idx_tasks_assigned_to
ON taskflow.tasks(assigned_to);

CREATE INDEX idx_tasks_created_by
ON taskflow.tasks(created_by);

CREATE INDEX idx_tasks_status
ON taskflow.tasks(status);

CREATE INDEX idx_tasks_due_date
ON taskflow.tasks(due_date);

CREATE INDEX idx_tasks_project_status
ON taskflow.tasks(project_id, status);

CREATE INDEX idx_subtasks_task_id
ON taskflow.subtasks(task_id);

CREATE INDEX idx_subtasks_due_date
ON taskflow.subtasks(due_date);

-- =========================================================
-- MODULE: LABELS & TASK ORGANIZATION
-- =========================================================

CREATE TABLE taskflow.labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    name VARCHAR(50) NOT NULL,

    color VARCHAR(20),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_labels_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES taskflow.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_workspace_label
        UNIQUE (workspace_id, name)
);

CREATE TABLE taskflow.task_labels (
    task_id UUID NOT NULL,

    label_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_task_labels
        PRIMARY KEY (task_id, label_id),

    CONSTRAINT fk_task_labels_task
        FOREIGN KEY (task_id)
        REFERENCES taskflow.tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_task_labels_label
        FOREIGN KEY (label_id)
        REFERENCES taskflow.labels(id)
        ON DELETE CASCADE
);

-- =========================================================
-- TASK DEPENDENCIES
-- =========================================================

CREATE TABLE taskflow.task_dependencies (
    task_id UUID NOT NULL,

    depends_on_task_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_task_dependencies
        PRIMARY KEY (task_id, depends_on_task_id),

    CONSTRAINT fk_task_dependencies_task
        FOREIGN KEY (task_id)
        REFERENCES taskflow.tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_task_dependencies_parent
        FOREIGN KEY (depends_on_task_id)
        REFERENCES taskflow.tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_no_self_dependency
        CHECK (task_id <> depends_on_task_id)
);

-- =========================================================
-- INDEXES: LABELS & DEPENDENCIES
-- =========================================================

CREATE INDEX idx_labels_workspace_id
ON taskflow.labels(workspace_id);

CREATE INDEX idx_task_labels_label_id
ON taskflow.task_labels(label_id);

CREATE INDEX idx_task_dependencies_depends_on
ON taskflow.task_dependencies(depends_on_task_id);

-- =========================================================
-- MODULE: COMMENTS & DISCUSSIONS
-- =========================================================

CREATE TABLE taskflow.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    task_id UUID NOT NULL,

    user_id UUID NOT NULL,

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_comments_task
        FOREIGN KEY (task_id)
        REFERENCES taskflow.tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id)
        REFERENCES taskflow.users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_comment_content
        CHECK (LENGTH(TRIM(content)) > 0)
);

-- =========================================================
-- INDEXES: COMMENTS
-- =========================================================

CREATE INDEX idx_comments_task_id
ON taskflow.comments(task_id);

CREATE INDEX idx_comments_user_id
ON taskflow.comments(user_id);

CREATE INDEX idx_comments_created_at
ON taskflow.comments(created_at);

-- =========================================================
-- MODULE: FILE MANAGEMENT
-- =========================================================

CREATE TABLE taskflow.attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    task_id UUID,

    project_id UUID,

    uploaded_by UUID NOT NULL,

    file_name VARCHAR(255) NOT NULL,

    file_url TEXT NOT NULL,

    file_type VARCHAR(100),

    file_size BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attachments_task
        FOREIGN KEY (task_id)
        REFERENCES taskflow.tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_attachments_project
        FOREIGN KEY (project_id)
        REFERENCES taskflow.projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_attachments_user
        FOREIGN KEY (uploaded_by)
        REFERENCES taskflow.users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_attachment_parent
        CHECK (
            (task_id IS NOT NULL AND project_id IS NULL)
            OR
            (task_id IS NULL AND project_id IS NOT NULL)
        ),

    CONSTRAINT chk_attachment_file_size
        CHECK (
            file_size IS NULL OR file_size >= 0
        )
);

-- =========================================================
-- INDEXES: ATTACHMENTS
-- =========================================================

CREATE INDEX idx_attachments_task_id
ON taskflow.attachments(task_id);

CREATE INDEX idx_attachments_project_id
ON taskflow.attachments(project_id);

CREATE INDEX idx_attachments_uploaded_by
ON taskflow.attachments(uploaded_by);

-- =========================================================
-- MODULE: NOTIFICATIONS
-- =========================================================

CREATE TABLE taskflow.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    type VARCHAR(30) NOT NULL,

    message TEXT NOT NULL,

    related_entity_type VARCHAR(30),

    related_entity_id UUID,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id)
        REFERENCES taskflow.users(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_notification_type
        CHECK (
            type IN (
                'assignment',
                'due_date',
                'comment',
                'update'
            )
        )
);

-- =========================================================
-- INDEXES: NOTIFICATIONS
-- =========================================================

CREATE INDEX idx_notifications_user_id
ON taskflow.notifications(user_id);

CREATE INDEX idx_notifications_unread
ON taskflow.notifications(user_id, is_read);

CREATE INDEX idx_notifications_created_at
ON taskflow.notifications(created_at);

-- =========================================================
-- MODULE: ACTIVITY TIMELINE
-- =========================================================

CREATE TABLE taskflow.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    user_id UUID,

    action_type VARCHAR(50) NOT NULL,

    entity_type VARCHAR(30),

    entity_id UUID,

    description TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_activity_logs_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES taskflow.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_activity_logs_user
        FOREIGN KEY (user_id)
        REFERENCES taskflow.users(id)
        ON DELETE SET NULL
);
-- =========================================================
-- INDEXES: ACTIVITY LOGS
-- =========================================================

CREATE INDEX idx_activity_logs_workspace_id
ON taskflow.activity_logs(workspace_id);

CREATE INDEX idx_activity_logs_user_id
ON taskflow.activity_logs(user_id);

CREATE INDEX idx_activity_logs_entity
ON taskflow.activity_logs(entity_type, entity_id);

CREATE INDEX idx_activity_logs_created_at
ON taskflow.activity_logs(created_at);

-- =========================================================
-- MODULE: RISK MANAGEMENT
-- =========================================================

CREATE TABLE taskflow.risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    severity VARCHAR(20) NOT NULL DEFAULT 'Medium',

    probability VARCHAR(20) NOT NULL DEFAULT 'Medium',

    owner_id UUID,

    mitigation_plan TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'Open',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_risks_project
        FOREIGN KEY (project_id)
        REFERENCES taskflow.projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_risks_owner
        FOREIGN KEY (owner_id)
        REFERENCES taskflow.users(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_risk_severity
        CHECK (
            severity IN (
                'Low',
                'Medium',
                'High'
            )
        ),

    CONSTRAINT chk_risk_probability
        CHECK (
            probability IN (
                'Low',
                'Medium',
                'High'
            )
        ),

    CONSTRAINT chk_risk_status
        CHECK (
            status IN (
                'Open',
                'Mitigated',
                'Closed'
            )
        )
);

-- =========================================================
-- INDEXES: RISKS
-- =========================================================

CREATE INDEX idx_risks_project_id
ON taskflow.risks(project_id);

CREATE INDEX idx_risks_owner_id
ON taskflow.risks(owner_id);

CREATE INDEX idx_risks_status
ON taskflow.risks(status);

-- =========================================================
-- MODULE: DECISION LOG
-- =========================================================

CREATE TABLE taskflow.decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,

    decision TEXT NOT NULL,

    reason TEXT,

    decision_date DATE NOT NULL,

    owner_id UUID,

    status VARCHAR(20) NOT NULL DEFAULT 'Proposed',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_decisions_project
        FOREIGN KEY (project_id)
        REFERENCES taskflow.projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_decisions_owner
        FOREIGN KEY (owner_id)
        REFERENCES taskflow.users(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_decision_status
        CHECK (
            status IN (
                'Proposed',
                'Approved',
                'Reversed'
            )
        )
);

-- =========================================================
-- INDEXES: DECISIONS
-- =========================================================

CREATE INDEX idx_decisions_project_id
ON taskflow.decisions(project_id);

CREATE INDEX idx_decisions_owner_id
ON taskflow.decisions(owner_id);

CREATE INDEX idx_decisions_date
ON taskflow.decisions(decision_date);

CREATE INDEX idx_decisions_status
ON taskflow.decisions(status);

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION taskflow.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON taskflow.users
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();


CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON taskflow.workspaces
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();


CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON taskflow.tasks
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();


CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON taskflow.comments
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();

ALTER TABLE taskflow.projects
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE taskflow.workspace_members
ADD CONSTRAINT chk_workspace_role
CHECK (
    workspace_role IN (
        'Owner',
        'Admin',
        'Member'
    )
);

CREATE INDEX idx_users_role_id
ON taskflow.users(role_id);

CREATE INDEX idx_workspaces_owner_id
ON taskflow.workspaces(owner_id);

CREATE INDEX idx_workspace_members_user_id
ON taskflow.workspace_members(user_id);

CREATE INDEX idx_project_members_user_id
ON taskflow.project_members(user_id);

CREATE OR REPLACE FUNCTION taskflow.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON taskflow.users
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON taskflow.workspaces
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();

CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON taskflow.projects
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON taskflow.tasks
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();

CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON taskflow.comments
FOR EACH ROW
EXECUTE FUNCTION taskflow.update_updated_at();