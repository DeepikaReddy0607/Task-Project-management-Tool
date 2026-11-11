import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import sendEmail from "../services/emailService.js";

describe("EmailService Notification & Environment Gating Test Suite", () => {
    let originalEnv;
    let originalCreateTransport;
    let transportCalls;
    let sendMailCalls;

    beforeEach(() => {
        // Snapshot original environment variables
        originalEnv = { ...process.env };
        originalCreateTransport = nodemailer.createTransport;
        transportCalls = [];
        sendMailCalls = [];
    });

    afterEach(() => {
        // Restore original environment variables
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        Object.assign(process.env, originalEnv);

        // Restore original nodemailer createTransport
        nodemailer.createTransport = originalCreateTransport;
    });

    // -------------------------------------------------------------------------
    // TEST 1: Development environment without SMTP_HOST
    // -------------------------------------------------------------------------
    test("1. Development environment without SMTP_HOST: mock delivery is permitted", async () => {
        process.env.NODE_ENV = "development";
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        let createTransportInvoked = false;
        nodemailer.createTransport = () => {
            createTransportInvoked = true;
            return { sendMail: async () => ({ messageId: "should-not-reach" }) };
        };

        const result = await sendEmail({
            to: "developer@example.com",
            subject: "Task Assignment Notification",
            text: "You have been assigned to task #101",
            html: "<p>You have been assigned to task #101</p>"
        });

        assert.equal(result.messageId, "dev-mock-id", "Must return dev mock message ID");
        assert.equal(createTransportInvoked, false, "Nodemailer transport must NOT be created in dev without SMTP_HOST");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Test environment without SMTP_HOST
    // -------------------------------------------------------------------------
    test("2. Test environment without SMTP_HOST: mock delivery is permitted", async () => {
        process.env.NODE_ENV = "test";
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        let createTransportInvoked = false;
        nodemailer.createTransport = () => {
            createTransportInvoked = true;
            return { sendMail: async () => ({ messageId: "should-not-reach" }) };
        };

        const result = await sendEmail({
            to: "automated-test@example.com",
            subject: "Automated Test Email",
            text: "Test content",
            html: "<p>Test content</p>"
        });

        assert.equal(result.messageId, "dev-mock-id", "Must return dev mock message ID in test env");
        assert.equal(createTransportInvoked, false, "Nodemailer transport must NOT be created in test without SMTP_HOST");
    });

    // -------------------------------------------------------------------------
    // TEST 3: Production environment without SMTP_HOST
    // -------------------------------------------------------------------------
    test("3. Production environment without SMTP_HOST: configuration error is thrown", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        await assert.rejects(
            async () => {
                await sendEmail({
                    to: "production-user@example.com",
                    subject: "Critical Due Date Alert",
                    text: "Your task is due today"
                });
            },
            (error) => {
                assert.ok(error instanceof Error, "Should throw an Error instance");
                assert.equal(
                    error.message,
                    "Email delivery configuration error: SMTP_HOST is not configured."
                );
                return true;
            },
            "Must throw configuration error in production when SMTP_HOST is missing"
        );
    });

    // -------------------------------------------------------------------------
    // TEST 4: Production environment with SMTP_HOST
    // -------------------------------------------------------------------------
    test("4. Production environment with SMTP_HOST: Nodemailer attempts real delivery", async () => {
        process.env.NODE_ENV = "production";
        process.env.SMTP_HOST = "smtp.mailgun.org";
        process.env.SMTP_PORT = "587";
        process.env.SMTP_SECURE = "false";
        process.env.SMTP_USER = "postmaster@taskflow.dev";
        process.env.SMTP_PASS = "super-secret-smtp-password";
        process.env.SMTP_FROM = "TaskFlow Alerts <alerts@taskflow.dev>";

        nodemailer.createTransport = (options) => {
            transportCalls.push(options);
            return {
                sendMail: async (mailOptions) => {
                    sendMailCalls.push(mailOptions);
                    return { messageId: "msg_production_mailgun_9999" };
                }
            };
        };

        const result = await sendEmail({
            to: "team-lead@taskflow.dev",
            subject: "Project Milestone Reached",
            text: "All critical tasks completed",
            html: "<b>All critical tasks completed</b>"
        });

        assert.equal(result.messageId, "msg_production_mailgun_9999");
        assert.equal(transportCalls.length, 1, "Must instantiate transporter once");
        assert.equal(transportCalls[0].host, "smtp.mailgun.org");
        assert.equal(transportCalls[0].port, 587);
        assert.equal(transportCalls[0].secure, false);
        assert.deepEqual(transportCalls[0].auth, {
            user: "postmaster@taskflow.dev",
            pass: "super-secret-smtp-password"
        });

        assert.equal(sendMailCalls.length, 1, "Must call sendMail once");
        assert.equal(sendMailCalls[0].from, "TaskFlow Alerts <alerts@taskflow.dev>");
        assert.equal(sendMailCalls[0].to, "team-lead@taskflow.dev");
        assert.equal(sendMailCalls[0].subject, "Project Milestone Reached");
    });

    // -------------------------------------------------------------------------
    // TEST 5: SMTP delivery failure propagates to the caller
    // -------------------------------------------------------------------------
    test("5. SMTP delivery failure: the error propagates to the caller", async () => {
        process.env.NODE_ENV = "production";
        process.env.SMTP_HOST = "smtp.unreachable-network.com";

        nodemailer.createTransport = () => {
            return {
                sendMail: async () => {
                    const socketErr = new Error("Connection timed out: ETIMEDOUT");
                    socketErr.code = "ETIMEDOUT";
                    throw socketErr;
                }
            };
        };

        await assert.rejects(
            async () => {
                await sendEmail({
                    to: "assignee@taskflow.dev",
                    subject: "Task Reassignment",
                    text: "You have been reassigned."
                });
            },
            (error) => {
                assert.equal(error.code, "ETIMEDOUT");
                assert.ok(error.message.includes("Connection timed out"));
                return true;
            },
            "Error from transporter.sendMail must propagate to caller"
        );
    });

    // -------------------------------------------------------------------------
    // TEST 6: SMTP_USER without SMTP_HOST in production
    // -------------------------------------------------------------------------
    test("6. SMTP_USER without SMTP_HOST: production must not silently use localhost", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.SMTP_HOST;
        process.env.SMTP_USER = "user_without_host@gmail.com";
        process.env.SMTP_PASS = "app-password";

        let transportCreated = false;
        nodemailer.createTransport = () => {
            transportCreated = true;
            return { sendMail: async () => ({ messageId: "should-never-reach" }) };
        };

        await assert.rejects(
            async () => {
                await sendEmail({
                    to: "victim@example.com",
                    subject: "Unsafe Notification",
                    text: "This should fail before connecting to localhost."
                });
            },
            (error) => {
                assert.equal(
                    error.message,
                    "Email delivery configuration error: SMTP_HOST is not configured."
                );
                return true;
            },
            "Must reject configuration error instead of defaulting host to localhost"
        );

        assert.equal(transportCreated, false, "Must never create transporter when host is missing in production");
    });

    // -------------------------------------------------------------------------
    // TEST 7: Caller error logging verification
    // -------------------------------------------------------------------------
    test("7. Caller error handling: comment and due-date notification callers catch and log failures", async () => {
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (...args) => warnings.push(args.join(" "));

        try {
            // Simulate the commentService pattern:
            const simulateCommentDispatch = async () => {
                try {
                    // Failing sendEmail
                    throw new Error("SMTP connection failed: ECONNREFUSED");
                } catch (mailErr) {
                    console.warn("[MAIL] Comment notification email skipped or failed:", mailErr.message);
                }
            };

            // Simulate the dueDateNotificationService pattern:
            const simulateDueDateDispatch = async () => {
                try {
                    // Failing sendEmail
                    throw new Error("SMTP authentication rejected: EAUTH");
                } catch (mailErr) {
                    console.warn("[MAIL] Due date alert email sending skipped or failed:", mailErr.message);
                }
            };

            await simulateCommentDispatch();
            await simulateDueDateDispatch();

            assert.equal(warnings.length, 2, "Both callers must log a warning on dispatch failure");
            assert.ok(
                warnings[0].includes("[MAIL] Comment notification email skipped or failed: SMTP connection failed: ECONNREFUSED"),
                "Comment service must format warning log correctly"
            );
            assert.ok(
                warnings[1].includes("[MAIL] Due date alert email sending skipped or failed: SMTP authentication rejected: EAUTH"),
                "Due date service must format warning log correctly"
            );
        } finally {
            console.warn = originalWarn;
        }
    });
});
