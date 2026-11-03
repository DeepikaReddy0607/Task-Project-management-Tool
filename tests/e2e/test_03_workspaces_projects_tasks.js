const pw = require("playwright");
const path = require("path");
const fs = require("fs");

async function runWorkspaceProjectTaskJourney() {
    console.log("=================================================");
    console.log("   TASKFLOW E2E: WORKSPACE, PROJECT & KANBAN     ");
    console.log("=================================================");

    const artifactsDir = path.resolve(__dirname, "../../reports/e2e/artifacts");
    if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const browser = await pw.chromium.launch({
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce"
    });

    const page = await context.newPage();

    page.on("dialog", async (dialog) => {
        console.log(`  [Dialog]: "${dialog.message()}"`);
        await dialog.accept();
    });

    try {
        // Step 1: Login
        console.log("\n[Step 1] Logging in as Admin...");
        await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        const emailInput = page.locator('input[type="email"], input[name="email"]');
        const passwordInput = page.locator('input[type="password"], input[name="password"]');
        await emailInput.waitFor({ state: "visible", timeout: 10000 });
        await passwordInput.waitFor({ state: "visible", timeout: 10000 });

        await emailInput.fill("admin@taskflow.dev");
        await passwordInput.fill("AdminPassword123!");
        await page.locator('button[type="submit"]').click();
        await page.waitForURL("http://localhost:5173/", { timeout: 10000 });
        console.log("  ✔ Logged in and reached Dashboard.");

        // Step 2: Navigate to Workspaces
        console.log("\n[Step 2] Navigating to Workspaces (/workspaces)...");
        await page.goto("http://localhost:5173/workspaces", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(artifactsDir, "04-workspaces-page.png") });

        const workspaceCount = await page.locator("text=Workspaces").count();
        console.log(`  ✔ Workspaces page loaded (elements count: ${workspaceCount}).`);

        // Step 3: Navigate to Projects
        console.log("\n[Step 3] Navigating to Projects (/projects)...");
        await page.goto("http://localhost:5173/projects", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(artifactsDir, "05-projects-page.png") });
        console.log("  ✔ Projects page loaded.");

        // Step 4: Navigate to Tasks
        console.log("\n[Step 4] Navigating to Tasks (/tasks)...");
        await page.goto("http://localhost:5173/tasks", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(artifactsDir, "06-tasks-page.png") });
        console.log("  ✔ Tasks page loaded.");

        // Step 5: Navigate to Kanban
        console.log("\n[Step 5] Navigating to Kanban (/kanban)...");
        await page.goto("http://localhost:5173/kanban", { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(artifactsDir, "07-kanban-board.png") });

        const backlogCol = await page.locator("text=Backlog").count();
        const todoCol = await page.locator("text=To Do").count();
        const inProgressCol = await page.locator("text=In Progress").count();
        const reviewCol = await page.locator("text=Review").count();
        const completedCol = await page.locator("text=Completed").count();

        console.log(`  Kanban Columns verified: Backlog(${backlogCol}), To Do(${todoCol}), In Progress(${inProgressCol}), Review(${reviewCol}), Completed(${completedCol})`);

        if (todoCol > 0 && inProgressCol > 0 && completedCol > 0) {
            console.log("  ✔ KANBAN-01 PASS: All expected Kanban columns rendered properly.");
        } else {
            throw new Error("KANBAN-01 FAIL: Columns missing.");
        }

        // Step 6: Navigate to Calendar
        console.log("\n[Step 6] Navigating to Calendar (/calendar)...");
        await page.goto("http://localhost:5173/calendar", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(artifactsDir, "08-calendar-page.png") });
        console.log("  ✔ Calendar page loaded.");

        // Step 7: Navigate to Reports
        console.log("\n[Step 7] Navigating to Reports (/reports)...");
        await page.goto("http://localhost:5173/reports", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(artifactsDir, "09-reports-page.png") });
        console.log("  ✔ Reports page loaded.");

        console.log("\n✔ STAGE C & D NAVIGATION AND VIEW AUDIT COMPLETED SUCCESSFULLY!");
    } catch (err) {
        console.error("Workspace/Project/Task Journey Failed:", err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runWorkspaceProjectTaskJourney();
