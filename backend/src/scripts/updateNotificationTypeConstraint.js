import "dotenv/config";
import prisma from "../config/prisma.js";

async function updateConstraint() {
    console.log("Updating chk_notification_type constraint to support all intelligence alert types...");

    await prisma.$executeRawUnsafe(`
        ALTER TABLE taskflow.notifications DROP CONSTRAINT IF EXISTS chk_notification_type;
    `);

    await prisma.$executeRawUnsafe(`
        ALTER TABLE taskflow.notifications ADD CONSTRAINT chk_notification_type CHECK (
            type IN (
                'assignment', 'due_date', 'comment', 'update', 'SYSTEM',
                'TASK_OVERDUE', 'TASK_BLOCKED', 'HIGH_RISK_PROJECT', 'DEADLINE_WARNING', 'PRIORITY_SHIFT',
                'NEW_CRITICAL_TASK', 'CRITICAL_PATH_CHANGED', 'CRITICAL_TASK_OVERDUE',
                'BOTTLENECK_ESCALATED', 'NEW_MAJOR_BOTTLENECK', 'PROJECT_DURATION_INCREASED',
                'CYCLE_DETECTED', 'SCHEDULE_DRIFT_DETECTED', 'PROJECT_HEALTH_DEGRADED',
                'PROJECT_HEALTH_CRITICAL', 'DEADLINE_RISK_ESCALATED', 'PREMORTEM_HIGH_RISK_DETECTED',
                'WORKLOAD_CONCENTRATION_DETECTED', 'KNOWLEDGE_CONCENTRATION_DETECTED',
                'REPLANNING_OPPORTUNITY_DETECTED', 'REPLANNING_RECOMMENDED', 'RECOVERY_PLAN_ACTIVATED',
                'RESOURCE_CONTENTION_DETECTED', 'SCOPE_EXPANSION_DETECTED', 'SENTIMENT_DEGRADED',
                'TEAM_DISENGAGEMENT_DETECTED'
            )
        );
    `);

    const res = await prisma.$queryRawUnsafe(`
        SELECT conname, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c 
        JOIN pg_class t ON c.conrelid = t.oid 
        JOIN pg_namespace n ON t.relnamespace = n.oid 
        WHERE n.nspname = 'taskflow' AND conname = 'chk_notification_type'
    `);

    console.log("Updated constraint definition:", res);
    await prisma.$disconnect();
}

updateConstraint().catch((err) => {
    console.error("Failed to update constraint:", err);
    process.exit(1);
});
