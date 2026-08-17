import prisma from "./config/prisma.js";

async function seedRoles() {
    try {
        const roles = [
            {
                role_name: "Admin",
                description: "System administrator",
            },
            {
                role_name: "Project Manager",
                description: "Manages projects, tasks, and project members",
            },
            {
                role_name: "Team Member",
                description: "Works on assigned projects and tasks",
            },
        ];

        for (const role of roles) {
            await prisma.roles.upsert({
                where: {
                    role_name: role.role_name,
                },
                update: {
                    description: role.description,
                },
                create: role,
            });
        }

        console.log("✅ Roles seeded successfully");

        const allRoles = await prisma.roles.findMany({
            orderBy: {
                role_name: "asc",
            },
        });

        console.log(allRoles);
    } catch (error) {
        console.error("❌ Failed to seed roles:");
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

seedRoles();