import "dotenv/config";
import prisma from "../config/prisma.js";

async function main() {
    try {
        const ver = await prisma.$queryRawUnsafe("SELECT version();");
        console.log("PostgreSQL Version:", ver[0]?.version);

        const ext = await prisma.$queryRawUnsafe("SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';");
        console.log("pg_trgm available in system:", ext);

        const installed = await prisma.$queryRawUnsafe("SELECT * FROM pg_extension WHERE extname = 'pg_trgm';");
        console.log("pg_trgm currently installed in database:", installed);

        process.exit(0);
    } catch (err) {
        console.error("Error checking pg_trgm:", err);
        process.exit(1);
    }
}

main();
