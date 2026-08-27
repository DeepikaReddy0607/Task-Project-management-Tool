import express from "express";
import cors from "cors";

import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";

import path from "path";

const app = express();

app.use(
    "/uploads",
    express.static(path.join(process.cwd(), "uploads"))
);
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
app.use("/api/users", userRoutes);

export default app;