const pw = require("playwright");
const path = require("path");
const fs = require("fs");

async function runAuthJourney() {
    console.log("=================================================");
    console.log("   TASKFLOW E2E: AUTHENTICATION USER JOURNEY     ");
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
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    let alertMessage = null;
    page.on("dialog", async (dialog) => {
        alertMessage = dialog.message();
        console.log(`  [Dialog Alert]: "${alertMessage}"`);
        await dialog.accept();
    });

    try {
        // Step 1: Open Login Page
        console.log("\n[Step 1] Navigating to http://localhost:5173/login...");
        await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });

        // Skip intro animation if still running by clicking card or waiting
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(artifactsDir, "02-login-page.png") });

        // Wait for email and password inputs
        const emailInput = page.locator('input[type="email"], input[name="email"]');
        const passwordInput = page.locator('input[type="password"], input[name="password"]');

        await emailInput.waitFor({ state: "visible", timeout: 10000 });
        await passwordInput.waitFor({ state: "visible", timeout: 10000 });
        console.log("  ✔ Login form inputs rendered.");

        // Step 2: AUTH-02 Invalid Login
        console.log("\n[Step 2] Testing AUTH-02: Invalid Credentials...");
        await emailInput.fill("admin@taskflow.dev");
        await passwordInput.fill("WrongPassword999!");

        alertMessage = null;
        const submitBtn = page.locator('button[type="submit"]');
        await submitBtn.click();

        await page.waitForTimeout(1500);
        console.log(`  Alert observed: "${alertMessage}"`);

        const tokenAfterInvalid = await page.evaluate(() => localStorage.getItem("taskflow_token"));
        if (!tokenAfterInvalid && page.url().includes("/login")) {
            console.log("  ✔ AUTH-02 PASS: Invalid login rejected, no token set, remained on /login.");
        } else {
            throw new Error(`AUTH-02 FAIL: Unexpected token or URL: ${tokenAfterInvalid}, ${page.url()}`);
        }

        // Step 3: AUTH-01 Valid Login
        console.log("\n[Step 3] Testing AUTH-01: Valid Admin Login...");
        await emailInput.fill("admin@taskflow.dev");
        await passwordInput.fill("AdminPassword123!");

        alertMessage = null;
        await submitBtn.click();

        // Wait for redirect to dashboard
        await page.waitForURL("http://localhost:5173/", { timeout: 10000 });
        console.log(`  Redirected to URL: ${page.url()}`);

        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);

        const token = await page.evaluate(() => localStorage.getItem("taskflow_token"));
        const storedUser = await page.evaluate(() => JSON.parse(localStorage.getItem("taskflow_user") || "null"));

        console.log(`  Stored Token present: ${Boolean(token)}`);
        console.log(`  Stored User email: ${storedUser?.email}, role: ${storedUser?.role}`);

        await page.screenshot({ path: path.join(artifactsDir, "03-auth-dashboard-success.png"), fullPage: true });

        if (token && (storedUser?.email === "admin@taskflow.dev" || storedUser?.role === "Admin")) {
            console.log("  ✔ AUTH-01 PASS: Authenticated successfully, JWT and user profile stored.");
        } else {
            throw new Error(`AUTH-01 FAIL: Authentication payload invalid: ${JSON.stringify(storedUser)}`);
        }

        // Step 4: Session Persistence across reload
        console.log("\n[Step 4] Testing Session Persistence across reload...");
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        const reloadedToken = await page.evaluate(() => localStorage.getItem("taskflow_token"));
        if (reloadedToken === token) {
            console.log("  ✔ Session persistence PASS: Token retained across reload.");
        } else {
            throw new Error("Session persistence FAIL: Token lost after reload.");
        }

        // Step 5: Check UI elements on Dashboard
        console.log("\n[Step 5] Checking Authenticated Dashboard elements...");
        const dashboardText = await page.innerText("body");
        const hasWelcome = dashboardText.includes("Welcome") || dashboardText.includes("Dashboard") || dashboardText.includes("TaskFlow");
        console.log(`  Dashboard text rendered: ${hasWelcome}`);

        console.log("\n✔ AUTHENTICATION E2E JOURNEY COMPLETED SUCCESSFULLY!");
    } catch (err) {
        console.error("Auth Journey Failed:", err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runAuthJourney();
