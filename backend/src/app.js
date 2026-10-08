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
import reportRoutes from "./routes/reportRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

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
app.use("/api/reports", reportRoutes);

export default app;