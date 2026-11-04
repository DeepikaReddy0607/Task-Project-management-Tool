import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });
import prisma from "../config/prisma.js";
import { parseNaturalLanguageQuery } from "../services/naturalLanguageControlService.js";
import { handleIntelligenceQuery } from "../services/intelligenceQueryService.js";

async function run() {
    console.log("=== Testing Natural-Language Intelligence Queries ===");

    const project = await prisma.projects.findFirst();
    if (!project) throw new Error("No project found");
    const user = await prisma.users.findFirst();
    if (!user) throw new Error("No user found");

    const presets = [
        "Why is project health declining?",
        "What is blocking this project?",
        "Which tasks are on the critical path?",
        "Show me the dependency shockwave",
        "What happens if I reassign API Testing to Bob?",
        "Run Project Red Team",
        "What happens if non-existent task slips 5 days?",
        "What happens if I reassign NonExistentTask to NonExistentUser?"
    ];

    for (const q of presets) {
        console.log(`\nQuery: "${q}"`);
        const parsed = await parseNaturalLanguageQuery(q, {
            projectId: project.id,
            workspaceId: project.workspace_id,
            userId: user.id
        });
        console.log("  -> Intent:", parsed.intent, "| Category:", parsed.category);

        const handled = await handleIntelligenceQuery({
            query: q,
            parsedQuery: parsed,
            projectId: project.id,
            workspaceId: project.workspace_id,
            userId: user.id
        });

        console.log("  -> Status:", handled.status);
        if (handled.explanation?.summary) {
            console.log("  -> Explanation summary:", handled.explanation.summary);
        } else if (handled.clarificationRequired) {
            console.log("  -> Clarification Required:", handled.clarificationRequired);
        }
    }

    console.log("\n=== ALL NATURAL LANGUAGE QUERY TESTS EXECUTED SUCCESSFULLY ===");
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Test error:", err);
        process.exit(1);
    });
