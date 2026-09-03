import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

const sendPasswordResetEmail = async (email, resetLink) => {
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
};

export {
    sendPasswordResetEmail
};