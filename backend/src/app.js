import express from "express";
import cors from "cors";

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
import authMiddleware from "./middleware/authMiddleware.js";

const app = express();

app.use(cors());
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

// Centralized 404 handler for unmatched API routes
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} not found`
    });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    if (statusCode >= 500) {
        console.error("Unhandled Application Error:", err);
    }
    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error"
    });
});

export default app;