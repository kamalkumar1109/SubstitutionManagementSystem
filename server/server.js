const http = require("http");
const express = require("express");
const cors = require("cors");

const attendanceRoutes = require("./routes/attendanceRoutes");
const substitutionRoutes = require("./routes/substitutionRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use(attendanceRoutes);
app.use(substitutionRoutes);

// Default 5050 — avoids common clashes (e.g. 5000 AirPlay, leftover dev servers on 5006).
// If busy, tries the next ports so `npm run dev` does not crash with EADDRINUSE.
const DEFAULT_PORT = Number(process.env.PORT) || 5050;
const MAX_PORT_TRIES = 30;

function tryListen(port, triesLeft) {
  const server = http.createServer(app);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      const next = port + 1;
      console.warn(`[SMS] Port ${port} is already in use — trying ${next}...`);
      tryListen(next, triesLeft - 1);
    } else {
      console.error("[SMS] Server failed to start:", err.message);
      console.error(
        "[SMS] Tip: stop the other process using this port, or set PORT= e.g. PORT=5050"
      );
      process.exit(1);
    }
  });

  server.listen(port, () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    console.log(`[SMS] Server running on http://localhost:${p}`);
  });
}

tryListen(DEFAULT_PORT, MAX_PORT_TRIES);
