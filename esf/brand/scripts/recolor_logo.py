"""
Recolor profissional da logo da ESF.

Mantém símbolo, texto, composição, tipografia e fundo preto exatamente como no original;
altera apenas cores. O trabalho é feito no espaço perceptual OKLCH:

  - a luminosidade relativa de cada pixel é preservada (com um ganho por família de cor),
    o que mantém gradientes, profundidade e o antisserrilhado contra o preto;
  - a matiz é remapeada por uma curva contínua (ameixa → roxo, carmim → magenta/rosa,
    laranja-avermelhado → laranja quente), sem bordas duras entre famílias;
  - o croma recebe um ganho e é limitado ao gamut sRGB;
  - os textos recebem um alvo de luminosidade próprio, garantindo legibilidade no preto.

Uso (a partir de esf/):  python3 brand/scripts/recolor_logo.py
Requisitos: Python 3.10+, Pillow e NumPy.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "original" / "esf-logo-original.jpg"
OUT = ROOT / "variacoes"

# Faixas (linhas) do original 624×624: símbolo, "EMPREENDENDO", "SEM FRONTEIRAS"
TEXT_TOP = (412, 475)
TEXT_BOTTOM = (476, 545)


# ------------------------------------------------------------------
# Conversões sRGB ↔ OKLab (Björn Ottosson)
# ------------------------------------------------------------------

def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    r, g, b = np.moveaxis(srgb_to_linear(rgb), -1, 0)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack(
        [
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
        ],
        axis=-1,
    )


def oklab_to_linear(lab: np.ndarray) -> np.ndarray:
    L, a, b = np.moveaxis(lab, -1, 0)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    return np.stack(
        [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        ],
        axis=-1,
    )


def lch_to_srgb(L: np.ndarray, C: np.ndarray, h_deg: np.ndarray) -> np.ndarray:
    """OKLCH → sRGB com mapeamento de gamut por redução de croma (mantém L e h)."""
    h = np.radians(h_deg)
    lo = np.zeros_like(C)
    hi = C.copy()
    # busca binária do maior croma dentro do gamut
    for _ in range(18):
        mid = (lo + hi) / 2
        lin = oklab_to_linear(np.stack([L, mid * np.cos(h), mid * np.sin(h)], axis=-1))
        ok = np.all((lin >= -1e-4) & (lin <= 1 + 1e-4), axis=-1)
        lo = np.where(ok, mid, lo)
        hi = np.where(ok, hi, mid)
    full = oklab_to_linear(np.stack([L, C * np.cos(h), C * np.sin(h)], axis=-1))
    inside = np.all((full >= -1e-4) & (full <= 1 + 1e-4), axis=-1)
    Cf = np.where(inside, C, lo)
    lin = oklab_to_linear(np.stack([L, Cf * np.cos(h), Cf * np.sin(h)], axis=-1))
    return linear_to_srgb(lin)


# ------------------------------------------------------------------
# Variações
# ------------------------------------------------------------------

def interp_hue(h: np.ndarray, anchors: list[tuple[float, float]]) -> np.ndarray:
    """Curva de matiz periódica e contínua (graus): âncoras (entrada→saída) cobrindo o círculo inteiro."""
    pts = sorted(anchors)
    xs = np.array([x for x, _ in pts] + [pts[0][0] + 360], dtype=float)
    ys = np.degrees(np.unwrap(np.radians([y for _, y in pts] + [pts[0][1]]), period=2 * np.pi))
    if ys[-1] < ys[-2]:  # fecha o círculo de forma monótona
        ys[-1] += 360
    hh = np.where(h < xs[0], h + 360, h)
    return np.interp(hh, xs, ys) % 360


def family_weights(h_out: np.ndarray) -> dict[str, np.ndarray]:
    """Pesos suaves das famílias de cor, a partir da matiz já remapeada."""
    d = lambda c: np.abs(((h_out - c + 180) % 360) - 180)
    purple = np.clip(1 - (d(295) - 20) / 25, 0, 1)
    rose = np.clip(1 - (d(4) - 18) / 18, 0, 1)
    orange = np.clip(1 - (d(50) - 14) / 18, 0, 1)
    total = purple + rose + orange + 1e-6
    return {"purple": purple / total, "rose": rose / total, "orange": orange / total}


VARIATIONS = {
    # 1 — equilibrada e institucional: roxo #6F2DBD, magenta/rosa #C2185B–#E91E63, laranja #F97316
    "v1-institucional": {
        "anchors": [(5, 350), (11, 4), (22, 14), (32, 44), (45, 52), (90, 70), (200, 286), (300, 290), (325, 295), (349, 300), (359.5, 304)],
        "L": {"purple": 1.5, "rose": 1.24, "orange": 1.13},
        "C": {"purple": 1.75, "rose": 1.32, "orange": 1.12},
        "text_top": (0.64, 0.19, 296),  # roxo claro e legível
        "text_bottom": (0.62, 0.21, 6),  # rosa avermelhado
    },
    # 2 — roxo mais forte e marcante: a marca puxa para o roxo e o magenta
    "v2-roxo-intenso": {
        "anchors": [(5, 330), (11, 346), (22, 0), (32, 30), (45, 46), (90, 70), (200, 284), (300, 286), (325, 290), (349, 296), (359.5, 300)],
        "L": {"purple": 1.42, "rose": 1.2, "orange": 1.1},
        "C": {"purple": 2.1, "rose": 1.4, "orange": 1.15},
        "text_top": (0.6, 0.24, 292),
        "text_bottom": (0.6, 0.23, 352),
    },
    # 3 — premium: roxo profundo, rosa contido, laranja suave e texto lavanda
    "v3-premium": {
        "anchors": [(5, 348), (11, 0), (22, 6), (32, 42), (45, 56), (90, 70), (200, 289), (300, 291), (325, 293), (349, 298), (359.5, 302)],
        "L": {"purple": 1.3, "rose": 1.12, "orange": 1.16},
        "C": {"purple": 1.45, "rose": 0.98, "orange": 0.9},
        "text_top": (0.93, 0.038, 294),  # lavanda quase branca (#F5F3FF como referência)
        "text_bottom": (0.79, 0.135, 56),  # laranja suave (#FB923C)
    },
}


def blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """Desfoque gaussiano separável (sem dependências extras)."""
    r = int(np.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode="edge"), k, mode="valid"), 0, img)
    return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode="edge"), k, mode="valid"), 1, out)


def recolor(rgb: np.ndarray, cfg: dict) -> np.ndarray:
    lab = srgb_to_oklab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    # A matiz vem de uma versão levemente desfocada (ponderada pelo croma) dos canais a/b: pixels de borda,
    # quase pretos e de matiz instável, herdam a cor da forma a que pertencem. A luminosidade segue nítida.
    wsum = blur(C, 1.4) + 1e-6
    a_s = blur(a * C, 1.4) / wsum
    b_s = blur(b * C, 1.4) / wsum
    h = (np.degrees(np.arctan2(b_s, a_s)) + 360) % 360

    h2 = interp_hue(h, cfg["anchors"])
    w = family_weights(h2)
    gL = sum(w[k] * cfg["L"][k] for k in w)
    gC = sum(w[k] * cfg["C"][k] for k in w)
    L2 = np.clip(L * gL, 0, 0.98)
    C2 = C * gC

    # textos: luminosidade e cor-alvo próprias, proporcionais à cobertura do pixel (preserva o antisserrilhado)
    rows = np.arange(rgb.shape[0])[:, None] * np.ones((1, rgb.shape[1]))
    for band, key in ((TEXT_TOP, "text_top"), (TEXT_BOTTOM, "text_bottom")):
        sel = (rows >= band[0]) & (rows <= band[1])
        if not sel.any():
            continue
        Lt, Ct, ht = cfg[key]
        # Em volta das letras há um halo muito escuro (sombra/compressão, L ≈ 0,03–0,11) quase invisível
        # no original; a cobertura é medida entre esse halo e o preenchimento, para que ele siga preto.
        halo = 0.11
        fill = np.percentile(L[sel & (L > 0.15)], 75)
        cov = np.clip((L - halo) / (fill - halo), 0, 1)
        L2 = np.where(sel, Lt * cov, L2)
        C2 = np.where(sel, Ct * cov, C2)
        h2 = np.where(sel, ht, h2)

    # o preto continua preto (ruído de compressão fica abaixo do limiar)
    dark = L < 0.035
    L2 = np.where(dark, 0, L2)
    C2 = np.where(dark, 0, C2)
    return lch_to_srgb(L2, C2, h2)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    rgb = np.asarray(src).astype(np.float64) / 255
    results = {"original": src}
    for name, cfg in VARIATIONS.items():
        out = recolor(rgb, cfg)
        img = Image.fromarray(np.round(out * 255).astype(np.uint8), "RGB")
        results[name] = img
        # 2× (1248 px) para uso em materiais; o original tem 624 px
        img.resize((src.width * 2, src.height * 2), Image.LANCZOS).save(OUT / f"esf-logo-{name}.png", optimize=True)
        print("ok", name)

    # prancha comparativa
    tile = 460
    labels = list(results)
    sheet = Image.new("RGB", (tile * len(labels), tile), (0, 0, 0))
    for i, k in enumerate(labels):
        sheet.paste(results[k].resize((tile, tile), Image.LANCZOS), (i * tile, 0))
    sheet.save(OUT / "comparativo.png", optimize=True)
    print("ok comparativo")


if __name__ == "__main__":
    main()
