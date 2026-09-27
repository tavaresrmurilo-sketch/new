/**
 * Speech output. Piper WAV frames are decoded and played through an
 * AnalyserNode (drives the SPEAKING waveform with the real signal). The
 * "system" engine uses the OS voices via speechSynthesis; its word-boundary
 * events drive the visuals instead. Playback can be interrupted at any time.
 */

interface QueueItem {
  utteranceId: string;
  seq: number;
  buffer?: AudioBuffer;
  text?: string;
  rate?: number;
  voiceName?: string;
  lang?: string;
}

export class SpeechPlayer {
  private ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private queue: QueueItem[] = [];
  private current: AudioBufferSourceNode | null = null;
  private ended = new Map<string, number>(); // utteranceId -> item count
  private played = new Map<string, number>();
  private dropped = new Set<string>(); // interrupted utterances: late sentences are discarded
  private playingId = "";
  private busy = false;
  private sinkId = "default";
  speaking = false;
  boundaryPulse = 0; // decays; bumped on system-TTS word boundaries

  constructor(private onChange: (speaking: boolean) => void, private onFinished: () => void) {}

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.5;
      this.gain.connect(this.analyser).connect(this.ctx.destination);
      if (this.sinkId !== "default") void this.applySink();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  async setSink(deviceId: string): Promise<boolean> {
    this.sinkId = deviceId || "default";
    return this.applySink();
  }

  private async applySink(): Promise<boolean> {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!ctx?.setSinkId) return false;
    try {
      await ctx.setSinkId(this.sinkId === "default" ? "" : this.sinkId);
      return true;
    } catch {
      return false;
    }
  }

  async enqueueWav(header: { utteranceId: string; seq: number }, wav: ArrayBuffer): Promise<void> {
    const ctx = this.context();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(wav.slice(0));
    } catch {
      return;
    }
    this.insert({ utteranceId: header.utteranceId, seq: header.seq, buffer });
  }

  enqueueText(msg: { utteranceId: string; seq: number; text: string; rate: number; voiceName: string; lang: string }): void {
    this.insert({ ...msg });
  }

  end(utteranceId: string, count: number): void {
    this.ended.set(utteranceId, count);
    this.checkFinished();
  }

  private insert(item: QueueItem): void {
    if (this.dropped.has(item.utteranceId)) return;
    this.queue.push(item);
    this.queue.sort((a, b) => (a.utteranceId === b.utteranceId ? a.seq - b.seq : 0));
    void this.pump();
  }

  private setSpeaking(v: boolean): void {
    if (this.speaking !== v) {
      this.speaking = v;
      this.onChange(v);
    }
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        this.playingId = item.utteranceId;
        this.setSpeaking(true);
        if (item.buffer) await this.playBuffer(item.buffer);
        else if (item.text) await this.speakText(item);
        this.played.set(item.utteranceId, (this.played.get(item.utteranceId) ?? 0) + 1);
        this.checkFinished();
      }
    } finally {
      this.busy = false;
      if (!this.queue.length) this.setSpeaking(false);
    }
  }

  private playBuffer(buffer: AudioBuffer): Promise<void> {
    const ctx = this.context();
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.gain!);
      src.onended = () => {
        if (this.current === src) this.current = null;
        resolve();
      };
      this.current = src;
      src.start();
    });
  }

  private speakText(item: QueueItem): Promise<void> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = item.lang || "pt-BR";
      u.rate = item.rate ?? 1;
      const voices = window.speechSynthesis.getVoices();
      const wanted = voices.find((v) => v.name === item.voiceName) ?? voices.find((v) => v.lang.replace("_", "-").startsWith(u.lang)) ?? null;
      if (wanted) u.voice = wanted;
      u.onboundary = () => {
        this.boundaryPulse = 1;
      };
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  private checkFinished(): void {
    for (const [id, count] of this.ended) {
      if ((this.played.get(id) ?? 0) >= count) {
        this.ended.delete(id);
        this.played.delete(id);
        if (!this.queue.length) {
          this.setSpeaking(false);
          this.onFinished();
        }
      }
    }
  }

  /** Barge-in / "pare": stop immediately and drop everything queued. */
  stop(): void {
    for (const id of [this.playingId, ...this.queue.map((q) => q.utteranceId), ...this.ended.keys()]) {
      if (id) this.dropped.add(id);
    }
    if (this.dropped.size > 64) this.dropped = new Set([...this.dropped].slice(-32));
    this.playingId = "";
    this.queue = [];
    this.ended.clear();
    this.played.clear();
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    this.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  level(timeData: Uint8Array<ArrayBuffer>): number {
    if (this.analyser && this.current) {
      this.analyser.getByteTimeDomainData(timeData);
      let sq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sq += v * v;
      }
      return Math.sqrt(sq / timeData.length);
    }
    this.boundaryPulse *= 0.9;
    return this.speaking ? 0.05 + this.boundaryPulse * 0.25 : 0;
  }

  hasSignal(): boolean {
    return Boolean(this.analyser && this.current);
  }
}

export function systemVoices(): SpeechSynthesisVoice[] {
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}
