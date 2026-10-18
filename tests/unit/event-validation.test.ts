import { describe, expect, it } from "vitest";
import {
  centsToInput,
  emptyEventForm,
  eventDraftSchema,
  eventPublishSchema,
  formatCep,
  isHttpsUrl,
  isUnsetDate,
  normalizeUrlInput,
  parseMoneyToCents,
  publishProblems,
  suggestEnd,
  UNSET_DATE,
  type EventFormValues,
} from "@/lib/validation/event";
import { normalizeInstagram, normalizeWhatsapp, orgUpdateSchema } from "@/lib/validation/organization";
import { toLocalInputs } from "@/lib/dates";

const TZ = "America/Sao_Paulo";

function future(days: number, time = "20:00") {
  return { date: toLocalInputs(new Date(Date.now() + days * 86_400_000), TZ).date, time };
}

function complete(over: Partial<EventFormValues> = {}): EventFormValues {
  const s = future(5, "20:00");
  return {
    ...emptyEventForm(),
    title: "Show na praça",
    categoryId: "cat1",
    startDate: s.date,
    startTime: "20:00",
    endDate: s.date,
    endTime: "23:00",
    venueName: "Praça Central",
    address: "Rua A, 100",
    city: "São Paulo",
    state: "SP",
    lat: -23.55,
    lng: -46.63,
    ...over,
  };
}

function errorsOf(r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));
}

describe("preço em reais", () => {
  it("aceita o formato brasileiro", () => {
    expect(parseMoneyToCents("40,00")).toBe(4000);
    expect(parseMoneyToCents("40")).toBe(4000);
    expect(parseMoneyToCents("R$ 40,5")).toBe(4050);
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("40.50")).toBe(4050);
    expect(parseMoneyToCents("1.500")).toBe(150000);
  });
  it("recusa valores inválidos", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("40,123")).toBeNull();
    expect(parseMoneyToCents("-10")).toBeNull();
  });
  it("formata de volta para o campo", () => {
    expect(centsToInput(4000)).toBe("40,00");
    expect(centsToInput(123456)).toBe("1.234,56");
    expect(centsToInput(null)).toBe("");
  });
  it("evento pago guarda centavos e ordena a faixa", () => {
    const r = eventPublishSchema.safeParse(complete({ isFree: false, priceMin: "40,00", priceMax: "80" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priceMinCents).toBe(4000);
      expect(r.data.priceMaxCents).toBe(8000);
    }
    const bad = eventPublishSchema.safeParse(complete({ isFree: false, priceMin: "80,00", priceMax: "40,00" }));
    expect(errorsOf(bad).priceMax).toMatch(/maior/);
  });
  it("pago sem preço não publica; gratuito ignora preço", () => {
    expect(errorsOf(eventPublishSchema.safeParse(complete({ isFree: false }))).priceMin).toBeTruthy();
    const free = eventPublishSchema.safeParse(complete({ isFree: true, priceMin: "50" }));
    expect(free.success && free.data.priceMinCents).toBe(null);
  });
});

describe("link de ingressos", () => {
  it("exige https e completa o protocolo", () => {
    expect(normalizeUrlInput("sympla.com.br/evento")).toBe("https://sympla.com.br/evento");
    expect(isHttpsUrl("https://sympla.com.br/x")).toBe(true);
    expect(isHttpsUrl("http://sympla.com.br/x")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("https://localhost")).toBe(false);
    const ok = eventDraftSchema.safeParse(complete({ ticketUrl: "sympla.com.br/evento" }));
    expect(ok.success && ok.data.ticketUrl).toBe("https://sympla.com.br/evento");
    expect(errorsOf(eventDraftSchema.safeParse(complete({ ticketUrl: "http://site.com" }))).ticketUrl).toMatch(/https/);
    expect(errorsOf(eventDraftSchema.safeParse(complete({ ticketUrl: "javascript:alert(1)" }))).ticketUrl).toBeTruthy();
  });
});

describe("datas", () => {
  it("converte data + hora do fuso para UTC", () => {
    const r = eventDraftSchema.safeParse(complete({ startDate: "2030-01-10", startTime: "21:30", endDate: "2030-01-11", endTime: "02:00" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startsAt?.toISOString()).toBe("2030-01-11T00:30:00.000Z");
      expect(r.data.endsAt?.toISOString()).toBe("2030-01-11T05:00:00.000Z");
    }
    const manaus = eventDraftSchema.safeParse(complete({ startDate: "2030-01-10", startTime: "21:30", endDate: "2030-01-10", endTime: "23:00", timezone: "America/Manaus" }));
    expect(manaus.success && manaus.data.startsAt?.toISOString()).toBe("2030-01-11T01:30:00.000Z");
  });
  it("fim precisa ser depois do início", () => {
    const s = future(3);
    const r = eventDraftSchema.safeParse(complete({ startDate: s.date, startTime: "22:00", endDate: s.date, endTime: "21:00" }));
    expect(errorsOf(r).endTime).toMatch(/depois/);
  });
  it("duração máxima de 180 dias", () => {
    const s = future(1);
    const e = future(200);
    const r = eventDraftSchema.safeParse(complete({ startDate: s.date, endDate: e.date }));
    expect(errorsOf(r).endDate).toMatch(/180/);
  });
  it("início no passado bloqueia a publicação, mas não o rascunho", () => {
    const p = toLocalInputs(new Date(Date.now() - 3 * 86_400_000), TZ);
    const values = complete({ startDate: p.date, startTime: "10:00", endDate: future(1).date, endTime: "10:00" });
    expect(eventDraftSchema.safeParse(values).success).toBe(true);
    expect(errorsOf(eventPublishSchema.safeParse(values)).startDate).toMatch(/passado/);
  });
  it("fuso fora do Brasil é recusado", () => {
    expect(errorsOf(eventDraftSchema.safeParse(complete({ timezone: "Europe/Lisbon" }))).timezone).toBeTruthy();
  });
  it("data sem horário pede o horário", () => {
    expect(errorsOf(eventDraftSchema.safeParse(complete({ startTime: "" }))).startTime).toBeTruthy();
  });
  it("sugere fim 3 h depois do início", () => {
    expect(suggestEnd("2030-01-10", "22:00", TZ)).toEqual({ date: "2030-01-11", time: "01:00" });
  });
  it("data não definida usa o instante 0", () => {
    expect(isUnsetDate(UNSET_DATE)).toBe(true);
    expect(isUnsetDate(new Date())).toBe(false);
  });
});

describe("rascunho x publicação", () => {
  it("rascunho exige só nome e categoria", () => {
    const r = eventDraftSchema.safeParse({ ...emptyEventForm(), title: "Festa", categoryId: "c" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startsAt).toBeNull();
      expect(r.data.lat).toBeNull();
      expect(publishProblems(r.data).map((p) => p.field)).toEqual(expect.arrayContaining(["startDate", "endDate", "venueName", "address", "city", "location"]));
    }
    expect(errorsOf(eventDraftSchema.safeParse({ ...emptyEventForm(), title: "Fe" })).title).toBeTruthy();
  });
  it("evento completo publica", () => {
    expect(eventPublishSchema.safeParse(complete()).success).toBe(true);
  });
  it("resumo até 160 caracteres e no máximo 8 tags (sem repetição)", () => {
    expect(errorsOf(eventDraftSchema.safeParse(complete({ summary: "x".repeat(161) }))).summary).toMatch(/160/);
    expect(errorsOf(eventDraftSchema.safeParse(complete({ tags: Array.from({ length: 9 }, (_, i) => `tag${i}`) }))).tags).toMatch(/8/);
    const r = eventDraftSchema.safeParse(complete({ tags: ["#Rock", "rock", " samba  ", "a"] }));
    expect(r.success && r.data.tags).toEqual(["Rock", "samba"]);
  });
  it("CEP e UF", () => {
    expect(formatCep("01310100")).toBe("01310-100");
    const r = eventDraftSchema.safeParse(complete({ postalCode: "01310100", state: "sp" }));
    expect(r.success && r.data.postalCode).toBe("01310-100");
    expect(r.success && r.data.state).toBe("SP");
    expect(errorsOf(eventDraftSchema.safeParse(complete({ postalCode: "123" }))).postalCode).toBeTruthy();
    expect(errorsOf(eventDraftSchema.safeParse(complete({ state: "XX" }))).state).toBeTruthy();
  });
  it("coordenadas inválidas", () => {
    expect(errorsOf(eventDraftSchema.safeParse(complete({ lat: 200, lng: 0 }))).location).toBeTruthy();
  });
});

describe("perfil da organização", () => {
  it("normaliza Instagram e WhatsApp", () => {
    expect(normalizeInstagram("@Casa.Do.Som")).toBe("casa.do.som");
    expect(normalizeInstagram("https://www.instagram.com/casadosom/?hl=pt")).toBe("casadosom");
    expect(normalizeInstagram("um perfil com espaço")).toBeNull();
    expect(normalizeWhatsapp("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsapp("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsapp("123")).toBeNull();
  });
  it("site só http(s)", () => {
    const base = { name: "Casa", city: "SP", state: "SP" };
    expect(orgUpdateSchema.safeParse({ ...base, website: "casadosom.com.br" }).data?.website).toBe("https://casadosom.com.br");
    expect(orgUpdateSchema.safeParse({ ...base, website: "javascript:alert(1)" }).success).toBe(false);
    expect(orgUpdateSchema.safeParse({ ...base, website: "ftp://x.com" }).success).toBe(false);
    expect(orgUpdateSchema.safeParse({ ...base, contactEmail: "nao-e-email" }).success).toBe(false);
  });
});
