#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprueba de una corrida los metadatos de todo el sitio.

Que cada página pública se pueda compartir (Open Graph con imagen) y encontrar
(descripción y canonical), que las que piden sesión lleven noindex, que el
JSON-LD sea válido y diga la verdad, y que el sitemap y robots.txt coincidan
con lo anterior. No necesita nada instalado:

    python3 herramientas/verificar-metadatos.py
"""
import glob, json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
SITIO = "https://ajedrez-integral.com"
IMAGEN = SITIO + "/img/og-ajedrez-integral.jpg"

fallos = []
def check(ok, mensaje):
    print(("ok    " if ok else "FALLA ") + mensaje)
    if not ok: fallos.append(mensaje)

def leer(ruta): return open(ruta, encoding="utf-8").read()
def meta(texto, nombre, attr="name"):
    m = re.search(r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(nombre)), texto)
    return m.group(1) if m else None
def canonical(texto):
    m = re.search(r'<link rel="canonical" href="([^"]*)"', texto)
    return m.group(1) if m else None

# node_modules son las librerías que se instalan para compilar el CSS o correr
# las comprobaciones (está en .gitignore): no son páginas del sitio, y marcarlas
# como mal escritas es ruido que tapa una falla de verdad.
FUERA = ("cursos/protegido/", "node_modules/")
TODAS = [f for f in sorted(glob.glob("**/*.html", recursive=True))
         if not f.replace(os.sep, "/").startswith(FUERA)]
publicas = [f for f in TODAS if not re.search(r'<meta name="robots"[^>]*noindex', leer(f))]
privadas = [f for f in TODAS if f not in publicas]

print(f"— {len(publicas)} páginas públicas, {len(privadas)} con noindex —\n")

# ---- 1. Toda página pública se comparte bien y se puede indexar ----
for ruta in publicas:
    t = leer(ruta)
    esperada = SITIO + "/" if ruta == "index.html" else SITIO + "/" + ruta
    d = meta(t, "description")
    check(bool(d) and 70 <= len(d) <= 300, f"{ruta}: descripción presente y de largo razonable ({len(d) if d else 0})")
    check(bool(meta(t, "og:title", "property")) and bool(meta(t, "og:description", "property")),
          f"{ruta}: el enlace compartido lleva título y texto")
    check(meta(t, "og:image", "property") == IMAGEN, f"{ruta}: lleva la imagen para compartir")
    check(meta(t, "twitter:card") == "summary_large_image", f"{ruta}: la tarjeta sale grande, no en miniatura")
    check(canonical(t) == esperada, f"{ruta}: canonical = {canonical(t)}")
    check(meta(t, "og:url", "property") == esperada, f"{ruta}: og:url igual al canonical")
    check(meta(t, "og:description", "property") == d, f"{ruta}: og:description y description dicen lo mismo")

# ---- 2. Lo que pide sesión no se indexa ----
for ruta in privadas:
    t = leer(ruta)
    check(canonical(t) is None, f"{ruta}: no lleva canonical (no se indexa)")

# ---- 3. Datos estructurados ----
ESPERADO = {"index.html": ["Organization", "WebSite"], "cursos.html": ["ItemList"]}
for ruta in sorted(glob.glob("cursos/*.html")): ESPERADO[ruta] = ["Course"]
for ruta in sorted(glob.glob("articulos/*.html")): ESPERADO[ruta] = ["BlogPosting"]

for ruta, tipos in ESPERADO.items():
    t = leer(ruta)
    bloques = re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S)
    check(len(bloques) == 1, f"{ruta}: un solo bloque de datos estructurados ({len(bloques)})")
    if len(bloques) != 1: continue
    try:
        datos = json.loads(bloques[0])
    except Exception as e:
        check(False, f"{ruta}: el JSON-LD no es JSON válido ({e})"); continue
    crudo = json.dumps(datos, ensure_ascii=False)
    for tipo in tipos:
        check(f'"{tipo}"' in crudo, f"{ruta}: declara {tipo}")
    # Lo que dice el marcado tiene que ser lo que dice la página.
    if "BlogPosting" in tipos or "Course" in tipos:
        check(datos.get("description") == meta(t, "description"),
              f"{ruta}: el marcado repite la descripción real de la página")
        check(datos.get("url") == SITIO + "/" + ruta, f"{ruta}: el marcado apunta a su propia dirección")

# El catálogo tiene que listar los cursos que de verdad están en la página.
catalogo = leer("cursos.html")
lista = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', catalogo, re.S).group(1))
enlaces = []
for m in re.finditer(r'href="(cursos/[a-z0-9-]+\.html)"', catalogo):
    if m.group(1) not in enlaces: enlaces.append(m.group(1))
en_lista = [x["item"]["url"].replace(SITIO + "/", "") for x in lista["itemListElement"]]
check(en_lista == enlaces, f"cursos.html: la lista marcada son los mismos cursos y en el mismo orden que las tarjetas")
check(lista["numberOfItems"] == len(en_lista), "cursos.html: numberOfItems coincide con la lista")
check(all(x["item"].get("name") and x["item"].get("description") for x in lista["itemListElement"]),
      "cursos.html: cada curso de la lista lleva nombre y descripción")

# La fecha del artículo tiene que ser la que se lee en la página.
MESES = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,"julio":7,
         "agosto":8,"setiembre":9,"septiembre":9,"octubre":10,"noviembre":11,"diciembre":12}
for ruta in sorted(glob.glob("articulos/*.html")):
    t = leer(ruta)
    m = re.search(r"(\d{1,2}) (" + "|".join(MESES) + r") (20\d\d)", t)
    datos = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', t, re.S).group(1))
    esperada = f"{m.group(3)}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}"
    check(datos.get("datePublished") == esperada,
          f"{ruta}: la fecha marcada es la que se ve impresa ({datos.get('datePublished')} vs {esperada})")

# ---- 4. Fuentes ----
for ruta in TODAS:
    t = leer(ruta)
    if "fonts.googleapis.com" not in t: continue
    check('rel="preconnect" href="https://fonts.gstatic.com" crossorigin' in t,
          f"{ruta}: preconnect a gstatic con crossorigin (de ahí bajan las fuentes)")
    enlace = re.search(r'fonts\.googleapis\.com/css2\?([^"]*)"', t).group(1)
    check("wght@400;500;600;700&" in enlace and "Merriweather:wght@700" in enlace,
          f"{ruta}: solo los pesos que el sitio usa")
    break   # el enlace es idéntico en todas; se revisa el resto aparte
distintos = set()
for ruta in TODAS:
    t = leer(ruta)
    m = re.search(r'<link href="(https://fonts\.googleapis\.com[^"]*)"', t)
    if m: distintos.add(m.group(1))
check(len(distintos) <= 2, f"el enlace de fuentes es el mismo en todo el sitio ({len(distintos)} variantes)")
sin_preconnect = [f for f in TODAS if "fonts.googleapis.com" in leer(f)
                  and "fonts.gstatic.com" not in leer(f)]
check(not sin_preconnect, f"ninguna página pide fuentes sin preconectar a gstatic ({sin_preconnect[:3]})")

# ---- 5. robots.txt y sitemap.xml ----
check(os.path.exists("robots.txt"), "robots.txt existe")
robots = leer("robots.txt")
check(f"Sitemap: {SITIO}/sitemap.xml" in robots, "robots.txt apunta al sitemap")
check("Disallow: /cursos/protegido/" in robots, "robots.txt deja fuera los fragmentos protegidos")

check(os.path.exists("sitemap.xml"), "sitemap.xml existe")
mapa = leer("sitemap.xml")
locs = re.findall(r"<loc>([^<]+)</loc>", mapa)
esperadas = sorted((SITIO + "/") if f == "index.html" else (SITIO + "/" + f) for f in publicas)
check(sorted(locs) == esperadas,
      f"el sitemap lista exactamente las páginas públicas ({len(locs)} contra {len(esperadas)})")
# El diagnóstico de nivel es la excepción de /entreno/: se hace sin cuenta y es
# la puerta de entrada al sitio, así que sí va en el sitemap.
DIAGNOSTICO = SITIO + "/entreno/diagnostico.html"
check(not [u for u in locs
           if ("/cursos/protegido/" in u or "/cursos/academia/" in u
               or ("/entreno/" in u and u != DIAGNOSTICO))],
      "el sitemap no incluye contenido protegido ni el espejo de Academia")

# Las dos mitades del filtro tienen que decir lo mismo: si robots.txt lo sigue
# tapando, quitarle el noindex a la página no sirve de nada y nadie se entera —
# la página se indexa igual de poco, sin ningún error a la vista.
check(DIAGNOSTICO in locs, "el diagnóstico de nivel está en el sitemap")
check("Allow: /entreno/diagnostico.html" in robots,
      "robots.txt deja pasar el diagnóstico de nivel")
check(robots.index("Allow: /entreno/diagnostico.html") < robots.index("Disallow: /entreno/"),
      "ese Allow va antes del Disallow de /entreno/")
check('name="robots"' not in leer("entreno/diagnostico.html"),
      "el diagnóstico de nivel ya no lleva noindex")
check(all(re.match(r"20\d\d-\d\d-\d\d$", d) for d in re.findall(r"<lastmod>([^<]+)</lastmod>", mapa)),
      "todas las fechas del sitemap tienen forma válida")

print("\n" + (f"{len(fallos)} fallas" if fallos else "Todo bien"))
sys.exit(1 if fallos else 0)
