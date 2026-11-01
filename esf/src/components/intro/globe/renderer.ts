import {
  arcsFragment,
  arcsVertex,
  backgroundFragment,
  backgroundVertex,
  dotsVertex,
  dustVertex,
  nodesVertex,
  pointFragment,
  sparksVertex,
} from "./shaders";
import { BRASILIA, buildArcs, buildDots, buildDust, buildSparks, toUnit } from "./data";
import { rotationMatrix, sceneAt, type Layout, type SceneParams } from "./scene";
import { yieldToMain } from "@/lib/yield";

export interface GlobeOptions {
  /** perfil leve para celulares e telas pequenas */
  lite: boolean;
  /** renderização por software (sem GPU): resolução interna reduzida */
  economy?: boolean;
  onContextLost?: () => void;
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

export interface FrameInfo {
  params: SceneParams;
  /** posição projetada de Brasília (px CSS) */
  marker: { x: number; y: number; facing: number };
}

type GL = WebGLRenderingContext;

interface Program {
  program: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
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
  attribs: string[];
  uniforms: string[];
}

/** Inicia compilação e link sem consultar o status (que bloquearia a thread principal). */
function startProgram(gl: GL, vs: string, fs: string, attribs: string[], uniforms: string[]): PendingProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram falhou");
  const shaders = [compile(gl, gl.VERTEX_SHADER, vs), compile(gl, gl.FRAGMENT_SHADER, fs)];
  for (const sh of shaders) gl.attachShader(program, sh);
  gl.linkProgram(program);
  return { program, shaders, attribs, uniforms };
}

/**
 * Aguarda a compilação. Com KHR_parallel_shader_compile, os shaders compilam em paralelo
 * e apenas consultamos se terminaram — sem travar a interface.
 */
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
    const a: Record<string, number> = {};
    for (const name of p.attribs) a[name] = gl.getAttribLocation(p.program, name);
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of p.uniforms) u[name] = gl.getUniformLocation(p.program, name);
    return { program: p.program, attribs: a, uniforms: u };
  });
}

function mesh(gl: GL, data: Float32Array, attrs: [string, number][]): Mesh {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("createBuffer falhou");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
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

const PROJECT_UNIFORMS = ["u_rot", "u_center", "u_radius", "u_res", "u_dpr"];

export class GlobeRenderer {
  private gl: GL;
  private canvas: HTMLCanvasElement;
  private lite: boolean;
  private enabled = new Set<number>();
  private lost = false;
  private layout: Layout | null = null;
  private dpr = 1;
  private dotStepRad: number;
  private brasilia = toUnit(BRASILIA.lat, BRASILIA.lon);

  private bg: Program;
  private dots: Program;
  private arcs: Program;
  private nodes: Program;
  private sparks: Program;
  private dust: Program;

  private bgMesh: Mesh;
  private dotsMesh: Mesh;
  private arcsMesh: Mesh;
  private nodesMesh: Mesh;
  private sparksMesh: Mesh;
  private dustMesh: Mesh;

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
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: options.lite ? "low-power" : "high-performance",
      });
      if (!gl) return null;
      const derivatives = !!gl.getExtension("OES_standard_derivatives");

      const pending = [
        startProgram(gl, backgroundVertex, backgroundFragment(derivatives), ["a_xy"], [
          "u_res",
          "u_dpr",
          "u_center",
          "u_radius",
          "u_rotInv",
          "u_globe",
          "u_warm",
          "u_day",
          "u_grat",
          "u_rim",
          "u_light",
          "u_time",
        ]),
        startProgram(gl, dotsVertex, pointFragment, ["a_pos", "a_info"], [
          ...PROJECT_UNIFORMS,
          "u_size",
          "u_alpha",
          "u_time",
          "u_wave",
          "u_brWarm",
          "u_warm",
          "u_light",
          "u_add",
          "u_soft",
        ]),
        startProgram(gl, arcsVertex, arcsFragment, ["a_a", "a_b", "a_meta"], [
          ...PROJECT_UNIFORMS,
          "u_width",
          "u_progress",
          "u_alpha",
          "u_time",
          "u_color",
          "u_headColor",
        ]),
        startProgram(gl, nodesVertex, pointFragment, ["a_pos", "a_meta"], [
          ...PROJECT_UNIFORMS,
          "u_progress",
          "u_alpha",
          "u_time",
          "u_size",
          "u_add",
          "u_soft",
        ]),
        startProgram(gl, sparksVertex, pointFragment, ["a_start", "a_glyph", "a_logo", "a_seed"], [
          ...PROJECT_UNIFORMS,
          "u_g0",
          "u_g1",
          "u_g2",
          "u_g3",
          "u_gsize",
          "u_logo",
          "u_m1",
          "u_m2",
          "u_alpha",
          "u_time",
          "u_day",
          "u_size",
          "u_lift",
          "u_add",
          "u_soft",
        ]),
        startProgram(gl, dustVertex, pointFragment, ["a_data"], ["u_res", "u_dpr", "u_alpha", "u_time", "u_shift", "u_add", "u_soft"]),
      ];

      // --- geometria (JavaScript puro), em etapas curtas
      const step = options.lite ? 1.15 : 0.78;
      await yieldToMain();
      if (cancelled()) return null;
      const dots = buildDots(step);
      await yieldToMain();
      if (cancelled()) return null;
      const arcs = buildArcs(dots, options.lite ? 20 : 34, options.lite ? 28 : 40);
      const sparks = buildSparks(dots, options.lite ? 300 : 520);
      await yieldToMain();
      if (cancelled()) return null;

      const meshes = {
        bg: mesh(gl, new Float32Array([-1, -1, 3, -1, -1, 3]), [["a_xy", 2]]),
        dots: mesh(gl, interleave(dots.count, [[dots.positions, 3], [dots.info, 3]]), [
          ["a_pos", 3],
          ["a_info", 3],
        ]),
        arcs: mesh(gl, arcs.vertices, [
          ["a_a", 3],
          ["a_b", 3],
          ["a_meta", 4],
        ]),
        nodes: mesh(gl, arcs.nodes, [
          ["a_pos", 3],
          ["a_meta", 2],
        ]),
        sparks: mesh(
          gl,
          interleave(sparks.count, [
            [sparks.start, 3],
            [sparks.glyph, 3],
            [sparks.logo, 3],
            [sparks.seed, 2],
          ]),
          [
            ["a_start", 3],
            ["a_glyph", 3],
            ["a_logo", 3],
            ["a_seed", 2],
          ],
        ),
        dust: mesh(gl, buildDust(options.lite ? 90 : 220), [["a_data", 4]]),
      };

      const programs = await finishPrograms(gl, pending, cancelled);
      if (!programs) return null;
      return new GlobeRenderer(canvas, gl, options, (step * Math.PI) / 180, programs, meshes);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.warn("[ESF] WebGL indisponível:", error);
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: GL,
    private options: GlobeOptions,
    dotStepRad: number,
    programs: Program[],
    meshes: Record<"bg" | "dots" | "arcs" | "nodes" | "sparks" | "dust", Mesh>,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.lite = options.lite;
    this.dotStepRad = dotStepRad;
    [this.bg, this.dots, this.arcs, this.nodes, this.sparks, this.dust] = programs;
    this.bgMesh = meshes.bg;
    this.dotsMesh = meshes.dots;
    this.arcsMesh = meshes.arcs;
    this.nodesMesh = meshes.nodes;
    this.sparksMesh = meshes.sparks;
    this.dustMesh = meshes.dust;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
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

  setLayout(layout: Layout) {
    this.layout = layout;
  }

  private use(p: Program, m: Mesh) {
    const gl = this.gl;
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
    const needed = new Set<number>();
    for (const a of m.attrs) {
      const loc = p.attribs[a.name];
      if (loc < 0) continue;
      needed.add(loc);
      if (!this.enabled.has(loc)) gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, m.stride, a.offset);
    }
    for (const loc of this.enabled) if (!needed.has(loc)) gl.disableVertexAttribArray(loc);
    this.enabled = needed;
  }

  private setProjection(p: Program, rot: Float32Array, s: SceneParams) {
    const gl = this.gl;
    const L = this.layout!;
    gl.uniformMatrix3fv(p.uniforms.u_rot, false, rot);
    gl.uniform2f(p.uniforms.u_center, s.pose.cx, s.pose.cy);
    gl.uniform1f(p.uniforms.u_radius, s.pose.r);
    gl.uniform2f(p.uniforms.u_res, L.w, L.h);
    gl.uniform1f(p.uniforms.u_dpr, this.dpr);
  }

  render(progress: number, timeSeconds: number): FrameInfo | null {
    const L = this.layout;
    if (!L || this.isLost) return null;
    const gl = this.gl;
    const s = sceneAt(progress, L);
    const m = rotationMatrix(s.pose);
    // GLSL espera coluna-maior: a matriz de rotação transposta como array linha-maior
    const rot = new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
    const rotInv = new Float32Array(m);
    const t = timeSeconds;
    const add = 1 - s.day;

    // 1 — céu e esfera
    gl.disable(gl.BLEND);
    this.use(this.bg, this.bgMesh);
    const u = this.bg.uniforms;
    gl.uniform2f(u.u_res, L.w, L.h);
    gl.uniform1f(u.u_dpr, this.dpr);
    gl.uniform2f(u.u_center, s.pose.cx, s.pose.cy);
    gl.uniform1f(u.u_radius, s.pose.r);
    gl.uniformMatrix3fv(u.u_rotInv, false, rotInv);
    gl.uniform1f(u.u_globe, s.globe);
    gl.uniform1f(u.u_warm, s.warm);
    gl.uniform1f(u.u_day, s.day);
    gl.uniform1f(u.u_grat, s.grat);
    gl.uniform3f(u.u_rim, s.rim[0], s.rim[1], s.rim[2]);
    gl.uniform3f(u.u_light, s.light[0], s.light[1], s.light[2]);
    gl.uniform1f(u.u_time, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // 2 — poeira
    if (s.dust > 0.01) {
      this.use(this.dust, this.dustMesh);
      const d = this.dust.uniforms;
      gl.uniform2f(d.u_res, L.w, L.h);
      gl.uniform1f(d.u_dpr, this.dpr);
      gl.uniform1f(d.u_alpha, s.dust);
      gl.uniform1f(d.u_time, t);
      gl.uniform1f(d.u_shift, progress * 0.35);
      gl.uniform1f(d.u_add, 1);
      gl.uniform1f(d.u_soft, 0.6);
      gl.drawArrays(gl.POINTS, 0, this.dustMesh.count);
    }

    // 3 — arcos de conexão
    if (s.arcs > 0 && s.arcAlpha > 0.01) {
      this.use(this.arcs, this.arcsMesh);
      const a = this.arcs.uniforms;
      this.setProjection(this.arcs, rot, s);
      gl.uniform1f(a.u_width, this.lite ? 1.3 : 1.5);
      gl.uniform1f(a.u_progress, s.arcs);
      gl.uniform1f(a.u_alpha, s.arcAlpha * s.globe);
      gl.uniform1f(a.u_time, t);
      gl.uniform3f(a.u_color, 0.35, 0.72, 0.72);
      gl.uniform3f(a.u_headColor, 0.85, 1.0, 0.97);
      gl.drawArrays(gl.TRIANGLES, 0, this.arcsMesh.count);
    }

    // 4 — pontos de terra
    if (s.globe > 0.005) {
      this.use(this.dots, this.dotsMesh);
      const d = this.dots.uniforms;
      this.setProjection(this.dots, rot, s);
      gl.uniform1f(d.u_size, Math.max(1.1, s.pose.r * this.dotStepRad * 0.44));
      gl.uniform1f(d.u_alpha, s.dots);
      gl.uniform1f(d.u_time, t);
      gl.uniform1f(d.u_wave, s.wave);
      gl.uniform1f(d.u_brWarm, s.brWarm);
      gl.uniform1f(d.u_warm, s.warm);
      gl.uniform3f(d.u_light, s.light[0], s.light[1], s.light[2]);
      gl.uniform1f(d.u_add, add);
      gl.uniform1f(d.u_soft, 0);
      gl.drawArrays(gl.POINTS, 0, this.dotsMesh.count);
    }

    // 5 — nós das conexões
    if (s.arcs > 0 && s.arcAlpha > 0.01) {
      this.use(this.nodes, this.nodesMesh);
      const n = this.nodes.uniforms;
      this.setProjection(this.nodes, rot, s);
      gl.uniform1f(n.u_progress, s.arcs);
      gl.uniform1f(n.u_alpha, s.arcAlpha * s.globe);
      gl.uniform1f(n.u_time, t);
      gl.uniform1f(n.u_size, this.lite ? 7 : 9);
      gl.uniform1f(n.u_add, 1);
      gl.uniform1f(n.u_soft, 0.9);
      gl.drawArrays(gl.POINTS, 0, this.nodesMesh.count);
    }

    // 6 — partículas de transformação
    if (s.m1 > 0 && s.sparks > 0.005) {
      this.use(this.sparks, this.sparksMesh);
      const k = this.sparks.uniforms;
      this.setProjection(this.sparks, rot, s);
      gl.uniform2f(k.u_g0, L.glyphs[0][0], L.glyphs[0][1]);
      gl.uniform2f(k.u_g1, L.glyphs[1][0], L.glyphs[1][1]);
      gl.uniform2f(k.u_g2, L.glyphs[2][0], L.glyphs[2][1]);
      gl.uniform2f(k.u_g3, L.glyphs[3][0], L.glyphs[3][1]);
      gl.uniform1f(k.u_gsize, L.glyphR);
      gl.uniform3f(k.u_logo, L.logo.x, L.logo.y, L.logo.half);
      gl.uniform1f(k.u_m1, s.m1);
      gl.uniform1f(k.u_m2, s.m2);
      gl.uniform1f(k.u_alpha, s.sparks);
      gl.uniform1f(k.u_time, t);
      gl.uniform1f(k.u_day, s.day);
      gl.uniform1f(k.u_size, this.lite ? 2.1 : 2.4);
      gl.uniform1f(k.u_lift, L.h * 0.12);
      gl.uniform1f(k.u_add, add);
      gl.uniform1f(k.u_soft, 0.55 * add);
      gl.drawArrays(gl.POINTS, 0, this.sparksMesh.count);
    }

    // posição de Brasília para o marcador DOM
    const b = this.brasilia;
    const x = m[0] * b[0] + m[1] * b[1] + m[2] * b[2];
    const y = m[3] * b[0] + m[4] * b[1] + m[5] * b[2];
    const z = m[6] * b[0] + m[7] * b[1] + m[8] * b[2];
    return {
      params: s,
      marker: { x: s.pose.cx + x * s.pose.r, y: s.pose.cy - y * s.pose.r, facing: z },
    };
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    for (const m of [this.bgMesh, this.dotsMesh, this.arcsMesh, this.nodesMesh, this.sparksMesh, this.dustMesh])
      gl.deleteBuffer(m.buffer);
    for (const p of [this.bg, this.dots, this.arcs, this.nodes, this.sparks, this.dust]) gl.deleteProgram(p.program);
    // Não forçamos a perda do contexto: o mesmo <canvas> pode ser reutilizado (ex.: StrictMode em desenvolvimento).
  }
}
