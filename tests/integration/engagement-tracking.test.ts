import { beforeEach, describe, expect, it } from "vitest";
import { isBotUserAgent, recordShare, recordTicketClick, recordView, safeTicketUrl } from "@/server/engagement/tracking";
import { GET as ticketRedirect } from "@/app/r/[id]/route";
import { GET as icsDownload } from "@/app/api/events/[id]/ics/route";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const visitor = (ip = "200.10.10.1", userAgent: string | null = UA) => ({ ip, userAgent });

async function setup(data: Parameters<typeof createEvent>[1] = {}) {
  const owner = await createUser();
  const org = await createOrg(owner.id);
  const event = await createEvent(org.id, data);
  return { owner, org, event };
}

async function metrics(eventId: string) {
  const [e, m, marks] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { viewsCount: true, ticketClicks: true, sharesCount: true, updatedAt: true } }),
    prisma.eventMetricDaily.findMany({ where: { eventId } }),
    prisma.eventViewMark.count({ where: { eventId } }),
  ]);
  return { ...e, daily: m[0], marks };
}

describe("visualizações", () => {
  it("conta toda visualização e só a primeira do dia como única (dedup por hash do visitante)", async () => {
    const { event } = await setup();
    const before = (await metrics(event.id)).updatedAt;

    expect(await recordView(event.id, visitor())).toEqual({ counted: true, unique: true });
    expect(await recordView(event.id, visitor())).toEqual({ counted: true, unique: false });
    expect(await recordView(event.id, visitor("200.10.10.2"))).toEqual({ counted: true, unique: true });

    const m = await metrics(event.id);
    expect(m.viewsCount).toBe(3);
    expect(m.daily.views).toBe(3);
    expect(m.daily.uniqueViews).toBe(2);
    expect(m.marks).toBe(2);
    // Métricas não mexem no updatedAt (sitemap / .ics).
    expect(m.updatedAt.getTime()).toBe(before.getTime());
    // Nenhum IP em claro é guardado.
    const marks = await prisma.eventViewMark.findMany({ where: { eventId: event.id } });
    expect(marks.every((x) => !x.visitorHash.includes("200.10"))).toBe(true);
  });

  it("ignora robôs e pré-visualizadores de link", async () => {
    const { event } = await setup();
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23.20.0 A",
      "curl/8.4.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0 Safari/537.36",
      null,
      "",
    ]) {
      expect(await recordView(event.id, visitor("1.1.1.1", ua))).toMatchObject({ counted: false, reason: "bot" });
    }
    expect((await metrics(event.id)).viewsCount).toBe(0);
    expect(isBotUserAgent(UA)).toBe(false);
  });

  it("não conta a equipe do organizador", async () => {
    const { owner, event } = await setup();
    expect(await recordView(event.id, { ...visitor(), viewerId: owner.id })).toMatchObject({ counted: false, reason: "member" });
    const fan = await createUser();
    expect(await recordView(event.id, { ...visitor(), viewerId: fan.id })).toMatchObject({ counted: true });
  });

  it("evento sem página pública não registra (rascunho, em análise, organização suspensa)", async () => {
    const { org } = await setup();
    const draft = await createEvent(org.id, { status: "DRAFT" });
    const pending = await createEvent(org.id, { status: "PENDING_REVIEW" });
    expect(await recordView(draft.id, visitor())).toMatchObject({ counted: false, reason: "not_found" });
    expect(await recordView(pending.id, visitor())).toMatchObject({ counted: false, reason: "not_found" });
    expect(await recordView("inexistente", visitor())).toMatchObject({ reason: "not_found" });

    const other = await setup();
    await prisma.organization.update({ where: { id: other.org.id }, data: { status: "SUSPENDED" } });
    expect(await recordView(other.event.id, visitor())).toMatchObject({ reason: "not_found" });
  });

  it("limita repetições do mesmo visitante (3 por minuto) para não inflar", async () => {
    const { event } = await setup();
    for (let i = 0; i < 3; i++) expect((await recordView(event.id, visitor())).counted).toBe(true);
    expect(await recordView(event.id, visitor())).toMatchObject({ counted: false, reason: "throttled" });
    expect((await metrics(event.id)).viewsCount).toBe(3);
  });
});

describe("clique em ingressos (/r/[id])", () => {
  it("só aceita http(s) sem credenciais", () => {
    expect(safeTicketUrl("https://www.sympla.com.br/evento/123")).toBe("https://www.sympla.com.br/evento/123");
    expect(safeTicketUrl("http://ingressos.exemplo.com/x?y=1")).toBe("http://ingressos.exemplo.com/x?y=1");
    expect(safeTicketUrl("javascript:alert(1)")).toBeNull();
    expect(safeTicketUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeTicketUrl("ftp://arquivos.exemplo.com/ingresso")).toBeNull();
    expect(safeTicketUrl("https://sympla.com.br@golpe.exemplo.com/")).toBeNull();
    expect(safeTicketUrl("https://localhost/")).toBeNull();
    expect(safeTicketUrl("sympla.com.br/evento")).toBeNull();
    expect(safeTicketUrl(null)).toBeNull();
  });

  it("registra o clique e devolve o destino; repetições do mesmo IP não inflam", async () => {
    const { event } = await setup({ ticketUrl: "https://www.sympla.com.br/evento/abc" });
    expect(await recordTicketClick(event.id, visitor())).toEqual({ url: "https://www.sympla.com.br/evento/abc", counted: true });
    expect(await recordTicketClick(event.id, visitor())).toEqual({ url: "https://www.sympla.com.br/evento/abc", counted: true });
    expect(await recordTicketClick(event.id, visitor())).toEqual({ url: "https://www.sympla.com.br/evento/abc", counted: false });
    expect(await recordTicketClick(event.id, visitor("9.9.9.9", "facebookexternalhit/1.1"))).toMatchObject({ counted: false });
    const m = await metrics(event.id);
    expect(m.ticketClicks).toBe(2);
    expect(m.daily.ticketClicks).toBe(2);
  });

  it("evento sem link válido ou sem página pública → null", async () => {
    const { org } = await setup();
    const noTicket = await createEvent(org.id);
    const js = await createEvent(org.id, { ticketUrl: "javascript:alert(1)" });
    const draft = await createEvent(org.id, { status: "DRAFT", ticketUrl: "https://www.sympla.com.br/x" });
    const rejected = await createEvent(org.id, { status: "REJECTED", ticketUrl: "https://www.sympla.com.br/y" });
    for (const e of [noTicket, js, draft, rejected]) expect(await recordTicketClick(e.id, visitor())).toBeNull();
  });

  it("a rota redireciona com 302 e responde 404 para evento não público", async () => {
    const { org, event } = await setup({ ticketUrl: "https://www.sympla.com.br/evento/abc" });
    const draft = await createEvent(org.id, { status: "DRAFT", ticketUrl: "https://www.sympla.com.br/evento/abc" });
    const req = (id: string) =>
      [new Request(`http://localhost:3000/r/${id}`, { headers: { "user-agent": UA } }), { params: Promise.resolve({ id }) }] as const;

    const ok = await ticketRedirect(...req(event.id));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("https://www.sympla.com.br/evento/abc");
    expect(ok.headers.get("cache-control")).toBe("no-store");

    expect((await ticketRedirect(...req(draft.id))).status).toBe(404);
    expect((await ticketRedirect(...req("../../etc"))).status).toBe(404);
  });
});

describe("compartilhamentos e .ics", () => {
  it("conta compartilhamentos só de eventos públicos", async () => {
    const { org, event } = await setup();
    expect(await recordShare(event.id, visitor())).toEqual({ counted: true, found: true });
    expect((await metrics(event.id)).sharesCount).toBe(1);
    const draft = await createEvent(org.id, { status: "DRAFT" });
    expect(await recordShare(draft.id, visitor())).toEqual({ counted: false, found: false });
  });

  it("serve o .ics de evento público e 404 para rascunho", async () => {
    const { org, event } = await setup({ title: "Sarau, poesia; e música" });
    const draft = await createEvent(org.id, { status: "DRAFT" });
    const call = (id: string) => icsDownload(new Request(`http://localhost:3000/api/events/${id}/ics`), { params: Promise.resolve({ id }) });

    const res = await call(event.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="sarau-poesia-e-musica-[a-z0-9]+\.ics"$/);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR\r\n");
    expect(body).toContain(`UID:event-${event.id}@localhost`);
    expect(body.replace(/\r\n /g, "")).toContain("SUMMARY:Sarau\\, poesia\\; e música");

    expect((await call(draft.id)).status).toBe(404);
  });
});
