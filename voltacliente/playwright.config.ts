import { defineConfig, devices } from "@playwright/test";

/**
 * Testes ponta a ponta. Usam o banco configurado em DATABASE_URL (crie
 * contas descartáveis; não rode contra produção).
 *   npm run test:e2e              → sobe "npm run dev" automaticamente
 *   E2E_BASE_URL=http://... npm run test:e2e → usa um servidor já rodando
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
