"""Correção de imagem da ESF — aplicada na resolução original (464×816), antes do redimensionamento.

Etapas (todas globais ou com filtro de bordas preservadas; nada reconstrói detalhes):
  1. Sombras/realces locais: a luminância é separada em "base" (iluminação, filtro guiado que respeita
     bordas, sem halos) e "detalhe". Só a base é comprimida — as pessoas a contraluz clareiam e a
     janela estourada desce — e o detalhe volta com ganho 1.0 (sem realce artificial).
  2. Balanço de branco moderado (menos amarelo, mantendo o calor natural da luz do sol).
  3. Curva de contraste suave + ponto de preto, vibrance com proteção de tons de pele.

O desfoque do rosto da criança é preservado: nenhuma etapa aumenta o detalhe local
(ganho de detalhe = 1.0) e não há restauração facial nem nitidez nesta etapa.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def box(x, r):
    return ndimage.uniform_filter(x, size=2 * r + 1, mode="reflect")


def guided_filter(I, p, r, eps):
    mI, mp = box(I, r), box(p, r)
    cov = box(I * p, r) - mI * mp
    var = box(I * I, r) - mI * mI
    a = cov / (var + eps)
    b = mp - a * mI
    return box(a, r) * I + box(b, r)


class Grade:
    def __init__(self, shadow_lift=0.30, highlight_comp=0.45, pivot=-1.55, wb=(0.99, 1.0, 1.015),
                 contrast=0.20, black=0.035, vibrance=0.12, exposure=0.08):
        self.shadow_lift = shadow_lift
        self.highlight_comp = highlight_comp
        self.pivot = pivot          # log2 da luminância de referência (≈ 0.34 linear… meio-tom)
        self.wb = np.array(wb, np.float32)
        self.contrast = contrast
        self.black = black
        self.vibrance = vibrance
        self.exposure = exposure    # em stops

    def __call__(self, rgb8: np.ndarray) -> np.ndarray:
        x = rgb8.astype(np.float32) / 255.0
        lin = srgb_to_lin(x)
        lin = lin * self.wb[None, None, :] * (2.0 ** self.exposure)
        Y = np.maximum((lin * LUMA).sum(-1), 1e-5)
        L = np.log2(Y)
        # base (iluminação) com filtro guiado em log — preserva bordas (janela × pessoas)
        base = guided_filter(L, L, r=14, eps=0.35)
        detail = L - base
        d = base - self.pivot
        # abaixo do pivô: comprime para cima (clareia sombras); acima: comprime para baixo (segura a janela)
        k = np.where(d < 0, 1.0 - self.shadow_lift, 1.0 - self.highlight_comp)
        base2 = self.pivot + d * k
        L2 = base2 + detail * 1.0
        gain = np.power(2.0, L2 - L)[..., None]
        out = lin * gain
        # rolagem suave dos realces (evita branco chapado)
        out = out / (1.0 + np.maximum(out - 0.80, 0) * 0.9)
        s = lin_to_srgb(out)
        # curva S suave em torno de 0.45 + ponto de preto
        c = self.contrast
        s = s + c * (s - 0.45) * (1 - np.abs(2 * s - 1))
        s = np.clip((s - self.black) / (1 - self.black), 0, 1)
        # vibrance: satura mais o que é pouco saturado; protege tons de pele (matiz laranja)
        mx, mn = s.max(-1, keepdims=True), s.min(-1, keepdims=True)
        sat = (mx - mn) / (mx + 1e-4)
        r, g, b = s[..., 0:1], s[..., 1:2], s[..., 2:3]
        skin = np.clip(1 - np.abs(((r - g) / (mx - mn + 1e-4)) - 0.45) * 2.5, 0, 1) * (r > b)
        amt = self.vibrance * (1 - sat) * (1 - 0.7 * skin)
        gray = (s * LUMA).sum(-1, keepdims=True)
        s = gray + (s - gray) * (1 + amt)
        return (np.clip(s, 0, 1) * 255 + 0.5).astype(np.uint8)


GLITCH_FRAMES_T = [8.012, 9.897, 10.930, 25.967, 26.000, 39.002, 40.068, 51.738]
