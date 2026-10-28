import { expect, type Page } from "@playwright/test";

export const PASSWORD = "senhaforte123";

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Cria uma conta nova e conclui o onboarding. */
export async function signUpAndOnboard(page: Page, opts: { name: string; company: string; segment: string; phone: string }) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@teste.dev`;
  await page.goto("/cadastro");
  await page.fill("#name", opts.name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/onboarding");
  await page.fill("#companyName", opts.company);
  await page.getByRole("radio", { name: new RegExp(opts.segment) }).click();
  await page.fill("#phone", opts.phone);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Concluir configuração/ }).click();
  await page.waitForURL("**/painel");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá");
  return email;
}
