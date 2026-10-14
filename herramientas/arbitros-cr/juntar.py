#!/usr/bin/env python3
"""Junta los tramos de herramientas/arbitros-cr/exportar.sql en
herramientas/datos/arbitros-cr-fide.json.

Cada tramo es la respuesta de execute_sql tal cual se guardó (un JSON con
«result», que trae el texto con la fila [{"datos": …}]) o el JSON de
«datos» solo. Un torneo que sale en dos tramos queda una vez.

    python3 herramientas/arbitros-cr/juntar.py tramo1.json tramo2.json …
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESTINO = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-fide.json")


def datos(ruta):
    with open(ruta, encoding="utf-8") as f:
        t = json.load(f)
    if isinstance(t, list):  # la respuesta guardada puede venir como lista de bloques de texto
        t = {"result": "".join(b.get("text", "") for b in t)}
    if "result" in t:
        s = t["result"]
        i, j = s.index("\n[{"), s.rindex("}]") + 2
        t = json.loads(s[i:j])[0]["datos"]
    return t


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    torneos, actualizado = {}, ""
    for ruta in sys.argv[1:]:
        d = datos(ruta)
        if not d:
            continue
        actualizado = max(actualizado, d["actualizado"])
        for t in d["torneos"] or []:
            torneos[t["id"]] = t
    salida = {"actualizado": actualizado, "torneos": [torneos[k] for k in sorted(torneos)]}
    with open(DESTINO, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    con_rondas = sum(t["tieneRondas"] for t in salida["torneos"])
    print(f"{os.path.relpath(DESTINO, RAIZ)}: {len(torneos)} torneos, {con_rondas} con reporte ronda a ronda.")


if __name__ == "__main__":
    main()
