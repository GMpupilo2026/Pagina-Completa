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
nueva entra sola. Se inserta justo después de js/adaptive-mode.js, que está en
el <head> de todas, porque board-color-themes y piece-color-themes tienen que
correr ANTES de que se pinte la primera casilla. Solo se agregan los que la
página no cargue ya en otra parte, y lo suyo se reconoce por las marcas
<!-- tablero: inicio --> / <!-- tablero: fin -->, así que se puede correr todas
las veces que se quiera.

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
BLOQUE = re.compile(r"\n?[ \t]*<!-- tablero: inicio -->.*?<!-- tablero: fin -->", re.S)
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
        if faltan:
            ind = m.group(1)
            lineas = [f"{ind}<!-- tablero: inicio -->"]
            lineas += [f'{ind}<script src="{prefijo}js/{n}.js"></script>' for n in faltan]
            lineas.append(f"{ind}<!-- tablero: fin -->")
            nuevo = limpio[:m.end()] + "\n" + "\n".join(lineas) + limpio[m.end():]
        else:
            nuevo = limpio
        if nuevo != texto:
            ruta.write_text(nuevo, encoding="utf-8")
            tocadas += 1
            print(f"  {ruta.relative_to(RAIZ)}: {', '.join(faltan) or '(sin cambios de módulos)'}")
    print(f"{tocadas} páginas actualizadas")


if __name__ == "__main__":
    main()
