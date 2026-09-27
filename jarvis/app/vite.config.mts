import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the build works from file:// inside Electron (and from any static host).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  build: { outDir: "dist", emptyOutDir: true, target: "chrome130", sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
} as any);
