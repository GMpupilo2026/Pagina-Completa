#!/usr/bin/env python3
"""Los nombres de árbitro de chess-results que la herramienta «Árbitros de
Costa Rica» no reconoce: las celdas de árbitro principal, adjunto y árbitros
de los torneos de Costa Rica en que herramientas/arbitros-cr.py no encuentra a
nadie de la lista (ni por su ID FIDE ni por su nombre). Sirven para
corregirlos: un nombre mal escrito, un ID equivocado o alguien que falta.

Arma el SQL que llena public.arbitros_cr_sin_id (migración
20261016014132_arbitros_cr_historial_y_sin_id.sql), juntando la misma celda (sin tildes ni
mayúsculas) de todos los torneos:

    python3 herramientas/arbitros-cr/por-identificar.py > /tmp/sin-id.sql
    python3 herramientas/arbitros-cr/por-identificar.py --huella   # lo que debe dar HUELLA_SQL en la base

Una celda donde se reconoce a alguien no sale aunque traiga a otra persona
más: no se sabe dónde termina un nombre y empieza el otro.
"""
import importlib.util
import os
import re
import sys
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("arbitros_cr", os.path.join(RAIZ, "herramientas", "arbitros-cr.py"))
ac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ac)

POR_CARGA = 50
HUELLA_SQL = """select md5(string_agg(texto || '|' || torneos || '|' || primero || '|' || ultimo || '|' || array_to_string(claves, ',') || '|'
  || array_to_string(ids, ','), E'\\n' order by texto collate "C")) from public.arbitros_cr_sin_id;"""


def armar_filas():
    _, _, _, arbitros = ac.armar()
    celdas = []
    cr_torneos, _ = ac.armar_chess_results(arbitros, sin_reconocer=celdas)
    # Solo los torneos que quedan (no los de prueba ni los que no se jugaron).
    import json
    with open(ac.CHESS_RESULTS, encoding="utf-8") as f:
        validos = {int(t["clave"]) for t in json.load(f)["torneos"]}
    grupos = defaultdict(lambda: {"textos": defaultdict(int), "roles": set(), "claves": set(), "fechas": []})
    for c in celdas:
        if c["clave"] not in validos or not c["celda"]:
            continue
        k = " ".join(ac.palabras(c["celda"]))
        if not k:
            continue
        g = grupos[k]
        g["textos"][c["celda"]] += 1
        g["roles"].add(c["rol"])
        g["claves"].add(c["clave"])
        g["fechas"].append(c["inicio"])
    filas = []
    for k, g in grupos.items():
        texto = max(g["textos"], key=g["textos"].get)[:200]
        ids = sorted(set(re.findall(r"\b(\d{5,8})\b", " ".join(g["textos"]))))
        claves = sorted(g["claves"], reverse=True)
        filas.append((texto, sorted(g["roles"]), len(claves), min(g["fechas"]), max(g["fechas"]), claves[:5], ids))
    filas.sort(key=lambda f: (-f[2], f[0]))
    return filas, celdas


def main():
    filas, celdas = armar_filas()
    if "--huella" in sys.argv:
        import hashlib
        orden = sorted(filas, key=lambda f: f[0].encode())
        texto = "\n".join(f"{t}|{n}|{p}|{u}|{','.join(map(str, c))}|{','.join(d)}" for t, _, n, p, u, c, d in orden)
        print(hashlib.md5(texto.encode()).hexdigest())
        print(HUELLA_SQL)
        return
    lit = lambda xs, tipo: "array[" + ", ".join(ac.sql(x) for x in xs) + f"]::{tipo}[]"
    print(f"-- {len(filas)} celdas sin reconocer, de {len(celdas)} apariciones. Se corren en orden.")
    print("delete from public.arbitros_cr_sin_id;")
    for i in range(0, len(filas), POR_CARGA):
        print("insert into public.arbitros_cr_sin_id (texto, roles, torneos, primero, ultimo, claves, ids) values\n  " + ",\n  ".join(
            "(" + ", ".join((ac.sql(t), lit(r, "text"), str(n), ac.sql(p), ac.sql(u), lit(c, "integer"), lit(d, "text"))) + ")"
            for t, r, n, p, u, c, d in filas[i:i + POR_CARGA]) + ";")
    print(f"{len(filas)} celdas sin reconocer ({sum(f[2] for f in filas)} torneos).", file=sys.stderr)


if __name__ == "__main__":
    main()
