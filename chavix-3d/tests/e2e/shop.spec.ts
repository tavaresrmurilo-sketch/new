import { expect, test, type Page } from "@playwright/test";
import { crc16, parseTlv, verifyPixPayload } from "../../src/lib/pix/brcode";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

async function addHexaGridToCart(page: Page, quantity = 2) {
  await page.goto("/produto/hexa-grid");
  await expect(page.getByRole("heading", { level: 1, name: "Hexa Grid" })).toBeVisible();
  await page.getByRole("radio", { name: /Violeta elétrico/ }).click();
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: "Aumentar quantidade" }).first().click();
  await expect(page.getByText("R$ 45,80")).toBeVisible(); // 2 × 22,90
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await expect(page.getByRole("dialog", { name: "Seu carrinho" })).toBeVisible();
}

async function fillCheckout(page: Page, email: string) {
  await page.getByLabel("Nome completo").fill("Cliente Teste E2E");
  await page.getByLabel("Telefone / WhatsApp").fill("62988887777");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("radio", { name: /Retirada/ }).click();
  await page.getByLabel(/Li e concordo/).check();
}

test.describe.serial("compra com Pix e confirmação manual", () => {
  let orderCode = "";
  let totalText = "";

  test("cliente compra, recebe QR Pix válido e avisa o pagamento", async ({ page }) => {
    await addHexaGridToCart(page);
    await page.getByRole("link", { name: "Finalizar" }).click();
    await expect(page).toHaveURL(/\/checkout/);

    await fillCheckout(page, `e2e-${Date.now()}@teste.com`);
    await expect(page.getByText("R$ 45,80").first()).toBeVisible();
    await page.getByRole("button", { name: "Criar pedido e gerar Pix" }).click();

    await expect(page).toHaveURL(/\/pedido\/CHX-[A-Z0-9]{6}\/pagamento/);
    orderCode = page.url().match(/CHX-[A-Z0-9]{6}/)![0];
    await expect(page.getByText("Abra o aplicativo do seu banco, escolha Pix → Pagar com QR Code e escaneie o código.")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR Code Pix do pedido" }).locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar código Pix" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar Pix Copia e Cola" })).toBeVisible();

    const payload = (await page.locator("p.select-all").first().innerText()).trim();
    expect(verifyPixPayload(payload)).toBe(true);
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4));
    const fields = parseTlv(payload);
    expect(fields.find((f) => f.id === "54")?.value).toBe("45.80");
    expect(parseTlv(fields.find((f) => f.id === "62")!.value)[0].value).toBe(orderCode.replace("-", ""));
    totalText = "R$ 45,80";

    await page.getByRole("button", { name: "Já fiz o pagamento" }).click();
    await expect(page.getByText("Recebemos sua solicitação de confirmação. Assim que identificarmos o pagamento, seu pedido será liberado para produção.")).toBeVisible();
    await expect(page.getByText("Pagamento em análise").first()).toBeVisible();
  });

  test("pedido não é visível sem confirmar e-mail/telefone", async ({ browser }) => {
    test.skip(!orderCode);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/pedido/${orderCode}`);
    await expect(page.getByRole("heading", { name: "Confirme que o pedido é seu" })).toBeVisible();
    await expect(page.getByText("Cliente Teste E2E")).toHaveCount(0);

    await page.getByLabel("E-mail ou telefone usado na compra").fill("outra@pessoa.com");
    await page.getByRole("button", { name: "Ver meu pedido" }).click();
    await expect(page.getByText("Não encontramos um pedido com esses dados")).toBeVisible();

    await page.getByLabel("E-mail ou telefone usado na compra").fill("(62) 98888-7777");
    await page.getByRole("button", { name: "Ver meu pedido" }).click();
    await expect(page.getByRole("heading", { name: orderCode })).toBeVisible();
    await context.close();
  });

  test("admin exige login e confirma o pagamento", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop" || !orderCode || !ADMIN_EMAIL || !ADMIN_PASSWORD);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/admin/pedidos");
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

    await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/pedidos/);

    await page.goto(`/admin/pedidos/${orderCode}`);
    await expect(page.getByText("Pagamento em análise").first()).toBeVisible();
    await page.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(page.getByRole("dialog")).toContainText(totalText);
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByText("Pagamento em análise → Pago")).toBeVisible();
    await expect(page.getByText(/Admin: /).last()).toBeVisible();

    await page.getByRole("button", { name: "Iniciar produção" }).click();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByText("Pago → Em produção")).toBeVisible();
    await context.close();
  });

  test("cliente vê a linha do tempo atualizada", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop" || !orderCode);
    await page.goto("/acompanhar");
    await page.getByLabel("Código do pedido").fill(orderCode.toLowerCase());
    await page.getByLabel("E-mail ou telefone usado na compra").fill("62988887777");
    await page.getByRole("button", { name: "Ver meu pedido" }).click();
    await expect(page.getByRole("heading", { name: orderCode })).toBeVisible();
    await expect(page.getByText("Em produção").first()).toBeVisible();
  });
});

test("busca instantânea encontra produtos", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Buscar" }).fill("patinha");
  await expect(page.getByRole("option", { name: /Patinha/ })).toBeVisible();
});

test("filtros e ordenação do catálogo", async ({ page }) => {
  await page.goto("/produtos?ordem=menor-preco");
  const prices = await page.locator("article").evaluateAll((cards) =>
    cards.map((card) => Number((card.textContent ?? "").match(/R\$\s?([\d.,]+)/)?.[1].replace(".", "").replace(",", ".") ?? 0)),
  );
  expect(prices.length).toBeGreaterThan(3);
  expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  await page.goto("/produtos?categoria=pets");
  await expect(page.getByRole("heading", { name: "Patinha" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hexa Grid" })).toHaveCount(0);
});

test("personalizar calcula a estimativa e adiciona ao carrinho", async ({ page }, testInfo) => {
  await page.goto("/personalizar");
  await expect(page.getByText("Pedidos personalizados passam por análise antes da produção.")).toBeVisible();
  await page.getByRole("radio", { name: /Hexágono/ }).click();
  await page.getByLabel("Nome ou texto").fill("Maria");
  const estimate = testInfo.project.name === "mobile" ? page.locator(".fixed").getByText("R$ 26,90") : page.getByText("R$ 26,90").first();
  await expect(estimate).toBeVisible(); // 24,90 + 2,00 hexágono
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).last().click();
  await expect(page.getByRole("dialog", { name: "Seu carrinho" })).toContainText("Chaveiro personalizado");
});

test("páginas principais sem rolagem horizontal", async ({ page }) => {
  for (const path of ["/", "/produtos", "/produto/tag-nome", "/personalizar", "/carrinho", "/checkout", "/acompanhar", "/faq", "/contato"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `rolagem horizontal em ${path}`).toBeLessThanOrEqual(0);
  }
});
