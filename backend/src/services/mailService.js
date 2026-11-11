import { Resend } from "resend";

export const RESEND_TIMEOUT_MS = 10000; // 10s maximum timeout for Resend API calls

// Backward compatibility stubs for legacy references
export const SMTP_TIMEOUTS = {
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
};
export const transporter = null;

/**
 * Detects whether execution is running inside automated test suites.
 */
export const isTestRunner = () => {
    return Boolean(
        process.env.NODE_ENV === "test" ||
        process.execArgv.includes("--test") ||
        process.argv.some((a) => typeof a === "string" && (a.includes(".test.") || a.includes("--test")))
    );
};

/**
 * Sanitizes error messages for safe logging without exposing passwords,
 * OTP codes, API keys, credentials, or personal secrets.
 */
export const sanitizeErrorMessage = (message) => {
    if (!message || typeof message !== "string") return "Unknown error";
    return message
        .replace(/([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})/g, (match, user, host, ext) => {
            const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : "***";
            return `${maskedUser}@${host}.${ext}`;
        })
        .replace(/re_[a-zA-Z0-9_]{15,}/g, "re_[REDACTED_API_KEY]")
        .replace(/(?:pass(?:word)?|auth|secret|token)\s*[:=]\s*\S+/gi, "credential=[REDACTED]")
        .replace(/\b\d{6}\b/g, "[REDACTED_OTP]");
};

/**
 * Resolves the sender email address from environment variables.
 * Defaults to 'onboarding@resend.dev' if not configured.
 */
export const getSenderEmail = () => {
    const fromEnv = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    if (fromEnv.includes("<") && fromEnv.includes(">")) {
        return fromEnv;
    }
    return `TaskFlow <${fromEnv}>`;
};

let mailMock = null;
let resendClientOverride = null;
let cachedClient = null;
let cachedApiKey = null;

export const setMailMock = (mockFn) => {
    mailMock = mockFn;
};

export const setResendClientOverride = (client) => {
    resendClientOverride = client;
};

export const getResendClient = () => {
    if (resendClientOverride) {
        return resendClientOverride;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return null;
    }
    if (cachedClient && cachedApiKey === apiKey) {
        return cachedClient;
    }
    cachedApiKey = apiKey;
    cachedClient = new Resend(apiKey);
    return cachedClient;
};

/**
 * Determines whether real network delivery should be skipped.
 * In automated test suites, real external email delivery is prevented unless
 * an explicit mock has been configured via setResendClientOverride.
 */
export const shouldSkipLiveDelivery = () => {
    if (isTestRunner() && !resendClientOverride) {
        return true;
    }
    return !process.env.RESEND_API_KEY;
};

/**
 * Executes a promise with an enforced timeout.
 */
export const sendWithTimeout = async (promise, timeoutMs = RESEND_TIMEOUT_MS) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const timeoutError = new Error(`Email delivery timed out after ${timeoutMs}ms`);
            timeoutError.code = "ETIMEDOUT";
            reject(timeoutError);
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
};

// Log initialization status on startup in non-test environments
if (!isTestRunner()) {
    if (process.env.RESEND_API_KEY) {
        console.log(`[EMAIL] Resend email provider initialized (Sender: ${getSenderEmail()}).`);
    } else {
        console.warn("[EMAIL] RESEND_API_KEY is not configured. Email delivery will use dev fallback.");
    }
}

/**
 * Sends a password reset email using the Resend API.
 */
export const sendPasswordResetEmail = async (email, resetLink) => {
    try {
        if (mailMock) {
            return await mailMock({ type: "PASSWORD_RESET", email, resetLink });
        }

        if (shouldSkipLiveDelivery()) {
            if (process.env.NODE_ENV === "production") {
                const err = new Error("Email service is temporarily unavailable. Please try again later.");
                err.code = "ERESENDUNAVAILABLE";
                throw err;
            }
            if (process.env.LOG_DEV_AUTH_TOKENS === "true") {
                console.log(`[AUTH DEV] Password reset link for ${email}: ${resetLink}`);
            } else {
                console.log(`[AUTH] Password reset instructions dispatched for ${email}`);
            }
            return { id: "dev-test-mock-id" };
        }

        const client = getResendClient();
        const from = getSenderEmail();

        const sendPromise = client.emails.send({
            from,
            to: email,
            subject: "TaskFlow Password Reset",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                    <h2>Reset your TaskFlow password</h2>

                    <p>
                        We received a request to reset your TaskFlow password.
                    </p>

                    <p>
                        Click the button below to choose a new password.
                    </p>

                    <a
                        href="${resetLink}"
                        style="
                            display:inline-block;
                            padding:12px 20px;
                            background:#6f9561;
                            color:white;
                            text-decoration:none;
                            border-radius:6px;
                        "
                    >
                        Reset Password
                    </a>

                    <p style="margin-top:20px;">
                        This link expires in 15 minutes.
                    </p>

                    <p>
                        If you did not request this, you can safely ignore this email.
                    </p>
                </div>
            `
        });

        const result = await sendWithTimeout(sendPromise, RESEND_TIMEOUT_MS);
        if (result?.error) {
            const err = new Error(result.error.message || "Failed to send password reset email");
            err.code = result.error.name || "ERESENDFAILED";
            err.statusCode = result.error.statusCode;
            throw err;
        }

        return result?.data;
    } catch (error) {
        const errCode = error?.code || error?.statusCode || "ERESENDFAILED";
        console.error(`[AUTH] Failed to send password reset email [${errCode}]:`, sanitizeErrorMessage(error?.message));

        if (process.env.NODE_ENV !== "production" && process.env.LOG_DEV_AUTH_TOKENS === "true") {
            console.log(`[AUTH DEV] Password reset link for ${email}: ${resetLink}`);
        }
        if (!error.code) {
            error.code = errCode;
        }
    }
};

/**
 * Sends a registration OTP verification email using the Resend API.
 */
export const sendRegistrationOtpEmail = async (email, otp, firstName) => {
    try {
        if (mailMock) {
            return await mailMock({ type: "OTP", email, otp, firstName });
        }

        if (shouldSkipLiveDelivery()) {
            if (process.env.NODE_ENV === "production") {
                const err = new Error("Email service is temporarily unavailable. Please try again later.");
                err.code = "ERESENDUNAVAILABLE";
                throw err;
            }
            if (process.env.LOG_DEV_AUTH_TOKENS === "true") {
                console.log(`[AUTH DEV] Registration OTP for ${email}: ${otp}`);
            } else {
                console.log(`[AUTH] Verification OTP email dispatched for ${email}`);
            }
            return { id: "dev-test-mock-id" };
        }

        const client = getResendClient();
        const from = getSenderEmail();

        const sendPromise = client.emails.send({
            from,
            to: email,
            subject: `${otp} is your TaskFlow verification code`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                    <div style="margin-bottom: 20px;">
                        <span style="font-size: 24px; font-weight: bold; color: #3b5930; letter-spacing: -0.5px;">TaskFlow</span>
                    </div>

                    <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Confirm your email address</h2>

                    <p style="color: #475569; font-size: 15px; line-height: 1.5;">
                        Hi ${firstName ? firstName : "there"},
                    </p>

                    <p style="color: #475569; font-size: 15px; line-height: 1.5;">
                        Thank you for registering with TaskFlow. Use the 6-digit verification code below to complete your registration:
                    </p>

                    <div style="margin: 28px 0; text-align: center;">
                        <span style="display: inline-block; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2e4a23; background: #f0f4ee; padding: 14px 28px; border-radius: 10px; border: 1px solid #d4e0cf; font-family: monospace;">
                            ${otp}
                        </span>
                    </div>

                    <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
                        ⏳ <strong>This code expires in 5 minutes.</strong>
                    </p>

                    <p style="color: #94a3b8; font-size: 13px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                        If you did not request this verification code, you can safely ignore this email. Never share this code with anyone.
                    </p>
                </div>
            `
        });

        const result = await sendWithTimeout(sendPromise, RESEND_TIMEOUT_MS);
        if (result?.error) {
            const err = new Error(result.error.message || "Failed to send registration OTP email");
            err.code = result.error.name || "ERESENDFAILED";
            err.statusCode = result.error.statusCode;
            throw err;
        }

        return result?.data;
    } catch (error) {
        const errCode = error?.code || error?.statusCode || "ERESENDFAILED";
        console.error(`[AUTH] Failed to send registration OTP email [${errCode}]:`, sanitizeErrorMessage(error?.message));
        if (!error.code) {
            error.code = errCode;
        }
        throw error;
    }
};
