import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lança erro fora do React Server; nos testes vira um módulo vazio.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Testes de integração compartilham o mesmo banco: rodam em sequência.
    fileParallelism: false,
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/env.ts"],
    testTimeout: 20000,
  },
});
