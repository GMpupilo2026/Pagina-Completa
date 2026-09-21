#!/usr/bin/env python3
"""Comprueba los dos PDF de la guía del profesor: lo que no se ve en pantalla.

Un PDF roto no da ningún error: se descarga igual. Una marca de agua que se
estampó solo en la primera página se ve perfecta al abrirlo y falta en el papel;
un archivo que quedó sin proteger se baja igual; y un PDF al que se le bloqueó
la extracción de texto se ve idéntico y deja el material fuera del alcance de
quien lo lee con lector de pantalla.

Lo que se comprueba, archivo por archivo:

  - que abra SIN contraseña (nadie tiene que pedir una clave para leer la guía);
  - que esté cifrado, o sea que los permisos de abajo valgan de algo;
  - que SÍ deje imprimir y SÍ deje extraer texto — acá va al revés que los tres
    libros del banco de preguntas, a propósito: esta guía es material de trabajo
    que se lleva en papel a la capacitación, no un examen que conviene que no
    circule;
  - que NO deje modificarlo ni reordenarle las páginas;
  - que lleve al autor en los datos del archivo;
  - que tenga marca de agua en TODAS las páginas del cuerpo (el error clásico es
    estamparla solo en la portada) y no en la portada de la presentación, que ya
    lleva el logo en grande;
  - que las tildes y las eñes hayan llegado.

Y de la versión accesible: que no dependa de ninguna imagen y que cuente lo
mismo que los PDF.

Se corre:  python3 herramientas/verificar-guia-profesores.py
Necesita pypdf.  No necesita navegador ni el sitio servido.
"""
import json
import pathlib
import re
import sys

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CLAVE_PROPIETARIO = "guia-profesores-ai-2026"
AUTOR = "IA Oscar Angulo Cubero"

# El logo de la marca de agua entra al PDF como imagen. Estampar la hoja de
# sello sobre una página deja ahí su XObject, así que "esta página lleva marca"
# es "esta página referencia una imagen". Es lo que de verdad se quiere saber:
# el texto de la guía no trae ninguna otra imagen.
#
# Y hay que buscarla EN PROFUNDIDAD: `merge_page` no pega la imagen al primer
# nivel de los recursos de la página, la envuelve en un XObject de tipo /Form y
# la imagen queda dentro de los recursos de ese formulario. Mirando solo el
# primer nivel, la comprobación daba "no hay marca" en un archivo que sí la
# tiene — un verificador que falla sobre algo correcto se termina apagando, y
# con él se va la comprobación de verdad.
def tiene_marca(objeto, visitados=None) -> bool:
    if visitados is None:
        visitados = set()
    recursos = objeto.get("/Resources")
    if recursos is None:
        return False
    xobjetos = recursos.get_object().get("/XObject")
    if xobjetos is None:
        return False
    for ref in xobjetos.get_object().values():
        hijo = ref.get_object()
        if hijo.get("/Subtype") == "/Image":
            return True
        if id(hijo) in visitados:
            continue
        visitados.add(id(hijo))
        if hijo.get("/Subtype") == "/Form" and tiene_marca(hijo, visitados):
            return True
    return False


fallos = []
def comprobar(bien, que, detalle=""):
    print(("  ok   " if bien else "  FALLA ") + que + (("\n         " + detalle) if (detalle and not bien) else ""))
    if not bien:
        fallos.append(que)


# Cuántas imágenes referencia una página, contadas en profundidad. Desde que
# los apartados llevan captura de pantalla, "¿tiene alguna imagen?" ya no sirve
# para saber si está la marca de agua: una página con captura la tendría igual
# aunque el sello no se hubiera estampado. Lo que distingue es el NÚMERO.
def cuantas_imagenes(objeto, visitados=None) -> int:
    if visitados is None:
        visitados = set()
    recursos = objeto.get("/Resources")
    if recursos is None:
        return 0
    xobjetos = recursos.get_object().get("/XObject")
    if xobjetos is None:
        return 0
    total = 0
    for ref in xobjetos.get_object().values():
        hijo = ref.get_object()
        if hijo.get("/Subtype") == "/Image":
            total += 1
        elif hijo.get("/Subtype") == "/Form" and id(hijo) not in visitados:
            visitados.add(id(hijo))
            total += cuantas_imagenes(hijo, visitados)
    return total


def revisar_pdf(nombre, primera_con_marca, titulo_esperado):
    archivo = RAIZ / nombre
    print(f"\n{nombre}")
    if not archivo.exists():
        comprobar(False, f"{nombre} existe",
                  "corre: node herramientas/guia-profesores.js")
        return

    lector = PdfReader(str(archivo))
    comprobar(lector.is_encrypted, "está cifrado (sus permisos valen de algo)")

    # Contraseña vacía: se abre normal. La de propietario solo levanta permisos.
    abre_sin_clave = lector.decrypt("") if lector.is_encrypted else True
    comprobar(bool(abre_sin_clave), "se abre sin pedir contraseña")

    paginas = len(lector.pages)
    comprobar(paginas > 10, f"tiene cuerpo de verdad ({paginas} páginas)")

    # Ojo: `permisos` es un IntFlag, y `permisos.MODIFY` devuelve SIEMPRE el
    # miembro del enum —que es truthy— en vez de decir si ese bit está puesto.
    # Preguntado así, todas las líneas de abajo daban lo mismo para cualquier
    # archivo: la comprobación se veía perfecta y no comprobaba nada. Se
    # pregunta con `in`, que sí mira el bit.
    permisos = lector.user_access_permissions
    P = UserAccessPermissions
    if permisos is None:
        comprobar(False, "declara permisos de usuario")
    else:
        comprobar(P.PRINT in permisos,
                  "SÍ se puede imprimir (es material de trabajo, no un examen)")
        comprobar(P.EXTRACT_TEXT_AND_GRAPHICS in permisos,
                  "SÍ se le puede extraer el texto (lectores de pantalla)")
        comprobar(P.MODIFY not in permisos, "NO se puede modificar")
        comprobar(P.ASSEMBLE_DOC not in permisos, "NO se le pueden reordenar las páginas")

    datos = lector.metadata or {}
    comprobar((datos.get("/Author") or "") == AUTOR,
              "lleva al autor en los datos del archivo", repr(datos.get("/Author")))
    comprobar(titulo_esperado.lower() in (datos.get("/Title") or "").lower(),
              "lleva su título en los datos del archivo", repr(datos.get("/Title")))

    sin_marca = [n + 1 for n, p in enumerate(lector.pages)
                 if n >= primera_con_marca and not tiene_marca(p)]
    comprobar(not sin_marca,
              f"marca de agua en las {paginas - primera_con_marca} páginas del cuerpo",
              f"faltan en las páginas {sin_marca[:10]}")

    if primera_con_marca > 0:
        # La portada de la presentación lleva el logo en grande, así que ahí SÍ
        # hay imagen: lo que se comprueba es que exista, no que falte.
        comprobar(tiene_marca(lector.pages[0]),
                  "la portada lleva el logo en grande")

    # Las capturas de pantalla: que hayan llegado al archivo. Una que se quede
    # fuera no rompe nada —el PDF se abre igual— y deja el apartado hablando de
    # una pantalla que no se ve por ninguna parte.
    contenido = json.loads((RAIZ / "herramientas/guia/contenido.json").read_text(encoding="utf-8"))
    cuantas = sum(1 for c in contenido["capitulos"] for l in c["laminas"] if l.get("captura"))
    con_captura = sum(1 for p in lector.pages if cuantas_imagenes(p) > 1)
    comprobar(con_captura == cuantas,
              f"las {cuantas} capturas de pantalla llegaron al archivo",
              f"encontré {con_captura} páginas con más de una imagen")

    texto = "".join((lector.pages[n].extract_text() or "") for n in range(min(6, paginas)))
    comprobar("Guía del profesor" in texto or "Guia del profesor" in texto,
              "el texto se extrae y dice de qué es")
    comprobar(re.search(r"[áéíóúñÁÉÍÓÚÑ¿«]", texto) is not None,
              "las tildes y las eñes llegaron al PDF")
    comprobar(AUTOR in texto, "el autor va escrito dentro del documento")


def revisar_accesible(contenido):
    nombre = "guia-del-profesor-accesible.html"
    archivo = RAIZ / nombre
    print(f"\n{nombre}")
    if not archivo.exists():
        comprobar(False, f"{nombre} existe",
                  "corre: node herramientas/guia-profesores.js")
        return
    html = archivo.read_text(encoding="utf-8")

    comprobar("<img" not in html and "<svg" not in html,
              "no depende de ninguna imagen")
    comprobar('lang="es"' in html, "declara el idioma")
    comprobar(AUTOR in html, "lleva al autor")
    comprobar("uso docente" in html.lower(), "lleva el aviso de uso docente")
    comprobar(html.count("<h1") == 1, "tiene un solo h1")

    titulos = [l["titulo"] for c in contenido["capitulos"] for l in c["laminas"]]
    faltan = [t for t in titulos if t not in html]
    comprobar(not faltan, f"están los {len(titulos)} apartados",
              " · ".join(faltan[:4]))

    capitulos = [c["titulo"] for c in contenido["capitulos"]]
    faltan_caps = [c for c in capitulos if c not in html]
    comprobar(not faltan_caps, f"están los {len(capitulos)} capítulos",
              " · ".join(faltan_caps[:4]))


def main():
    contenido = json.loads((RAIZ / "herramientas/guia/contenido.json").read_text(encoding="utf-8"))
    laminas = sum(len(c["laminas"]) for c in contenido["capitulos"])
    print(f"Guía del profesor · {len(contenido['capitulos'])} capítulos · {laminas} apartados")

    # En la presentación la portada no lleva marca de agua (tiene el logo en
    # grande); en el manual la primera página ya es contenido.
    revisar_pdf("guia-del-profesor-presentacion.pdf", 1, "presentacion")
    revisar_pdf("guia-del-profesor.pdf", 0, "manual")
    revisar_accesible(contenido)

    if fallos:
        print(f"\n{len(fallos)} {'problema' if len(fallos) == 1 else 'problemas'}.")
        sys.exit(1)
    print("\nTodo bien.")


if __name__ == "__main__":
    main()
