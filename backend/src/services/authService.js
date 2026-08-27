import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../config/prisma.js";

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

const forgotPassword = async (email) => {
    const normalizedEmail = email.toLowerCase();

    // Find user
    const user = await prisma.users.findUnique({
        where: {
            email: normalizedEmail
        }
    });

    // Don't reveal whether the email exists
    if (!user) {
        return null;
    }

    // Delete any previous reset tokens for this user
    await prisma.password_reset_tokens.deleteMany({
        where: {
            user_id: user.id
        }
    });

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");

    // Token expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Store token
    await prisma.password_reset_tokens.create({
        data: {
            user_id: user.id,
            token,
            expires_at: expiresAt
        }
    });

    return {
        token,
        expiresAt
    };
};

const resetPassword = async (token, newPassword) => {
    // Find the reset token
    const resetToken = await prisma.password_reset_tokens.findUnique({
        where: {
            token
        }
    });

    // Token doesn't exist
    if (!resetToken) {
        throw new Error("Invalid or expired reset token");
    }

    // Check whether token has expired
    if (new Date() > resetToken.expires_at) {
        // Delete expired token
        await prisma.password_reset_tokens.delete({
            where: {
                id: resetToken.id
            }
        });

        throw new Error("Invalid or expired reset token");
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await prisma.users.update({
        where: {
            id: resetToken.user_id
        },
        data: {
            password_hash: passwordHash,
            updated_at: new Date()
        }
    });

    // Delete token so it cannot be reused
    await prisma.password_reset_tokens.delete({
        where: {
            id: resetToken.id
        }
    });

    return true;
};

export { registerUser, loginUser, forgotPassword, resetPassword };