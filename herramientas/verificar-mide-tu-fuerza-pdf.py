"""Comprueba el PDF del libro «Mide tu fuerza»: material/mide-tu-fuerza/mide-tu-fuerza.pdf.

Lo que se rompe acá no da error en pantalla. Un PDF sin proteger se baja igual;
una marca de agua que solo se estampa en la primera página se ve perfecta hasta
que alguien pasa a la segunda; un test que se quedó fuera del libro no lo echa
de menos nadie hasta que alguien lo busca. Por eso se comprueba contra el banco.

  - que el PDF esté cifrado, se abra sin contraseña y deje imprimir (es un
    cuaderno de trabajo: se contesta en papel) pero no modificar;
  - que lleve a Oscar Angulo Cubero en los datos del archivo y en el texto;
  - que tenga la marca de agua (el logo) en TODAS las páginas;
  - que estén los 45 tests con sus soluciones.

    pip install pypdf && python3 herramientas/verificar-mide-tu-fuerza-pdf.py
"""
import json
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOR = "Oscar Angulo Cubero"
PDF = os.path.join(RAIZ, "material", "mide-tu-fuerza", "mide-tu-fuerza.pdf")

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

fallos = []
def mal(que):
    fallos.append(que)

TESTS = json.loads(subprocess.check_output(["node", "-e", """
global.window = {};
eval(require("fs").readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(Math.max.apply(null, global.window.MIDE_TU_FUERZA_ITEMS.map(function (i) { return i.test; }))));
""", os.path.join(RAIZ, "material/mide-tu-fuerza/banco.js")], text=True))

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

print("=== mide-tu-fuerza.pdf ===")
if not os.path.exists(PDF):
    sys.exit("No existe el PDF. Se genera con: node herramientas/mide-tu-fuerza-pdf.js")

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
if AUTOR not in str(meta.get("/Author", "")):
    mal(f"el autor del archivo dice «{meta.get('/Author')}»")

paginas = lector.pages
sin_marca = [n + 1 for n, pg in enumerate(paginas) if imagenes(pg) < 1]
if sin_marca:
    mal(f"{len(sin_marca)} páginas sin marca de agua ni logo: {sin_marca[:8]}")

texto = "\n".join(pg.extract_text() or "" for pg in paginas)
plano = " ".join(texto.split())
if AUTOR not in plano:
    mal("el texto no dice quién es el autor")
for t in range(1, TESTS + 1):
    if f"Test {t} " not in plano:
        mal(f"no está el test {t}")
    if f"Soluciones del test {t}" not in plano:
        mal(f"no están las soluciones del test {t}")
if "Cuadro de puntuación" not in plano:
    mal("falta el cuadro de puntuación")

print(f"  {len(paginas)} páginas · {TESTS} tests · {round(os.path.getsize(PDF) / 1024)} KB")
print()
if fallos:
    for f in fallos:
        print("  ✗ " + f)
    print(f"\n{len(fallos)} fallo(s)")
    sys.exit(1)
print("Todo bien.")
