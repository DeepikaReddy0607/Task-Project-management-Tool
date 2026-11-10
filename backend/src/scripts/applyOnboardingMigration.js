import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("=== Applying TaskFlow Onboarding Migration 002 ===");

    const sqlPath = path.resolve(__dirname, "../../prisma/migrations/002_add_onboarding_to_users.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Execute raw SQL migration
    await prisma.$executeRawUnsafe(sql);
    console.log("✔ Executed 002_add_onboarding_to_users.sql successfully.");

    // Verify column exists in taskflow.users
    const cols = await prisma.$queryRaw`
        SELECT column_name, data_type, column_default 
        FROM information_schema.columns 
        WHERE table_schema = 'taskflow' 
        AND table_name = 'users' 
        AND column_name = 'has_completed_onboarding';
    `;

    console.log("Verified column in taskflow.users:", cols);
    if (!cols || cols.length === 0) {
        throw new Error("Column has_completed_onboarding was not found in taskflow.users");
    }

    // Verify existing users count marked true
    const userCount = await prisma.users.count();
    const onboardedCount = await prisma.users.count({
        where: { has_completed_onboarding: true }
    });
    console.log(`Total existing users: ${userCount}, Onboarded users: ${onboardedCount}`);

    await prisma.$disconnect();
    console.log("Migration 002 completed successfully.");
}

main().catch(err => {
    console.error("Migration 002 failed:", err);
    process.exit(1);
});
