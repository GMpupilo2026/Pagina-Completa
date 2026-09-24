#!/usr/bin/env python3
"""Pone en el pie de cada página los enlaces a la Política de privacidad y a
los Términos y condiciones.

Van en TODAS las páginas que tienen pie, y no solo en la portada, por lo mismo
que el manifest de la app: la gente entra por donde sea —un artículo que le
mandaron, el enlace de un formulario, un curso— y el aviso de privacidad tiene
que estar a mano en la página donde se le piden los datos (artículo 5 de la
Ley 8968). Un enlace que existe solo en la portada no lo encuentra nadie.

Se inserta justo después del párrafo del «©», que tienen los tres pies del
sitio (el grande de las páginas públicas, el de una línea de la Academia y el
de inscripcion.html). Una página con pie pero sin «©» hace fallar el script
en vez de quedarse sin enlaces: con un pie nuevo hay que decidir dónde van.

El pie de la Academia lo reescribe entero academia-cabecera.py, así que ese
script le pide el mismo pedazo a `enlaces()` de acá: una sola copia, y correr
cualquiera de los dos en cualquier orden deja el mismo archivo.

Se puede correr todas las veces que se quiera: reconoce lo suyo por las marcas.
Con --comprobar no escribe nada: falla si alguna página quedaría distinta (lo
usa verificar-legal.js, para que un pie nuevo sin enlaces no pase el CI).

    python3 herramientas/legal-pie.py [--comprobar]
"""
import glob
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INICIO = "<!-- legal: inicio -->"
FIN = "<!-- legal: fin -->"

# cursos/recursos/ y cursos/protegido/ los escriben los generadores de cursos,
# y los dos documentos accesibles, los suyos (guia-profesores.js,
# diagnostico-libro.js): lo que se genera no se edita a mano. Todos piden
# sesión, y quien tiene sesión ya pasó por las páginas que sí llevan el pie.
CARPETAS_FUERA = ("cursos/recursos/", "cursos/protegido/", "herramientas/", "node_modules/", "docs/", "supabase/")
FUERA = {"guia-del-profesor-accesible.html", "libro-de-diagnostico-accesible.html"}

ENLACE = ('class="underline underline-offset-2 hover:no-underline rounded '
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"')

FOOTER_RE = re.compile(r'<footer[\s\S]*?</footer>')
MARCADO_RE = re.compile(re.escape(INICIO) + r'[\s\S]*?' + re.escape(FIN))
COPY_RE = re.compile(r'<p>(?:&copy;|©)[\s\S]*?</p>')


def enlaces(ruta):
    """El pedazo de los enlaces, con la ruta relativa según la carpeta."""
    prefijo = "../" * ruta.replace(os.sep, "/").count("/")
    return (f'{INICIO}<p class="mt-2">'
            f'<a href="{prefijo}privacidad.html" {ENLACE}>Política de privacidad</a>'
            ' <span aria-hidden="true">·</span> '
            f'<a href="{prefijo}terminos.html" {ENLACE}>Términos y condiciones</a>'
            f'</p>{FIN}')


def paginas():
    salida = []
    for ruta in sorted(glob.glob("**/*.html", root_dir=RAIZ, recursive=True)):
        r = ruta.replace(os.sep, "/")
        if r.startswith(CARPETAS_FUERA) or r in FUERA:
            continue
        salida.append(r)
    return salida


def poner(ruta, texto):
    """El texto con los enlaces puestos, o None si la página no tiene pie."""
    m = FOOTER_RE.search(texto)
    if not m:
        return None
    pie = MARCADO_RE.sub("", m.group(0))
    c = COPY_RE.search(pie)
    if not c:
        raise SystemExit(f"{ruta}: tiene <footer> pero no el párrafo del ©; decidir dónde van los enlaces legales")
    pie = pie[:c.end()] + enlaces(ruta) + pie[c.end():]
    return texto[:m.start()] + pie + texto[m.end():]


def main():
    comprobar = "--comprobar" in sys.argv
    cambiadas = 0
    sin_pie = []
    for r in paginas():
        camino = os.path.join(RAIZ, r)
        texto = open(camino, encoding="utf-8").read()
        nuevo = poner(r, texto)
        if nuevo is None:
            sin_pie.append(r)
            continue
        if nuevo != texto:
            cambiadas += 1
            if comprobar:
                print(f"FALTA  {r}: el pie no tiene los enlaces legales al día")
            else:
                open(camino, "w", encoding="utf-8").write(nuevo)
    if comprobar:
        print(f"{cambiadas} páginas sin los enlaces legales al día (correr herramientas/legal-pie.py).")
        sys.exit(1 if cambiadas else 0)
    print(f"Enlaces legales al día; {cambiadas} páginas cambiadas.")
    if "-v" in sys.argv:
        print("Sin pie (no llevan):", " ".join(sin_pie))


if __name__ == "__main__":
    main()
