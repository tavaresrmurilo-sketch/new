import type { StyleSpecification } from "maplibre-gl";

export const DEFAULT_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
export const DEFAULT_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";

/** Estilo mínimo (sem rede): usado como fallback quando o provedor de tiles falha ou em testes. */
export function blankStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    name: "mixtour-blank",
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": dark ? "#0e0e14" : "#e9e9ef" } }],
  };
}

export function styleFor(dark: boolean): string | StyleSpecification {
  const url = dark
    ? process.env.NEXT_PUBLIC_MAP_STYLE_DARK || DEFAULT_STYLE_DARK
    : process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || DEFAULT_STYLE_LIGHT;
  if (url === "blank") return blankStyle(dark);
  return url;
}
