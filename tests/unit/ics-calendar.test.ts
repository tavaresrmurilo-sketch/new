import { describe, expect, it } from "vitest";
import {
  buildIcs,
  calendarLocation,
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  googleCalendarUrl,
  icsFilename,
  type CalendarEventInput,
} from "@/lib/ics";

const octets = (s: string) => new TextEncoder().encode(s).length;

const base: CalendarEventInput = {
  id: "cl9evento123",
  title: "Show de Forró; com Trio, \"Pé de Serra\"",
  description: "Linha 1\nLinha 2, com vírgula; e ponto e vírgula \\ barra",
  startsAt: new Date("2026-10-18T00:00:00.000Z"), // 21:00 em São Paulo
  endsAt: new Date("2026-10-18T03:30:00.000Z"),
  timezone: "America/Sao_Paulo",
  venueName: "Casa de Cultura",
  address: "Rua dos Pinheiros, 500",
  neighborhood: "Pinheiros",
  city: "São Paulo",
  state: "SP",
  lat: -23.5651,
  lng: -46.6822,
  url: "https://mixtour.app/evento/show-de-forro-x7k2m",
};

describe("escape de TEXT (RFC 5545 §3.3.11)", () => {
  it("escapa barra, ponto e vírgula, vírgula e quebras de linha", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
  it("remove caracteres de controle", () => {
    expect(escapeIcsText(`ok${String.fromCharCode(7)}${String.fromCharCode(0)}fim`)).toBe("okfim");
  });
  it("não mexe em acentos nem dois-pontos", () => {
    expect(escapeIcsText("Ação: São João")).toBe("Ação: São João");
  });
});

describe("dobra de linhas a 75 octetos", () => {
  it("linhas curtas ficam iguais", () => {
    expect(foldIcsLine("SUMMARY:curto")).toBe("SUMMARY:curto");
  });

  it("dobra linhas longas com CRLF + espaço e nenhuma parte passa de 75 octetos", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const [i, p] of parts.entries()) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(" ")).toBe(true);
    }
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });

  it("não quebra caracteres UTF-8 multibyte no meio", () => {
    const line = `LOCATION:${"ç".repeat(60)}${"🎷".repeat(20)}`;
    const parts = foldIcsLine(line).split("\r\n");
    for (const p of parts) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      expect(p).not.toContain("�");
    }
    // Reconstituída, a linha é idêntica (nenhum par substituto foi separado).
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
});

describe("arquivo .ics", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  const ics = buildIcs(base, now);
  const lines = ics.split("\r\n");

  it("usa CRLF, abre e fecha VCALENDAR/VEVENT", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("END:VEVENT");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
  });

  it("datas em UTC, UID estável e DTSTAMP", () => {
    expect(lines).toContain("DTSTART:20261018T000000Z");
    expect(lines).toContain("DTEND:20261018T033000Z");
    expect(lines).toContain("DTSTAMP:20261017T120000Z");
    expect(lines).toContain("UID:event-cl9evento123@mixtour.app");
    expect(buildIcs(base, new Date())).toContain("UID:event-cl9evento123@mixtour.app");
  });

  it("SUMMARY, LOCATION, GEO, DESCRIPTION e URL", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain('SUMMARY:Show de Forró\\; com Trio\\, "Pé de Serra"');
    expect(unfolded).toContain("LOCATION:Casa de Cultura\\, Rua dos Pinheiros\\, 500\\, Pinheiros\\, São Paulo - SP");
    expect(unfolded).toContain("GEO:-23.565100;-46.682200");
    expect(unfolded).toContain("DESCRIPTION:Linha 1\\nLinha 2\\, com vírgula\\; e ponto e vírgula \\\\ barra");
    expect(unfolded).toContain("URL:https://mixtour.app/evento/show-de-forro-x7k2m");
    expect(unfolded).toContain("STATUS:CONFIRMED");
    for (const l of lines) expect(octets(l)).toBeLessThanOrEqual(75);
  });

  it("evento cancelado vira STATUS:CANCELLED", () => {
    const c = buildIcs({ ...base, canceled: true }, now).replace(/\r\n /g, "");
    expect(c).toContain("STATUS:CANCELLED");
    expect(c).toContain("SUMMARY:[Cancelado]");
  });

  it("fim inválido (antes do início) vira 1 hora de duração", () => {
    const c = buildIcs({ ...base, endsAt: base.startsAt }, now);
    expect(c).toContain("DTEND:20261018T010000Z");
  });

  it("formatIcsDate", () => {
    expect(formatIcsDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});

describe("Google Agenda e utilidades", () => {
  it("monta o link action=TEMPLATE com datas, local e fuso", () => {
    const url = new URL(googleCalendarUrl(base));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(base.title);
    expect(url.searchParams.get("dates")).toBe("20261018T000000Z/20261018T033000Z");
    expect(url.searchParams.get("location")).toBe("Casa de Cultura, Rua dos Pinheiros, 500, Pinheiros, São Paulo - SP");
    expect(url.searchParams.get("ctz")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("details")).toContain("https://mixtour.app/evento/show-de-forro-x7k2m");
  });

  it("local sem partes vazias ou repetidas", () => {
    expect(calendarLocation({ venueName: "Praça", address: "Praça", neighborhood: null, city: "Recife", state: null })).toBe("Praça, Recife");
  });

  it("nome de arquivo seguro", () => {
    expect(icsFilename("show-de-rock-x7k2m")).toBe("show-de-rock-x7k2m.ics");
    expect(icsFilename('../../etc/"passwd')).toBe("etc-passwd.ics");
    expect(icsFilename("")).toBe("evento.ics");
  });
});
