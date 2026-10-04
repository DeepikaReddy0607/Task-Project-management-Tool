import "dotenv/config";
import http from "http";
import app from "./app.js";
import { initSocket } from "./socket.js";
import cron from "node-cron";
import checkApproachingDueDates from "./services/dueDateNotificationService.js";

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => {
    console.log(`TaskFlow Backend running on port ${PORT}`);
});

// Check for approaching task due dates every day at 9:00 AM
cron.schedule("0 9 * * *", async () => {
    console.log("Running due date notification check...");

    try {
        await checkApproachingDueDates();
    } catch (error) {
        console.error(
            "Due date notification check failed:",
            error
        );
    }
});