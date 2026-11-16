"""Revisa un número terminado: python herramientas/revistas-arbitraje/revisar.py 15 16 ...
- PDF: páginas, marca de agua (imagen) y crédito en cada página, metadatos, nada de IA.
- fichas.json: estructura, ids, «correcta» dentro de rango, fichas referidas existen, tuteo básico.
"""
import sys, os, json, re
from pypdf import PdfReader
AQUI = os.path.dirname(os.path.abspath(__file__))
PROHIBIDO = re.compile(r"claude|anthropic|chatgpt|openai|inteligencia artificial|modelo de lenguaje", re.I)
VOSEO = re.compile(r"\b(podés|tenés|querés|sabés|hacé|mirá|fijate|revisá|tené|vos)\b", re.I)

def imagenes(p):
    xo = p["/Resources"].get("/XObject", {})
    n = 0
    for _, v in xo.items():
        o = v.get_object()
        if o.get("/Subtype") == "/Image": n += 1
        elif o.get("/Subtype") == "/Form":
            n += sum(1 for _, w in o.get("/Resources", {}).get("/XObject", {}).items() if w.get_object().get("/Subtype") == "/Image")
    return n

for n in sys.argv[1:]:
    n = int(n); d = os.path.join(AQUI, f"no{n:02d}")
    pdf = os.path.join(AQUI, "..", "..", "descargas", "aula-arbitraje", f"revista-{n:02d}.pdf")
    malos = []
    r = PdfReader(pdf)
    textos = [(p.extract_text() or "") for p in r.pages]
    sin_marca = [i + 1 for i, p in enumerate(r.pages) if imagenes(p) < 1]
    sin_credito = [i + 1 for i, t in enumerate(textos) if "Oscar Angulo Cubero" not in t]
    if sin_marca: malos.append(f"páginas sin marca: {sin_marca}")
    if sin_credito: malos.append(f"páginas sin crédito: {sin_credito}")
    md = r.metadata or {}
    if md.get("/Author") != "IA Oscar Angulo Cubero": malos.append(f"autor en metadatos: {md.get('/Author')}")
    todo = "\n".join(textos)
    for f in ("meta.json", "cuerpo.html", "fichas.json"):
        todo += open(os.path.join(d, f), encoding="utf-8").read()
    m = PROHIBIDO.search(todo)
    if m: malos.append(f"menciona «{m.group(0)}»")
    v = VOSEO.search(todo)
    if v: malos.append(f"voseo: «{v.group(0)}»")
    fj = json.load(open(os.path.join(d, "fichas.json"), encoding="utf-8"))
    ids = [f["id"] for f in fj.get("fichas", [])]
    if len(ids) != len(set(ids)): malos.append("ids de fichas repetidos")
    for f in fj.get("fichas", []):
        for k in ("id", "coleccion", "titulo", "articulos", "resumen", "claves", "contenido"):
            if k not in f: malos.append(f"ficha {f.get('id')} sin «{k}»")
        if f.get("coleccion") != fj["coleccion"]["id"]: malos.append(f"ficha {f['id']} con colección distinta")
    for q in fj.get("preguntas", []):
        if q.get("ficha") not in ids: malos.append(f"pregunta de ficha inexistente: {q.get('ficha')}")
        if not (0 <= q.get("correcta", -1) < len(q.get("opciones", []))): malos.append(f"«correcta» fuera de rango: {q.get('texto','')[:50]}")
    for c in fj.get("casos", []):
        if c.get("ficha") not in ids: malos.append(f"caso de ficha inexistente: {c.get('id')}")
        dec = c.get("decision")
        if dec and not (0 <= dec.get("correcta", -1) < len(dec.get("opciones", []))): malos.append(f"caso {c.get('id')}: decisión fuera de rango")
    print(f"N.º {n}: {len(r.pages)} págs · {len(ids)} fichas · {len(fj.get('preguntas', []))} preguntas · {len(fj.get('casos', []))} casos · {len(fj.get('repeticiones', []))} repeticiones -> " + ("OK" if not malos else "REVISAR: " + "; ".join(malos)))

# rev bfb5bbb0d2d82f9f
