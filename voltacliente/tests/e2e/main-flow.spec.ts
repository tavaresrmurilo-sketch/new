import { expect, test } from "@playwright/test";
import { daysAgo, signUpAndOnboard } from "./helpers";

test("fluxo principal: cliente → atendimento → central → WhatsApp → contato → retorno", async ({ page, context }) => {
  await signUpAndOnboard(page, { name: "Ana Oliveira", company: "ClimaTech E2E", segment: "Ar-condicionado", phone: "(11) 98765-4321" });

  // Cliente com consentimento
  await page.goto("/clientes/novo");
  await page.fill("#name", "João Silva");
  await page.fill("#phone", "(11) 99876-5432");
  await page.click("#marketingConsent");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await page.waitForURL((url) => /\/clientes\/(?!novo$)[a-z0-9]+$/.test(url.pathname));
  const customerUrl = page.url();

  // Duplicado é bloqueado
  await page.goto("/clientes/novo");
  await page.fill("#name", "Outro João");
  await page.fill("#phone", "11998765432");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("Já existe um cliente com este telefone").first()).toBeVisible();

  // Atendimento antigo → retorno atrasado (180 dias de intervalo)
  await page.goto(customerUrl);
  await page.locator('main a[href*="cliente="]').first().click();
  await page.click("#serviceId");
  await page.getByRole("option", { name: /Limpeza de ar-condicionado/ }).click();
  await page.fill("#date", daysAgo(190));
  await page.fill("#amount", "180,00");
  await expect(page.getByText(/Retorno sugerido para/)).toBeVisible();
  await page.locator("form").getByRole("button", { name: "Registrar atendimento" }).click();
  await page.waitForURL((url) => /\/clientes\/(?!novo$)[a-z0-9]+$/.test(url.pathname));

  // Central de retornos → WhatsApp assistido
  await page.goto("/retornos?aba=atrasados");
  await expect(page.getByText("João Silva").first()).toBeVisible();
  await page.getByRole("button", { name: "Enviar WhatsApp" }).click();
  const message = page.locator("#message");
  await expect(message).toHaveValue(/Olá, João! .*ClimaTech E2E.*limpeza de ar-condicionado/);
  const link = page.getByRole("link", { name: /Abrir WhatsApp/ });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5511998765432\?text=/);
  expect(new URL(href!).searchParams.get("text")).toBe(await message.inputValue());

  const popupPromise = context.waitForEvent("page");
  await link.click();
  (await popupPromise).close();
  // Abrir o WhatsApp NÃO marca como enviado: exige confirmação manual
  await expect(page.getByRole("dialog").getByText("Abrir o WhatsApp não envia a mensagem")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /marcar como contatado/ })
    .click();
  await expect(page.getByText("Contato registrado.")).toBeVisible();

  await page.goto("/retornos?aba=contatados");
  await expect(page.getByText("João Silva").first()).toBeVisible();

  // Registrar retorno → convertido
  await page.getByRole("link", { name: "Registrar retorno" }).click();
  await page.fill("#amount", "200");
  await page.getByRole("button", { name: "Registrar retorno" }).click();
  await page.waitForURL("**/retornos?aba=convertidos");
  await expect(page.getByText("João Silva").first()).toBeVisible();

  // Indicadores refletem os dados reais
  await page.goto("/painel");
  await expect(page.getByText("R$ 200,00").first()).toBeVisible();
});

test("isolamento: outra empresa não acessa dados por URL", async ({ browser }) => {
  const a = await browser.newPage();
  await signUpAndOnboard(a, { name: "Dona A", company: "Empresa A", segment: "Oficina", phone: "(11) 97777-1111" });
  await a.goto("/clientes/novo");
  await a.fill("#name", "Cliente Secreto");
  await a.fill("#phone", "(11) 96666-2222");
  await a.getByRole("button", { name: "Cadastrar cliente" }).click();
  await a.waitForURL((url) => /\/clientes\/(?!novo$)[a-z0-9]+$/.test(url.pathname));
  const secretUrl = a.url();

  const b = await (await browser.newContext()).newPage();
  await signUpAndOnboard(b, { name: "Dono B", company: "Empresa B", segment: "Barbearia", phone: "(21) 95555-3333" });
  await b.goto(secretUrl);
  await expect(b.getByText("Registro não encontrado")).toBeVisible();
  await expect(b.getByText("Cliente Secreto")).toHaveCount(0);
  const csv = await (await b.request.get("/api/exportar/clientes")).text();
  expect(csv).not.toContain("Cliente Secreto");
});

test("rotas privadas exigem login", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fclientes/);
  const api = await page.request.get("/api/exportar/dados");
  expect(api.status()).toBe(401);
});
