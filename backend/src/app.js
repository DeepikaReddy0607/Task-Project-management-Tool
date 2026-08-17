import express from "express";
import cors from "cors";

import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";

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

export default app;