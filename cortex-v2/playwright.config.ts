import { defineConfig } from "@playwright/test";

/** E2E mínimo. Rode com a aplicação no ar: BASE_URL=http://localhost:3000 npm run test:e2e */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", locale: "pt-BR" },
  reporter: [["list"]],
});
