"""Camadas gráficas da ESF (1080×1920): legendas, tarjas, selo, gancho animado, vinheta e encerramento.

Identidade: paleta oficial (esf/src/lib/palette.ts), fontes oficiais do site (Manrope + Instrument
Serif, OFL) e a logo oficial (brand_assets.py). Elemento gráfico próprio do vídeo: o "ponto de bordado"
(pesponto tracejado que se desenha), ligado à mensagem "Cada ponto, um futuro sendo bordado." e ao
bastidor de bordado que aparece na entrevista.

Zonas seguras para Reels/Stories: nada essencial acima de y=220 nem abaixo de y=1500; legendas no
terço médio-superior (base em y=860), acima das cabeças — nunca cobrem rostos, a criança ou o bastidor.
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from textbreak import best_break

OW, OH = 1080, 1920

PAL = {
    "purple": (0x6F, 0x2D, 0xBD), "purpleDark": (0x4A, 0x1D, 0x96), "purpleDeep": (0x2E, 0x10, 0x65),
    "magenta": (0xC2, 0x18, 0x5B), "rose": (0xE9, 0x1E, 0x63), "orange": (0xF9, 0x73, 0x16),
    "orangeSoft": (0xFB, 0x92, 0x3C), "night": (0x0B, 0x06, 0x14), "night2": (0x17, 0x0D, 0x2B),
    "lavender": (0xF5, 0xF3, 0xFF),
    # "vinho": derivado da paleta (magenta escurecido com night) — não é cor nova da marca
    "wine": (0x70, 0x10, 0x3B),
}
WHITE = (255, 255, 255)
STYLE_COLOR = {"": WHITE, "o": PAL["orangeSoft"], "r": PAL["rose"]}

FONT_DIR = Path(__file__).resolve().parent / "fonts"
BRAND_DIR = None  # definido por set_brand_dir()


def set_brand_dir(p):
    global BRAND_DIR
    BRAND_DIR = Path(p)


@lru_cache(maxsize=64)
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / f"{name}.ttf"), size)


# ----------------------------------------------------------------------------- utilidades
def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def ease_out_cubic(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x, s=1.4):
    x = clamp01(x)
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def with_alpha(sprite: Image.Image, a: float) -> Image.Image:
    if a >= 0.999:
        return sprite
    sp = sprite.copy()
    sp.putalpha(sprite.getchannel("A").point(lambda v: int(v * a + 0.5)))
    return sp


def blit(base: Image.Image, sprite: Image.Image, x: float, y: float, alpha: float = 1.0, scale: float = 1.0,
         anchor: str = "lt"):
    """Compõe sprite RGBA em base RGBA, com opacidade, escala e âncora ('lt', 'ct', 'cc', 'lc'...)."""
    if alpha <= 0.003:
        return
    sp = sprite
    if abs(scale - 1) > 1e-3:
        sp = sp.resize((max(1, round(sp.width * scale)), max(1, round(sp.height * scale))), Image.BICUBIC)
    sp = with_alpha(sp, alpha)
    w, h = sp.size
    if anchor[0] == "c":
        x -= w / 2
    elif anchor[0] == "r":
        x -= w
    if anchor[1] == "c":
        y -= h / 2
    elif anchor[1] == "b":
        y -= h
    x, y = int(round(x)), int(round(y))
    sx0, sy0 = max(0, -x), max(0, -y)
    sx1, sy1 = min(w, OW - x), min(h, OH - y)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    if (sx0, sy0, sx1, sy1) != (0, 0, w, h):
        sp = sp.crop((sx0, sy0, sx1, sy1))
    base.alpha_composite(sp, dest=(x + sx0, y + sy0))


def rounded_mask(w, h, r, ss=3) -> Image.Image:
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def text_sprite(text, fnt, color, shadow=(0, 0, 0), shadow_alpha=0.45, shadow_blur=3, shadow_dy=3, pad=14,
                tracking=0.0):
    """Texto com sombra suave. Retorna (sprite, ox, oy) — (ox, oy) é o deslocamento da origem na linha de base."""
    asc, desc = fnt.getmetrics()
    if tracking:
        widths = [fnt.getlength(c) for c in text]
        tw = sum(widths) + tracking * (len(text) - 1)
    else:
        tw = fnt.getlength(text)
    W = int(math.ceil(tw)) + 2 * pad
    H = asc + desc + 2 * pad
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    if tracking:
        x = pad
        for c, wc in zip(text, widths):
            d.text((x, pad + asc), c, font=fnt, fill=255, anchor="ls")
            x += wc + tracking
    else:
        d.text((pad, pad + asc), text, font=fnt, fill=255, anchor="ls")
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if shadow_alpha > 0:
        sh_mask = Image.new("L", (W, H), 0)
        sh_mask.paste(mask, (0, shadow_dy))
        sh_mask = sh_mask.filter(ImageFilter.GaussianBlur(shadow_blur)).point(lambda v: int(v * shadow_alpha))
        shadow_img = Image.new("RGBA", (W, H), shadow + (0,))
        shadow_img.putalpha(sh_mask)
        out.alpha_composite(shadow_img)
    fill = Image.new("RGBA", (W, H), color + (0,))
    fill.putalpha(mask)
    out.alpha_composite(fill)
    return out, pad, pad + asc


# ----------------------------------------------------------------------------- ponto de bordado
def stitch_points_line(x0, y0, x1, y1, dash=18, gap=11):
    L = math.hypot(x1 - x0, y1 - y0)
    n = int((L + gap) // (dash + gap))
    segs = []
    for i in range(n):
        a = i * (dash + gap) / L
        b = min(1.0, (i * (dash + gap) + dash) / L)
        segs.append((x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, a))
    return segs


def draw_stitches(img: Image.Image, segs, progress: float, color, width=5, alpha=1.0, ss=3):
    """Desenha os pontos (traços com pontas arredondadas) até 'progress' (0..1) do caminho."""
    if progress <= 0 or alpha <= 0:
        return
    W, H = img.size
    layer = Image.new("L", (W * ss, H * ss), 0)
    d = ImageDraw.Draw(layer)
    r = width * ss / 2
    for (xa, ya, xb, yb, a) in segs:
        if a > progress:
            break
        d.line((xa * ss, ya * ss, xb * ss, yb * ss), fill=255, width=int(width * ss))
        d.ellipse((xa * ss - r, ya * ss - r, xa * ss + r, ya * ss + r), fill=255)
        d.ellipse((xb * ss - r, yb * ss - r, xb * ss + r, yb * ss + r), fill=255)
    layer = layer.resize((W, H), Image.LANCZOS).point(lambda v: int(v * alpha))
    col = Image.new("RGBA", (W, H), color + (0,))
    col.putalpha(layer)
    img.alpha_composite(col)


class StitchRing:
    """Anel de pontos (bastidor) pré-renderizado; revelado por ângulo."""

    def __init__(self, radius, color, width=6, dash=24, gap=14, start_deg=-90, open_bottom_deg=0.0):
        self.R = radius
        size = int(2 * radius + 4 * width + 8)
        self.size = size
        c = size / 2
        circ = 2 * math.pi * radius
        n = int(circ // (dash + gap))
        step = circ / n
        segs = []
        for i in range(n):
            a0 = math.radians(start_deg) + (i * step) / radius
            a1 = a0 + dash / radius
            mid = math.degrees((a0 + a1) / 2) % 360
            if open_bottom_deg and abs(mid - 90) < open_bottom_deg / 2:
                continue  # abertura embaixo (não cruza o texto da logo)
            pts = [(c + radius * math.cos(a0 + (a1 - a0) * k / 6), c + radius * math.sin(a0 + (a1 - a0) * k / 6))
                   for k in range(7)]
            segs.append(pts)
        ss = 3
        m = Image.new("L", (size * ss, size * ss), 0)
        d = ImageDraw.Draw(m)
        r = width * ss / 2
        for pts in segs:
            P = [(x * ss, y * ss) for x, y in pts]
            d.line(P, fill=255, width=int(width * ss), joint="curve")
            for (x, y) in (P[0], P[-1]):
                d.ellipse((x - r, y - r, x + r, y + r), fill=255)
        m = m.resize((size, size), Image.LANCZOS)
        self.sprite = Image.new("RGBA", (size, size), color + (0,))
        self.sprite.putalpha(m)
        yy, xx = np.mgrid[0:size, 0:size]
        ang = (np.degrees(np.arctan2(yy - c, xx - c)) - start_deg) % 360.0
        self.ang = ang.astype(np.float32)

    def frame(self, progress: float, alpha: float = 1.0) -> Image.Image:
        lim = 360.0 * clamp01(progress)
        a = np.asarray(self.sprite.getchannel("A")).astype(np.float32)
        a = a * (self.ang <= lim) * alpha
        sp = self.sprite.copy()
        sp.putalpha(Image.fromarray(a.astype(np.uint8)))
        return sp


# ----------------------------------------------------------------------------- legendas
class CaptionLayer:
    FONT = ("Manrope-ExtraBold", 60)
    LINE_H = 76
    MAX_W = 920
    BOTTOM = 860
    PADX, PADY = 38, 24
    DIM = 0.42

    def __init__(self, captions):
        self.caps = captions
        self.f = font(*self.FONT)
        self.space = self.f.getlength(" ")
        self.cache = {}
        self.bottoms = {}
        # janelas visíveis sem sobreposição: a legenda anterior termina de sair antes de a próxima entrar
        self.vis = []
        for i, c in enumerate(captions):
            nxt = captions[i + 1].t0 if i + 1 < len(captions) else 1e9
            self.vis.append((c.t0 - 0.12, min(c.t1 + 0.12, nxt - 0.13)))

    def set_bottom(self, idx, bottom):
        if self.bottoms.get(idx) != bottom:
            self.bottoms[idx] = bottom
            self.cache.pop(idx, None)

    def layout(self, idx):
        if idx in self.cache:
            return self.cache[idx]
        cap = self.caps[idx]
        words = cap.words
        widths = [self.f.getlength(w.text) for w in words]
        lines = best_break([w.text for w in words], widths, self.space, self.MAX_W)
        # posições
        line_w = [sum(widths[i] for i in ln) + self.space * (len(ln) - 1) for ln in lines]
        box_w = int(max(line_w) + 2 * self.PADX)
        box_h = int(len(lines) * self.LINE_H + 2 * self.PADY)
        x0 = (OW - box_w) // 2
        y0 = self.bottoms.get(idx, self.BOTTOM) - box_h
        asc, desc = self.f.getmetrics()
        placed = []
        for li, ln in enumerate(lines):
            x = (OW - line_w[li]) / 2
            base_y = y0 + self.PADY + li * self.LINE_H + (self.LINE_H + asc - desc) / 2 - 2
            for i in ln:
                w = words[i]
                lit, ox, oy = text_sprite(w.text, self.f, STYLE_COLOR[w.style], shadow_alpha=0.35, shadow_blur=3)
                dim, _, _ = text_sprite(w.text, self.f, WHITE, shadow_alpha=0.0)
                placed.append((w, x - ox, base_y - oy, lit, dim, x, widths[i], base_y))
                x += widths[i] + self.space
        mask = rounded_mask(box_w, box_h, 30)
        # bordas da sublinha de bordado: palavras laranja contíguas
        stitch = None
        if cap.stitch:
            ws = [p for p in placed if p[0].style == "o"]
            if ws:
                xa = min(p[5] for p in ws)
                xb = max(p[5] + p[6] for p in ws)
                yb = max(p[7] for p in ws) + 14
                stitch = (stitch_points_line(xa + 4, yb, xb - 4, yb, dash=16, gap=10), min(w[0].t for w in ws))
        res = (x0, y0, box_w, box_h, mask, placed, stitch)
        self.cache[idx] = res
        return res

    def draw(self, base: Image.Image, t: float):
        for idx, cap in enumerate(self.caps):
            a, b = self.vis[idx]
            if a <= t <= b:
                self._draw_one(base, idx, cap, t, a, b)

    def _draw_one(self, base, idx, cap, t, a, b):
        a_in = ease_out_cubic((t - a) / 0.16)
        a_out = 1 - clamp01((t - (b - 0.10)) / 0.10)
        alpha = min(a_in, a_out)
        if alpha <= 0.01:
            return
        rise = (1 - a_in) * 14
        x0, y0, bw, bh, mask, placed, stitch = self.layout(idx)
        y0r = int(round(y0 + rise))
        # caixa de vidro fosco na cor da marca
        region = base.crop((x0, y0r, x0 + bw, y0r + bh)).convert("RGB").filter(ImageFilter.GaussianBlur(18))
        tint = Image.new("RGB", (bw, bh), (30, 12, 64))
        glass = Image.blend(region, tint, 0.70).convert("RGBA")
        glass.putalpha(mask.point(lambda v: int(v * alpha * 0.97)))
        base.alpha_composite(glass, dest=(x0, y0r))
        # filete sutil na borda
        edge = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        ImageDraw.Draw(edge).rounded_rectangle((1, 1, bw - 2, bh - 2), 29, outline=PAL["lavender"] + (int(34 * alpha),),
                                               width=2)
        base.alpha_composite(edge, dest=(x0, y0r))
        for (w, sx, sy, lit, dim, *_rest) in placed:
            p = clamp01((t - w.t) / 0.10)
            if p < 1:
                blit(base, dim, sx, sy + rise, alpha * self.DIM * (1 - p))
            if p > 0:
                blit(base, lit, sx, sy + rise, alpha * p)
        if stitch:
            segs, ts = stitch
            prog = clamp01((t - ts - 0.05) / 0.45)
            if prog > 0:
                layer = Image.new("RGBA", (OW, 60), (0, 0, 0, 0))
                y_ref = segs[0][1]
                segs_l = [(xa, ya - y_ref + 30, xb, yb - y_ref + 30, a) for (xa, ya, xb, yb, a) in segs]
                draw_stitches(layer, segs_l, prog, PAL["orangeSoft"], width=5, alpha=alpha)
                base.alpha_composite(layer, dest=(0, int(round(y_ref - 30 + rise))))


# ----------------------------------------------------------------------------- tarja de nome
class LowerThird:
    def __init__(self, name, role):
        fn, fr = font("Manrope-ExtraBold", 46), font("Manrope-Bold", 24)
        nm, nox, noy = text_sprite(name, fn, WHITE, shadow_alpha=0.0)
        rl, rox, roy = text_sprite(role.upper(), fr, PAL["orangeSoft"], shadow_alpha=0.0, tracking=4)
        padl, padr, padt = 40, 30, 22
        w = int(max(nm.width - 2 * nox, rl.width - 2 * rox) + padl + padr)
        h = 124
        card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        body = Image.new("RGBA", (w, h), PAL["night2"] + (0,))
        body.putalpha(rounded_mask(w, h, 22).point(lambda v: int(v * 0.90)))
        card.alpha_composite(body)
        # barra de destaque em degradê magenta → laranja
        bar = np.zeros((h - 28, 8, 4), np.uint8)
        for i in range(h - 28):
            k = i / (h - 29)
            c = [int(PAL["rose"][j] * (1 - k) + PAL["orange"][j] * k) for j in range(3)]
            bar[i, :, :3] = c
            bar[i, :, 3] = 255
        card.alpha_composite(Image.fromarray(bar, "RGBA"), dest=(16, 14))
        card.alpha_composite(nm, dest=(padl - nox, 18 + 46 - noy + 4))
        card.alpha_composite(rl, dest=(padl - rox, 18 + 46 + 40 - roy + 4))
        ImageDraw.Draw(card).rounded_rectangle((1, 1, w - 2, h - 2), 21, outline=PAL["lavender"] + (40,), width=2)
        self.sprite = card

    def draw(self, base, t, t0, t1, x=56, y=330):
        a_in = ease_out_cubic((t - t0) / 0.35)
        a_out = 1 - ease_in_out((t - (t1 - 0.25)) / 0.25)
        a = min(a_in, a_out)
        if a <= 0.01:
            return
        dx = (1 - a_in) * -36 + (1 - a_out) * -12
        blit(base, self.sprite, x + dx, y, a)


# ----------------------------------------------------------------------------- marca
def brand_sprite(name: str, width: int) -> Image.Image:
    im = Image.open(BRAND_DIR / name).convert("RGBA")
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.LANCZOS)


def soft_shadow(sprite: Image.Image, blur=10, alpha=0.5, pad=24):
    W, H = sprite.width + 2 * pad, sprite.height + 2 * pad
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh.alpha_composite(sprite, dest=(pad, pad + 4))
    a = sh.getchannel("A").filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * alpha))
    shadow = Image.new("RGBA", (W, H), PAL["night"] + (0,))
    shadow.putalpha(a)
    out.alpha_composite(shadow)
    out.alpha_composite(sprite, dest=(pad, pad))
    return out


# ----------------------------------------------------------------------------- texto do gancho
HOOK_STYLES = {
    "small": ("Manrope-SemiBold", 48, PAL["lavender"], 1.0),
    "big": ("Manrope-ExtraBold", 78, WHITE, 0.0),
    "huge_o": ("Manrope-ExtraBold", 118, PAL["orangeSoft"], 0.0),
    "huge_r": ("Manrope-ExtraBold", 110, PAL["rose"], 0.0),
}


class HookText:
    def __init__(self, lines, top=262, bottom=842):
        self.items = []
        blocks = []
        for text, style, words in lines:
            fname, size, color, track = HOOK_STYLES[style]
            f = font(fname, size)
            total = f.getlength(text)
            while total > 960 and size > 40:
                size -= 4
                f = font(fname, size)
                total = f.getlength(text)
            lh = int(size * (1.32 if style == "small" else 1.10))
            blocks.append((text, style, words, f, color, lh, total))
        H = sum(b[5] for b in blocks)
        y = top + max(0, (bottom - top - H) / 2)
        for text, style, words, f, color, lh, total in blocks:
            asc, desc = f.getmetrics()
            base_y = y + lh / 2 + (asc - desc) / 2
            x = (OW - total) / 2
            sp_w = f.getlength(" ")
            line_items = []
            for (w, t) in words:
                spr, ox, oy = text_sprite(w, f, color, shadow=PAL["night"], shadow_alpha=0.85, shadow_blur=11,
                                          shadow_dy=4, pad=26)
                wl = f.getlength(w)
                line_items.append((t, spr, x - ox, base_y - oy, wl))
                x += wl + sp_w
            under = None
            if style.startswith("huge"):
                xa = (OW - total) / 2
                ucol = PAL["rose"] if style == "huge_o" else PAL["orangeSoft"]
                under = (stitch_points_line(xa + 6, base_y + 22, xa + total - 6, base_y + 22, dash=22, gap=13),
                         words[-1][1] + 0.12, ucol, base_y + 22)
            self.items.append((line_items, under))
            y += lh

    def draw(self, base, t, fade=1.0):
        for line_items, under in self.items:
            for (tw, spr, x, y, wl) in line_items:
                k = (t - tw) / 0.22
                if k <= 0:
                    continue
                a = clamp01(k * 1.6) * fade
                s = 0.86 + 0.14 * ease_out_back(k)
                blit(base, spr, x + spr.width / 2, y + spr.height / 2 + (1 - ease_out_cubic(k)) * 16, a, s, "cc")
            if under:
                segs, ts, col, yb = under
                prog = clamp01((t - ts) / 0.5)
                if prog > 0:
                    layer = Image.new("RGBA", (OW, 40), (0, 0, 0, 0))
                    segs_l = [(xa, 20, xb, 20, a) for (xa, ya, xb, yb2, a) in segs]
                    draw_stitches(layer, segs_l, prog, col, width=7, alpha=fade)
                    base.alpha_composite(layer, dest=(0, int(yb - 20)))


@lru_cache(maxsize=4)
def veil(alpha_top=0.90, y_end=1250):
    a = np.zeros((OH, OW), np.float32)
    ys = np.arange(OH, dtype=np.float32)
    prof = np.clip(1 - ys / y_end, 0, 1) ** 1.25 * alpha_top
    a[:] = prof[:, None]
    img = Image.new("RGBA", (OW, OH), PAL["night2"] + (0,))
    img.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return img


# ----------------------------------------------------------------------------- fundos de marca
@lru_cache(maxsize=2)
def _grid():
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    return xx, yy


def brand_background(t: float, seed: int = 7) -> np.ndarray:
    """Degradê roxo profundo → vinho → magenta, com brilho radial e leve movimento. float32 0..1."""
    xx, yy = _grid()
    c = lambda k: np.array(PAL[k], np.float32) / 255
    v = np.clip(yy / OH + 0.06 * np.sin(t * 0.6 + xx / OW * 2.0), 0, 1)[..., None]
    top, mid, bot = c("purpleDeep"), c("wine"), c("magenta")
    k1 = np.clip(v / 0.58, 0, 1)
    k2 = np.clip((v - 0.58) / 0.42, 0, 1)
    col = np.where(v < 0.58, top * (1 - k1) + mid * k1, mid * (1 - k2) + bot * k2)
    # brilho radial roxo atrás da marca + vinheta
    cx, cy = OW / 2, 650 + 18 * math.sin(t * 0.8)
    r = np.sqrt(((xx - cx) / 620) ** 2 + ((yy - cy) / 560) ** 2)[..., None]
    glow = np.clip(1 - r, 0, 1) ** 2 * 0.55
    col = col * (1 - glow) + c("purple") * glow
    vig = np.clip(np.sqrt(((xx - OW / 2) / OW) ** 2 + ((yy - OH / 2) / OH) ** 2) * 1.25, 0, 1)[..., None]
    col = col * (1 - 0.35 * vig ** 2)
    return col


@lru_cache(maxsize=2)
def _dither_field(h, w):
    # padrão FIXO de dither (evita faixas no degradê sem gastar bitrate com ruído que muda a cada quadro)
    return (np.random.default_rng(9).uniform(-1.6, 1.6, size=(h, w, 1)).astype(np.float32) / 255)


def dither_to_uint8(col: np.ndarray, rng=None) -> np.ndarray:
    noise = _dither_field(col.shape[0], col.shape[1])
    return (np.clip(col + noise, 0, 1) * 255 + 0.5).astype(np.uint8)


class Particles:
    """'Pontos' suaves flutuando no encerramento (como pontos de bordado/luz)."""

    def __init__(self, n=46, seed=3):
        rng = np.random.default_rng(seed)
        self.p = rng.uniform([0, 0], [OW, OH], size=(n, 2))
        self.v = rng.uniform([-6, -26], [6, -10], size=(n, 2))
        self.r = rng.uniform(2.0, 4.6, size=n)
        self.a = rng.uniform(0.10, 0.32, size=n)
        self.ph = rng.uniform(0, 6.28, size=n)

    def draw(self, base: Image.Image, t: float, alpha: float):
        if alpha <= 0:
            return
        layer = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for (x, y), (vx, vy), r, a, ph in zip(self.p, self.v, self.r, self.a, self.ph):
            px, py = (x + vx * t) % OW, (y + vy * t) % OH
            aa = a * (0.6 + 0.4 * math.sin(t * 1.3 + ph)) * alpha
            d.ellipse((px - r, py - r, px + r, py + r), fill=PAL["lavender"] + (int(255 * aa),))
        base.alpha_composite(layer)


# ----------------------------------------------------------------------------- vinheta (gancho → entrevista)
class Sting:
    """Transição de marca curta (1.3 s): faixa diagonal na paleta + selo com anel de pontos."""

    def __init__(self, t_cut, label_top="EMPREENDENDO SEM FRONTEIRAS", label_main="ENTREVISTA"):
        self.T = t_cut
        xx, yy = _grid()
        ang = math.radians(-58)
        self.dirx, self.diry = math.cos(ang), math.sin(ang)
        self.proj = (xx * self.dirx + yy * self.diry).astype(np.float32)
        self.pmin, self.pmax = float(self.proj.min()), float(self.proj.max())
        k = ((self.proj - self.pmin) / (self.pmax - self.pmin))[..., None]
        c = lambda n: np.array(PAL[n], np.float32) / 255
        col = np.where(k < 0.55, c("purpleDeep") * (1 - k / 0.55) + c("purpleDark") * (k / 0.55),
                       c("purpleDark") * (1 - (k - 0.55) / 0.45) + c("magenta") * ((k - 0.55) / 0.45))
        rng = np.random.default_rng(1)
        self.fill = Image.fromarray(dither_to_uint8(col, rng)).convert("RGBA")
        self.selo = soft_shadow(brand_sprite("esf_selo.png", 300), blur=18, alpha=0.55, pad=40)
        self.ring = StitchRing(196, PAL["orangeSoft"], width=6, dash=22, gap=13)
        f1, f2 = font("Manrope-Bold", 28), font("Manrope-ExtraBold", 50)
        self.l1, self.l1ox, _ = text_sprite(label_top, f1, PAL["lavender"], shadow_alpha=0.3, tracking=5)
        self.l2, self.l2ox, _ = text_sprite(label_main, f2, PAL["orangeSoft"], shadow_alpha=0.3, tracking=6)

    def active(self, t):
        return self.T - 0.32 <= t <= self.T + 1.02

    def draw(self, base: Image.Image, t: float):
        if not self.active(t):
            return
        span = self.pmax - self.pmin + 160
        tin, tout = (t - (self.T - 0.30)) / 0.30, (t - (self.T + 0.62)) / 0.38
        front = self.pmin - 80 + span * ease_in_out(tin)
        back = self.pmin - 80 + span * ease_in_out(tout) if tout > 0 else -1e9
        m = np.clip((front - self.proj) / 60.0, 0, 1) * np.clip((self.proj - back) / 60.0, 0, 1)
        if m.max() <= 0:
            return
        band = self.fill.copy()
        band.putalpha(Image.fromarray((m * 255).astype(np.uint8)))
        base.alpha_composite(band)
        # filete laranja nas bordas da faixa
        edge = np.exp(-((self.proj - front) / 7.0) ** 2) * (tin < 1.0)
        if tout > 0:
            edge = edge + np.exp(-((self.proj - back) / 7.0) ** 2)
        edge = np.clip(edge, 0, 1) * 0.85
        if edge.max() > 0.01:
            e = Image.new("RGBA", (OW, OH), PAL["orangeSoft"] + (0,))
            e.putalpha(Image.fromarray((edge * 255).astype(np.uint8)))
            base.alpha_composite(e)
        # conteúdo: selo + anel + rótulos
        k = (t - (self.T - 0.12)) / 0.42
        cover = clamp01(tin) * (1 - clamp01(tout * 1.6))
        if k > 0 and cover > 0:
            cx, cy = OW / 2, 860
            ring = self.ring.frame(ease_out_cubic((t - (self.T - 0.05)) / 0.55), alpha=cover)
            blit(base, ring, cx, cy, 1.0, 1.0, "cc")
            blit(base, self.selo, cx, cy, clamp01(k * 2) * cover, 0.82 + 0.18 * ease_out_back(k), "cc")
            kl = clamp01((t - (self.T + 0.05)) / 0.25) * cover
            blit(base, self.l1, OW / 2, cy + 255, kl, 1.0, "ct")
            blit(base, self.l2, OW / 2, cy + 300, kl, 1.0, "ct")


# ----------------------------------------------------------------------------- encerramento
class EndCard:
    def __init__(self, t_start, duration, url="esf-site-gray.vercel.app"):
        self.T, self.D = t_start, duration
        self.rng = np.random.default_rng(5)
        logo = brand_sprite("esf_logo_full.png", 520)
        self.logo = logo
        # anel em volta do SÍMBOLO (parte de cima da logo, acima do texto)
        a = np.asarray(logo.getchannel("A")) > 40
        rows = np.where(a.any(axis=1))[0]
        gaps = np.where(np.diff(rows) > 6)[0]
        sym_bottom = rows[gaps[0]] if len(gaps) else int(logo.height * 0.66)
        sym_cols = np.where(a[: sym_bottom + 1].any(axis=0))[0]
        self.sym_c = ((sym_cols[0] + sym_cols[-1]) / 2, (rows[0] + sym_bottom) / 2)
        sym_r = max(sym_cols[-1] - sym_cols[0], sym_bottom - rows[0]) / 2
        self.ring = StitchRing(sym_r * 1.14, PAL["rose"], width=6, dash=22, gap=13, open_bottom_deg=84)
        self.logo_pos = (OW / 2, 340)  # topo-centro
        tf = font("InstrumentSerif-Italic", 92)
        self.tag = []
        y = 1000
        for line in [["Cada", "ponto,"], ["um", "futuro", "sendo", "bordado."]]:
            ws = []
            for w in line:
                col = PAL["orangeSoft"] if w.startswith("bordado") else WHITE
                ws.append((w, text_sprite(w, tf, col, shadow_alpha=0.45, shadow_blur=8, pad=18), tf.getlength(w)))
            total = sum(x[2] for x in ws) + tf.getlength(" ") * (len(ws) - 1)
            x = (OW - total) / 2
            for w, (spr, ox, oy), wl in ws:
                self.tag.append((spr, x - ox, y - oy))
                x += wl + tf.getlength(" ")
            y += 100
        self.div = stitch_points_line(OW / 2 - 170, 1152, OW / 2 + 170, 1152, dash=18, gap=11)
        cf = font("Manrope-SemiBold", 44)
        self.cta = [text_sprite(s, cf, PAL["lavender"], shadow_alpha=0.4, shadow_blur=6) for s in
                    ["Venha fazer parte dessa história", "com a gente."]]
        uf = font("Manrope-ExtraBold", 40)
        txt, tox, toy = text_sprite(url, uf, PAL["night"], shadow_alpha=0.0, pad=0)
        pw, ph = txt.width + 84, 88
        pill = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        body = Image.new("RGBA", (pw, ph), PAL["orange"] + (0,))
        body.putalpha(rounded_mask(pw, ph, ph // 2))
        pill.alpha_composite(body)
        asc, desc = uf.getmetrics()
        pill.alpha_composite(txt, dest=(42, int((ph - (asc + desc)) / 2)))
        self.pill = soft_shadow(pill, blur=14, alpha=0.45, pad=30)
        self.particles = Particles()

    def draw(self, frame_rgba: Image.Image, t: float) -> Image.Image:
        tau = t - self.T
        if tau < -0.15:
            return frame_rgba
        # cortina subindo (com o último quadro congelado por baixo)
        k = ease_in_out((tau + 0.12) / 0.62)
        bg = Image.fromarray(dither_to_uint8(brand_background(max(tau, 0)), self.rng)).convert("RGBA")
        if k < 1:
            yedge = OH * (1 - k) - 40
            ys = np.arange(OH, dtype=np.float32)
            m = np.clip((ys - yedge) / 90.0, 0, 1)
            mask = Image.fromarray((np.repeat(m[:, None], OW, axis=1) * 255).astype(np.uint8))
            under = frame_rgba.filter(ImageFilter.GaussianBlur(6 * k)) if k > 0.05 else frame_rgba
            bg.putalpha(mask)
            out = under.copy()
            out.alpha_composite(bg)
            line = np.exp(-((ys - (yedge + 45)) / 5.0) ** 2) * 0.9
            e = Image.new("RGBA", (OW, OH), PAL["orangeSoft"] + (0,))
            e.putalpha(Image.fromarray((np.repeat(line[:, None], OW, axis=1) * 255).astype(np.uint8)))
            out.alpha_composite(e)
        else:
            out = bg
        if tau < 0.3:
            return out
        self.particles.draw(out, tau, clamp01((tau - 0.4) / 1.0))
        # logo + anel de pontos (bastidor)
        lx, ly = self.logo_pos
        kl = (tau - 0.40) / 0.95
        if kl > 0:
            s = 0.90 + 0.10 * ease_out_cubic(kl)
            a = clamp01(kl * 1.5)
            lw, lh = self.logo.size
            top = ly + (1 - s) * lh / 2
            cx_s = lx + (self.sym_c[0] - lw / 2) * s
            cy_s = top + self.sym_c[1] * s
            ring = self.ring.frame(ease_in_out((tau - 0.50) / 1.0), alpha=0.95)
            blit(out, ring, cx_s, cy_s, 1.0, s, "cc")
            blit(out, self.logo, lx, top, a, s, "ct")
        # frase institucional palavra a palavra
        for i, (spr, x, y) in enumerate(self.tag):
            kw = (tau - (1.55 + i * 0.11)) / 0.35
            if kw > 0:
                blit(out, spr, x + spr.width / 2, y + spr.height / 2 + (1 - ease_out_cubic(kw)) * 18,
                     clamp01(kw * 1.4), 1.0, "cc")
        kd = (tau - 2.45) / 0.55
        if kd > 0:
            layer = Image.new("RGBA", (OW, 40), (0, 0, 0, 0))
            draw_stitches(layer, [(xa, 20, xb, 20, a) for (xa, ya, xb, yb, a) in self.div], clamp01(kd),
                          PAL["orangeSoft"], width=5, alpha=0.95)
            out.alpha_composite(layer, dest=(0, 1132))
        for i, (spr, ox, oy) in enumerate(self.cta):
            kc = (tau - (2.85 + i * 0.15)) / 0.4
            if kc > 0:
                blit(out, spr, OW / 2, 1200 + i * 62 + (1 - ease_out_cubic(kc)) * 14, clamp01(kc * 1.4), 1.0, "ct")
        kp = (tau - 3.45) / 0.45
        if kp > 0:
            blit(out, self.pill, OW / 2, 1392, clamp01(kp * 1.6), 0.9 + 0.1 * ease_out_back(kp), "cc")
        return out
