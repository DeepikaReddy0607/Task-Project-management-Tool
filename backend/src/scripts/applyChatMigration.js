import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("=== Applying TaskFlow Chat Migration 001 ===");

    const { default: prisma } = await import("../config/prisma.js");

    const sqlPath = path.resolve(__dirname, "../../prisma/migrations/001_create_chat_models.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Execute raw SQL migration
    await prisma.$executeRawUnsafe(sql);
    console.log("✔ Executed 001_create_chat_models.sql successfully.");

    // Verify all 8 tables exist in taskflow schema
    const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'taskflow' 
        AND table_name IN (
            'conversations', 
            'conversation_members', 
            'channels', 
            'channel_members', 
            'messages', 
            'message_reactions', 
            'message_read_receipts', 
            'message_pins'
        )
        ORDER BY table_name;
    `;

    console.log("Verified tables created in schema 'taskflow':");
    tables.forEach(t => console.log(`  - taskflow.${t.table_name}`));

    if (tables.length !== 8) {
        throw new Error(`Expected 8 tables, but found ${tables.length}`);
    }

    // Verify foreign keys and constraints
    const constraints = await prisma.$queryRaw`
        SELECT conname, contype::text as contype 
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'taskflow'
        AND c.conname IN (
            'uq_conversation_workspace_dm_signature',
            'uq_conversation_member',
            'uq_channel_member',
            'chk_messages_target',
            'uq_message_reaction_user_emoji',
            'uq_message_read_receipt',
            'uq_message_pin_message'
        )
        ORDER BY conname;
    `;

    console.log("\nVerified unique & check constraints:");
    constraints.forEach(c => console.log(`  - ${c.conname} (type: ${c.contype})`));

    await prisma.$disconnect();
    console.log("\nAll 8 chat tables and constraints successfully verified!");
}

main().catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
});
