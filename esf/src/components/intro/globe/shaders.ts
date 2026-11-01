/**
 * Shaders GLSL ES 1.0 (WebGL 1) — funcionam em praticamente todos os navegadores.
 * Todas as posições são calculadas em pixels CSS e convertidas para clip space no vertex shader.
 */

const PROJECT = /* glsl */ `
uniform mat3 u_rot;
uniform vec2 u_center;
uniform float u_radius;
uniform vec2 u_res;
uniform float u_dpr;

vec2 projectSphere(vec3 p) {
  return u_center + vec2(p.x, -p.y) * u_radius;
}
vec4 toClip(vec2 s) {
  return vec4(s.x / u_res.x * 2.0 - 1.0, 1.0 - s.y / u_res.y * 2.0, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Céu + esfera (tela cheia)                                           */
/* ------------------------------------------------------------------ */

export const backgroundVertex = /* glsl */ `
attribute vec2 a_xy;
void main() { gl_Position = vec4(a_xy, 0.0, 1.0); }
`;

export const backgroundFragment = (derivatives: boolean) => /* glsl */ `
${derivatives ? "#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES 1" : ""}
precision highp float;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec2 u_center;
uniform float u_radius;
uniform mat3 u_rotInv;
uniform float u_globe;
uniform float u_warm;
uniform float u_day;
uniform float u_grat;
uniform vec3 u_rim;
uniform vec3 u_light;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float gridLine(float v, float stepRad) {
  float f = v / stepRad;
  float d = abs(fract(f + 0.5) - 0.5);
#ifdef HAS_DERIVATIVES
  float w = fwidth(f) * 1.25;
#else
  float w = 0.035;
#endif
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 uv = frag / u_res;
  float aspect = u_res.x / u_res.y;

  // --- noite: azul-marinho profundo com uma piscina de luz em torno do globo
  vec3 deep = vec3(0.012, 0.035, 0.066);
  vec3 navy = vec3(0.043, 0.106, 0.169);
  float pool = exp(-pow(distance(frag, u_center) / (u_radius * 2.2 + 1.0), 2.0));
  vec3 col = mix(deep, navy, pool);
  vec2 vv = (uv - 0.5) * vec2(aspect, 1.0);
  col *= 1.0 - 0.32 * dot(vv, vv);

  // --- amanhecer: luz quente nascendo atrás do horizonte do globo
  vec2 top = vec2(u_center.x, u_center.y - u_radius);
  float dTop = distance(frag, top) / u_res.y;
  vec3 ember = vec3(0.949, 0.549, 0.271);
  vec3 dusk = vec3(0.32, 0.13, 0.10);
  vec3 warmLight = ember * exp(-dTop * 3.4) * 0.55 + dusk * exp(-dTop * 1.15) * 0.55;
  col += warmLight * u_warm;
  col = mix(col, col * vec3(1.06, 0.97, 0.9), u_warm * 0.6);

  // --- globo
  vec2 d = (frag - u_center) / u_radius;
  float r = length(d);
  float px = 1.0 / u_radius;
  float inside = 1.0 - smoothstep(1.0 - 1.3 * px, 1.0 + 1.3 * px, r);

  float halo = exp(-max(r - 1.0, 0.0) * mix(8.0, 5.0, u_warm)) * (1.0 - inside);
  float topBias = mix(1.0, smoothstep(0.75, -0.95, d.y) * 1.6, u_warm);
  col += u_rim * halo * mix(0.26, 0.55, u_warm) * topBias * u_globe;

  if (r < 1.0 + 2.0 * px) {
    float rr = min(r, 1.0);
    vec3 n = vec3(d.x, -d.y, sqrt(max(0.0, 1.0 - rr * rr)));
    float diff = max(dot(n, u_light), 0.0);
    float fres = pow(1.0 - n.z, 3.0);
    vec3 ocean = mix(vec3(0.018, 0.047, 0.086), vec3(0.06, 0.13, 0.195), diff);
    ocean += u_rim * fres * mix(0.42, 0.85, u_warm) * (0.55 + 0.45 * diff);
    vec3 w = u_rotInv * n;
    float lat = asin(clamp(w.y, -1.0, 1.0));
    float lon = atan(w.x, w.z);
    float step = 0.2617994;
    float g = max(gridLine(lat, step), gridLine(lon, step) * smoothstep(0.985, 0.9, abs(w.y)));
    ocean += vec3(0.55, 0.72, 0.82) * g * u_grat * smoothstep(0.0, 0.4, n.z);
    col = mix(col, ocean, inside * u_globe);
  }

  // --- dia: a luz do amanhecer "inunda" o quadro (sem passar por um cinza intermediário)
  //     e assenta no papel quente da identidade principal
  float bloom = sin(u_day * 3.14159);
  col = mix(col, vec3(1.0, 0.82, 0.64), bloom * 0.55);
  col = mix(col, vec3(0.969, 0.961, 0.941), smoothstep(0.0, 1.0, u_day));

  // --- grão de filme
  float grain = hash(floor(gl_FragCoord.xy) + floor(u_time * 24.0) * 17.0) - 0.5;
  col += grain * mix(0.03, 0.012, u_day);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Pontos de terra                                                     */
/* ------------------------------------------------------------------ */

export const dotsVertex = /* glsl */ `
attribute vec3 a_pos;
attribute vec3 a_info;
${PROJECT}
uniform float u_size;
uniform float u_alpha;
uniform float u_time;
uniform float u_wave;
uniform float u_brWarm;
uniform float u_warm;
uniform vec3 u_light;
varying vec4 v_col;

void main() {
  vec3 p = u_rot * a_pos;
  gl_Position = toClip(projectSphere(p));
  float vis = smoothstep(0.0, 0.2, p.z);
  float lit = 0.45 + 0.55 * clamp(dot(p, u_light) * 0.85 + 0.35, 0.0, 1.0);
  float twinkle = 0.86 + 0.14 * sin(u_time * 1.6 + a_info.x * 61.0);

  float br = a_info.y * u_brWarm;
  float inside = smoothstep(u_wave, u_wave - 0.07, a_info.z);
  float front = exp(-pow((a_info.z - u_wave) * 24.0, 2.0)) * step(0.01, u_wave);
  float heat = br * max(inside, front);

  vec3 cool = vec3(0.80, 0.86, 0.91);
  vec3 base = mix(cool, vec3(1.0, 0.88, 0.76), u_warm * 0.55);
  vec3 col = mix(base, vec3(0.98, 0.56, 0.26), heat);
  col += vec3(1.0, 0.82, 0.62) * front * br * 0.7;

  float a = vis * lit * twinkle * u_alpha * (0.6 + 0.4 * heat);
  float size = u_size * (0.55 + 0.45 * p.z) * (1.0 + 0.35 * heat + 0.6 * front * br);
  gl_PointSize = p.z > 0.0 ? max(size * u_dpr, 1.0) : 0.0;
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
/* Arcos de conexão                                                    */
/* ------------------------------------------------------------------ */

export const arcsVertex = /* glsl */ `
attribute vec3 a_a;
attribute vec3 a_b;
attribute vec4 a_meta;
${PROJECT}
uniform float u_width;
varying float v_t;
varying float v_side;
varying float v_seed;
varying float v_vis;

void main() {
  vec3 pa = u_rot * a_a;
  vec3 pb = u_rot * a_b;
  vec2 sa = projectSphere(pa);
  vec2 sb = projectSphere(pb);
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec3 p = mix(pa, pb, a_meta.z);
  vec2 s = mix(sa, sb, a_meta.z) + nrm * a_meta.y * u_width * 0.5;
  gl_Position = toClip(s);
  float behind = (1.0 - smoothstep(-0.05, 0.05, p.z)) * (1.0 - smoothstep(0.985, 1.03, length(p.xy)));
  v_vis = 1.0 - behind;
  v_t = a_meta.x;
  v_side = a_meta.y;
  v_seed = a_meta.w;
}
`;

export const arcsFragment = /* glsl */ `
precision mediump float;
varying float v_t;
varying float v_side;
varying float v_seed;
varying float v_vis;
uniform float u_progress;
uniform float u_alpha;
uniform float u_time;
uniform vec3 u_color;
uniform vec3 u_headColor;

void main() {
  float head = clamp((u_progress - v_seed * 0.6) / 0.4, 0.0, 1.0);
  if (v_t > head) discard;
  float done = step(0.999, head);
  float edge = 1.0 - smoothstep(0.2, 1.0, abs(v_side));
  float ends = smoothstep(0.0, 0.06, v_t) * smoothstep(1.0, 0.94, v_t);
  float travel = fract(u_time * 0.11 + v_seed * 3.7) * 1.5 - 0.25;
  float pulse = exp(-pow((travel - v_t) * 8.0, 2.0)) * done;
  float headGlow = exp(-pow((head - v_t) * 30.0, 2.0)) * (1.0 - done);
  float a = u_alpha * v_vis * edge * (0.32 + 0.5 * ends + 0.9 * pulse + 1.3 * headGlow);
  vec3 col = mix(u_color, u_headColor, clamp(pulse + headGlow, 0.0, 1.0));
  gl_FragColor = vec4(col * a, 0.0);
}
`;

export const nodesVertex = /* glsl */ `
attribute vec3 a_pos;
attribute vec2 a_meta;
${PROJECT}
uniform float u_progress;
uniform float u_alpha;
uniform float u_time;
uniform float u_size;
varying vec4 v_col;

void main() {
  vec3 p = u_rot * a_pos;
  gl_Position = toClip(projectSphere(p));
  float head = clamp((u_progress - a_meta.x * 0.6) / 0.4, 0.0, 1.0);
  float on = a_meta.y < 0.5 ? smoothstep(0.0, 0.08, head) : smoothstep(0.92, 1.0, head);
  float vis = smoothstep(0.0, 0.2, p.z);
  float pulse = 0.7 + 0.3 * sin(u_time * 2.0 + a_meta.x * 20.0);
  float a = on * vis * u_alpha * pulse;
  gl_PointSize = (p.z > 0.0 && a > 0.0) ? u_size * u_dpr : 0.0;
  v_col = vec4(0.62, 0.92, 0.9, a);
}
`;

/* ------------------------------------------------------------------ */
/* Partículas de transformação (símbolos → marca)                      */
/* ------------------------------------------------------------------ */

export const sparksVertex = /* glsl */ `
attribute vec3 a_start;
attribute vec3 a_glyph;
attribute vec3 a_logo;
attribute vec2 a_seed;
${PROJECT}
uniform vec2 u_g0;
uniform vec2 u_g1;
uniform vec2 u_g2;
uniform vec2 u_g3;
uniform float u_gsize;
uniform vec3 u_logo;
uniform float u_m1;
uniform float u_m2;
uniform float u_alpha;
uniform float u_time;
uniform float u_day;
uniform float u_size;
uniform float u_lift;
varying vec4 v_col;

float ease(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
}

void main() {
  vec3 p = u_rot * a_start;
  vec2 sGlobe = projectSphere(p);
  float e1 = ease(clamp(u_m1 * 1.5 - a_seed.x * 0.5, 0.0, 1.0));
  float e2 = ease(clamp(u_m2 * 1.4 - a_seed.y * 0.4, 0.0, 1.0));

  vec2 gc = u_g0;
  if (a_glyph.z > 0.5) gc = u_g1;
  if (a_glyph.z > 1.5) gc = u_g2;
  if (a_glyph.z > 2.5) gc = u_g3;

  float life = 1.0 - e2;
  vec2 wob = vec2(sin(u_time * 0.8 + a_seed.x * 40.0), cos(u_time * 0.7 + a_seed.y * 40.0)) * 1.3 * life;
  vec2 sGlyph = gc + a_glyph.xy * u_gsize + wob;
  vec2 sLogo = u_logo.xy + a_logo.xy * u_logo.z;

  float arc1 = sin(e1 * 3.14159);
  vec2 s = mix(sGlobe, sGlyph, e1);
  s.y -= arc1 * (0.4 + 0.9 * a_seed.y) * u_lift;
  s.x += arc1 * (a_seed.x - 0.5) * u_lift * 1.4;

  float arc2 = sin(e2 * 3.14159);
  vec2 s2 = mix(s, sLogo, e2);
  s2 += vec2(cos(a_seed.x * 6.2832), sin(a_seed.x * 6.2832)) * arc2 * (0.35 + 0.5 * a_seed.y) * u_lift;
  gl_Position = toClip(s2);

  float born = smoothstep(0.0, 0.1, e1) * mix(smoothstep(0.0, 0.25, p.z), 1.0, smoothstep(0.0, 0.3, e1));
  float twinkle = 0.78 + 0.22 * sin(u_time * 2.3 + a_seed.y * 50.0) * life;

  vec3 ember = vec3(1.0, 0.66, 0.38);
  vec3 glowWhite = vec3(1.0, 0.92, 0.82);
  vec3 night = mix(ember, glowWhite, smoothstep(0.55, 1.0, e1) * 0.75);
  night = mix(night, mix(glowWhite, ember, a_logo.z), e2);
  vec3 ink = mix(vec3(0.035, 0.094, 0.153), vec3(0.949, 0.549, 0.271), a_logo.z);
  vec3 col = mix(night, ink, u_day);

  float a = born * twinkle * u_alpha;
  float size = mix(u_size * mix(1.0, 1.15, e1), max(u_logo.z * 0.07, 1.6), e2);
  gl_PointSize = a > 0.0 ? size * u_dpr : 0.0;
  v_col = vec4(col, a);
}
`;

/* ------------------------------------------------------------------ */
/* Poeira                                                              */
/* ------------------------------------------------------------------ */

export const dustVertex = /* glsl */ `
attribute vec4 a_data;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_alpha;
uniform float u_time;
uniform float u_shift;
varying vec4 v_col;
void main() {
  vec2 uv = vec2(a_data.x, fract(a_data.y - u_shift * (0.2 + a_data.z * 0.6)));
  vec2 s = uv * u_res;
  gl_Position = vec4(s.x / u_res.x * 2.0 - 1.0, 1.0 - s.y / u_res.y * 2.0, 0.0, 1.0);
  float tw = 0.5 + 0.5 * sin(u_time * (0.6 + a_data.w) + a_data.z * 40.0);
  float a = u_alpha * (0.15 + 0.35 * tw) * (0.4 + 0.6 * a_data.z);
  gl_PointSize = (1.0 + a_data.w * 1.6) * u_dpr;
  v_col = vec4(0.85, 0.9, 1.0, a);
}
`;
