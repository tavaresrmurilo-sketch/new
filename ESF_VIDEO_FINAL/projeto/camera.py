"""Câmera virtual: enquadramentos (zoom/pan) definidos em coordenadas da CENA e convertidos para o quadro.

A gravação original deriva lentamente (câmera na mão/apoiada; até ~50 px na horizontal e ~80 px na
vertical). O movimento da cena é estimado pela janela (prepare_source.py) e suavizado; a câmera virtual o
acompanha, então o enquadramento fica estável e os movimentos que se veem são só os planejados.

Restrições (em coordenadas do quadro original 464×816):
  * nunca sai do quadro;
  * o selo antigo, gravado no canto superior direito (x 399–438, y 25–70) em todo o vídeo, fica fora
    do recorte (y0 ≥ 76);
  * entre 0.28 s e 6.75 s do original, o título "Entrevista" (y < 136) e as tarjas de nome antigas
    (y > 729) também ficam fora (y0 ≥ 140, y1 ≤ 727).
Proporção do recorte: exatamente 9:16 (1080×1920), sem distorção.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
from scipy.ndimage import gaussian_filter1d

W, H = 464, 816
ASPECT = 1080 / 1920


class SceneMotion:
    def __init__(self, path: str, sigma_s: float = 0.35):
        m = np.load(path)
        self.t = m[:, 0]
        step = float(np.median(np.diff(self.t)))
        self.P = gaussian_filter1d(m[:, 1:], sigma=sigma_s / step, axis=0, mode="nearest")

    def M(self, t: float) -> np.ndarray:
        t = float(np.clip(t, self.t[0], self.t[-1]))
        i = int(np.clip(np.searchsorted(self.t, t) - 1, 0, len(self.t) - 2))
        a = (t - self.t[i]) / (self.t[i + 1] - self.t[i])
        return ((1 - a) * self.P[i] + a * self.P[i + 1]).reshape(2, 3)


@dataclass
class Shot:
    zoom: float          # 1.0 = altura inteira do quadro
    target: str          # "M" (Manuela), "T" (Thais), "MID" (entre as duas)
    u: float             # posição horizontal desejada do alvo na tela (0..1)
    v: float             # posição vertical desejada do alvo na tela (0..1)


SHOTS = {
    "W":   Shot(1.16, "MID", 0.50, 0.565),   # plano conjunto (as duas)
    "W2":  Shot(1.21, "MID", 0.50, 0.57),    # conjunto um pouco mais fechado
    "MT":  Shot(1.33, "T", 0.64, 0.565),     # plano médio Thais
    "MT2": Shot(1.42, "T", 0.62, 0.56),      # médio mais fechado Thais
    "MM":  Shot(1.33, "M", 0.36, 0.565),     # plano médio Manuela
    "MM2": Shot(1.42, "M", 0.38, 0.56),      # médio mais fechado Manuela
}


def ease(x: float) -> float:
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


class Camera:
    def __init__(self, motion_path: str, faces_path: str):
        self.motion = SceneMotion(motion_path)
        f = json.load(open(faces_path))
        self.faces = {"M": np.array(f["Manuela"]), "T": np.array(f["Thais"])}
        self.faces["MID"] = (self.faces["M"] + self.faces["T"]) / 2

    @staticmethod
    def lerp_shot(a: Shot, b: Shot, k: float):
        return a, b, k

    def box(self, src_t: float, shot_a: str, shot_b: str | None = None, k: float = 0.0):
        """Recorte (x0, y0, x1, y1) no quadro original para o instante src_t."""
        A = SHOTS[shot_a]
        B = SHOTS[shot_b] if shot_b else A
        e = ease(k)
        zoom = A.zoom + (B.zoom - A.zoom) * e
        tgt = self.faces[A.target] * (1 - e) + self.faces[B.target] * e
        u = A.u + (B.u - A.u) * e
        v = A.v + (B.v - A.v) * e
        ch = H / zoom
        cw = ch * ASPECT
        cx_ref = tgt[0] + (0.5 - u) * cw
        cy_ref = tgt[1] + (0.5 - v) * ch
        M = self.motion.M(src_t)
        s = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))
        cx, cy = M @ np.array([cx_ref, cy_ref, 1.0])
        cw, ch = cw * s, ch * s
        return self.constrain(src_t, cx, cy, cw, ch)

    @staticmethod
    def constrain(src_t, cx, cy, cw, ch):
        ymin, ymax = 76.0, float(H)
        if 0.28 <= src_t <= 6.75:
            ymin, ymax = 140.0, 727.0
        if ch > ymax - ymin:
            ch = ymax - ymin
            cw = ch * ASPECT
        if cw > W:
            cw = float(W)
            ch = cw / ASPECT
        x0 = min(max(cx - cw / 2, 0.0), W - cw)
        y0 = min(max(cy - ch / 2, ymin), ymax - ch)
        return (x0, y0, x0 + cw, y0 + ch)
