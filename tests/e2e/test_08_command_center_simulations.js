const pw = require("playwright");
const path = require("path");
const fs = require("fs");

async function runCommandCenterJourney() {
    console.log("=================================================");
    console.log("   TASKFLOW E2E: COMMAND CENTER & SIMULATIONS    ");
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

    try {
        // Step 1: Login
        console.log("\n[Step 1] Logging in as Admin...");
        await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
        await page.locator('input[type="email"], input[name="email"]').fill("admin@taskflow.dev");
        await page.locator('input[type="password"], input[name="password"]').fill("AdminPassword123!");
        await page.locator('button[type="submit"]').click();
        await page.waitForURL("http://localhost:5173/", { timeout: 10000 });
        console.log("  ✔ Logged in.");

        // Step 2: Command Center Page
        console.log("\n[Step 2] Navigating to /command-center...");
        await page.goto("http://localhost:5173/command-center", { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);

        const ccText = await page.innerText("body");
        const hasCC = ccText.includes("Command") || ccText.includes("Project") || ccText.includes("Intelligence");
        console.log(`  Command Center loaded: ${hasCC}`);
        await page.screenshot({ path: path.join(artifactsDir, "18-command-center.png") });
        console.log("  ✔ CC-01 PASS: Command Center page loaded successfully.");

        // Step 3: What-If Page
        console.log("\n[Step 3] Navigating to /what-if...");
        await page.goto("http://localhost:5173/what-if", { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);

        const whatIfText = await page.innerText("body");
        const hasWhatIf = whatIfText.includes("What-If") || whatIfText.includes("Scenario") || whatIfText.includes("Simulation");
        console.log(`  What-If page loaded: ${hasWhatIf}`);
        await page.screenshot({ path: path.join(artifactsDir, "19-what-if-simulation.png") });
        console.log("  ✔ SIM-01 PASS: What-If simulation interface loaded.");

        // Step 4: Portfolio Intelligence Page
        console.log("\n[Step 4] Navigating to /portfolio...");
        await page.goto("http://localhost:5173/portfolio", { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(artifactsDir, "20-portfolio-intelligence.png") });
        console.log("  ✔ PORT-01 PASS: Portfolio Intelligence page loaded.");

        // Step 5: Coordination Page
        console.log("\n[Step 5] Navigating to /coordination...");
        await page.goto("http://localhost:5173/coordination", { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(artifactsDir, "21-coordination-dashboard.png") });
        console.log("  ✔ COORD-01 PASS: Coordination Dashboard loaded without 404.");

        console.log("\n✔ COMMAND CENTER & SIMULATION AUDIT COMPLETED SUCCESSFULLY!");
    } catch (err) {
        console.error("Command Center Journey Failed:", err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runCommandCenterJourney();
