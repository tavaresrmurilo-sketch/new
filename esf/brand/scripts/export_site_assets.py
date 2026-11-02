"""
Exporta, a partir de uma variação recolorida, os arquivos que o site usa.

  - src/assets/brand/esf-logo.png      marca completa (símbolo + texto), fundo transparente — para fundos escuros
  - src/assets/brand/esf-simbolo.png   símbolo (globo + pessoas) em quadro quadrado, fundo transparente
                                       (usado para gerar as partículas; fundos escuros)
  - src/assets/brand/esf-selo.png      símbolo sobre o disco preto da marca ("selo") — funciona em qualquer fundo
  - src/app/icon.png, favicon.ico      ícones do navegador (selo)
  - src/app/apple-icon.png             ícone iOS (símbolo sobre o preto da marca)
  - public/icons/icon-192.png / -512   ícones do manifest (PWA), com margem segura
  - src/components/intro/globe/logo-points.ts
                                       amostras (posição + cor) do símbolo para as partículas da abertura

O fundo preto vira transparência por um "matte" de luminosidade, com cor des-premultiplicada nas bordas
(o símbolo funciona sobre fundos escuros e claros, sem halo).

Uso (a partir de esf/):  python3 brand/scripts/export_site_assets.py [v1-institucional | v2-roxo-intenso | v3-premium]
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recolor_logo import SRC, VARIATIONS, recolor, srgb_to_oklab  # noqa: E402

ESF = Path(__file__).resolve().parents[2]
ASSETS = ESF / "src" / "assets" / "brand"
APP = ESF / "src" / "app"
ICONS = ESF / "public" / "icons"
POINTS_TS = ESF / "src" / "components" / "intro" / "globe" / "logo-points.ts"

SYMBOL_ROWS = (100, 405)  # faixa do símbolo no original 624×624


def rgba_from_black(rgb: np.ndarray) -> np.ndarray:
    """Fundo preto → alfa. Pixels claros ficam opacos; só as bordas contra o preto ganham transparência."""
    L = srgb_to_oklab(rgb)[..., 0]
    t = np.clip((L - 0.03) / (0.15 - 0.03), 0, 1)
    alpha = t * t * (3 - 2 * t)
    # o pixel original = cor × α + preto × (1 − α)  →  cor = pixel / α
    color = np.where(alpha[..., None] > 1e-3, np.clip(rgb / np.maximum(alpha[..., None], 1e-3), 0, 1), 0)
    color = np.where(alpha[..., None] >= 0.999, rgb, color)
    return np.dstack([color, alpha])


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")


def bbox(alpha: np.ndarray, threshold: float = 0.04) -> tuple[int, int, int, int]:
    ys, xs = np.where(alpha > threshold)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def square_crop(img: Image.Image, box: tuple[int, int, int, int], pad: float) -> Image.Image:
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    size = round(max(x1 - x0, y1 - y0) * (1 + pad))
    left = round(cx - size / 2)
    top = round(cy - size / 2)
    return img.crop((left, top, left + size, top + size))


def on_black(symbol: Image.Image, size: int, scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    s = round(size * scale)
    canvas.alpha_composite(symbol.resize((s, s), Image.LANCZOS), ((size - s) // 2, (size - s) // 2))
    return canvas.convert("RGB")


def on_disc(symbol: Image.Image) -> Image.Image:
    """Símbolo sobre um disco preto que acompanha o anel do globo (transparente fora do círculo)."""
    size = symbol.width
    ss = 4  # supersampling para a borda do disco
    yy, xx = np.mgrid[0 : size * ss, 0 : size * ss]
    c = (size * ss - 1) / 2
    disc = (np.hypot(xx - c, yy - c) <= size * ss / 2 - ss).astype(np.float64)
    disc = disc.reshape(size, ss, size, ss).mean(axis=(1, 3))
    base = np.zeros((size, size, 4))
    base[..., 3] = disc
    sym = np.asarray(symbol).astype(np.float64) / 255
    a = sym[..., 3:4]
    out = base.copy()
    out[..., :3] = sym[..., :3] * a  # sobre preto
    out[..., 3] = disc  # nada fora do círculo (descarta ruído de compressão na borda)
    return to_image(out)


def compact(img: Image.Image) -> Image.Image:
    """Paleta de 256 cores com alfa: ícones bem menores, sem perda visível nesses tamanhos."""
    return img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)


def kmeans(colors: np.ndarray, k: int, iters: int = 25) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(3)
    centers = colors[rng.choice(len(colors), k, replace=False)]
    for _ in range(iters):
        idx = np.argmin(((colors[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        for j in range(k):
            if np.any(idx == j):
                centers[j] = colors[idx == j].mean(0)
    idx = np.argmin(((colors[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
    return centers, idx


def export_points(symbol: np.ndarray, count: int = 2600) -> None:
    """Amostras ponderadas pela opacidade, em coordenadas [-1, 1] do quadro do símbolo."""
    rng = np.random.default_rng(11)
    h, w = symbol.shape[:2]
    alpha = symbol[..., 3]
    weight = np.where(alpha > 0.55, alpha**2, 0).ravel()
    weight /= weight.sum()
    picks = rng.choice(h * w, size=count, replace=False, p=weight)
    ys, xs = np.divmod(picks, w)
    jx = xs + rng.random(count) - 0.5
    jy = ys + rng.random(count) - 0.5
    nx = np.clip(np.round((jx + 0.5) / w * 2 - 1, 4) * 127, -127, 127).astype(np.int8)
    ny = np.clip(np.round((jy + 0.5) / h * 2 - 1, 4) * 127, -127, 127).astype(np.int8)
    centers, idx = kmeans(symbol[ys, xs, :3], 12)
    raw = np.stack([nx.view(np.uint8), ny.view(np.uint8), idx.astype(np.uint8)], axis=1).ravel().tobytes()
    palette = ", ".join(f'"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"' for r, g, b in centers)
    POINTS_TS.write_text(
        "// Arquivo gerado por brand/scripts/export_site_assets.py — não edite à mão.\n"
        "// Amostras do símbolo da ESF (posição em [-1, 1] no quadro de esf-simbolo.png e cor) usadas para que\n"
        "// as partículas da abertura formem a marca real antes de a imagem nítida aparecer.\n"
        "// Codificação: base64 de triplas de bytes (x int8, y int8, índice da paleta).\n\n"
        f"export const LOGO_POINTS_COUNT = {count};\n"
        f"export const LOGO_PALETTE = [{palette}] as const;\n"
        f'export const LOGO_POINTS_B64 =\n  "{base64.b64encode(raw).decode()}";\n'
    )


def main() -> None:
    variant = sys.argv[1] if len(sys.argv) > 1 else "v3-premium"
    if variant not in VARIATIONS:
        raise SystemExit(f"variação desconhecida: {variant} (opções: {', '.join(VARIATIONS)})")
    for d in (ASSETS, ICONS):
        d.mkdir(parents=True, exist_ok=True)

    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float64) / 255
    rgba = rgba_from_black(recolor(rgb, VARIATIONS[variant]))
    full = to_image(rgba)

    # marca completa
    x0, y0, x1, y1 = bbox(rgba[..., 3])
    pad = 8
    full.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad)).save(ASSETS / "esf-logo.png", optimize=True)

    # símbolo (quadro quadrado centrado no globo)
    sym_rows = rgba.copy()
    sym_rows[: SYMBOL_ROWS[0], :, 3] = 0
    sym_rows[SYMBOL_ROWS[1] :, :, 3] = 0
    symbol = square_crop(to_image(sym_rows), bbox(sym_rows[..., 3]), pad=0.06)
    symbol.save(ASSETS / "esf-simbolo.png", optimize=True)
    seal = on_disc(symbol)
    seal.save(ASSETS / "esf-selo.png", optimize=True)

    # ícones
    compact(seal.resize((192, 192), Image.LANCZOS)).save(APP / "icon.png", optimize=True)
    seal.resize((48, 48), Image.LANCZOS).save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    compact(on_black(symbol, 180, 0.8).convert("RGBA")).save(APP / "apple-icon.png", optimize=True)
    compact(on_black(symbol, 192, 0.72).convert("RGBA")).save(ICONS / "icon-192.png", optimize=True)
    compact(on_black(symbol, 512, 0.72).convert("RGBA")).save(ICONS / "icon-512.png", optimize=True)

    export_points(np.asarray(symbol).astype(np.float64) / 255)
    print(f"ok — variação {variant}: logo {full.crop((x0, y0, x1, y1)).size}, símbolo {symbol.size}")


if __name__ == "__main__":
    main()
