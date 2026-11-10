-- TASKFLOW ONBOARDING PERSISTENCE MIGRATION 002
-- Schema: taskflow

-- 1. Add has_completed_onboarding column to users table with default false
ALTER TABLE taskflow.users 
ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark existing users as having completed onboarding so they are not forced through onboarding again
UPDATE taskflow.users 
SET has_completed_onboarding = true 
WHERE has_completed_onboarding = false;
