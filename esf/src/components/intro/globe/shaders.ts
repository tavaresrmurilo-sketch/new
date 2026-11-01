/**
 * Shaders GLSL ES 1.0 (WebGL 1).
 *
 * Nenhum shader usa tempo: toda a animação vem do progresso do scroll, então a cena
 * fica exatamente parada quando a rolagem para.
 */
import { DOOR_Z } from "./scene";

const DOOR = DOOR_Z.toFixed(3);

/** Posição de um ponto (lat, lon) no planeta, no mapa e a mistura entre os dois. */
const MORPH = /* glsl */ `
uniform mat3 u_rot;
uniform float u_lat0;
uniform float u_lon0;
uniform float u_morph;
uniform vec3 u_eye;

vec3 unitLL(vec2 ll) {
  float c = cos(ll.x);
  return vec3(c * sin(ll.y), sin(ll.x), c * cos(ll.y));
}

/** retorna a posição no mundo; vis = visibilidade (lado de trás do planeta some); mapX = longitude relativa */
vec3 morphPos(vec2 ll, out float vis, out float mapX, out float m) {
  vec3 v = u_rot * unitLL(ll);
  vec3 sph = vec3(v.x, v.z - 1.0, -v.y);
  float dl = mod(ll.y - u_lon0 + 3.14159265, 6.28318531) - 3.14159265;
  vec3 map = vec3(dl, 0.0, -(ll.x - u_lat0));
  // o planeta se desdobra a partir do centro de vista
  float ang = acos(clamp(v.z, -1.0, 1.0)) / 3.14159265;
  float k = clamp(u_morph * 1.6 - ang * 0.6, 0.0, 1.0);
  m = k * k * (3.0 - 2.0 * k);
  vec3 n = sph - vec3(0.0, -1.0, 0.0);
  float facing = dot(n, normalize(u_eye - sph));
  vis = mix(smoothstep(0.0, 0.16, facing), 1.0, m);
  mapX = dl;
  return mix(sph, map, m);
}
`;

/* ------------------------------------------------------------------ */
/* Fundo: espaço/céu, planeta, mapa/chão (tela cheia)                  */
/* ------------------------------------------------------------------ */

export const fullscreenVertex = /* glsl */ `
attribute vec2 a_xy;
void main() { gl_Position = vec4(a_xy, 0.0, 1.0); }
`;

export const backgroundFragment = (derivatives: boolean) => /* glsl */ `
${derivatives ? "#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES 1" : ""}
precision highp float;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec3 u_eye;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_fwd;
uniform float u_tanHalf;
uniform float u_aspect;
uniform mat3 u_rotInv;
uniform float u_lat0;
uniform float u_lon0;
uniform float u_sphere;
uniform float u_plane;
uniform float u_floor;
uniform float u_dawn;
uniform float u_doorLight;
uniform vec3 u_rim;
uniform vec3 u_light;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float gridLine(float v, float stepSize, float boost) {
  float f = v / stepSize;
  float d = abs(fract(f + 0.5) - 0.5);
#ifdef HAS_DERIVATIVES
  float w = fwidth(f) * boost;
#else
  float w = 0.04;
#endif
  return (1.0 - smoothstep(0.0, w, d)) * smoothstep(0.5, 0.15, w);
}

void main() {
  vec2 ndc = vec2(gl_FragCoord.x / (u_res.x * u_dpr), gl_FragCoord.y / (u_res.y * u_dpr)) * 2.0 - 1.0;
  vec3 dir = normalize(u_fwd + ndc.x * u_tanHalf * u_aspect * u_right + ndc.y * u_tanHalf * u_up);

  vec3 ember = vec3(0.949, 0.549, 0.271);
  vec3 deep = vec3(0.010, 0.030, 0.058);
  vec3 navy = vec3(0.040, 0.098, 0.160);

  // --- espaço / céu
  float vign = 1.0 - 0.38 * dot(ndc * vec2(0.75, 1.0), ndc * vec2(0.75, 1.0));
  vec3 col = mix(deep, navy, 0.45 + 0.35 * ndc.y) * vign;
  float elev = dir.y;
  // amanhecer: o horizonte aquece e uma luz difusa nasce atrás da passagem
  col += u_dawn * (ember * 0.55 * exp(-abs(elev) * 9.0) + vec3(0.30, 0.13, 0.10) * exp(-max(elev, 0.0) * 2.4) * 0.65);
  vec3 doorDir = normalize(vec3(0.0, 0.55, -${DOOR}) - u_eye);
  float toward = max(dot(dir, doorDir), 0.0);
  col += (ember * pow(toward, 26.0) * 0.9 + vec3(1.0, 0.85, 0.7) * pow(toward, 160.0) * 1.3) * u_doorLight;

  // --- planeta (traçado por raio, esfera de raio 1 em (0,-1,0))
  vec3 oc = u_eye - vec3(0.0, -1.0, 0.0);
  float b = dot(oc, dir);
  float c = dot(oc, oc) - 1.0;
  float h = b * b - c;
  if (u_sphere > 0.001) {
    float closest = sqrt(max(dot(oc, oc) - b * b, 0.0));
    float halo = (b < 0.0) ? exp(-max(closest - 1.0, 0.0) * 7.5) * step(1.0, closest) : 0.0;
    col += u_rim * halo * 0.32 * u_sphere;
    if (h > 0.0) {
      float t = -b - sqrt(h);
      if (t > 0.0) {
        vec3 n = normalize(oc + t * dir);
        float diff = max(dot(n, u_light), 0.0);
        float fres = pow(1.0 - max(dot(n, -dir), 0.0), 3.0);
        vec3 ocean = mix(vec3(0.016, 0.043, 0.082), vec3(0.06, 0.13, 0.20), diff);
        ocean += u_rim * fres * 0.55 * (0.5 + 0.5 * diff);
        vec3 w = u_rotInv * vec3(n.x, -n.z, n.y);
        float lat = asin(clamp(w.y, -1.0, 1.0));
        float lon = atan(w.x, w.z);
        float g = max(gridLine(lat, 0.2617994, 1.2), gridLine(lon, 0.2617994, 1.2) * smoothstep(0.985, 0.9, abs(w.y)));
        ocean += vec3(0.55, 0.72, 0.82) * g * 0.1 * smoothstep(0.0, 0.4, dot(n, -dir));
        col = mix(col, ocean, u_sphere);
      }
    }
  }

  // --- mapa / chão (plano y = 0)
  if (u_plane > 0.001 && dir.y < -0.0005) {
    float t = -u_eye.y / dir.y;
    vec3 p = u_eye + t * dir;
    float lat = u_lat0 + (-p.z);
    float lon = u_lon0 + p.x;
    vec3 base = mix(vec3(0.020, 0.050, 0.090), vec3(0.018, 0.034, 0.058), u_floor);
    // mapa: paralelos e meridianos a cada 15°; chão: grade regular que some ao longe
    float onMap = smoothstep(1.62, 1.5, abs(lat));
    float grat = max(gridLine(lat, 0.2617994, 1.3), gridLine(lon, 0.2617994, 1.3)) * onMap;
    float grid = max(gridLine(p.x, 0.45, 1.4), gridLine(p.z, 0.45, 1.4));
    float lines = mix(grat * 0.09, grid * 0.11, u_floor);
    vec3 plane = base + vec3(0.55, 0.72, 0.82) * lines * exp(-t * 0.12);
    // luz da passagem derramando sobre o chão
    float dd = length(p.xz - vec2(0.0, -${DOOR}));
    plane += mix(ember, vec3(1.0, 0.85, 0.7), 0.3) * u_doorLight * exp(-dd * 1.1) * (p.z > -${DOOR} ? 0.5 : 0.12);
    // névoa até o horizonte
    vec3 haze = mix(navy * 0.9, mix(navy, ember * 0.65, 0.55), u_dawn);
    plane = mix(plane, haze, 1.0 - exp(-t * mix(0.05, 0.16, u_floor)));
    col = mix(col, plane, u_plane);
  }

  // --- grão estático (não muda com o tempo)
  col += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.028;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Pontos de terra (planeta → mapa → campo de luz)                     */
/* ------------------------------------------------------------------ */

export const dotsVertex = /* glsl */ `
attribute vec2 a_ll;
attribute vec2 a_floor;
attribute vec2 a_info;
uniform mat4 u_viewProj;
uniform float u_focal;
uniform float u_dpr;
uniform float u_alpha;
uniform float u_floor;
uniform float u_sizeSphere;
uniform float u_sizeFloor;
uniform float u_doorLight;
uniform float u_dawn;
${MORPH}
varying vec4 v_col;

void main() {
  float vis;
  float mapX;
  float m;
  vec3 pos = morphPos(a_ll, vis, mapX, m);
  // o mapa se reorganiza num campo de luz ao longo do caminho
  float f = clamp(u_floor * 1.5 - a_info.x * 0.5, 0.0, 1.0);
  float fe = f * f * (3.0 - 2.0 * f);
  pos = mix(pos, vec3(a_floor.x, 0.0, a_floor.y), fe);
  pos.y += sin(fe * 3.14159265) * (0.02 + 0.07 * a_info.x);
  vec4 clip = u_viewProj * vec4(pos, 1.0);
  gl_Position = clip;

  float depth = max(clip.w, 0.001);
  float size = mix(u_sizeSphere, u_sizeFloor, fe);
  float px = size * u_focal / depth;
  float nearFade = smoothstep(0.18, 0.8, depth);
  float fog = mix(1.0, exp(-depth * 0.09), fe);
  float dd = length(pos.xz - vec2(0.0, -${DOOR}));
  float lit = u_doorLight * exp(-dd * 0.8) * (pos.z > -${DOOR} ? 1.0 : 0.35);

  vec3 cool = vec3(0.80, 0.87, 0.92);
  vec3 col = mix(cool, vec3(1.0, 0.88, 0.76), u_dawn * 0.45 * fe);
  col = mix(col, vec3(1.0, 0.74, 0.46), clamp(lit * 1.3, 0.0, 1.0));
  float bright = mix(1.0, 0.5 + 0.5 * clamp(lit * 2.2, 0.0, 1.0), fe);
  float a = vis * u_alpha * nearFade * fog * bright;
  gl_PointSize = (clip.w > 0.0 && a > 0.003) ? clamp(px * u_dpr, 1.0, 46.0) : 0.0;
  v_col = vec4(col, a);
}
`;

export const pointFragment = /* glsl */ `
precision mediump float;
varying vec4 v_col;
uniform float u_add;
uniform float u_soft;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.55, 1.0, d);
  float glow = exp(-d * d * 3.5) * u_soft;
  float a = v_col.a * max(core, glow);
  if (a < 0.004) discard;
  gl_FragColor = vec4(v_col.rgb * a, a * (1.0 - u_add));
}
`;

/* ------------------------------------------------------------------ */
/* Linhas 3D: fronteiras (lat/lon, acompanham o desdobramento),        */
/* conexões e moldura da passagem (posições no mundo)                  */
/* ------------------------------------------------------------------ */

export const linesVertex = /* glsl */ `
attribute vec3 a_a;
attribute vec3 a_b;
attribute vec4 a_meta;
uniform mat4 u_viewProj;
uniform vec2 u_res;
uniform float u_width;
uniform float u_mode;
${MORPH}
varying float v_t;
varying float v_side;
varying float v_seed;
varying float v_vis;

void main() {
  vec3 pa = a_a;
  vec3 pb = a_b;
  float visA = 1.0;
  float visB = 1.0;
  float hide = 0.0;
  if (u_mode < 0.5) {
    float xa;
    float xb;
    float ma;
    float mb;
    pa = morphPos(a_a.xy, visA, xa, ma);
    pb = morphPos(a_b.xy, visB, xb, mb);
    // segmentos que cruzariam a "costura" do mapa (lado oposto ao centro) são ocultados
    hide = step(1.0, abs(xa - xb));
  }
  vec4 ca = u_viewProj * vec4(pa, 1.0);
  vec4 cb = u_viewProj * vec4(pb, 1.0);
  vec2 sa = ca.xy / max(ca.w, 0.0001) * u_res;
  vec2 sb = cb.xy / max(cb.w, 0.0001) * u_res;
  vec2 d = sb - sa;
  float len = length(d);
  d = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-d.y, d.x);
  vec4 c = mix(ca, cb, a_meta.z);
  c.xy += nrm / u_res * a_meta.y * u_width * c.w;
  if (ca.w < 0.02 || cb.w < 0.02 || hide > 0.5) c = vec4(2.0, 2.0, 2.0, 1.0);
  gl_Position = c;
  v_t = a_meta.x;
  v_side = a_meta.y;
  v_seed = a_meta.w;
  v_vis = mix(visA, visB, a_meta.z);
}
`;

export const linesFragment = /* glsl */ `
precision mediump float;
varying float v_t;
varying float v_side;
varying float v_seed;
varying float v_vis;
uniform float u_kind;
uniform float u_reveal;
uniform float u_dissolve;
uniform float u_alpha;
uniform vec3 u_color;
uniform vec3 u_hot;

void main() {
  float edge = 1.0 - smoothstep(0.2, 1.0, abs(v_side));
  vec3 col = u_color;
  float a;
  if (u_kind < 0.5) {
    // fronteiras: acendem em sequência e depois se dissolvem trecho a trecho, com um último brilho
    float on = smoothstep(v_seed * 0.75, v_seed * 0.75 + 0.25, u_reveal);
    float at = v_seed * 0.82;
    float off = smoothstep(at, at + 0.18, u_dissolve);
    float flash = smoothstep(at - 0.14, at, u_dissolve) * (1.0 - off);
    a = on * (1.0 - off) * (1.0 + 1.1 * flash);
    col = mix(u_color, u_hot, flash);
  } else {
    // conexões: desenhadas da origem ao destino, com uma "cabeça" luminosa
    float head = clamp((u_reveal - v_seed * 0.6) / 0.4, 0.0, 1.0);
    if (v_t > head) discard;
    float headGlow = exp(-pow((head - v_t) * 26.0, 2.0)) * (1.0 - step(0.999, head));
    a = 0.5 + 0.3 * smoothstep(0.0, 0.08, v_t) * smoothstep(1.0, 0.92, v_t) + headGlow * 1.4;
    col = mix(u_color, u_hot, clamp(headGlow, 0.0, 1.0));
  }
  a *= u_alpha * edge * v_vis;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, 0.0);
}
`;

/* ------------------------------------------------------------------ */
/* Caminho de luz (fita no chão)                                       */
/* ------------------------------------------------------------------ */

export const ribbonVertex = /* glsl */ `
attribute vec3 a_c;
attribute vec3 a_n;
attribute vec2 a_uv;
uniform mat4 u_viewProj;
uniform float u_width;
varying vec2 v_uv;
varying float v_depth;
void main() {
  vec3 p = a_c + a_n * a_uv.x * u_width * 0.5;
  vec4 clip = u_viewProj * vec4(p, 1.0);
  gl_Position = clip;
  v_uv = a_uv;
  v_depth = clip.w;
}
`;

export const ribbonFragment = /* glsl */ `
precision mediump float;
varying vec2 v_uv;
varying float v_depth;
uniform float u_head;
uniform float u_alpha;
void main() {
  if (v_uv.y > u_head) discard;
  float across = abs(v_uv.x);
  float core = exp(-across * across * 9.0);
  float glow = exp(-across * across * 2.0) * 0.45;
  float headGlow = exp(-pow((u_head - v_uv.y) * 40.0, 2.0)) * step(u_head, 0.999);
  float a = (core + glow) * (0.75 + 1.2 * headGlow) * u_alpha * smoothstep(0.08, 0.5, v_depth);
  vec3 col = mix(vec3(1.0, 0.70, 0.40), vec3(1.0, 0.93, 0.82), core * 0.6 + headGlow);
  gl_FragColor = vec4(col * a, 0.0);
}
`;

/* ------------------------------------------------------------------ */
/* Passagem: luz da abertura, portas e luz no chão                     */
/* ------------------------------------------------------------------ */

export const doorVertex = /* glsl */ `
attribute vec3 a_pos;
attribute vec3 a_uvk;
uniform mat4 u_viewProj;
varying vec3 v_uvk;
void main() {
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
  v_uvk = a_uvk;
}
`;

export const doorFragment = /* glsl */ `
precision mediump float;
varying vec3 v_uvk;
uniform float u_light;
uniform float u_in;
void main() {
  vec2 uv = v_uvk.xy;
  float kind = v_uvk.z;
  vec3 warm = vec3(1.0, 0.80, 0.58);
  vec3 white = vec3(1.0, 0.96, 0.9);
  if (kind < 0.5) {
    // abertura: luz quente, mais intensa no centro e embaixo
    float cx = 1.0 - pow(abs(uv.x * 2.0 - 1.0), 2.0);
    float g = mix(0.55, 1.0, cx) * mix(1.0, 0.7, uv.y);
    vec3 col = mix(warm, white, g) * (0.15 + 1.25 * u_light) * g;
    gl_FragColor = vec4(col * u_in, u_in);
  } else if (kind < 1.5) {
    // folhas da porta: superfícies escuras com a borda livre iluminada
    // folhas: recebem a luz que vem da abertura (mais forte na borda livre)
    float rim = smoothstep(0.7, 1.0, uv.x) * u_light;
    float wash = (0.12 + 0.28 * uv.x) * u_light * mix(1.0, 0.6, uv.y);
    float shade = mix(0.8, 1.0, uv.y);
    vec3 col = vec3(0.035, 0.07, 0.115) * shade + warm * (rim * 0.7 + wash);
    gl_FragColor = vec4(col * u_in, u_in);
  } else {
    // luz derramada no chão, à frente da passagem
    float across = 1.0 - pow(abs(uv.x * 2.0 - 1.0), 1.6);
    float a = across * pow(1.0 - uv.y, 1.6) * u_light * 0.85;
    gl_FragColor = vec4(mix(warm, white, 0.4) * a, 0.0);
  }
}
`;

/* ------------------------------------------------------------------ */
/* Telas cheias: raios de luz e "inundação" de luz do dia              */
/* ------------------------------------------------------------------ */

export const raysFragment = /* glsl */ `
precision mediump float;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_spread;
void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 d = frag - u_center;
  float r = length(d) / u_res.y;
  float ang = atan(d.y, d.x);
  float streaks = 0.5 + 0.5 * (0.5 + 0.5 * sin(ang * 11.0 + 0.7)) * (0.5 + 0.5 * sin(ang * 5.0 - 1.3));
  float fall = exp(-r * r * u_spread);
  float core = exp(-r * 9.0);
  float a = (fall * streaks * 0.55 + core * 0.6) * u_strength;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.62) * a, 0.0);
}
`;

export const overlayFragment = /* glsl */ `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a); }
`;

/* ------------------------------------------------------------------ */
/* Camada 2D: partículas dos símbolos, rede de conexões, estrelas      */
/* ------------------------------------------------------------------ */

const SCREEN = /* glsl */ `
uniform vec2 u_res;
uniform float u_dpr;
vec4 toClip(vec2 s) { return vec4(s.x / u_res.x * 2.0 - 1.0, 1.0 - s.y / u_res.y * 2.0, 0.0, 1.0); }
float easeIO(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5; }
`;

export const sparksVertex = /* glsl */ `
attribute vec2 a_start;
attribute vec3 a_glyph;
attribute vec3 a_logo;
attribute vec2 a_seed;
${SCREEN}
uniform vec4 u_doorRect;
uniform vec2 u_g0;
uniform vec2 u_g1;
uniform vec2 u_g2;
uniform vec2 u_g3;
uniform float u_gsize;
uniform vec3 u_logo;
uniform float u_m1;
uniform float u_m2;
uniform float u_alpha;
uniform float u_day;
uniform float u_size;
uniform float u_lift;
varying vec4 v_col;

void main() {
  vec2 start = u_doorRect.xy + a_start * u_doorRect.zw;
  float e1 = easeIO(clamp(u_m1 * 1.5 - a_seed.x * 0.5, 0.0, 1.0));
  float e2 = easeIO(clamp(u_m2 * 1.4 - a_seed.y * 0.4, 0.0, 1.0));
  vec2 gc = u_g0;
  if (a_glyph.z > 0.5) gc = u_g1;
  if (a_glyph.z > 1.5) gc = u_g2;
  if (a_glyph.z > 2.5) gc = u_g3;
  vec2 glyph = gc + a_glyph.xy * u_gsize;
  vec2 logo = u_logo.xy + a_logo.xy * u_logo.z;
  // saem da passagem em leque, como luz que se espalha
  float arc1 = sin(e1 * 3.14159265);
  vec2 s = mix(start, glyph, e1);
  vec2 away = normalize(glyph - start + vec2(0.001));
  s += vec2(-away.y, away.x) * arc1 * (a_seed.x - 0.5) * u_lift * 0.9;
  s.y -= arc1 * (0.15 + 0.5 * a_seed.y) * u_lift;
  float arc2 = sin(e2 * 3.14159265);
  vec2 s2 = mix(s, logo, e2);
  s2 += vec2(cos(a_seed.x * 6.2832), sin(a_seed.x * 6.2832)) * arc2 * (0.3 + 0.4 * a_seed.y) * u_lift;
  gl_Position = toClip(s2);
  float born = smoothstep(0.0, 0.08, e1);
  vec3 night = mix(vec3(1.0, 0.78, 0.52), vec3(1.0, 0.94, 0.86), smoothstep(0.5, 1.0, e1));
  night = mix(night, mix(vec3(1.0, 0.94, 0.86), vec3(1.0, 0.62, 0.32), a_logo.z), e2);
  vec3 ink = mix(vec3(0.035, 0.094, 0.153), vec3(0.949, 0.549, 0.271), a_logo.z);
  vec3 col = mix(night, ink, u_day);
  float a = born * u_alpha * (0.85 + 0.15 * a_seed.y);
  float size = mix(u_size * mix(1.0, 1.15, e1), max(u_logo.z * 0.07, 1.6), e2);
  gl_PointSize = a > 0.0 ? size * u_dpr : 0.0;
  v_col = vec4(col, a);
}
`;

/** Posição atual de um nó da rede: sai da passagem, ocupa seu lugar e converge para a marca. */
const NODE = /* glsl */ `
uniform vec2 u_door;
uniform vec3 u_logo;
uniform float u_nodes;
uniform float u_emerge;
uniform float u_converge;
vec2 nodePos(vec2 target, float order, float symbol, out float shown, out float gone) {
  float e = symbol > 0.5 ? easeIO(clamp(u_emerge * 1.2, 0.0, 1.0)) : easeIO(clamp(u_nodes * 1.6 - order * 0.6, 0.0, 1.0));
  shown = e;
  vec2 p = mix(u_door, target, e);
  float c = easeIO(clamp(u_converge * 1.35 - (1.0 - order) * 0.35, 0.0, 1.0));
  gone = c;
  return mix(p, u_logo.xy, c);
}
`;

export const edgesVertex = /* glsl */ `
attribute vec2 a_a;
attribute vec2 a_b;
/** (lado, extremidade, ordem do nó A, ordem do nó B) */
attribute vec4 a_meta;
/** (A é símbolo, B é símbolo, ordem de construção da aresta) */
attribute vec3 a_sym;
${SCREEN}
${NODE}
uniform float u_width;
varying float v_t;
varying float v_side;
varying float v_order;
varying float v_vis;
void main() {
  float shownA;
  float shownB;
  float goneA;
  float goneB;
  vec2 pa = nodePos(a_a, a_meta.z, a_sym.x, shownA, goneA);
  vec2 pb = nodePos(a_b, a_meta.w, a_sym.y, shownB, goneB);
  vec2 d = pb - pa;
  float len = length(d);
  d = len > 0.001 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  vec2 p = mix(pa, pb, a_meta.y) + n * a_meta.x * u_width * 0.5;
  gl_Position = toClip(p);
  v_t = a_meta.y;
  v_side = a_meta.x;
  v_order = a_sym.z;
  v_vis = min(shownA, shownB) * (1.0 - max(goneA, goneB));
}
`;

export const edgesFragment = /* glsl */ `
precision mediump float;
varying float v_t;
varying float v_side;
varying float v_order;
varying float v_vis;
uniform float u_edges;
uniform float u_alpha;
uniform float u_day;
uniform float u_add;
void main() {
  // cada conexão é construída em sequência conforme a rolagem avança
  float head = clamp((u_edges - v_order * 0.72) / 0.28, 0.0, 1.0);
  if (v_t > head) discard;
  float edge = 1.0 - smoothstep(0.2, 1.0, abs(v_side));
  float headGlow = exp(-pow((head - v_t) * 18.0, 2.0)) * (1.0 - step(0.999, head));
  vec3 night = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.95, 0.88), headGlow);
  vec3 col = mix(night, vec3(0.035, 0.094, 0.153), u_day);
  float a = edge * v_vis * u_alpha * (0.42 + headGlow * 0.9);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, a * (1.0 - u_add));
}
`;

export const nodesVertex = /* glsl */ `
attribute vec2 a_pos;
attribute vec2 a_meta;
${SCREEN}
${NODE}
uniform float u_alpha;
uniform float u_day;
varying vec4 v_col;
void main() {
  float shown;
  float gone;
  vec2 p = nodePos(a_pos, a_meta.x, a_meta.y, shown, gone);
  gl_Position = toClip(p);
  float a = shown * (1.0 - gone) * u_alpha * (a_meta.y > 0.5 ? 0.0 : 1.0);
  gl_PointSize = a > 0.0 ? 7.0 * u_dpr : 0.0;
  v_col = vec4(mix(vec3(1.0, 0.86, 0.66), vec3(0.035, 0.094, 0.153), u_day), a);
}
`;

export const dustVertex = /* glsl */ `
attribute vec4 a_data;
${SCREEN}
uniform float u_alpha;
uniform float u_shift;
varying vec4 v_col;
void main() {
  vec2 uv = vec2(a_data.x, fract(a_data.y + u_shift * (0.2 + a_data.z * 0.6)));
  gl_Position = toClip(uv * u_res);
  float a = u_alpha * (0.12 + 0.4 * a_data.w) * (0.4 + 0.6 * a_data.z);
  gl_PointSize = (1.0 + a_data.w * 1.5) * u_dpr;
  v_col = vec4(0.85, 0.9, 1.0, a);
}
`;
