"""Gera os recursos de marca usados no vídeo a partir dos arquivos OFICIAIS do repositório (esf/brand).

Nada é redesenhado: usa a variação oficial v3-premium (a mesma do site) e as funções do script do
projeto (esf/brand/scripts/export_site_assets.py).

  * esf_selo.png        símbolo sobre o disco preto da marca — exatamente o método do site (on_disc).
  * esf_logo_full.png   logo completa com fundo transparente. O original é um JPEG de 624 px sobre preto;
                        o "matte" do site (limiar 0.03–0.15) deixa ruído de compressão escuro em volta do
                        símbolo, invisível no rodapé preto do site mas visível sobre o roxo do vídeo. Aqui o
                        limiar do matte é 0.10–0.22 e pixels isolados longe das formas são descartados —
                        um ajuste técnico de recorte; desenho, cores e proporções não mudam.
  * esf_simbolo.png     só o símbolo, com o mesmo recorte limpo.

Uso: python brand_assets.py <repo_esf> <pasta_saida>
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

esf = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(esf / "brand" / "scripts"))
from export_site_assets import bbox, on_disc, rgba_from_black, square_crop, srgb_to_oklab, to_image  # noqa: E402

src = esf / "brand" / "variacoes" / "esf-logo-v3-premium.png"  # variação oficial usada no site (1248×1248)
rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float64) / 255


def clean_matte(rgb: np.ndarray, lo=0.10, hi=0.22, near_px=3) -> np.ndarray:
    L = srgb_to_oklab(rgb)[..., 0]
    t = np.clip((L - lo) / (hi - lo), 0, 1)
    a = t * t * (3 - 2 * t)
    core = ndimage.binary_opening(a > 0.85, iterations=1)
    a = a * ndimage.binary_dilation(core, iterations=near_px)
    color = np.where(a[..., None] > 1e-3, np.clip(rgb / np.maximum(a[..., None], 1e-3), 0, 1), 0)
    color = np.where(a[..., None] >= 0.999, rgb, color)
    return np.dstack([color, a])


SYMBOL_ROWS = (200, 810)  # faixa do símbolo (100–405 no original 624 → ×2 na variação 1248)


def symbol_of(rgba: np.ndarray) -> Image.Image:
    sym = rgba.copy()
    sym[: SYMBOL_ROWS[0], :, 3] = 0
    sym[SYMBOL_ROWS[1]:, :, 3] = 0
    return square_crop(to_image(sym), bbox(sym[..., 3]), pad=0.06)


# selo — método oficial do site
on_disc(symbol_of(rgba_from_black(rgb))).save(out / "esf_selo.png")

# logo completa e símbolo com recorte limpo
rgba = clean_matte(rgb)
x0, y0, x1, y1 = bbox(rgba[..., 3])
pad = 16
to_image(rgba).crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad)).save(out / "esf_logo_full.png")
symbol_of(rgba).save(out / "esf_simbolo.png")
print("ok", Image.open(out / "esf_logo_full.png").size, Image.open(out / "esf_selo.png").size)
