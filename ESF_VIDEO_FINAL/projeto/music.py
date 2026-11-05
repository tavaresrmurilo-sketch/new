"""Trilha instrumental ORIGINAL, sintetizada por código para este projeto (sem restrição de licença).

Piano "de feltro" (arpejos suaves) + pad quente + baixo, Ré maior, 72 bpm.
Progressão I – V/3 – vi – IV (D – A/C# – Bm – G) e cadência final ii – V – I (Em7 – A – D) cujo acorde
final cai exatamente na entrada da logo no encerramento.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

SR = 48000
BPM = 72
BEAT = 60 / BPM
BAR = 4 * BEAT

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def hz(name: str) -> float:
    p, o = name[:-1], int(name[-1])
    midi = 12 * (o + 1) + NOTE[p]
    return 440.0 * 2 ** ((midi - 69) / 12)


# acordes: (baixo, [notas do pad], [notas do arpejo])
CHORDS = {
    "D": ("D2", ["D3", "A3", "F#4"], ["D4", "A4", "D5", "F#5", "A5", "F#5", "D5", "A4"]),
    "A/C#": ("C#2", ["C#3", "A3", "E4"], ["C#4", "A4", "C#5", "E5", "A5", "E5", "C#5", "A4"]),
    "Bm": ("B1", ["B2", "F#3", "D4"], ["B3", "F#4", "B4", "D5", "F#5", "D5", "B4", "F#4"]),
    "G": ("G1", ["G2", "D3", "B3"], ["G3", "D4", "G4", "B4", "D5", "B4", "G4", "D4"]),
    "Em7": ("E2", ["E3", "B3", "D4", "G4"], ["E4", "B4", "D5", "G5", "B5", "G5", "D5", "B4"]),
    "A": ("A1", ["A2", "E3", "C#4"], ["A3", "E4", "A4", "C#5", "E5", "C#5", "A4", "E4"]),
}
LOOP = ["D", "A/C#", "Bm", "G"]


def piano_note(f, dur, vel, rng):
    ring = 2.8
    n = int((dur + ring) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    B = 0.00035
    for k in range(1, 11):
        fk = k * f * np.sqrt(1 + B * k * k)
        if fk > 7000:
            break
        amp = (1.0 / k ** 1.5) * (1.0 if k > 1 else 1.15) * (0.55 + 0.45 * vel) ** (k * 0.35)
        tau = (2.2 / (1 + 0.55 * (k - 1))) * (330.0 / f) ** 0.35
        out += amp * np.exp(-t / tau) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
    att = 1 - np.exp(-t / 0.006)
    damp = np.where(t > dur, np.exp(-(t - dur) / 0.35), 1.0)
    out *= att * damp * vel
    # "feltro": filtro passa-baixa dependente da força
    b, a = signal.butter(2, min(0.45, (1400 + 1800 * vel) / (SR / 2)))
    return signal.lfilter(b, a, out)


def saw_voice(f, n, detune_cents=0.0, harmonics=14):
    t = np.arange(n) / SR
    ff = f * 2 ** (detune_cents / 1200)
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        if k * ff > 5000:
            break
        out += np.sin(2 * np.pi * k * ff * t) / k
    return out


def reverb_ir(rt60=2.6, seed=4):
    rng = np.random.default_rng(seed)
    n = int(rt60 * SR)
    t = np.arange(n) / SR
    env = np.exp(-6.9 * t / rt60)
    ir = rng.standard_normal((n, 2)) * env[:, None]
    b, a = signal.butter(2, 5200 / (SR / 2))
    ir = signal.lfilter(b, a, ir, axis=0)
    ir[: int(0.018 * SR)] = 0  # pré-atraso
    return ir / np.sqrt((ir ** 2).sum(axis=0, keepdims=True))


def compose(duration: float, t_final: float, seed: int = 11) -> np.ndarray:
    """Retorna áudio estéreo (N, 2) float. t_final = instante do acorde final (entrada da logo)."""
    rng = np.random.default_rng(seed)
    N = int((duration + 0.5) * SR)
    piano = np.zeros((N, 2))
    pad = np.zeros((N, 2))
    bass = np.zeros((N, 2))
    # sequência de compassos terminando na cadência Em7 – A – D
    bars = []
    t0 = t_final - 2 * BAR
    bars.append((t0, "Em7"))
    bars.append((t0 + BAR, "A"))
    bars.append((t_final, "D_final"))
    k, t = 0, t0
    while t > -BAR:
        t -= BAR
        bars.insert(0, (t, LOOP[(3 - k) % 4]))
        k += 1

    def add(buf, start, sig, pan=0.0, gain=1.0):
        i0 = int(round(start * SR))
        if i0 >= N:
            return
        s0 = max(0, -i0)
        i0 = max(0, i0)
        sig = sig[s0: s0 + (N - i0)]
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        buf[i0: i0 + len(sig), 0] += sig * gl * gain
        buf[i0: i0 + len(sig), 1] += sig * gr * gain

    for bi, (bt, name) in enumerate(bars):
        final = name == "D_final"
        chord = CHORDS["D" if final else name]
        intensity = 0.55 + 0.45 * np.clip((bt - (t_final - 4 * BAR)) / (4 * BAR), 0, 1)  # cresce no fim
        # arpejo (colcheias); no acorde final, um arpejo lento ascendente e nota longa
        if not final:
            for i, nn in enumerate(chord[2]):
                st = bt + i * BEAT / 2 + rng.normal(0, 0.006)
                vel = (0.50 if i % 2 else 0.62) * intensity * rng.uniform(0.9, 1.08)
                f = hz(nn)
                add(piano, st, piano_note(f, BEAT * 0.9, vel, rng), pan=np.clip((np.log2(f / 440)) * 0.45, -0.6, 0.6))
        else:
            for i, nn in enumerate(["D3", "A3", "D4", "F#4", "A4", "D5", "F#5"]):
                st = bt + i * 0.075
                add(piano, st, piano_note(hz(nn), 3.5, 0.62 * rng.uniform(0.92, 1.05), rng),
                    pan=np.clip((np.log2(hz(nn) / 440)) * 0.45, -0.6, 0.6))
        # pad
        dur = BAR * (2.2 if final else 1.0)
        n = int((dur + 1.6) * SR)
        tt = np.arange(n) / SR
        env = np.clip(tt / 1.1, 0, 1) * np.where(tt > dur, np.exp(-(tt - dur) / 0.9), 1.0)
        for j, nn in enumerate(chord[1]):
            v = (saw_voice(hz(nn), n, -5) + saw_voice(hz(nn), n, +5)) * env
            b, a = signal.butter(2, 950 / (SR / 2))
            v = signal.lfilter(b, a, v)
            add(pad, bt - 0.15, v, pan=(-0.35 if j % 2 else 0.35), gain=0.10 * intensity)
        # baixo
        hold = BAR * (2.2 if final else 1.0)
        nb = int((hold + 0.8) * SR)
        tb = np.arange(nb) / SR
        fb = hz(chord[0])
        envb = np.clip(tb / 0.25, 0, 1) * np.exp(-tb / 5.0) * np.where(tb > hold, np.exp(-(tb - hold) / 0.5), 1.0)
        vb = (np.sin(2 * np.pi * fb * tb) + 0.25 * np.sin(4 * np.pi * fb * tb)) * envb
        add(bass, bt, vb, gain=0.20 * intensity)

    dry = piano * 1.0 + pad * 0.55 + bass * 0.75
    ir = reverb_ir()
    wet = np.stack([signal.fftconvolve(dry[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
    mix = dry * 0.78 + wet * 0.42
    # entrada suave e final após o acorde
    t = np.arange(N) / SR
    mix *= np.clip(t / 2.0, 0, 1)[:, None]
    mix *= np.clip((duration - t) / 1.4, 0, 1)[:, None] ** 1.5
    b, a = signal.butter(1, 60 / (SR / 2), "high")
    mix = signal.lfilter(b, a, mix, axis=0)
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix[: int(duration * SR)].astype(np.float32)


def whoosh(dur=0.75, seed=2):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    # varredura de filtro: passa-faixa móvel por blocos
    out = np.zeros(n)
    blk = 512
    zi = None
    for i in range(0, n, blk):
        k = i / n
        fc = 300 + 3200 * np.sin(np.pi * k) ** 2
        b, a = signal.butter(2, [max(80, fc * 0.55) / (SR / 2), min(0.95, fc * 1.6 / (SR / 2))], "band")
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        seg, zi = signal.lfilter(b, a, x[i: i + blk], zi=zi)
        out[i: i + blk] = seg
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    out *= env
    pan = np.linspace(-0.7, 0.7, n)
    st = np.stack([out * np.cos((pan + 1) * np.pi / 4), out * np.sin((pan + 1) * np.pi / 4)], axis=1)
    return (st / np.max(np.abs(st))).astype(np.float32)


def shimmer(dur=2.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f0, d0 in [(hz("D6"), 0.0), (hz("A6"), 0.06), (hz("F#6"), 0.12), (hz("D7"), 0.18)]:
        tt = np.clip(t - d0, 0, None)
        on = (t >= d0)
        for r, a in [(1.0, 1.0), (2.76, 0.25), (5.4, 0.08)]:
            out += on * a * np.exp(-tt / (1.1 / r ** 0.5)) * np.sin(2 * np.pi * f0 * r * tt)
    out *= 1 - np.exp(-t / 0.003)
    st = np.stack([out, np.roll(out, int(0.011 * SR))], axis=1)
    return (st / np.max(np.abs(st))).astype(np.float32)
