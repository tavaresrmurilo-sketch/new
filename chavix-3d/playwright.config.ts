import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Permite usar um Chromium já instalado (ex.: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/chrome)
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
