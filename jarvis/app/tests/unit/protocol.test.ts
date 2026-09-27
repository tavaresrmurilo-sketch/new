import { describe, expect, it } from "vitest";
import { decodeFrame } from "../../src/lib/client";

function encode(header: object, payload: Uint8Array): ArrayBuffer {
  const head = new TextEncoder().encode(JSON.stringify(header));
  const buf = new Uint8Array(4 + head.length + payload.length);
  new DataView(buf.buffer).setUint32(0, head.length, false);
  buf.set(head, 4);
  buf.set(payload, 4 + head.length);
  return buf.buffer;
}

describe("binary frames", () => {
  it("round-trips header and payload", () => {
    const f = decodeFrame(encode({ kind: "tts", utteranceId: "a1", seq: 2 }, new Uint8Array([9, 8, 7])));
    expect(f?.header).toEqual({ kind: "tts", utteranceId: "a1", seq: 2 });
    expect(Array.from(new Uint8Array(f!.payload))).toEqual([9, 8, 7]);
  });

  it("rejects truncated or oversized headers", () => {
    expect(decodeFrame(new Uint8Array([0, 0]).buffer)).toBeNull();
    const bad = new Uint8Array(8);
    new DataView(bad.buffer).setUint32(0, 100000, false);
    expect(decodeFrame(bad.buffer)).toBeNull();
  });

  it("rejects invalid JSON headers", () => {
    const buf = new Uint8Array(4 + 3);
    new DataView(buf.buffer).setUint32(0, 3, false);
    buf.set(new TextEncoder().encode("{x}"), 4);
    expect(decodeFrame(buf.buffer)).toBeNull();
  });
});
