require("dotenv").config();

const prisma = require("./config/prisma");

async function testDatabase() {
    try {
        await prisma.$connect();

        console.log("✅ Prisma connected to PostgreSQL successfully");

        const roles = await prisma.roles.findMany();

        console.log("Roles:", roles);
    } catch (error) {
        console.error("❌ Database connection failed:");
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

testDatabase();