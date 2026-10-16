#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprueba que el PowerPoint de cada sesión de Formación Ajedrez sea el que
se proyecta en la clase en vivo.

    python3 herramientas/verificar-formacion-pptx.py

Lo arma herramientas/formacion-pptx.py con las láminas de
cursos/recursos/formacion-ajedrez/presentaciones/clase-NN/. Si alguien vuelve
a dibujar las láminas y no el .pptx, el que se baja dice otra cosa que el que
se proyecta, y eso no da ningún error: el lunes 12 de octubre la Clase 1 se dio
con 51 láminas y el .pptx que se bajaba era el del día antes. Acá:

- el .pptx tiene una diapositiva por lámina, cada una con su imagen;
- la huella que dejó en sus propiedades (sha-256 de diapositivas.json y de
  las imágenes) es la de las láminas de hoy;
- las notas del orador son las de diapositivas.json.

Solo usa la biblioteca estándar (un .pptx es un zip), así corre en el CI.
"""
import hashlib
import html
import json
import os
import re
import sys
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECURSOS = os.path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez")
PRESENTACIONES = os.path.join(RECURSOS, "presentaciones")
DATOS = os.path.join(RAIZ, "herramientas", "datos")
CURSO = os.path.join(RAIZ, "herramientas", "cursos", "formacion-ajedrez.json")

fallas = 0


def cierto(nombre, ok, detalle=""):
    global fallas
    print(("  ✓ " if ok else "  ✗ ") + nombre + ("" if ok or not detalle else "  → " + detalle))
    if not ok:
        fallas += 1


def huella(clase):
    carpeta = os.path.join(PRESENTACIONES, clase)
    with open(os.path.join(carpeta, "diapositivas.json"), "rb") as fh:
        crudo = fh.read()
    h = hashlib.sha256(crudo)
    for d in json.loads(crudo)["diapositivas"]:
        with open(os.path.join(carpeta, d["imagen"]), "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()


def texto_de(xml):
    """El texto de los párrafos de un XML de PowerPoint, un renglón por párrafo."""
    parrafos = re.findall(r"<a:p>(.*?)</a:p>", xml, re.S)
    return "\n".join(html.unescape("".join(re.findall(r"<a:t>(.*?)</a:t>", p, re.S))) for p in parrafos).strip()


curso = json.load(open(CURSO, encoding="utf-8"))
lecciones = [l for b in curso["bloques"] for l in b["lecciones"]]
clases = sorted(m.group(1) for m in (re.match(r"^formacion-laminas-(clase-\d+)\.js$", f) for f in os.listdir(DATOS)) if m)
cierto("hay sesiones con láminas", len(clases) > 0)

for clase in clases:
    print(clase)
    n = int(clase.split("-")[1])
    pptx = os.path.join(RECURSOS, lecciones[n - 1]["archivo"] + ".pptx")
    diapos = json.load(open(os.path.join(PRESENTACIONES, clase, "diapositivas.json"), encoding="utf-8"))["diapositivas"]
    if not os.path.exists(pptx):
        cierto("el .pptx existe", False, os.path.relpath(pptx, RAIZ))
        continue
    with zipfile.ZipFile(pptx) as z:
        nombres = set(z.namelist())
        slides = sorted((int(m.group(1)) for m in (re.match(r"^ppt/slides/slide(\d+)\.xml$", x) for x in nombres) if m))
        cierto("una diapositiva por lámina", len(slides) == len(diapos), "%d / %d" % (len(slides), len(diapos)))
        core = z.read("docProps/core.xml").decode("utf-8")
        m = re.search(r"<dc:subject>laminas:([0-9a-f]{64})</dc:subject>", core)
        cierto("está armado con las láminas de hoy (huella)", bool(m) and m.group(1) == huella(clase),
               "volver a correr: python3 herramientas/formacion-pptx.py " + clase)
        sin_imagen, notas_mal = [], []
        for i in slides:
            rels = z.read("ppt/slides/_rels/slide%d.xml.rels" % i).decode("utf-8")
            if "relationships/image" not in rels or "<p:pic>" not in z.read("ppt/slides/slide%d.xml" % i).decode("utf-8"):
                sin_imagen.append(i)
            esperada = (diapos[i - 1].get("notas") or "").strip() if i <= len(diapos) else ""
            nota = re.search(r'Target="\.\./notesSlides/(notesSlide\d+\.xml)"', rels)
            hay = ""
            if nota:
                xml = z.read("ppt/notesSlides/" + nota.group(1)).decode("utf-8")
                # Las notas van en el marcador del cuerpo, no en el de la miniatura.
                cuerpo = re.search(r'<p:sp>(?:(?!</p:sp>).)*?<p:ph type="body".*?</p:sp>', xml, re.S)
                hay = texto_de(cuerpo.group(0)) if cuerpo else ""
            if hay != esperada:
                notas_mal.append(i)
        cierto("cada diapositiva es su lámina en imagen", not sin_imagen, ", ".join(map(str, sin_imagen)))
        cierto("las notas del orador son las de diapositivas.json", not notas_mal, ", ".join(map(str, notas_mal[:10])))

print("\n" + ("Todo bien." if not fallas else "%d fallas." % fallas))
sys.exit(1 if fallas else 0)
