import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import { setMailMock } from "../services/mailService.js";

async function runValidation() {
  console.log("=== PHASE 4 LIVE INTEGRATION VALIDATION ===");

  const timestamp = Date.now();
  const testEmail = `phase4_live_${timestamp}@taskflow.dev`;
  const testPassword = "Password123!";
  const testFirstName = "PhaseFour";
  const testLastName = "Validator";

  let capturedOtp = null;
  setMailMock((mail) => {
    capturedOtp = mail.otp;
    console.log(`[TEST MOCK] Captured OTP for ${mail.email}: ${capturedOtp}`);
    return Promise.resolve({ messageId: `mock-${Date.now()}` });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Initial State Check
    console.log(`Testing with email: ${testEmail}`);
    const existingBefore = await prisma.users.findUnique({ where: { email: testEmail } });
    if (existingBefore) throw new Error("Test user unexpectedly exists");

    // 2. Register User (Triggers OTP Generation & Pending Record)
    console.log("\n[Check 1 & 2] POST /api/auth/register (Pending Registration)...");
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: testFirstName,
        lastName: testLastName,
        email: testEmail,
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    console.log("Register response:", regRes.status, regData.message);
    if (regRes.status !== 200 || !regData.email) {
      throw new Error(`Register failed: ${JSON.stringify(regData)}`);
    }

    // Verify pending_registrations in DB
    const pending = await prisma.pending_registrations.findUnique({ where: { email: testEmail } });
    if (!pending) throw new Error("Pending registration record not found in DB");
    console.log("Verified in DB: Pending registration created with ID:", pending.id);

    // Verify permanent user does NOT exist yet
    const userPremature = await prisma.users.findUnique({ where: { email: testEmail } });
    if (userPremature) throw new Error("Permanent user was created prematurely!");
    console.log("Verified in DB: Permanent user does NOT exist prior to OTP verification.");

    // 3. Test Invalid OTP
    console.log("\n[Check 3a] POST /api/auth/verify-registration-otp with invalid OTP...");
    const invalidRes = await fetch(`${baseUrl}/api/auth/verify-registration-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, otp: "000000" }),
    });
    const invalidData = await invalidRes.json();
    console.log("Invalid OTP response:", invalidRes.status, invalidData.message);
    if (invalidRes.status !== 400) throw new Error("Invalid OTP should return 400");

    // 4. Test Resend Cooldown
    console.log("\n[Check 4a] POST /api/auth/resend-registration-otp during cooldown...");
    const cooldownRes = await fetch(`${baseUrl}/api/auth/resend-registration-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const cooldownData = await cooldownRes.json();
    console.log("Resend cooldown response:", cooldownRes.status, cooldownData.message);
    if (cooldownRes.status !== 429) throw new Error("Resend during cooldown should return 429");

    // 5. Test Valid OTP Verification
    if (!capturedOtp) throw new Error("No OTP was captured from registration mail");
    console.log(`\n[Check 3b & 5] POST /api/auth/verify-registration-otp with valid OTP (${capturedOtp})...`);
    const validRes = await fetch(`${baseUrl}/api/auth/verify-registration-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, otp: capturedOtp }),
    });
    const validData = await validRes.json();
    console.log("Valid OTP response:", validRes.status, validData.message);
    if (validRes.status !== 201 || !validData.user?.email) {
      throw new Error(`Valid OTP verification failed: ${JSON.stringify(validData)}`);
    }

    // Verify atomic transition: pending record deleted, user created
    const pendingAfter = await prisma.pending_registrations.findUnique({ where: { email: testEmail } });
    if (pendingAfter) throw new Error("Pending registration record should be deleted after verification");

    const permanentUser = await prisma.users.findUnique({ where: { email: testEmail } });
    if (!permanentUser) throw new Error("Permanent user was not created in DB");
    console.log("Verified in DB: Pending deleted & permanent user created with onboarding status:", {
      id: permanentUser.id,
      email: permanentUser.email,
      has_completed_onboarding: permanentUser.has_completed_onboarding,
      role_id: permanentUser.role_id,
    });

    // 6. Test Login with Verified User (First-time Onboarding Check)
    console.log("\n[Check 6] POST /api/auth/login for newly verified user...");
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginRes.json();
    console.log("Login status:", loginRes.status);
    console.log("Login user.hasCompletedOnboarding:", loginData.user?.hasCompletedOnboarding);
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    if (loginData.user?.hasCompletedOnboarding !== false) {
      throw new Error("First-time user must have hasCompletedOnboarding: false");
    }

    const authToken = loginData.token;

    // 7. Complete Onboarding
    console.log("\n[Check 6b] POST /api/users/onboarding/complete...");
    const onboardRes = await fetch(`${baseUrl}/api/users/onboarding/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });
    const onboardData = await onboardRes.json();
    console.log("Onboarding complete status:", onboardRes.status, onboardData.message);
    if (onboardRes.status !== 200) {
      throw new Error(`Onboarding complete failed: ${JSON.stringify(onboardData)}`);
    }

    // 8. Test Returning User Login
    console.log("\n[Check 7] POST /api/auth/login for returning user...");
    const returnLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const returnLoginData = await returnLoginRes.json();
    console.log("Returning login user.hasCompletedOnboarding:", returnLoginData.user?.hasCompletedOnboarding);
    if (returnLoginData.user?.hasCompletedOnboarding !== true) {
      throw new Error("Returning user must have hasCompletedOnboarding: true");
    }

    // 9. Cleanup Test User
    console.log("\nCleaning up test user record...");
    await prisma.users.delete({ where: { email: testEmail } });
    console.log("Test cleanup completed successfully.");

    console.log("\n>>> ALL PHASE 4 LIVE INTEGRATION VALIDATION CHECKS PASSED SUCCESSFULLY! <<<");
  } catch (err) {
    console.error("VALIDATION ERROR:", err);
    await prisma.pending_registrations.deleteMany({ where: { email: testEmail } }).catch(() => {});
    await prisma.users.deleteMany({ where: { email: testEmail } }).catch(() => {});
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runValidation();
