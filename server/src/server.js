const http = require("http");
const { env } = require("./config/env");
const { connectDb } = require("./config/db");
const { createApp } = require("./app");
const { ensureSuperAdmin } = require("./services/authService");

function tryListen(app, port) {
  const server = http.createServer(app);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[SMS] Port ${port} is already in use.`);
      console.error("[SMS] Stop the other process, or set PORT in .env to match VITE_API_TARGET / the Vite proxy.");
      process.exit(1);
    }
    console.error("[SMS] Server failed to start:", err.message);
    process.exit(1);
  });

  server.listen(port, () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    console.log(`[SMS] Server running on http://localhost:${p}`);
  });
}

async function start() {
  await connectDb();
  console.log("[SMS] MongoDB connected");

  if (env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD) {
    const created = await ensureSuperAdmin({
      email: env.SUPER_ADMIN_EMAIL,
      password: env.SUPER_ADMIN_PASSWORD,
      name: env.SUPER_ADMIN_NAME
    });
    if (created) {
      console.log(`[SMS] SUPER_ADMIN ready: ${created.email}`);
    }
  }

  const app = createApp();
  tryListen(app, env.PORT);
}

start().catch((err) => {
  console.error("[SMS] Failed to start:", err.message);
  process.exit(1);
});
