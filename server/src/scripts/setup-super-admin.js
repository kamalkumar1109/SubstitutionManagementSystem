const { connectDb, disconnectDb } = require("../config/db");
const { env } = require("../config/env");
const { ensureSuperAdmin } = require("../services/authService");

async function run() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    console.error("[setup] Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env");
    process.exit(1);
  }
  await connectDb();
  const user = await ensureSuperAdmin({
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
    name: env.SUPER_ADMIN_NAME
  });
  console.log("[setup] SUPER_ADMIN ready:", user.email);
  console.log("[setup] Use Admin Login with the email and password from .env");
  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[setup] FAILED:", err.message);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
