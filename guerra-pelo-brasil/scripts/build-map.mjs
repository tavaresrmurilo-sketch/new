// Gera shared/data/brazil-map.json a partir das fronteiras estaduais reais.
// Fonte: data/raw/brazil-states.geojson (malha estadual derivada do IBGE, via click_that_hood)
// Países vizinhos: world-atlas (Natural Earth, domínio público).
//
// Uso: node scripts/build-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature, mesh } from 'topojson-client';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Projeção equiretangular com correção de latitude ----------
const LAT0 = -15; // latitude de referência (centro do Brasil)
const COS = Math.cos((LAT0 * Math.PI) / 180);
const K = 80; // pixels por grau de latitude
const MARGIN = 220;
const LON_MIN = -74.2;
const LAT_MAX = 5.6;
const LON_MAX = -34.5;
const LAT_MIN = -34.0;
const project = (lon, lat) => [(lon - LON_MIN) * COS * K + MARGIN, (LAT_MAX - lat) * K + MARGIN];
const WIDTH = Math.ceil((LON_MAX - LON_MIN) * COS * K + MARGIN * 2);
const HEIGHT = Math.ceil((LAT_MAX - LAT_MIN) * K + MARGIN * 2);

const r1 = (v) => Math.round(v * 10) / 10;

function projectGeometry(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return {
    type: 'MultiPolygon',
    coordinates: polys.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat)))),
  };
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a / 2;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

// Ponto de inacessibilidade aproximado (onde o rótulo do estado fica bem dentro do polígono)
function labelPoint(rings) {
  // usa o maior polígono externo
  let best = rings[0];
  for (const r of rings) if (Math.abs(ringArea(r)) > Math.abs(ringArea(best))) best = r;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of best) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  let bx = (minX + maxX) / 2, by = (minY + maxY) / 2, bd = -1;
  const score = (x, y) => {
    if (!pointInRing(x, y, best)) return -1;
    let d = Infinity;
    for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
      d = Math.min(d, segDist2(x, y, best[j][0], best[j][1], best[i][0], best[i][1]));
    }
    return Math.sqrt(d);
  };
  let step = Math.max(maxX - minX, maxY - minY) / 24;
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, span = Math.max(maxX - minX, maxY - minY) / 2;
  for (let iter = 0; iter < 4; iter++) {
    for (let x = cx - span; x <= cx + span; x += step) {
      for (let y = cy - span; y <= cy + span; y += step) {
        const s = score(x, y);
        if (s > bd) { bd = s; bx = x; by = y; }
      }
    }
    cx = bx; cy = by; span = step * 2; step = step / 4;
  }
  return [r1(bx), r1(by)];
}

// ---------- Estados ----------
const raw = JSON.parse(readFileSync(resolve(root, 'data/raw/brazil-states.geojson'), 'utf8'));
const fc = {
  type: 'FeatureCollection',
  features: raw.features.map((f) => ({
    type: 'Feature',
    id: f.properties.sigla,
    properties: { uf: f.properties.sigla, name: f.properties.name },
    geometry: projectGeometry(f.geometry),
  })),
};

let topo = topology({ states: fc }, 1e6);
topo = presimplify(topo);
const minWeight = quantile(topo, 0.12); // mantém ~12% dos vértices de maior peso
topo = simplify(topo, minWeight);

// adjacência exata via arcos compartilhados
const geoms = topo.objects.states.geometries;
const arcOwners = new Map();
const walk = (arcs, uf) => {
  for (const a of arcs) {
    if (Array.isArray(a)) walk(a, uf);
    else {
      const k = a < 0 ? ~a : a;
      if (!arcOwners.has(k)) arcOwners.set(k, new Set());
      arcOwners.get(k).add(uf);
    }
  }
};
for (const g of geoms) walk(g.arcs, g.id);
const adjacency = {};
for (const g of geoms) adjacency[g.id] = new Set();
for (const owners of arcOwners.values()) {
  const list = [...owners];
  for (const a of list) for (const b of list) if (a !== b) adjacency[a].add(b);
}

const simplified = feature(topo, topo.objects.states);
const MIN_ISLAND = 24; // px² — descarta ilhotas minúsculas
let totalPts = 0;
const states = simplified.features.map((f) => {
  const rings = [];
  for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) {
    const outer = poly[0];
    if (Math.abs(ringArea(outer)) < MIN_ISLAND) continue;
    rings.push(outer); // buracos internos (ex.: DF dentro de GO) já são estados próprios
  }
  totalPts += rings.reduce((s, r) => s + r.length, 0);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return {
    uf: f.id,
    name: f.properties.name,
    bbox: [r1(minX), r1(minY), r1(maxX), r1(maxY)],
    label: labelPoint(rings),
    rings: rings.map((r) => r.flatMap(([x, y]) => [r1(x), r1(y)])),
    adj: [...adjacency[f.id]].sort(),
  };
});
states.sort((a, b) => a.uf.localeCompare(b.uf));

// fronteiras por par de estados (para desenhar frentes de combate)
const borders = [];
const done = new Set();
for (const s of states) {
  for (const n of s.adj) {
    const key = [s.uf, n].sort().join('-');
    if (done.has(key)) continue;
    done.add(key);
    const m = mesh(topo, topo.objects.states, (a, b) => (a.id === s.uf && b.id === n) || (a.id === n && b.id === s.uf));
    borders.push({ a: key.split('-')[0], b: key.split('-')[1], lines: m.coordinates.map((l) => l.flatMap(([x, y]) => [r1(x), r1(y)])) });
  }
}
const outline = mesh(topo, topo.objects.states, (a, b) => a === b).coordinates.map((l) => l.flatMap(([x, y]) => [r1(x), r1(y)]));

// ---------- Países vizinhos (contexto visual) ----------
const world = require('world-atlas/countries-50m.json');
const countries = feature(world, world.objects.countries);
const neighbors = [];
const lonLo = LON_MIN - 6, lonHi = LON_MAX + 4, latLo = LAT_MIN - 4, latHi = LAT_MAX + 4;
for (const c of countries.features) {
  if (c.properties.name === 'Brazil') continue;
  const polys = c.geometry ? (c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates) : [];
  for (const poly of polys) {
    const ring = poly[0];
    const inBox = ring.some(([lon, lat]) => lon > lonLo && lon < lonHi && lat > latLo && lat < latHi);
    if (!inBox) continue;
    // decimação simples
    const pts = [];
    let last = null;
    for (const [lon, lat] of ring) {
      const p = project(lon, lat);
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 6) { pts.push(p); last = p; }
    }
    if (pts.length > 3 && Math.abs(ringArea(pts)) > 200) {
      neighbors.push({ name: c.properties.name, ring: pts.flatMap(([x, y]) => [r1(x), r1(y)]) });
    }
  }
}

const out = {
  source: 'Malha estadual IBGE (via click_that_hood/brazil-states.geojson) + Natural Earth (world-atlas)',
  width: WIDTH,
  height: HEIGHT,
  projection: { lonMin: LON_MIN, latMax: LAT_MAX, cos: COS, k: K, margin: MARGIN },
  states,
  borders,
  outline,
  neighbors,
};
const target = resolve(root, 'shared/data/brazil-map.json');
writeFileSync(target, JSON.stringify(out));
console.log(`OK: ${states.length} estados, ${totalPts} vértices, ${borders.length} fronteiras, ${neighbors.length} polígonos vizinhos`);
console.log(`Mundo: ${WIDTH}x${HEIGHT}px  ->  ${target}`);
for (const s of states) console.log(s.uf, s.adj.join(','));
