/**
 * Energy VAD with adaptive noise floor (runs on 20 ms frames at 16 kHz).
 * The engine applies Silero VAD again before decoding, so this stage only
 * needs to be cheap and responsive; it also drives the LISTENING visuals.
 */

export interface VadConfig {
  threshold: number; // absolute RMS floor (from settings / calibration)
  noiseFloor: number; // measured ambient RMS
  startFrames: number; // consecutive voiced frames to start (x20 ms)
  endSilenceMs: number; // silence to close an utterance
  prerollMs: number;
  maxMs: number;
  minMs: number;
}

export const DEFAULT_VAD: VadConfig = {
  threshold: 0.015,
  noiseFloor: 0,
  startFrames: 3,
  endSilenceMs: 750,
  prerollMs: 320,
  maxMs: 15000,
  minMs: 300,
};

export type VadEvent = { type: "start" } | { type: "end"; pcm: Int16Array; durationMs: number } | { type: "discard" };

const FRAME_MS = 20;

export class Vad {
  private voiced = 0;
  private silentMs = 0;
  private active = false;
  private preroll: Int16Array[] = [];
  private chunks: Int16Array[] = [];
  private floor: number;
  boost = 1; // >1 while Jarvis is speaking (barge-in needs a clearly louder voice)

  constructor(public cfg: VadConfig = DEFAULT_VAD) {
    this.floor = cfg.noiseFloor || cfg.threshold / 3;
  }

  get speaking(): boolean {
    return this.active;
  }

  threshold(): number {
    return Math.max(this.cfg.threshold, this.floor * 3) * this.boost;
  }

  reset(): void {
    this.voiced = 0;
    this.silentMs = 0;
    this.active = false;
    this.chunks = [];
  }

  push(frame: Int16Array, rms: number): VadEvent | null {
    const th = this.threshold();
    const loud = rms >= th;
    if (!this.active) {
      // track ambient noise while idle (slow EMA, only on quiet frames)
      if (!loud) this.floor = this.floor * 0.995 + rms * 0.005;
      this.preroll.push(frame);
      const maxPre = Math.ceil(this.cfg.prerollMs / FRAME_MS);
      if (this.preroll.length > maxPre) this.preroll.shift();
      this.voiced = loud ? this.voiced + 1 : 0;
      if (this.voiced >= this.cfg.startFrames) {
        this.active = true;
        this.silentMs = 0;
        this.chunks = this.preroll.slice();
        this.preroll = [];
        return { type: "start" };
      }
      return null;
    }
    this.chunks.push(frame);
    this.silentMs = loud || rms >= th * 0.6 ? 0 : this.silentMs + FRAME_MS;
    const duration = this.chunks.length * FRAME_MS;
    if (this.silentMs >= this.cfg.endSilenceMs || duration >= this.cfg.maxMs) {
      const pcm = concat(this.chunks);
      this.reset();
      if (duration - this.silentMs < this.cfg.minMs) return { type: "discard" };
      return { type: "end", pcm, durationMs: duration };
    }
    return null;
  }

  /** Force-close the current utterance (push-to-talk release). */
  flush(): VadEvent | null {
    if (!this.active || !this.chunks.length) return null;
    const pcm = concat(this.chunks);
    const durationMs = this.chunks.length * FRAME_MS;
    this.reset();
    return { type: "end", pcm, durationMs };
  }
}

export function concat(chunks: Int16Array[]): Int16Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function rmsOf(frame: Int16Array): number {
  let sq = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] / 32768;
    sq += v * v;
  }
  return Math.sqrt(sq / frame.length);
}
