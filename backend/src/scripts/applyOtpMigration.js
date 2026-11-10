import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("=== Applying TaskFlow OTP Pending Registrations Migration 003 ===");

    const sqlPath = path.resolve(__dirname, "../../prisma/migrations/003_create_pending_registrations.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Capture initial user count before running migration to ensure existing records are untouched
    const initialUserCount = await prisma.users.count();
    console.log(`Pre-migration user count: ${initialUserCount}`);

    // Execute raw SQL migration
    await prisma.$executeRawUnsafe(sql);
    console.log("✔ Executed 003_create_pending_registrations.sql successfully.");

    // Verify table exists in taskflow schema
    const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'taskflow' 
        AND table_name = 'pending_registrations';
    `;

    console.log("Verified table in taskflow schema:", tables);
    if (!tables || tables.length === 0) {
        throw new Error("Table pending_registrations was not found in taskflow schema");
    }

    // Verify columns in taskflow.pending_registrations
    const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_schema = 'taskflow' 
        AND table_name = 'pending_registrations'
        ORDER BY ordinal_position;
    `;
    console.log("Columns in taskflow.pending_registrations:");
    columns.forEach(col => {
        console.log(` - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });

    // Verify that existing users remain completely untouched
    const postUserCount = await prisma.users.count();
    console.log(`Post-migration user count: ${postUserCount}`);
    if (initialUserCount !== postUserCount) {
        throw new Error(`CRITICAL: User count changed from ${initialUserCount} to ${postUserCount}`);
    }

    // Verify existing users sample
    const sampleUser = await prisma.users.findFirst({
        select: {
            id: true,
            email: true,
            is_active: true,
            has_completed_onboarding: true,
            created_at: true
        }
    });
    console.log("Verified existing user record remains intact:", sampleUser ? { id: sampleUser.id, email: sampleUser.email } : "No users in DB");

    await prisma.$disconnect();
    console.log("✔ Migration 003 completed and verified successfully.");
}

main().catch(err => {
    console.error("Migration 003 failed:", err);
    process.exit(1);
});
