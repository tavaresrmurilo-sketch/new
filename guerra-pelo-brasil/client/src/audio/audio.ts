// Áudio 100% procedural (WebAudio): trilha militar original e efeitos sonoros.
// Nenhum arquivo de áudio é necessário.

export type Sfx =
  | 'rifle' | 'cannon' | 'artillery' | 'explosion' | 'bigExplosion' | 'jet' | 'heli' | 'base'
  | 'click' | 'hover' | 'select' | 'order' | 'alert' | 'capture' | 'lost' | 'build' | 'ability'
  | 'victory' | 'defeat' | 'error' | 'recruit';

type Track = 'menu' | 'battle' | null;

interface Note {
  t: number; // em semicolcheias
  n: number; // midi
  d: number; // duração em semicolcheias
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// "Marcha da Conquista" — tema original do menu (Ré menor, 104 bpm)
const MENU_MELODY: [number, number][] = [
  [69, 4], [69, 2], [69, 2], [74, 6], [69, 2],
  [65, 4], [70, 4], [69, 4], [67, 4],
  [64, 4], [67, 2], [67, 2], [72, 6], [70, 2],
  [69, 8], [64, 4], [73, 4],
  [74, 4], [74, 2], [76, 2], [77, 6], [76, 2],
  [74, 4], [77, 4], [76, 4], [74, 4],
  [72, 4], [70, 2], [69, 2], [67, 4], [64, 4],
  [69, 6], [73, 2], [74, 8],
];
const MENU_ROOTS = [38, 34, 36, 33, 38, 34, 36, 33];
const MENU_CHORDS = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64], [62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]];

// "Frente de Batalha" — ostinato original (Lá menor, 128 bpm)
const BATTLE_ROOTS = [45, 41, 43, 40, 45, 41, 38, 40];
const BATTLE_CHORDS = [[69, 72, 76], [65, 69, 72], [67, 71, 74], [64, 68, 71], [69, 72, 76], [65, 69, 72], [62, 65, 69], [64, 68, 71]];
const BATTLE_MOTIF: [number, number][] = [
  [0, 81], [3, 79], [4, 76], [6, 77], [8, 76], [11, 74], [12, 72], [14, 71],
];

function buildMelody(src: [number, number][]): Note[] {
  const out: Note[] = [];
  let t = 0;
  for (const [n, d] of src) { out.push({ t, n, d }); t += d; }
  return out;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private track: Track = null;
  private timer: number | null = null;
  private step16 = 0;
  private nextTime = 0;
  private menuMelody = buildMelody(MENU_MELODY);
  musicVolume = 0.5;
  sfxVolume = 0.7;
  muted = false;

  /** Deve ser chamado num gesto do usuário (política de autoplay dos navegadores). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    this.applyVolumes();
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.track) this.startScheduler();
  }

  /** Aba em segundo plano: suspende o áudio para poupar CPU e bateria. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.musicGain.gain.value = this.musicVolume * 0.55;
    this.sfxGain.gain.value = this.sfxVolume * 0.8;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  // ---------------------------------------------------------------- música
  playMusic(track: Track): void {
    if (this.track === track) return;
    this.track = track;
    this.step16 = 0;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (track && this.ctx) this.startScheduler();
  }

  private startScheduler(): void {
    if (!this.ctx || this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const bpm = this.track === 'menu' ? 104 : 128;
    const s16 = 60 / bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      if (this.track === 'menu') this.menuStep(this.step16, this.nextTime, s16);
      else this.battleStep(this.step16, this.nextTime, s16);
      this.nextTime += s16;
      this.step16++;
    }
  }

  private menuStep(i: number, t: number, s16: number): void {
    const bar = Math.floor(i / 16) % 8;
    const pos = i % 16;
    const loop = i % 128;
    // caixa clara (rufar de marcha)
    const snare = [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0];
    if (snare[pos]) this.drum('snare', t, pos % 4 === 0 ? 0.55 : 0.28);
    if (pos === 0 || pos === 8) this.drum('kick', t, 0.9);
    if (pos === 4 || pos === 12) this.drum('kick', t, 0.35);
    // baixo em semínimas
    if (pos % 4 === 0) this.tone(midi(MENU_ROOTS[bar] + (pos === 8 ? 7 : 0)), t, s16 * 3.5, 'triangle', 0.32, 600);
    // acordes (cordas graves)
    if (pos === 0) for (const n of MENU_CHORDS[bar]) this.pad(midi(n - 12), t, s16 * 16, 0.05);
    // melodia de metais (a cada duas voltas descansa uma)
    if (Math.floor(i / 128) % 2 === 0) {
      for (const note of this.menuMelody) {
        if (note.t === loop) this.brass(midi(note.n), t, s16 * note.d * 0.95, 0.16);
      }
    } else if (pos % 8 === 0) {
      this.brass(midi(MENU_CHORDS[bar][2]), t, s16 * 2, 0.08);
    }
  }

  private battleStep(i: number, t: number, s16: number): void {
    const bar = Math.floor(i / 16) % 8;
    const pos = i % 16;
    if (pos % 2 === 0) {
      const pattern = [0, 0, 7, 0, 12, 0, 7, 0];
      this.tone(midi(BATTLE_ROOTS[bar] + pattern[(pos / 2) % 8]), t, s16 * 1.5, 'sawtooth', 0.09, 900);
    }
    if (pos === 0) { this.drum('timpani', t, 0.8, BATTLE_ROOTS[bar] - 12); for (const n of BATTLE_CHORDS[bar]) this.pad(midi(n - 12), t, s16 * 16, 0.035); }
    if (pos === 10) this.drum('timpani', t, 0.45, BATTLE_ROOTS[bar] - 12);
    if (pos === 4 || pos === 12) this.drum('snare', t, 0.4);
    if (pos === 14 || pos === 15) this.drum('snare', t, 0.18);
    if (bar % 2 === 1) {
      for (const [p, n] of BATTLE_MOTIF) if (p === pos) this.brass(midi(n - 12 + (bar === 7 ? -1 : 0)), t, s16 * 1.6, 0.08);
    }
  }

  private drum(kind: 'snare' | 'kick' | 'timpani', t: number, vol: number, note = 40): void {
    const ctx = this.ctx!;
    if (kind === 'snare') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * 0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(hp).connect(g).connect(this.musicGain);
      src.start(t, Math.random() * 0.5, 0.15);
    } else {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f0 = kind === 'kick' ? 120 : midi(note) * 2;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 40 : midi(note), t + 0.12);
      g.gain.setValueAtTime(vol * 0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'kick' ? 0.3 : 0.7));
      o.connect(g).connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.8);
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private brass(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2400, t + 0.06);
    f.frequency.linearRampToValueAtTime(1300, t + Math.min(dur, 0.4));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.05, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.08);
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    f.connect(g).connect(this.musicGain);
  }

  private pad(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- efeitos
  play(name: Sfx, vol = 1, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.sfxVolume <= 0) return;
    const now = ctx.currentTime;
    const minGap: Partial<Record<Sfx, number>> = { rifle: 0.05, cannon: 0.09, base: 0.12, explosion: 0.08, artillery: 0.15, hover: 0.04, jet: 0.6, heli: 0.4 };
    const lastT = this.last.get(name) ?? -1;
    if (now - lastT < (minGap[name] ?? 0.03)) return;
    this.last.set(name, now);
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (out) { out.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(this.sfxGain); }
    const dest: AudioNode = out ?? this.sfxGain;
    const noise = (dur: number, type: BiquadFilterType, freq: number, v: number, q = 1, offset = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(v * vol, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      src.connect(f).connect(g).connect(dest);
      src.start(now + offset, Math.random() * 0.4, dur + 0.05);
      return f;
    };
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, v: number, offset = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + offset);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + offset + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.linearRampToValueAtTime(v * vol, now + offset + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      o.connect(g).connect(dest);
      o.start(now + offset);
      o.stop(now + offset + dur + 0.05);
    };
    switch (name) {
      case 'rifle': noise(0.06, 'bandpass', 2200, 0.35, 0.8); break;
      case 'base': noise(0.05, 'bandpass', 1500, 0.3, 0.8); noise(0.05, 'bandpass', 1500, 0.25, 0.8, 0.07); break;
      case 'cannon': osc('sine', 140, 45, 0.25, 0.6); noise(0.22, 'lowpass', 900, 0.45); break;
      case 'artillery': osc('sine', 110, 40, 0.35, 0.55); noise(0.3, 'lowpass', 600, 0.4); break;
      case 'explosion': osc('sine', 90, 30, 0.5, 0.6); noise(0.6, 'lowpass', 700, 0.6); break;
      case 'bigExplosion': osc('sine', 70, 22, 0.9, 0.8); noise(1.1, 'lowpass', 500, 0.8); noise(0.4, 'bandpass', 1800, 0.25, 1, 0.05); break;
      case 'jet': { const f = noise(1.2, 'bandpass', 600, 0.25, 2); f.frequency.exponentialRampToValueAtTime(2600, now + 0.6); f.frequency.exponentialRampToValueAtTime(500, now + 1.2); break; }
      case 'heli': for (let i = 0; i < 6; i++) noise(0.05, 'lowpass', 300, 0.25, 1, i * 0.07); break;
      case 'click': osc('square', 1300, 900, 0.04, 0.08); break;
      case 'hover': osc('sine', 1800, 1700, 0.025, 0.03); break;
      case 'select': osc('square', 880, 880, 0.05, 0.06); osc('square', 1320, 1320, 0.05, 0.06, 0.06); break;
      case 'order': osc('square', 990, 660, 0.08, 0.07); break;
      case 'recruit': osc('triangle', 660, 660, 0.08, 0.12); osc('triangle', 990, 990, 0.1, 0.12, 0.08); break;
      case 'error': osc('square', 220, 180, 0.15, 0.08); break;
      case 'build': noise(0.08, 'bandpass', 3000, 0.3, 3); osc('square', 200, 120, 0.12, 0.12, 0.02); noise(0.08, 'bandpass', 3000, 0.25, 3, 0.15); break;
      case 'alert':
        for (let i = 0; i < 4; i++) osc('square', i % 2 ? 560 : 760, i % 2 ? 560 : 760, 0.18, 0.1, i * 0.19);
        break;
      case 'capture':
        [60, 64, 67, 72].forEach((n, i) => osc('sawtooth', midi(n + 12), midi(n + 12), 0.25, 0.09, i * 0.11));
        break;
      case 'lost':
        [69, 65, 62, 57].forEach((n, i) => osc('sawtooth', midi(n), midi(n), 0.3, 0.08, i * 0.15));
        break;
      case 'ability': { const f = noise(0.9, 'bandpass', 300, 0.35, 3); f.frequency.exponentialRampToValueAtTime(3000, now + 0.8); [62, 66, 69].forEach((n) => osc('sawtooth', midi(n), midi(n), 0.8, 0.05, 0.3)); break; }
      case 'victory':
        [[60, 0], [64, 0.18], [67, 0.36], [72, 0.54], [67, 0.9], [72, 1.08]].forEach(([n, o]) => osc('sawtooth', midi(n + 12), midi(n + 12), 0.5, 0.1, o));
        break;
      case 'defeat':
        [[62, 0], [61, 0.4], [60, 0.8], [57, 1.2]].forEach(([n, o]) => osc('sawtooth', midi(n), midi(n), 0.6, 0.09, o));
        break;
    }
  }
}

export const audio = new AudioEngine();
