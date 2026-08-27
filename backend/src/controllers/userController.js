import {
    getUserProfile,
    updateUserProfile,
    changePassword
} from "../services/userService.js";

const getProfile = async (req, res, next) => {
    try {
        const user = await getUserProfile(req.user.userId);

        return res.status(200).json({
            user
        });

    } catch (error) {

        if (error.message === "User not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const {
            firstName,
            lastName,
            phone
        } = req.body;

        if (
            firstName === undefined &&
            lastName === undefined &&
            phone === undefined &&
            !req.file
        ) {
            return res.status(400).json({
                message: "At least one profile field or profile picture is required"
            });
        }

        if (firstName !== undefined && !firstName.trim()) {
            return res.status(400).json({
                message: "First name cannot be empty"
            });
        }

        if (lastName !== undefined && !lastName.trim()) {
            return res.status(400).json({
                message: "Last name cannot be empty"
            });
        }

        const profilePicture = req.file
            ? `/uploads/profile-pictures/${req.file.filename}`
            : undefined;

        const user = await updateUserProfile(
            req.user.userId,
            {
                firstName: firstName?.trim(),
                lastName: lastName?.trim(),
                phone: phone?.trim(),
                profilePicture
            }
        );

        return res.status(200).json({
            message: "Profile updated successfully",
            user
        });

    } catch (error) {

        if (error.message === "User not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        next(error);
    }
};

const changeUserPassword = async (req, res, next) => {
    try {
        const {
            currentPassword,
            newPassword
        } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Current password and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                message: "New password must be different from current password"
            });
        }

        await changePassword(
            req.user.userId,
            currentPassword,
            newPassword
        );

        return res.status(200).json({
            message: "Password changed successfully"
        });

    } catch (error) {

        if (error.message === "User not found") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.message === "Current password is incorrect") {
            return res.status(401).json({
                message: error.message
            });
        }

        next(error);
    }
};

export {
    getProfile,
    updateProfile,
    changeUserPassword
};