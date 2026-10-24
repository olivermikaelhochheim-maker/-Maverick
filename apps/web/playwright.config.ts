import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Each run gets a throwaway database and the free mock model.
const dataDir = mkdtempSync(path.join(os.tmpdir(), "maverick-e2e-"));
const PORT = 3123;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MAVERICK_DATA_DIR: dataDir,
      MAVERICK_LLM_PROVIDER: "mock",
      MAVERICK_SETUP_CODE: "E2E-CODE",
      MAVERICK_DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
      MAVERICK_LOG_LEVEL: "warn",
    },
  },
});
