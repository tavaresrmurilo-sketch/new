"""Capas (thumbnail) para o Reels: quadro do gancho com a tipografia completa + selo da ESF.

A área central 1080×1440 (recorte da grade do perfil) contém o texto e os rostos.
Uso: python capas.py <build_dir> <pasta_saida>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import graphics as G  # noqa: E402
from render import FPS, Renderer  # noqa: E402

build, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for key, t_video in (("A", 4.9), ("B", 4.25)):
    r = Renderer(key, build)
    base = r.video(round(t_video * FPS) / FPS).convert("RGBA")
    G.blit(base, G.veil(), 0, 0, 1.0)
    r.hook.draw(base, 30.0, 1.0)  # todas as palavras e sublinhados já completos
    G.blit(base, r.selo, G.OW - 40, 206, 0.95, 1.0, "rt")
    base.convert("RGB").save(out / f"capa_{r.tl.name}.jpg", quality=93)
    print("ok", key)
