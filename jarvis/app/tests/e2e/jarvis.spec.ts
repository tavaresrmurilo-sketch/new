import { expect, Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TestEngine } from "./engine";

let engine: TestEngine;

async function send(page: Page, text: string) {
  await page.getByLabel("Digite um comando").fill(text);
  await page.keyboard.press("Enter");
}

const lastReply = (page: Page) => page.locator(".line--jarvis .line__text").last();

test.describe.serial("Jarvis HUD", () => {
  test.beforeAll(async () => {
    engine = new TestEngine();
    await engine.start();
  });
  test.beforeEach(async ({}, info) => {
    if (!info.title.startsWith("startup")) {
      await engine.rpc("settings.update", { patch: { general: { onboarding_complete: true } } });
    }
  });
  test.afterAll(async () => {
    await engine.stop();
    engine.cleanup();
  });

  test("startup: onboarding, then real system-initialization checks", async ({ page }) => {
    await page.goto(engine.url());
    await expect(page.getByRole("status").filter({ hasText: "Online" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome to Jarvis/i })).toBeVisible();
    await page.getByPlaceholder("Seu nome").fill("Tony");
    await page.getByRole("button", { name: "Começar configuração" }).click();
    for (let i = 0; i < 8; i++) await page.getByRole("button", { name: i === 7 ? "Concluir" : "Próximo" }).click();
    const rows = page.locator(".init__row");
    await expect(rows).toHaveCount(7, { timeout: 20_000 });
    // Honest status: the AI provider is offline in CI (no Ollama) and must not read ONLINE.
    await expect(rows.filter({ hasText: "AI Provider" })).toContainText(/OFFLINE|DEGRADED/);
    await expect(rows.filter({ hasText: "Memory" })).toContainText("ONLINE");
    await page.getByRole("button", { name: "Continuar" }).click();
    const s = await engine.rpc<any>("settings.get");
    expect(s.general.onboarding_complete).toBe(true);
    expect(s.general.user_name).toBe("Tony");
  });

  test("text command gets a real answer and state returns to idle", async ({ page }) => {
    await page.goto(engine.url());
    await send(page, "Jarvis.");
    await expect(lastReply(page)).toHaveText("À disposição.");
    await send(page, "Que horas são?");
    await expect(lastReply(page)).toContainText(/^São \d\d:\d\d/);
    await expect(page.locator(".core__state")).toHaveText("Em espera");
  });

  test("system metrics are live values from the machine, never placeholders", async ({ page }) => {
    await page.goto(engine.url());
    const cpu = page.getByRole("meter", { name: "CPU" });
    await expect(cpu).toHaveAttribute("aria-valuenow", /\d+/);
    const v = Number(await cpu.getAttribute("aria-valuenow"));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
    const snap = await engine.rpc<any>("system.snapshot");
    const ram = Number(await page.getByRole("meter", { name: "RAM" }).getAttribute("aria-valuenow"));
    expect(Math.abs(ram - snap.memory.percent)).toBeLessThan(15);
    if (snap.gpu === null) await expect(page.getByRole("meter", { name: "GPU" })).toContainText("N/A");
    if (snap.battery === null) await expect(page.locator(".metric-row", { hasText: "Bateria" })).toContainText("N/A");
  });

  test("settings persist across reloads", async ({ page }) => {
    await page.goto(engine.url());
    await page.keyboard.press("Alt+8");
    const sheet = page.getByRole("dialog", { name: "Configurações" });
    await expect(sheet).toBeVisible();
    const name = sheet.getByLabel(/Seu nome/);
    await name.fill("Pepper");
    await name.press("Enter");
    await sheet.getByRole("tab", { name: "Aparência" }).click();
    await sheet.getByRole("switch", { name: "Modo compacto" }).check();
    await page.waitForTimeout(500);
    await page.reload();
    await page.keyboard.press("Alt+8");
    await expect(page.getByRole("dialog", { name: "Configurações" }).getByLabel(/Seu nome/)).toHaveValue("Pepper");
    const s = await engine.rpc<any>("settings.get");
    expect(s.appearance.compact_mode).toBe(true);
    await engine.rpc("settings.update", { patch: { appearance: { compact_mode: false } } });
  });

  test("destructive actions require explicit confirmation (level 3)", async ({ page }) => {
    await page.goto(engine.url());
    await send(page, "Apague o arquivo relatorio-q3.txt");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Nível 3");
    await expect(dialog).toContainText("relatorio-q3.txt");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(lastReply(page)).toContainText("não vou");
    expect(fs.existsSync(path.join(engine.home, "Documents", "relatorio-q3.txt"))).toBe(true);
  });

  test("composite task lifecycle: find project, run it, detect port, verify, open URL", async ({ page }) => {
    test.skip(!process.env.PATH?.includes("node") && !fs.existsSync("/usr/bin/node"), "node not available");
    const port = 45000 + Math.floor(Math.random() * 1000);
    engine.setPort(port);
    await engine.rpc("files.reindex");
    await page.waitForTimeout(1500);
    await page.goto(engine.url());
    await send(page, "Abra meu projeto BETA e coloque ele para rodar");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Rodar o projeto BETA");
    await dialog.getByRole("button", { name: "Permitir" }).click();
    await expect(lastReply(page)).toContainText(`http://localhost:${port}`, { timeout: 60_000 });
    await page.keyboard.press("Alt+4");
    const task = page.getByRole("dialog", { name: "Tarefas" }).locator(".item").first();
    await expect(task).toContainText("Rodar projeto BETA");
    await expect(task.locator(".step--completed")).toHaveCount(9);
    expect(engine.recorded().some((r) => r.action === "open_uri" && r.uri === `http://localhost:${port}`)).toBe(true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt+5");
    const term = page.getByRole("dialog", { name: "Terminal" });
    await expect(term).toContainText("npm run dev");
    await term.getByRole("button", { name: "Parar" }).click();
    await expect(term).toContainText("encerrado");
  });

  test("memory: remember, show in panel, delete from UI", async ({ page }) => {
    await page.goto(engine.url());
    await send(page, "Lembre que meu projeto BETA usa Node 22");
    await expect(lastReply(page)).toHaveText("Entendido. Vou lembrar disso.");
    await send(page, "O que você sabe sobre o projeto BETA?");
    await expect(lastReply(page)).toContainText("seu projeto BETA usa Node 22");
    await page.keyboard.press("Alt+1");
    const sheet = page.getByRole("dialog", { name: "Memória" });
    await expect(sheet.locator(".item")).toContainText("meu projeto BETA usa Node 22");
    await sheet.getByRole("button", { name: "Apagar memória" }).click();
    await sheet.getByRole("button", { name: "Sim" }).click();
    await expect(sheet.getByText("Nenhuma memória ainda")).toBeVisible();
  });

  test("notes and reminders persist", async ({ page }) => {
    await page.goto(engine.url());
    await send(page, "Crie uma nota chamada Teste Jarvis");
    await expect(lastReply(page)).toContainText("Teste Jarvis");
    await send(page, "Mostre minhas notas.");
    await expect(lastReply(page)).toContainText("Teste Jarvis");
    await page.keyboard.press("Alt+3");
    const sheet = page.getByRole("dialog", { name: "Lembretes" });
    await sheet.getByLabel("Novo lembrete em linguagem natural").fill("amanhã às 15h ligar para o João");
    await sheet.getByRole("button", { name: "Criar" }).click();
    await expect(sheet.locator(".item")).toContainText("Ligar para o João");
    await expect(sheet.locator(".item")).toContainText("amanhã às 15:00");
    const rems = await engine.rpc<any[]>("reminders.list");
    expect(rems.some((r) => r.text === "Ligar para o João")).toBe(true);
  });

  test("apps and files: open via registry and search the index", async ({ page }) => {
    await page.goto(engine.url());
    await send(page, "Abra o navegador do Google");
    await expect(lastReply(page)).toContainText("Google Chrome");
    expect(engine.recorded().some((r) => r.action === "launch_app" && r.name === "Google Chrome")).toBe(true);
    await send(page, "Procure minha apresentação da escola");
    await expect(lastReply(page)).toContainText("apresentacao-escola.md");
    await send(page, "Abra o mais recente");
    await expect(lastReply(page)).toContainText("Abrindo apresentacao-escola.md");
  });

  test("errors are explained, with optional technical details", async ({ page }) => {
    await page.goto(engine.url());
    await send(page, "Qual é o sentido da vida?");
    await expect(lastReply(page)).toContainText("modelo local não está disponível");
    await send(page, "Abra o Photoshop Ultra 3000");
    await expect(lastReply(page)).toContainText("Não encontrei");
  });

  test("keyboard navigation and accessibility basics", async ({ page }) => {
    await page.goto(engine.url());
    await page.locator("body").press("/");
    await expect(page.getByLabel("Digite um comando")).toBeFocused();
    await page.keyboard.press("Alt+2");
    await expect(page.getByRole("dialog", { name: "Notas" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Notas" })).toHaveCount(0);
    await expect(page.getByRole("img", { name: /Núcleo do Jarvis/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Falar com o Jarvis/ })).toBeVisible();
  });

  test("zero dead buttons: every visible button is named and wired", async ({ page }) => {
    await page.goto(engine.url());
    const audit = async (where: string) => {
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll("button"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const name = (el.getAttribute("aria-label") || el.textContent || el.title || "").trim();
          const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps"));
          const props = propsKey ? (el as any)[propsKey] : {};
          const wired = typeof props.onClick === "function" || el.type === "submit" || typeof props.onKeyDown === "function";
          if (!name) out.push(`unnamed button: ${el.outerHTML.slice(0, 80)}`);
          if (!wired) out.push(`dead button: ${name}`);
        }
        return out;
      });
      expect(problems, where).toEqual([]);
    };
    await audit("hud");
    for (const key of ["1", "2", "3", "4", "5", "6", "7"]) {
      await page.keyboard.press(`Alt+${key}`);
      await page.waitForTimeout(300);
      await audit(`module ${key}`);
    }
    await page.keyboard.press("Alt+8");
    const sheet = page.getByRole("dialog", { name: "Configurações" });
    for (const tab of ["Geral", "Voz", "IA", "Privacidade", "Sistema", "Permissões", "Aparência", "Atalhos e início", "Sobre"]) {
      await sheet.getByRole("tab", { name: tab, exact: true }).click();
      await page.waitForTimeout(250);
      await audit(`settings/${tab}`);
    }
  });

  test("WebSocket reconnection after the engine restarts", async ({ page }) => {
    await page.goto(engine.url());
    const chip = page.getByRole("status").filter({ hasText: /Online|Reconectando|Conectando/ }).first();
    await expect(chip).toHaveText(/Online/);
    await engine.stop();
    await expect(chip).toHaveText(/Reconectando/, { timeout: 15_000 });
    await engine.start();
    await expect(chip).toHaveText(/Online/, { timeout: 30_000 });
    await send(page, "Jarvis.");
    await expect(lastReply(page)).toHaveText("À disposição.");
  });
});
