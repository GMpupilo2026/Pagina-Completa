"""Comprueba el PDF del libro «Los tipos de mate»: material/tipos-de-mate/tipos-de-mate.pdf.

Lo que se rompe acá no da error en pantalla. Un PDF sin proteger se baja igual;
una marca de agua que solo se estampa en la primera página se ve perfecta hasta
que alguien pasa a la segunda; un test que se quedó fuera del libro no lo echa
de menos nadie hasta que alguien lo busca. Por eso se comprueba contra el banco
(material/tipos-de-mate/banco.json).

  - que el PDF esté cifrado, se abra sin contraseña y deje imprimir (es un
    cuaderno de trabajo: se contesta en papel) pero no modificar;
  - que lleve a los dos entrenadores, Oscar Angulo Cubero y Sebastian Mora
    Chavarria, en los datos del archivo, en la tapa y en el pie de CADA página;
  - que tenga la marca de agua (el logo) en TODAS las páginas;
  - que estén los 19 capítulos, los 152 ejercicios con sus soluciones y la
    planilla de avance.

    pip install pypdf && python3 herramientas/verificar-tipos-de-mate-pdf.py
"""
import json
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTORES = ("Oscar Angulo Cubero", "Sebastian Mora Chavarria")
PIE = "Entrenadores Oscar Angulo Cubero y Sebastian Mora Chavarria"
PDF = os.path.join(RAIZ, "material", "tipos-de-mate", "tipos-de-mate.pdf")

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

fallos = []
def mal(que):
    fallos.append(que)

with open(os.path.join(RAIZ, "material", "tipos-de-mate", "banco.json"), encoding="utf-8") as f:
    CAPITULOS = json.load(f)["capitulos"]
EJERCICIOS = sum(len(c["ejercicios"]) for c in CAPITULOS)

def imagenes(pagina, visto=None):
    """pypdf mete lo estampado dentro de un Form XObject: hay que bajar a buscarlo."""
    visto = set() if visto is None else visto
    recursos = pagina.get("/Resources")
    if recursos is None:
        return 0
    xo = recursos.get_object().get("/XObject")
    if xo is None:
        return 0
    total = 0
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

print("=== tipos-de-mate.pdf ===")
if not os.path.exists(PDF):
    sys.exit("No existe el PDF. Se genera con: node herramientas/tipos-de-mate-pdf.js")

lector = PdfReader(PDF)
if not lector.is_encrypted:
    mal("no está protegido")
elif lector.decrypt("") == 0:
    mal("pide contraseña para abrirse, y no debería")
else:
    p = lector.user_access_permissions
    if not p & Permisos.PRINT:
        mal("no deja imprimir, y es un cuaderno para contestar en papel")
    if p & Permisos.MODIFY:
        mal("deja modificar")

meta = lector.metadata or {}
for autor in AUTORES:
    if autor not in str(meta.get("/Author", "")):
        mal(f"el autor del archivo dice «{meta.get('/Author')}» y falta {autor}")

paginas = lector.pages
sin_marca = [n + 1 for n, pg in enumerate(paginas) if imagenes(pg) < 1]
if sin_marca:
    mal(f"{len(sin_marca)} páginas sin marca de agua ni logo: {sin_marca[:8]}")

textos = [" ".join((pg.extract_text() or "").split()) for pg in paginas]
if not all(a in textos[0] for a in AUTORES):
    mal("la tapa no dice quiénes son los entrenadores")
sin_pie = [n + 1 for n, t in enumerate(textos) if n > 0 and PIE not in t]
if sin_pie:
    mal(f"{len(sin_pie)} páginas sin los entrenadores en el pie: {sin_pie[:8]}")
plano = " ".join(textos)
for c in CAPITULOS:
    # El «Capítulo N de 19» de arriba lleva letras espaciadas y pypdf lo saca
    # letra por letra: se busca el renglón de las páginas de ejercicios.
    if f"Capítulo {c['n']} · {c['titulo']} · ejercicios" not in plano:
        mal(f"no está el capítulo {c['n']}, {c['titulo']}")
for n in range(1, EJERCICIOS + 1):
    if f"Ejercicio {n}." not in plano and f"{n} Juegan las" not in plano:
        mal(f"no está el ejercicio {n}")
if "Soluciones" not in plano:
    mal("faltan las soluciones")
if "Mi planilla de avance" not in plano:
    mal("falta la planilla de avance")

print(f"  {len(paginas)} páginas · {len(CAPITULOS)} capítulos · {EJERCICIOS} ejercicios · {round(os.path.getsize(PDF) / 1024)} KB")
print()
if fallos:
    for f in fallos:
        print("  ✗ " + f)
    print(f"\n{len(fallos)} fallo(s)")
    sys.exit(1)
print("Todo bien.")
