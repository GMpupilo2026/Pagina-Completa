#!/usr/bin/env python3
"""Comprueba el libro del diagnóstico: libro-de-diagnostico.pdf y su accesible.

Lo que se rompe acá no da error en pantalla. Un PDF sin proteger se baja igual;
una marca de agua que solo se estampa en la tapa se ve perfecta hasta que
alguien pasa a la página 2; una pregunta que se quedó fuera del libro no la
echa de menos nadie hasta que un alumno la contesta en pantalla y el papel no
la trae. Por eso se comprueba pieza por pieza contra el propio banco.

De una corrida:
  - que el PDF esté cifrado, se abra sin contraseña y NO deje imprimir, copiar
    ni modificar — pero sí extraer texto, que es lo que necesita un lector de
    pantalla;
  - que lleve a Oscar Angulo Cubero en los datos del archivo y en el texto;
  - que tenga marca de agua en TODAS las páginas del cuerpo (el error clásico
    es estamparla solo en la primera) y NO en la tapa, que ya lleva el logo;
  - que estén las 118 preguntas del banco, cada una con su respuesta marcada;
  - que la versión accesible no dependa de NINGUNA imagen, declare el idioma,
    tenga los encabezados en orden y cuente en palabras cada una de las
    posiciones que el PDF dibuja.

    pip install pypdf && python3 herramientas/verificar-libro-diagnostico.py
"""
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOR = "Oscar Angulo Cubero"
PDF = os.path.join(RAIZ, "libro-de-diagnostico.pdf")
ACC = os.path.join(RAIZ, "libro-de-diagnostico-accesible.html")

try:
    from pypdf import PdfReader
    from pypdf.constants import UserAccessPermissions as Permisos
except ImportError:
    sys.exit("Falta pypdf: pip install pypdf")

fallos = []
def mal(donde, que):
    fallos.append(f"{donde}: {que}")

# El banco se lee del mismo archivo que usa el sitio, con Node: comprobar el
# libro contra una copia de la lista de ítems no comprobaría nada.
BANCO = json.loads(subprocess.check_output(["node", "-e", """
global.window = {};
eval(require("fs").readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(global.window.DIAGNOSTICO_ITEMS.map(function (i) {
  return { id: i.id, area: i.area, peso: i.peso, tipo: i.tipo, fen: i.fen || null };
})));
""", os.path.join(RAIZ, "js/diagnostico-items.js")], text=True))

def imagenes(pagina, visto=None):
    """pypdf mete lo mezclado dentro de un Form XObject: hay que bajar a buscarlo."""
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

# ------------------------------------------------------------------ el PDF
print("=== libro-de-diagnostico.pdf ===")
if not os.path.exists(PDF):
    sys.exit("No existe el PDF. Generalo con: node herramientas/diagnostico-libro.js")

lector = PdfReader(PDF)
protegido = True
if not lector.is_encrypted:
    mal("pdf", "no está protegido")
    protegido = False
elif lector.decrypt("") == 0:
    mal("pdf", "pide contraseña para abrirse, y no debería")

# Sin cifrado no hay permisos que mirar (pypdf devuelve None): se dice y se
# sigue, en vez de reventar y dejar sin comprobar todo lo demás.
p = lector.user_access_permissions if protegido else None
if p is not None:
    if p & Permisos.PRINT:
        mal("pdf", "deja imprimir")
    if p & Permisos.MODIFY:
        mal("pdf", "deja modificar")
    if p & Permisos.EXTRACT:
        mal("pdf", "deja copiar el contenido")
    if not p & Permisos.EXTRACT_TEXT_AND_GRAPHICS:
        mal("pdf", "NO deja extraer texto: queda fuera del alcance de un lector de pantalla")
if (lector.metadata or {}).get("/Author") != f"IA {AUTOR}":
    mal("pdf", f"el autor del archivo no es IA {AUTOR}")

paginas = len(lector.pages)
if paginas < 10:
    mal("pdf", f"solo tiene {paginas} páginas: no puede traer el banco entero")

# La tapa (página 1) no lleva marca de agua porque ya tiene el logo en grande;
# todas las demás sí. Estamparla solo en la primera es el error clásico.
if imagenes(lector.pages[0]) < 1:
    mal("pdf", "la tapa no lleva el logo")
sin_marca = [n for n, pg in enumerate(lector.pages[1:], 2) if imagenes(pg) < 1]
if sin_marca:
    mal("pdf", f"{len(sin_marca)} página(s) del cuerpo sin marca de agua: {sin_marca[:6]}")

texto = "\n".join(pg.extract_text() or "" for pg in lector.pages)
if AUTOR not in texto:
    mal("pdf", "el autor no aparece en el texto")
if "uso docente" not in texto.lower():
    mal("pdf", "no lleva el aviso de uso docente")
if "Trae las respuestas" not in texto:
    mal("pdf", "no avisa que trae las respuestas")
if "Hoja de respuestas" not in texto:
    mal("pdf", "no tiene hoja de respuestas")

# El texto extraído parte los identificadores donde cae el salto de línea, así
# que se compara sin espacios.
plano = re.sub(r"\s+", "", texto)
faltan = [i["id"] for i in BANCO if i["id"].replace("_", "_") not in plano]
if faltan:
    mal("pdf", f"faltan {len(faltan)} preguntas del banco: {faltan[:5]}")
# Una respuesta marcada por pregunta: el tic verde del PDF.
tics = texto.count("✔")
if tics < len(BANCO):
    mal("pdf", f"hay {tics} respuestas marcadas y {len(BANCO)} preguntas")

print(f"  {paginas} páginas · {len(BANCO)} preguntas · {tics} respuestas marcadas · "
      f"{round(os.path.getsize(PDF)/1024)} KB")

# --------------------------------------------------------- la accesible
print("=== libro-de-diagnostico-accesible.html ===")
if not os.path.exists(ACC):
    sys.exit("No existe la versión accesible.")
acc = open(ACC, encoding="utf-8").read()

if "<img" in acc or "background-image" in acc:
    mal("accesible", "depende de una imagen: es justo lo que no puede pasar acá")
if not re.search(r'<html[^>]+lang="es"', acc):
    mal("accesible", "no declara el idioma")
if AUTOR not in acc:
    mal("accesible", "no lleva al autor")
if "uso docente" not in acc.lower():
    mal("accesible", "no lleva el aviso de uso docente")

niveles = [int(h) for h in re.findall(r"<h([1-6])\b", acc)]
if not niveles or niveles[0] != 1 or niveles.count(1) != 1:
    mal("accesible", "no tiene exactamente un <h1> al principio")
for antes, despues in zip(niveles, niveles[1:]):
    if despues > antes + 1:
        mal("accesible", f"los encabezados saltan de h{antes} a h{despues}")
        break

faltan = [i["id"] for i in BANCO if i["id"] not in acc]
if faltan:
    mal("accesible", f"faltan {len(faltan)} preguntas: {faltan[:5]}")

# Lo que de verdad importa: cada posición que el PDF DIBUJA, acá está CONTADA.
con_fen = [i for i in BANCO if i["fen"]]
sin_describir = [i["id"] for i in con_fen if i["fen"] not in acc]
if sin_describir:
    mal("accesible", f"{len(sin_describir)} posiciones sin su FEN: {sin_describir[:5]}")
descritas = acc.count("Piezas blancas:")
if descritas != len(con_fen):
    mal("accesible", f"hay {descritas} posiciones contadas en palabras y {len(con_fen)} dibujadas en el PDF")

print(f"  {len(BANCO)} preguntas · {len(con_fen)} posiciones descritas pieza por pieza · "
      f"{round(os.path.getsize(ACC)/1024)} KB")

print()
if fallos:
    for f in fallos:
        print("  ✗ " + f)
    print(f"\n{len(fallos)} fallo(s)")
    sys.exit(1)
print("Todo bien.")
