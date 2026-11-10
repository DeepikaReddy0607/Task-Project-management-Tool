-- TASKFLOW PENDING REGISTRATIONS & OTP VERIFICATION MIGRATION 003
-- Schema: taskflow

CREATE TABLE IF NOT EXISTS taskflow.pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(15),
    password_hash TEXT NOT NULL,
    otp_hash VARCHAR(128),
    otp_expires_at TIMESTAMPTZ(6) NOT NULL,
    verification_attempts INT NOT NULL DEFAULT 0,
    last_resend_at TIMESTAMPTZ(6),
    resend_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pending_registrations_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON taskflow.pending_registrations (email);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires ON taskflow.pending_registrations (otp_expires_at);
