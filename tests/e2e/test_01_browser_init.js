const pw = require("playwright");
const path = require("path");
const fs = require("fs");

async function runInitialBrowserTest() {
    console.log("=================================================");
    console.log("   TASKFLOW E2E: INITIAL REAL BROWSER TEST       ");
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

    const consoleLogs = [];
    page.on("console", (msg) => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    const pageErrors = [];
    page.on("pageerror", (err) => {
        pageErrors.push(err.message);
    });

    try {
        console.log("Navigating to TaskFlow frontend at http://localhost:5173...");
        const response = await page.goto("http://localhost:5173", {
            waitUntil: "networkidle",
            timeout: 15000
        });

        const status = response ? response.status() : "No response";
        console.log(`Page HTTP Status: ${status}`);

        const title = await page.title();
        console.log(`Page Title: "${title}"`);

        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);

        const screenshotPath = path.join(artifactsDir, "01-initial-page-load.png");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to: ${screenshotPath}`);

        // Check for common elements
        const bodyText = await page.innerText("body");
        const hasTaskFlow = bodyText.includes("TaskFlow") || (await page.locator("text=TaskFlow").count()) > 0;
        console.log(`Body contains 'TaskFlow': ${hasTaskFlow}`);

        // Check form inputs or headings
        const inputCount = await page.locator("input").count();
        const buttonCount = await page.locator("button").count();
        console.log(`Inputs found: ${inputCount}, Buttons found: ${buttonCount}`);

        console.log("\nConsole logs during load:");
        consoleLogs.forEach((l) => console.log(`  [${l.type}] ${l.text}`));

        if (pageErrors.length > 0) {
            console.error("\nPage errors encountered:");
            pageErrors.forEach((e) => console.error(`  ✖ ${e}`));
        } else {
            console.log("\n✔ Zero uncaught page errors during load.");
        }

        console.log("\n✔ Initial browser test completed successfully.");
    } catch (err) {
        console.error("Browser test failed:", err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runInitialBrowserTest();
