import nodemailer from "nodemailer";

const sendEmail = async ({ to, subject, text, html }) => {
    const environment = process.env.NODE_ENV;
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    // SMTP host is mandatory for real email delivery.
    if (!smtpHost) {
        // Mock delivery is permitted only in development and test.
        if (environment === "development" || environment === "test") {
            console.log(
                `[EMAIL DEV MOCK] Skipped sending email to ${to}: ${subject}`
            );

            return { messageId: "dev-mock-id" };
        }

        throw new Error(
            "Email delivery configuration error: SMTP_HOST is not configured."
        );
    }

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        ...(smtpUser && smtpPass
            ? {
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            }
            : {})
    });

    const mailOptions = {
        from: process.env.SMTP_FROM || smtpUser,
        to,
        subject,
        text,
        html
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`Email sent to ${to}: ${info.messageId}`);

    return info;
};

export default sendEmail;