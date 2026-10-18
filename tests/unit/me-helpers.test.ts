import { describe, expect, it } from "vitest";
import { dayHeading, describeUserAgent, groupByDay, internalPath, isValidPushEndpoint, maskIp } from "@/server/me/helpers";
import { deleteAccountSchema, profileSchema, pushSubscriptionSchema } from "@/server/me/schemas";

const TZ = "America/Sao_Paulo";
// Sábado, 17 out 2026, 15:00 em São Paulo (18:00 UTC).
const NOW = new Date("2026-10-17T18:00:00.000Z");

describe("dayHeading", () => {
  it("usa Hoje / Amanhã / Ontem no fuso do evento", () => {
    expect(dayHeading(new Date("2026-10-17T23:30:00.000Z"), NOW, TZ)).toBe("Hoje");
    // 02:30 UTC de 18/10 = 23:30 de 17/10 em São Paulo → ainda "Hoje".
    expect(dayHeading(new Date("2026-10-18T02:30:00.000Z"), NOW, TZ)).toBe("Hoje");
    expect(dayHeading(new Date("2026-10-18T15:00:00.000Z"), NOW, TZ)).toBe("Amanhã");
    expect(dayHeading(new Date("2026-10-16T15:00:00.000Z"), NOW, TZ)).toBe("Ontem");
  });

  it("mostra dia da semana e data; o ano só quando é outro", () => {
    expect(dayHeading(new Date("2026-10-24T22:00:00.000Z"), NOW, TZ)).toBe("sáb, 24 out");
    expect(dayHeading(new Date("2027-01-09T22:00:00.000Z"), NOW, TZ)).toBe("sáb, 9 jan 2027");
  });
});

describe("groupByDay", () => {
  const ev = (id: string, startsAt: string, endsAt?: string) => ({ id, startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : undefined, timezone: TZ });

  it("agrupa preservando a ordem e põe eventos em andamento em Hoje", () => {
    const items = [
      ev("andamento", "2026-10-15T12:00:00.000Z", "2026-10-19T03:00:00.000Z"),
      ev("hoje", "2026-10-17T23:00:00.000Z"),
      ev("amanha1", "2026-10-18T13:00:00.000Z"),
      ev("amanha2", "2026-10-18T22:00:00.000Z"),
      ev("depois", "2026-10-24T22:00:00.000Z"),
    ];
    const groups = groupByDay(items, (i) => i, NOW);
    expect(groups.map((g) => g.label)).toEqual(["Hoje", "Amanhã", "sáb, 24 out"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["andamento", "hoje"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["amanha1", "amanha2"]);
  });

  it("sem término informado (histórico), usa o dia de início — nunca \"Hoje\" para eventos passados", () => {
    const groups = groupByDay([ev("passado", "2026-10-12T02:00:00.000Z")].map(({ endsAt: _e, ...x }) => x), (i) => i, NOW);
    expect(groups[0].label).toBe("dom, 11 out");
  });

  it("lista vazia → nenhum grupo", () => {
    expect(groupByDay([], () => ({ startsAt: NOW }), NOW)).toEqual([]);
  });
});

describe("describeUserAgent", () => {
  it("reconhece navegadores e sistemas comuns", () => {
    expect(
      describeUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"),
    ).toMatchObject({ browser: "Chrome", os: "Android", kind: "mobile", label: "Chrome no Android" });
    expect(
      describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"),
    ).toMatchObject({ browser: "Safari", os: "iOS", kind: "mobile" });
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"),
    ).toMatchObject({ browser: "Edge", os: "Windows", kind: "desktop" });
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0")).toMatchObject({
      browser: "Firefox",
      os: "macOS",
      kind: "desktop",
    });
  });

  it("lida com user-agent ausente", () => {
    expect(describeUserAgent(null).label).toBe("Dispositivo desconhecido");
  });
});

describe("maskIp", () => {
  it("mascara IPv4 e IPv6", () => {
    expect(maskIp("189.40.12.200")).toBe("189.40.•••.•••");
    expect(maskIp("::ffff:10.1.2.3")).toBe("10.1.•••.•••");
    expect(maskIp("2804:14c:5b81:8000::1")).toBe("2804:14c:•••");
    expect(maskIp(null)).toBeNull();
  });
});

describe("internalPath", () => {
  it("aceita só caminhos internos", () => {
    expect(internalPath("/evento/show-x")).toBe("/evento/show-x");
    expect(internalPath("https://malicioso.com")).toBeNull();
    expect(internalPath("//malicioso.com")).toBeNull();
    expect(internalPath("/\\malicioso.com")).toBeNull();
    expect(internalPath("javascript:alert(1)")).toBeNull();
    expect(internalPath(null)).toBeNull();
  });
});

describe("push", () => {
  it("valida endpoint https público", () => {
    expect(isValidPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
    expect(isValidPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/xyz")).toBe(true);
    expect(isValidPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isValidPushEndpoint("https://localhost/push")).toBe(false);
    expect(isValidPushEndpoint("https://127.0.0.1/push")).toBe(false);
    expect(isValidPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isValidPushEndpoint("https://metadata.internal/x")).toBe(false);
    expect(isValidPushEndpoint("não é url")).toBe(false);
  });

  it("schema exige chaves base64url", () => {
    const ok = pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc-abc_123456789", auth: "abcDEF12_-" } });
    expect(ok.success).toBe(true);
    const bad = pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "<script>", auth: "x" } });
    expect(bad.success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("normaliza cidade (exige coordenadas) e remove categorias repetidas", () => {
    const r = profileSchema.parse({ name: "  Ana  ", homeCity: "São Paulo – SP", homeLat: "-23.55", homeLng: "-46.63", favoriteCategories: ["shows", "shows", "festas"] });
    expect(r).toEqual({ name: "Ana", homeCity: "São Paulo – SP", homeLat: -23.55, homeLng: -46.63, favoriteCategories: ["shows", "festas"] });
    const noCoords = profileSchema.parse({ name: "Ana", homeCity: "Recife", homeLat: "", homeLng: "" });
    expect(noCoords.homeCity).toBeNull();
    expect(noCoords.homeLat).toBeNull();
  });

  it("rejeita coordenadas fora do intervalo e nome vazio", () => {
    expect(profileSchema.safeParse({ name: "Ana", homeCity: "X", homeLat: "123", homeLng: "0" }).success).toBe(false);
    expect(profileSchema.safeParse({ name: " " }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "Ana", favoriteCategories: ["<x>"] }).success).toBe(false);
  });

  it("deleteAccountSchema aceita campos ausentes", () => {
    expect(deleteAccountSchema.parse({})).toEqual({ password: "", confirm: "" });
  });
});
