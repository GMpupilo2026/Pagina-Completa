"""Comprueba el libro «Coachess en resumen»: material/coachess-resumen/.

Lo que se rompe acá no da error en pantalla. Un PDF sin proteger se baja igual;
una marca de agua que solo se estampa en la primera página se ve perfecta hasta
que alguien pasa a la segunda; un capítulo que se quedó fuera no lo echa de
menos nadie. Y este libro tiene una obligación más que los otros: es el resumen
de un libro ajeno, así que el autor del original tiene que estar nombrado en
la tapa, en los datos del archivo y en la versión accesible.

  - que el PDF esté cifrado, se abra sin contraseña y deje imprimir, pero no
    modificar;
  - que nombre a quien lo resumió y al autor del original (Daniel Muñoz
    Sánchez) en los datos del archivo y en el texto;
  - que tenga la marca de agua (el logo) en TODAS las páginas;
  - que estén los veinte capítulos, «El libro en una página» y los veinte
    consejos, en el PDF y en la versión accesible, y que esta no traiga
    ninguna imagen ni ningún script.

    pip install pypdf && python3 herramientas/verificar-coachess-resumen.py
"""
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "material", "coachess-resumen")
PDF = os.path.join(CARPETA, "coachess-resumen.pdf")
ACCESIBLE = os.path.join(CARPETA, "coachess-resumen-accesible.html")

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

fallos = []
def mal(que):
    fallos.append(que)

# El texto del libro: el mismo módulo que usa el generador.
LIBRO = json.loads(subprocess.check_output(["node", "-e", """
const L = require(process.argv[1]);
console.log(JSON.stringify({
  resumido: L.RESUMIDO_POR, autor: L.AUTOR_ORIGINAL,
  capitulos: L.partes.flatMap((p) => p.capitulos.map((c) => c.titulo)),
  consejos: L.veinteConsejos.length,
}));
""", os.path.join(RAIZ, "herramientas", "libros", "coachess-resumen.js")], text=True))

def plano(t):
    return " ".join(t.split())

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

print("=== coachess-resumen.pdf ===")
if not os.path.exists(PDF):
    sys.exit("No existe el PDF. Se genera con: node herramientas/coachess-resumen-pdf.js")

if LIBRO["consejos"] != 20:
    mal(f"el epílogo trae {LIBRO['consejos']} consejos y son veinte")

lector = PdfReader(PDF)
if not lector.is_encrypted:
    mal("no está protegido")
elif lector.decrypt("") == 0:
    mal("pide contraseña para abrirse, y no debería")
else:
    p = lector.user_access_permissions
    if not p & Permisos.PRINT:
        mal("no deja imprimir")
    if p & Permisos.MODIFY:
        mal("deja modificar")

meta = lector.metadata or {}
for quien in (LIBRO["resumido"], LIBRO["autor"]):
    if quien not in str(meta.get("/Author", "")) + str(meta.get("/Subject", "")):
        mal(f"los datos del archivo no nombran a {quien}")

paginas = lector.pages
sin_marca = [n + 1 for n, pg in enumerate(paginas) if imagenes(pg) < 1]
if sin_marca:
    mal(f"{len(sin_marca)} páginas sin marca de agua ni logo: {sin_marca[:8]}")

texto = plano("\n".join(pg.extract_text() or "" for pg in paginas))
for quien in (LIBRO["resumido"], LIBRO["autor"]):
    if quien not in texto:
        mal(f"el PDF no nombra a {quien}")
if LIBRO["autor"] not in plano(paginas[0].extract_text() or ""):
    mal("la tapa no dice de quién es el libro resumido")
for n, titulo in enumerate(LIBRO["capitulos"], 1):
    # En el índice va como «3. El cuerpo piensa primero».
    if f"{n}. {plano(titulo)}" not in texto:
        mal(f"no está el capítulo {n}, «{titulo}»")
for que in ("El libro en una página", "Los veinte consejos del autor", "Tu plan: del tablero a tu vida", "Sobre este resumen"):
    if que not in texto:
        mal(f"falta «{que}»")

print("=== coachess-resumen-accesible.html ===")
if not os.path.exists(ACCESIBLE):
    mal("no existe la versión accesible")
else:
    html = open(ACCESIBLE, encoding="utf-8").read()
    if re.search(r"<(img|svg|script)\b", html, re.I):
        mal("la versión accesible trae imágenes o scripts")
    leido = plano(re.sub(r"<[^>]+>", " ", html))
    for quien in (LIBRO["resumido"], LIBRO["autor"]):
        if quien not in leido:
            mal(f"la versión accesible no nombra a {quien}")
    for n, titulo in enumerate(LIBRO["capitulos"], 1):
        if f"Capítulo {n}: {plano(titulo)}" not in leido:
            mal(f"la versión accesible no trae el capítulo {n}")
    if len(re.findall(r"<li>", html.split("Los veinte consejos del autor", 1)[-1].split("</ol>", 1)[0])) != 20:
        mal("la versión accesible no trae los veinte consejos")

print(f"  {len(paginas)} páginas · {len(LIBRO['capitulos'])} capítulos · {round(os.path.getsize(PDF) / 1024)} KB")
print()
if fallos:
    for f in fallos:
        print("  ✗ " + f)
    print(f"\n{len(fallos)} fallo(s)")
    sys.exit(1)
print("Todo bien.")
