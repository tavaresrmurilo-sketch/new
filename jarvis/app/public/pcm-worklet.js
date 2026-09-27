/* Capture worklet: mono mix -> anti-aliased resample to 16 kHz -> Int16 frames of 20 ms (320 samples).
   Each message carries the frame and its RMS level (0..1) for VAD and visuals. */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Int16Array(320);
    this.pos = 0;
    this.sq = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    const ch1 = input[1];
    for (let i = 0; i < ch0.length; i++) {
      const s = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      // box filter over one output period ~ low-pass before decimation
      this.sum += s;
      this.count += 1;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        const clamped = Math.max(-1, Math.min(1, v));
        this.frame[this.pos++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        this.sq += clamped * clamped;
        if (this.pos === this.frame.length) {
          const rms = Math.sqrt(this.sq / this.frame.length);
          this.port.postMessage({ pcm: this.frame.buffer, rms }, [this.frame.buffer]);
          this.frame = new Int16Array(320);
          this.pos = 0;
          this.sq = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
