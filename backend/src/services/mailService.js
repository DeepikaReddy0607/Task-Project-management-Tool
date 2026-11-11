import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});
transporter.verify()
    .then(() => {
        console.log("[EMAIL] Gmail SMTP connection verified successfully.");
    })
    .catch((error) => {
        console.error("[EMAIL] Gmail SMTP verification failed:", error);
    });
let mailMock = null;

export const setMailMock = (mockFn) => {
    mailMock = mockFn;
};

const sendPasswordResetEmail = async (email, resetLink) => {
    try {
        if (mailMock) {
            return await mailMock({ type: "PASSWORD_RESET", email, resetLink });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            if (process.env.NODE_ENV === "production") {
                const err = new Error("Email service is temporarily unavailable. Please try again later.");
                err.code = "ESMTPUNAVAILABLE";
                throw err;
            }
            if (process.env.LOG_DEV_AUTH_TOKENS === "true") {
                console.log(`[AUTH DEV] Password reset link for ${email}: ${resetLink}`);
            } else {
                console.log(`[AUTH] Password reset instructions dispatched for ${email}`);
            }
            return;
        }

        await transporter.sendMail({
            from: `"TaskFlow" <${process.env.EMAIL_USER}>`,
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
    } catch (error) {
        console.error("[AUTH] Failed to send password reset email:", error);

        if (process.env.NODE_ENV !== "production" && process.env.LOG_DEV_AUTH_TOKENS === "true") {
            console.log(`[AUTH DEV] Password reset link for ${email}: ${resetLink}`);
        }
    }
};

const sendRegistrationOtpEmail = async (email, otp, firstName) => {
    try {
        if (mailMock) {
            return await mailMock({ type: "OTP", email, otp, firstName });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            if (process.env.NODE_ENV === "production") {
                const err = new Error("Email service is temporarily unavailable. Please try again later.");
                err.code = "ESMTPUNAVAILABLE";
                throw err;
            }
            if (process.env.LOG_DEV_AUTH_TOKENS === "true") {
                console.log(`[AUTH DEV] Registration OTP for ${email}: ${otp}`);
            } else {
                console.log(`[AUTH] Verification OTP email dispatched for ${email}`);
            }
            return;
        }

        await transporter.sendMail({
            from: `"TaskFlow" <${process.env.EMAIL_USER}>`,
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
    } catch (error) {
        console.error("[AUTH] Failed to send registration OTP email:", error.message);
        throw error;
    }
};

export {
    sendPasswordResetEmail,
    sendRegistrationOtpEmail
};
