/**
 * Microphone pipeline (main window only):
 *   getUserMedia (AEC/NS/AGC) -> AudioWorklet (16 kHz Int16 frames) -> VAD
 *   -> utterances sent to the engine as binary frames.
 * In openWakeWord mode, idle audio is also streamed in 80 ms batches so the
 * engine-side detector can hear "Hey Jarvis".
 */
import { DEFAULT_VAD, Vad, VadConfig } from "./vad";

export type CaptureMode = "wake" | "command";

export interface CaptureCallbacks {
  onUtterance(pcm: Int16Array, meta: { mode: CaptureMode | "auto"; bargeIn: boolean; durationMs: number }): void;
  onFrames?(pcm: Int16Array): void;
  onSpeechStart(bargeIn: boolean): void;
  onSpeechEnd(): void;
  onLevel?(rms: number): void;
}

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  analyser: AnalyserNode | null = null;
  private vad = new Vad();
  private muted = false;
  private wakePaused = false;
  private armed: CaptureMode | null = null;
  private armTimer: number | null = null;
  private frameBatch: Int16Array[] = [];
  private calibrating: { until: number; samples: number[]; resolve: (v: number) => void } | null = null;
  streamFrames = false; // openWakeWord mode
  wakeWordRequired = true;
  jarvisSpeaking = false;
  bargeIn = true;
  level = 0;
  deviceLabel = "";

  constructor(private cb: CaptureCallbacks) {}

  get running(): boolean {
    return Boolean(this.ctx && this.stream);
  }

  async start(deviceId: string): Promise<void> {
    await this.stop();
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.deviceLabel = this.stream.getAudioTracks()[0]?.label ?? "";
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    await this.ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", document.baseURI).href);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (ev: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => this.onFrame(new Int16Array(ev.data.pcm), ev.data.rms);
    this.source.connect(this.analyser);
    this.source.connect(this.node);
    // The worklet must be pulled by the graph; route it through a muted gain.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx) await this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.source = null;
    this.analyser = null;
    this.vad.reset();
  }

  configure(cfg: Partial<VadConfig>): void {
    this.vad.cfg = { ...DEFAULT_VAD, ...this.vad.cfg, ...cfg };
  }

  setMuted(v: boolean): void {
    this.muted = v;
    if (v) this.vad.reset();
  }

  setWakePaused(v: boolean): void {
    this.wakePaused = v;
  }

  /** Next utterance is a command (push-to-talk, wake detected by openWakeWord). */
  arm(mode: CaptureMode = "command", timeoutMs = 8000): void {
    this.armed = mode;
    if (this.armTimer) window.clearTimeout(this.armTimer);
    this.armTimer = window.setTimeout(() => {
      this.armed = null;
    }, timeoutMs);
  }

  get isArmed(): boolean {
    return this.armed !== null;
  }

  calibrate(ms = 3000): Promise<number> {
    return new Promise((resolve) => {
      this.calibrating = { until: performance.now() + ms, samples: [], resolve };
    });
  }

  private onFrame(frame: Int16Array, rms: number): void {
    this.level = this.level * 0.7 + rms * 0.3;
    this.cb.onLevel?.(rms);
    if (this.calibrating) {
      this.calibrating.samples.push(rms);
      if (performance.now() >= this.calibrating.until) {
        const sorted = [...this.calibrating.samples].sort((a, b) => a - b);
        const p80 = sorted[Math.floor(sorted.length * 0.8)] ?? 0;
        this.calibrating.resolve(p80);
        this.calibrating = null;
      }
      return;
    }
    if (this.muted) return;
    // Always-on listening only when the wake word is enabled and not paused;
    // otherwise audio is captured only after an explicit arm (push-to-talk / shortcut).
    const alwaysOn = this.wakeWordRequired && !this.wakePaused;
    if (!alwaysOn && this.armed === null && !this.vad.speaking) return;
    this.vad.boost = this.jarvisSpeaking ? (this.bargeIn ? 2.4 : 1000) : 1;
    const ev = this.vad.push(frame, rms);
    if (ev?.type === "start") {
      this.cb.onSpeechStart(this.jarvisSpeaking);
    } else if (ev?.type === "end") {
      const mode = this.armed ?? "auto";
      this.armed = null;
      this.cb.onSpeechEnd();
      this.cb.onUtterance(ev.pcm, { mode, bargeIn: this.jarvisSpeaking, durationMs: ev.durationMs });
    } else if (ev?.type === "discard") {
      this.cb.onSpeechEnd();
    }
    if (this.streamFrames && !this.vad.speaking && this.armed === null && this.cb.onFrames) {
      this.frameBatch.push(frame);
      if (this.frameBatch.length >= 4) {
        const len = this.frameBatch.reduce((n, f) => n + f.length, 0);
        const out = new Int16Array(len);
        let off = 0;
        for (const f of this.frameBatch) {
          out.set(f, off);
          off += f.length;
        }
        this.frameBatch = [];
        this.cb.onFrames(out);
      }
    }
  }

  getFrequencies(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }
}

export async function listDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return { inputs: all.filter((d) => d.kind === "audioinput"), outputs: all.filter((d) => d.kind === "audiooutput") };
}
