import express from "express";
import cors from "cors";

import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import riskRoutes from "./routes/riskRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";

import workspaceRoutes from "./routes/workspaceRoutes.js";
const app = express();

app.use(cors());
app.use(express.json());

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

export default app;