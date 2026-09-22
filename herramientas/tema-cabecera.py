#!/usr/bin/env python3
"""Pone en el <head> de cada página el script que aplica el tema de plataforma.

Son cuatro líneas de JavaScript en línea que leen la preferencia de
localStorage y ponen `data-tema` en <html>. Van en TODAS las páginas y en el
<head>, por la misma razón que el script del modo oscuro que está justo arriba:
si el atributo se pusiera después, con un script normal, la página se pintaría
primero azul y después rosada — un parpadeo en cada carga y en cada página.

Y van EN LÍNEA y no como `<script src>` por la razón de siempre en este sitio:
un archivo más pedido en el <head> de las 100 páginas bloquea el primer pintado
de todas para algo que son cuatro líneas. La tabla de temas entera
(js/temas-plataforma.js, con las siete paletas) solo la carga quien la necesita:
configuracion.html, que es donde se elige.

**La lista de páginas se le pide a pwa-cabecera.py y no se vuelve a escribir.**
Es la misma lista, y este repositorio ya se comió una vez el costo de tener dos
que tenían que decir lo mismo: verificar-pwa.js exceptuaba el libro del
diagnóstico y el generador se lo ponía igual en cada corrida, sin que nada se
quejara.

Se puede correr todas las veces que se quiera: reconoce lo suyo por las marcas.

    python3 herramientas/tema-cabecera.py [--quitar]
"""
import importlib.util
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INICIO = "<!-- tema: inicio -->"
FIN = "<!-- tema: fin -->"

# El nombre del archivo lleva guión, así que no se puede importar con `import`.
_spec = importlib.util.spec_from_file_location(
    "pwa_cabecera", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pwa-cabecera.py"))
_pwa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pwa)

# Un id que no existe no pinta nada (no hay regla :root[data-tema="loquesea"]),
# así que lo único que hace falta comprobar acá es que lo guardado parezca un
# id y no un pedazo de HTML. La lista de temas de verdad la valida
# js/temas-plataforma.js al guardar, que es quien la tiene.
BLOQUE = (
    INICIO
    + "<script>(function(){try{"
    + "var t=localStorage.getItem('plataforma_tema_v1');"
    + "if(!t||!/^[a-z]{2,24}$/.test(t)||t==='clasico')return;"
    + "document.documentElement.setAttribute('data-tema',t);"
    # La barra del sistema en el celular (la app instalada) la deja escrita
    # herramientas/pwa-cabecera.py con el azul de siempre: sin esto quedaría una
    # barra azul encima de un encabezado rosado. El color se lee de la variable
    # que acaba de quedar puesta y no de una tabla copiada acá — un script que
    # sigue a una hoja de estilos espera a que la hoja cargue, así que el valor
    # ya está calculado. Si no lo estuviera, no se toca nada y queda el de
    # siempre.
    + "var b=getComputedStyle(document.documentElement).getPropertyValue('--c-brand-800').trim();"
    + "var m=document.querySelector('meta[name=\"theme-color\"]');"
    + "if(b&&m)m.setAttribute('content','rgb('+b.replace(/\\s+/g,',')+')');"
    + "var f=localStorage.getItem('plataforma_tema_fuente_v1');"
    + "if(!f||!/^[A-Za-z0-9 ]{2,32}$/.test(f))return;"
    + "var l=document.createElement('link');l.rel='stylesheet';"
    + "l.href='https://fonts.googleapis.com/css2?family='+f.replace(/ /g,'+')"
    + "+':wght@400;500;600;700&display=swap';"
    + "document.head.appendChild(l);"
    + "}catch(e){}})();</script>"
    + FIN
)


def poner(ruta, quitar=False):
    s = open(ruta, encoding="utf-8").read()
    original = s
    i = s.find(INICIO)
    if i >= 0:
        j = s.find(FIN, i)
        s = s[:i] + s[j + len(FIN):]
    if not quitar:
        cierre = s.find("</head>")
        if cierre < 0:
            return None
        s = s[:cierre] + BLOQUE + s[cierre:]
    if s != original:
        open(ruta, "w", encoding="utf-8").write(s)
        return True
    return False


def main():
    quitar = "--quitar" in sys.argv
    os.chdir(RAIZ)
    paginas = _pwa.paginas()
    tocadas = sin_head = 0
    for ruta in paginas:
        r = poner(ruta, quitar)
        if r is None:
            sin_head += 1
        elif r:
            tocadas += 1
    verbo = "sin el script del tema" if quitar else "con el script del tema"
    print(f"{len(paginas)} páginas revisadas · {tocadas} {verbo}"
          + (f" · {sin_head} sin <head> (no se tocaron)" if sin_head else ""))


if __name__ == "__main__":
    main()
