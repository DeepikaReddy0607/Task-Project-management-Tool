import prisma from "../config/prisma.js";

async function main() {
    const sql = `
    CREATE TABLE IF NOT EXISTS taskflow.user_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES taskflow.users(id) ON DELETE CASCADE,
      theme VARCHAR(20) NOT NULL DEFAULT 'system',
      interface_density VARCHAR(20) NOT NULL DEFAULT 'comfortable',
      sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
      dashboard_layout VARCHAR(30) NOT NULL DEFAULT 'default',
      in_app_notifications BOOLEAN NOT NULL DEFAULT true,
      email_notifications BOOLEAN NOT NULL DEFAULT true,
      task_assignments BOOLEAN NOT NULL DEFAULT true,
      deadline_reminders BOOLEAN NOT NULL DEFAULT true,
      task_status_updates BOOLEAN NOT NULL DEFAULT true,
      mentions_and_comments BOOLEAN NOT NULL DEFAULT true,
      project_updates BOOLEAN NOT NULL DEFAULT true,
      workspace_activity BOOLEAN NOT NULL DEFAULT true,
      risk_alerts BOOLEAN NOT NULL DEFAULT true,
      ai_recommendations_notif BOOLEAN NOT NULL DEFAULT true,
      quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
      quiet_hours_start VARCHAR(10) NOT NULL DEFAULT '22:00',
      quiet_hours_end VARCHAR(10) NOT NULL DEFAULT '08:00',
      dnd_enabled BOOLEAN NOT NULL DEFAULT false,
      notification_frequency VARCHAR(20) NOT NULL DEFAULT 'immediate',
      default_task_view VARCHAR(20) NOT NULL DEFAULT 'kanban',
      default_task_priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
      default_task_sort VARCHAR(20) NOT NULL DEFAULT 'due_date',
      show_completed_tasks BOOLEAN NOT NULL DEFAULT true,
      default_task_filter VARCHAR(30) NOT NULL DEFAULT 'all',
      week_starts_on VARCHAR(10) NOT NULL DEFAULT 'Monday',
      default_workspace_id UUID REFERENCES taskflow.workspaces(id) ON DELETE SET NULL,
      default_landing_page VARCHAR(30) NOT NULL DEFAULT 'dashboard',
      remember_last_workspace BOOLEAN NOT NULL DEFAULT true,
      remember_last_project BOOLEAN NOT NULL DEFAULT true,
      last_workspace_id UUID REFERENCES taskflow.workspaces(id) ON DELETE SET NULL,
      last_project_id UUID REFERENCES taskflow.projects(id) ON DELETE SET NULL,
      timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
      date_format VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
      time_format VARCHAR(10) NOT NULL DEFAULT '12h',
      ai_recommendations BOOLEAN NOT NULL DEFAULT true,
      proactive_insights BOOLEAN NOT NULL DEFAULT true,
      ai_task_suggestions BOOLEAN NOT NULL DEFAULT true,
      ai_generated_summaries BOOLEAN NOT NULL DEFAULT true,
      quackie_suggestions BOOLEAN NOT NULL DEFAULT true,
      ai_insight_frequency VARCHAR(20) NOT NULL DEFAULT 'medium',
      profile_visibility VARCHAR(20) NOT NULL DEFAULT 'team',
      activity_visibility VARCHAR(20) NOT NULL DEFAULT 'team',
      personalized_dashboard BOOLEAN NOT NULL DEFAULT true,
      personalized_recommendations BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON taskflow.user_preferences(user_id);
    `;

    await prisma.$executeRawUnsafe(sql);
    console.log("user_preferences table created successfully in PostgreSQL taskflow schema!");
    process.exit(0);
}

main().catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
});
