"""Posicionamento das legendas acima das cabeças.

Padrão: base da caixa em y=860. Quando a câmera original "subiu" (as pessoas aparecem mais alto no
quadro), a legenda sobe o necessário para manter ≥ 28 px de folga acima da cabeça (estimativa generosa,
com cabelo) durante TODO o tempo em que fica na tela — e não se mexe enquanto está visível.
"""
from __future__ import annotations

import numpy as np

OW, OH = 1080, 1920
HEAD_R_REF = 46.0     # raio da cabeça com cabelo (coordenadas da cena de referência)
CLEARANCE = 28.0
MIN_TOP = 300.0       # nunca acima disso (zona segura dos apps)
STEP = 24.0


def head_boxes(tl, cam, t):
    """Retângulos (x0, y0, x1, y1) das cabeças no quadro de saída no instante t (lista vazia fora de clipe)."""
    s = tl.at(t)
    if s.kind != "clip":
        return []
    src_t = s.src0 + (t - s.out0)
    k = (t - s.out0) / max(s.dur, 1e-6)
    x0, y0, x1, y1 = cam.box(src_t, s.cam0, s.cam1, k)
    M = cam.motion.M(src_t)
    sc = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))
    sx, sy = OW / (x1 - x0), OH / (y1 - y0)
    out = []
    for who in ("M", "T"):
        px, py = M @ np.array([*cam.faces[who], 1.0])
        cx, cy = (px - x0) * sx, (py - y0) * sy
        r = HEAD_R_REF * sc * sx
        if -r < cx < OW + r:
            out.append((who, cx - r, cy - 1.25 * r, cx + r, cy + r))
    return out


def assign_caption_bottoms(cl, tl, cam):
    """Define cl.bottoms[i] para cada legenda (y da base da caixa)."""
    for i, cap in enumerate(cl.caps):
        x0, y0, bw, bh, *_ = cl.layout(i)
        bottom = float(cl.BOTTOM)
        for t in np.arange(cap.t0 - 0.15, cap.t1 + 0.15, 1 / 30):
            for (_w, hx0, hy0, hx1, _hy1) in head_boxes(tl, cam, float(t)):
                if hx0 < x0 + bw and x0 < hx1:
                    bottom = min(bottom, hy0 - CLEARANCE)
        # degraus de 24 px: legendas vizinhas ficam alinhadas (sem micro-saltos de poucos pixels)
        need = max(0.0, cl.BOTTOM - bottom)
        bottom = cl.BOTTOM - STEP * np.ceil(need / STEP - 1e-9)
        bottom = max(bottom, MIN_TOP + bh)
        cl.set_bottom(i, int(round(bottom)))
