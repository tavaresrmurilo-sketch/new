import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type ExploreFilters } from "@/lib/explore-params";
import { haversineKm } from "@/lib/geo";
import {
  eventCardsByIds,
  InvalidCursorError,
  parseExploreQuery,
  ExploreQueryError,
  searchEventList,
  searchMapPoints,
  searchTerms,
  suggest,
} from "@/server/events/search";
import { categoryId, createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

const H = 3_600_000;
const D = 24 * H;
// Quarta-feira, 14/10/2026, 15:00 em São Paulo
const NOW = new Date("2026-10-14T18:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const f = (patch: Partial<ExploreFilters> = {}): ExploreFilters => ({ ...DEFAULT_FILTERS, cats: [], access: [], ...patch });

// São Paulo (centro) e arredores
const SP = { lat: -23.5505, lng: -46.6333 };
const PINHEIROS = { lat: -23.5667, lng: -46.6919 };
const RIO = { lat: -22.9068, lng: -43.1729 };
const SP_BBOX: [number, number, number, number] = [-46.9, -23.8, -46.3, -23.3];

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner.id, { name: "Coletivo Teste", slug: "coletivo-teste" });
  return { owner, org };
}

beforeEach(resetDb);

describe("visibilidade pública", () => {
  it("rascunho, em análise, cancelado, organização suspensa e evento encerrado não aparecem", async () => {
    const { owner, org } = await setup();
    const suspended = await createOrg(owner.id, { name: "Suspensa", slug: "suspensa", status: "SUSPENDED" });
    const ok = await createEvent(org.id, { title: "Visível", startsAt: at(D), ...SP });
    await createEvent(org.id, { title: "Rascunho", status: "DRAFT", startsAt: at(D), ...SP });
    await createEvent(org.id, { title: "Em análise", status: "PENDING_REVIEW", startsAt: at(D), ...SP });
    await createEvent(org.id, { title: "Cancelado", status: "CANCELED", startsAt: at(D), ...SP });
    await createEvent(suspended.id, { title: "Da suspensa", startsAt: at(D), ...SP });
    await createEvent(org.id, { title: "Encerrado", startsAt: at(-5 * H), endsAt: at(-1 * H), ...SP });

    const map = await searchMapPoints({ bbox: SP_BBOX, now: NOW });
    expect(map.points.map((p) => p.title)).toEqual(["Visível"]);
    expect(map.total).toBe(1);

    const list = await searchEventList({ bbox: SP_BBOX, now: NOW });
    expect(list.items.map((i) => i.id)).toEqual([ok.id]);
    expect(list.total).toBe(1);

    const global = await searchEventList({ filters: f({ q: "rascunho" }), now: NOW });
    expect(global.items).toHaveLength(0);

    const cards = await eventCardsByIds([ok.id, (await prisma.event.findFirstOrThrow({ where: { title: "Rascunho" } })).id], { now: NOW });
    expect(cards.map((c) => c.title)).toEqual(["Visível"]);
  });

  it("evento em andamento aparece como 'live'", async () => {
    const { org } = await setup();
    await createEvent(org.id, { title: "Agora", startsAt: at(-H), endsAt: at(2 * H), ...SP });
    await createEvent(org.id, { title: "Depois", startsAt: at(3 * D), ...SP });
    const { points } = await searchMapPoints({ bbox: SP_BBOX, now: NOW });
    expect(Object.fromEntries(points.map((p) => [p.title, p.live]))).toEqual({ Agora: true, Depois: false });
  });
});

describe("filtros do mapa", () => {
  it("bbox, categoria, gratuitos e acessibilidade", async () => {
    const { org } = await setup();
    const festas = await categoryId("festas");
    await createEvent(org.id, { title: "Show SP", startsAt: at(D), ...SP, isFree: true, accessibility: ["libras", "cadeirantes"] });
    await createEvent(org.id, { title: "Festa Pinheiros", startsAt: at(D), ...PINHEIROS, categoryId: festas });
    await createEvent(org.id, { title: "Show Rio", startsAt: at(D), ...RIO });

    const inSp = await searchMapPoints({ bbox: SP_BBOX, now: NOW });
    expect(inSp.points.map((p) => p.title).sort()).toEqual(["Festa Pinheiros", "Show SP"]);
    expect(inSp.points.find((p) => p.title === "Festa Pinheiros")).toMatchObject({ cat: "festas", icon: "party-popper", color: "#FF4D8D" });

    const onlyFestas = await searchMapPoints({ bbox: SP_BBOX, filters: f({ cats: ["festas"] }), now: NOW });
    expect(onlyFestas.points.map((p) => p.title)).toEqual(["Festa Pinheiros"]);

    const multi = await searchMapPoints({ bbox: null, filters: f({ cats: ["festas", "shows"] }), now: NOW });
    expect(multi.total).toBe(3);

    const free = await searchMapPoints({ bbox: SP_BBOX, filters: f({ free: true }), now: NOW });
    expect(free.points.map((p) => p.title)).toEqual(["Show SP"]);

    const access = await searchMapPoints({ bbox: null, filters: f({ access: ["libras"] }), now: NOW });
    expect(access.points.map((p) => p.title)).toEqual(["Show SP"]);
    const accessBoth = await searchMapPoints({ bbox: null, filters: f({ access: ["libras", "pet-friendly"] }), now: NOW });
    expect(accessBoth.total).toBe(0);
  });

  it("datas por sobreposição de períodos", async () => {
    const { org } = await setup();
    // hoje à noite (qua 14/10, 21h SP = 00:00Z de 15/10)
    await createEvent(org.id, { title: "Hoje à noite", startsAt: new Date("2026-10-15T00:00:00Z"), endsAt: new Date("2026-10-15T02:30:00Z"), ...SP });
    // amanhã (qui 15/10, 20h SP)
    await createEvent(org.id, { title: "Amanhã", startsAt: new Date("2026-10-15T23:00:00Z"), endsAt: new Date("2026-10-16T02:00:00Z"), ...SP });
    // exposição longa que já começou e segue até novembro
    await createEvent(org.id, { title: "Exposição longa", startsAt: new Date("2026-09-01T13:00:00Z"), endsAt: new Date("2026-11-30T21:00:00Z"), ...SP });
    // sábado 17/10
    await createEvent(org.id, { title: "Sábado", startsAt: new Date("2026-10-17T22:00:00Z"), endsAt: new Date("2026-10-18T03:00:00Z"), ...SP });

    const titles = async (when: string) =>
      (await searchMapPoints({ bbox: SP_BBOX, filters: f({ when }), now: NOW })).points.map((p) => p.title).sort();

    expect(await titles("today")).toEqual(["Exposição longa", "Hoje à noite"]);
    expect(await titles("tomorrow")).toEqual(["Amanhã", "Exposição longa"]);
    expect(await titles("weekend")).toEqual(["Exposição longa", "Sábado"]);
    expect(await titles("now")).toEqual(["Exposição longa"]);
    expect(await titles("2026-10-17")).toEqual(["Exposição longa", "Sábado"]);
    expect(await titles("2026-10-15..2026-10-16")).toEqual(["Amanhã", "Exposição longa"]);
    expect(await titles("2026-10-14..2026-10-15")).toEqual(["Amanhã", "Exposição longa", "Hoje à noite"]);
    expect(await titles("2026-12-01")).toEqual([]);
    expect(await titles("upcoming")).toHaveLength(4);
  });

  it("destaques vêm primeiro e o limite marca truncated", async () => {
    const { org } = await setup();
    await createEvent(org.id, { title: "Comum cedo", startsAt: at(H), ...SP });
    await createEvent(org.id, { title: "Destaque tarde", startsAt: at(5 * D), featuredUntil: at(10 * D), ...SP });
    await createEvent(org.id, { title: "Destaque vencido", startsAt: at(2 * H), featuredUntil: at(-D), ...SP });
    const r = await searchMapPoints({ bbox: SP_BBOX, now: NOW, limit: 2 });
    expect(r.points.map((p) => [p.title, p.featured])).toEqual([
      ["Destaque tarde", true],
      ["Comum cedo", false],
    ]);
    expect(r.total).toBe(3);
    expect(r.truncated).toBe(true);
  });
});

describe("lista paginada", () => {
  it("pagina por cursor sem repetir nem pular, em todas as ordenações", async () => {
    const { org } = await setup();
    for (let i = 0; i < 27; i++) {
      await createEvent(org.id, {
        title: `Evento ${String(i).padStart(2, "0")}`,
        startsAt: at((i % 9) * H + D),
        lat: SP.lat + i * 0.001,
        lng: SP.lng,
        goingCount: i % 4,
        savesCount: i % 3,
        featuredUntil: i % 5 === 0 ? at(30 * D) : null,
      });
    }
    for (const sort of ["relevancia", "data", "popular", "distancia"] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: Awaited<ReturnType<typeof searchEventList>> = await searchEventList({
          bbox: SP_BBOX,
          near: sort === "distancia" ? SP : null,
          filters: f({ sort }),
          cursor,
          now: new Date(NOW.getTime() + pages * 1000),
        });
        expect(page.total).toBe(27);
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 10);
      expect(pages, sort).toBe(2);
      expect(new Set(seen).size, sort).toBe(27);
    }
  });

  it("ordena por data, popularidade e distância (com km em cada item)", async () => {
    const { org } = await setup();
    const near = await createEvent(org.id, { title: "Perto", startsAt: at(3 * D), ...PINHEIROS, goingCount: 1 });
    const far = await createEvent(org.id, { title: "Longe", startsAt: at(D), lat: -23.45, lng: -46.4, goingCount: 10, savesCount: 5 });
    const mid = await createEvent(org.id, { title: "Meio", startsAt: at(2 * D), ...SP, savesCount: 3 });

    const byDate = await searchEventList({ bbox: SP_BBOX, filters: f({ sort: "data" }), now: NOW });
    expect(byDate.items.map((i) => i.id)).toEqual([far.id, mid.id, near.id]);

    const byPopular = await searchEventList({ bbox: SP_BBOX, filters: f({ sort: "popular" }), now: NOW });
    expect(byPopular.items.map((i) => i.id)).toEqual([far.id, mid.id, near.id]);

    const origin = { lat: -23.5614, lng: -46.6884 }; // Pinheiros
    const byDistance = await searchEventList({ bbox: SP_BBOX, near: origin, filters: f({ sort: "distancia" }), now: NOW });
    expect(byDistance.items.map((i) => i.id)).toEqual([near.id, mid.id, far.id]);
    const d0 = byDistance.items[0].distanceKm!;
    expect(d0).toBeCloseTo(haversineKm(origin, PINHEIROS), 5);
    expect(byDistance.items.every((i) => typeof i.distanceKm === "number")).toBe(true);

    const withoutNear = await searchEventList({ bbox: SP_BBOX, filters: f({ sort: "data" }), now: NOW });
    expect(withoutNear.items[0].distanceKm).toBeNull();
  });

  it("cursor adulterado ou de outra ordenação é recusado", async () => {
    const { org } = await setup();
    for (let i = 0; i < 22; i++) await createEvent(org.id, { title: `E${i}`, startsAt: at(D + i * H), ...SP });
    const first = await searchEventList({ bbox: SP_BBOX, filters: f({ sort: "data" }), now: NOW });
    expect(first.nextCursor).toBeTruthy();
    await expect(searchEventList({ bbox: SP_BBOX, filters: f({ sort: "popular" }), cursor: first.nextCursor, now: NOW })).rejects.toBeInstanceOf(InvalidCursorError);
    await expect(searchEventList({ bbox: SP_BBOX, cursor: "nao-e-um-cursor", now: NOW })).rejects.toBeInstanceOf(InvalidCursorError);
    // cursor muito antigo (o "agora" do ranking não pode ser escolhido livremente)
    await expect(
      searchEventList({ bbox: SP_BBOX, filters: f({ sort: "data" }), cursor: first.nextCursor, now: new Date(NOW.getTime() + 7 * H) }),
    ).rejects.toBeInstanceOf(InvalidCursorError);
    const second = await searchEventList({ bbox: SP_BBOX, filters: f({ sort: "data" }), cursor: first.nextCursor, now: NOW });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
  });
});

describe("busca textual", () => {
  it("encontra sem acentos, por prefixo, combinando termos, e ranqueia o título acima da descrição", async () => {
    const { org } = await setup();
    const inTitle = await createEvent(org.id, { title: "Samba da Vila Madalena", startsAt: at(5 * D), ...SP });
    const inDescription = await createEvent(org.id, {
      title: "Noite de MPB",
      description: "Abertura com roda de samba e convidados.",
      startsAt: at(D),
      ...SP,
    });
    await createEvent(org.id, { title: "Forró pé de serra", startsAt: at(D), ...RIO, tags: ["forró", "são joão"] });

    const r = await searchEventList({ filters: f({ q: "SAMBA" }), now: NOW });
    expect(r.items.map((i) => i.id)).toEqual([inTitle.id, inDescription.id]);
    expect(r.total).toBe(2);

    // prefixo + sem acento + global (sem bbox)
    const forro = await searchEventList({ filters: f({ q: "forro sao" }), now: NOW });
    expect(forro.items.map((i) => i.title)).toEqual(["Forró pé de serra"]);
    const prefix = await searchEventList({ filters: f({ q: "madal" }), now: NOW });
    expect(prefix.items.map((i) => i.id)).toEqual([inTitle.id]);

    // termos combinados com E
    expect((await searchEventList({ filters: f({ q: "samba rio" }), now: NOW })).total).toBe(0);

    // a busca respeita o bbox quando informado
    expect((await searchEventList({ filters: f({ q: "forró" }), bbox: SP_BBOX, now: NOW })).total).toBe(0);

    // também no mapa
    const pts = await searchMapPoints({ filters: f({ q: "samba" }), bbox: null, now: NOW });
    expect(pts.total).toBe(2);
  });

  it("entradas com símbolos não quebram a consulta", async () => {
    const { org } = await setup();
    await createEvent(org.id, { title: "Rock & Blues", startsAt: at(D), ...SP });
    for (const q of ["rock & blues", "rock|!", "'; DROP TABLE \"Event\"; --", "(((", "ʼrock", "<->:*"]) {
      await expect(searchEventList({ filters: f({ q }), now: NOW })).resolves.toBeDefined();
      await expect(suggest(q, { now: NOW })).resolves.toBeDefined();
    }
    expect((await searchEventList({ filters: f({ q: "rock & blues" }), now: NOW })).total).toBe(1);
    expect(searchTerms("Show de ROCK, em São Paulo!")).toEqual(["show", "rock", "sao", "paulo"]);
    expect(searchTerms("de")).toEqual(["de"]);
  });
});

describe("sugestões", () => {
  it("eventos e organizadores por prefixo/similaridade, categorias pelo nome, sem dados privados", async () => {
    const { owner, org } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { name: "Samba de Rainha", contactEmail: "privado@org.dev" } });
    await createEvent(org.id, { title: "Roda de Samba no Bixiga", startsAt: at(D), ...SP });
    await createEvent(org.id, { title: "Sambódromo aberto", startsAt: at(2 * D), ...SP });
    await createEvent(org.id, { title: "Samba antigo", startsAt: at(-5 * H), endsAt: at(-H), ...SP });
    const hidden = await createOrg(owner.id, { name: "Samba Suspenso", slug: "samba-suspenso", status: "SUSPENDED" });
    await createEvent(hidden.id, { title: "Samba escondido", startsAt: at(D), ...SP });
    // organização sem nenhum evento público não é sugerida
    await createOrg(owner.id, { name: "Samba Vazio", slug: "samba-vazio" });

    const r = await suggest("samb", { now: NOW });
    expect(r.events.map((e) => e.title).sort()).toEqual(["Roda de Samba no Bixiga", "Sambódromo aberto"]);
    expect(r.organizers.map((o) => o.name)).toEqual(["Samba de Rainha"]);
    expect(r.organizers[0].upcomingCount).toBe(2);
    expect(JSON.stringify(r)).not.toContain("privado@org.dev");

    const cats = await suggest("musica", { now: NOW });
    expect(cats.categories.map((c) => c.slug)).toContain("shows");
    const teatro = await suggest("teat", { now: NOW });
    expect(teatro.categories.map((c) => c.slug)).toEqual(["teatro-danca"]);

    // erro de digitação leve (similaridade por trigramas)
    const typo = await suggest("bixga", { now: NOW });
    expect(typo.events.map((e) => e.title)).toContain("Roda de Samba no Bixiga");

    expect(await suggest("s", { now: NOW })).toEqual({ events: [], organizers: [], categories: [] });
  });
});

describe("parâmetros das APIs", () => {
  it("valida bbox, near e tamanho dos campos", () => {
    const ok = parseExploreQuery(new URLSearchParams("bbox=-47,-24,-46,-23&near=-23.5,-46.6&cat=shows,festas&gratis=1&ordem=data&lat=1&vista=lista"));
    expect(ok.bbox).toEqual([-47, -24, -46, -23]);
    expect(ok.near).toEqual({ lat: -23.5, lng: -46.6 });
    expect(ok.filters).toMatchObject({ cats: ["shows", "festas"], free: true, sort: "data" });
    expect(() => parseExploreQuery(new URLSearchParams("bbox=1,2,3"))).toThrow(ExploreQueryError);
    expect(() => parseExploreQuery(new URLSearchParams("bbox=-46,-23,-47,-24"))).toThrow(ExploreQueryError);
    expect(() => parseExploreQuery(new URLSearchParams("near=91,0"))).toThrow(ExploreQueryError);
    expect(() => parseExploreQuery(new URLSearchParams("ordem=aleatoria"))).toThrow(ExploreQueryError);
    expect(() => parseExploreQuery(new URLSearchParams(`q=${"a".repeat(300)}`))).toThrow(ExploreQueryError);
    expect(parseExploreQuery(new URLSearchParams("ids=abcdefgh1,../../x,abcdefgh1")).ids).toEqual(["abcdefgh1"]);
  });
});
