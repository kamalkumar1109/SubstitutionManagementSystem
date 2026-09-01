import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Must match backend (default 5050; server auto-increments if port is busy — check terminal).
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:5050";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/teachers": API_TARGET,
      "/mark-attendance": API_TARGET,
      "/generate-substitution": API_TARGET,
      "/substitutions": API_TARGET,
      "/manual-override": API_TARGET,
      "/reset-day": API_TARGET,
      "/health": API_TARGET
    }
  }
});
