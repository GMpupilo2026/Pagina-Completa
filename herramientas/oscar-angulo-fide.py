#!/usr/bin/env python3
"""Arma data/oscar-angulo-fide.json, los datos de oscar-angulo-fide.html.

La página muestra los torneos valorados por FIDE en que Oscar Angulo Cubero
(ID FIDE 6501435) figura en su perfil de ratings.fide.com como árbitro
principal, adjunto principal, árbitro u organizador, y cuáles de ellos
cumplen las condiciones de un torneo para una norma de Árbitro FIDE (AF) y
de Árbitro Internacional (AI) según el reglamento FIDE B.06.1 vigente desde
el 1 de marzo de 2026. Él ya tiene los dos títulos (AF en 2016, AI en 2020):
la página dice qué torneos valdrían hoy, no los que usó.

La fuente es herramientas/datos/oscar-angulo-fide.json: lo que se leyó de
FIDE de cada torneo (la ficha, la lista de jugadores con Elo y el reporte
ronda a ronda), ya resumido. Cómo se bajó, en docs/decisiones/juegos-y-torneos.md
(«Sus torneos en FIDE y las normas de árbitro»).

    python3 herramientas/oscar-angulo-fide.py              escribe el JSON
    python3 herramientas/oscar-angulo-fide.py --comprobar  falla si no está al día
"""
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-fide.json")
CHESS_RESULTS = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-torneos.csv")
# El título de cada jugador con Elo de sus torneos («fideId»: [título,
# título femenino]), sacado de la lista de FIDE (players_list_foa.txt): el
# reporte de FIDE no lo trae. Solo los titulados. Lo arma
# herramientas/oscar-angulo-fide-titulos.py.
TITULOS = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-fide-titulos.json")
DESTINO = os.path.join(RAIZ, "data", "oscar-angulo-fide.json")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from normas_arbitro import (CARGOS, PAISES, REGLAMENTO, RITMOS, SISTEMAS, TITULADOS,  # noqa: E402
                            evaluar, sin_tildes, valorado)


def chess_results():
    with open(CHESS_RESULTS, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def mismo_torneo(e, cr):
    """El torneo de chess-results que es el mismo (mismo día de inicio y al
    menos dos palabras del nombre en común), o None."""
    palabras = lambda s: {w for w in re.findall(r"[a-z0-9]{3,}", sin_tildes(s)) if w not in {"del", "de", "la", "los", "las", "torneo"}}
    mejor, puntos = None, 0
    for r in cr:
        if r["inicio"] != e["inicio"]:
            continue
        p = len(palabras(r["nombre"]) & palabras(e["nombre"]))
        if p > puntos:
            mejor, puntos = r, p
    return mejor if puntos >= 2 else None


def armar():
    with open(FUENTE, encoding="utf-8") as f:
        fuente = json.load(f)
    cr = chess_results()
    with open(TITULOS, encoding="utf-8") as f:
        titulos = json.load(f)
    torneos = []
    for e in fuente["torneos"]:
        rep = e.get("conElo") or []
        feds = sorted({j["fed"] for j in rep if j["fed"]})
        tit = [titulos.get(j["fid"], ["", ""]) for j in rep]
        par = mismo_torneo(e, cr)
        # Las rondas salen del reporte ronda a ronda de FIDE; si FIDE no lo
        # tiene, del mismo torneo en chess-results.
        rondas, rondas_de = e["rondas"], "FIDE"
        if not rondas and par and par["rondas"].isdigit() and int(par["rondas"]):
            rondas, rondas_de = int(par["rondas"]), "chess-results"
        # Un torneo registrado pero sin valorar (sin jugadores con Elo) no
        # dice «Rated as»: el ritmo sale del control de tiempo («Standard: …»).
        ritmo = e["ritmo"] or (e["control"] or "").split(":")[0].strip()
        t = {
            "id": e["id"], "nombre": e["nombre"], "ciudad": e["ciudad"], "pais": PAISES.get(e["pais"], e["pais"]),
            "inicio": e["inicio"], "fin": e["fin"], "anio": int(e["inicio"][:4]),
            "sistema": e["sistema"], "ritmo": ritmo if ritmo in RITMOS else "", "control": e["control"], "hibrido": e["hibrido"],
            # La ficha de FIDE a veces trae menos jugadores de los que tiene su
            # propia lista con Elo (el XLV Metropolitano U14 dice 60 y lista 108):
            # se toma el mayor.
            "jugadores": max(e["jugadores"] or 0, len(rep)), "conElo": len(rep),
            # B.06.1, 2.4.1: cuenta quien faltó a lo sumo a una ronda. Del
            # reporte salen las partidas valoradas; se descuenta a quien
            # perdió por no presentarse en dos rondas o más.
            "contados": sum(1 for j in rep if j["ausencias"] <= 1),
            "rondas": rondas or 0, "rondasDe": rondas_de if rondas else "", "federaciones": feds,
            "titulados": sum(1 for a, b in tit if a in TITULADOS or b in TITULADOS),
            "maestros": sum(1 for a, b in tit if a in ("GM", "IM")),
            "maestrasYMaestros": sum(1 for a, b in tit if a in ("GM", "IM") or b in ("WGM", "WIM")),
            "cargos": e["cargos"], "valorado": valorado(e["valorado"]), "conReporte": e["tieneReporte"],
            "chessResults": int(par["clave"]) if par else None,
        }
        t["af"], t["ai"] = evaluar(t)
        torneos.append(t)
    torneos.sort(key=lambda t: (t["inicio"], t["id"]), reverse=True)
    return {
        "actualizado": fuente["actualizado"],
        "idFide": fuente["idFide"],
        "reglamento": REGLAMENTO,
        "sistemas": SISTEMAS, "ritmos": RITMOS, "cargos": CARGOS,
        "torneos": torneos,
    }


def texto(datos):
    return json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
    datos = armar()
    nuevo = texto(datos)
    if "--comprobar" in sys.argv:
        viejo = open(DESTINO, encoding="utf-8").read() if os.path.exists(DESTINO) else ""
        if viejo != nuevo:
            raise SystemExit(f"{os.path.relpath(DESTINO, RAIZ)} no está al día: python3 herramientas/oscar-angulo-fide.py")
        print(f"{os.path.relpath(DESTINO, RAIZ)} al día: {len(datos['torneos'])} torneos.")
        return
    with open(DESTINO, "w", encoding="utf-8") as f:
        f.write(nuevo)
    n = len(datos["torneos"])
    af = sum(t["af"]["estado"] != "no" for t in datos["torneos"])
    ai = sum(t["ai"]["estado"] != "no" for t in datos["torneos"])
    print(f"{os.path.relpath(DESTINO, RAIZ)}: {n} torneos; AF {af}, AI {ai} (sin contar los «no»).")


if __name__ == "__main__":
    main()
