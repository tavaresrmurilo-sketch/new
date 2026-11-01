/**
 * Geometria compartilhada entre os ícones SVG e as partículas WebGL.
 *
 * Cada símbolo é descrito por segmentos num quadro de 100 × 100 (centro em 50,50, y para baixo).
 * - `toPath` gera o atributo `d` de um <path> SVG;
 * - `sampleShape` distribui pontos ao longo dos traços (comprimento de arco uniforme),
 *   usados como destino das partículas na abertura.
 */

export type Pt = readonly [number, number];

export type Segment =
  | { kind: "line"; a: Pt; b: Pt }
  | { kind: "cubic"; a: Pt; c1: Pt; c2: Pt; b: Pt }
  /** arco de elipse: centro, raios e ângulos em graus (0° = direita, sentido horário na tela) */
  | { kind: "arc"; c: Pt; rx: number; ry: number; from: number; to: number }
  /** disco preenchido (amostrado por área) */
  | { kind: "disc"; c: Pt; r: number };

export type Shape = readonly Segment[];

const line = (a: Pt, b: Pt): Segment => ({ kind: "line", a, b });
const cubic = (a: Pt, c1: Pt, c2: Pt, b: Pt): Segment => ({ kind: "cubic", a, c1, c2, b });
const arc = (c: Pt, rx: number, ry: number, from: number, to: number): Segment => ({ kind: "arc", c, rx, ry, from, to });
const circle = (c: Pt, r: number): Segment => arc(c, r, r, 0, 360);
const disc = (c: Pt, r: number): Segment => ({ kind: "disc", c, r });

/* ------------------------------------------------------------------ */
/* Símbolos                                                            */
/* ------------------------------------------------------------------ */

/** Educação — livro aberto. */
export const bookShape: Shape = [
  cubic([50, 30], [38, 21], [22, 21], [9, 26]),
  line([9, 26], [9, 74]),
  cubic([9, 74], [22, 69], [38, 70], [50, 79]),
  cubic([50, 30], [62, 21], [78, 21], [91, 26]),
  line([91, 26], [91, 74]),
  cubic([91, 74], [78, 69], [62, 70], [50, 79]),
  line([50, 30], [50, 79]),
  cubic([18, 40], [26, 37], [34, 38], [41, 42]),
  cubic([18, 52], [26, 49], [34, 50], [41, 54]),
  cubic([82, 40], [74, 37], [66, 38], [59, 42]),
  cubic([82, 52], [74, 49], [66, 50], [59, 54]),
];

/** Empreendedorismo — bloco de construção (cubo isométrico). */
export const cubeShape: Shape = [
  line([50, 12], [86, 31]),
  line([86, 31], [50, 50]),
  line([50, 50], [14, 31]),
  line([14, 31], [50, 12]),
  line([14, 31], [14, 69]),
  line([86, 31], [86, 69]),
  line([50, 50], [50, 89]),
  line([14, 69], [50, 89]),
  line([50, 89], [86, 69]),
  line([32, 40.5], [32, 79]),
  line([68, 40.5], [68, 79]),
];

/** Colaboração — dois anéis entrelaçados. */
export const ringsShape: Shape = [circle([37, 50], 25), circle([63, 50], 25)];

/** Inclusão — círculo aberto que acolhe. */
export const inclusionShape: Shape = [
  arc([50, 52], 36, 36, -58, 238),
  disc([41, 58], 4.6),
  disc([59, 58], 4.6),
  disc([50, 44], 4.6),
  disc([50, 8], 4.6),
];

/**
 * Marca da ESF — um círculo aberto (a fronteira que se abre), um meridiano (o mundo)
 * e um ponto laranja que atravessa a abertura (o novo começo).
 */
export const LOGO_RING: Segment = arc([50, 50], 40, 40, -12, 282);
export const LOGO_MERIDIAN: Segment = arc([50, 50], 16, 40, 90, 270);
export const LOGO_SUN: Segment = disc([79, 21], 8.5);
export const logoShape: Shape = [LOGO_RING, LOGO_MERIDIAN, LOGO_SUN];

/** Ordem igual a `introSymbols` em src/content/site.ts: educação, empreendedorismo, inclusão, colaboração. */
export const introGlyphShapes: readonly Shape[] = [bookShape, cubeShape, inclusionShape, ringsShape];

/* ------------------------------------------------------------------ */
/* SVG                                                                 */
/* ------------------------------------------------------------------ */

const rad = (deg: number) => (deg * Math.PI) / 180;
const fmt = (n: number) => Number(n.toFixed(2));

function arcPoint(c: Pt, rx: number, ry: number, deg: number): Pt {
  return [c[0] + rx * Math.cos(rad(deg)), c[1] + ry * Math.sin(rad(deg))];
}

export function segmentPath(seg: Segment): string {
  switch (seg.kind) {
    case "line":
      return `M${fmt(seg.a[0])} ${fmt(seg.a[1])}L${fmt(seg.b[0])} ${fmt(seg.b[1])}`;
    case "cubic":
      return `M${fmt(seg.a[0])} ${fmt(seg.a[1])}C${fmt(seg.c1[0])} ${fmt(seg.c1[1])} ${fmt(seg.c2[0])} ${fmt(seg.c2[1])} ${fmt(seg.b[0])} ${fmt(seg.b[1])}`;
    case "arc": {
      const sweep = seg.to - seg.from;
      if (Math.abs(sweep) >= 360) {
        const [x0, y0] = arcPoint(seg.c, seg.rx, seg.ry, seg.from);
        const [x1, y1] = arcPoint(seg.c, seg.rx, seg.ry, seg.from + 180);
        return `M${fmt(x0)} ${fmt(y0)}A${seg.rx} ${seg.ry} 0 1 1 ${fmt(x1)} ${fmt(y1)}A${seg.rx} ${seg.ry} 0 1 1 ${fmt(x0)} ${fmt(y0)}`;
      }
      const [x0, y0] = arcPoint(seg.c, seg.rx, seg.ry, seg.from);
      const [x1, y1] = arcPoint(seg.c, seg.rx, seg.ry, seg.to);
      const large = Math.abs(sweep) > 180 ? 1 : 0;
      const dir = sweep > 0 ? 1 : 0;
      return `M${fmt(x0)} ${fmt(y0)}A${seg.rx} ${seg.ry} 0 ${large} ${dir} ${fmt(x1)} ${fmt(y1)}`;
    }
    case "disc":
      return "";
  }
}

/** Traços (sem discos) como um único atributo `d`. */
export function toPath(shape: Shape): string {
  return shape.map(segmentPath).filter(Boolean).join("");
}

export function discsOf(shape: Shape): { cx: number; cy: number; r: number }[] {
  return shape.flatMap((s) => (s.kind === "disc" ? [{ cx: s.c[0], cy: s.c[1], r: s.r }] : []));
}

/* ------------------------------------------------------------------ */
/* Amostragem                                                          */
/* ------------------------------------------------------------------ */

function pointAt(seg: Exclude<Segment, { kind: "disc" }>, t: number): Pt {
  switch (seg.kind) {
    case "line":
      return [seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t];
    case "cubic": {
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      return [
        w0 * seg.a[0] + w1 * seg.c1[0] + w2 * seg.c2[0] + w3 * seg.b[0],
        w0 * seg.a[1] + w1 * seg.c1[1] + w2 * seg.c2[1] + w3 * seg.b[1],
      ];
    }
    case "arc":
      return arcPoint(seg.c, seg.rx, seg.ry, seg.from + (seg.to - seg.from) * t);
  }
}

/** Polilinha densa de um segmento, com comprimentos acumulados. */
function flatten(seg: Exclude<Segment, { kind: "disc" }>, steps = 64) {
  const pts: Pt[] = [];
  const acc: number[] = [0];
  for (let i = 0; i <= steps; i++) {
    const p = pointAt(seg, i / steps);
    if (i > 0) {
      const q = pts[i - 1];
      acc.push(acc[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
    pts.push(p);
  }
  return { pts, acc, length: acc[acc.length - 1] };
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Distribui `count` pontos sobre o símbolo, em coordenadas locais [-1, 1] (y para baixo).
 * Discos recebem pontos proporcionais à área; traços, proporcionais ao comprimento.
 */
export function sampleShape(shape: Shape, count: number, seed = 1, jitter = 0.9): Float32Array {
  const rand = rng(seed);
  const strokes = shape.filter((s): s is Exclude<Segment, { kind: "disc" }> => s.kind !== "disc").map((s) => flatten(s));
  const discs = shape.filter((s): s is Extract<Segment, { kind: "disc" }> => s.kind === "disc");

  const strokeLen = strokes.reduce((sum, s) => sum + s.length, 0);
  // Um disco de raio r "vale" o mesmo que um traço de comprimento ~ 2.2 r² / 2 (densidade visual equivalente).
  const discWeight = discs.reduce((sum, d) => sum + d.r * d.r * 1.1, 0);
  const total = strokeLen + discWeight;
  const out = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    let target = ((i + rand() * 0.5) / count) * total;
    let x = 50;
    let y = 50;
    if (target < strokeLen) {
      for (const s of strokes) {
        if (target <= s.length) {
          let k = 1;
          while (k < s.acc.length - 1 && s.acc[k] < target) k++;
          const seg0 = s.acc[k - 1];
          const seg1 = s.acc[k];
          const f = seg1 > seg0 ? (target - seg0) / (seg1 - seg0) : 0;
          const p0 = s.pts[k - 1];
          const p1 = s.pts[k];
          x = p0[0] + (p1[0] - p0[0]) * f;
          y = p0[1] + (p1[1] - p0[1]) * f;
          break;
        }
        target -= s.length;
      }
      x += (rand() - 0.5) * jitter * 2;
      y += (rand() - 0.5) * jitter * 2;
    } else {
      target -= strokeLen;
      let chosen = discs[discs.length - 1];
      for (const d of discs) {
        const w = d.r * d.r * 1.1;
        if (target <= w) {
          chosen = d;
          break;
        }
        target -= w;
      }
      const ang = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * chosen.r;
      x = chosen.c[0] + Math.cos(ang) * r;
      y = chosen.c[1] + Math.sin(ang) * r;
    }
    out[i * 2] = (x - 50) / 50;
    out[i * 2 + 1] = (y - 50) / 50;
  }
  return out;
}

/** Indica, para cada ponto amostrado, se ele pertence a um disco (usado para colorir o "sol" do logo). */
export function sampleShapeWithFlags(shape: Shape, count: number, seed = 1, jitter = 0.9) {
  const points = sampleShape(shape, count, seed, jitter);
  const discs = discsOf(shape);
  const flags = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = points[i * 2] * 50 + 50;
    const y = points[i * 2 + 1] * 50 + 50;
    flags[i] = discs.some((d) => Math.hypot(x - d.cx, y - d.cy) <= d.r + 0.01) ? 1 : 0;
  }
  return { points, flags };
}
