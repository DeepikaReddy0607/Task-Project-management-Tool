import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });
import prisma from "../config/prisma.js";
import { getUserProductivity } from "../services/productivityService.js";

async function run() {
    console.log("=== Testing User Productivity Service ===");

    const user = await prisma.users.findFirst();
    if (!user) throw new Error("No user found in database");

    console.log("Testing productivity metrics for user:", user.email, `(${user.id})`);

    const result = await getUserProductivity(user.id);
    console.log("Productivity Summary:", JSON.stringify(result.summary, null, 2));
    console.log("Priority Breakdown:", JSON.stringify(result.priorityBreakdown, null, 2));
    console.log("Velocity Trend length:", result.velocityTrend.length);
    console.log("Overdue Tasks:", result.overdueTasks.length);
    console.log("Recent Completions:", result.recentCompletions.length);

    if (typeof result.summary.focusIndex !== "number") {
        throw new Error("Focus index must be a number");
    }
    if (typeof result.summary.completionRate !== "number") {
        throw new Error("Completion rate must be a number");
    }
    console.log("=== ALL USER PRODUCTIVITY CHECKS PASSED ===");
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Test failed:", err);
        process.exit(1);
    });
