#!/usr/bin/env python3
"""Arma la carga de la herramienta «Árbitros de Costa Rica en FIDE»
(arbitros-cr.html): las tablas arbitros_cr, arbitros_cr_torneos y
arbitros_cr_cargos (migración 20261014162543_arbitros_cr.sql), que solo lee
quien tiene la licencia.

La fuente es herramientas/datos/arbitros-cr-fide.json: lo leído de
ratings.fide.com, ya resumido por herramientas/arbitros-cr/exportar.sql
(cada torneo de Costa Rica con su ficha, sus jugadores con Elo y sus
árbitros; y el perfil de cada árbitro de Costa Rica, con su título y los
torneos que arbitró afuera). Los títulos de los jugadores salen de
herramientas/datos/arbitros-cr-titulos.json (la lista de FIDE; ver
herramientas/oscar-angulo-fide-titulos.py). Las normas se evalúan con
herramientas/normas_arbitro.py, la misma copia que usa la página de Oscar
Angulo.

    python3 herramientas/arbitros-cr.py               escribe herramientas/arbitros-cr/carga-*.sql
    python3 herramientas/arbitros-cr.py --resumen     solo cuenta

Las cargas se corren en la base en orden (borran y vuelven a llenar las tres
tablas). Ver «Árbitros de Costa Rica en FIDE» en
docs/decisiones/juegos-y-torneos.md.
"""
import json
import os
import sys
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
from normas_arbitro import PAISES, TITULADOS, evaluar, valorado  # noqa: E402

FUENTE = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-fide.json")
TITULOS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-titulos.json")
CARPETA = os.path.join(RAIZ, "herramientas", "arbitros-cr")
# Los cargos de la ficha de FIDE. Para una norma valen el principal, el
# adjunto y el árbitro; el asistente no (B.06.1, 2.4.4) y el de pareos queda
# para revisar (el reglamento no lo nombra).
CARGOS = {"Chief Arbiter": "Chief", "Deputy Chief Arbiter": "Dep. Chief", "Arbiter": "Arbiter",
          "Pairings Arbiter": "Pairings", "Assistant Arbiter": "Assistant"}
TITULO_ARBITRO = {"International Arbiter": "IA", "FIDE Arbiter": "FA", "National Arbiter": "AN"}
FILAS_POR_CARGA = 400


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def torneo(e, titulos):
    """Lo que pide evaluar() de un torneo, como en oscar-angulo-fide.py."""
    rep = e.get("conElo") or []
    tit = [titulos.get(j["fid"], ["", ""]) for j in rep]
    ritmo = e["ritmo"] or (e["control"] or "").split(":")[0].strip()
    return {
        "id": e["id"], "nombre": e["nombre"], "ciudad": e["ciudad"] or "", "pais": PAISES.get(e["pais"], e["pais"] or ""),
        "inicio": e["inicio"], "fin": e["fin"],
        "sistema": e["sistema"] if e["sistema"] in ("s", "r", "d", "t", "k") else "",
        "ritmo": ritmo if ritmo in ("Standard", "Rapid", "Blitz") else "",
        "hibrido": e["hibrido"], "jugadores": max(e["jugadores"] or 0, len(rep)), "conElo": len(rep),
        "contados": sum(1 for j in rep if j["ausencias"] <= 1),
        "rondas": e["rondas"] or 0, "federaciones": sorted({j["fed"] for j in rep if j["fed"]}),
        "titulados": sum(1 for a, b in tit if a in TITULADOS or b in TITULADOS),
        "maestros": sum(1 for a, b in tit if a in ("GM", "IM")),
        "maestrasYMaestros": sum(1 for a, b in tit if a in ("GM", "IM") or b in ("WGM", "WIM")),
        # En la herramienta todos figuran como árbitros: el cargo de cada uno
        # se mira aparte (arbitros_cr_cargos).
        "cargos": ["Chief"], "valorado": valorado(e["valorado"]), "conReporte": e["tieneReporte"],
    }


def armar():
    with open(FUENTE, encoding="utf-8") as f:
        fuente = json.load(f)
    with open(TITULOS, encoding="utf-8") as f:
        titulos = json.load(f)
    torneos, cargos, arbitros = {}, set(), {}
    for e in fuente["torneos"]:
        if not e.get("inicio") or not e.get("nombre"):
            continue
        t = torneo(e, titulos)
        t["af"], t["ai"] = evaluar(t)
        torneos[t["id"]] = t
        for a in e.get("arbitros") or []:
            if a["fed"] != "CRC" or a["cargo"] not in CARGOS:
                continue
            arbitros.setdefault(a["fid"], {"nombre": a["nombre"], "titulo": "", "detalle": ""})
            cargos.add((t["id"], a["fid"], CARGOS[a["cargo"]]))
    for p in fuente.get("perfiles", []):
        if p["fid"] in arbitros:
            arbitros[p["fid"]]["titulo"] = TITULO_ARBITRO.get(p.get("titulo") or "", "")
            arbitros[p["fid"]]["detalle"] = p.get("tituloDetalle") or ""
    return fuente, torneos, cargos, arbitros


def cargas(torneos, cargos, arbitros):
    lineas = ["begin;",
              "delete from public.arbitros_cr_cargos;",
              "delete from public.arbitros_cr_torneos;",
              "delete from public.arbitros_cr;"]
    filas = [f"({sql(int(fid))}, {sql(a['nombre'])}, 'CRC', {sql(a['titulo'])}, {sql(a['detalle'])})"
             for fid, a in sorted(arbitros.items(), key=lambda x: int(x[0]))]
    bloques = [lineas + [f"insert into public.arbitros_cr (fide_id, nombre, federacion, titulo, titulo_detalle) values\n  "
                         + ",\n  ".join(filas) + ";"]]
    filas = []
    for t in sorted(torneos.values(), key=lambda t: t["id"]):
        filas.append("(" + ", ".join(sql(v) for v in (
            t["id"], t["nombre"], t["ciudad"], t["pais"], t["inicio"], t["fin"], t["sistema"], t["ritmo"],
            t["jugadores"], t["conElo"], t["contados"], t["rondas"], len(t["federaciones"]), t["valorado"],
            t["af"]["estado"], t["af"]["detalle"][:400], t["ai"]["estado"], t["ai"]["detalle"][:400])) + ")")
    columnas = ("id, nombre, ciudad, pais, inicio, fin, sistema, ritmo, jugadores, con_elo, contados, rondas, "
                "federaciones, valorado, af_estado, af_detalle, ai_estado, ai_detalle")
    for i in range(0, len(filas), FILAS_POR_CARGA):
        bloques.append([f"insert into public.arbitros_cr_torneos ({columnas}) values\n  " + ",\n  ".join(filas[i:i + FILAS_POR_CARGA]) + ";"])
    filas = [f"({t}, {int(f)}, {sql(c)})" for t, f, c in sorted(cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    for i in range(0, len(filas), FILAS_POR_CARGA * 3):
        bloques.append([f"insert into public.arbitros_cr_cargos (torneo_id, fide_id, cargo) values\n  " + ",\n  ".join(filas[i:i + FILAS_POR_CARGA * 3]) + ";"])
    bloques[-1].append("commit;")
    return bloques


def main():
    fuente, torneos, cargos, arbitros = armar()
    con_cargo = {t for t, _, _ in cargos}
    print(f"{len(arbitros)} árbitros de Costa Rica, {len(torneos)} torneos ({len(con_cargo)} con algún árbitro de Costa Rica), {len(cargos)} cargos.")
    print("AF:", dict(Counter(t["af"]["estado"] for t in torneos.values())), " AI:", dict(Counter(t["ai"]["estado"] for t in torneos.values())))
    if "--resumen" in sys.argv:
        return
    os.makedirs(CARPETA, exist_ok=True)
    for viejo in os.listdir(CARPETA):
        if viejo.startswith("carga-") and viejo.endswith(".sql"):
            os.remove(os.path.join(CARPETA, viejo))
    bloques = cargas(torneos, cargos, arbitros)
    # Todo en una transacción: las cargas se corren seguidas en la misma
    # conexión no se puede desde execute_sql, así que cada archivo es una
    # unidad y el primero borra. Se corren en orden; si una falla, se vuelve
    # a correr desde la primera.
    bloques[0] = [l for l in bloques[0] if l != "begin;"]
    bloques[-1] = [l for l in bloques[-1] if l != "commit;"]
    for i, b in enumerate(bloques, start=1):
        with open(os.path.join(CARPETA, f"carga-{i:02d}.sql"), "w", encoding="utf-8") as f:
            f.write(f"-- Carga {i} de {len(bloques)} de la herramienta arbitros-cr. La arma herramientas/arbitros-cr.py: no se edita a mano.\n")
            f.write("\n".join(b) + "\n")
    print(f"{len(bloques)} archivos en {os.path.relpath(CARPETA, RAIZ)}/")


if __name__ == "__main__":
    main()
