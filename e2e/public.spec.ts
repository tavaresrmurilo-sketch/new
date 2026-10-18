import { expect, test } from "@playwright/test";
import { db } from "./helpers";

/**
 * Telas públicas (celular e desktop). Os eventos usados aqui são criados no banco
 * de E2E pelo próprio teste e removidos no final.
 */
const tag = `pub${Date.now().toString(36)}`;
let slug = "";

test.beforeAll(async () => {
  const owner = await db.user.create({ data: { email: `${tag}@e2e.mixtour.test`, name: "Dona Teste", emailVerifiedAt: new Date() } });
  const org = await db.organization.create({ data: { name: `Casa ${tag}`, slug: `casa-${tag}`, members: { create: { userId: owner.id, role: "OWNER" } } } });
  const cat = await db.category.findUniqueOrThrow({ where: { slug: "feiras" } });
  const startsAt = new Date(Date.now() + 26 * 3_600_000);
  const ev = await db.event.create({
    data: {
      organizationId: org.id,
      categoryId: cat.id,
      title: `Feira de vinil ${tag}`,
      slug: `feira-de-vinil-${tag}`,
      status: "PUBLISHED",
      publishedAt: new Date(),
      startsAt,
      endsAt: new Date(startsAt.getTime() + 5 * 3_600_000),
      venueName: "Galeria Teste",
      address: "Rua Augusta, 1500",
      city: "São Paulo",
      state: "SP",
      lat: -23.5587,
      lng: -46.6602,
      isFree: false,
      priceMinCents: 2000,
      ticketUrl: "https://example.com/ingressos",
      ticketProvider: "Bilheteria",
    },
  });
  slug = ev.slug;
});

test.afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: `casa-${tag}` } });
  await db.user.deleteMany({ where: { email: `${tag}@e2e.mixtour.test` } });
});

test("explorar mostra o evento no mapa e na lista", async ({ page, isMobile }) => {
  await page.goto(`/?lat=-23.5587&lng=-46.6602&z=14`);
  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    await page.getByRole("button", { name: "Ver em lista" }).click();
  }
  await expect(page.getByRole("link", { name: `Feira de vinil ${tag}` }).first()).toBeVisible({ timeout: 20_000 });
  // pino acessível no mapa
  await expect(page.getByRole("button", { name: new RegExp(`Feira de vinil ${tag}`) }).first()).toBeAttached();
});

test("filtros ficam na URL", async ({ page }) => {
  await page.goto(`/?lat=-23.5587&lng=-46.6602&z=14`);
  await page.getByRole("button", { name: "Amanhã", exact: true }).first().click();
  await expect(page).toHaveURL(/quando=tomorrow/);
});

test("página do evento: dados, ingresso rastreado e agenda", async ({ page, request, isMobile }) => {
  await page.goto(`/evento/${slug}`);
  await expect(page.getByRole("heading", { name: `Feira de vinil ${tag}` })).toBeVisible();
  await expect(page.getByText("R$ 20").first()).toBeVisible();
  const buy = page.getByRole("link", { name: /Comprar ingresso/ }).first();
  await expect(buy).toBeVisible();
  if (isMobile) await expect(page.getByRole("navigation", { name: "Navegação principal" })).toHaveCount(0);

  const ev = await db.event.findUniqueOrThrow({ where: { slug } });
  const r = await request.get(`/r/${ev.id}`, { maxRedirects: 0 });
  expect([302, 307]).toContain(r.status());
  expect(r.headers()["location"]).toBe("https://example.com/ingressos");
});

test("perfil público do organizador", async ({ page }) => {
  await page.goto(`/organizador/casa-${tag}`);
  await expect(page.getByRole("heading", { name: `Casa ${tag}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Feira de vinil ${tag}` }).first()).toBeVisible();
});

test("página para organizadores mostra os planos do banco", async ({ page }) => {
  await page.goto("/para-organizadores");
  await expect(page.locator("#planos")).toBeVisible();
  for (const name of ["Gratuito", "Pro", "Business"]) await expect(page.locator("#planos").getByText(name, { exact: true }).first()).toBeVisible();
});

test("SEO e utilidades", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /painel");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/evento/${slug}`);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
  expect((await request.get("/evento/nao-existe-xyz")).status()).toBe(404);
});

test("cabeçalhos de segurança", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});
