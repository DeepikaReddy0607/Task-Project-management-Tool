import prisma from "../config/prisma.js";

const roles = [
    {
        role_name: "Admin",
        description: "System administrator"
    },
    {
        role_name: "Project Manager",
        description: "Manages projects and project members"
    },
    {
        role_name: "Team Member",
        description: "Works on assigned project tasks"
    }
];

const seedRoles = async () => {
    try {
        for (const role of roles) {
            await prisma.roles.upsert({
                where: {
                    role_name: role.role_name
                },
                update: {
                    description: role.description
                },
                create: {
                    role_name: role.role_name,
                    description: role.description
                }
            });
        }

        console.log("Roles seeded successfully.");
    } catch (error) {
        console.error("Failed to seed roles:", error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
};

seedRoles();