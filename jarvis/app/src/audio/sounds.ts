/**
 * Original interface sounds, synthesised at runtime with Web Audio (no audio
 * files, nothing sampled from films). Short, soft and never louder than speech.
 */
type SoundName = "activate" | "confirm" | "error" | "complete" | "notify";

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(v: boolean): void {
  enabled = v;
}

function context(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine", slideTo?: number): void {
  const c = context();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

export function play(name: SoundName): void {
  if (!enabled) return;
  try {
    switch (name) {
      case "activate": // two rising partials: "I'm here"
        tone(620, 0, 0.16, 0.05);
        tone(930, 0.07, 0.22, 0.045);
        break;
      case "confirm":
        tone(1180, 0, 0.07, 0.035, "triangle");
        break;
      case "error": // low descending, discreet
        tone(340, 0, 0.22, 0.045, "triangle", 230);
        break;
      case "complete": // short major arpeggio
        tone(523.25, 0, 0.12, 0.035);
        tone(659.25, 0.07, 0.12, 0.035);
        tone(783.99, 0.14, 0.2, 0.035);
        break;
      case "notify":
        tone(880, 0, 0.1, 0.03);
        tone(1320, 0.09, 0.14, 0.025);
        break;
    }
  } catch {
    /* audio device unavailable: sounds are optional */
  }
}
