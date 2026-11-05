"""Áudio de cada versão: diálogo tratado + trilha original com ducking + efeitos sutis + loudness.

Diálogo
  * a voz original é tratada INTEIRA duas vezes (cadeia da Manuela e cadeia da Thais) e cada trecho
    usa a cadeia de quem fala — o microfone estava com a Manuela; a Thais chega ~3.4 dB mais baixa e
    bem mais abafada (−6 a −7 dB entre 2 e 8 kHz), então recebe ganho e presença;
  * passa-alta, redução de ruído leve (afftdn), corte de embolamento (~280 Hz), presença (~3 kHz),
    compressão suave, de-esser (sibilância do "s"); equilíbrio de volume por trecho (±6 dB no máximo);
  * cortes com micro-fades (15 ms) nas pausas — nada de cliques.
Trilha: music.py, abaixada automaticamente sob a fala (ducking ~12 dB) e mais presente no encerramento.
Masterização: loudnorm em 2 passadas (−14 LUFS integrado, pico real −1.5 dBTP), estéreo 48 kHz.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import maximum_filter1d, uniform_filter1d

sys.path.insert(0, str(Path(__file__).resolve().parent))
from music import SR, compose, shimmer, whoosh  # noqa: E402

CHAIN_COMMON = "highpass=f=85:p=2,afftdn=nr=8:nf=-48:tn=1,equalizer=f=280:t=q:w=1.1:g=-2.5"
CHAINS = {
    "M": CHAIN_COMMON + ",equalizer=f=3200:t=q:w=1.2:g=2.0,highshelf=f=7500:g=1.5,"
                        "acompressor=threshold=-22dB:ratio=2.5:attack=6:release=180:makeup=1.5:knee=4,deesser=i=0.5:m=0.5:f=0.45",
    "T": CHAIN_COMMON + ",volume=3.5dB,equalizer=f=2900:t=q:w=1.0:g=4.0,highshelf=f=6500:g=3.0,"
                        "acompressor=threshold=-24dB:ratio=2.5:attack=6:release=180:makeup=1.5:knee=4,deesser=i=0.5:m=0.5:f=0.45",
}


def process_voice(src_wav: Path, work: Path):
    out = {}
    for spk, chain in CHAINS.items():
        p = work / f"voice_{spk}.wav"
        if not p.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src_wav), "-af", chain, "-ar", str(SR),
                            "-c:a", "pcm_f32le", str(p)], check=True)
        x, sr = sf.read(p, dtype="float32")
        assert sr == SR
        out[spk] = x if x.ndim == 1 else x.mean(axis=1)
    return out


def speech_rms_db(x):
    if len(x) < SR // 10:
        return None
    w = int(0.05 * SR)
    e = uniform_filter1d(x.astype(np.float64) ** 2, w)[::w]
    db = 10 * np.log10(e + 1e-12)
    act = db[db > -45]
    if len(act) < 4:
        return None
    return 10 * np.log10(np.mean(10 ** (act / 10)))


def build_dialogue(tl, voices, target_db=-20.0):
    N = int(round(tl.duration * SR))
    dlg = np.zeros(N, np.float32)
    clips = [s for s in tl.segs if s.kind == "clip"]
    # grupos contíguos (cortes virtuais) recebem um único ganho
    groups, cur = [], []
    for s in clips:
        if cur and abs(cur[-1].src1 - s.src0) < 1e-6 and cur[-1].spk == s.spk and abs(cur[-1].out1 - s.out0) < 1e-6:
            cur.append(s)
        else:
            if cur:
                groups.append(cur)
            cur = [s]
    groups.append(cur)
    report = []
    for g in groups:
        spk = g[0].spk
        v = voices[spk]
        a, b = int(round(g[0].src0 * SR)), int(round(g[-1].src1 * SR))
        seg = v[a:b].copy()
        lvl = speech_rms_db(seg)
        gain_db = 0.0 if lvl is None else float(np.clip(target_db - lvl, -6, 6))
        seg *= 10 ** (gain_db / 20)
        f = int(0.015 * SR)
        ramp = np.linspace(0, 1, f, dtype=np.float32)
        seg[:f] *= ramp
        seg[-f:] *= ramp[::-1]
        o = int(round(g[0].out0 * SR))
        n = min(len(seg), N - o)
        dlg[o:o + n] += seg[:n]
        report.append({"src": [round(g[0].src0, 2), round(g[-1].src1, 2)], "spk": spk,
                       "level_db": None if lvl is None else round(lvl, 1), "gain_db": round(gain_db, 1)})
    return dlg, report


def duck_envelope(dlg, floor_db=-12.0, att=0.08, rel=0.55):
    w = int(0.01 * SR)
    e = np.sqrt(uniform_filter1d(dlg.astype(np.float64) ** 2, w * 3)[::w] + 1e-12)
    act = (20 * np.log10(e) > -42).astype(np.float64)
    act = maximum_filter1d(act, size=25)  # segura 250 ms
    g = np.empty_like(act)
    lvl = 0.0
    a_up, a_dn = 1 - np.exp(-0.01 / att), 1 - np.exp(-0.01 / rel)
    for i, v in enumerate(act):
        lvl += (v - lvl) * (a_up if v > lvl else a_dn)
        g[i] = lvl
    gain = 10 ** (floor_db * g / 20)
    return np.interp(np.arange(len(dlg)) / w, np.arange(len(gain)), gain).astype(np.float32)


def lufs(x: np.ndarray) -> float:
    """Loudness integrada ITU-R BS.1770-4 (48 kHz), com gates absoluto e relativo."""
    from scipy.signal import lfilter
    x = x if x.ndim == 2 else x[:, None]
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = lfilter(b2, a2, lfilter(b1, a1, x.astype(np.float64), axis=0), axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < blk:
        return -70.0
    idx = np.arange(0, len(y) - blk + 1, hop)
    cs = np.concatenate([np.zeros((1, y.shape[1])), np.cumsum(y ** 2, axis=0)])
    z = (cs[idx + blk] - cs[idx]) / blk
    lk = -0.691 + 10 * np.log10(z.sum(axis=1) + 1e-15)
    g = lk > -70
    if not g.any():
        return -70.0
    rel = -0.691 + 10 * np.log10(z[g].sum(axis=1).mean()) - 10
    g &= lk > rel
    return float(-0.691 + 10 * np.log10(z[g].sum(axis=1).mean()))


def master(mix: np.ndarray, work: Path, out: Path, I=-14.0, limit_db=-2.0):
    """Ganho linear até o alvo + limitador de pico (sem compressão dinâmica de loudness)."""
    L0 = lufs(mix)
    pre = work / "_premaster.wav"
    sf.write(pre, mix * 10 ** ((I - L0) / 20), SR, subtype="FLOAT")
    lim = work / "_limited.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(pre), "-af",
                    f"aresample=192000,alimiter=limit={10 ** (limit_db / 20):.4f}:attack=3:release=60:level=false,"
                    f"aresample={SR}:resampler=soxr", "-c:a", "pcm_f32le", str(lim)], check=True)
    y, _ = sf.read(lim, dtype="float32")
    L1 = lufs(y)
    y = y * 10 ** ((I - L1) / 20)  # correção fina (o limitador tira poucos décimos)
    sf.write(out, y, SR, subtype="PCM_24")
    meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(out), "-af", "ebur128=peak=true", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    summary = meas[meas.rindex("Summary:"):]
    pre.unlink()
    lim.unlink()
    return {"input_lufs": round(L0, 2), "after_limiter_lufs": round(L1, 2), "ebur128_summary": summary}


def build_audio(tl, build: Path, out_wav: Path):
    voices = process_voice(build / "voice48k.wav", build)
    dlg, report = build_dialogue(tl, voices)
    N = len(dlg)
    t_final = tl.end_start + 0.45
    mus = compose(tl.duration, t_final)
    mus = mus[:N] if len(mus) >= N else np.pad(mus, ((0, N - len(mus)), (0, 0)))
    # calibra a trilha em LUFS (medida no trecho da entrevista, sem o encerramento)
    m_lufs = lufs(mus[: int(max(tl.end_start - 1.0, 5.0) * SR)])
    dlg_lufs = lufs(dlg)
    duck = duck_envelope(dlg, floor_db=-11.0)
    t = np.arange(N) / SR
    # entrevista: trilha ~7 dB abaixo da voz sem ducking (≈ 18 dB abaixo sob a fala, medido);
    # encerramento: sobe para ~7 dB abaixo do nível integrado da voz (≈ 2–3 dB abaixo da fala percebida)
    g_int = 10 ** ((dlg_lufs - 7.0 - m_lufs) / 20)
    g_end = 10 ** ((dlg_lufs - 7.0 - m_lufs) / 20)
    swell = np.clip((t - (tl.end_start - 0.5)) / 1.4, 0, 1)
    base = g_int * (1 - swell) + g_end * swell
    music = mus * (base * duck)[:, None]
    sfx = np.zeros((N, 2), np.float32)

    def place(sig, at, gain_db):
        i0 = int(round(at * SR))
        if i0 < 0 or i0 >= N:
            return
        n = min(len(sig), N - i0)
        sfx[i0:i0 + n] += sig[:n] * 10 ** (gain_db / 20)

    if tl.sting_t is not None:
        place(whoosh(0.75), tl.sting_t - 0.42, -31)
    place(whoosh(0.9, seed=5), tl.end_start - 0.30, -32)
    place(shimmer(), tl.end_start + 0.42, -31)
    mix = dlg[:, None] * np.array([[1.0, 1.0]], np.float32) + music + sfx
    sf.write(build / f"{tl.name}_music_stem.wav", music, SR, subtype="FLOAT")
    sf.write(build / f"{tl.name}_dialogue_stem.wav", dlg, SR, subtype="FLOAT")
    rep = master(mix, build, out_wav)
    rep.update({"clips": report, "dialogue_lufs": round(dlg_lufs, 2), "music_raw_lufs": round(m_lufs, 2)})
    return rep


if __name__ == "__main__":
    from plan import VERSIONS
    from timeline import Timeline
    key, build = sys.argv[1], Path(sys.argv[2])
    tl = Timeline(VERSIONS[key])
    rep = build_audio(tl, build, build / f"{tl.name}_audio.wav")
    json.dump(rep, open(build / f"{tl.name}_audio_report.json", "w"), indent=1, ensure_ascii=False, default=float)
    print({k: rep[k] for k in ("input_lufs", "after_limiter_lufs", "dialogue_lufs", "music_raw_lufs")})
    print(rep["ebur128_summary"])
