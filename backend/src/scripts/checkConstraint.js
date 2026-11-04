import "dotenv/config";
import prisma from "../config/prisma.js";

async function check() {
    const res = await prisma.$queryRawUnsafe(`
        SELECT t.relname, c.conname, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c 
        JOIN pg_class t ON c.conrelid = t.oid 
        JOIN pg_namespace n ON t.relnamespace = n.oid 
        WHERE n.nspname = 'taskflow' AND c.contype = 'c'
    `);
    console.log("Check constraints in taskflow:", JSON.stringify(res, null, 2));
    await prisma.$disconnect();
}
check();
