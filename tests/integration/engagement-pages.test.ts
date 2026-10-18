import { beforeEach, describe, expect, it } from "vitest";
import type { EventStatus } from "@prisma/client";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import {
  eventJsonLd,
  eventPhase,
  getEventBySlug,
  getEventPage,
  getOrganizerBySlug,
  moreFromOrganizer,
  nearbyEvents,
  organizerEvents,
  organizerLinks,
  safeExternalUrl,
  serializeJsonLd,
} from "@/server/events/detail";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const DAY = 86_400_000;
const viewerOf = (u: { id: string; role?: string }) => ({ id: u.id, isAdmin: u.role === "ADMIN" });

async function setup(status: EventStatus = "PUBLISHED", orgData: Parameters<typeof createOrg>[1] = {}) {
  const owner = await createUser();
  const org = await createOrg(owner.id, orgData);
  const event = await createEvent(org.id, { status, title: `Evento ${status}` });
  return { owner, org, event };
}

describe("visibilidade da página do evento", () => {
  it("publicado, cancelado e encerrado têm página pública para qualquer pessoa", async () => {
    for (const status of ["PUBLISHED", "CANCELED", "ARCHIVED"] as const) {
      const { event } = await setup(status);
      const page = await getEventPage(event.slug, null);
      expect(page?.access, status).toBe("public");
    }
  });

  it("rascunho, em análise e recusado → 404 para visitantes e contas sem vínculo", async () => {
    const stranger = viewerOf(await createUser());
    for (const status of ["DRAFT", "PENDING_REVIEW", "REJECTED"] as const) {
      const { event } = await setup(status);
      expect(await getEventPage(event.slug, null), status).toBeNull();
      expect(await getEventPage(event.slug, stranger), status).toBeNull();
    }
  });

  it("membros da organização (qualquer papel) e a administração veem como prévia", async () => {
    const { org, owner, event } = await setup("DRAFT");
    const editor = await createUser();
    await prisma.membership.create({ data: { organizationId: org.id, userId: editor.id, role: "EDITOR" } });
    const admin = await createUser({ role: "ADMIN" });

    expect((await getEventPage(event.slug, viewerOf(owner)))?.access).toBe("preview");
    expect((await getEventPage(event.slug, viewerOf(editor)))?.access).toBe("preview");
    expect((await getEventPage(event.slug, viewerOf(admin)))?.access).toBe("preview");
  });

  it("organização suspensa tira a página do ar (só prévia para a equipe)", async () => {
    const { owner, event } = await setup("PUBLISHED", { status: "SUSPENDED" });
    expect(await getEventPage(event.slug, null)).toBeNull();
    expect((await getEventPage(event.slug, viewerOf(owner)))?.access).toBe("preview");
  });

  it("slug inválido ou inexistente → null sem consultar nada estranho", async () => {
    expect(await getEventBySlug("../../etc/passwd")).toBeNull();
    expect(await getEventBySlug("NAO-EXISTE")).toBeNull();
    expect(await getEventPage("nao-existe-123", null)).toBeNull();
  });

  it("fase do evento: próximo, acontecendo, encerrado e cancelado", () => {
    const now = new Date("2026-10-18T20:00:00Z");
    const at = (h: number) => new Date(now.getTime() + h * 3_600_000);
    expect(eventPhase({ status: "PUBLISHED", startsAt: at(2), endsAt: at(4) }, now)).toBe("upcoming");
    expect(eventPhase({ status: "PUBLISHED", startsAt: at(-1), endsAt: at(1) }, now)).toBe("live");
    expect(eventPhase({ status: "PUBLISHED", startsAt: at(-4), endsAt: at(-1) }, now)).toBe("past");
    expect(eventPhase({ status: "ARCHIVED", startsAt: at(2), endsAt: at(4) }, now)).toBe("past");
    expect(eventPhase({ status: "CANCELED", startsAt: at(2), endsAt: at(4) }, now)).toBe("canceled");
  });
});

describe("seções da página do evento", () => {
  it("“Mais do organizador” e “Perto deste local” trazem só eventos listados, sem o atual", async () => {
    const { org, event } = await setup();
    const same = await createEvent(org.id, { title: "Outro do mesmo organizador" });
    await createEvent(org.id, { title: "Rascunho do mesmo organizador", status: "DRAFT" });
    await createEvent(org.id, { title: "Já passou", startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - 2 * DAY) });

    const other = await createOrg((await createUser()).id);
    const near = await createEvent(other.id, { title: "Perto daqui", lat: -23.56, lng: -46.64 });
    await createEvent(other.id, { title: "Longe (Campinas)", lat: -22.9056, lng: -47.0608 });

    const more = await moreFromOrganizer(org.id, event.id);
    expect(more.map((m) => m.id)).toEqual([same.id]);

    const nearby = await nearbyEvents({ lat: event.lat, lng: event.lng }, { excludeIds: [event.id], radiusKm: 10 });
    expect(nearby.map((n) => n.id).sort()).toEqual([same.id, near.id].sort());
    expect(nearby.every((n) => n.distanceKm != null && n.distanceKm <= 10)).toBe(true);
  });
});

describe("perfil do organizador", () => {
  it("só organizações ativas; separa próximos e anteriores sem rascunhos", async () => {
    const { org, event } = await setup();
    await createEvent(org.id, { title: "Rascunho", status: "DRAFT" });
    await createEvent(org.id, { title: "Cancelado", status: "CANCELED" });
    const past = await createEvent(org.id, { title: "Anterior", startsAt: new Date(Date.now() - 10 * DAY), endsAt: new Date(Date.now() - 9 * DAY) });

    expect((await getOrganizerBySlug(org.slug))?.id).toBe(org.id);
    const lists = await organizerEvents(org.id);
    expect(lists.upcoming.map((e) => e.id)).toEqual([event.id]);
    expect(lists.past.map((e) => e.id)).toEqual([past.id]);
    expect(lists).toMatchObject({ upcomingTotal: 1, pastTotal: 1 });

    const suspended = await createOrg((await createUser()).id, { status: "SUSPENDED" });
    expect(await getOrganizerBySlug(suspended.slug)).toBeNull();
  });

  it("normaliza links: só http(s), @ do Instagram e WhatsApp com DDI", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,oi")).toBeNull();
    expect(safeExternalUrl("https://user:senha@site.com")).toBeNull();
    expect(safeExternalUrl("site sem ponto")).toBeNull();
    expect(safeExternalUrl("casadoforro.com.br")?.toString()).toBe("https://casadoforro.com.br/");

    const links = organizerLinks({ website: "www.exemplo.com.br/agenda", instagram: "https://instagram.com/casa.do_forro?igsh=1", whatsapp: "(11) 98765-4321" });
    expect(links).toEqual([
      { kind: "website", href: "https://www.exemplo.com.br/agenda", label: "exemplo.com.br" },
      { kind: "instagram", href: "https://www.instagram.com/casa.do_forro/", label: "@casa.do_forro" },
      { kind: "whatsapp", href: "https://wa.me/5511987654321", label: "WhatsApp" },
    ]);
    expect(organizerLinks({ website: "ftp://x.com", instagram: "@nome inválido!", whatsapp: "123" })).toEqual([]);
  });
});

describe("JSON-LD", () => {
  it("evento cancelado vira EventCancelled sem ofertas; gratuito tem preço 0", async () => {
    const { event } = await setup("CANCELED");
    const canceled = (await getEventBySlug(event.slug))!;
    const ld = eventJsonLd(canceled, null);
    expect(ld.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(ld.offers).toBeUndefined();
    expect(ld.location.geo).toEqual({ "@type": "GeoCoordinates", latitude: event.lat, longitude: event.lng });

    const free = await createEvent(event.organizationId, { title: "Show grátis", isFree: true });
    const freeLd = eventJsonLd((await getEventBySlug(free.slug))!, null);
    expect(freeLd.offers).toMatchObject({ "@type": "Offer", price: "0", priceCurrency: "BRL" });
    expect(freeLd.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
  });

  it("a serialização não deixa fechar a tag <script>", () => {
    const s = serializeJsonLd({ name: "</script><script>alert(1)</script> & cia" });
    expect(s).not.toContain("<");
    expect(s).not.toContain(">");
    expect(JSON.parse(s)).toEqual({ name: "</script><script>alert(1)</script> & cia" });
  });
});

describe("sitemap e robots", () => {
  it("lista só páginas públicas: sem rascunhos, sem organização suspensa e sem eventos antigos", async () => {
    const { org, event } = await setup();
    const canceled = await createEvent(org.id, { title: "Cancelado", status: "CANCELED" });
    const recentPast = await createEvent(org.id, { title: "Recente", startsAt: new Date(Date.now() - 30 * DAY), endsAt: new Date(Date.now() - 30 * DAY + 3_600_000) });
    const oldPast = await createEvent(org.id, { title: "Antigo", startsAt: new Date(Date.now() - 120 * DAY), endsAt: new Date(Date.now() - 120 * DAY + 3_600_000) });
    const hidden = await Promise.all(
      (["DRAFT", "PENDING_REVIEW", "REJECTED"] as const).map((status) => createEvent(org.id, { title: `Oculto ${status}`, status })),
    );
    const suspended = await setup("PUBLISHED", { status: "SUSPENDED" });
    const draftOnly = await setup("DRAFT");

    const urls = (await sitemap()).map((u) => u.url);
    const has = (path: string) => urls.includes(`http://localhost:3000${path}`);

    expect(has("/")).toBe(true);
    expect(has(`/evento/${event.slug}`)).toBe(true);
    expect(has(`/evento/${canceled.slug}`)).toBe(true);
    expect(has(`/evento/${recentPast.slug}`)).toBe(true);
    expect(has(`/evento/${oldPast.slug}`)).toBe(false);
    for (const h of hidden) expect(has(`/evento/${h.slug}`)).toBe(false);
    expect(has(`/evento/${suspended.event.slug}`)).toBe(false);
    expect(has(`/evento/${draftOnly.event.slug}`)).toBe(false);

    expect(has(`/organizador/${org.slug}`)).toBe(true);
    expect(has(`/organizador/${suspended.org.slug}`)).toBe(false);
    expect(has(`/organizador/${draftOnly.org.slug}`)).toBe(false);
    expect(urls.some((u) => /\/(painel|admin|api|perfil)\b/.test(u))).toBe(false);
  });

  it("robots bloqueia áreas privadas, APIs e o redirecionamento rastreado", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const p of ["/painel", "/admin", "/api/", "/perfil", "/salvos", "/notificacoes", "/r/"]) expect(disallow).toContain(p);
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
