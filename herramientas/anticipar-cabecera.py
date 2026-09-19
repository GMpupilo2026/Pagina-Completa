#!/usr/bin/env python3
"""Pone las reglas de navegación anticipada en el <head> de cada página.

El sitio son 44 páginas sueltas y cada clic las pide en frío: la persona toca
«Cursos» y se queda mirando el blanco mientras viaja la petición. Con las
Speculation Rules, el navegador se baja la página cuando nota la intención de
ir —el mouse quieto encima del enlace, el dedo apoyado— así que al soltar ya la
tiene. Son los ~300 ms que separan «me llevó» de «ya estaba ahí».

**Es `prefetch` y NO `prerender`, y esa es la decisión de fondo.**

`prerender` es más rápido: baja la página Y LA EJECUTA, así que al hacer clic
ya está pintada. Acá no se puede, y no por gusto: 16 páginas cargan
`js/tiempo-plataforma.js`, que al arrancar INSERTA una fila en
`platform_activity_log` con la hora de entrada. Con prerender, pasar el mouse
por encima de «4×4» le apuntaría al alumno minutos de una página que nunca
abrió — y esos minutos son los que el profesor ve en Informes y los que llegan
a la casa en «📧 Informes a la casa».

No daría ningún error. Los números simplemente serían más altos, de forma
creíble, y nadie tendría por qué sospechar del cartel de «Cursos». Es la misma
clase de mentira silenciosa que la base ya bloquea desde el otro lado con
`proteger_tiempos_de_presencia()`: sería feo abrirla de nuevo desde el sitio.

`prefetch` solo trae el HTML. No ejecuta ni un script, así que no registra
nada, y como el HTML es lo que primero hay que esperar, se lleva casi toda la
mejora sin ese riesgo.

Qué queda FUERA de la anticipación:

  - `logout` y cualquier enlace con `?`: son acciones, no páginas. Traerse una
    de antemano es hacer la mitad de algo que nadie pidió.
  - los .pdf: pesan megabytes y llevan marca de agua de uso docente. Bajarlos
    «por si acaso» gasta los datos de quien anda con el celular.
  - `cursos/recursos/`: el material de estudio, por lo mismo.

`eagerness: moderate` es lo que ata la descarga a una intención de verdad
(~200 ms con el puntero encima, o el dedo apoyado). Con `eager` se bajaría todo
lo que hay en pantalla apenas carga la página, que en el panel de la Academia
son veinte tarjetas: le costaría datos a todo el mundo para acertarle a una.

Se puede correr todas las veces que se quiera: reconoce lo suyo por las marcas.

    python3 herramientas/anticipar-cabecera.py [--quitar]
"""
import glob
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INICIO = "<!-- anticipar: inicio -->"
FIN = "<!-- anticipar: fin -->"

CARPETAS_FUERA = ("cursos/recursos/", "herramientas/", "node_modules/")
# Fragmentos sin <head> propio y documentos que se abren sueltos.
PAGINAS_FUERA = {"offline.html", "libro-de-diagnostico-accesible.html"}

# CUIDADO CON LOS PATRONES: `href_matches` es un URLPattern, y ahí el `?` NO
# es un carácter cualquiera: separa la dirección de sus parámetros. Escribir
# `/*\?*` para decir «las que llevan parámetros» resulta en «cualquier ruta,
# con parámetros o sin ellos», o sea que coincide con TODO — comprobado:
# `/cursos.html`, que no tiene un solo parámetro, también da positivo.
#
# Metido dentro de un `not`, eso excluía el sitio entero y la anticipación no
# se disparaba NUNCA. La regla seguía ahí, escrita y bien formada, y el
# verificador que solo mirara que existiera daba verde. Por eso
# verificar-rendimiento.js pasa el mouse por encima de un enlace de verdad y
# comprueba que la descarga se adelante: lo único que distingue una regla que
# funciona de una que el navegador acepta y no aplica.
#
# Lo que se excluye se excluye por `selector_matches`, que mira el enlace y no
# la dirección, así que no tiene esa trampa.
REGLAS = {
    "prefetch": [
        {
            "where": {
                "and": [
                    {"href_matches": "/*"},
                    {
                        "not": {
                            "selector_matches":
                                # Sale del sitio, o no es una página:
                                '[target="_blank"], [download], [rel~="nofollow"], '
                                # Documentos: pesan y llevan marca de uso docente.
                                '[href$=".pdf"], [href*="/cursos/recursos/"], '
                                # Acciones, no páginas: traerlas de antemano es
                                # hacer media cosa que nadie pidió.
                                '[href*="logout"], [href^="mailto:"], [href^="tel:"], '
                                '[href^="https://wa.me"]'
                        }
                    },
                ]
            },
            "eagerness": "moderate",
        }
    ]
}

BLOQUE = (
    INICIO
    + '<script type="speculationrules">'
    + json.dumps(REGLAS, separators=(",", ":"))
    + "</script>"
    + FIN
)

MARCADO = re.compile(re.escape(INICIO) + r".*?" + re.escape(FIN), re.S)


def paginas():
    salida = []
    for ruta in sorted(set(glob.glob("**/*.html", recursive=True))):
        limpia = ruta.replace(os.sep, "/")
        if limpia.startswith(CARPETAS_FUERA) or os.path.basename(limpia) in PAGINAS_FUERA:
            continue
        salida.append(ruta)
    return salida


def main():
    quitar = "--quitar" in sys.argv
    os.chdir(RAIZ)
    tocadas = sin_head = 0

    for ruta in paginas():
        with open(ruta, encoding="utf-8") as f:
            original = f.read()

        # cursos/protegido/ son fragmentos que se inyectan: no tienen <head>.
        if "</head>" not in original:
            sin_head += 1
            continue

        texto = MARCADO.sub("", original)
        if not quitar:
            texto = texto.replace("</head>", BLOQUE + "</head>", 1)

        if texto != original:
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(texto)
            tocadas += 1

    print(f"{'Quitadas de' if quitar else 'Puestas en'} {tocadas} páginas "
          f"({sin_head} son fragmentos sin <head>)")


if __name__ == "__main__":
    main()
