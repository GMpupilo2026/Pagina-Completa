#!/usr/bin/env python3
"""Comprueba los dos PDF de las fichas de Estudio (material/fichas-de-estudio/)
y su versión accesible.

Los arma herramientas/fichas-estudio-pdf.js a partir del banco de fichas
(js/fichas-estudio.js) y de la ficha impresa de entreno/estudio.html. Un PDF
viejo no da ningún error: se descarga igual, y el día que se agrega o se
renombra una ficha el libro sigue diciendo lo de antes y el índice manda a la
página equivocada. Lo que se comprueba:

  - que los dos abran sin contraseña y lleven al autor en sus datos;
  - el libro: tapa, presentación, índice (en las páginas que ocupe), una
    portadilla por categoría y UNA
    página por ficha, en el orden de la página; que cada ficha esté en la
    página que dice el índice, con su título y su número al pie;
  - las cartas: dos páginas (frente y reverso) por cada nueve fichas, y que
    cada ficha aparezca en las dos caras con su título;
  - que las tildes y las eñes hayan llegado;
  - que la ficha de la tienda prometa las fichas, páginas y cartas que hay;
  - la versión accesible: al día con el banco, sin imágenes, con los
    encabezados en orden, las 198 fichas en los dos índices y cada enlace
    llevando a algo que existe.

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
    textos = [plano(p.extract_text()) for p in r.pages]
    # El índice ocupa las páginas que hagan falta, justo después de la
    # presentación; cada una empieza con «Índice».
    hojas_indice = 0
    while 2 + hojas_indice < len(textos) and textos[2 + hojas_indice].startswith("Índice"):
        hojas_indice += 1
    ok("trae índice", hojas_indice >= 1)
    esperadas = 2 + hojas_indice + len(banco["c"]) + n
    ok(f"{esperadas} páginas: tapa, presentación, {hojas_indice} de índice, {len(banco['c'])} portadillas y {n} fichas",
       len(r.pages) == esperadas, f"tiene {len(r.pages)}")
    indice = " ".join(textos[2:2 + hojas_indice])
    pagina, mal, sin_numero = 2 + hojas_indice, [], []
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
    ok("promete la versión accesible", pz.get("accesibles") == 1, f"dice {pz.get('accesibles')}")
    ok("vende los tres archivos", sorted(tienda.get("archivos", [])) == sorted(
        ["material/fichas-de-estudio/fichas-de-estudio-libro.pdf", "material/fichas-de-estudio/fichas-de-estudio-cartas.pdf",
         "material/fichas-de-estudio/fichas-de-estudio-accesible.html"]))

print("\n=== La versión accesible ===")
# Es lo único que puede leer quien no ve: si se rompe, la página se ve bien
# (no tiene nada que ver) y para esa persona el documento deja de servir.
ACCESIBLE = os.path.join(CARPETA, "fichas-de-estudio-accesible.html")
existe = os.path.exists(ACCESIBLE)
ok("existe fichas-de-estudio-accesible.html", existe)
if existe:
    html = open(ACCESIBLE, encoding="utf-8").read()
    al_dia = subprocess.check_output(
        ["node", "-e", "process.stdout.write(require('./herramientas/fichas-estudio-pdf.js').htmlAccesible())"],
        cwd=RAIZ, text=True)
    ok("está al día con el banco (si no: node herramientas/fichas-estudio-pdf.js --solo-accesible)", html == al_dia)
    ok("en español (lang=\"es\") y con su título", 'lang="es"' in html and "<title>" in html)
    # Sin imágenes ni código: no hace falta ver nada, y se abre suelto, sin red.
    ok("sin una sola imagen ni script", not re.search(r"<(img|svg|canvas|script|picture|video)\b", html, re.I),
       ", ".join(sorted(set(re.findall(r"<(img|svg|canvas|script|picture|video)\b", html, re.I)))))
    # Los encabezados son el mapa del lector de pantalla: uno solo de nivel 1
    # y ninguno que salte un nivel (de un h2 a un h4 se pierde el hilo).
    niveles = [int(x) for x in re.findall(r"<h([1-6])\b", html)]
    saltos = [f"h{a}→h{b}" for a, b in zip(niveles, niveles[1:]) if b > a + 1]
    ok("un solo encabezado de nivel 1, y es el primero", niveles[:1] == [1] and niveles.count(1) == 1)
    ok("los encabezados no saltan niveles", not saltos, ", ".join(saltos[:5]))
    # Cada enlace del índice lleva a algo que existe: un enlace roto es un
    # callejón sin salida para quien navega con el teclado.
    ids = set(re.findall(r'\bid="([^"]+)"', html))
    rotos = sorted({h for h in re.findall(r'href="#([^"]+)"', html) if h not in ids})
    ok("todos los enlaces internos llevan a algo que existe", not rotos, ", ".join(rotos[:5]))
    # Las 198 fichas, en el orden del libro, cada una con su número, en los dos
    # índices, con la posición contada y su «Volver al índice».
    orden = [F["id"] for c in banco["c"] for F in banco["f"] if F["c"] == c]
    en_doc = re.findall(r'<section class="ficha" id="ficha-([^"]+)"', html)
    ok(f"trae las {n} fichas, en el orden del libro", en_doc == orden, f"trae {len(en_doc)}")
    enlazadas = {i: html.count(f'href="#ficha-{i}"') for i in orden}
    pocas = [i for i, k in enlazadas.items() if k < 2]
    ok("cada ficha está en los dos índices (por categoría y alfabético)", not pocas, ", ".join(pocas[:5]))
    trozos = re.split(r'<section class="ficha"', html)[1:]
    sin_pos = [orden[k] for k, t in enumerate(trozos) if "Piezas blancas:" not in t or "Piezas negras:" not in t]
    ok("cada ficha cuenta su posición pieza por pieza", not sin_pos, ", ".join(sin_pos[:5]))
    sin_volver = [orden[k] for k, t in enumerate(trozos) if 'href="#indice"' not in t]
    ok("cada ficha termina con «Volver al índice»", not sin_volver, ", ".join(sin_volver[:5]))
    numeros = [int(x) for x in re.findall(r'<h3 id="titulo-[^"]+">Ficha (\d+)\.', html)]
    ok("las fichas van numeradas del 1 al final, sin huecos", numeros == list(range(1, n + 1)))

print(f"\n✗ {fallos} problema(s)." if fallos else "\n✓ Todo bien.")
sys.exit(1 if fallos else 0)
