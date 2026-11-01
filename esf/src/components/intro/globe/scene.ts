/**
 * Coreografia da abertura.
 *
 * Tudo é função pura do progresso do scroll `p ∈ [0, 1]`: o mesmo `p` sempre produz o mesmo quadro,
 * o que garante que a animação avance e retroceda de forma idêntica.
 * As janelas abaixo são compartilhadas pelo renderizador WebGL e pela timeline GSAP dos textos.
 */

export type Range = readonly [number, number];

export const T = {
  cueOut: [0, 0.03],
  s1Out: [0.075, 0.13],
  s2In: [0.15, 0.21],
  s2Out: [0.31, 0.35],
  arcs: [0.12, 0.33],
  arcsOut: [0.35, 0.42],
  warm: [0.33, 0.48],
  brWarm: [0.4, 0.46],
  wave: [0.42, 0.54],
  s3In: [0.44, 0.5],
  s3Out: [0.565, 0.6],
  marker: [0.46, 0.5],
  markerOut: [0.555, 0.59],
  dim: [0.58, 0.68],
  m1: [0.585, 0.72],
  s4In: [0.63, 0.69],
  s4Out: [0.775, 0.8],
  constellation: [0.67, 0.75],
  constellationOut: [0.78, 0.815],
  day: [0.79, 0.9],
  globeOut: [0.79, 0.895],
  m2: [0.8, 0.91],
  logoIn: [0.885, 0.93],
  sparksOut: [0.905, 0.95],
  titleIn: [0.875, 0.945],
  subIn: [0.915, 0.96],
  ctaIn: [0.935, 0.975],
  uiOut: [0.95, 0.99],
} as const satisfies Record<string, Range>;

/** A partir de qual progresso cada cena é considerada ativa (indicador de progresso). */
export const SCENE_STARTS = [0, 0.14, 0.38, 0.6, 0.8] as const;
/** Ponto de "repouso" de cada cena — destino ao clicar no indicador. */
export const SCENE_TARGETS = [0, 0.255, 0.525, 0.745, 1] as const;
/** Quando o cabeçalho passa a usar tinta escura (fundo claro). */
export const HEADER_LIGHT_AT = 0.86;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const seg = (p: number, r: Range) => clamp01((p - r[0]) / (r[1] - r[0]));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const smooth = (p: number, r: Range) => easeInOut(seg(p, r));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export interface Layout {
  w: number;
  h: number;
  portrait: boolean;
  /** centros dos quatro símbolos (px CSS, relativos ao palco) */
  glyphs: [number, number][];
  glyphR: number;
  logo: { x: number; y: number; half: number };
}

export function computeLayout(w: number, h: number, logo?: Layout["logo"] | null): Layout {
  const portrait = w / h < 0.95;
  let glyphs: [number, number][];
  let glyphR: number;
  if (portrait) {
    glyphR = Math.max(34, Math.min(w * 0.13, h * 0.072));
    glyphs = [
      [w * 0.29, h * 0.41],
      [w * 0.71, h * 0.41],
      [w * 0.29, h * 0.6],
      [w * 0.71, h * 0.6],
    ];
  } else {
    glyphR = Math.max(42, Math.min(h * 0.088, w * 0.062, 112));
    glyphs = [
      [w * 0.2, h * 0.5],
      [w * 0.4, h * 0.42],
      [w * 0.6, h * 0.5],
      [w * 0.8, h * 0.42],
    ];
  }
  return {
    w,
    h,
    portrait,
    glyphs,
    glyphR,
    logo: logo ?? { x: w / 2, y: h * 0.24, half: portrait ? 30 : 40 },
  };
}

/* ------------------------------------------------------------------ */
/* Pose do globo                                                       */
/* ------------------------------------------------------------------ */

/** [p, cx, cy, raio, lat, lon, roll]. Paisagem: cx/W, cy/H, raio/H. Retrato: cx/W, cy/H, raio/W. */
type Key = readonly [number, number, number, number, number, number, number];

// A rotação percorre o mundo (Ásia → África → Atlântico) antes de repousar sobre o Brasil.
// Nenhuma linha ou rota é desenhada entre esses lugares: é apenas o movimento da câmera.
const LANDSCAPE: readonly Key[] = [
  [0.0, 0.665, 0.53, 0.335, 20, 100, -14],
  [0.12, 0.655, 0.54, 0.37, 16, 62, -12],
  [0.3, 0.645, 0.6, 0.56, 6, -8, -6],
  [0.46, 0.63, 1.03, 0.84, -45, -52, 0],
  [0.57, 0.63, 1.06, 0.88, -47, -56, 0],
  [0.71, 0.5, 1.5, 0.82, -42, -64, 0],
  [0.92, 0.5, 2.15, 0.72, -36, -72, 0],
  [1.0, 0.5, 2.3, 0.7, -34, -74, 0],
];

const PORTRAIT: readonly Key[] = [
  [0.0, 0.5, 0.35, 0.43, 20, 100, -14],
  [0.12, 0.5, 0.355, 0.47, 16, 62, -12],
  [0.3, 0.5, 0.38, 0.7, 6, -8, -6],
  [0.46, 0.5, 0.92, 1.12, -45, -52, 0],
  [0.57, 0.5, 0.94, 1.16, -47, -56, 0],
  [0.71, 0.5, 1.34, 1.05, -42, -64, 0],
  [0.92, 0.5, 1.85, 0.95, -36, -72, 0],
  [1.0, 0.5, 2.0, 0.92, -34, -74, 0],
];

export interface Pose {
  cx: number;
  cy: number;
  r: number;
  lat: number;
  lon: number;
  roll: number;
}

export function poseAt(p: number, layout: Layout): Pose {
  const keys = layout.portrait ? PORTRAIT : LANDSCAPE;
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  // ease in-out por trecho: o movimento "assenta" em cada cena sem nunca parar por completo
  const t = easeInOut(clamp01((p - a[0]) / (b[0] - a[0])));
  const { w, h } = layout;
  const unit = layout.portrait ? w : h;
  return {
    cx: mix(a[1], b[1], t) * w,
    cy: mix(a[2], b[2], t) * h,
    r: mix(a[3], b[3], t) * unit,
    lat: mix(a[4], b[4], t),
    lon: mix(a[5], b[5], t),
    roll: mix(a[6], b[6], t),
  };
}

/** Matriz de rotação (linha-maior) que leva coordenadas do mundo para a vista: Rz(roll)·Rx(lat)·Ry(-lon). */
export function rotationMatrix(pose: Pose): number[] {
  const d = Math.PI / 180;
  const cy = Math.cos(-pose.lon * d);
  const sy = Math.sin(-pose.lon * d);
  const cx = Math.cos(pose.lat * d);
  const sx = Math.sin(pose.lat * d);
  const cz = Math.cos(pose.roll * d);
  const sz = Math.sin(pose.roll * d);
  // Ry
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  // Rx (y' = y cos - z sin ; z' = y sin + z cos)
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  // Rz
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(rz, mul3(rx, ry));
}

function mul3(a: number[], b: number[]): number[] {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

/* ------------------------------------------------------------------ */
/* Parâmetros visuais                                                  */
/* ------------------------------------------------------------------ */

export interface SceneParams {
  pose: Pose;
  globe: number;
  dots: number;
  grat: number;
  arcs: number;
  arcAlpha: number;
  warm: number;
  day: number;
  wave: number;
  brWarm: number;
  m1: number;
  m2: number;
  sparks: number;
  dust: number;
  marker: number;
  rim: [number, number, number];
  light: [number, number, number];
}

const NIGHT_RIM: [number, number, number] = [0.33, 0.66, 0.68];
const DAWN_RIM: [number, number, number] = [1.0, 0.6, 0.3];
const NIGHT_LIGHT: [number, number, number] = [-0.52, 0.48, 0.71];
const DAWN_LIGHT: [number, number, number] = [0.0, 0.9, 0.42];

export function sceneAt(p: number, layout: Layout): SceneParams {
  const warm = smooth(p, T.warm);
  const day = smooth(p, T.day);
  const globeOut = smooth(p, T.globeOut);
  const lerp3 = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const l = lerp3(NIGHT_LIGHT, DAWN_LIGHT, warm);
  const ll = Math.hypot(l[0], l[1], l[2]);
  return {
    pose: poseAt(p, layout),
    globe: 1 - globeOut,
    dots: (1 - 0.5 * smooth(p, T.dim)) * (1 - globeOut),
    grat: mix(0.11, 0.06, warm),
    arcs: seg(p, T.arcs),
    arcAlpha: 1 - smooth(p, T.arcsOut),
    warm,
    day,
    wave: seg(p, T.wave) * 0.52,
    brWarm: smooth(p, T.brWarm) * (1 - globeOut),
    m1: seg(p, T.m1),
    m2: seg(p, T.m2),
    sparks: 1 - smooth(p, T.sparksOut),
    dust: 1 - day,
    marker: smooth(p, T.marker) * (1 - smooth(p, T.markerOut)),
    rim: lerp3(NIGHT_RIM, DAWN_RIM, warm) as [number, number, number],
    light: [l[0] / ll, l[1] / ll, l[2] / ll],
  };
}
