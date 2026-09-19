#!/usr/bin/env python3
"""Cambia Google Fonts por las fuentes del propio sitio, en todas las páginas.

QUÉ SACA — las dos etiquetas que piden la fuente a Google:

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter…" rel="stylesheet">

QUÉ PONE en su lugar:

    <link rel="stylesheet" href="css/fuentes.css">

POR QUÉ. Pedirle la fuente a Google son DOS conexiones a terceros antes de
poder pintar el texto como se debe: una a fonts.googleapis.com por la hoja y,
recién cuando esa llega y se lee, otra a fonts.gstatic.com por el .woff2. El
`preconnect` adelanta el saludo pero no el segundo viaje, que no se puede
empezar hasta saber qué archivo pedir.

Y mientras tanto, con `display=swap`, el navegador pinta el texto con la fuente
del sistema y después lo cambia. Medido en este sitio: el mismo titular ocupa
5,9 % más ancho en una que en otra (12,6 % en las serif), o sea que al llegar
la fuente CADA LÍNEA del sitio se reacomoda. Eso no da ningún error y es
justamente lo que se lee como «página barata».

Autoalojada, la fuente sale del mismo origen que el HTML: sin saludo nuevo y
sin segundo viaje. Y el salto del texto lo tapa el respaldo ajustado de
css/fuentes.css, que ocupa exactamente el mismo espacio que la fuente final.

**Y NO SE PRECARGAN, aunque el consejo de manual diga que sí.** Se probó, se
midió y sale peor. En la portada, con 4G lenta, LCP mediana de tres corridas:

    precargando las dos      1488 ms
    precargando solo Inter   1284 ms
    sin precargar ninguna    1060 ms

La razón es que acá el elemento más grande de la pantalla es TEXTO, y lo que
demora en pintarlo es `css/tailwind.css`, que bloquea el render. Un `preload`
de fuente pide 95 KB con prioridad alta, y en un celular con 1,6 Mbps esos
95 KB salen del mismo caño que el CSS: la fuente llega antes y la página
entera, después.

Precargar vale la pena cuando la fuente es lo que hace esperar. Acá no lo es,
justamente porque el respaldo ajustado ya deja el texto en su sitio definitivo
desde el primer cuadro: cuando la fuente llega, cambia el dibujo de las letras
y no se mueve una sola línea. Adelantarla no le ahorra nada a nadie.

Si algún día se le agrega un preload «para optimizar», hay que volver a medir:
el número de arriba es de este sitio y de esta portada.

Se puede correr todas las veces que se quiera: reconoce lo suyo por las marcas.

    python3 herramientas/fuentes-cabecera.py [--quitar]
"""
import glob
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INICIO = "<!-- fuentes: inicio -->"
FIN = "<!-- fuentes: fin -->"

# inscripcion.html tiene su propio diseño y su propio CSS, pero usa las MISMAS
# dos fuentes, así que también se le cambian: es la página del formulario
# público de torneos, o sea de las que más se abren desde un celular ajeno.
CARPETAS_FUERA = ("cursos/recursos/", "herramientas/", "node_modules/")

# Lo que hay que sacar. Tres formas, porque no todas las páginas lo escriben
# igual (algunas traen el preconnect en otro orden, otras sin el crossorigin).
FUERA_RE = [
    re.compile(r'[ \t]*<link[^>]*rel="preconnect"[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?'),
    re.compile(r'[ \t]*<link[^>]*fonts\.googleapis\.com/css2[^>]*>\n?'),
    re.compile(r'[ \t]*<link[^>]*fonts\.googleapis\.com[^>]*rel="stylesheet"[^>]*>\n?'),
]

def bloque(ruta):
    """El bloque para esa página, con la hoja apuntada desde donde está.

    La hoja va con ruta RELATIVA, como el resto de las que carga cada página
    (`../css/tailwind.css` en cursos/, `../../css/` en cursos/academia/). Con
    "css/fuentes.css" a secas, una página de subcarpeta pediría
    cursos/css/fuentes.css: un 404 que deja esa página sin las fuentes Y sin
    los respaldos ajustados, o sea peor que antes del cambio — y sin dar
    ningún error, que es como se pierden estas cosas.

    Los .woff2 de dentro de la hoja sí van con ruta absoluta (`/fonts/…`): es
    una sola dirección válida desde cualquier profundidad.
    """
    hondo = ruta.replace(os.sep, "/").count("/")
    arriba = "../" * hondo
    return (
        f"{INICIO}"
        f'<link rel="stylesheet" href="{arriba}css/fuentes.css">'
        f"{FIN}"
    )

MARCADO = re.compile(re.escape(INICIO) + r".*?" + re.escape(FIN), re.S)


def paginas():
    salida = []
    for ruta in sorted(set(glob.glob("**/*.html", recursive=True))):
        if ruta.replace(os.sep, "/").startswith(CARPETAS_FUERA):
            continue
        salida.append(ruta)
    return salida


def main():
    quitar = "--quitar" in sys.argv
    os.chdir(RAIZ)
    tocadas = sin_fuente = 0

    for ruta in paginas():
        with open(ruta, encoding="utf-8") as f:
            original = f.read()

        # Solo las páginas que de verdad usan las fuentes del sitio.
        if "fonts.googleapis.com" not in original and INICIO not in original:
            sin_fuente += 1
            continue

        texto = MARCADO.sub("", original)
        for regla in FUERA_RE:
            texto = regla.sub("", texto)

        if not quitar:
            # Va justo antes de </head>, o sea DESPUÉS de css/tailwind.css: el
            # preload no depende del orden y la hoja de fuentes tiene que poder
            # pisar lo que declare Tailwind.
            if "</head>" not in texto:
                print(f"  ✗ {ruta}: no tiene </head>")
                continue
            texto = texto.replace("</head>", bloque(ruta) + "</head>", 1)

        if texto != original:
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(texto)
            tocadas += 1

    print(f"{'Quitadas de' if quitar else 'Puestas en'} {tocadas} páginas "
          f"({sin_fuente} no usan estas fuentes)")


if __name__ == "__main__":
    main()
