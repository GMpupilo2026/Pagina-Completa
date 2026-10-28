#!/usr/bin/env python3
"""El avatar del profe Oscar: de los originales a la versión para la página.

Los originales (herramientas/avatar-profe-oscar/originales/<id>.png, en alta
resolución y sin fondo) son la copia buena y no se publican. Este script saca
de cada uno img/avatar-profe-oscar/<id>.webp, de 480 px de alto (lo mismo que
AvatarProfeOscar.ALTO en js/avatar-profe-oscar.js), y borra los WebP que ya no
tienen original. Los WebP no se editan a mano.

    python3 herramientas/avatar-profe-oscar.py

Ver «El avatar del profe Oscar» en docs/decisiones/clase-en-vivo.md.
"""
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGINALES = RAIZ / "herramientas" / "avatar-profe-oscar" / "originales"
SALIDA = RAIZ / "img" / "avatar-profe-oscar"
ALTO = 480

SALIDA.mkdir(parents=True, exist_ok=True)
hechos = set()
for png in sorted(ORIGINALES.glob("*.png")):
    im = Image.open(png).convert("RGBA")
    ancho = round(im.width * ALTO / im.height)
    destino = SALIDA / (png.stem + ".webp")
    im.resize((ancho, ALTO), Image.LANCZOS).save(destino, "WEBP", quality=82, method=6)
    hechos.add(destino.name)
for viejo in SALIDA.glob("*.webp"):
    if viejo.name not in hechos:
        viejo.unlink()
print(f"{len(hechos)} avatares en {SALIDA.relative_to(RAIZ)}")
