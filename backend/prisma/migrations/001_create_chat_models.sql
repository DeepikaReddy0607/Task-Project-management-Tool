-- TASKFLOW CHAT DATABASE ARCHITECTURE - MIGRATION 001
-- Schema: taskflow

-- 1. CONVERSATIONS (Direct Messages & Group DMs)
CREATE TABLE IF NOT EXISTS taskflow.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES taskflow.workspaces(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'DIRECT',
    title VARCHAR(150),
    dm_signature VARCHAR(150),
    created_by UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMPTZ(6),
    CONSTRAINT uq_conversation_workspace_dm_signature UNIQUE (workspace_id, dm_signature)
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_updated ON taskflow.conversations (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON taskflow.conversations (created_by);

-- 2. CONVERSATION_MEMBERS
CREATE TABLE IF NOT EXISTS taskflow.conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES taskflow.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_muted BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT uq_conversation_member UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id ON taskflow.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_id ON taskflow.conversation_members (conversation_id);

-- 3. CHANNELS (Workspace & Project Channels)
CREATE TABLE IF NOT EXISTS taskflow.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES taskflow.workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES taskflow.projects(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    topic VARCHAR(255),
    description TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMPTZ(6)
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace_active ON taskflow.channels (workspace_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_channels_project_active ON taskflow.channels (project_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON taskflow.channels (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_workspace_name ON taskflow.channels (workspace_id, lower(name)) WHERE project_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_project_name ON taskflow.channels (project_id, lower(name)) WHERE project_id IS NOT NULL;

-- 4. CHANNEL_MEMBERS
CREATE TABLE IF NOT EXISTS taskflow.channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES taskflow.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_muted BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT uq_channel_member UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON taskflow.channel_members (user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON taskflow.channel_members (channel_id);

-- 5. MESSAGES
CREATE TABLE IF NOT EXISTS taskflow.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES taskflow.channels(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES taskflow.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    parent_message_id UUID REFERENCES taskflow.messages(id) ON DELETE CASCADE,
    is_edited BOOLEAN NOT NULL DEFAULT false,
    edited_at TIMESTAMPTZ(6),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ(6),
    attachments JSONB,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_messages_target CHECK (
        (channel_id IS NOT NULL AND conversation_id IS NULL) OR 
        (channel_id IS NULL AND conversation_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON taskflow.messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON taskflow.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON taskflow.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON taskflow.messages (parent_message_id);

-- 6. MESSAGE_REACTIONS
CREATE TABLE IF NOT EXISTS taskflow.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES taskflow.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_message_reaction_user_emoji UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON taskflow.message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON taskflow.message_reactions (user_id);

-- 7. MESSAGE_READ_RECEIPTS
CREATE TABLE IF NOT EXISTS taskflow.message_read_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES taskflow.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_message_read_receipt UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_read_receipts_message ON taskflow.message_read_receipts (message_id);
CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user ON taskflow.message_read_receipts (user_id);

-- 8. MESSAGE_PINS
CREATE TABLE IF NOT EXISTS taskflow.message_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES taskflow.messages(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES taskflow.channels(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES taskflow.conversations(id) ON DELETE CASCADE,
    pinned_by UUID NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_message_pin_message UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_pins_channel ON taskflow.message_pins (channel_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_conversation ON taskflow.message_pins (conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_pinned_by ON taskflow.message_pins (pinned_by);
