import { describe, expect, it } from "vitest";
import { concat, rmsOf, Vad } from "../../src/audio/vad";

const frame = (amp: number) => {
  const f = new Int16Array(320);
  for (let i = 0; i < f.length; i++) f[i] = Math.round(Math.sin(i / 3) * amp * 32767);
  return f;
};

describe("Vad", () => {
  it("opens after sustained voice and closes after silence", () => {
    const vad = new Vad({ threshold: 0.02, noiseFloor: 0.002, startFrames: 3, endSilenceMs: 200, prerollMs: 100, maxMs: 5000, minMs: 100 });
    const events: string[] = [];
    for (let i = 0; i < 5; i++) {
      const f = frame(0.001);
      const ev = vad.push(f, rmsOf(f));
      if (ev) events.push(ev.type);
    }
    for (let i = 0; i < 20; i++) {
      const f = frame(0.3);
      const ev = vad.push(f, rmsOf(f));
      if (ev) events.push(ev.type);
    }
    let end: any = null;
    for (let i = 0; i < 20; i++) {
      const f = frame(0.001);
      const ev = vad.push(f, rmsOf(f));
      if (ev) {
        events.push(ev.type);
        if (ev.type === "end") end = ev;
      }
    }
    expect(events).toEqual(["start", "end"]);
    // preroll (5 frames x 20 ms = 100 ms) + speech + trailing silence
    expect(end.durationMs).toBeGreaterThanOrEqual(400);
    expect(end.pcm.length % 320).toBe(0);
  });

  it("discards blips shorter than minMs", () => {
    const vad = new Vad({ threshold: 0.02, noiseFloor: 0.001, startFrames: 2, endSilenceMs: 100, prerollMs: 0, maxMs: 5000, minMs: 500 });
    const out: string[] = [];
    for (const amp of [0.3, 0.3, 0.3, 0, 0, 0, 0, 0, 0]) {
      const f = frame(amp);
      const ev = vad.push(f, rmsOf(f));
      if (ev) out.push(ev.type);
    }
    expect(out).toEqual(["start", "discard"]);
  });

  it("requires a louder voice while Jarvis is speaking (barge-in boost)", () => {
    const vad = new Vad({ threshold: 0.02, noiseFloor: 0.001, startFrames: 2, endSilenceMs: 100, prerollMs: 0, maxMs: 5000, minMs: 0 });
    vad.boost = 3;
    const f = frame(0.04);
    expect(vad.push(f, rmsOf(f))).toBeNull();
    expect(vad.push(f, rmsOf(f))).toBeNull();
    expect(vad.speaking).toBe(false);
  });

  it("concat joins chunks", () => {
    expect(Array.from(concat([new Int16Array([1, 2]), new Int16Array([3])]))).toEqual([1, 2, 3]);
  });
});
