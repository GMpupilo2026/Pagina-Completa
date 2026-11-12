#!/usr/bin/env python3
"""Los avatares de los profes: de los originales a la versión para la página.

Cada profe tiene los mismos dibujos (los mismos id que la lista de
js/avatar-profe-oscar.js): el profe Oscar, la profe Pame y la profe
Karina. Los originales
(herramientas/avatar-profe-<profe>/originales/<id>.png, en alta resolución y
sin fondo) son la copia buena y no se publican. Este script saca de cada uno
img/avatar-profe-<profe>/<id>.webp, de 480 px de alto (lo mismo que
AvatarProfeOscar.ALTO en js/avatar-profe-oscar.js), y borra los WebP que ya
no tienen original. Los WebP no se editan a mano.

    python3 herramientas/avatar-profe-oscar.py

Ver «El avatar del profe Oscar» en docs/decisiones/clase-en-vivo.md.
"""
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
PROFES = ["oscar", "pame", "karina"]
ALTO = 480

for profe in PROFES:
    originales = RAIZ / "herramientas" / f"avatar-profe-{profe}" / "originales"
    salida = RAIZ / "img" / f"avatar-profe-{profe}"
    salida.mkdir(parents=True, exist_ok=True)
    hechos = set()
    for png in sorted(originales.glob("*.png")):
        im = Image.open(png).convert("RGBA")
        ancho = round(im.width * ALTO / im.height)
        destino = salida / (png.stem + ".webp")
        im.resize((ancho, ALTO), Image.LANCZOS).save(destino, "WEBP", quality=82, method=6)
        hechos.add(destino.name)
    for viejo in salida.glob("*.webp"):
        if viejo.name not in hechos:
            viejo.unlink()
    print(f"{len(hechos)} avatares en {salida.relative_to(RAIZ)}")

# rev bfb5bbb0d2d82f9f
