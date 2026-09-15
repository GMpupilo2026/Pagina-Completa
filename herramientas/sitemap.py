#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arma sitemap.xml con las páginas que SÍ se indexan.

No se escribe a mano: lee los .html del sitio y deja fuera todo lo que lleva
<meta name="robots" content="noindex"> y todo lo de cursos/protegido/. Así, si
mañana una página se cierra o se abre, basta con volver a correrlo:

    python3 herramientas/sitemap.py
"""
import glob, os, re, subprocess, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITIO = "https://ajedrez-integral.com"
os.chdir(RAIZ)

# Cuánto pesa cada rincón del sitio, para que el rastreo empiece por lo que importa.
def prioridad(ruta):
    if ruta == "index.html": return "1.0"
    if ruta in ("cursos.html", "articulos.html", "sobre-oscar.html"): return "0.9"
    if ruta.startswith("cursos/"): return "0.8"
    if ruta.startswith("articulos/"): return "0.7"
    return "0.6"

def fecha(ruta):
    """La fecha del último commit que la tocó; si no hay git, la del archivo."""
    try:
        salida = subprocess.run(["git", "log", "-1", "--format=%cs", "--", ruta],
                                capture_output=True, text=True, timeout=20)
        if salida.returncode == 0 and salida.stdout.strip():
            return salida.stdout.strip()
    except Exception:
        pass
    return datetime.date.fromtimestamp(os.path.getmtime(ruta)).isoformat()

paginas = []
for ruta in sorted(glob.glob("**/*.html", recursive=True)):
    if ruta.startswith("cursos/protegido/"):
        continue
    texto = open(ruta, encoding="utf-8").read()
    if re.search(r'<meta name="robots"[^>]*noindex', texto):
        continue
    paginas.append(ruta)

lineas = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for ruta in paginas:
    url = SITIO + "/" if ruta == "index.html" else SITIO + "/" + ruta
    lineas += ["  <url>",
               f"    <loc>{url}</loc>",
               f"    <lastmod>{fecha(ruta)}</lastmod>",
               f"    <priority>{prioridad(ruta)}</priority>",
               "  </url>"]
lineas.append("</urlset>")
open("sitemap.xml", "w", encoding="utf-8").write("\n".join(lineas) + "\n")
print(f"sitemap.xml: {len(paginas)} páginas")
