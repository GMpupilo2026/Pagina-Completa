"""Comprueba el PDF de cada volumen de «Mide tu fuerza»: material/mide-tu-fuerza/mide-tu-fuerza.pdf,
material/mide-tu-fuerza-2/mide-tu-fuerza-2.pdf…

Lo que se rompe acá no da error en pantalla. Un PDF sin proteger se baja igual;
una marca de agua que solo se estampa en la primera página se ve perfecta hasta
que alguien pasa a la segunda; un test que se quedó fuera del libro no lo echa
de menos nadie hasta que alguien lo busca. Por eso se comprueba contra el banco.

  - que el PDF esté cifrado, se abra sin contraseña y deje imprimir (es un
    cuaderno de trabajo: se contesta en papel) pero no modificar;
  - que lleve a Oscar Angulo Cubero en los datos del archivo y en el texto;
  - que tenga la marca de agua (el logo) en TODAS las páginas;
  - que estén los 45 tests con sus soluciones, y que la tapa diga qué volumen es.

    pip install pypdf && python3 herramientas/verificar-mide-tu-fuerza-pdf.py
"""
import json
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOR = "Oscar Angulo Cubero"

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

fallos = []
def mal(que):
    fallos.append(que)

def volumenes():
    """Los volúmenes que tienen banco: 1 en material/mide-tu-fuerza/, N en material/mide-tu-fuerza-N/."""
    v = []
    while True:
        n = len(v) + 1
        carpeta = "mide-tu-fuerza" if n == 1 else f"mide-tu-fuerza-{n}"
        if not os.path.exists(os.path.join(RAIZ, "material", carpeta, "banco.js")):
            return v
        v.append((n, carpeta))

def tests_del_banco(carpeta):
    return json.loads(subprocess.check_output(["node", "-e", """
global.window = {};
eval(require("fs").readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(Math.max.apply(null, global.window.MIDE_TU_FUERZA_ITEMS.map(function (i) { return i.test; }))));
""", os.path.join(RAIZ, "material", carpeta, "banco.js")], text=True))

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

def revisar(volumen, carpeta):
    PDF = os.path.join(RAIZ, "material", carpeta, carpeta + ".pdf")
    print(f"=== {carpeta}.pdf ===")
    if not os.path.exists(PDF):
        mal(f"{carpeta}: no existe. Se genera con: node herramientas/mide-tu-fuerza-pdf.js {volumen}")
        return
    TESTS = tests_del_banco(carpeta)

    lector = PdfReader(PDF)
    if not lector.is_encrypted:
        mal(f"{carpeta}: no está protegido")
    elif lector.decrypt("") == 0:
        mal(f"{carpeta}: pide contraseña para abrirse, y no debería")
    else:
        p = lector.user_access_permissions
        if not p & Permisos.PRINT:
            mal(f"{carpeta}: no deja imprimir, y es un cuaderno para contestar en papel")
        if p & Permisos.MODIFY:
            mal(f"{carpeta}: deja modificar")

    meta = lector.metadata or {}
    if AUTOR not in str(meta.get("/Author", "")):
        mal(f"{carpeta}: el autor del archivo dice «{meta.get('/Author')}»")

    paginas = lector.pages
    sin_marca = [n + 1 for n, pg in enumerate(paginas) if imagenes(pg) < 1]
    if sin_marca:
        mal(f"{carpeta}: {len(sin_marca)} páginas sin marca de agua ni logo: {sin_marca[:8]}")

    texto = "\n".join(pg.extract_text() or "" for pg in paginas)
    plano = " ".join(texto.split())
    if AUTOR not in plano:
        mal(f"{carpeta}: el texto no dice quién es el autor")
    for t in range(1, TESTS + 1):
        if f"Test {t} " not in plano:
            mal(f"{carpeta}: no está el test {t}")
        if f"Soluciones del test {t}" not in plano:
            mal(f"{carpeta}: no están las soluciones del test {t}")
    if "Cuadro de puntuación" not in plano:
        mal(f"{carpeta}: falta el cuadro de puntuación")
    # La tapa lleva el volumen en versalitas espaciadas: el texto sale letra
    # por letra («V O L U M E N  1»), así que se compara sin espacios.
    tapa = "".join((paginas[0].extract_text() or "").split()).lower()
    if f"volumen{volumen}" not in tapa:
        mal(f"{carpeta}: la tapa no dice «Volumen {volumen}»")

    print(f"  {len(paginas)} páginas · {TESTS} tests · {round(os.path.getsize(PDF) / 1024)} KB")

VOLS = volumenes()
if not VOLS:
    mal("no hay ningún banco de «Mide tu fuerza»")
for volumen, carpeta in VOLS:
    revisar(volumen, carpeta)

print()
if fallos:
    for f in fallos:
        print("  ✗ " + f)
    print(f"\n{len(fallos)} fallo(s)")
    sys.exit(1)
print("Todo bien.")
