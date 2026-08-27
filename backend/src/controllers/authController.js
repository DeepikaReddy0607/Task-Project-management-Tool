import {
    registerUser,
    loginUser,
    forgotPassword,
    resetPassword
} from "../services/authService.js";


const register = async (req, res, next) => {
    try {
        const {
            firstName,
            lastName,
            email,
            password,
            phone
        } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                message: "First name, last name, email and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const user = await registerUser({
            firstName,
            lastName,
            email,
            password,
            phone
        });

        return res.status(201).json({
            message: "Registration successful",
            user
        });

    } catch (error) {

        if (error.message === "Email already registered") {
            return res.status(409).json({
                message: error.message
            });
        }

        next(error);
    }
};


const login = async (req, res, next) => {
    try {

        const {
            email,
            password
        } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        // Login user
        const result = await loginUser(
            email,
            password
        );

        return res.status(200).json({
            message: "Login successful",
            ...result
        });

    } catch (error) {

        if (
            error.message === "Invalid email or password" ||
            error.message === "Account is inactive"
        ) {
            return res.status(401).json({
                message: error.message
            });
        }

        next(error);
    }
};

const forgotPasswordController = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const result = await forgotPassword(email);

        // Don't reveal whether the email exists
        if (!result) {
            return res.status(200).json({
                message:
                    "If an account with that email exists, a password reset link has been sent."
            });
        }

        return res.status(200).json({
            message: "Password reset token generated successfully",
            resetToken: result.token,
            expiresAt: result.expiresAt
        });

    } catch (error) {
        next(error);
    }
};

const resetPasswordController = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                message: "Token and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        await resetPassword(token, newPassword);

        return res.status(200).json({
            message: "Password reset successfully"
        });

    } catch (error) {

        if (error.message === "Invalid or expired reset token") {
            return res.status(400).json({
                message: error.message
            });
        }

        next(error);
    }
};

export {
    register,
    login,
    forgotPasswordController,
    resetPasswordController
};