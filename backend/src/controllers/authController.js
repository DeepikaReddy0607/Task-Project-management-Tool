import {
    registerUser,
    loginUser
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


export {
    register,
    login
};