"""Comprueba los doce tomos del libro «Una clase al día»:
cursos/recursos/una-clase-al-dia/tomo-NN.pdf.

Lo que se rompe acá no da error en pantalla. Un PDF sin proteger se baja igual;
una marca de agua que solo se estampa en la primera página se ve perfecta hasta
que alguien pasa a la segunda; una lección que se quedó fuera de su tomo no la
echa de menos nadie hasta que alguien la busca. Por eso se comprueba contra los
datos del curso, que son de donde sale el libro.

  - que cada tomo esté cifrado, se abra sin contraseña y deje imprimir pero no
    modificar;
  - que lleve al MI Ángel Martín en los datos del archivo y en el texto, y que
    diga que se publica con permiso;
  - que tenga la marca de agua (el logo) en TODAS las páginas;
  - que estén todas las lecciones de su bloque, y las soluciones si el bloque
    trae ejercicios.

    pip install pypdf && python3 herramientas/verificar-mil-lecciones-pdf.py
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLUG = "una-clase-al-dia"
AUTOR = "Ángel Martín"
INDICE = json.load(open(os.path.join(RAIZ, "cursos", "protegido", "data", SLUG + ".json"), encoding="utf-8"))

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

fallos = []
def mal(que):
    fallos.append(que)

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

def plano(t):
    return " ".join(t.split())

for b in INDICE["curso"]["bloques"]:
    nom = "tomo-%02d.pdf" % b["n"]
    ruta = os.path.join(RAIZ, "cursos", "recursos", SLUG, nom)
    print("=== %s · %s ===" % (nom, b["titulo"]))
    if not os.path.exists(ruta):
        mal("%s: no existe (se genera con node herramientas/mil-lecciones-pdf.js)" % nom)
        continue
    lector = PdfReader(ruta)
    if not lector.is_encrypted:
        mal("%s: no está protegido" % nom)
    elif lector.decrypt("") == 0:
        mal("%s: pide contraseña para abrirse" % nom)
    else:
        p = lector.user_access_permissions
        if not p & Permisos.PRINT:
            mal("%s: no deja imprimir" % nom)
        if p & Permisos.MODIFY:
            mal("%s: deja modificar" % nom)
    meta = lector.metadata or {}
    if AUTOR not in str(meta.get("/Author", "")):
        mal("%s: el autor del archivo dice «%s»" % (nom, meta.get("/Author")))
    paginas = lector.pages
    sin_marca = [n + 1 for n, pg in enumerate(paginas) if imagenes(pg) < 1]
    if sin_marca:
        mal("%s: %d páginas sin marca de agua ni logo: %s" % (nom, len(sin_marca), sin_marca[:8]))
    texto = plano("\n".join(pg.extract_text() or "" for pg in paginas))
    if AUTOR not in texto:
        mal("%s: el texto no dice quién es el autor" % nom)
    if "con permiso" not in texto:
        mal("%s: no dice que se publica con permiso" % nom)
    for l in b["lecciones"]:
        if plano(l["titulo"]) not in texto:
            mal("%s: no está la lección %d, «%s»" % (nom, l["n"], l["titulo"]))
    con_ej = any(json.load(open(os.path.join(RAIZ, "cursos/protegido/data", SLUG, l["archivo"] + ".json"), encoding="utf-8"))["ejercicios"]
                 for l in b["lecciones"])
    if con_ej and "Soluciones" not in texto:
        mal("%s: faltan las soluciones de los ejercicios" % nom)
    print("  %d páginas · %d lecciones · %d KB" % (len(paginas), len(b["lecciones"]), round(os.path.getsize(ruta) / 1024)))

print()
if fallos:
    for f in fallos:
        print("  ✗ " + f)
    print("\n%d fallo(s)" % len(fallos))
    sys.exit(1)
print("Todo bien.")
