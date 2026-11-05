"""Gera as fontes estáticas usadas no vídeo a partir das fontes OFICIAIS do site (esf/src/app/fonts).

Manrope (variável, eixo wght) → instâncias 500/600/700/800; Instrument Serif → TTF.
Uso: python fonts_from_site.py <repo_esf> <pasta_fonts>
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src = Path(sys.argv[1]) / "src" / "app" / "fonts"
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for w, name in [(500, "Medium"), (600, "SemiBold"), (700, "Bold"), (800, "ExtraBold")]:
    f = instancer.instantiateVariableFont(TTFont(src / "manrope-latin-var.woff2"), {"wght": w}, updateFontNames=False)
    f.flavor = None
    for rec in f["name"].names:
        if rec.nameID in (1, 16):
            rec.string = "Manrope ESF"
        if rec.nameID in (2, 17):
            rec.string = name
        if rec.nameID == 4:
            rec.string = f"Manrope ESF {name}"
        if rec.nameID == 6:
            rec.string = f"ManropeESF-{name}"
    f.save(out / f"Manrope-{name}.ttf")
for fn, name in [("instrument-serif-latin-italic.woff2", "InstrumentSerif-Italic.ttf"),
                 ("instrument-serif-latin.woff2", "InstrumentSerif-Regular.ttf")]:
    f = TTFont(src / fn)
    f.flavor = None
    f.save(out / name)
print("ok")
