import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";

export const db = new PrismaClient({
  datasources: { db: { url: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mixtour_e2e?schema=public" } },
});

export const PASSWORD = "festa2026segura";

export function uniqueEmail(prefix = "pessoa") {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.mixtour.test`;
}

export async function register(page: Page, name: string, email: string, password = PASSWORD, next?: string) {
  await page.goto(`/cadastrar${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta grátis" }).click();
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Último link enviado por e-mail (outbox) contendo o caminho informado. */
export async function lastEmailLink(to: string, path: string): Promise<string> {
  const row = await db.emailOutbox.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
  expect(row, `e-mail para ${to}`).toBeTruthy();
  const m = new RegExp(`https?://[^"\\s]+${path.replace(/[/?]/g, "\\$&")}[^"\\s<]*`).exec(row!.text);
  expect(m, `link ${path} no e-mail`).toBeTruthy();
  return new URL(m![0].replace(/&amp;/g, "&")).pathname + new URL(m![0].replace(/&amp;/g, "&")).search;
}

export async function verifyEmail(page: Page, email: string) {
  const link = await lastEmailLink(email, "/verificar-email");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "E-mail confirmado!" })).toBeVisible();
}

/** Login que espera a sessão ser criada (sai da página /entrar). */
export async function loginOk(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 15_000 });
}
