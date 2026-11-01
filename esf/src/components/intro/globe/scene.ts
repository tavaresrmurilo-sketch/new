/**
 * Coreografia da abertura — "Uma jornada sem fronteiras".
 *
 * Tudo aqui é função pura do progresso do scroll `p ∈ [0, 1]`: o mesmo `p` sempre produz exatamente
 * o mesmo quadro. Não há nenhum movimento baseado em tempo — quando a rolagem para, a cena para;
 * quando volta, tudo acontece ao contrário.
 *
 * Mundo 3D (Y para cima):
 *  - plano do mapa/chão em y = 0;
 *  - planeta de raio 1 com centro em (0, −1, 0) — tangente ao plano no ponto de vista (Brasília ao final);
 *  - mapa equiretangular centrado em (lat0, lon0): x = Δlon, z = −Δlat (norte para "cima"/frente);
 *  - um caminho de luz parte de Brasília rumo ao norte e termina numa passagem (porta) em z = −DOOR_Z.
 */

import { rng } from "@/lib/shapes";
import { v3, type Camera, type Vec3 } from "./math";

export type Range = readonly [number, number];

export const T = {
  // textos
  cueOut: [0, 0.025],
  t1Out: [0.13, 0.18],
  t2In: [0.25, 0.3],
  t2Out: [0.4, 0.44],
  t3In: [0.535, 0.58],
  t3Out: [0.655, 0.685],
  t4In: [0.715, 0.755],
  t4Out: [0.815, 0.845],
  logoIn: [0.885, 0.93],
  titleIn: [0.885, 0.945],
  subIn: [0.92, 0.96],
  ctaIn: [0.94, 0.975],
  uiOut: [0.955, 0.99],
  // cena 1 — o mundo
  spin: [0, 0.23],
  // cena 2 — as fronteiras
  morph: [0.2, 0.35],
  bordersIn: [0.24, 0.32],
  dissolve: [0.335, 0.43],
  links: [0.3, 0.42],
  linksOut: [0.43, 0.5],
  // cena 3 — o recomeço
  hero: [0.33, 0.6],
  follow: [0.42, 0.645],
  floor: [0.43, 0.6],
  marker: [0.35, 0.39],
  markerOut: [0.44, 0.47],
  doorIn: [0.49, 0.55],
  doorOpen: [0.555, 0.645],
  doorLight: [0.53, 0.66],
  rays: [0.58, 0.68],
  dawn: [0.42, 0.6],
  // cena 4 — a transformação
  dolly: [0.645, 0.82],
  emerge: [0.66, 0.75],
  nodes: [0.7, 0.78],
  edges: [0.715, 0.81],
  labels: [0.72, 0.76],
  labelsOut: [0.815, 0.84],
  // cena 5 — a ESF
  through: [0.82, 0.93],
  converge: [0.825, 0.9],
  toLogo: [0.835, 0.915],
  day: [0.85, 0.93],
  ink: [0.836, 0.866],
  sparksOut: [0.905, 0.95],
} as const satisfies Record<string, Range>;

/** A partir de qual progresso cada cena é considerada ativa (indicador de progresso). */
export const SCENE_STARTS = [0, 0.2, 0.42, 0.645, 0.82] as const;
/** Ponto de "repouso" de cada cena — destino ao clicar no indicador. */
export const SCENE_TARGETS = [0, 0.37, 0.6, 0.78, 1] as const;
/** Quando o cabeçalho passa a usar tinta escura (fundo claro). */
export const HEADER_LIGHT_AT = 0.9;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const seg = (p: number, r: Range) => clamp01((p - r[0]) / (r[1] - r[0]));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const smooth = (p: number, r: Range) => easeInOut(seg(p, r));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Mundo                                                               */
/* ------------------------------------------------------------------ */

/** Centro de vista final: Brasília, sede institucional da ESF. */
export const VIEW_LAT = -15.79;
export const VIEW_LON = -47.88;
/** Distância do caminho até a passagem (unidades de mundo). */
export const DOOR_Z = 7.2;
export const DOOR_W = 0.72;
export const DOOR_H = 1.3;

/** Caminho de luz sobre o chão, de Brasília (s=0) até a passagem (s=1). */
export function heroPath(s: number): Vec3 {
  return [0.3 * Math.sin(2 * Math.PI * s) * (1 - s), 0, -DOOR_Z * s];
}

/** Região do "campo de luz" em que os pontos do mapa se reorganizam (cena 3). */
export const FLOOR = { x0: -2.7, x1: 2.7, z0: 1.7, z1: -DOOR_Z - 2.6 } as const;

/* ------------------------------------------------------------------ */
/* Layout de tela (símbolos, rede, marca)                              */
/* ------------------------------------------------------------------ */

export interface NetNode {
  x: number;
  y: number;
  /** ordem de surgimento 0..1 */
  order: number;
  symbol: boolean;
}

export interface NetEdge {
  a: number;
  b: number;
  order: number;
}

export interface Layout {
  w: number;
  h: number;
  portrait: boolean;
  glyphs: [number, number][];
  glyphR: number;
  logo: { x: number; y: number; half: number };
  nodes: NetNode[];
  edges: NetEdge[];
}

function buildNetwork(w: number, h: number, portrait: boolean, glyphs: [number, number][], glyphR: number) {
  const rand = rng(portrait ? 404 : 202);
  const unit = Math.min(w, h);
  const origin: [number, number] = [w * (portrait ? 0.5 : 0.57), h * (portrait ? 0.56 : 0.6)];
  const nodes: NetNode[] = glyphs.map(([x, y]) => ({ x, y, order: 0, symbol: true }));
  const target = portrait ? 12 : 18;
  const box = portrait ? [0.07, 0.93, 0.33, 0.9] : [0.05, 0.95, 0.3, 0.93];
  let guard = 0;
  while (nodes.length < glyphs.length + target && guard++ < 4000) {
    const x = w * mix(box[0], box[1], rand());
    const y = h * mix(box[2], box[3], rand());
    const tooClose = nodes.some((n) => Math.hypot(n.x - x, n.y - y) < (n.symbol ? glyphR * 2.0 : unit * 0.11));
    if (!tooClose) nodes.push({ x, y, order: 0, symbol: false });
  }
  // arestas: dois vizinhos mais próximos de cada nó + a cadeia entre os símbolos
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const seen = new Set<string>();
  const edges: NetEdge[] = [];
  const add = (a: number, b: number) => {
    if (a === b || seen.has(key(a, b))) return;
    seen.add(key(a, b));
    edges.push({ a, b, order: 0 });
  };
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    near.forEach((o) => add(i, o.j));
  });
  for (let i = 0; i < glyphs.length - 1; i++) add(i, i + 1);

  // a rede cresce a partir da passagem
  const dist = (x: number, y: number) => Math.hypot(x - origin[0], y - origin[1]);
  const maxNode = Math.max(...nodes.map((n) => dist(n.x, n.y))) || 1;
  nodes.forEach((n) => (n.order = n.symbol ? 0 : dist(n.x, n.y) / maxNode));
  const sorted = edges
    .map((e) => ({ e, d: Math.max(nodes[e.a].order, nodes[e.b].order) + rand() * 0.04 }))
    .sort((p, q) => p.d - q.d);
  sorted.forEach((o, i) => (o.e.order = sorted.length > 1 ? i / (sorted.length - 1) : 0));
  return { nodes, edges };
}

export function computeLayout(w: number, h: number, logo?: Layout["logo"] | null): Layout {
  const portrait = w / h < 0.95;
  let glyphs: [number, number][];
  let glyphR: number;
  if (portrait) {
    glyphR = Math.max(30, Math.min(w * 0.115, h * 0.06));
    glyphs = [
      [w * 0.18, h * 0.44],
      [w * 0.82, h * 0.44],
      [w * 0.18, h * 0.69],
      [w * 0.82, h * 0.69],
    ];
  } else {
    glyphR = Math.max(38, Math.min(h * 0.075, w * 0.052, 96));
    glyphs = [
      [w * 0.13, h * 0.5],
      [w * 0.29, h * 0.76],
      [w * 0.84, h * 0.76],
      [w * 0.9, h * 0.47],
    ];
  }
  const net = buildNetwork(w, h, portrait, glyphs, glyphR);
  return {
    w,
    h,
    portrait,
    glyphs,
    glyphR,
    logo: logo ?? { x: w / 2, y: h * 0.26, half: portrait ? 30 : 40 },
    nodes: net.nodes,
    edges: net.edges,
  };
}

/* ------------------------------------------------------------------ */
/* Câmera                                                              */
/* ------------------------------------------------------------------ */

/** Pose da câmera nas cenas 1–2: [p, alvo(x,y,z), distância, inclinação (graus a partir da vertical)]. */
type OrbitKey = readonly [number, number, number, number, number, number];

const ORBIT_LANDSCAPE: readonly OrbitKey[] = [
  [0.0, -0.9, -1.0, 0.08, 5.6, 17],
  [0.23, -0.42, -0.5, 0.02, 3.7, 13],
  [0.35, 0.3, 0, 0.12, 2.25, 9],
];
const ORBIT_PORTRAIT: readonly OrbitKey[] = [
  [0.0, 0, -1.0, 0.72, 8.4, 17],
  [0.23, 0, -0.5, 0.42, 5.0, 13],
  [0.35, 0, 0, 0.42, 3.1, 9],
];

function orbit(target: Vec3, dist: number, tiltDeg: number) {
  const t = tiltDeg * DEG;
  return { eye: v3.add(target, [0, Math.cos(t) * dist, Math.sin(t) * dist]) as Vec3, target };
}

const FOLLOW_END_S = 1 - 3.15 / DOOR_Z;

/** Câmera acompanhando o caminho de luz (cena 3), f ∈ [0, 1]. */
function follow(f: number, portrait: boolean) {
  const sCam = easeInOut(f) * FOLLOW_END_S;
  const base = heroPath(sCam);
  const height = mix(portrait ? 2.55 : 1.85, portrait ? 0.38 : 0.32, easeInOut(f));
  const eye: Vec3 = [base[0] * 0.55, height, base[2] + mix(0.2, 0, f)];
  const doorTarget: Vec3 = [portrait ? 0 : -0.3, DOOR_H * 0.36, -DOOR_Z];
  const down = v3.norm([0, -Math.cos(6 * DEG), -Math.sin(6 * DEG)]);
  const toDoor = v3.norm(v3.sub(doorTarget, eye));
  const pitch = easeInOut(clamp01((f - 0.12) / 0.8));
  const dir = v3.norm(v3.mix(down, toDoor, pitch));
  const up = v3.norm(v3.mix([0, 0, -1], [0, 1, 0], pitch));
  return { eye, target: v3.add(eye, dir), up };
}

export function cameraAt(p: number, layout: Layout): Camera {
  const portrait = layout.portrait;
  const fov = portrait ? 52 : 38;
  // cenas 1–2: órbita descendo sobre o planeta e o mapa
  if (p < T.follow[0]) {
    const keys = portrait ? ORBIT_PORTRAIT : ORBIT_LANDSCAPE;
    // último trecho (0.35 → início da cena 3) emenda com a pose inicial do acompanhamento
    if (p >= keys[keys.length - 1][0]) {
      const k = keys[keys.length - 1];
      const a = orbit([k[1], k[2], k[3]], k[4], k[5]);
      const b = follow(0, portrait);
      const t = easeInOut(clamp01((p - k[0]) / (T.follow[0] - k[0])));
      return { eye: v3.mix(a.eye, b.eye, t), target: v3.mix(a.target, b.target, t), up: [0, 0, -1], fov };
    }
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const t = easeInOut(clamp01((p - a[0]) / (b[0] - a[0])));
    const target: Vec3 = [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)];
    const o = orbit(target, mix(a[4], b[4], t), mix(a[5], b[5], t));
    return { eye: o.eye, target: o.target, up: [0, 0, -1], fov };
  }
  // cena 3: a câmera acompanha o caminho e se inclina até o horizonte
  if (p < T.dolly[0]) {
    const c = follow(seg(p, T.follow), portrait);
    return { ...c, fov };
  }
  const end = follow(1, portrait);
  const doorCenter: Vec3 = [portrait ? 0 : -0.3, DOOR_H * 0.42, -DOOR_Z];
  const dollyEye: Vec3 = [0, portrait ? 0.5 : 0.4, -DOOR_Z + (portrait ? 4.1 : 2.75)];
  // cena 4: aproximação lenta da passagem
  if (p < T.through[0]) {
    const t = easeInOut(seg(p, T.dolly));
    const eye = v3.mix(end.eye, dollyEye, t);
    const target = v3.mix(end.target, doorCenter, t);
    return { eye, target, up: [0, 1, 0], fov };
  }
  // cena 5: atravessando a luz (desacelera no fim)
  const t = easeOut(seg(p, T.through));
  const eye = v3.mix(dollyEye, [0, DOOR_H * 0.46, -DOOR_Z + 0.22], t);
  const target = v3.mix(doorCenter, [0, DOOR_H * 0.46, -DOOR_Z - 4], t);
  return { eye, target, up: [0, 1, 0], fov };
}

/* ------------------------------------------------------------------ */
/* Parâmetros visuais                                                  */
/* ------------------------------------------------------------------ */

export interface SceneParams {
  lat0: number;
  lon0: number;
  morph: number;
  sphere: number;
  plane: number;
  floor: number;
  bordersIn: number;
  dissolve: number;
  links: number;
  linksAlpha: number;
  hero: number;
  heroAlpha: number;
  dawn: number;
  doorIn: number;
  doorOpen: number;
  doorLight: number;
  rays: number;
  emerge: number;
  nodes: number;
  edges: number;
  converge: number;
  toLogo: number;
  sparks: number;
  day: number;
  ink: number;
  dust: number;
  marker: number;
}

export function sceneAt(p: number): SceneParams {
  const spin = easeInOut(seg(p, T.spin));
  const morph = seg(p, T.morph);
  const morphE = easeInOut(morph);
  return {
    // o planeta gira das Américas até centralizar Brasília
    lat0: mix(18, VIEW_LAT, spin),
    lon0: mix(-112, VIEW_LON, spin),
    morph,
    sphere: 1 - easeInOut(clamp01((morph - 0.25) / 0.6)),
    plane: easeInOut(clamp01((morph - 0.35) / 0.6)),
    floor: seg(p, T.floor),
    bordersIn: seg(p, T.bordersIn),
    dissolve: seg(p, T.dissolve),
    links: seg(p, T.links),
    linksAlpha: 1 - smooth(p, T.linksOut),
    hero: seg(p, T.hero),
    heroAlpha: (1 - smooth(p, T.through) * 0.9) * clamp01(morphE * 2),
    dawn: smooth(p, T.dawn),
    doorIn: smooth(p, T.doorIn),
    doorOpen: smooth(p, T.doorOpen),
    doorLight: smooth(p, T.doorLight),
    rays: smooth(p, T.rays),
    emerge: seg(p, T.emerge),
    nodes: seg(p, T.nodes),
    edges: seg(p, T.edges),
    converge: seg(p, T.converge),
    toLogo: seg(p, T.toLogo),
    sparks: 1 - smooth(p, T.sparksOut),
    day: smooth(p, T.day),
    ink: smooth(p, T.ink),
    dust: 1 - smooth(p, [0.3, 0.5]),
    marker: smooth(p, T.marker) * (1 - smooth(p, T.markerOut)),
  };
}
