import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const localPython =
  process.platform === "win32" && existsSync(".venv312\\Scripts\\python.exe")
    ? ".\\.venv312\\Scripts\\python.exe"
    : "python";
const python = process.env.PYTHON ?? localPython;

export default defineConfig({
  testDir: "app/web/tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8012",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8012`,
    env: {
      APP_ENV: "local",
      AUTH_MODE: "signed_bearer",
      AUTH_TOKEN_SECRET: "test-auth-secret",
    },
    reuseExistingServer: false,
    timeout: 15_000,
    url: "http://127.0.0.1:8012/health",
  },
});
