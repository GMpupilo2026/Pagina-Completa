#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pone (y vuelve a poner) los datos estructurados JSON-LD de las páginas públicas.

Es lo que le dice a Google qué es cada página: quién da los cursos, cuáles son,
y que los artículos son artículos con fecha y autor. Se genera desde el propio
HTML —título, descripción, fecha, lista de cursos— para que no se desincronice:

    python3 herramientas/datos-estructurados.py

Lo que NO lleva todavía: `offers` y `hasCourseInstance` en cada curso (precio,
duración y modalidad). Sin esos datos Google no muestra la ficha enriquecida de
curso; el marcado es válido igual, pero queda a medias a propósito hasta que se
decidan esos números, en vez de inventarlos.
"""
import glob, json, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
SITIO = "https://ajedrez-integral.com"
IMAGEN = SITIO + "/img/og-ajedrez-integral.jpg"

MESES = {"enero":1, "febrero":2, "marzo":3, "abril":4, "mayo":5, "junio":6, "julio":7,
         "agosto":8, "setiembre":9, "septiembre":9, "octubre":10, "noviembre":11, "diciembre":12}

ORG = {
    "@type": "Organization",
    "@id": SITIO + "/#organizacion",
    "name": "Ajedrez Integral",
    "url": SITIO + "/",
    "logo": SITIO + "/img/logo-oscar-angulo.png",
    "image": IMAGEN,
    "description": ("Academia de ajedrez con clases en vivo, entrenamiento interactivo y "
                    "seguimiento del progreso, para escuelas, colegios y familias."),
    "areaServed": "CR",
    "founder": {"@type": "Person", "name": "Oscar Angulo Cubero",
                "jobTitle": "Entrenador FIDE y Árbitro Internacional",
                "url": SITIO + "/sobre-oscar.html"},
    "sameAs": ["https://wa.me/50683092291"],
}

MARCA = "<!-- datos estructurados: los genera herramientas/datos-estructurados.py -->"
RE_BLOQUE = re.compile(re.escape(MARCA) + r'\n\s*<script type="application/ld\+json">.*?</script>\n', re.S)

def leer(ruta):
    return open(ruta, encoding="utf-8").read()

def titulo(texto):
    t = " ".join(re.search(r"<title>(.*?)</title>", texto, re.S).group(1).split())
    return t.split(" — Ajedrez Integral")[0].split(" | Ajedrez Integral")[0].strip()

def descripcion(texto):
    m = re.search(r'<meta name="description" content="([^"]*)"', texto)
    return m.group(1) if m else ""

def poner(ruta, datos):
    texto = leer(ruta)
    texto = RE_BLOQUE.sub("", texto)
    # Compacto: es un bloque generado, y en el <head> lo que importa es que no
    # estorbe para leer el resto. Se revisa con herramientas/verificar-metadatos.py.
    bloque = (MARCA + '\n    <script type="application/ld+json">' +
              json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "</script>\n")
    fin = texto.index("</title>") + len("</title>")
    resto = texto[fin:].lstrip("\n")
    if not resto.startswith("    "):
        resto = "    " + resto.lstrip(" ")
    open(ruta, "w", encoding="utf-8").write(texto[:fin] + "\n    " + bloque + resto)

# ---- Portada: quién es la academia y cuál es su buscador ----
inicio = leer("index.html")
poner("index.html", {"@context": "https://schema.org", "@graph": [ORG, {
    "@type": "WebSite", "@id": SITIO + "/#sitio", "url": SITIO + "/",
    "name": "Ajedrez Integral", "inLanguage": "es-CR",
    "publisher": {"@id": SITIO + "/#organizacion"},
    "description": descripcion(inicio),
}]})

# ---- Catálogo: la lista de cursos, en el orden en que aparece en la página ----
catalogo = leer("cursos.html")
slugs = []
for m in re.finditer(r'href="(cursos/[a-z0-9-]+\.html)"', catalogo):
    if m.group(1) not in slugs: slugs.append(m.group(1))

cursos = []
for i, ruta in enumerate(slugs, 1):
    t = leer(ruta)
    cursos.append({"@type": "ListItem", "position": i, "item": {
        "@type": "Course", "@id": SITIO + "/" + ruta + "#curso",
        "name": titulo(t), "description": descripcion(t), "url": SITIO + "/" + ruta,
        "inLanguage": "es-CR", "provider": {"@id": SITIO + "/#organizacion"}}})

poner("cursos.html", {"@context": "https://schema.org", "@type": "ItemList",
                      "name": "Cursos de Ajedrez Integral",
                      "description": descripcion(catalogo),
                      "numberOfItems": len(cursos), "itemListElement": cursos})

# ---- Cada curso, en su propia página ----
for ruta in slugs:
    t = leer(ruta)
    poner(ruta, {"@context": "https://schema.org", "@type": "Course",
                 "@id": SITIO + "/" + ruta + "#curso",
                 "name": titulo(t), "description": descripcion(t),
                 "url": SITIO + "/" + ruta, "inLanguage": "es-CR",
                 "image": IMAGEN, "provider": ORG})

# ---- Artículos: con su fecha, que la traen impresa en la página ----
articulos = 0
for ruta in sorted(glob.glob("articulos/*.html")):
    t = leer(ruta)
    m = re.search(r"(\d{1,2}) (" + "|".join(MESES) + r") (20\d\d)", t)
    if not m:
        print("  sin fecha, se salta:", ruta); continue
    fecha = f"{m.group(3)}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}"
    poner(ruta, {"@context": "https://schema.org", "@type": "BlogPosting",
                 "headline": titulo(t), "description": descripcion(t),
                 "url": SITIO + "/" + ruta, "inLanguage": "es-CR",
                 "datePublished": fecha, "dateModified": fecha, "image": IMAGEN,
                 "author": {"@type": "Person", "name": "Oscar Angulo Cubero",
                            "url": SITIO + "/sobre-oscar.html"},
                 "publisher": {"@id": SITIO + "/#organizacion"},
                 "mainEntityOfPage": {"@type": "WebPage", "@id": SITIO + "/" + ruta}})
    articulos += 1

print(f"portada + catálogo · {len(cursos)} cursos · {articulos} artículos")
