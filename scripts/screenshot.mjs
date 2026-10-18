// Captura de tela para QA visual.
// Uso: node scripts/screenshot.mjs <url> <saida.png> [mobile|desktop] [dark|light] [fullpage]
// Cookies de sessão: defina SHOT_COOKIE="nome=valor" para páginas autenticadas.
import { chromium, devices } from "@playwright/test";

const [url, out, mode = "mobile", theme = "dark", full] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext(
  mode === "mobile"
    ? { ...devices["Pixel 7"], colorScheme: theme, locale: "pt-BR", timezoneId: "America/Sao_Paulo" }
    : { viewport: { width: 1440, height: 900 }, colorScheme: theme, locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
);
if (process.env.SHOT_COOKIE) {
  const [name, ...rest] = process.env.SHOT_COOKIE.split("=");
  const secure = name.startsWith("__Host-") || name.startsWith("__Secure-");
  await ctx.addCookies([{ name, value: rest.join("="), domain: new URL(url).hostname, path: "/", secure, httpOnly: true, sameSite: "Lax" }]);
}
await ctx.addInitScript((t) => {
  try {
    localStorage.setItem("theme", t);
  } catch {}
}, theme);
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text().slice(0, 300));
});
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 800));
await page.screenshot({ path: out, fullPage: full === "fullpage" });
await browser.close();
console.log("ok", out);
