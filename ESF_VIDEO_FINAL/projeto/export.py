"""Exporta, para cada versão: legenda SRT (pt-BR) e EDL CMX 3600 (importável no DaVinci Resolve/Premiere).

A SRT cobre TODA a fala do vídeo final — inclusive o gancho, que na tela aparece como texto animado.
Uso: python export.py <pasta_saida> [nome_do_arquivo_original]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plan import CAPTIONS, VERSIONS  # noqa: E402
from textbreak import best_break  # noqa: E402
from timeline import Timeline, parse_markup  # noqa: E402

FPS = 30


def ts_srt(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def tc(t: float, base_h: int = 0) -> str:
    f = int(round(t * FPS))
    h, f = divmod(f, 3600 * FPS)
    m, f = divmod(f, 60 * FPS)
    s, f = divmod(f, FPS)
    return f"{h + base_h:02d}:{m:02d}:{s:02d}:{f:02d}"


def wrap2(text: str, maxc: int = 34) -> str:
    words = text.split()
    lines = best_break(words, [len(w) for w in words], 1, maxc)
    return "\n".join(" ".join(words[i] for i in ln) for ln in lines)


def srt_for(tl: Timeline) -> str:
    items = []
    for (a, b, spk, text, _st) in CAPTIONS:
        plain = " ".join(w for w, _ in parse_markup(text))
        for s in tl.segs:
            if s.kind != "clip":
                continue
            lo, hi = max(a, s.src0), min(b, s.src1)
            if hi - lo < 0.25:
                continue
            t0, t1 = s.out0 + (lo - s.src0), s.out0 + (hi - s.src0)
            if items and items[-1][2] == plain and abs(items[-1][1] - t0) < 1e-3:
                items[-1][1] = t1
            else:
                items.append([t0, t1, plain])
    items.sort()
    for i in range(len(items) - 1):
        items[i][1] = min(items[i][1] + 0.15, items[i + 1][0] - 0.04)  # leve folga de leitura
    out = []
    for i, (t0, t1, text) in enumerate(items, 1):
        out.append(f"{i}\n{ts_srt(t0)} --> {ts_srt(t1)}\n{wrap2(text)}\n")
    return "\n".join(out)


def edl_for(tl: Timeline, clip_name: str) -> str:
    lines = [f"TITLE: {tl.name}", "FCM: NON-DROP FRAME", ""]
    n = 1
    for s in tl.segs:
        rec0, rec1 = tc(s.out0, 1), tc(s.out1, 1)
        if s.kind == "clip":
            lines.append(f"{n:03d}  AX       AA/V  C        {tc(s.src0)} {tc(s.src1)} {rec0} {rec1}")
            lines.append(f"* FROM CLIP NAME: {clip_name}")
            quem = {"M": "MANUELA", "T": "THAIS"}[s.spk]
            lines.append(f"* FALA: {quem} | CAMERA VIRTUAL: {s.cam0} -> {s.cam1}"
                         + (" | GANCHO" if "hook" in s.extra else "")
                         + (" | VINHETA ESF ANTES" if s.extra.get("sting_before") else ""))
        else:
            lines.append(f"{n:03d}  BL       AA/V  C        00:00:00:00 {tc(s.dur)} {rec0} {rec1}")
            lines.append("* ENCERRAMENTO ESF (GRAFICO GERADO) - LOGO, 'CADA PONTO, UM FUTURO SENDO BORDADO.', CTA E SITE")
        lines.append("")
        n += 1
    return "\n".join(lines)


if __name__ == "__main__":
    out = Path(sys.argv[1])
    clip = sys.argv[2] if len(sys.argv) > 2 else "1000077465.mp4"
    out.mkdir(parents=True, exist_ok=True)
    for key, v in VERSIONS.items():
        tl = Timeline(v)
        (out / f"{tl.name}.srt").write_text(srt_for(tl), encoding="utf-8")
        (out / f"{tl.name}.edl").write_text(edl_for(tl, clip), encoding="utf-8")
        print("ok", tl.name, f"{tl.duration:.2f}s")
