/**
 * TaskFlow Development Admin Seeding & Promotion Utility
 * 
 * Safely provisions or promotes users to the 'Admin' role in local development
 * without modifying authentication flows, weakening RBAC middleware, or altering Git.
 * 
 * Usage:
 *   node src/scripts/seedAdmin.js
 *     -> Checks existing admins; if none exist, provisions 'admin@taskflow.dev'.
 * 
 *   node src/scripts/seedAdmin.js promote <email>
 *     -> Promotes an existing user to the 'Admin' role.
 * 
 *   node src/scripts/seedAdmin.js create <email> <password> [firstName] [lastName]
 *     -> Creates a new dedicated Admin user with specified credentials.
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";

const DEFAULT_DEV_ADMIN = {
    email: process.env.DEV_ADMIN_EMAIL || "admin@taskflow.dev",
    password: process.env.DEV_ADMIN_PASSWORD || "AdminPassword123!",
    firstName: "System",
    lastName: "Admin"
};

async function ensureAdminRole() {
    const adminRole = await prisma.roles.upsert({
        where: { role_name: "Admin" },
        update: {},
        create: {
            role_name: "Admin",
            description: "System administrator with full administrative access"
        }
    });
    return adminRole;
}

async function listAdmins(adminRoleId) {
    return await prisma.users.findMany({
        where: { role_id: adminRoleId },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            is_active: true,
            created_at: true
        }
    });
}

async function promoteExistingUser(email) {
    const normalizedEmail = email.trim().toLowerCase();
    const adminRole = await ensureAdminRole();

    const user = await prisma.users.findUnique({
        where: { email: normalizedEmail },
        include: { roles: true }
    });

    if (!user) {
        console.error(`❌ User not found with email: ${normalizedEmail}`);
        console.log("   Available users in database:");
        const allUsers = await prisma.users.findMany({
            select: { email: true, roles: { select: { role_name: true } } }
        });
        allUsers.forEach(u => console.log(`   - ${u.email} (${u.roles?.role_name || "Unknown"})`));
        return false;
    }

    if (user.roles?.role_name === "Admin") {
        console.log(`ℹ️  User '${normalizedEmail}' already has the 'Admin' role.`);
        return true;
    }

    const previousRole = user.roles?.role_name || "Unknown";
    await prisma.users.update({
        where: { id: user.id },
        data: {
            role_id: adminRole.id,
            is_active: true
        }
    });

    console.log(`✅ Successfully promoted user '${normalizedEmail}' from '${previousRole}' to 'Admin'!`);
    return true;
}

async function createAdminUser(email, password, firstName, lastName) {
    const normalizedEmail = (email || DEFAULT_DEV_ADMIN.email).trim().toLowerCase();
    const adminPassword = password || DEFAULT_DEV_ADMIN.password;
    const fName = firstName || DEFAULT_DEV_ADMIN.firstName;
    const lName = lastName || DEFAULT_DEV_ADMIN.lastName;

    const adminRole = await ensureAdminRole();

    const existingUser = await prisma.users.findUnique({
        where: { email: normalizedEmail },
        include: { roles: true }
    });

    if (existingUser) {
        // User already exists, update role to Admin
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        await prisma.users.update({
            where: { id: existingUser.id },
            data: {
                role_id: adminRole.id,
                password_hash: passwordHash,
                is_active: true
            }
        });

        console.log(`✅ Updated existing user '${normalizedEmail}' to 'Admin' and refreshed credentials.`);
        console.log(`   Email:    ${normalizedEmail}`);
        console.log(`   Password: ${adminPassword}`);
        return true;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const newUser = await prisma.users.create({
        data: {
            email: normalizedEmail,
            password_hash: passwordHash,
            first_name: fName,
            last_name: lName,
            role_id: adminRole.id,
            is_active: true
        }
    });

    console.log(`✅ Created new Development Administrator:`);
    console.log(`   User ID:  ${newUser.id}`);
    console.log(`   Name:     ${fName} ${lName}`);
    console.log(`   Email:    ${normalizedEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role:     Admin`);
    return true;
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();

    try {
        const adminRole = await ensureAdminRole();
        const existingAdmins = await listAdmins(adminRole.id);

        if (command === "promote") {
            const email = args[1];
            if (!email) {
                console.error("❌ Please provide an email to promote: node src/scripts/seedAdmin.js promote <email>");
                process.exitCode = 1;
                return;
            }
            await promoteExistingUser(email);
            return;
        }

        if (command === "create") {
            const email = args[1];
            const password = args[2];
            const firstName = args[3];
            const lastName = args[4];
            await createAdminUser(email, password, firstName, lastName);
            return;
        }

        // If command is an email directly (convenience shorthand)
        if (command && command.includes("@")) {
            await promoteExistingUser(command);
            return;
        }

        // Default behavior (no arguments):
        console.log("\n==================================================");
        console.log("TaskFlow Development Admin Setup");
        console.log("==================================================");

        if (existingAdmins.length > 0) {
            console.log(`ℹ️  Found ${existingAdmins.length} existing Administrator(s) in database:`);
            existingAdmins.forEach(adm => {
                console.log(`   - ${adm.email} (${adm.first_name} ${adm.last_name}, active: ${adm.is_active})`);
            });
            console.log("\nTo promote another user, run:");
            console.log("   node src/scripts/seedAdmin.js promote <email>");
            console.log("\nTo create a new admin with custom credentials, run:");
            console.log("   node src/scripts/seedAdmin.js create <email> <password>");
            return;
        }

        console.log("⚠️  No Admin user currently exists in the database.");
        console.log("   Provisioning default development Admin account...\n");

        await createAdminUser(
            DEFAULT_DEV_ADMIN.email,
            DEFAULT_DEV_ADMIN.password,
            DEFAULT_DEV_ADMIN.firstName,
            DEFAULT_DEV_ADMIN.lastName
        );

        console.log("\n--------------------------------------------------");
        console.log("You can now login at http://localhost:5173/login with:");
        console.log(`   Email:    ${DEFAULT_DEV_ADMIN.email}`);
        console.log(`   Password: ${DEFAULT_DEV_ADMIN.password}`);
        console.log("And navigate to: http://localhost:5173/admin");
        console.log("==================================================\n");

    } catch (error) {
        console.error("❌ Admin setup failed:", error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
