#!/usr/bin/env python3
"""Arma el SQL que llena public.arbitros_cr_fide (migración
20261016011935_arbitros_cr_fide.sql) desde
herramientas/datos/arbitros-cr-lista-fide.json: los árbitros de Costa Rica de
la lista oficial de FIDE y la fecha en que el Consejo de FIDE les aprobó el AF
y el AI.

    python3 herramientas/arbitros-cr/lista-fide.py > /tmp/lista-fide.sql

Borra y vuelve a llenar la tabla en una transacción. Para ponerla al día: bajar
la lista de nuevo (ver «Lo que dice FIDE de cada árbitro» en
docs/decisiones/juegos-y-torneos.md), reemplazar «arbitros» y «lista» en el
JSON y sumar a «aprobaciones» los títulos del último informe de la Comisión.
"""
import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATOS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-lista-fide.json")


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
    apro = {}
    for a in d["aprobaciones"]:
        apro.setdefault(a["fide_id"], {})[a["titulo"]] = a
    filas = []
    for fid, nombre, titulo, inactivo, categoria, licencia in d["arbitros"]:
        af, ia = apro.get(fid, {}).get("FA"), apro.get(fid, {}).get("IA")
        filas.append("(" + ", ".join(sql(v) for v in (
            fid, nombre, titulo, inactivo, categoria, licencia,
            af and af["fecha"], af["consejo"] if af else "", ia and ia["fecha"], ia["consejo"] if ia else "", lista)) + ")")
    faltan = set(apro) - {f[0] for f in d["arbitros"]}
    if faltan:
        raise SystemExit(f"Aprobaciones de quien no está en la lista: {sorted(faltan)}")
    print("begin;\ndelete from public.arbitros_cr_fide;\n"
          "insert into public.arbitros_cr_fide (fide_id, nombre, titulo, inactivo, categoria, licencia, af_fecha, af_consejo, ia_fecha, ia_consejo, lista) values\n  "
          + ",\n  ".join(filas) + ";\ncommit;")


if __name__ == "__main__":
    main()
