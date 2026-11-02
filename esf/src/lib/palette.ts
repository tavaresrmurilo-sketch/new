/**
 * Paleta oficial da ESF (alinhada à logo).
 *
 * Fonte das cores para o que o CSS não alcança: shaders WebGL da abertura, imagem de
 * compartilhamento (Open Graph), manifest e `theme-color`. No CSS, as mesmas cores vivem
 * como tokens em `src/app/globals.css` (@theme) — mantenha os dois em sincronia.
 */
export const palette = {
  purple: "#6F2DBD",
  purpleDark: "#4A1D96",
  purpleDeep: "#2E1065",
  magenta: "#C2185B",
  rose: "#E91E63",
  orange: "#F97316",
  orangeSoft: "#FB923C",
  night: "#0B0614",
  night2: "#170D2B",
  lavender: "#F5F3FF",
} as const;

export type PaletteColor = keyof typeof palette;
export type RGB = [number, number, number];

/** Hex → RGB normalizado (0..1). */
export function rgb(color: PaletteColor | string): RGB {
  const hex = color in palette ? palette[color as PaletteColor] : color;
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Mistura linear entre duas cores da paleta (t = 0 → a, t = 1 → b). */
export function mixRgb(a: PaletteColor | RGB, b: PaletteColor | RGB, t: number): RGB {
  const A = Array.isArray(a) ? a : rgb(a);
  const B = Array.isArray(b) ? b : rgb(b);
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
}

/** RGB → hex (para a imagem de compartilhamento). */
export function toHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
