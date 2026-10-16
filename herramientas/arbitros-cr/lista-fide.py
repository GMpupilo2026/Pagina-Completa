#!/usr/bin/env python3
"""Arma el SQL que llena public.arbitros_cr_fide (migraciones
20261016011935_arbitros_cr_fide.sql y 20261016014132_arbitros_cr_historial_y_sin_id.sql)
desde herramientas/datos/arbitros-cr-lista-fide.json: los árbitros de Costa
Rica de la lista oficial de FIDE, la fecha en que el Consejo de FIDE les
aprobó el AF y el AI (y la fecha que dice su perfil de FIDE, la oficial, en
«perfil» de cada aprobación cuando se conoce), y sus solicitudes de título y seminarios según los
informes de la Comisión de Árbitros. Al final, la categoría nacional (A, B o
C) de cada Árbitro Nacional, de la lista de la Federación Central de Ajedrez
(herramientas/datos/arbitros-cr-lista-fca.json, migración
20261016033536_arbitros_cr_categoria_nacional.sql).

    python3 herramientas/arbitros-cr/lista-fide.py > /tmp/lista-fide.sql

Borra y vuelve a llenar la tabla, de a 25 filas por insert (un insert de
16 KB en un solo execute_sql se corta a los 60 s): correr las sentencias en
orden. Para ponerla al día: bajar
la lista de nuevo (ver «Lo que dice FIDE de cada árbitro» en
docs/decisiones/juegos-y-torneos.md), reemplazar «arbitros» y «lista» en el
JSON y sumar a «aprobaciones» los títulos del último informe de la Comisión.
"""
import json
import os

POR_CARGA = 25

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATOS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-lista-fide.json")
FCA = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-lista-fca.json")
# La categoría nacional de un NA, como la escribe la Federación.
CATEGORIA_NACIONAL = {"NAA": "A", "NAB": "B", "NAC": "C"}


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    with open(DATOS, encoding="utf-8") as f:
        d = json.load(f)
    lista = d["lista"]["publicada"]
    apro, sols, sems = {}, {}, {}
    for a in d["aprobaciones"]:
        apro.setdefault(a["fide_id"], {})[a["titulo"]] = a
    for x in d.get("solicitudes", []):
        sols.setdefault(x["fide_id"], []).append({k: v for k, v in x.items() if k != "fide_id"})
    for x in d.get("seminarios", []):
        sems.setdefault(x["fide_id"], []).append({k: v for k, v in x.items() if k != "fide_id"})
    js = lambda v: sql(json.dumps(v, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"
    filas = []
    for fid, nombre, titulo, inactivo, categoria, licencia in d["arbitros"]:
        af, ia = apro.get(fid, {}).get("FA"), apro.get(fid, {}).get("IA")
        filas.append("(" + ", ".join(sql(v) for v in (
            fid, nombre, titulo, inactivo, categoria, licencia,
            af and af["fecha"], af["consejo"] if af else "", ia and ia["fecha"], ia["consejo"] if ia else "", lista))
            + ", " + js(sols.get(fid, [])) + ", " + js(sems.get(fid, []))
            + ", " + sql(af and af.get("perfil")) + ", " + sql(ia and ia.get("perfil")) + ")")
    faltan = (set(apro) | set(sols) | set(sems)) - {f[0] for f in d["arbitros"]}
    if faltan:
        raise SystemExit(f"Aprobaciones, solicitudes o seminarios de quien no está en la lista: {sorted(faltan)}")
    print("delete from public.arbitros_cr_fide;")
    for i in range(0, len(filas), POR_CARGA):
        print("insert into public.arbitros_cr_fide (fide_id, nombre, titulo, inactivo, categoria, licencia, af_fecha, af_consejo, ia_fecha, ia_consejo, lista, solicitudes, seminarios, af_perfil, ia_perfil) values\n  "
              + ",\n  ".join(filas[i:i + POR_CARGA]) + ";")
    print(categorias_nacionales({f[0] for f in d["arbitros"]}))


def categorias_nacionales(en_lista):
    """El update de categoria_nacional desde la lista de la Federación. Quien
    figura en ella y no en la de FIDE no se carga (no tiene fila): se avisa."""
    with open(FCA, encoding="utf-8") as f:
        fca = json.load(f)
    valores = [(fid, CATEGORIA_NACIONAL[cat]) for fid, _, _, titulo, cat, _ in fca["arbitros"] if cat in CATEGORIA_NACIONAL]
    fuera = sorted(fid for fid, _ in valores if fid not in en_lista)
    if fuera:
        raise SystemExit(f"En la lista de la Federación y no en la de FIDE: {fuera}")
    return ("update public.arbitros_cr_fide f set categoria_nacional = v.c, fca_leida = " + sql(fca["leida"]) + "\nfrom (values "
            + ", ".join(f"({fid}, {sql(c)})" for fid, c in valores) + ") v(f, c)\nwhere f.fide_id = v.f;")


if __name__ == "__main__":
    main()
