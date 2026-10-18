import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  bboxContains,
  bboxParam,
  clearFilters,
  customWhenRange,
  DEFAULT_FILTERS,
  describeFilters,
  hasRestrictingFilters,
  normalizeBBox,
  normalizeQuery,
  padBBox,
  parseExploreParams,
  parseWhen,
  serializeExploreParams,
  serializeFilters,
  toggleInList,
  viewToBBox,
  whenChipLabel,
} from "@/lib/explore-params";

describe("parse dos parâmetros da URL", () => {
  it("sem parâmetros usa os padrões", () => {
    expect(parseExploreParams(new URLSearchParams())).toEqual({ filters: DEFAULT_FILTERS, view: null, mode: "mapa" });
    expect(parseExploreParams(undefined).filters).toEqual(DEFAULT_FILTERS);
  });

  it("lê todos os campos e aceita objeto de searchParams do Next", () => {
    const s = parseExploreParams({
      q: "  samba   na  vila ",
      cat: "shows,FESTAS,shows,, ",
      quando: "weekend",
      gratis: "1",
      acessivel: "libras,cadeirantes,inexistente",
      ordem: "popular",
      lat: "-23.55052",
      lng: "-46.633308",
      z: "13.456",
      vista: "lista",
    });
    expect(s.filters).toEqual({
      q: "samba na vila",
      cats: ["shows", "festas"],
      when: "weekend",
      free: true,
      access: ["cadeirantes", "libras"],
      sort: "popular",
    });
    expect(s.view).toEqual({ lat: -23.55052, lng: -46.63331, zoom: 13.46 });
    expect(s.mode).toBe("lista");
  });

  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(parseExploreParams({ q: ["um", "dois"] }).filters.q).toBe("um");
  });

  it("descarta valores inválidos", () => {
    const s = parseExploreParams(
      new URLSearchParams("cat=<script>,shows&quando=ontem&ordem=aleatoria&gratis=talvez&lat=abc&lng=10&z=99&vista=satelite"),
    );
    expect(s.filters.cats).toEqual(["shows"]);
    expect(s.filters.when).toBe("upcoming");
    expect(s.filters.sort).toBe("relevancia");
    expect(s.filters.free).toBe(false);
    expect(s.view).toBeNull();
    expect(s.mode).toBe("mapa");
    expect(parseExploreParams(new URLSearchParams("lat=-23.5&lng=-46.6&z=99")).view?.zoom).toBe(18);
    expect(parseExploreParams(new URLSearchParams("lat=-23.5&lng=-46.6")).view?.zoom).toBe(12);
    expect(parseExploreParams(new URLSearchParams("lat=95&lng=-46.6")).view).toBeNull();
  });

  it("limita e limpa a busca", () => {
    expect(normalizeQuery("a\u0000b\tc\n  d")).toBe("a b c d");
    expect(normalizeQuery("x".repeat(200))).toHaveLength(80);
    expect(normalizeQuery(null)).toBe("");
  });

  it("valida datas e intervalos", () => {
    expect(parseWhen("today")).toBe("today");
    expect(parseWhen("2026-10-18")).toBe("2026-10-18");
    expect(parseWhen("2026-02-30")).toBe("upcoming");
    expect(parseWhen("2026-10-18..2026-10-20")).toBe("2026-10-18..2026-10-20");
    expect(parseWhen("2026-10-18..2026-10-18")).toBe("2026-10-18");
    expect(parseWhen("2026-10-20..2026-10-18")).toBe("upcoming");
    expect(parseWhen("2026-01-01..2027-06-01")).toBe("upcoming");
    expect(parseWhen("18/10/2026")).toBe("upcoming");
    expect(customWhenRange("2026-10-18")).toEqual({ from: "2026-10-18", to: "2026-10-18" });
    expect(customWhenRange("2026-10-18..2026-10-20")).toEqual({ from: "2026-10-18", to: "2026-10-20" });
    expect(customWhenRange("weekend")).toBeNull();
  });
});

describe("serialização", () => {
  it("omite padrões e mantém vírgulas legíveis", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(
      serializeExploreParams({
        filters: { q: "rock & blues", cats: ["shows", "festas"], when: "today", free: true, access: ["libras"], sort: "data" },
        view: { lat: -23.550523, lng: -46.633308, zoom: 12.3456 },
        mode: "lista",
      }),
    ).toBe("q=rock+%26+blues&cat=shows,festas&quando=today&gratis=1&acessivel=libras&ordem=data&lat=-23.55052&lng=-46.63331&z=12.35&vista=lista");
  });

  it("ida e volta preserva o estado", () => {
    const state = {
      filters: { q: "forró pé de serra", cats: ["festas"], when: "2026-10-18..2026-10-20", free: false, access: ["cadeirantes", "libras"], sort: "distancia" as const },
      view: { lat: -22.9068, lng: -43.1729, zoom: 11 },
      mode: "mapa" as const,
    };
    expect(parseExploreParams(new URLSearchParams(serializeExploreParams(state)))).toEqual(state);
  });
});

describe("contadores e rótulos", () => {
  it("conta apenas filtros do diálogo", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, free: true, access: ["libras", "pet-friendly"], sort: "data", cats: ["shows"] })).toBe(4);
    expect(hasRestrictingFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasRestrictingFilters({ ...DEFAULT_FILTERS, sort: "data" })).toBe(false);
    expect(hasRestrictingFilters({ ...DEFAULT_FILTERS, cats: ["shows"] })).toBe(true);
    const cleared = clearFilters({ ...DEFAULT_FILTERS, q: "samba", free: true }, { q: true });
    expect(cleared).toEqual({ ...DEFAULT_FILTERS, q: "samba" });
    expect(cleared.cats).not.toBe(DEFAULT_FILTERS.cats);
    expect(toggleInList(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleInList(["a"], "b")).toEqual(["a", "b"]);
  });

  it("descreve os filtros para títulos", () => {
    const names = { shows: "Shows e música", festas: "Festas e baladas", arte: "Arte e exposições" };
    expect(describeFilters(DEFAULT_FILTERS, names)).toBe("Eventos");
    expect(describeFilters({ ...DEFAULT_FILTERS, free: true, when: "weekend" }, names)).toBe("Eventos grátis neste fim de semana");
    expect(describeFilters({ ...DEFAULT_FILTERS, cats: ["shows"], when: "today" }, names)).toBe("Shows e música hoje");
    expect(describeFilters({ ...DEFAULT_FILTERS, cats: ["shows", "festas", "arte"] }, names)).toBe("Shows e música, Festas e baladas e mais");
    expect(describeFilters({ ...DEFAULT_FILTERS, q: "samba", cats: ["shows"], free: true }, names)).toBe("“samba” · Shows e música (grátis)");
    expect(describeFilters({ ...DEFAULT_FILTERS, when: "2026-10-18" }, names)).toBe("Eventos em dom, 18 out");
  });

  it("rótulos de data dos chips", () => {
    expect(whenChipLabel("weekend")).toBe("Fim de semana");
    expect(whenChipLabel("2026-10-18")).toBe("dom, 18 out");
    expect(whenChipLabel("2026-10-18..2026-10-20")).toBe("18 out – 20 out");
  });
});

describe("geometria do mapa", () => {
  it("bbox aproximado de uma vista", () => {
    const b = viewToBBox({ lat: -23.55, lng: -46.63, zoom: 12 }, 1000, 800);
    const [w, s, e, n] = b;
    expect(w).toBeLessThan(-46.63);
    expect(e).toBeGreaterThan(-46.63);
    expect(s).toBeLessThan(-23.55);
    expect(n).toBeGreaterThan(-23.55);
    // a 512 px por "mundo" no zoom 0, 1000 px no zoom 12 cobrem ~0,17°
    expect(e - w).toBeCloseTo((1000 * 360) / (512 * 4096), 3);
    const world = viewToBBox({ lat: 0, lng: 0, zoom: 2 }, 4000, 4000);
    expect(world[0]).toBe(-180);
    expect(world[2]).toBe(180);
  });

  it("normaliza limites com cópias do mundo e antimeridiano", () => {
    expect(normalizeBBox([-200, -10, 200, 10])).toEqual([-180, -10, 180, 10]);
    expect(normalizeBBox([-50, -95, -40, 95])).toEqual([-50, -90, -40, 90]);
    expect(normalizeBBox([310, -10, 320, 10])).toEqual([-50, -10, -40, 10]);
    expect(normalizeBBox([170, -10, 190, 10])).toEqual([-180, -10, 180, 10]);
    expect(normalizeBBox([-46.8, -23.7, -46.4, -23.4])).toEqual([-46.8, -23.7, -46.4, -23.4]);
  });

  it("expande e compara bboxes", () => {
    const b: [number, number, number, number] = [-47, -24, -46, -23];
    const p = padBBox(b, 0.25);
    expect(p).toEqual([-47.25, -24.25, -45.75, -22.75]);
    expect(bboxContains(p, b)).toBe(true);
    expect(bboxContains(b, p)).toBe(false);
    expect(padBBox([-179.9, -89.9, 179.9, 89.9], 0.5)).toEqual([-180, -90, 180, 90]);
    expect(bboxParam([-46.123456, -23.987654, -46.1, -23.9])).toBe("-46.1235,-23.9877,-46.1,-23.9");
  });
});
