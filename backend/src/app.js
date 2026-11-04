import express from "express";
import cors from "cors";
import { getCorsOptions } from "./config/cors.js";

import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import riskRoutes from "./routes/riskRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import subtaskRoutes from "./routes/subtaskRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import workspaceRoutes from "./routes/workspaceRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import quackieRoutes from "./routes/quackieRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import intelligenceRoutes from "./routes/intelligenceRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import attachmentRoutes from "./routes/attachmentRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import preferenceRoutes from "./routes/preferenceRoutes.js";
import productivityRoutes from "./routes/productivityRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import authMiddleware from "./middleware/authMiddleware.js";

const app = express();

app.use(cors(getCorsOptions()));
app.use(express.json());
// Direct static access to /uploads is disabled to enforce strict tenant isolation.
// All attachment downloads must use the authorized endpoint: GET /api/attachments/:id/download
app.use("/uploads", (req, res) => {
    res.status(403).json({
        success: false,
        message: "Direct file access is disabled. Use the authorized download endpoint: /api/attachments/:id/download"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        service: "TaskFlow Backend"
    });
});

app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api", riskRoutes);
app.use("/api", projectRoutes);
app.use("/api", taskRoutes);
app.use("/api", subtaskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api", commentRoutes);
app.use("/api", attachmentRoutes);
app.use("/api", fileRoutes);

app.use("/api/quackie", quackieRoutes);
app.use("/api", notificationRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/search", searchRoutes);
app.use("/api", activityRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/users/preferences", preferenceRoutes);
app.use("/api", productivityRoutes);
app.use("/api/chat", chatRoutes);

// Centralized 404 handler for unmatched API routes
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} not found`
    });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
    // 1. CORS origin violations
    if (err && err.message?.includes("CORS")) {
        return res.status(403).json({
            success: false,
            message: err.message
        });
    }

    // 2. Extract database error code if present
    const dbCode =
        err.code ||
        err.cause?.code ||
        err.driverAdapterError?.cause?.code ||
        err.originalError?.code ||
        null;

    const errMsg = typeof err.message === "string" ? err.message : "";

    // 3. PostgreSQL / Prisma Unique Constraint Violation -> 409 Conflict
    if (
        dbCode === "P2002" ||
        dbCode === "23505" ||
        errMsg.includes("Unique constraint failed") ||
        errMsg.includes("duplicate key value")
    ) {
        let msg = "A resource with these unique attributes already exists.";
        if (errMsg.includes("uq_workspace_member") || errMsg.includes("User is already a member of this workspace")) {
            msg = "User is already a member of this workspace";
        } else if (errMsg.includes("uq_project_member") || errMsg.includes("User is already a project member")) {
            msg = "User is already a project member";
        } else if (errMsg.includes("uq_workspace_label")) {
            msg = "A label with this name already exists in this workspace";
        } else if (errMsg.includes("pk_task_dependencies") || errMsg.includes("Dependency already exists")) {
            msg = "Dependency already exists";
        } else if (errMsg.includes("users_email_key") || err.meta?.target?.includes("email")) {
            msg = "Email is already registered";
        }
        return res.status(409).json({
            success: false,
            message: msg
        });
    }

    // 4. PostgreSQL / Prisma Check Constraint Violation -> 400 Bad Request
    if (
        dbCode === "23514" ||
        errMsg.includes("violates check constraint") ||
        errMsg.includes("chk_")
    ) {
        let msg = "Input data violates database validation constraint.";
        if (errMsg.includes("chk_project_dates")) {
            msg = "Project start date cannot be after end date";
        } else if (errMsg.includes("chk_task_dates")) {
            msg = "Task start date cannot be after due date";
        } else if (errMsg.includes("chk_task_priority")) {
            msg = "Invalid task priority";
        } else if (errMsg.includes("chk_task_status")) {
            msg = "Invalid task status";
        } else if (errMsg.includes("chk_subtask_status")) {
            msg = "Invalid subtask status";
        } else if (errMsg.includes("chk_notification_type")) {
            msg = "Invalid notification type";
        }
        return res.status(400).json({
            success: false,
            message: msg
        });
    }

    // 5. Foreign Key Constraint Violation -> 400 Bad Request
    if (
        dbCode === "P2003" ||
        dbCode === "23503" ||
        errMsg.includes("Foreign key constraint failed") ||
        errMsg.includes("violates foreign key constraint")
    ) {
        return res.status(400).json({
            success: false,
            message: "Referenced resource does not exist or is currently in use."
        });
    }

    // 6. Prisma Record Not Found -> 404 Not Found
    if (dbCode === "P2025" || errMsg.includes("Record to update not found") || errMsg.includes("Record to delete not found")) {
        return res.status(404).json({
            success: false,
            message: "Resource not found"
        });
    }

    // 7. Invalid Parameter / UUID Syntax -> 400 Bad Request
    if (
        dbCode === "22P02" ||
        errMsg.includes("invalid input syntax") ||
        errMsg.includes("Inconsistent column data: Conversion failed")
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid input syntax for parameter or identifier."
        });
    }

    // 8. String Length Exceeded -> 400 Bad Request
    if (
        dbCode === "22001" ||
        errMsg.includes("value too long for type character varying")
    ) {
        return res.status(400).json({
            success: false,
            message: "Input value exceeds maximum allowed character length."
        });
    }

    // 9. Standard HTTP Errors with status codes < 500
    const statusCode = err.status || err.statusCode || 500;
    if (statusCode < 500) {
        return res.status(statusCode).json({
            success: false,
            message: err.message || "Request failed"
        });
    }

    // 10. Unhandled 500 Server Errors (Never expose SQL queries or internals)
    console.error("Unhandled Application Error:", err);
    return res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});

export default app;