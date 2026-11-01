import {
  backgroundFragment,
  doorFragment,
  doorVertex,
  dotsVertex,
  dustVertex,
  edgesFragment,
  edgesVertex,
  fullscreenVertex,
  linesFragment,
  linesVertex,
  nodesVertex,
  overlayFragment,
  pointFragment,
  raysFragment,
  ribbonFragment,
  ribbonVertex,
  sparksVertex,
} from "./shaders";
import { buildBorders, buildDoorFrame, buildDots, buildDust, buildHeroRibbon, buildLinks, buildSparks } from "./data";
import { cameraAt, DOOR_H, DOOR_W, DOOR_Z, easeOut, sceneAt, seg, T, type Layout, type SceneParams } from "./scene";
import { cameraFrame, project, type CameraFrame, type Vec3 } from "./math";
import { yieldToMain } from "@/lib/yield";

export interface GlobeOptions {
  /** perfil leve para celulares e telas pequenas */
  lite: boolean;
  /** renderização por software (sem GPU): resolução interna reduzida */
  economy?: boolean;
  onContextLost?: () => void;
}

export interface FrameInfo {
  params: SceneParams;
  /** Brasília projetada (px CSS) — origem do caminho de luz */
  marker: { x: number; y: number; visible: boolean };
}

export type WebGLSupport = "hardware" | "software" | "none";

/**
 * Verifica se há WebGL acelerado por GPU. `failIfMajorPerformanceCaveat` faz o navegador
 * recusar o contexto quando ele seria emulado em software (ex.: sem GPU, GPU bloqueada).
 */
export function probeWebGL(): WebGLSupport {
  const base: WebGLContextAttributes = { depth: false, stencil: false, antialias: false };
  const open = (attrs: WebGLContextAttributes) => document.createElement("canvas").getContext("webgl", attrs);
  const release = (gl: WebGLRenderingContext | null) => gl?.getExtension("WEBGL_lose_context")?.loseContext();
  try {
    const gl = open({ ...base, failIfMajorPerformanceCaveat: true });
    if (gl) {
      // Alguns navegadores não sinalizam a emulação (ex.: SwiftShader sobre Vulkan): conferimos o renderizador.
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      release(gl);
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) ? "software" : "hardware";
    }
    const soft = open(base);
    release(soft);
    if (soft) return "software";
  } catch {
    // segue para "none"
  }
  return "none";
}

type GL = WebGLRenderingContext;
type UniformValue = number | readonly number[] | Float32Array;

interface Program {
  program: WebGLProgram;
  attribs: Map<string, number>;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface Attr {
  name: string;
  size: number;
  offset: number;
}

interface Mesh {
  buffer: WebGLBuffer;
  stride: number;
  attrs: Attr[];
  count: number;
}

function compile(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader falhou");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

interface PendingProgram {
  program: WebGLProgram;
  shaders: WebGLShader[];
}

/** Inicia compilação e link sem consultar o status (que bloquearia a thread principal). */
function startProgram(gl: GL, vs: string, fs: string): PendingProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram falhou");
  const shaders = [compile(gl, gl.VERTEX_SHADER, vs), compile(gl, gl.FRAGMENT_SHADER, fs)];
  for (const sh of shaders) gl.attachShader(program, sh);
  gl.linkProgram(program);
  return { program, shaders };
}

/** Aguarda a compilação; com KHR_parallel_shader_compile, apenas consulta se terminou. */
async function finishPrograms(gl: GL, pending: PendingProgram[], cancelled: () => boolean): Promise<Program[] | null> {
  const ext = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  if (ext) {
    const deadline = performance.now() + 8000;
    while (!pending.every((p) => gl.getProgramParameter(p.program, ext.COMPLETION_STATUS_KHR))) {
      if (cancelled() || performance.now() > deadline) break;
      await yieldToMain(24);
    }
  }
  if (cancelled()) return null;
  return pending.map((p) => {
    if (!gl.getProgramParameter(p.program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const logs = [gl.getProgramInfoLog(p.program), ...p.shaders.map((sh) => gl.getShaderInfoLog(sh))].filter(Boolean);
      throw new Error(`Programa WebGL: ${logs.join(" | ") || "erro desconhecido"}`);
    }
    for (const sh of p.shaders) gl.deleteShader(sh);
    return { program: p.program, attribs: new Map(), uniforms: new Map() };
  });
}

function mesh(gl: GL, data: Float32Array, attrs: [string, number][], usage?: number): Mesh {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("createBuffer falhou");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage ?? gl.STATIC_DRAW);
  let offset = 0;
  const list: Attr[] = attrs.map(([name, size]) => {
    const a = { name, size, offset };
    offset += size * 4;
    return a;
  });
  return { buffer, stride: offset, attrs: list, count: data.length / (offset / 4) };
}

/** Intercala vários arrays por vértice num único buffer. */
function interleave(count: number, parts: [Float32Array, number][]): Float32Array {
  const stride = parts.reduce((s, [, n]) => s + n, 0);
  const out = new Float32Array(count * stride);
  for (let i = 0; i < count; i++) {
    let o = i * stride;
    for (const [arr, n] of parts) {
      for (let k = 0; k < n; k++) out[o + k] = arr[i * n + k];
      o += n;
    }
  }
  return out;
}

/** Matriz (linha-maior) que leva (lat, lon) do mundo para o referencial de vista: Rx(lat0)·Ry(−lon0). */
function viewRotation(lat0Deg: number, lon0Deg: number): number[] {
  const d = Math.PI / 180;
  const cy = Math.cos(-lon0Deg * d);
  const sy = Math.sin(-lon0Deg * d);
  const cx = Math.cos(lat0Deg * d);
  const sx = Math.sin(lat0Deg * d);
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = rx[r * 3] * ry[c] + rx[r * 3 + 1] * ry[3 + c] + rx[r * 3 + 2] * ry[6 + c];
  return o;
}

const LIGHT = (() => {
  const v = [-0.5, 0.72, -0.48];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

const PROGRAM_NAMES = ["bg", "dots", "lines", "ribbon", "door", "rays", "overlay", "sparks", "edges", "nodes", "dust"] as const;
type ProgramName = (typeof PROGRAM_NAMES)[number];

export class GlobeRenderer {
  private gl: GL;
  private canvas: HTMLCanvasElement;
  private options: GlobeOptions;
  private lite: boolean;
  private enabled = new Set<number>();
  private lost = false;
  private layout: Layout | null = null;
  private dpr = 1;
  private programs: Record<ProgramName, Program>;
  private meshes: Record<string, Mesh>;
  private doorData = new Float32Array(24 * 6);

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.options.onContextLost?.();
  };

  /**
   * Criação em etapas, cedendo a thread principal entre elas:
   * contexto → shaders (em paralelo) → geometria → buffers → espera da compilação.
   */
  static async create(
    canvas: HTMLCanvasElement,
    options: GlobeOptions,
    cancelled: () => boolean = () => false,
  ): Promise<GlobeRenderer | null> {
    try {
      const gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: options.lite ? "low-power" : "high-performance",
      });
      if (!gl) return null;
      const derivatives = !!gl.getExtension("OES_standard_derivatives");
      const sources: Record<ProgramName, [string, string]> = {
        bg: [fullscreenVertex, backgroundFragment(derivatives)],
        dots: [dotsVertex, pointFragment],
        lines: [linesVertex, linesFragment],
        ribbon: [ribbonVertex, ribbonFragment],
        door: [doorVertex, doorFragment],
        rays: [fullscreenVertex, raysFragment],
        overlay: [fullscreenVertex, overlayFragment],
        sparks: [sparksVertex, pointFragment],
        edges: [edgesVertex, edgesFragment],
        nodes: [nodesVertex, pointFragment],
        dust: [dustVertex, pointFragment],
      };
      const pending = PROGRAM_NAMES.map((name) => startProgram(gl, sources[name][0], sources[name][1]));

      // --- geometria (JavaScript puro), em etapas curtas
      const step = options.lite ? 1.15 : 0.78;
      await yieldToMain();
      if (cancelled()) return null;
      const dots = buildDots(step);
      await yieldToMain();
      if (cancelled()) return null;
      const borders = buildBorders();
      const links = buildLinks(dots, options.lite ? 14 : 24, options.lite ? 26 : 36);
      const sparks = buildSparks(options.lite ? 260 : 440);
      await yieldToMain();
      if (cancelled()) return null;

      const lineAttrs: [string, number][] = [
        ["a_a", 3],
        ["a_b", 3],
        ["a_meta", 4],
      ];
      const meshes: Record<string, Mesh> = {
        quad: mesh(gl, new Float32Array([-1, -1, 3, -1, -1, 3]), [["a_xy", 2]]),
        dots: mesh(gl, interleave(dots.count, [[dots.ll, 2], [dots.floor, 2], [dots.info, 2]]), [
          ["a_ll", 2],
          ["a_floor", 2],
          ["a_info", 2],
        ]),
        borders: mesh(gl, borders, lineAttrs),
        links: mesh(gl, links, lineAttrs),
        frame: mesh(gl, buildDoorFrame(), lineAttrs),
        ribbon: mesh(gl, buildHeroRibbon(options.lite ? 160 : 240), [
          ["a_c", 3],
          ["a_n", 3],
          ["a_uv", 2],
        ]),
        door: mesh(gl, new Float32Array(24 * 6), [
          ["a_pos", 3],
          ["a_uvk", 3],
        ], gl.DYNAMIC_DRAW),
        sparks: mesh(
          gl,
          interleave(sparks.count, [
            [sparks.start, 2],
            [sparks.glyph, 3],
            [sparks.logo, 3],
            [sparks.seed, 2],
          ]),
          [
            ["a_start", 2],
            ["a_glyph", 3],
            ["a_logo", 3],
            ["a_seed", 2],
          ],
        ),
        dust: mesh(gl, buildDust(options.lite ? 90 : 200), [["a_data", 4]]),
      };

      const list = await finishPrograms(gl, pending, cancelled);
      if (!list) return null;
      const programs = Object.fromEntries(PROGRAM_NAMES.map((n, i) => [n, list[i]])) as Record<ProgramName, Program>;
      return new GlobeRenderer(canvas, gl, options, programs, meshes);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.warn("[ESF] WebGL indisponível:", error);
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: GL,
    options: GlobeOptions,
    programs: Record<ProgramName, Program>,
    meshes: Record<string, Mesh>,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.options = options;
    this.lite = options.lite;
    this.programs = programs;
    this.meshes = meshes;
    gl.disable(gl.CULL_FACE);
    gl.depthFunc(gl.LEQUAL);
    canvas.addEventListener("webglcontextlost", this.onLost, false);
  }

  get isLost() {
    return this.lost || this.gl.isContextLost();
  }

  resize(width: number, height: number, devicePixelRatio: number) {
    const maxPixels = this.options.economy ? 0.6e6 : this.lite ? 1.6e6 : 4.4e6;
    let dpr = Math.min(devicePixelRatio || 1, this.lite ? 1.75 : 2);
    if (width * height * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / (width * height));
    this.dpr = this.options.economy ? Math.max(0.5, Math.min(dpr, 0.85)) : Math.max(1, dpr);
    const w = Math.max(1, Math.round(width * this.dpr));
    const h = Math.max(1, Math.round(height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  /** Recebe o layout de tela e reconstrói a rede (nós e arestas). */
  setLayout(layout: Layout) {
    this.layout = layout;
    const gl = this.gl;
    for (const key of ["nodes", "edges"]) if (this.meshes[key]) gl.deleteBuffer(this.meshes[key].buffer);
    const nodes: number[] = [];
    for (const n of layout.nodes) nodes.push(n.x, n.y, n.order, n.symbol ? 1 : 0);
    this.meshes.nodes = mesh(gl, new Float32Array(nodes), [
      ["a_pos", 2],
      ["a_meta", 2],
    ]);
    const edges: number[] = [];
    const corners: [number, number][] = [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [-1, 1],
      [1, 0],
      [1, 1],
    ];
    for (const e of layout.edges) {
      const A = layout.nodes[e.a];
      const B = layout.nodes[e.b];
      for (const [side, end] of corners)
        edges.push(A.x, A.y, B.x, B.y, side, end, A.order, B.order, A.symbol ? 1 : 0, B.symbol ? 1 : 0, e.order);
    }
    this.meshes.edges = mesh(gl, new Float32Array(edges), [
      ["a_a", 2],
      ["a_b", 2],
      ["a_meta", 4],
      ["a_sym", 3],
    ]);
  }

  private use(name: ProgramName, m: Mesh) {
    const gl = this.gl;
    const p = this.programs[name];
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
    const needed = new Set<number>();
    for (const a of m.attrs) {
      let loc = p.attribs.get(a.name);
      if (loc === undefined) {
        loc = gl.getAttribLocation(p.program, a.name);
        p.attribs.set(a.name, loc);
      }
      if (loc < 0) continue;
      needed.add(loc);
      if (!this.enabled.has(loc)) gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, m.stride, a.offset);
    }
    for (const loc of this.enabled) if (!needed.has(loc)) gl.disableVertexAttribArray(loc);
    this.enabled = needed;
    return p;
  }

  private set(p: Program, values: Record<string, UniformValue>) {
    const gl = this.gl;
    for (const name in values) {
      let loc = p.uniforms.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(p.program, name);
        p.uniforms.set(name, loc);
      }
      if (loc === null) continue;
      const v = values[name];
      if (typeof v === "number") gl.uniform1f(loc, v);
      else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v as Float32Array);
      else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v as Float32Array);
      else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
    }
  }

  /** Geometria dinâmica da passagem: folhas (abrem em direção ao visitante), abertura e luz no chão. */
  private updateDoor(open: number, light: number) {
    const d = this.doorData;
    let o = 0;
    const v = (x: number, y: number, z: number, u: number, w: number, k: number) => {
      d.set([x, y, z, u, w, k], o);
      o += 6;
    };
    const half = DOOR_W / 2;
    const leaf = half * 0.985;
    const z = -DOOR_Z;
    const theta = open * 74 * (Math.PI / 180);
    // folhas (dobradiças nos batentes)
    for (const side of [-1, 1]) {
      const hx = side * half;
      const fx = hx - side * leaf * Math.cos(theta);
      const fz = z + leaf * Math.sin(theta);
      v(hx, 0, z, 0, 0, 1);
      v(hx, DOOR_H, z, 0, 1, 1);
      v(fx, 0, fz, 1, 0, 1);
      v(fx, 0, fz, 1, 0, 1);
      v(hx, DOOR_H, z, 0, 1, 1);
      v(fx, DOOR_H, fz, 1, 1, 1);
    }
    // abertura luminosa (logo atrás do plano da porta)
    const lz = z - 0.004;
    v(-half, 0, lz, 0, 0, 0);
    v(-half, DOOR_H, lz, 0, 1, 0);
    v(half, 0, lz, 1, 0, 0);
    v(half, 0, lz, 1, 0, 0);
    v(-half, DOOR_H, lz, 0, 1, 0);
    v(half, DOOR_H, lz, 1, 1, 0);
    // luz derramada no chão, que se alarga com a abertura
    const gap = half * (1 - Math.cos(theta)) + 0.01;
    const len = 0.6 + 2.6 * light;
    const y = 0.006;
    v(-gap, y, z + 0.01, 0, 0, 2);
    v(gap, y, z + 0.01, 1, 0, 2);
    v(-gap * 2.6 - 0.25, y, z + len, 0, 1, 2);
    v(-gap * 2.6 - 0.25, y, z + len, 0, 1, 2);
    v(gap, y, z + 0.01, 1, 0, 2);
    v(gap * 2.6 + 0.25, y, z + len, 1, 1, 2);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshes.door.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
  }

  render(progress: number): FrameInfo | null {
    const L = this.layout;
    if (!L || this.isLost) return null;
    const gl = this.gl;
    const s = sceneAt(progress);
    const cam = cameraFrame(cameraAt(progress, L), L.w, L.h);
    const m = viewRotation(s.lat0, s.lon0);
    const rot = new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
    const rotInv = new Float32Array(m);
    const deg = Math.PI / 180;
    const res = [L.w, L.h];
    const camU = { u_viewProj: cam.viewProj, u_res: res, u_dpr: this.dpr, u_eye: cam.eye, u_focal: cam.focalPx };
    const morphU = { u_rot: rot, u_lat0: s.lat0 * deg, u_lon0: s.lon0 * deg, u_morph: s.morph };

    const doorCenter = project(cam, [0, DOOR_H * 0.45, -DOOR_Z], L.w, L.h);
    const doorRect = this.doorRect(cam, L);

    gl.depthMask(true);
    gl.clearColor(0.969, 0.961, 0.941, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Quando a luz do dia cobre tudo, só a camada 2D importa.
    if (s.day < 0.999) {
      // 1 — espaço, planeta e mapa/chão
      let p = this.use("bg", this.meshes.quad);
      this.set(p, {
        u_res: res,
        u_dpr: this.dpr,
        u_eye: cam.eye,
        u_right: cam.right,
        u_up: cam.up,
        u_fwd: cam.forward,
        u_tanHalf: cam.tanHalf,
        u_aspect: cam.aspect,
        u_rotInv: rotInv,
        u_lat0: s.lat0 * deg,
        u_lon0: s.lon0 * deg,
        u_sphere: s.sphere,
        u_plane: s.plane,
        u_floor: s.floor,
        u_dawn: s.dawn,
        u_doorLight: s.doorLight,
        u_rim: [0.33, 0.66, 0.68],
        u_light: LIGHT,
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // 2 — estrelas
      if (s.dust > 0.01) {
        p = this.use("dust", this.meshes.dust);
        this.set(p, { u_res: res, u_dpr: this.dpr, u_alpha: s.dust, u_shift: progress * 0.4, u_add: 1, u_soft: 0.6 });
        gl.drawArrays(gl.POINTS, 0, this.meshes.dust.count);
      }

      gl.enable(gl.DEPTH_TEST);

      // 3 — passagem: as folhas escrevem profundidade (ocultam o que está atrás delas)
      if (s.doorIn > 0.001) {
        this.updateDoor(s.doorOpen, s.doorLight);
        p = this.use("door", this.meshes.door);
        this.set(p, { u_viewProj: cam.viewProj, u_light: s.doorLight, u_in: s.doorIn });
        gl.depthMask(true);
        gl.drawArrays(gl.TRIANGLES, 0, 12);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 12, 12);
      }
      gl.depthMask(false);

      // 4 — fronteiras: surgem como linhas luminosas e depois se dissolvem
      if (s.bordersIn > 0 && s.dissolve < 1) {
        p = this.use("lines", this.meshes.borders);
        this.set(p, {
          ...camU,
          ...morphU,
          u_mode: 0,
          u_kind: 0,
          u_width: this.lite ? 1.5 : 1.8,
          u_reveal: s.bordersIn,
          u_dissolve: s.dissolve,
          u_alpha: 1,
          u_color: [0.5, 1.0, 0.96],
          u_hot: [1.0, 0.66, 0.38],
        });
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.borders.count);
      }

      // 5 — conexões que atravessam o mapa
      if (s.links > 0 && s.linksAlpha > 0.01) {
        p = this.use("lines", this.meshes.links);
        this.set(p, {
          ...camU,
          ...morphU,
          u_mode: 1,
          u_kind: 1,
          u_width: this.lite ? 1.4 : 1.6,
          u_reveal: s.links,
          u_dissolve: 0,
          u_alpha: s.linksAlpha * 0.9,
          u_color: [1.0, 0.7, 0.42],
          u_hot: [1.0, 0.95, 0.86],
        });
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.links.count);
      }

      // 6 — pontos de terra (planeta → mapa → campo de luz)
      p = this.use("dots", this.meshes.dots);
      this.set(p, {
        ...camU,
        ...morphU,
        u_alpha: 1,
        u_floor: s.floor,
        u_sizeSphere: this.lite ? 0.0095 : 0.0064,
        u_sizeFloor: this.lite ? 0.015 : 0.011,
        u_doorLight: s.doorLight,
        u_dawn: s.dawn,
        u_add: 1,
        u_soft: 0,
      });
      gl.drawArrays(gl.POINTS, 0, this.meshes.dots.count);

      // 7 — o caminho de luz que a câmera acompanha
      if (s.hero > 0 && s.heroAlpha > 0.01) {
        p = this.use("ribbon", this.meshes.ribbon);
        this.set(p, {
          u_viewProj: cam.viewProj,
          u_width: 0.008 + 0.034 * seg(progress, T.follow),
          u_head: easeOut(s.hero),
          u_alpha: s.heroAlpha,
        });
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.ribbon.count);
      }

      // 8 — moldura da passagem
      if (s.doorIn > 0.001) {
        p = this.use("lines", this.meshes.frame);
        this.set(p, {
          ...camU,
          ...morphU,
          u_mode: 1,
          u_kind: 1,
          u_width: this.lite ? 1.6 : 2,
          u_reveal: 1,
          u_dissolve: 0,
          u_alpha: s.doorIn * (0.5 + 0.5 * s.doorLight),
          u_color: [1.0, 0.8, 0.58],
          u_hot: [1.0, 0.9, 0.8],
        });
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.frame.count);
      }

      gl.disable(gl.DEPTH_TEST);

      // 9 — raios de luz atravessando a passagem
      if (s.rays > 0.01 && doorCenter.w > 0) {
        p = this.use("rays", this.meshes.quad);
        this.set(p, { u_res: res, u_dpr: this.dpr, u_center: [doorCenter.x, doorCenter.y], u_strength: s.rays * 0.85, u_spread: 7 });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // 10 — atravessando a luz: o quadro é inundado de luz e assenta no papel da identidade
    if (s.day > 0.001 && s.day < 0.999) {
      const p = this.use("overlay", this.meshes.quad);
      const bloom = Math.sin(s.day * Math.PI) * 0.35;
      const t = Math.min(1, Math.max(0, (s.day - 0.3) / 0.7));
      const mixC = (a: number, b: number) => a + (b - a) * t;
      this.set(p, { u_color: [mixC(1.0, 0.969), mixC(0.86, 0.961), mixC(0.7, 0.941), Math.min(1, s.day + bloom)] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 11 — rede de conexões e símbolos (camada 2D): passam a tinta escura quando a luz inunda o quadro
    const add = 1 - s.ink;
    const netU = {
      u_res: res,
      u_dpr: this.dpr,
      u_door: [doorRect[0], doorRect[1]],
      u_logo: [L.logo.x, L.logo.y, L.logo.half],
      u_nodes: s.nodes,
      u_emerge: s.emerge,
      u_converge: s.converge,
      u_day: s.ink,
      u_add: add,
    };
    if (s.edges > 0 && s.converge < 1 && this.meshes.edges) {
      const p = this.use("edges", this.meshes.edges);
      this.set(p, { ...netU, u_edges: s.edges, u_alpha: 1, u_width: this.lite ? 1.3 : 1.4 });
      gl.drawArrays(gl.TRIANGLES, 0, this.meshes.edges.count);
    }
    if (s.nodes > 0 && s.converge < 1 && this.meshes.nodes) {
      const p = this.use("nodes", this.meshes.nodes);
      this.set(p, { ...netU, u_alpha: 1, u_soft: 0.6 * add });
      gl.drawArrays(gl.POINTS, 0, this.meshes.nodes.count);
    }
    if (s.emerge > 0 && s.sparks > 0.005) {
      const p = this.use("sparks", this.meshes.sparks);
      this.set(p, {
        u_res: res,
        u_dpr: this.dpr,
        u_doorRect: doorRect,
        u_g0: L.glyphs[0],
        u_g1: L.glyphs[1],
        u_g2: L.glyphs[2],
        u_g3: L.glyphs[3],
        u_gsize: L.glyphR,
        u_logo: [L.logo.x, L.logo.y, L.logo.half],
        u_m1: s.emerge,
        u_m2: s.toLogo,
        u_alpha: s.sparks,
        u_day: s.ink,
        u_size: this.lite ? 1.9 : 2.2,
        u_lift: L.h * 0.14,
        u_add: add,
        u_soft: 0.5 * add,
      });
      gl.drawArrays(gl.POINTS, 0, this.meshes.sparks.count);
    }

    const b = project(cam, [0, 0, 0], L.w, L.h);
    return { params: s, marker: { x: b.x, y: b.y, visible: b.w > 0 } };
  }

  /** Retângulo da abertura projetado na tela: (centro x, centro y, largura, altura) em px. */
  private doorRect(cam: CameraFrame, L: Layout): [number, number, number, number] {
    const corners: Vec3[] = [
      [-DOOR_W / 2, 0, -DOOR_Z],
      [DOOR_W / 2, 0, -DOOR_Z],
      [-DOOR_W / 2, DOOR_H, -DOOR_Z],
      [DOOR_W / 2, DOOR_H, -DOOR_Z],
    ];
    const pts = corners.map((c) => project(cam, c, L.w, L.h));
    if (pts.some((q) => q.w <= 0)) return [L.w / 2, L.h * 0.55, 10, 10];
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0];
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    for (const key in this.meshes) gl.deleteBuffer(this.meshes[key].buffer);
    for (const name of PROGRAM_NAMES) gl.deleteProgram(this.programs[name].program);
    // Não forçamos a perda do contexto: o mesmo <canvas> pode ser reutilizado (ex.: StrictMode em desenvolvimento).
  }
}
