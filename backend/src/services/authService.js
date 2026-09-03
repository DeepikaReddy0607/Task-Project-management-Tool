import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { sendPasswordResetEmail } from "./mailService.js";

const registerUser = async (data) => {
    const {
        firstName,
        lastName,
        email,
        password,
        phone
    } = data;

    // Check whether email already exists
    const existingUser = await prisma.users.findUnique({
        where: {
            email: email.toLowerCase()
        }
    });

    if (existingUser) {
        throw new Error("Email already registered");
    }

    // Get default role
    const role = await prisma.roles.findUnique({
        where: {
            role_name: "Team Member"
        }
    });

    if (!role) {
        throw new Error("Default role not found");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.users.create({
        data: {
            first_name: firstName,
            last_name: lastName,
            email: email.toLowerCase(),
            password_hash: passwordHash,
            phone: phone || null,
            role_id: role.id
        },
        include: {
            roles: true
        }
    });

    // Never return password hash
    return {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.roles.role_name
    };
};


const loginUser = async (email, password) => {

    // 1. Find user
    const user = await prisma.users.findUnique({
        where: {
            email: email.toLowerCase()
        },
        include: {
            roles: true
        }
    });

    // 2. User doesn't exist
    if (!user) {
        throw new Error("Invalid email or password");
    }

    // 3. Check whether account is active
    if (!user.is_active) {
        throw new Error("Account is inactive");
    }

    // 4. Compare entered password with hashed password
    const passwordMatch = await bcrypt.compare(
        password,
        user.password_hash
    );

    if (!passwordMatch) {
        throw new Error("Invalid email or password");
    }

    // 5. Create JWT token
    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.roles.role_name
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "1d"
        }
    );

    // 6. Return token and user information
    return {
        token,
        user: {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phone: user.phone,
            role: user.roles.role_name
        }
    };
};

const requestPasswordReset = async (email) => {

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.users.findUnique({
        where: {
            email: normalizedEmail
        }
    });

    // Do not reveal whether the email exists
    if (!user) {
        return;
    }

    if (!user.is_active) {
        return;
    }

    const resetToken = jwt.sign(
        {
            userId: user.id,
            purpose: "password-reset"
        },
        process.env.RESET_PASSWORD_SECRET,
        {
            expiresIn: "15m"
        }
    );

    const resetLink =
        `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await sendPasswordResetEmail(
        user.email,
        resetLink
    );
};


const resetPassword = async (token, newPassword) => {

    let decoded;

    try {
        decoded = jwt.verify(
            token,
            process.env.RESET_PASSWORD_SECRET
        );
    } catch (error) {

        const resetError = new Error(
            "Reset link is invalid or expired"
        );

        resetError.statusCode = 400;

        throw resetError;
    }

    if (
        decoded.purpose !== "password-reset" ||
        !decoded.userId
    ) {
        const resetError = new Error(
            "Invalid password reset token"
        );

        resetError.statusCode = 400;

        throw resetError;
    }

    const user = await prisma.users.findUnique({
        where: {
            id: decoded.userId
        }
    });

    if (!user || !user.is_active) {
        const resetError = new Error(
            "Invalid password reset request"
        );

        resetError.statusCode = 400;

        throw resetError;
    }

    const passwordHash = await bcrypt.hash(
        newPassword,
        10
    );

    await prisma.users.update({
        where: {
            id: user.id
        },
        data: {
            password_hash: passwordHash
        }
    });

    return {
        message: "Password reset successful"
    };
};

export { registerUser, loginUser, requestPasswordReset, resetPassword };