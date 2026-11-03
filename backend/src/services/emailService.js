import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "localhost",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendEmail = async ({
    to,
    subject,
    text,
    html
}) => {
    // If SMTP credentials or host are not configured, do not attempt blocking network calls
    if (!process.env.SMTP_HOST && !process.env.SMTP_USER) {
        console.log(`[EMAIL DEV MOCK] Skipped sending email to ${to} (no SMTP configured): ${subject}`);
        return { messageId: "dev-mock-id" };
    }

    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(
        `Email sent to ${to}: ${info.messageId}`
    );

    return info;
};

export default sendEmail;
