"""Junta los fichas.json de los números 2 en adelante en js/aula-arbitraje/contenido-revistas.js.
Uso: python herramientas/revistas-arbitraje/armar-aula.py  (después: node herramientas/sello-estampar.js)"""
import json, glob, os, re, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "..", "js", "aula-arbitraje", "contenido-revistas.js")
col, fichas, preguntas, casos, reps = [], [], [], [], []
vistos_f, vistos_c = {"relojes", "koya", "repeticion"}, {"irreg-sin-inc", "ilegal-sin-incremento", "ilegal-con-incremento", "antes-del-control", "reloj-sin-incremento", "rapida-reclamo-tarde", "relampago-pulsa-sin-mover", "segunda-ilegal"}
peligro = re.compile(r"<script|\son\w+\s*=|javascript:|<iframe|<img", re.I)
problemas = []
for f in sorted(glob.glob(os.path.join(AQUI, "no*", "fichas.json")), key=lambda x: int(re.search(r"no(\d+)", x).group(1))):
    n = int(re.search(r"no(\d+)", f).group(1))
    if n == 1: continue
    j = json.load(open(f, encoding="utf-8"))
    col.append(j["coleccion"])
    ren = {}
    for x in j["fichas"]:
        nid = x["id"]
        if nid in vistos_f:
            nid = f"{x['id']}-n{n}"; ren[x["id"]] = nid
        vistos_f.add(nid); x["id"] = nid
        if peligro.search(x["contenido"]): problemas.append(f"N.º {n} ficha {nid}: HTML no permitido")
        fichas.append(x)
    for q in j.get("preguntas", []):
        q["ficha"] = ren.get(q["ficha"], q["ficha"]); preguntas.append(q)
    for c in j.get("casos", []):
        c["ficha"] = ren.get(c["ficha"], c["ficha"])
        if c["id"] in vistos_c: c["id"] = f"{c['id']}-n{n}"
        vistos_c.add(c["id"])
        for k in ("titulo", "nivel", "escena", "decision"):
            if k not in c: problemas.append(f"N.º {n} caso {c['id']} sin {k}")
        if c.get("ritmo"): problemas.append(f"N.º {n} caso {c['id']} con reloj (revisar)")
        c.setdefault("ritmo", None)
        casos.append(c)
    for r in j.get("repeticiones", []): reps.append(r)
    if ren: print(f"N.º {n}: ids renombrados {ren}")
if problemas: print("\n".join(problemas)); sys.exit(1)
cuerpo = {"colecciones": col, "fichas": fichas, "preguntas": preguntas, "casos": casos, "repeticiones": reps}
datos = json.dumps(cuerpo, ensure_ascii=False, indent=1)
js = f"""/* Aula de Arbitraje — las fichas de los números 2 al 21 de la revista
   «Arbitraje de Ajedrez», revisados y actualizados a la normativa FIDE vigente
   (noviembre de 2026) por IA Oscar Angulo Cubero.

   Se suma a js/aula-arbitraje/contenido.js (el N.º 1): carga después de él y
   agrega sus colecciones, fichas, preguntas y casos a AULA_CONTENIDO. Mismo
   formato que contenido.js; lo revisa herramientas/verificar-aula-arbitraje.js.
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {{
    "use strict";
    const C = raiz.AULA_CONTENIDO;
    if (!C) return;
    const REVISTAS = {datos};
    ["colecciones", "fichas", "preguntas", "casos", "repeticiones"].forEach((k) => {{ C[k].push(...REVISTAS[k]); }});
}})(typeof window !== "undefined" ? window : globalThis);
"""
open(DEST, "w", encoding="utf-8", newline="\n").write(js)
print(f"{len(col)} colecciones · {len(fichas)} fichas · {len(preguntas)} preguntas · {len(casos)} casos · {len(reps)} repeticiones · {len(js)//1024} KB")

# rev bfb5bbb0d2d82f9f
