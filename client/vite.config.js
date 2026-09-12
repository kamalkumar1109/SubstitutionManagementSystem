import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const port = env.PORT || "5050";
  const API_TARGET = env.VITE_API_TARGET || `http://localhost:${port}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/teachers": API_TARGET,
        "/mark-attendance": API_TARGET,
        "/generate-substitution": API_TARGET,
        "/substitutions": API_TARGET,
        "/manual-override": API_TARGET,
        "/reset-day": API_TARGET,
        "/health": API_TARGET,
        "/api": API_TARGET
      }
    }
  };
});
