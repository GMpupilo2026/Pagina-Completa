#!/usr/bin/env python3
"""Junta en herramientas/datos/arbitros-cr-chess-results-afuera.json lo que
sirve de las búsquedas de chess-results en todos los países: las filas de un
torneo de otra federación que nombran (por su ID FIDE, o por su primer nombre
y su primer apellido) a algún árbitro de Costa Rica.

Cada argumento es la respuesta de execute_sql tal cual se guardó, de la
consulta herramientas/arbitros-cr/afuera.sql: una fila con «n» y «filas»,
cada fila [clave, [las celdas 2 a 18 del buscador, ya sin etiquetas]]. Un
torneo que sale en dos tramos queda una vez. El reconocimiento fino de quién
fue qué lo hace herramientas/arbitros-cr.py, igual que con los de Costa Rica.

    python3 herramientas/arbitros-cr/juntar-afuera.py salida-1.json salida-2.json …

Con --cr, las respuestas son de exportar-cr.sql (los torneos de Costa Rica de
un año) y se SUMAN a herramientas/datos/arbitros-cr-chess-results.json: un
torneo que ya estaba se reemplaza por el nuevo, los demás quedan. Sin --cr,
el archivo del extranjero se reescribe entero (cada mes se busca todo de
nuevo).

    python3 herramientas/arbitros-cr/juntar-afuera.py --cr salida-cr.json
"""
import datetime
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESTINO = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-chess-results-afuera.json")
DESTINO_CR = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-chess-results.json")
# Las celdas 2 a 18 de una fila del buscador, en orden (la 4, la 5, la 15 y la
# 16 no se usan).
COLUMNAS = ["nombre", "fed", None, None, "inicio", "fin", "director", "organizador", "principal", "adjunto", "arbitros",
            "lugar", "control", None, None, "rondas", "jugadores"]


def filas(ruta):
    with open(ruta, encoding="utf-8") as f:
        t = json.load(f)
    if isinstance(t, list) and t and isinstance(t[0], dict) and "text" in t[0]:
        t = {"result": "".join(b.get("text", "") for b in t)}
    if isinstance(t, dict) and "result" in t:
        s = t["result"]
        i, j = s.index("\n[{"), s.rindex("}]") + 2
        t = json.loads(s[i:j])
    return t[0]["filas"] or []


def main():
    cr = "--cr" in sys.argv
    rutas = [x for x in sys.argv[1:] if x != "--cr"]
    if not rutas:
        raise SystemExit(__doc__)
    torneos = {}
    destino = DESTINO_CR if cr else DESTINO
    if cr:
        with open(destino, encoding="utf-8") as f:
            torneos = {t["clave"]: t for t in json.load(f)["torneos"]}
        antes = len(torneos)
    for ruta in rutas:
        for clave, celdas in filas(ruta):
            t = {"clave": clave}
            for nombre, valor in zip(COLUMNAS, celdas):
                if nombre:
                    t[nombre] = valor or ""
            torneos[clave] = t
    salida = {"actualizado": datetime.date.today().isoformat(), "torneos": [torneos[k] for k in sorted(torneos, key=int)]}
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    if cr:
        print(f"{os.path.relpath(destino, RAIZ)}: {len(torneos)} torneos de Costa Rica ({len(torneos) - antes} nuevos).")
    else:
        print(f"{os.path.relpath(destino, RAIZ)}: {len(torneos)} torneos de otra federación que nombran a alguien de Costa Rica.")


if __name__ == "__main__":
    main()
