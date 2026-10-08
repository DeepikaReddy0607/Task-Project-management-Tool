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
const sendPasswordResetEmail = async (email, resetLink) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            console.log(`[AUTH DEV] Password reset link for ${email}: ${resetLink}`);
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

        // Preserve development usability when email configuration is unavailable.
        console.log(`[AUTH DEV] Password reset link for ${email}: ${resetLink}`);
    }
};

export {
    sendPasswordResetEmail
};