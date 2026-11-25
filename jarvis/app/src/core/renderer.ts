/**
 * CoreRenderer: the procedural "JARVIS CORE" (Canvas 2D, additive light).
 *
 * Every visual parameter has a per-state target and is driven toward it with
 * a critically damped spring, so state changes never jump. Audio input is
 * real: mic spectrum while LISTENING, TTS waveform while SPEAKING.
 * CPU budget: ~30 fps while idle, 60 fps when active, paused when hidden.
 */
import type { JarvisState } from "../lib/types";

type RGB = [number, number, number];

interface Params {
  spin: number; // sphere rotation speed (rad/s)
  ring: number; // ring rotation multiplier
  breathe: number; // idle radius oscillation
  audio: number; // audio displacement gain
  glow: number; // centre glow intensity
  wave: number; // waveform ring visibility
  beam: number; // execution beams visibility
  swirl: number; // tangential particle drift (thinking)
  color: RGB;
  accent: RGB;
}

const CYAN: RGB = [98, 230, 255];
const ICE: RGB = [232, 248, 255];
const AMBER: RGB = [255, 184, 77];
const EMBER: RGB = [255, 93, 115];
const MINT: RGB = [106, 242, 198];

const TARGETS: Record<JarvisState, Params> = {
  IDLE: { spin: 0.08, ring: 0.25, breathe: 1, audio: 0, glow: 0.45, wave: 0, beam: 0, swirl: 0, color: CYAN, accent: CYAN },
  LISTENING: { spin: 0.14, ring: 0.5, breathe: 0.4, audio: 1, glow: 0.75, wave: 0.9, beam: 0, swirl: 0, color: CYAN, accent: ICE },
  THINKING: { spin: 0.5, ring: 2.6, breathe: 0.2, audio: 0, glow: 0.6, wave: 0, beam: 0, swirl: 1, color: CYAN, accent: ICE },
  SPEAKING: { spin: 0.18, ring: 0.8, breathe: 0.2, audio: 1, glow: 0.85, wave: 1, beam: 0, swirl: 0, color: ICE, accent: CYAN },
  EXECUTING: { spin: 0.3, ring: 1.6, breathe: 0.2, audio: 0, glow: 0.7, wave: 0, beam: 1, swirl: 0.3, color: CYAN, accent: MINT },
  ERROR: { spin: 0.05, ring: 0.15, breathe: 0.6, audio: 0, glow: 0.4, wave: 0, beam: 0, swirl: 0, color: AMBER, accent: EMBER },
};

const SCALAR_KEYS = ["spin", "ring", "breathe", "audio", "glow", "wave", "beam", "swirl"] as const;

export interface AudioTap {
  mic(): number; // 0..1 RMS
  micSpectrum(out: Uint8Array<ArrayBuffer>): boolean;
  speech(out: Uint8Array<ArrayBuffer>): number; // RMS; fills time-domain when available
}

interface Spring {
  x: number;
  v: number;
}

export class CoreRenderer {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private t = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private points: Float32Array; // unit vectors xyz
  private seeds: Float32Array;
  private sprite: HTMLCanvasElement;
  private state: JarvisState = "IDLE";
  private springs: Record<(typeof SCALAR_KEYS)[number], Spring>;
  private color: RGB = [...CYAN];
  private accent: RGB = [...CYAN];
  private rot = 0;
  private ringRot = 0;
  private spectrum = new Uint8Array(new ArrayBuffer(256));
  private timeData = new Uint8Array(new ArrayBuffer(1024));
  private level = 0;
  private running = false;
  private errorFlash = 0;
  reducedMotion = false;
  intensity = 0.8;
  frameMs = 0; // exposed for profiling

  constructor(private canvas: HTMLCanvasElement, private tap: AudioTap | null, count = 720) {
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D indisponível");
    this.ctx = ctx;
    this.points = new Float32Array(count * 3);
    this.seeds = new Float32Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      this.points[i * 3] = Math.cos(th) * r;
      this.points[i * 3 + 1] = y;
      this.points[i * 3 + 2] = Math.sin(th) * r;
      this.seeds[i] = Math.random() * Math.PI * 2;
    }
    this.sprite = this.makeSprite();
    const idle = TARGETS.IDLE;
    this.springs = Object.fromEntries(SCALAR_KEYS.map((k) => [k, { x: idle[k] as number, v: 0 }])) as CoreRenderer["springs"];
  }

  private makeSprite(): HTMLCanvasElement {
    const s = document.createElement("canvas");
    s.width = s.height = 32;
    const g = s.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.14, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.36, "rgba(255,255,255,0.16)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return s;
  }

  setState(state: JarvisState): void {
    if (state === this.state) return;
    if (state === "ERROR") this.errorFlash = 1;
    this.state = state;
    if (this.reducedMotion) this.renderOnce();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.renderOnce();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = now;
        return;
      }
      const active = this.state !== "IDLE" || this.springs.glow.x > TARGETS.IDLE.glow + 0.02;
      const minInterval = this.reducedMotion ? 250 : active ? 0 : 32; // idle ~30 fps
      if (now - this.last < minInterval) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      const t0 = performance.now();
      this.draw();
      this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  renderOnce(): void {
    this.step(0.016);
    this.draw();
  }

  private step(dt: number): void {
    const target = TARGETS[this.state];
    const k = 70; // stiffness
    const c = 2 * Math.sqrt(k); // critical damping
    for (const key of SCALAR_KEYS) {
      const sp = this.springs[key];
      const a = k * ((target[key] as number) - sp.x) - c * sp.v;
      sp.v += a * dt;
      sp.x += sp.v * dt;
    }
    const lerp = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < 3; i++) {
      this.color[i] += (target.color[i] - this.color[i]) * lerp;
      this.accent[i] += (target.accent[i] - this.accent[i]) * lerp;
    }
    const motion = this.reducedMotion ? 0 : 1;
    this.t += dt * motion;
    this.rot += dt * this.springs.spin.x * motion;
    this.ringRot += dt * this.springs.ring.x * motion;
    this.errorFlash = Math.max(0, this.errorFlash - dt * 1.5);

    let lvl = 0;
    if (this.tap) {
      if (this.state === "SPEAKING") lvl = this.tap.speech(this.timeData) * 3.2;
      else if (this.state === "LISTENING") {
        lvl = this.tap.mic() * 6;
        this.tap.micSpectrum(this.spectrum);
      }
    }
    this.level += (Math.min(1, lvl) - this.level) * (1 - Math.exp(-dt * 18));
  }

  private rgba(c: RGB, a: number): string {
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  private draw(): void {
    const { ctx, dpr } = this;
    const w = this.w;
    const h = this.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.2;
    const I = this.intensity;
    const sp = this.springs;
    const breath = 1 + Math.sin(this.t * 1.1) * 0.012 * sp.breathe.x;
    const level = this.level;

    ctx.globalCompositeOperation = "lighter";

    // centre glow ---------------------------------------------------------
    const glowR = R * (1.25 + level * 0.25);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    const glowA = (sp.glow.x * 0.5 + level * 0.25 + this.errorFlash * 0.2) * I;
    g.addColorStop(0, this.rgba(this.accent, glowA));
    g.addColorStop(0.35, this.rgba(this.color, glowA * 0.35));
    g.addColorStop(1, this.rgba(this.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // particle sphere --------------------------------------------------------
    const n = this.points.length / 3;
    const cosR = Math.cos(this.rot);
    const sinR = Math.sin(this.rot);
    const tilt = 0.38;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const audioGain = sp.audio.x;
    const swirl = sp.swirl.x;
    const bins = this.spectrum.length;
    const size = Math.max(1.6, R * 0.034);
    for (let i = 0; i < n; i++) {
      let x = this.points[i * 3];
      let y = this.points[i * 3 + 1];
      let z = this.points[i * 3 + 2];
      if (swirl > 0.01) {
        const a = swirl * 0.6 * Math.sin(this.t * 1.7 + y * 3 + this.seeds[i]);
        const ca = Math.cos(a * 0.15);
        const sa = Math.sin(a * 0.15);
        const nx = x * ca - z * sa;
        z = x * sa + z * ca;
        x = nx;
      }
      // rotate around Y then tilt around X
      const xr = x * cosR - z * sinR;
      const zr = x * sinR + z * cosR;
      const yr = y * cosT - zr * sinT;
      const zt = y * sinT + zr * cosT;
      let disp = 1;
      if (audioGain > 0.01) {
        const band = this.spectrum[Math.min(bins - 1, Math.floor(((y + 1) / 2) * bins * 0.5))] / 255;
        disp += audioGain * (level * 0.22 + band * level * 0.3) * (0.6 + 0.4 * Math.sin(this.seeds[i] + this.t * 8));
      }
      disp += Math.sin(this.t * 0.9 + this.seeds[i]) * 0.012 * sp.breathe.x;
      const persp = 1 / (1.9 - zt * 0.6);
      const px = cx + xr * R * breath * disp * persp * 1.3;
      const py = cy + yr * R * breath * disp * persp * 1.3;
      const depth = (zt + 1) / 2; // 0 back .. 1 front
      const alpha = (0.08 + depth * depth * 0.75) * I * (0.8 + level * 0.6);
      const s = size * (0.45 + depth * 0.8);
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.sprite, px - s, py - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    // tint the white sprites with the state colour
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = this.rgba(this.color, 0.55);
    ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
    ctx.globalCompositeOperation = "lighter";

    // orbital rings --------------------------------------------------------
    ctx.lineCap = "round";
    this.ellipseRing(cx, cy, R * 1.42, 0.3, this.ringRot * 0.7, this.rgba(this.color, 0.35 * I), 1.2, [R * 0.9, R * 0.25]);
    this.ellipseRing(cx, cy, R * 1.6, 0.18, -this.ringRot * 1.1 + 1.2, this.rgba(this.accent, 0.22 * I), 1, [R * 0.12, R * 0.08]);
    this.bezel(cx, cy, R * 1.92, I);

    // waveform ring ------------------------------------------------------------
    if (sp.wave.x > 0.02) this.waveRing(cx, cy, R * 1.16, sp.wave.x * I);

    // execution beams ------------------------------------------------------------
    if (sp.beam.x > 0.02) this.beams(cx, cy, R * 1.95, sp.beam.x * I);

    ctx.globalCompositeOperation = "source-over";
  }

  private ellipseRing(cx: number, cy: number, r: number, squash: number, rot: number, stroke: string, width: number, dash: number[]): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * 0.15);
    ctx.scale(1, squash + 0.25);
    ctx.setLineDash(dash);
    ctx.lineDashOffset = -rot * r * 0.5;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width / (squash + 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  private bezel(cx: number, cy: number, r: number, I: number): void {
    const { ctx } = this;
    ctx.strokeStyle = this.rgba(this.color, 0.16 * I);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // ticks: every 6°, major every 30°, rotating slowly with the ring
    const base = this.ringRot * 0.05;
    ctx.strokeStyle = this.rgba(this.color, 0.32 * I);
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const a = base + (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      const r1 = r + 3;
      const r2 = r + (major ? 11 : 6);
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    }
    ctx.stroke();
    // two arc segments that sweep with thinking speed
    ctx.strokeStyle = this.rgba(this.accent, 0.55 * I);
    ctx.lineWidth = 2;
    const sweep = this.ringRot * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, sweep, sweep + 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, sweep + Math.PI, sweep + Math.PI + 0.3);
    ctx.stroke();
  }

  private waveRing(cx: number, cy: number, r: number, alpha: number): void {
    const { ctx } = this;
    const speaking = this.state === "SPEAKING";
    const data = speaking ? this.timeData : this.spectrum;
    const N = 180;
    const vals = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (speaking) {
        const idx = Math.floor((i / N) * (data.length - 1));
        vals[i] = Math.abs((data[idx] - 128) / 128);
      } else {
        const mirrored = i <= N / 2 ? i : N - i; // symmetric spectrum ring
        vals[i] = data[Math.floor((mirrored / (N / 2)) * data.length * 0.4)] / 255;
      }
    }
    // 5-tap smoothing so the ring reads as a waveform, not noise
    const smooth = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      smooth[i] = (vals[(i - 2 + N) % N] + vals[(i - 1 + N) % N] * 2 + vals[i] * 3 + vals[(i + 1) % N] * 2 + vals[(i + 2) % N]) / 9;
    }
    const amp = r * 0.12 * (0.35 + this.level);
    ctx.strokeStyle = this.rgba(this.accent, alpha * 0.75);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const a = (k / N) * Math.PI * 2 - Math.PI / 2;
      const rr = r + smooth[k] * amp;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // faint inner echo
    ctx.strokeStyle = this.rgba(this.color, alpha * 0.25);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const a = (k / N) * Math.PI * 2 - Math.PI / 2;
      const rr = r * 0.94 - smooth[k] * amp * 0.5;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private beams(cx: number, cy: number, r: number, alpha: number): void {
    const { ctx } = this;
    const edgeL = 0;
    const edgeR = this.w;
    const phase = (this.t * 0.9) % 1;
    for (const dir of [-1, 1]) {
      const x0 = cx + dir * r;
      const x1 = dir < 0 ? edgeL : edgeR;
      const grad = ctx.createLinearGradient(x0, cy, x1, cy);
      grad.addColorStop(0, this.rgba(this.accent, alpha * 0.55));
      grad.addColorStop(1, this.rgba(this.accent, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      for (const off of [-10, 10]) {
        ctx.beginPath();
        ctx.moveTo(x0, cy + off * 0.5);
        ctx.lineTo(x1, cy + off);
        ctx.stroke();
      }
      // travelling pulse
      for (let k = 0; k < 2; k++) {
        const p = (phase + k * 0.5) % 1;
        const px = x0 + (x1 - x0) * p;
        const s = 3 + (1 - p) * 3;
        ctx.globalAlpha = alpha * (1 - p);
        ctx.drawImage(this.sprite, px - s * 2, cy - s * 2, s * 4, s * 4);
      }
      ctx.globalAlpha = 1;
    }
  }
}
