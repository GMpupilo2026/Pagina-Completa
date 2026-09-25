#!/usr/bin/env python3
"""Pone en cada página con tablero los scripts de las preferencias de tablero.

El alumno elige en Configuración el color de las casillas, el color de las
piezas, el estilo (símbolo o dibujo) y el tema divertido. Eso vive en cinco
módulos —board-themes, board-color-themes, piece-color-themes,
piece-style-themes y chess-piece-svg— más js/pieza-preferida.js, que es la
única respuesta a «¿cómo se pinta esta pieza?».

Hasta ahora cada página cargaba los que se le ocurrió a quien la escribió:
Mates los tenía, Aprender y el diagnóstico no, los artículos traían el color
de pieza pero no el de las casillas. O sea que la misma elección se veía en
una página y en la de al lado no, sin que nada fallara.

Qué páginas llevan tablero se decide leyendo el propio HTML (una página que
pinta piezas o carga un tablero), no con una lista escrita a mano: la página
nueva entra sola. Van en dos lugares:

- Los tres que ponen el color de las casillas, el de las piezas y el estilo
  (board-color-themes, piece-color-themes, piece-style-themes) van justo
  después de js/adaptive-mode.js, en el <head>: tienen que correr ANTES de que
  se pinte la primera casilla.
- Los otros tres no pintan nada al cargar: los usa el script de la página. Van
  justo antes del primer script del <body>, porque en el <head> la página no
  se ve hasta bajarlos (ver «Lo que frena el primer pintado»).

Solo se agregan los que la página no cargue ya en otra parte, y lo suyo se
reconoce por las marcas <!-- tablero: inicio --> / <!-- tablero: fin --> (en
el <head>) y <!-- tablero-js: inicio --> / <!-- tablero-js: fin --> (en el
<body>), así que se puede correr todas las veces que se quiera.

    python3 herramientas/tablero-cabecera.py
"""
import pathlib
import re
import subprocess

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MODULOS = [
    "board-themes",
    "board-color-themes",
    "piece-color-themes",
    "piece-style-themes",
    "chess-piece-svg",
    "pieza-preferida",
]
TIENE_TABLERO = re.compile(
    r"piece-white|PiezaPreferida|js/[a-z0-9-]*board\.js|tablero-pregunta\.js"
    r"|ficha-render\.js|finales-100\.js|curso-partidas\.js"
)
# Los que tienen que correr antes de que se pinte la primera casilla.
EN_HEAD = {"board-color-themes", "piece-color-themes", "piece-style-themes"}
BLOQUE = re.compile(r"\n?[ \t]*<!-- tablero(?:-js)?: inicio -->.*?<!-- tablero(?:-js)?: fin -->", re.S)
# El primer script síncrono del <body>: antes de él, todo el HTML ya se pintó.
PRIMER_SCRIPT = re.compile(r'^([ \t]*)<script\b(?![^>]*\b(?:defer|async)\b)(?![^>]*type="(?:module|application/ld\+json)")[^>]*>', re.M)
ADAPTIVE = re.compile(r'^([ \t]*)<script[^>]*js/adaptive-mode\.js[^>]*></script>[^\n]*$', re.M)


def paginas():
    salida = subprocess.run(["git", "ls-files", "*.html"], cwd=RAIZ,
                            capture_output=True, text=True, check=True).stdout
    return [RAIZ / p for p in salida.split() if not p.startswith("node_modules/")]


def main():
    tocadas = 0
    for ruta in paginas():
        texto = ruta.read_text(encoding="utf-8")
        limpio = BLOQUE.sub("", texto)
        if not TIENE_TABLERO.search(limpio):
            continue
        m = ADAPTIVE.search(limpio)
        if not m:
            print(f"  ⚠ {ruta.relative_to(RAIZ)}: no carga js/adaptive-mode.js, no sé dónde ponerlo")
            continue
        prefijo = "../" * (len(ruta.relative_to(RAIZ).parts) - 1)
        faltan = [n for n in MODULOS if not re.search(rf'src="[^"]*js/{n}\.js', limpio)]
        nuevo = limpio
        cuerpo = [n for n in faltan if n not in EN_HEAD]
        if cuerpo:
            b = PRIMER_SCRIPT.search(nuevo, nuevo.find("<body"))
            if not b:
                print(f"  ⚠ {ruta.relative_to(RAIZ)}: no tiene ningún script en el <body>, no sé dónde ponerlo")
                continue
            ind = b.group(1)
            lineas = [f"<!-- tablero-js: inicio -->"]
            lineas += [f'{ind}<script src="{prefijo}js/{n}.js"></script>' for n in cuerpo]
            lineas.append(f"{ind}<!-- tablero-js: fin -->")
            nuevo = nuevo[:b.start() + len(ind)] + "\n".join(lineas) + "\n" + nuevo[b.start():]
        cabeza = [n for n in faltan if n in EN_HEAD]
        if cabeza:
            ind = m.group(1)
            lineas = [f"{ind}<!-- tablero: inicio -->"]
            lineas += [f'{ind}<script src="{prefijo}js/{n}.js"></script>' for n in cabeza]
            lineas.append(f"{ind}<!-- tablero: fin -->")
            nuevo = nuevo[:m.end()] + "\n" + "\n".join(lineas) + nuevo[m.end():]
        if nuevo != texto:
            ruta.write_text(nuevo, encoding="utf-8")
            tocadas += 1
            print(f"  {ruta.relative_to(RAIZ)}: {', '.join(faltan) or '(sin cambios de módulos)'}")
    print(f"{tocadas} páginas actualizadas")


if __name__ == "__main__":
    main()
