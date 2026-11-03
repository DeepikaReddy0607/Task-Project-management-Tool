const pw = require("playwright");
const path = require("path");
const fs = require("fs");
const jwt = require("../../backend/node_modules/jsonwebtoken");

const JWT_SECRET = "E0sHPSmTuu974XNsTVBPdsF4MQdcqvfQsqn34LM/0wQ=";

async function runAdminRbacJourney() {
    console.log("=================================================");
    console.log("   TASKFLOW E2E: ADMIN & RBAC SECURITY JOURNEY   ");
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

    try {
        // --- 1. ADMIN USER ACCESS ---
        console.log("\n[Test 1] Testing Admin User access to /admin/dashboard...");
        const adminContext = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            reducedMotion: "reduce"
        });
        const adminPage = await adminContext.newPage();

        await adminPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
        const emailInputA = adminPage.locator('input[type="email"], input[name="email"]');
        const passInputA = adminPage.locator('input[type="password"], input[name="password"]');
        await emailInputA.waitFor({ state: "visible", timeout: 10000 });
        await passInputA.waitFor({ state: "visible", timeout: 10000 });

        await emailInputA.fill("admin@taskflow.dev");
        await passInputA.fill("AdminPassword123!");
        await adminPage.locator('button[type="submit"]').click();
        await adminPage.waitForURL("http://localhost:5173/", { timeout: 10000 });

        // Navigate to /admin/dashboard
        await adminPage.goto("http://localhost:5173/admin/dashboard", { waitUntil: "networkidle" });
        await adminPage.waitForTimeout(1500);

        const adminBodyText = await adminPage.innerText("body");
        const hasAdminHeader = adminBodyText.includes("Admin") || adminBodyText.includes("Users") || adminBodyText.includes("Workspaces");
        console.log(`  Admin Dashboard rendered content: ${hasAdminHeader}`);

        await adminPage.screenshot({ path: path.join(artifactsDir, "10-admin-dashboard-access.png"), fullPage: true });

        if (hasAdminHeader && !adminBodyText.includes("Administrator Access Required")) {
            console.log("  ✔ ADMIN-01 PASS: Admin user successfully accessed Admin Dashboard.");
        } else {
            throw new Error("ADMIN-01 FAIL: Admin user could not view admin dashboard.");
        }
        await adminContext.close();

        // --- 2. NON-ADMIN MEMBER ACCESS REJECTION ---
        console.log("\n[Test 2] Testing Team Member access to /admin/dashboard...");
        const memberContext = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            reducedMotion: "reduce"
        });

        const memberToken = jwt.sign(
            { userId: "29828b1d-661e-4060-bfa1-121f72c57deb", email: "arjun@gmail.com", role: "Team Member" },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        await memberContext.addInitScript(({ token, user }) => {
            localStorage.setItem("taskflow_token", token);
            localStorage.setItem("taskflow_user", JSON.stringify(user));
        }, { token: memberToken, user: { id: "29828b1d-661e-4060-bfa1-121f72c57deb", email: "arjun@gmail.com", role: "Team Member" } });

        const memberPage = await memberContext.newPage();

        // Navigate directly to /admin/dashboard
        await memberPage.goto("http://localhost:5173/admin/dashboard", { waitUntil: "networkidle" });
        await memberPage.waitForTimeout(1000);

        const memberBodyText = await memberPage.innerText("body");
        const hasDeniedMessage = memberBodyText.includes("Administrator Access Required") || memberBodyText.includes("restricted to system administrators");
        console.log(`  Access Denied prompt displayed: ${hasDeniedMessage}`);

        await memberPage.screenshot({ path: path.join(artifactsDir, "11-admin-denied-member.png"), fullPage: true });

        if (hasDeniedMessage) {
            console.log("  ✔ RBAC-01 PASS: Non-admin member properly rejected with 'Administrator Access Required' UI.");
        } else {
            throw new Error("RBAC-01 FAIL: Non-admin was not shown the access denied card.");
        }

        // Verify API direct call returns 403
        const apiStatus = await memberPage.evaluate(async () => {
            const token = localStorage.getItem("taskflow_token");
            const res = await fetch("http://localhost:5000/api/admin/dashboard", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            return res.status;
        });

        console.log(`  Direct API GET /api/admin/dashboard returned HTTP: ${apiStatus}`);
        if (apiStatus === 403) {
            console.log("  ✔ RBAC-02 PASS: Backend API strictly enforces HTTP 403 Forbidden for non-admin.");
        } else {
            throw new Error(`RBAC-02 FAIL: Expected 403 but received ${apiStatus}`);
        }

        await memberContext.close();
        console.log("\n✔ ADMIN & RBAC SECURITY TESTING COMPLETED SUCCESSFULLY!");
    } catch (err) {
        console.error("Admin & RBAC Journey Failed:", err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runAdminRbacJourney();
