"""Comprueba los Programas de Estudio de Ajedrez (1.° a 11.°) y su planeamiento.

Lo que se rompe callado acá:
  - un año con 199 lecciones, una unidad que no cierra en el día 100, voseo o
    una raya larga en el texto: lo revisa datos/validar.py, año por año;
  - un .docx que no está en la lista que pinta admin.html#materiales (o una
    entrada de la lista sin su archivo): el enlace da 404 y nadie se entera;
  - un .docx sin la marca de agua, sin el autor en los datos del archivo o con
    rastros de la herramienta que lo armó;
  - la carpeta fuera de material/: el worker no le pone candado y los
    programas quedan publicados para cualquiera;
  - la carpeta vendida en la tienda: se vendería algo que nadie decidió vender.

Uso: python3 herramientas/verificar-programas-estudio.py   (necesita python-docx)
"""
import json, os, re, subprocess, sys, zipfile

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
GEN = os.path.join(RAIZ, "herramientas", "programas-estudio")
CARPETA = os.path.join(RAIZ, "material", "programas-de-estudio")
AUTOR = "Oscar Angulo Cubero"

fallos = 0


def cierto(nombre, ok, detalle=""):
    global fallos
    print(("  ✓ " if ok else "  ✗ ") + nombre + ("" if ok else "  → " + str(detalle)[:400]))
    if not ok:
        fallos += 1


print("\n=== El contenido de cada año ===")
for g in range(1, 12):
    r = subprocess.run([sys.executable, os.path.join(GEN, "datos", "validar.py"), os.path.join(GEN, "datos", f"grado-{g}.json")],
                       capture_output=True, text=True)
    salida = r.stdout.strip().splitlines()
    cierto(f"{g}.° año: 200 lecciones, 6 unidades y sin voseo ni rayas", r.returncode == 0 and salida[-1:] == ["OK"], " | ".join(salida[-5:]) + r.stderr[-300:])

print("\n=== La lista del panel y los archivos ===")
texto = open(os.path.join(RAIZ, "js", "programas-estudio-lista.js"), encoding="utf-8").read()
P = json.loads(texto[texto.index("{"): texto.rindex("}") + 1])
cierto("la carpeta de la lista es material/programas-de-estudio/", P["carpeta"] == "material/programas-de-estudio/", P["carpeta"])
en_lista = [f["archivo"] for a in P["años"] for f in a["archivos"]]
cierto("once años, ocho documentos cada uno", len(P["años"]) == 11 and all(len(a["archivos"]) == 8 for a in P["años"]))
en_disco = sorted(f for f in os.listdir(CARPETA) if f.endswith(".docx"))
esperados = sorted(en_lista + [P["serie"]])
cierto("cada documento de la lista está en la carpeta, y no sobra ninguno", en_disco == esperados,
       {"faltan": sorted(set(esperados) - set(en_disco)), "sobran": sorted(set(en_disco) - set(esperados))})
zp = os.path.join(CARPETA, P["zip"])
cierto("el .zip con todos existe y trae los 89", os.path.exists(zp) and
       sorted(os.path.basename(n) for n in zipfile.ZipFile(zp).namelist()) == esperados)
admin = open(os.path.join(RAIZ, "js", "admin-materiales.js"), encoding="utf-8").read()
cierto("admin-materiales.js ofrece el .zip y la serie por su nombre", P["zip"] in admin and P["serie"] in admin)
html = open(os.path.join(RAIZ, "admin.html"), encoding="utf-8").read()
cierto("admin.html carga la lista ANTES que admin-materiales.js",
       0 <= html.find('<script src="js/programas-estudio-lista.js">') < html.find('<script src="js/admin-materiales.js">'))

print("\n=== Cada .docx: marca de agua, autor y nada más ===")
sin_marca, sin_autor, rastros, rotos = [], [], [], []
for f in en_disco:
    try:
        z = zipfile.ZipFile(os.path.join(CARPETA, f))
        nombres = z.namelist()
        core = z.read("docProps/core.xml").decode("utf-8")
        encabezados = [n for n in nombres if re.match(r"word/header\d*\.xml$", n)]
        if not any(b'behindDoc="1"' in z.read(n) for n in encabezados) or not any(n.startswith("word/media/") for n in nombres):
            sin_marca.append(f)
        if f"<dc:creator>{AUTOR}</dc:creator>" not in core or f"<cp:lastModifiedBy>{AUTOR}</cp:lastModifiedBy>" not in core:
            sin_autor.append(f)
        if any(b"python-docx" in z.read(n) for n in nombres if n.endswith(".xml") or n.endswith(".rels")):
            rastros.append(f)
        if z.testzip() is not None:
            rotos.append(f)
    except Exception as e:
        rotos.append(f"{f}: {e}")
cierto("todos abren (zip sano)", not rotos, rotos)
cierto("todos llevan la marca de agua detrás del texto, en el encabezado", not sin_marca, sin_marca)
cierto(f"todos dicen {AUTOR} como autor y como último en modificarlos", not sin_autor, sin_autor)
cierto("ninguno trae rastros de la herramienta que lo armó", not rastros, rastros)

print("\n=== El candado ===")
worker = open(os.path.join(RAIZ, "worker.js"), encoding="utf-8").read()
wr = open(os.path.join(RAIZ, "wrangler.jsonc"), encoding="utf-8").read()
cierto("material/ pasa por el worker (run_worker_first)", '"/material/*"' in wr)
cierto("y el worker la trata como protegida", "material)\\/" in worker or "|material)" in worker)
tienda = open(os.path.join(RAIZ, "js", "tienda-catalogo.js"), encoding="utf-8").read()
cierto("los programas no se venden en la tienda", "programas-de-estudio" not in tienda)
ignorar = open(os.path.join(RAIZ, ".assetsignore"), encoding="utf-8").read()
cierto("el generador y sus datos no se publican (en .assetsignore)",
       re.search(r"^herramientas/programas-estudio/?\s*$", ignorar, re.M) is not None)

print("\n" + ("Todo bien." if not fallos else f"{fallos} comprobaciones fallaron."))
sys.exit(1 if fallos else 0)
