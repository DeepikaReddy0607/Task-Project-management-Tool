import "dotenv/config";
import prisma from "../config/prisma.js";

async function main() {
    const indexes = await prisma.$queryRawUnsafe(`
        SELECT tablename, indexname, indexdef 
        FROM pg_indexes 
        WHERE schemaname = 'taskflow' 
        ORDER BY tablename, indexname;
    `);
    console.log("Existing indexes in schema 'taskflow':");
    for (const idx of indexes) {
        console.log(`- [${idx.tablename}] ${idx.indexname}: ${idx.indexdef}`);
    }
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
