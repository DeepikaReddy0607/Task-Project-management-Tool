import {
    getMyProfile,
    updateMyProfile
} from "../services/userService.js";


const getProfile = async (req, res, next) => {
    try {
        const user = await getMyProfile(
            req.user.userId
        );

        return res.status(200).json({
            message: "Profile retrieved successfully",
            user
        });

    } catch (error) {
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

        const user = await updateMyProfile(
            req.user.userId,
            {
                firstName,
                lastName,
                phone
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

        if (
            error.message ===
                "First name cannot be empty" ||
            error.message ===
                "Last name cannot be empty"
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};


export {
    getProfile,
    updateProfile
};