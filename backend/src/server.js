process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";
import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import http from "http";
import app from "./app.js";
import { initSocket } from "./socket.js";
import cron from "node-cron";
import checkApproachingDueDates from "./services/dueDateNotificationService.js";

const PORT = process.env.PORT || 5000;
const isClusterMode = process.env.CLUSTER_MODE === "true";

if (isClusterMode && cluster.isPrimary) {
    const numWorkers = parseInt(process.env.CLUSTER_WORKERS, 10) || Math.min(4, Math.max(2, os.cpus().length - 1));
    console.log(`[CLUSTER PRIMARY] Primary process ${process.pid} is running. Forking ${numWorkers} workers...`);

    const relayIpcMessage = (senderWorker, msg) => {
        if (msg && typeof msg.type === "string" && msg.type.startsWith("TASKFLOW_")) {
            for (const id in cluster.workers) {
                const peer = cluster.workers[id];
                if (peer && peer.id !== senderWorker.id) {
                    try { peer.send(msg); } catch {}
                }
            }
        }
    };

    for (let i = 0; i < numWorkers; i++) {
        const worker = cluster.fork();
        worker.on("message", (msg) => relayIpcMessage(worker, msg));
    }

    cluster.on("exit", (worker, code, signal) => {
        console.warn(`[CLUSTER PRIMARY] Worker ${worker.process.pid} died (${signal || code}). Spawning replacement...`);
        const newWorker = cluster.fork();
        newWorker.on("message", (msg) => relayIpcMessage(newWorker, msg));
    });

    // Run cron job only on the primary process to prevent duplicate execution across workers
    cron.schedule("0 9 * * *", async () => {
        console.log("Running due date notification check...");
        try {
            await checkApproachingDueDates();
        } catch (error) {
            console.error("Due date notification check failed:", error);
        }
    });

} else {
    // Worker process or single-process mode
    const server = http.createServer(app);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    initSocket(server);

    server.listen(PORT, 2048, () => {
        const role = isClusterMode ? `Cluster Worker ${process.pid}` : "Single Process";
        console.log(`TaskFlow Backend (${role}) running on port ${PORT}`);
    });

    // In single-process mode, schedule the cron job
    if (!isClusterMode) {
        cron.schedule("0 9 * * *", async () => {
            console.log("Running due date notification check...");
            try {
                await checkApproachingDueDates();
            } catch (error) {
                console.error("Due date notification check failed:", error);
            }
        });
    }
}
