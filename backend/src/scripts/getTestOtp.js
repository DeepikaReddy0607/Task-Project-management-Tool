import crypto from "crypto";
import dotenv from "dotenv";
import prisma from "../config/prisma.js";

dotenv.config();

// Production safeguard: disable script if executed in production environment
if (process.env.NODE_ENV === "production") {
  console.error("Test OTP resolution utility is disabled in production environments.");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node getTestOtp.js <email>");
  process.exit(1);
}

const secret = process.env.OTP_SECRET;
if (!secret) {
  console.error("OTP_SECRET not set in environment");
  process.exit(1);
}

async function resolveOtp() {
  const pending = await prisma.pending_registrations.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!pending || !pending.otp_hash) {
    console.error("No pending registration or active OTP found for:", email);
    process.exit(1);
  }

  const targetHash = pending.otp_hash;

  for (let i = 100000; i <= 999999; i++) {
    const candidate = i.toString();
    const candidateHash = crypto
      .createHmac("sha256", secret)
      .update(`${pending.email}:${candidate}`)
      .digest("hex");

    if (candidateHash === targetHash) {
      // Print ONLY the 6-digit OTP for the test runner
      console.log(candidate);
      await prisma.$disconnect();
      process.exit(0);
    }
  }

  console.error("Could not resolve OTP from HMAC hash");
  await prisma.$disconnect();
  process.exit(1);
}

resolveOtp().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
