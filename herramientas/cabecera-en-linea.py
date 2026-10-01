#!/usr/bin/env python3
"""Los scripts chicos que van escritos en el <head>, una sola versión de cada uno.

Hay piezas que tienen que correr ANTES del primer pintado y por eso van en
línea y no en un archivo (un <script src> más en el <head> de cien páginas
frena el primer pintado de todas para tres líneas; ver tema-cabecera.py). Para
poder sacar 'unsafe-inline' de la CSP, cada una tiene que ser idéntica en
todas las páginas: así la CSP la autoriza por su hash, una sola vez. Este
script deja así dos de ellas (las otras dos las ponen sus generadores:
la guardia de sesión, academia-cabecera.py; el tema, tema-cabecera.py):

  · el MODO OSCURO: pone la clase `dark` según lo guardado o lo que pide el
    sistema. Estaba escrito a mano en cada página, en cuatro formatos
    distintos que hacían lo mismo. Se reconoce cualquiera de los cuatro y se
    cambia por el mismo bloque, marcado con <!-- oscuro: inicio/fin -->. Uno
    que no sea exactamente uno de esos cuatro NO se toca: sería código
    distinto, y cambiarlo a ciegas cambiaría lo que hace.

  · las FUENTES ya no son de este generador. Antes ponía acá un script que
    pasaba la hoja de Google Fonts de media="print" a "all" al llegar; desde
    que las fuentes las sirve el sitio (css/fuentes.css) no queda ningún
    script que poner, y la marca <!-- fuentes: inicio/fin --> es de
    herramientas/fuentes-cabecera.py, que pone un <link> normal.

Se puede correr todas las veces que se quiera: reconoce lo suyo por las marcas.

    python3 herramientas/cabecera-en-linea.py
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUERA_DIRS = {"node_modules", ".git", "herramientas", "docs", "supabase"}

OSCURO_INICIO, OSCURO_FIN = "<!-- oscuro: inicio -->", "<!-- oscuro: fin -->"
OSCURO = ("(function(){try{var t=localStorage.getItem('theme');"
          "if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))"
          "document.documentElement.classList.add('dark');}catch(e){}})();")
OSCURO_BLOQUE = OSCURO_INICIO + "<script>" + OSCURO + "</script>" + OSCURO_FIN

# Los cuatro formatos que había, sin espacios: lo que se reconoce. Todos son
# la misma función; difieren solo en espacios y en unas llaves de más.
_VARIANTES = {re.sub(r"\s+", "", v) for v in (
    OSCURO,
    "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();",
)}

SCRIPT = re.compile(r"<script>(.*?)</script>", re.S)


def paginas():
    for raiz, dirs, archivos in os.walk(RAIZ):
        dirs[:] = sorted(d for d in dirs if d not in FUERA_DIRS)
        for a in sorted(archivos):
            if a.endswith(".html"):
                yield os.path.join(raiz, a)


def sin_marcas(s, inicio, fin):
    """Saca el bloque marcado (para volver a ponerlo igual); devuelve el texto
    y dónde estaba, o -1."""
    i = s.find(inicio)
    if i < 0:
        return s, -1
    j = s.find(fin, i)
    return s[:i] + s[j + len(fin):], i


def arreglar(s):
    # Modo oscuro: el bloque marcado se vuelve a escribir en su lugar; los
    # escritos a mano en cualquiera de los cuatro formatos pasan a ser el bloque.
    s, i = sin_marcas(s, OSCURO_INICIO, OSCURO_FIN)
    if i >= 0:
        s = s[:i] + OSCURO_BLOQUE + s[i:]
    else:
        for m in SCRIPT.finditer(s):
            if re.sub(r"\s+", "", m.group(1)) in _VARIANTES:
                s = s[:m.start()] + OSCURO_BLOQUE + s[m.end():]
                break
    return s


def main():
    tocadas = oscuro = 0
    for ruta in paginas():
        s = open(ruta, encoding="utf-8").read()
        nuevo = arreglar(s)
        if nuevo != s:
            open(ruta, "w", encoding="utf-8").write(nuevo)
            tocadas += 1
        oscuro += OSCURO_BLOQUE in nuevo
    print(f"{tocadas} páginas tocadas · {oscuro} con el modo oscuro")


if __name__ == "__main__":
    sys.exit(main())
