#!/usr/bin/env python3
"""Arma herramientas/datos/oscar-angulo-fide-titulos.json: el título de cada
jugador con Elo de los torneos de herramientas/datos/oscar-angulo-fide.json,
sacado de la lista completa de FIDE (players_list_foa.txt, la de
ratings.fide.com/download_lists.phtml, ~300 MB). El reporte de un torneo en
FIDE no trae el título de los jugadores, y hace falta para saber si un
internacional permitía una norma de jugador (B.06.1, 4.8.3).

Guarda solo los titulados de esos torneos ({"fideId": [título, título
femenino]}): la lista entera no va al repositorio. Son los títulos del día de
la lista, no los de la fecha de cada torneo (ver «Sus torneos en FIDE y las
normas de árbitro» en docs/decisiones/juegos-y-torneos.md).

    python3 herramientas/oscar-angulo-fide-titulos.py ruta/a/players_list_foa.txt
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-fide.json")
DESTINO = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-fide-titulos.json")


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    with open(FUENTE, encoding="utf-8") as f:
        ids = {j["fid"] for t in json.load(f)["torneos"] for j in t.get("conElo") or []}
    titulos = {}
    with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
        cab = f.readline()
        # Columnas de ancho fijo: se ubican por el encabezado, no por posición.
        i_tit, i_wtit, i_otit = cab.index("Tit "), cab.index("WTit"), cab.index("OTit")
        for linea in f:
            fid = linea[:15].strip()
            if fid not in ids:
                continue
            tit, wtit = linea[i_tit:i_wtit].strip(), linea[i_wtit:i_otit].strip()
            if tit or wtit:
                titulos[fid] = [tit, wtit]
    with open(DESTINO, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(titulos.items(), key=lambda x: int(x[0]))), f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{os.path.relpath(DESTINO, RAIZ)}: {len(titulos)} titulados de {len(ids)} jugadores con Elo.")


if __name__ == "__main__":
    main()
