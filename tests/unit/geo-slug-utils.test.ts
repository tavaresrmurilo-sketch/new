import { describe, expect, it } from "vitest";
import { bboxAround, haversineKm, isValidLatLng, parseBBox } from "@/lib/geo";
import { eventSlug, normalizeSearch, slugify } from "@/lib/slug";
import { initials, safeNextPath } from "@/lib/utils";

describe("geo", () => {
  it("distância São Paulo → Rio ≈ 360 km", () => {
    const d = haversineKm({ lat: -23.5505, lng: -46.6333 }, { lat: -22.9068, lng: -43.1729 });
    expect(d).toBeGreaterThan(350);
    expect(d).toBeLessThan(365);
  });
  it("valida bbox", () => {
    expect(parseBBox("-46.8,-23.7,-46.4,-23.4")).toEqual([-46.8, -23.7, -46.4, -23.4]);
    expect(parseBBox("a,b,c,d")).toBeNull();
    expect(parseBBox("-46,-23,-47,-22")).toBeNull();
    expect(parseBBox("1,2,3")).toBeNull();
    const b = bboxAround({ lat: -23.5, lng: -46.6 }, 10);
    expect(b[0]).toBeLessThan(-46.6);
    expect(b[3]).toBeGreaterThan(-23.5);
  });
  it("valida coordenadas", () => {
    expect(isValidLatLng(-23.5, -46.6)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(Number.NaN, 0)).toBe(false);
  });
});

describe("slugs e utilitários", () => {
  it("remove acentos e símbolos", () => {
    expect(slugify("Festa Junina — São João 2026!")).toBe("festa-junina-sao-joao-2026");
    expect(eventSlug("Show do Ano")).toMatch(/^show-do-ano-[a-z2-9]{5}$/);
    expect(normalizeSearch("  Açaí ")).toBe("acai");
  });
  it("bloqueia open redirect", () => {
    expect(safeNextPath("/painel")).toBe("/painel");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
  it("iniciais", () => {
    expect(initials("Ana Paula Souza")).toBe("AS");
    expect(initials("ana")).toBe("A");
  });
});
