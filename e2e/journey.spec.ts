import { expect, test } from "@playwright/test";
import { db, loginOk, register, uniqueEmail, verifyEmail } from "./helpers";

/**
 * Jornada principal do produto, ponta a ponta, num build de produção:
 * organizador cria conta e organização → cadastra evento com local no mapa →
 * envia para análise → admin aprova → público encontra no mapa, abre a página,
 * salva e marca presença → organizador vê as métricas.
 */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@e2e.mixtour.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin-E2E-Mixtour-2026";

// Coordenadas reais da Praça da Sé (São Paulo) — o pino do evento.
const PLACE = { latitude: -23.5503, longitude: -46.6342 };

function localDate(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); // YYYY-MM-DD
}

test.describe.serial("jornada organizador → moderação → público", () => {
  // Celular é a plataforma principal: a jornada roda nos dois projetos (mobile e desktop).
  const organizer = uniqueEmail("organizador");
  const fan = uniqueEmail("fa");
  const title = `Roda de choro E2E ${Date.now().toString(36)}`;
  const orgName = `Coletivo Choro ${Date.now().toString(36)}`;

  test("organizador cria conta, organização e envia evento para análise", async ({ page, context, isMobile }) => {
    // No celular o editor é em etapas: avança com "Continuar"; no desktop todas as seções ficam visíveis.
    const nextStep = async () => {
      if (isMobile) await page.getByRole("button", { name: "Continuar" }).click();
    };
    await register(page, "Olga Organizadora", organizer);
    await expect(page).toHaveURL(/bemvindo=1/);
    await verifyEmail(page, organizer);

    await page.goto("/painel");
    await expect(page).toHaveURL(/\/painel\/comecar/);
    await page.getByLabel("Nome da organização").fill(orgName);
    await page.getByLabel("Cidade").fill("São Paulo");
    await page.getByLabel("UF").selectOption("SP");
    await page.getByRole("button", { name: "Criar organização" }).click();
    await expect(page.getByRole("heading", { name: "Organização criada!" })).toBeVisible();
    await page.getByRole("button", { name: "Pular por enquanto" }).click();
    await expect(page).toHaveURL(/\/painel\?bemvindo=1/);

    await page.goto("/painel/eventos/novo");
    await page.getByLabel("Nome do evento").fill(title);
    await page.getByRole("button", { name: "Shows e música" }).click();
    await page.getByLabel("Resumo").fill("Roda aberta de choro com músicos convidados.");
    await page.getByLabel("Descrição").fill("Traga seu instrumento! Roda aberta de choro na praça, com repertório tradicional e convidados.");
    await nextStep();

    await page.getByLabel("Começa em").fill(localDate(3));
    await page.getByLabel("Horário", { exact: true }).first().fill("19:00");
    await page.getByLabel("Termina em").fill(localDate(3));
    await page.getByLabel("Horário", { exact: true }).nth(1).fill("22:30");
    await nextStep();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(PLACE);
    await page.getByRole("button", { name: "Usar minha localização" }).click();
    await page.getByLabel("Nome do local", { exact: true }).fill("Praça da Sé");
    await page.getByLabel("Endereço", { exact: true }).fill("Praça da Sé, s/n");
    await page.getByLabel("Cidade").fill("São Paulo");
    await page.getByLabel("UF").selectOption("SP");
    await nextStep();

    await page.getByRole("radio", { name: "Gratuita" }).click();
    await nextStep(); // detalhes
    await nextStep(); // imagem
    await nextStep(); // revisão

    await page.getByRole("button", { name: "Enviar para análise" }).last().click();
    await expect.poll(async () => (await db.event.findFirst({ where: { title } }))?.status, { timeout: 15_000 }).toBe("PENDING_REVIEW");

    const ev = await db.event.findFirstOrThrow({ where: { title } });
    expect(ev.isFree).toBe(true);
    expect(ev.lat).toBeCloseTo(PLACE.latitude, 3);
    expect(ev.lng).toBeCloseTo(PLACE.longitude, 3);
    // 19:00 em São Paulo (UTC-3) = 22:00Z
    expect(ev.startsAt.toISOString()).toMatch(/T22:00:00/);

    // Pendente não é público
    const res = await page.goto(`/evento/${ev.slug}`);
    expect([200, 404]).toContain(res?.status());
    await page.context().clearCookies();
    const anon = await page.goto(`/evento/${ev.slug}`);
    expect(anon?.status()).toBe(404);
  });

  test("admin aprova o evento na fila de moderação", async ({ page }) => {
    await loginOk(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto("/admin/moderacao");
    await expect(page.getByText(title).first()).toBeVisible();
    await page.getByRole("button", { name: "Aprovar e publicar" }).first().click();
    await expect.poll(async () => (await db.event.findFirst({ where: { title } }))?.status, { timeout: 15_000 }).toBe("PUBLISHED");

    const org = await db.organization.findFirstOrThrow({ where: { name: orgName }, include: { members: true } });
    await expect
      .poll(async () => db.notification.count({ where: { userId: org.members[0].userId, type: "EVENT_APPROVED" } }), { timeout: 10_000 })
      .toBe(1);
  });

  test("público encontra no mapa, abre a página, salva e marca presença", async ({ page, isMobile }) => {
    const ev = await db.event.findFirstOrThrow({ where: { title } });

    await page.goto(`/?lat=${PLACE.latitude}&lng=${PLACE.longitude}&z=14`);
    if (isMobile) await page.getByRole("button", { name: "Ver em lista" }).click();
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible({ timeout: 20_000 });

    const viewBeacon = page.waitForResponse((r) => r.url().endsWith(`/api/events/${ev.id}/view`) && r.request().method() === "POST");
    await page.goto(`/evento/${ev.slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // a visualização conta após ~1 s com a página visível
    expect((await viewBeacon).status()).toBe(200);
    await expect(page.getByText("Praça da Sé").first()).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

    // Sem login, salvar abre o convite para entrar (sheet no celular) com retorno para a página
    await page.getByRole("button", { name: /Salvar/ }).first().click();
    const prompt = page.getByRole("dialog", { name: "Entre para salvar este evento" });
    await expect(prompt).toBeVisible();
    await prompt.getByRole("link", { name: "Criar conta grátis" }).click();
    await expect(page).toHaveURL(/\/cadastrar\?next=/);
    await page.getByLabel("Nome").fill("Fabi Fã");
    await page.getByLabel("E-mail").fill(fan);
    await page.getByLabel("Senha", { exact: true }).fill("festa2026segura");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Criar conta grátis" }).click();
    await expect(page).toHaveURL(new RegExp(`/evento/${ev.slug}`));

    await page.getByRole("button", { name: /Salvar/ }).first().click();
    await expect.poll(async () => (await db.event.findUniqueOrThrow({ where: { id: ev.id } })).savesCount, { timeout: 10_000 }).toBe(1);

    // Evento gratuito sem link de ingresso: a barra fixa mostra "Vou" direto
    await page.getByRole("button", { name: "Vou", exact: true }).first().click();
    await expect.poll(async () => (await db.event.findUniqueOrThrow({ where: { id: ev.id } })).goingCount, { timeout: 10_000 }).toBe(1);

    await page.goto("/salvos");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();

    // visualização registrada pelo rastreador (navegadores de teste "headless" são tratados como robôs e não contam)
    const ua = await page.evaluate(() => navigator.userAgent);
    if (!/headless/i.test(ua)) {
      await expect.poll(async () => (await db.event.findUniqueOrThrow({ where: { id: ev.id } })).viewsCount, { timeout: 10_000 }).toBeGreaterThan(0);
    }
  });

  test("organizador vê métricas e o .ics é válido", async ({ page, request }) => {
    const ev = await db.event.findFirstOrThrow({ where: { title } });
    await loginOk(page, organizer);
    await page.goto(`/painel/eventos/${ev.id}/estatisticas`);
    await expect(page.getByText(/Salvamentos|salvamentos/).first()).toBeVisible();

    const ics = await request.get(`/api/events/${ev.id}/ics`);
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    const body = await ics.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toMatch(/DTSTART:\d{8}T220000Z/);
  });
});
