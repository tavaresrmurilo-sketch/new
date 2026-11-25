// Dev loop: Vite dev server + esbuild watch for Electron + Electron pointed at the dev server.
import { spawn } from "node:child_process";
import { createServer } from "vite";

const server = await createServer({ configFile: "vite.config.mts" });
await server.listen();
const url = "http://127.0.0.1:5173";
server.printUrls();
const esb = spawn(process.execPath, ["scripts/build-electron.mjs", "--watch"], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
const electronBin = (await import("electron")).default;
const app = spawn(electronBin, ["."], { stdio: "inherit", env: { ...process.env, JARVIS_DEV_SERVER: url } });
const stop = async () => {
  esb.kill();
  await server.close();
  process.exit(0);
};
app.on("exit", stop);
process.on("SIGINT", () => app.kill());
