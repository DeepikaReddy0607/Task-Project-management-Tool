import prisma from "../config/prisma.js";
import fs from "fs/promises";
import path from "path";
import bcrypt from "bcrypt";

const getUserProfile = async (userId) => {
    const user = await prisma.users.findUnique({
        where: {
            id: userId
        },
        include: {
            roles: true
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
        profilePicture: user.profile_picture,
        role: user.roles.role_name
    };
};

const updateUserProfile = async (userId, data) => {
    const {
        firstName,
        lastName,
        phone,
        profilePicture
    } = data;

    const user = await prisma.users.findUnique({
        where: {
            id: userId
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    const oldProfilePicture = user.profile_picture;

    const updatedUser = await prisma.users.update({
        where: {
            id: userId
        },
        data: {
            ...(firstName !== undefined && {
                first_name: firstName
            }),
            ...(lastName !== undefined && {
                last_name: lastName
            }),
            ...(phone !== undefined && {
                phone: phone || null
            }),
            ...(profilePicture !== undefined && {
                profile_picture: profilePicture
            }),
            updated_at: new Date()
        },
        include: {
            roles: true
        }
    });

    // Delete old profile picture after successful database update
    if (
        profilePicture !== undefined &&
        oldProfilePicture &&
        oldProfilePicture !== profilePicture
    ) {
        const oldFilePath = path.join(
            process.cwd(),
            oldProfilePicture.replace(/^\/+/, "")
        );

        try {
            await fs.unlink(oldFilePath);
        } catch (error) {
            // Ignore if the old file no longer exists
            if (error.code !== "ENOENT") {
                console.error(
                    "Failed to delete old profile picture:",
                    error
                );
            }
        }
    }

    return {
        id: updatedUser.id,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profilePicture: updatedUser.profile_picture,
        role: updatedUser.roles.role_name
    };
};

const changePassword = async (userId, currentPassword, newPassword) => {
    const user = await prisma.users.findUnique({
        where: {
            id: userId
        }
    });

    if (!user) {
        throw new Error("User not found");
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(
        currentPassword,
        user.password_hash
    );

    if (!passwordMatch) {
        throw new Error("Current password is incorrect");
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.users.update({
        where: {
            id: userId
        },
        data: {
            password_hash: passwordHash,
            updated_at: new Date()
        }
    });

    return true;
};

export {
    getUserProfile,
    updateUserProfile,
    changePassword
};