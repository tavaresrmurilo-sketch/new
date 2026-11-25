/**
 * Runtime: wires the shell bridge, the engine connection, the audio pipeline
 * and the store together. One instance per window.
 */
import { MicCapture } from "./audio/capture";
import { SpeechPlayer } from "./audio/player";
import { play, setSoundsEnabled } from "./audio/sounds";
import { bridge } from "./lib/bridge";
import { JarvisClient, ServerMessage } from "./lib/client";
import type { Settings } from "./lib/types";
import { useStore } from "./state/store";

export type WindowKind = "main" | "mini" | "palette";

class Runtime {
  kind: WindowKind = "main";
  client!: JarvisClient;
  mic: MicCapture | null = null;
  player: SpeechPlayer | null = null;
  private started = false;
  private micDevice = "";
  private lastSettings: Settings | null = null;

  start(kind: WindowKind): void {
    if (this.started) return;
    this.started = true;
    this.kind = kind;
    const caps = kind === "main" ? ["speech", "notifications", "clipboard", "capture", "audio"] : [];
    this.client = new JarvisClient(kind, caps, (op, params) => this.handleRequest(op, params));
    const store = useStore.getState();
    this.client.onState((s) => useStore.getState().setConn(s));
    this.client.onMessage((m) => this.onMessage(m));
    if (kind === "main") {
      this.player = new SpeechPlayer(
        (speaking) => {
          useStore.getState().setAudio({ speaking });
          if (this.mic) this.mic.jarvisSpeaking = speaking;
        },
        () => this.client.send({ type: "voice.speech_ended" }),
      );
      this.client.onBinary((f) => {
        if (f.header.kind === "tts" && this.player) void this.player.enqueueWav(f.header as { utteranceId: string; seq: number }, f.payload);
      });
      this.setupTray();
    }
    const b = bridge();
    b.backend.onStatus((info) => {
      useStore.getState().setBackend(info);
      if (info.status === "online") this.client.connect(info.url, info.token);
    });
    void b.backend.get().then((info) => {
      store.setBackend(info);
      if (info.status === "online" || !b.isDesktop) this.client.connect(info.url, info.token);
    });
    useStore.subscribe((s) => {
      if (s.settings && s.settings !== this.lastSettings) {
        this.lastSettings = s.settings;
        this.applySettings(s.settings);
      }
    });
  }

  // ------------------------------------------------------------ engine msgs
  private onMessage(m: ServerMessage): void {
    const store = useStore.getState();
    switch (m.type) {
      case "hello":
        store.applySnapshot(m.snapshot);
        void this.refreshProvider();
        break;
      case "event":
        store.handleEvent(m.event, m.data);
        this.sideEffects(m.event, m.data);
        break;
      case "voice.say":
        this.player?.enqueueText(m);
        break;
      case "voice.say_end":
        this.player?.end(m.utteranceId, m.count);
        break;
      case "voice.capture":
        if (this.mic) {
          this.mic.arm("command");
          play("activate");
        }
        break;
      default:
        break;
    }
  }

  private sideEffects(name: string, data: any): void {
    const store = useStore.getState();
    if (this.kind !== "main") return;
    switch (name) {
      case "voice.wake":
        play("activate");
        break;
      case "voice.interrupt":
        this.player?.stop();
        break;
      case "task.updated":
        if (data.status === "completed" && data.steps?.length > 1) play("complete");
        if (data.status === "failed") play("error");
        break;
      case "permission.request":
        play("notify");
        break;
      case "notification":
        play("notify");
        store.toast({ kind: data.kind === "warning" ? "warning" : "info", title: data.title, body: data.body });
        break;
      case "ai.response":
        if (data.kind === "error") play("error");
        break;
      case "voice.download":
      case "settings.updated":
        void this.client.rpc("voice.status").then((v) => useStore.getState().setVoice(v)).catch(() => undefined);
        break;
      default:
        break;
    }
  }

  async refreshProvider(force = false): Promise<void> {
    try {
      useStore.getState().setProvider(await this.client.rpc("providers.status", { force }, 15000));
    } catch {
      /* shown as offline */
    }
  }

  // ------------------------------------------------------- bridge requests
  private async handleRequest(op: string, params: Record<string, any>): Promise<unknown> {
    const b = bridge();
    switch (op) {
      case "notify":
        return { shown: await b.notify(String(params.title ?? "Jarvis"), String(params.body ?? "")) };
      case "clipboard.read":
        return { text: await b.clipboard.read() };
      case "clipboard.write":
        return { ok: await b.clipboard.write(String(params.text ?? "")) };
      case "screen.capture":
        return b.capture.grab({ maxWidth: Number(params.maxWidth) || 1600 });
      default:
        throw new Error(`operação não suportada: ${op}`);
    }
  }

  // ------------------------------------------------------------------ audio
  private applySettings(s: Settings): void {
    setSoundsEnabled(s.appearance.sounds_enabled);
    document.documentElement.style.setProperty("--hud-intensity", String(s.appearance.hud_intensity));
    document.documentElement.dataset.motion = s.appearance.motion;
    document.documentElement.dataset.compact = String(s.appearance.compact_mode);
    if (this.kind !== "main") return;
    void this.player?.setSink(s.voice.output_device_id);
    if (!s.voice.enabled) {
      void this.mic?.stop();
      useStore.getState().setAudio({ ready: false });
      return;
    }
    if (!this.mic) {
      this.mic = new MicCapture({
        onUtterance: (pcm, meta) => {
          this.client.sendBinary({ kind: "utterance", sampleRate: 16000, mode: meta.mode, bargeIn: meta.bargeIn, durationMs: meta.durationMs }, pcm.buffer as ArrayBuffer);
        },
        onFrames: (pcm) => this.client.sendBinary({ kind: "frame", sampleRate: 16000 }, pcm.buffer as ArrayBuffer),
        onSpeechStart: (bargeIn) => {
          useStore.getState().setAudio({ capturing: true });
          if (bargeIn && this.player?.speaking) {
            this.player.stop();
            this.client.send({ type: "voice.interrupt" });
          }
        },
        onSpeechEnd: () => useStore.getState().setAudio({ capturing: false }),
      });
    }
    const mic = this.mic;
    mic.wakeWordRequired = s.voice.wake_word_enabled;
    mic.streamFrames = s.voice.wake_word_enabled && s.voice.wake_engine === "openwakeword";
    mic.bargeIn = s.voice.barge_in;
    mic.configure({ threshold: s.voice.vad_threshold, noiseFloor: s.voice.noise_floor });
    const audio = useStore.getState().audio;
    mic.setMuted(audio.micMuted);
    mic.setWakePaused(audio.wakePaused);
    if (!mic.running || this.micDevice !== s.voice.input_device_id) {
      this.micDevice = s.voice.input_device_id;
      mic
        .start(s.voice.input_device_id)
        .then(() => useStore.getState().setAudio({ ready: true, micError: "", inputLabel: mic.deviceLabel }))
        .catch((err: Error) => {
          const msg = err.name === "NotFoundError" || err.name === "OverconstrainedError"
            ? "Não encontrei um dispositivo de entrada."
            : err.name === "NotAllowedError"
              ? "O acesso ao microfone foi negado. Libere em Configurações do Windows › Privacidade › Microfone."
              : `Microfone indisponível: ${err.message}`;
          useStore.getState().setAudio({ ready: false, micError: msg });
        });
    }
  }

  setMicMuted(v: boolean): void {
    this.mic?.setMuted(v);
    useStore.getState().setAudio({ micMuted: v });
    bridge().audio.report({ micMuted: v });
  }

  setWakePaused(v: boolean): void {
    this.mic?.setWakePaused(v);
    useStore.getState().setAudio({ wakePaused: v });
    bridge().audio.report({ wakePaused: v });
  }

  /** Push-to-talk / "listen now": next utterance is a command, no wake word. */
  listenNow(): void {
    if (!this.mic?.running) {
      useStore.getState().toast({ kind: "warning", title: "Microfone", body: useStore.getState().audio.micError || "O microfone não está ativo." });
      return;
    }
    if (this.player?.speaking) {
      this.player.stop();
      this.client.send({ type: "voice.interrupt" });
    }
    this.mic.arm("command");
    play("activate");
    useStore.getState().setAudio({ followUpUntil: Date.now() + 8000 });
  }

  interrupt(): void {
    this.player?.stop();
    this.client.send({ type: "voice.interrupt" });
  }

  async calibrate(): Promise<number | null> {
    if (!this.mic?.running) return null;
    const floor = await this.mic.calibrate(3000);
    const threshold = Math.min(0.2, Math.max(0.006, floor * 3));
    await this.client.rpc("settings.update", { patch: { voice: { noise_floor: Number(floor.toFixed(4)), vad_threshold: Number(threshold.toFixed(4)) } } });
    return floor;
  }

  private setupTray(): void {
    const b = bridge();
    b.tray.onAction((a) => {
      if (a.type === "mute-mic") this.setMicMuted(Boolean(a.value));
      else if (a.type === "pause-wake") this.setWakePaused(Boolean(a.value));
      else if (a.type === "open-settings") useStore.getState().openModule("settings");
      else if (a.type === "listen") this.listenNow();
      else if (a.type === "voice-mode") {
        this.setMicMuted(false);
        void this.client.rpc("settings.update", { patch: { voice: { enabled: true, speak_responses: true } } }).catch(() => undefined);
      }
    });
    void b.prefs.get().then(({ prefs }) => {
      useStore.getState().setAudio({ micMuted: prefs.micMuted, wakePaused: prefs.wakePaused });
      this.mic?.setMuted(prefs.micMuted);
      this.mic?.setWakePaused(prefs.wakePaused);
    });
  }

  // --------------------------------------------------------------- commands
  command(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    // A new command supersedes the answer being spoken, including sentences not synthesized yet.
    this.interrupt();
    return this.client.command(t, "text");
  }

  rpc<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    return this.client.rpc<T>(method, params, timeoutMs);
  }

  async updateSettings(patch: Record<string, unknown>): Promise<Settings> {
    const s = await this.client.rpc<Settings>("settings.update", { patch });
    useStore.getState().setSettings(s);
    return s;
  }
}

export const runtime = new Runtime();
