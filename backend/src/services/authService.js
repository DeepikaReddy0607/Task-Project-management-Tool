import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { sendPasswordResetEmail } from "./mailService.js";
import { createActivity, createBatchActivities } from "./activityService.js";

let isUsedTokensTableReady = false;
const ensureUsedPasswordResetTokensTable = async () => {
    if (isUsedTokensTableReady) return;
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS taskflow.used_password_reset_tokens (
            token_hash VARCHAR(64) PRIMARY KEY,
            user_id UUID NOT NULL,
            used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_used_password_reset_tokens_expires ON taskflow.used_password_reset_tokens (expires_at);
    `);
    isUsedTokensTableReady = true;
};

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
            role_id: role.id,
            has_completed_onboarding: false
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
        role: user.roles.role_name,
        hasCompletedOnboarding: false
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

    const memberships = await prisma.workspace_members.findMany({
        where: {
            user_id: user.id
        },
        include: {
            workspaces: true
        }
    });

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

    if (memberships.length > 0) {
        try {
            await createBatchActivities(
                memberships.map((membership) => ({
                    workspaceId: membership.workspace_id,
                    userId: user.id,
                    actionType: "LOGIN",
                    entityType: "USER",
                    entityId: user.id,
                    description: `${user.first_name} ${user.last_name} logged in`
                }))
            );
        } catch (actErr) {
            console.error("Batch login activity logging error:", actErr.message);
        }
    }

    // 6. Return token and user information
    const hasCompletedOnboarding = Boolean(
        user.has_completed_onboarding || (memberships && memberships.length > 0)
    );

    return {
        token,
        user: {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phone: user.phone,
            role: user.roles.role_name,
            hasCompletedOnboarding
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
            purpose: "password-reset",
            jti: crypto.randomUUID()
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

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await ensureUsedPasswordResetTokensTable();

    // Check if token has already been marked as used
    const existing = await prisma.$queryRawUnsafe(
        `SELECT token_hash FROM taskflow.used_password_reset_tokens WHERE token_hash = $1`,
        tokenHash
    );

    if (existing && existing.length > 0) {
        const resetError = new Error(
            "Password reset token has already been used"
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

    const expiresAt = decoded.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 15 * 60 * 1000);

    // Atomic transaction: mark token as used AND update password.
    // If concurrent requests attempt to use the same token simultaneously,
    // PostgreSQL unique constraint on token_hash (PK) guarantees that exactly ONE commits,
    // and the other fails with a unique constraint violation (code 23505).
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `INSERT INTO taskflow.used_password_reset_tokens (token_hash, user_id, used_at, expires_at)
                 VALUES ($1, $2::uuid, NOW(), $3::timestamptz)`,
                tokenHash,
                user.id,
                expiresAt.toISOString()
            );

            await tx.users.update({
                where: {
                    id: user.id
                },
                data: {
                    password_hash: passwordHash,
                    updated_at: new Date()
                }
            });
        });
    } catch (txError) {
        if (
            txError.code === "23505" ||
            txError.message?.includes("unique constraint") ||
            txError.message?.includes("duplicate key")
        ) {
            const err = new Error("Password reset token has already been used");
            err.statusCode = 400;
            throw err;
        }
        throw txError;
    }

    return {
        message: "Password reset successful"
    };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.users.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error("User not found");
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password_hash
  );

  if (!isCurrentPasswordValid) {
    throw new Error("Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw new Error(
      "New password must be different from your current password"
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.users.update({
    where: { id: userId },
    data: {
      password_hash: hashedPassword
    }
  });

  return {
    message: "Password updated successfully"
  };
};

export {
    registerUser,
    loginUser,
    requestPasswordReset,
    resetPassword,
    changePassword,
    ensureUsedPasswordResetTokensTable
};