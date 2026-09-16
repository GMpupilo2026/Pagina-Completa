#!/usr/bin/env python3
"""Comprueba el material de estudio de las lecciones.

Lo que se rompe acá no da error en pantalla: un PDF sin proteger se baja igual,
un enlace a un archivo que no existe da un 404 que solo ve el alumno, y un
cuadernillo sin la sección de fuentes es exactamente el problema que este
material vino a evitar. Por eso se comprueba archivo por archivo.

De una corrida:
  - que cada lección de cada curso tenga sus DOS archivos (PDF y accesible) y
    que los dos estén enlazados desde la lección, con el nombre correcto;
  - que cada PDF esté cifrado, se abra sin contraseña y NO deje imprimir,
    copiar ni modificar — pero sí extraer texto, que es lo que necesita un
    lector de pantalla;
  - que lleve a Oscar Angulo Cubero como autor en los datos del archivo Y en
    el texto, la sección de fuentes, el aviso de uso y la marca de agua en
    TODAS las páginas;
  - que la versión accesible no dependa de ninguna imagen, tenga los
    encabezados en orden y describa cada posición en palabras.

    pip install pypdf && python3 herramientas/verificar-material.py
"""
import html
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOR = "Oscar Angulo Cubero"

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    print("Falta pypdf.  pip install pypdf")
    sys.exit(2)

fallos = []
def mal(donde, que):
    fallos.append(f"{donde}: {que}")

def lecciones_de(slug):
    """Los <details> de primer nivel, igual que herramientas/lib/leer-curso.js."""
    ruta = os.path.join(RAIZ, "cursos", "protegido", slug + ".html")
    s = open(ruta, encoding="utf-8").read()
    trozos, nivel, inicio = [], 0, -1
    for m in re.finditer(r"<details\b|</details>", s):
        if m.group(0) == "</details>":
            nivel -= 1
            if nivel == 0 and inicio >= 0:
                trozos.append(s[inicio:m.end()]); inicio = -1
        else:
            if nivel == 0:
                inicio = m.start()
            nivel += 1
    return trozos

def imagenes(pagina, visto=None):
    """pypdf mete lo mezclado dentro de un Form XObject: hay que bajar a buscarlo."""
    visto = set() if visto is None else visto
    total = 0
    recursos = pagina.get("/Resources")
    if recursos is None:
        return 0
    xo = recursos.get_object().get("/XObject")
    if xo is None:
        return 0
    for _, v in xo.get_object().items():
        o = v.get_object()
        if id(o) in visto:
            continue
        visto.add(id(o))
        sub = o.get("/Subtype")
        if sub == "/Image":
            total += 1
        elif sub == "/Form":
            total += imagenes(o, visto)
    return total

CURSOS = [
    "fundamentos-del-ajedrez", "finales-practicos", "estrategia-y-tactica",
    "aperturas-y-defensas", "calculo-y-visualizacion", "desequilibrios-de-material",
    "el-mapa-de-los-finales", "estrategia-en-el-final", "partidas-modelo",
    "preparacion-para-torneos",
]

total_lecciones = total_paginas = con_ejemplo = 0
peso = 0

for slug in CURSOS:
    detalles = lecciones_de(slug)
    for i, trozo in enumerate(detalles, 1):
        sum_m = re.search(r"<summary[^>]*>(.*?)</summary>", trozo, re.S)
        titulo = html.unescape(re.sub(r"<[^>]+>", "", sum_m.group(1))).strip() if sum_m else f"lección {i}"
        donde = f"{slug} · {titulo[:45]}"
        total_lecciones += 1

        # ---- los dos enlaces, y que apunten a algo que existe
        enlaces = re.findall(r'href="(\.\./recursos/[^"]*-material(?:-accesible\.html|\.pdf))"', trozo)
        pdfs = [e for e in enlaces if e.endswith(".pdf")]
        accs = [e for e in enlaces if e.endswith(".html")]
        if len(pdfs) != 1:
            mal(donde, f"tiene {len(pdfs)} enlaces al PDF de material y debería tener 1")
        if len(accs) != 1:
            mal(donde, f"tiene {len(accs)} enlaces a la versión accesible y debería tener 1")
        for e in enlaces:
            destino = os.path.normpath(os.path.join(RAIZ, "cursos", "protegido", e))
            if not os.path.exists(destino):
                mal(donde, f"el enlace apunta a un archivo que no existe: {e}")

        if not pdfs or not accs:
            continue
        ruta_pdf = os.path.normpath(os.path.join(RAIZ, "cursos", "protegido", pdfs[0]))
        ruta_acc = os.path.normpath(os.path.join(RAIZ, "cursos", "protegido", accs[0]))
        if not (os.path.exists(ruta_pdf) and os.path.exists(ruta_acc)):
            continue
        peso += os.path.getsize(ruta_pdf) + os.path.getsize(ruta_acc)

        # ---- el PDF
        try:
            lector = PdfReader(ruta_pdf)
        except Exception as e:                                   # noqa: BLE001
            mal(donde, f"el PDF no se puede abrir: {e}")
            continue
        if not lector.is_encrypted:
            mal(donde, "el PDF no está protegido")
            continue
        if lector.decrypt("") == 0:
            mal(donde, "el PDF pide contraseña para abrirse, y no debería")
            continue
        p = lector.user_access_permissions
        if p & Permisos.PRINT:
            mal(donde, "el PDF deja imprimir")
        if p & Permisos.MODIFY:
            mal(donde, "el PDF deja modificar")
        if p & Permisos.EXTRACT:
            mal(donde, "el PDF deja copiar el contenido")
        if not p & Permisos.EXTRACT_TEXT_AND_GRAPHICS:
            mal(donde, "el PDF NO deja extraer texto: queda fuera del alcance de un lector de pantalla")
        if (lector.metadata or {}).get("/Author") != AUTOR:
            mal(donde, f"el autor del archivo no es {AUTOR}")

        total_paginas += len(lector.pages)
        for n, pagina in enumerate(lector.pages, 1):
            if imagenes(pagina) < 1:
                mal(donde, f"la página {n} no lleva marca de agua")

        texto = "\n".join(pg.extract_text() or "" for pg in lector.pages)
        for etiqueta, buscar in [
            ("el nombre del autor", AUTOR),
            ("la sección de fuentes", "Fuentes"),
            ("las preguntas con su respuesta", "Respuesta."),
            ("los ejercicios", "Ejercicios"),
            ("los conceptos clave", "Conceptos clave"),
            ("el aviso de uso docente", "No se autoriza"),
            ("la aclaración sobre la lectura recomendada", "no reproduce texto"),
        ]:
            if buscar not in texto:
                mal(donde, f"al PDF le falta {etiqueta}")

        # ---- la versión accesible
        acc = open(ruta_acc, encoding="utf-8").read()
        if "<img" in acc or "background-image" in acc:
            mal(donde, "la versión accesible depende de una imagen")
        if AUTOR not in acc:
            mal(donde, f"la versión accesible no nombra a {AUTOR}")
        if 'lang="es"' not in acc:
            mal(donde, "la versión accesible no declara el idioma")
        if "No se autoriza" not in acc:
            mal(donde, "a la versión accesible le falta el aviso de uso docente")
        niveles = [int(h) for h in re.findall(r"<h([1-6])\b", acc)]
        if not niveles or niveles[0] != 1 or niveles.count(1) != 1:
            mal(donde, "la versión accesible no tiene exactamente un <h1> al principio")
        for antes, despues in zip(niveles, niveles[1:]):
            if despues > antes + 1:
                mal(donde, f"la versión accesible salta de h{antes} a h{despues}")
        # Si el cuadernillo trae diagrama, la versión accesible tiene que decirlo
        # en palabras: sin eso, quien la usa se queda sin el ejemplo.
        if "Ejemplos del curso" in texto:
            con_ejemplo += 1
            if "Piezas blancas:" not in acc:
                mal(donde, "el PDF trae diagrama y la versión accesible no lo describe en palabras")

print(f"{total_lecciones} lecciones · {total_lecciones * 2} archivos · {total_paginas} páginas de PDF")
print(f"{con_ejemplo} lecciones con posiciones de ejemplo · {peso / 1048576:.1f} MB en total")
if fallos:
    print(f"\n{len(fallos)} fallo(s):")
    for f in fallos[:40]:
        print("  ✗ " + f)
    if len(fallos) > 40:
        print(f"  … y {len(fallos) - 40} más")
    sys.exit(1)
print("\nTodo bien.")
