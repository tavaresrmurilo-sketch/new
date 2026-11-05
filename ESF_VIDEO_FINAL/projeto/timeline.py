"""Converte o roteiro (plan.py) em linha do tempo de saída: segmentos, legendas, gancho, vinheta e tarjas."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from plan import CAPTIONS, HOOK_A, HOOK_B

VOWELS = re.compile(r"[aeiouáéíóúâêôãõàüy]+", re.I)


@dataclass
class Seg:
    kind: str
    out0: float
    out1: float
    src0: float = 0.0
    src1: float = 0.0
    spk: str = ""
    cam0: str = ""
    cam1: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def dur(self):
        return self.out1 - self.out0


@dataclass
class Word:
    text: str
    style: str      # "", "o" (laranja), "r" (rosa)
    t: float        # instante (saída) em que a palavra "acende"


@dataclass
class Caption:
    t0: float
    t1: float
    spk: str
    words: list
    stitch: bool


def parse_markup(text: str):
    """'*a b*' → laranja, '_a_' → rosa. Retorna [(palavra, estilo)]."""
    out, style = [], ""
    for tok in text.split():
        s = style
        core = tok
        if core.startswith("*"):
            s, core = "o", core[1:]
            style = "o"
        elif core.startswith("_"):
            s, core = "r", core[1:]
            style = "r"
        close = False
        m = re.search(r"[*_]([.,!?;:]*)$", core)
        if m:
            core = core[: m.start()] + m.group(1)
            close = True
        out.append((core, s))
        if close:
            style = ""
    return out


def syllables(w: str) -> int:
    return max(1, len(VOWELS.findall(w)))


class Timeline:
    def __init__(self, version: dict, fps: int = 30):
        self.name = version["name"]
        self.fps = fps
        self.segs: list[Seg] = []
        t = 0.0
        for s in version["segments"]:
            if s[0] == "clip":
                _, a, b, spk, c0, c1, extra = s
                self.segs.append(Seg("clip", t, t + (b - a), a, b, spk, c0, c1, dict(extra)))
                t += b - a
            else:
                self.segs.append(Seg("end", t, t + s[1]))
                t += s[1]
        # duração arredondada para quadros inteiros
        self.duration = round(t * fps) / fps
        self.end_start = next(s.out0 for s in self.segs if s.kind == "end")
        self.hook_end = max((s.out1 for s in self.segs if "hook" in s.extra), default=0.0)
        self.hook_kind = next((s.extra["hook"] for s in self.segs if "hook" in s.extra), None)
        sting_seg = next((s for s in self.segs if s.extra.get("sting_before")), None)
        self.sting_t = sting_seg.out0 if sting_seg else None
        self.captions = self._map_captions()
        self.hook_lines = self._map_hook()
        self.lower_thirds = [(s.extra["lt"][0], s.out0 + s.extra["lt"][1], s.out0 + s.extra["lt"][2])
                             for s in self.segs if "lt" in s.extra]

    # ------------------------------------------------------------------
    def src_to_out(self, src_t: float):
        """Todos os instantes de saída em que o instante original src_t aparece (clipes não-gancho)."""
        res = []
        for s in self.segs:
            if s.kind == "clip" and s.src0 - 1e-6 <= src_t <= s.src1 + 1e-6:
                res.append((s, s.out0 + (src_t - s.src0)))
        return res

    def at(self, t_out: float):
        for s in self.segs:
            if s.out0 - 1e-9 <= t_out < s.out1 - 1e-9:
                return s
        return self.segs[-1]

    def _map_captions(self):
        caps = []
        for (a, b, spk, text, stitch) in CAPTIONS:
            for s in self.segs:
                if s.kind != "clip" or "hook" in s.extra:
                    continue
                lo, hi = max(a, s.src0), min(b, s.src1)
                if hi - lo < 0.25:
                    continue
                # junta clipes contíguos (cortes virtuais) numa legenda só
                t0 = s.out0 + (lo - s.src0)
                t1 = s.out0 + (hi - s.src0)
                if caps and caps[-1][4] == (a, b) and abs(caps[-1][1] - t0) < 1e-3:
                    caps[-1][1] = t1
                    continue
                caps.append([t0, t1, spk, text, (a, b), stitch])
        out = []
        for t0, t1, spk, text, _, stitch in caps:
            toks = parse_markup(text)
            syl = [syllables(w) for w, _ in toks]
            total = sum(syl)
            span = max(t1 - t0, 0.3)
            acc, words = 0, []
            for (w, st), n in zip(toks, syl):
                words.append(Word(w, st, t0 + span * acc / total - 0.06))
                acc += n
            out.append(Caption(t0, t1, spk, words, stitch))
        # evita sobreposição: a legenda seguinte só entra quando a anterior sai
        for i in range(len(out) - 1):
            if out[i].t1 > out[i + 1].t0 - 0.05:
                out[i].t1 = out[i + 1].t0 - 0.05
        return out

    def _map_hook(self):
        spec = {"A": HOOK_A, "B": HOOK_B}.get(self.hook_kind)
        if not spec:
            return []
        hook_segs = [s for s in self.segs if "hook" in s.extra]
        lines = []
        for text, style, words in spec:
            ws = []
            for w, src_t in words:
                for s in hook_segs:
                    if s.src0 - 0.25 <= src_t <= s.src1:
                        ws.append((w, max(s.out0, s.out0 + (src_t - s.src0))))
                        break
            if ws:
                lines.append((text, style, ws))
        return lines
