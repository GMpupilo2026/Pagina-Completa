#!/usr/bin/env python3
"""Arma img/logo-marca.png, el logo del encabezado y del pie, a partir del logo
de la marca (img/logo-oscar-angulo.png, el de color crema).

El logo completo trae abajo la cinta con «Oscar Angulo Cubero · Profesional
de Ajedrez»: a 48 px de alto esas letras no se leen y solo ensucian. Acá se
queda la parte de arriba —el caballo, el peón y los cuadros—, se recorta lo
transparente y se deja a 96 px de alto (el doble de lo que se muestra, para
pantallas de alta densidad). Va en crema porque el encabezado y el pie son
oscuros en todos los temas.

    pip install pillow
    python3 herramientas/logo-encabezado.py
"""
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "img" / "logo-oscar-angulo.png"
DESTINO = RAIZ / "img" / "logo-marca.png"
ALTO = 96

logo = Image.open(ORIGEN).convert("RGBA")
# La cinta empieza a los 740 px de 902: todo lo de arriba es el dibujo.
dibujo = logo.crop((0, 0, logo.width, 740))
dibujo = dibujo.crop(dibujo.getchannel("A").getbbox())
ancho = round(dibujo.width * ALTO / dibujo.height)
dibujo.resize((ancho, ALTO), Image.LANCZOS).save(DESTINO, optimize=True)
print(f"{DESTINO.relative_to(RAIZ)}: {ancho}×{ALTO}")
