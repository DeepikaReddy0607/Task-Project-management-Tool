import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });
import prisma from "../config/prisma.js";

async function main() {
    const info = await prisma.$queryRawUnsafe("SELECT current_schema(), current_database();");
    console.log("Current schema/db:", info);

    const tables = await prisma.$queryRawUnsafe(`
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema IN ('public', 'taskflow') 
        ORDER BY table_schema, table_name;
    `);
    console.log("Tables in database:");
    tables.forEach((t) => console.log(`  - ${t.table_schema}.${t.table_name}`));
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });
