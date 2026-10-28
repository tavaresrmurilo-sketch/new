import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

const PUBLIC = ["/", "/planos", "/entrar", "/cadastro", "/suporte", "/privacidade", "/termos"];
const PRIVATE = [
  "/painel",
  "/retornos",
  "/clientes",
  "/clientes/novo",
  "/atendimentos",
  "/atendimentos/novo",
  "/servicos",
  "/mensagens",
  "/relatorios",
  "/configuracoes",
  "/configuracoes/plano",
];

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("páginas sem rolagem horizontal no celular", async ({ page }) => {
  for (const path of PUBLIC) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
  await signUpAndOnboard(page, { name: "Celular Teste", company: "Barbearia Mobile", segment: "Barbearia", phone: "(31) 98888-4444" });
  for (const path of PRIVATE) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await noHorizontalScroll(page);
  }
  // Menu móvel
  await page.goto("/painel");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("link", { name: "Central de retornos" })).toBeVisible();
});
