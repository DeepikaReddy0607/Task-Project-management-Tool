import crypto from "node:crypto";
import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import { sendRegistrationOtpEmail } from "./mailService.js";

const OTP_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;    // 60 seconds
const MAX_VERIFICATION_ATTEMPTS = 5;     // 5 attempts max
const MAX_RESENDS = 5;                   // Maximum resends per pending registration

/**
 * Derives a keyed HMAC-SHA256 hash for an OTP bound to an email address.
 * Uses a dedicated server-side OTP_SECRET with secure fallbacks.
 */
function hashOtp(email, otp) {
    const secret =
        process.env.OTP_SECRET ||
        process.env.RESET_PASSWORD_SECRET ||
        process.env.JWT_SECRET ||
        "taskflow_otp_internal_keyed_secret";

    return crypto
        .createHmac("sha256", secret)
        .update(`${email.toLowerCase().trim()}:${otp}`)
        .digest("hex");
}

/**
 * Generates a cryptographically secure 6-digit numerical OTP.
 */
function generateSecureOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Timing-safe comparison of two hexadecimal hashes.
 */
function verifyHashConstantTime(hashA, hashB) {
    if (!hashA || !hashB) return false;
    try {
        const bufA = Buffer.from(hashA, "hex");
        const bufB = Buffer.from(hashB, "hex");
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

/**
 * Initiates the user registration flow by creating or updating a pending registration
 * and dispatching a 6-digit OTP to the user's email.
 * DOES NOT create a permanent user in taskflow.users.
 */
export const initiateRegistration = async (data) => {
    const {
        firstName,
        lastName,
        email,
        password,
        phone
    } = data;

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check whether email is already registered as a permanent user
    const existingUser = await prisma.users.findUnique({
        where: { email: normalizedEmail }
    });

    if (existingUser) {
        const error = new Error("Email already registered");
        error.statusCode = 409;
        throw error;
    }

    // 2. Validate default role exists in system
    const role = await prisma.roles.findUnique({
        where: { role_name: "Team Member" }
    });

    if (!role) {
        throw new Error("Default role not found");
    }

    // 3. Hash password using existing bcrypt configuration (cost factor 10)
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Generate cryptographically secure OTP & HMAC-SHA256
    const otp = generateSecureOtp();
    const otpHash = hashOtp(normalizedEmail, otp);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRATION_MS);

    // 5. Upsert pending registration record
    await prisma.pending_registrations.upsert({
        where: { email: normalizedEmail },
        create: {
            email: normalizedEmail,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone ? phone.trim() : null,
            password_hash: passwordHash,
            otp_hash: otpHash,
            otp_expires_at: otpExpiresAt,
            verification_attempts: 0,
            resend_count: 0,
            last_resend_at: new Date()
        },
        update: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone ? phone.trim() : null,
            password_hash: passwordHash,
            otp_hash: otpHash,
            otp_expires_at: otpExpiresAt,
            verification_attempts: 0,
            resend_count: 0,
            last_resend_at: new Date(),
            updated_at: new Date()
        }
    });

    // 6. Send OTP email (must not fail silently; if email fails, report failure)
    try {
        await sendRegistrationOtpEmail(normalizedEmail, otp, firstName.trim());
    } catch (mailError) {
        const errCode = mailError.code || mailError.responseCode || "ESMTPFAILED";
        console.error(
            `[REGISTRATION] Email dispatch failure [${errCode}]:`,
            mailError.message ? mailError.message.replace(/\b\d{6}\b/g, "[REDACTED_OTP]") : "No message"
        );

        // Remove pending registration record so no inconsistent state remains
        await prisma.pending_registrations.deleteMany({
            where: { email: normalizedEmail }
        }).catch((cleanupErr) => {
            console.error("[REGISTRATION] Pending registration cleanup failure:", cleanupErr.message);
        });

        const error = new Error("Failed to send verification email. Please check your email address and try again.");
        error.statusCode = 500;
        error.code = errCode;
        throw error;
    }

    return {
        message: "Verification code sent to your email",
        email: normalizedEmail
    };
};

/**
 * Validates the submitted OTP, ensures expiry and attempt limits are respected,
 * and atomically converts the pending registration into a permanent user record.
 */
export const verifyOtpAndCreateUser = async ({ email, otp }) => {
    if (!email || !otp) {
        const error = new Error("Email and verification code are required");
        error.statusCode = 400;
        throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
        const error = new Error("Verification code must be a 6-digit number");
        error.statusCode = 400;
        throw error;
    }

    // 1. Locate pending registration
    const pending = await prisma.pending_registrations.findUnique({
        where: { email: normalizedEmail }
    });

    if (!pending) {
        // Check if user is already verified and permanently registered
        const existingUser = await prisma.users.findUnique({
            where: { email: normalizedEmail }
        });
        if (existingUser) {
            const error = new Error("Email is already verified and registered. Please log in.");
            error.statusCode = 409;
            throw error;
        }

        const error = new Error("No pending registration found for this email. Please register again.");
        error.statusCode = 404;
        throw error;
    }

    // 2. Check if OTP has been invalidated due to prior failed attempts
    if (!pending.otp_hash) {
        const error = new Error("This verification code is no longer valid. Please request a new code.");
        error.statusCode = 400;
        throw error;
    }

    // 3. Check attempt limit
    if (pending.verification_attempts >= MAX_VERIFICATION_ATTEMPTS) {
        // Ensure OTP hash is cleared if not already
        if (pending.otp_hash) {
            await prisma.pending_registrations.update({
                where: { email: normalizedEmail },
                data: { otp_hash: null, updated_at: new Date() }
            });
        }

        const error = new Error("Maximum verification attempts exceeded. Please request a new verification code.");
        error.statusCode = 429;
        throw error;
    }

    // 4. Check expiration
    if (new Date() > new Date(pending.otp_expires_at)) {
        const error = new Error("Verification code has expired. Please request a new code.");
        error.statusCode = 400;
        throw error;
    }

    // 5. Verify keyed HMAC-SHA256 OTP hash
    const computedHash = hashOtp(normalizedEmail, cleanOtp);
    const isMatch = verifyHashConstantTime(computedHash, pending.otp_hash);

    if (!isMatch) {
        const newAttempts = pending.verification_attempts + 1;
        const reachedLimit = newAttempts >= MAX_VERIFICATION_ATTEMPTS;

        // Invalidate OTP hash on 5th failure, but keep record for resend
        await prisma.pending_registrations.update({
            where: { email: normalizedEmail },
            data: {
                verification_attempts: newAttempts,
                otp_hash: reachedLimit ? null : pending.otp_hash,
                updated_at: new Date()
            }
        });

        if (reachedLimit) {
            const error = new Error("Maximum verification attempts exceeded. Please request a new verification code.");
            error.statusCode = 429;
            throw error;
        }

        const remaining = MAX_VERIFICATION_ATTEMPTS - newAttempts;
        const error = new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
        error.statusCode = 400;
        throw error;
    }

    // 6. Default role lookup
    const role = await prisma.roles.findUnique({
        where: { role_name: "Team Member" }
    });

    if (!role) {
        throw new Error("Default role 'Team Member' not found");
    }

    // 7. Atomic transaction: create permanent user & delete pending registration
    // Concurrency protection: row locking / single-winner deletion prevents duplicate account creation.
    let permanentUser;
    try {
        permanentUser = await prisma.$transaction(async (tx) => {
            // Delete pending registration atomically. If count === 0, a concurrent request already processed it.
            const deleteResult = await tx.pending_registrations.deleteMany({
                where: { email: normalizedEmail }
            });

            if (deleteResult.count === 0) {
                const concurrentUser = await tx.users.findUnique({
                    where: { email: normalizedEmail }
                });
                if (concurrentUser) {
                    const err = new Error("Account has already been verified. Please log in.");
                    err.statusCode = 409;
                    throw err;
                }
                const err = new Error("Verification in progress or expired. Please check your credentials.");
                err.statusCode = 400;
                throw err;
            }

            // Create permanent user record with has_completed_onboarding: false
            const user = await tx.users.create({
                data: {
                    first_name: pending.first_name,
                    last_name: pending.last_name,
                    email: pending.email,
                    password_hash: pending.password_hash,
                    phone: pending.phone,
                    role_id: role.id,
                    is_active: true,
                    has_completed_onboarding: false
                },
                include: {
                    roles: true
                }
            });

            return user;
        });
    } catch (txError) {
        if (
            txError.code === "23505" ||
            txError.message?.includes("unique constraint") ||
            txError.message?.includes("duplicate key")
        ) {
            const err = new Error("Email is already registered and verified. Please log in.");
            err.statusCode = 409;
            throw err;
        }
        throw txError;
    }

    // 8. Return sanitized user object (never return password_hash or internal credentials)
    return {
        id: permanentUser.id,
        firstName: permanentUser.first_name,
        lastName: permanentUser.last_name,
        email: permanentUser.email,
        phone: permanentUser.phone,
        role: permanentUser.roles?.role_name || "Team Member",
        hasCompletedOnboarding: false
    };
};

/**
 * Resends a fresh OTP to the pending registrant, enforcing a 60s cooldown,
 * invalidating the prior OTP, and resetting verification attempts.
 */
export const resendRegistrationOtp = async ({ email }) => {
    if (!email) {
        const error = new Error("Email address is required");
        error.statusCode = 400;
        throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if user is already verified and registered
    const existingUser = await prisma.users.findUnique({
        where: { email: normalizedEmail }
    });

    if (existingUser) {
        const error = new Error("Email is already verified and registered. Please log in.");
        error.statusCode = 409;
        throw error;
    }

    // 2. Locate pending registration
    const pending = await prisma.pending_registrations.findUnique({
        where: { email: normalizedEmail }
    });

    if (!pending) {
        const error = new Error("No pending registration found for this email. Please register again.");
        error.statusCode = 404;
        throw error;
    }

    // 3. Enforce 60-second cooldown
    const now = Date.now();
    if (pending.last_resend_at) {
        const elapsed = now - new Date(pending.last_resend_at).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
            const retryAfterSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
            const error = new Error(`Please wait ${retryAfterSec} seconds before requesting a new code.`);
            error.statusCode = 429;
            error.retryAfter = retryAfterSec;
            throw error;
        }
    }

    // 4. Enforce session resend limit
    if (pending.resend_count >= MAX_RESENDS) {
        const error = new Error("Maximum resend limit reached for this registration session. Please register again later.");
        error.statusCode = 429;
        throw error;
    }

    // 5. Generate new secure OTP (invalidates previous OTP)
    const newOtp = generateSecureOtp();
    const newOtpHash = hashOtp(normalizedEmail, newOtp);
    const newExpiresAt = new Date(now + OTP_EXPIRATION_MS);

    // 6. Update database record: new hash, new expiry, reset attempt count, increment resend count
    await prisma.pending_registrations.update({
        where: { email: normalizedEmail },
        data: {
            otp_hash: newOtpHash,
            otp_expires_at: newExpiresAt,
            verification_attempts: 0,
            resend_count: pending.resend_count + 1,
            last_resend_at: new Date(now),
            updated_at: new Date(now)
        }
    });

    // 7. Dispatch fresh OTP email
    try {
        await sendRegistrationOtpEmail(normalizedEmail, newOtp, pending.first_name);
    } catch (mailError) {
        const errCode = mailError.code || mailError.responseCode || "ESMTPFAILED";
        console.error(
            `[RESEND_OTP] Email dispatch failure [${errCode}]:`,
            mailError.message ? mailError.message.replace(/\b\d{6}\b/g, "[REDACTED_OTP]") : "No message"
        );
        const error = new Error("Failed to send verification email. Please check your email address and try again.");
        error.statusCode = 500;
        error.code = errCode;
        throw error;
    }

    return {
        message: "A new verification code has been sent to your email.",
        email: normalizedEmail
    };
};
