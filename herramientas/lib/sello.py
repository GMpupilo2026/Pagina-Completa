"""El sello escondido, para los generadores de Python.

Una sola copia: el sello y cómo se escribe viven en herramientas/lib/sello.js;
esto los lee de ahí (ver ese archivo y «El sello escondido en cada archivo»
en docs/decisiones/sitio-e-infraestructura.md).

    import sys, os; sys.path.insert(0, os.path.join(HERRAMIENTAS, "lib"))
    from sello import estampar
    html = estampar(html, "pagina.html")
"""
import os
import re

_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sello.js"), encoding="utf-8").read()
SELLO = re.search(r'const SELLO = "([^"]+)";', _JS).group(1)
FORMAS = {ext: forma.replace("${SELLO}", SELLO)
          for ext, forma in re.findall(r'"(\.[a-z0-9]+)": `([^`]*)`', _JS)}


def forma(ruta):
    return FORMAS.get(os.path.splitext(ruta)[1].lower())


def tiene(texto):
    return SELLO in texto


def estampar(texto, ruta):
    """Lo mismo que estampar() de sello.js: el sello en una línea al final."""
    f = forma(ruta)
    if not f or tiene(texto):
        return texto
    return texto + "\n" + f + "\n"

# rev bfb5bbb0d2d82f9f
