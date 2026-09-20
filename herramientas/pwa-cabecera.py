#!/usr/bin/env python3
"""Pone en el <head> de cada página lo que hace falta para instalar la app.

Son tres etiquetas y un script, en todas las páginas del sitio:

    <meta name="theme-color">     el color de la barra del sistema
    <link rel="manifest">         lo que le dice al celular que esto se instala
    <link rel="apple-touch-icon"> el icono en iPhone, que no lee el manifest
    <script src="js/pwa.js">      registra el service worker

Van en TODAS y no solo en la portada porque la gente entra por donde sea —un
enlace a un curso, el que le mandaron por WhatsApp— y el celular solo ofrece
instalar si la página por la que entró lo declara.

Se puede correr todas las veces que se quiera: reconoce lo que puso una corrida
anterior por las marcas y lo reemplaza en vez de duplicarlo.

    python3 herramientas/pwa-cabecera.py [--quitar]
"""
import glob
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INICIO = "<!-- app: inicio -->"
FIN = "<!-- app: fin -->"

# Estas quedan fuera: no son páginas del sitio.
#   - inscripcion.html tiene su propio diseño y su propio CSS;
#   - offline.html ya las trae escritas a mano (es la que se enseña sin red);
#   - libro-de-diagnostico-accesible.html y guia-del-profesor-accesible.html son
#     documentos que se descargan y se abren sueltos, hasta por correo y sin
#     red: declarar un manifest que no va a poder cargar es peor que no
#     declararlo. Esta lista tiene que decir lo mismo que la de
#     verificar-pwa.js, y una vez no lo decía: el verificador ya exceptuaba el
#     libro y el generador se lo ponía igual en cada corrida;
#   - el material de estudio de las lecciones son documentos, no páginas.
FUERA = {"inscripcion.html", "offline.html", "formulario.html",
         "libro-de-diagnostico-accesible.html",
         "guia-del-profesor-accesible.html"}
CARPETAS_FUERA = ("cursos/recursos/", "cursos/protegido/", "herramientas/", "node_modules/")


def paginas():
    todas = sorted(set(glob.glob("**/*.html", recursive=True)))
    salida = []
    for ruta in todas:
        r = ruta.replace(os.sep, "/")
        if os.path.basename(r) in FUERA or r.startswith(CARPETAS_FUERA):
            continue
        salida.append(r)
    return salida


def bloque(ruta):
    """Las direcciones van absolutas: la misma cabecera sirve en la raíz y en
    cursos/academia/, sin tener que contar cuántos '../' hacen falta. Menos el
    script, que se pide relativo para no depender del dominio en local."""
    hondo = ruta.count("/")
    arriba = "../" * hondo
    return (
        INICIO
        + '<meta name="theme-color" content="#102a43">'
        + '<link rel="manifest" href="/manifest.json">'
        + '<link rel="apple-touch-icon" href="/img/app/apple-touch-icon.png">'
        + '<meta name="apple-mobile-web-app-capable" content="yes">'
        + '<meta name="apple-mobile-web-app-title" content="Ajedrez">'
        + f'<script src="{arriba}js/pwa.js" defer></script>'
        + FIN
    )


def poner(ruta, quitar=False):
    s = open(ruta, encoding="utf-8").read()
    original = s
    # Fuera lo de la corrida anterior.
    i = s.find(INICIO)
    if i >= 0:
        j = s.find(FIN, i)
        s = s[:i] + s[j + len(FIN):]
    if not quitar:
        cierre = s.find("</head>")
        if cierre < 0:
            return None                      # no es una página con <head>
        s = s[:cierre] + bloque(ruta) + s[cierre:]
    if s != original:
        open(ruta, "w", encoding="utf-8").write(s)
        return True
    return False


def main():
    quitar = "--quitar" in sys.argv
    os.chdir(RAIZ)
    tocadas = sin_head = 0
    for ruta in paginas():
        r = poner(ruta, quitar)
        if r is None:
            sin_head += 1
        elif r:
            tocadas += 1
    verbo = "sin la cabecera de app" if quitar else "con la cabecera de app"
    print(f"{len(paginas())} páginas revisadas · {tocadas} {verbo}"
          + (f" · {sin_head} sin <head> (no se tocaron)" if sin_head else ""))


if __name__ == "__main__":
    main()
