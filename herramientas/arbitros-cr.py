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
    python3 herramientas/arbitros-cr.py --huella      la huella que debe dar la base y la consulta que la saca

Las cargas se corren en la base en orden (borran y vuelven a llenar las tres
tablas). Ver «Árbitros de Costa Rica en FIDE» en
docs/decisiones/juegos-y-torneos.md.
"""
import base64
import hashlib
import json
import os
import re
import sys
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
from normas_arbitro import PAISES, TITULADOS, evaluar, valorado  # noqa: E402

FUENTE = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-fide.json")
TITULOS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-titulos.json")
# El título de árbitro de cada uno, del perfil de FIDE (la lista de jugadores
# no lo trae): lo arma herramientas/arbitros-cr/perfiles.sql.
PERFILES = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-perfiles.json")
CARPETA = os.path.join(RAIZ, "herramientas", "arbitros-cr")
# Los cargos de la ficha de FIDE. Para una norma valen el principal, el
# adjunto y el árbitro; el asistente no (B.06.1, 2.4.4) y el de pareos queda
# para revisar (el reglamento no lo nombra). «Deputy Arbiter» y «Sector
# Arbiter», que FIDE también usa, son árbitros del torneo: van como «Arbiter»
# (cuentan igual) y no se les supone un cargo más alto.
CARGOS = {"Chief Arbiter": "Chief", "Deputy Chief Arbiter": "Dep. Chief", "Arbiter": "Arbiter",
          "Deputy Arbiter": "Arbiter", "Sector Arbiter": "Arbiter",
          "Pairings Arbiter": "Pairings", "Assistant Arbiter": "Assistant"}
# Del más alto al más bajo: vale el primero que tenga.
TITULO_ARBITRO = {"International Arbiter": "IA", "FIDE Arbiter": "FA", "National Arbiter": "AN"}
TITULO_ES = {"International Arbiter": "Árbitro Internacional", "FIDE Arbiter": "Árbitro FIDE",
             "National Arbiter": "Árbitro Nacional"}
# Archivos chicos (unos 20 KB): cada uno se corre pegado entero en
# execute_sql, y uno de 130 KB no pasaba por la conversación.
FILAS_POR_CARGA = 60
CARGOS_POR_CARGA = 450


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def texto_cifrado(v):
    """El nombre de un torneo va en base64: muchos son títulos de libros
    («Cien años de soledad», «Crónica de una muerte anunciada»…) y, escritos
    tal cual, la carga se cortaba al pasarla por la conversación."""
    return "convert_from(decode('" + base64.b64encode(v.encode()).decode() + "', 'base64'), 'UTF8')"


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


def sin_rondas(t):
    """Sin el reporte ronda a ronda (FIDE no lo publica de muchos torneos
    viejos, y no se pidió de los que no podían valer) no se sabe cuántas
    rondas tuvo: no son «0 rondas». Si con 9 valdría, queda para revisar;
    si no, el «no» es por otra cosa y se dice sin nombrar las rondas."""
    con_cero, con_nueve = evaluar(t), evaluar(dict(t, rondas=9))
    salida = []
    for cero, nueve in zip(con_cero, con_nueve):
        if nueve["estado"] != "no":
            salida.append({"estado": "revisar", "detalle": "FIDE no publica cuántas rondas tuvo; si fueron las que pide: " + nueve["detalle"]})
            continue
        d = re.sub(r"0 rondas \(pide [^)]*\)(; )?", "", cero["detalle"])
        d = d.replace("internacional de 0 rondas:", "internacional (FIDE no publica cuántas rondas tuvo):")
        d = re.sub(r"\(tiene (\d+) y 0\)", r"(tiene \1; las rondas, FIDE no las publica)", d).strip("; ")
        salida.append({"estado": "no", "detalle": d or "FIDE no publica cuántas rondas tuvo"})
    return tuple(salida)


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
        if not t["rondas"]:
            t["af"], t["ai"] = sin_rondas(t)
        torneos[t["id"]] = t
        for a in e.get("arbitros") or []:
            if a["fed"] != "CRC" or a["cargo"] not in CARGOS:
                continue
            arbitros.setdefault(a["fid"], {"nombre": a["nombre"], "titulo": "", "detalle": ""})
            cargos.add((t["id"], a["fid"], CARGOS[a["cargo"]]))
    perfiles = []
    if os.path.exists(PERFILES):
        with open(PERFILES, encoding="utf-8") as f:
            perfiles = json.load(f)["perfiles"]
    for p in perfiles:
        a = arbitros.get(p["fid"])
        if not a:
            continue
        tit = {t: anio for t, anio in p.get("titulos") or []}
        a["titulo"] = next((TITULO_ARBITRO[t] for t in TITULO_ARBITRO if t in tit), "")
        partes = [f"{TITULO_ES[t]} ({tit[t]})" for t in reversed(list(TITULO_ARBITRO)) if t in tit]
        if p.get("categoria"):
            partes.append(f"categoría {p['categoria']}")
        a["detalle"] = ", ".join(partes)
    return fuente, torneos, cargos, arbitros


def cargas(torneos, cargos, arbitros):
    lineas = ["begin;",
              "delete from public.arbitros_cr_cargos;",
              "delete from public.arbitros_cr_torneos;",
              "delete from public.arbitros_cr;"]
    filas = [f"({sql(int(fid))}, {sql(a['nombre'])}, 'CRC', {sql(a['titulo'])}, {sql(a['detalle'])})"
             for fid, a in sorted(arbitros.items(), key=lambda x: int(x[0]))]
    bloques = [lineas + [f"insert into public.arbitros_cr (fide_id, nombre, federacion, titulo, titulo_detalle) values\n  "
                         + ",\n  ".join(filas)
                         + "\non conflict (fide_id) do update set nombre = excluded.nombre, titulo = excluded.titulo, titulo_detalle = excluded.titulo_detalle;"]]
    filas = []
    for t in sorted(torneos.values(), key=lambda t: t["id"]):
        filas.append("(" + sql(t["id"]) + ", " + texto_cifrado(t["nombre"]) + ", " + ", ".join(sql(v) for v in (
            t["ciudad"], t["pais"], t["inicio"], t["fin"], t["sistema"], t["ritmo"],
            t["jugadores"], t["conElo"], t["contados"], t["rondas"], len(t["federaciones"]), t["valorado"],
            t["af"]["estado"], t["af"]["detalle"][:400], t["ai"]["estado"], t["ai"]["detalle"][:400])) + ")")
    columnas = ("id, nombre, ciudad, pais, inicio, fin, sistema, ritmo, jugadores, con_elo, contados, rondas, "
                "federaciones, valorado, af_estado, af_detalle, ai_estado, ai_detalle")
    for i in range(0, len(filas), FILAS_POR_CARGA):
        # Si el torneo ya está, se reescribe: así la carga sirve también para
        # corregir lo ya cargado sin borrar nada.
        bloques.append([f"insert into public.arbitros_cr_torneos ({columnas}) values\n  " + ",\n  ".join(filas[i:i + FILAS_POR_CARGA])
                        + "\non conflict (id) do update set " + ", ".join(f"{c} = excluded.{c}" for c in columnas.split(", ")[1:]) + ";"])
    filas = [f"({t}, {int(f)}, {sql(c)})" for t, f, c in sorted(cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    for i in range(0, len(filas), CARGOS_POR_CARGA):
        bloques.append([f"insert into public.arbitros_cr_cargos (torneo_id, fide_id, cargo) values\n  " + ",\n  ".join(filas[i:i + CARGOS_POR_CARGA])
                        + "\non conflict do nothing;"])
    bloques[-1].append("commit;")
    return bloques


HUELLA_SQL = """select (select md5(string_agg(concat_ws('|', id, nombre, ciudad, pais, inicio, fin, sistema, ritmo, jugadores, con_elo,
  contados, rondas, federaciones, valorado, af_estado, af_detalle, ai_estado, ai_detalle), E'\\n' order by id)) from public.arbitros_cr_torneos) torneos,
  (select md5(string_agg(concat_ws('|', torneo_id, fide_id, cargo), E'\\n' order by torneo_id, fide_id, cargo)) from public.arbitros_cr_cargos) cargos,
  (select md5(string_agg(concat_ws('|', fide_id, nombre, titulo, titulo_detalle), E'\\n' order by fide_id)) from public.arbitros_cr) arbitros;"""


def huellas(torneos, cargos, arbitros):
    """Lo mismo que HUELLA_SQL, para comprobar que la base quedó igual a las
    cargas (concat_ws se salta los nulos, como acá)."""
    md5 = lambda filas: hashlib.md5("\n".join(filas).encode()).hexdigest()
    col = lambda *v: "|".join(str(x) for x in v if x is not None)
    t = [col(t["id"], t["nombre"], t["ciudad"], t["pais"], t["inicio"], t["fin"], t["sistema"], t["ritmo"], t["jugadores"],
             t["conElo"], t["contados"], t["rondas"], len(t["federaciones"]), t["valorado"], t["af"]["estado"],
             t["af"]["detalle"][:400], t["ai"]["estado"], t["ai"]["detalle"][:400]) for t in sorted(torneos.values(), key=lambda t: t["id"])]
    c = [col(a, int(b), c) for a, b, c in sorted(cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    a = [col(int(f), x["nombre"], x["titulo"], x["detalle"]) for f, x in sorted(arbitros.items(), key=lambda x: int(x[0]))]
    return {"torneos": md5(t), "cargos": md5(c), "arbitros": md5(a)}


def main():
    fuente, torneos, cargos, arbitros = armar()
    con_cargo = {t for t, _, _ in cargos}
    print(f"{len(arbitros)} árbitros de Costa Rica, {len(torneos)} torneos ({len(con_cargo)} con algún árbitro de Costa Rica), {len(cargos)} cargos.")
    print("AF:", dict(Counter(t["af"]["estado"] for t in torneos.values())), " AI:", dict(Counter(t["ai"]["estado"] for t in torneos.values())))
    if "--resumen" in sys.argv:
        return
    if "--huella" in sys.argv:
        print("Lo que debe dar en la base:", huellas(torneos, cargos, arbitros))
        print(HUELLA_SQL)
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
