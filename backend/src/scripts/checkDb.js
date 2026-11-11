import "dotenv/config";
import prisma from "../config/prisma.js";

async function main() {
  for (const t of ['workspaces', 'projects', 'tasks', 'subtasks', 'users', 'project_members', 'workspace_members']) {
    const cols = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='taskflow' AND table_name=$1 ORDER BY ordinal_position",
      t
    );
    console.log(`=== ${t} ===`);
    console.log(cols.map(c => `${c.column_name} (${c.data_type})`).join(', '));
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
