import prisma from "./src/config/prisma.js";

async function main() {
    const res = await prisma.$queryRawUnsafe("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_task_priority'");
    console.log(res);
}

main().finally(() => process.exit(0));
