import prisma from "../config/prisma.js";

const getMyProfile = async (userId) => {
    const user = await prisma.users.findUnique({
        where: { id: userId },
        include: {
            roles: {
                select: {
                    role_name: true
                }
            }
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    return {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        profilePicture: user.profile_picture || null,
        role: user.roles?.role_name || null,
        hasCompletedOnboarding: Boolean(user.has_completed_onboarding)
    };
};

const updateMyProfile = async (userId, data) => {
    const { firstName, lastName, phone, profilePicture, hasCompletedOnboarding } = data;

    if (firstName !== undefined && !firstName.trim()) {
        throw new Error("First name cannot be empty");
    }

    if (lastName !== undefined && !lastName.trim()) {
        throw new Error("Last name cannot be empty");
    }

    const existingUser = await prisma.users.findUnique({
        where: { id: userId }
    });

    if (!existingUser) {
        throw new Error("User not found");
    }

    const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: {
            ...(firstName !== undefined && {
                first_name: firstName.trim()
            }),
            ...(lastName !== undefined && {
                last_name: lastName.trim()
            }),
            ...(phone !== undefined && {
                phone: phone?.trim() || null
            }),
            ...(profilePicture !== undefined && {
                profile_picture: profilePicture || null
            }),
            ...(hasCompletedOnboarding !== undefined && {
                has_completed_onboarding: Boolean(hasCompletedOnboarding)
            })
        },
        include: {
            roles: {
                select: {
                    role_name: true
                }
            }
        }
    });

    return {
        id: updatedUser.id,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profilePicture: updatedUser.profile_picture || null,
        role: updatedUser.roles?.role_name || null,
        hasCompletedOnboarding: Boolean(updatedUser.has_completed_onboarding)
    };
};

const completeUserOnboarding = async (userId) => {
    const existingUser = await prisma.users.findUnique({
        where: { id: userId }
    });

    if (!existingUser) {
        throw new Error("User not found");
    }

    const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: {
            has_completed_onboarding: true
        },
        include: {
            roles: {
                select: {
                    role_name: true
                }
            }
        }
    });

    return {
        id: updatedUser.id,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profilePicture: updatedUser.profile_picture || null,
        role: updatedUser.roles?.role_name || null,
        hasCompletedOnboarding: true
    };
};

export {
    getMyProfile,
    updateMyProfile,
    completeUserOnboarding
};
