#!/usr/bin/env python3
"""Comprueba los dos PDF de las fichas de Estudio (material/fichas-de-estudio/).

Los arma herramientas/fichas-estudio-pdf.js a partir del banco de fichas
(js/fichas-estudio.js) y de la ficha impresa de entreno/estudio.html. Un PDF
viejo no da ningún error: se descarga igual, y el día que se agrega o se
renombra una ficha el libro sigue diciendo lo de antes y el índice manda a la
página equivocada. Lo que se comprueba:

  - que los dos abran sin contraseña y lleven al autor en sus datos;
  - el libro: tapa, presentación, índice, una portadilla por categoría y UNA
    página por ficha, en el orden de la página; que cada ficha esté en la
    página que dice el índice, con su título y su número al pie;
  - las cartas: dos páginas (frente y reverso) por cada nueve fichas, y que
    cada ficha aparezca en las dos caras con su título;
  - que las tildes y las eñes hayan llegado;
  - que la ficha de la tienda prometa las fichas, páginas y cartas que hay.

Si falla, casi siempre basta con volver a generar:
    python3 -m http.server 8777 & node herramientas/fichas-estudio-pdf.js

Se corre:  python3 herramientas/verificar-fichas-pdf.py
Necesita pypdf y node (para leer el banco).  No necesita navegador.
"""
import json
import math
import os
import re
import subprocess
import sys

from pypdf import PdfReader

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CARPETA = os.path.join(RAIZ, "material", "fichas-de-estudio")
LIBRO = os.path.join(CARPETA, "fichas-de-estudio-libro.pdf")
CARTAS = os.path.join(CARPETA, "fichas-de-estudio-cartas.pdf")

fallos = 0


def ok(nombre, cond, detalle=""):
    global fallos
    if cond:
        print("  ✓ " + nombre)
    else:
        fallos += 1
        print("  ✗ " + nombre + ("\n      " + detalle if detalle else ""))


def plano(t):
    """El texto de una página, sin saltos ni espacios dobles: un título largo
    puede salir partido en dos renglones."""
    return re.sub(r"\s+", " ", t or "").strip()


banco = json.loads(subprocess.check_output(
    ["node", "-e", "const E=require('./js/fichas-estudio.js');"
     "console.log(JSON.stringify({c:E.CATEGORIAS.map(c=>c.id),f:E.FICHAS.map(F=>({id:F.id,t:F.titulo,c:F.categoria}))}))"],
    cwd=RAIZ, text=True))
orden = [F for c in banco["c"] for F in banco["f"] if F["c"] == c]
n = len(orden)

print("=== El libro ===")
ok("existe", os.path.exists(LIBRO), LIBRO)
if os.path.exists(LIBRO):
    r = PdfReader(LIBRO)
    ok("abre sin contraseña", not r.is_encrypted)
    ok("lleva al autor", "Oscar Angulo" in str((r.metadata or {}).get("/Author", "")))
    esperadas = 3 + len(banco["c"]) + n
    ok(f"{esperadas} páginas: tapa, presentación, índice, {len(banco['c'])} portadillas y {n} fichas",
       len(r.pages) == esperadas, f"tiene {len(r.pages)}")
    textos = [plano(p.extract_text()) for p in r.pages]
    indice = textos[2] if len(textos) > 2 else ""
    pagina, mal, sin_numero = 3, [], []
    for c in banco["c"]:
        pagina += 1   # la portadilla
        for F in (F for F in orden if F["c"] == c):
            pagina += 1
            t = textos[pagina - 1] if pagina <= len(textos) else ""
            if F["t"] not in t:
                mal.append(f"{F['t']} (pág. {pagina})")
            if ("Ajedrez Integral %d" % pagina) not in t:
                sin_numero.append(str(pagina))
    ok("cada ficha está en su página, en el orden de Estudio", not mal, "; ".join(mal[:8]))
    ok("cada página de ficha lleva su número al pie", not sin_numero, ", ".join(sin_numero[:10]))
    faltan = [F["t"] for F in orden if F["t"] not in indice]
    ok("el índice nombra las " + str(n) + " fichas", not faltan, "; ".join(faltan[:8]))
    ok("con tildes y eñes", "Índice" in indice and any("ñ" in t for t in textos))

print("\n=== Las cartas (63 × 88 mm) ===")
ok("existe", os.path.exists(CARTAS), CARTAS)
if os.path.exists(CARTAS):
    r = PdfReader(CARTAS)
    ok("abre sin contraseña", not r.is_encrypted)
    ok("lleva al autor", "Oscar Angulo" in str((r.metadata or {}).get("/Author", "")))
    hojas = math.ceil(n / 9)
    ok(f"{2 * hojas} páginas: frente y reverso de {hojas} hojas", len(r.pages) == 2 * hojas, f"tiene {len(r.pages)}")
    caja = r.pages[0].mediabox
    ok("en hoja carta", abs(float(caja.width) - 612) < 2 and abs(float(caja.height) - 792) < 2,
       f"{float(caja.width):.0f} × {float(caja.height):.0f} pt")
    textos = [plano(p.extract_text()) for p in r.pages]
    mal = []
    for i, F in enumerate(orden):
        h = i // 9
        frente, reverso = textos[2 * h], textos[2 * h + 1] if 2 * h + 1 < len(textos) else ""
        if F["t"] not in frente or F["t"] not in reverso:
            mal.append(F["t"])
    ok("cada ficha en las dos caras de su hoja", not mal, "; ".join(mal[:8]))

print("\n=== Lo que promete la tienda ===")
# La ficha de la tienda (js/tienda-catalogo.js) dice cuántas fichas, páginas y
# cartas trae: un número que nadie cuenta se cree, y quien compra recibe otra
# cosa. Se compara contra el banco y contra los dos PDF.
tienda = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};require('./js/tienda-catalogo.js');"
     "console.log(JSON.stringify(window.TiendaCatalogo.producto('fichas-de-estudio')||null))"],
    cwd=RAIZ, text=True))
ok("las fichas en papel están en el catálogo de la tienda", tienda is not None)
if tienda:
    pz = tienda.get("piezas", {})
    paginas_libro = len(PdfReader(LIBRO).pages) if os.path.exists(LIBRO) else -1
    ok(f"promete {n} fichas", pz.get("fichas") == n, f"dice {pz.get('fichas')}")
    ok(f"promete {paginas_libro} páginas de libro", pz.get("paginas") == paginas_libro, f"dice {pz.get('paginas')}")
    ok(f"promete {n} cartas", pz.get("cartas") == n, f"dice {pz.get('cartas')}")
    ok("vende los dos archivos", sorted(tienda.get("archivos", [])) == sorted(
        ["material/fichas-de-estudio/fichas-de-estudio-libro.pdf", "material/fichas-de-estudio/fichas-de-estudio-cartas.pdf"]))

print(f"\n✗ {fallos} problema(s)." if fallos else "\n✓ Todo bien.")
sys.exit(1 if fallos else 0)
