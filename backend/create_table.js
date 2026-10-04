import prisma from "./src/config/prisma.js";

async function main() {
    const sql = `
    CREATE TABLE IF NOT EXISTS taskflow.project_health_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES taskflow.projects(id) ON DELETE CASCADE,
      captured_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      health_score INTEGER NOT NULL,
      health_status VARCHAR(20) NOT NULL,
      schedule_score INTEGER,
      critical_path_score INTEGER,
      execution_score INTEGER,
      bottleneck_score INTEGER,
      dependency_score INTEGER,
      workload_score INTEGER,
      risk_score INTEGER,
      projected_end_date TIMESTAMPTZ(6),
      schedule_drift_days INTEGER NOT NULL DEFAULT 0,
      critical_task_count INTEGER NOT NULL DEFAULT 0,
      bottleneck_count INTEGER NOT NULL DEFAULT 0,
      deadline_risk_count INTEGER NOT NULL DEFAULT 0,
      open_risk_count INTEGER NOT NULL DEFAULT 0,
      state_hash VARCHAR(64),
      metadata JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_health_snapshots_project_captured ON taskflow.project_health_snapshots(project_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_health_snapshots_captured_at ON taskflow.project_health_snapshots(captured_at);
  `;
    await prisma.$executeRawUnsafe(sql);
    console.log("SUCCESS: project_health_snapshots created in taskflow schema!");
    process.exit(0);
}

main().catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
});
