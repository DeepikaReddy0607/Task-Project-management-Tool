import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
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