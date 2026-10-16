#!/usr/bin/env python3
"""Las fechas raras de chess-results en «Árbitros de Costa Rica».

Lo que comprueba (con torneos inventados, sin salir a la red):
- que fechas_raras() de herramientas/arbitros-cr.py avise del torneo que dura
  un año (como el festival que decía del 22/09/2010 al 22/09/2011) y del que
  tiene un año lejos del de los torneos creados junto a él (como el Infantil
  S8, que decía 2002 con clave de 2012);
- que no avise del torneo de club de una ronda por semana (dos o tres meses),
  ni de los que ya están en arbitros-cr-corregir.json;
- que cada fecha corregida a mano tenga su motivo y una fecha que sí se puede
  leer, con el fin el mismo día o después del inicio.

Ver «Una fecha de chess-results mal escrita se corrige a mano» en
docs/decisiones/juegos-y-torneos.md.

Uso:  python3 herramientas/verificar-arbitros-cr-fechas.py
"""
import datetime
import importlib.util
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("arbitros_cr", os.path.join(AQUI, "arbitros-cr.py"))
ac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ac)

fallos = 0


def igual(que, salio, esperaba):
    global fallos
    if salio == esperaba:
        print("  ✓", que)
    else:
        fallos += 1
        print("  ✗", que, "\n      esperaba:", esperaba, "\n      salió:   ", salio)


# 120 torneos de 2020, uno por clave, más los raros en el medio.
torneos = [{"clave": 1000 + i, "nombre": f"Torneo {i}", "inicio": f"2020-{1 + i % 12:02d}-10", "fin": f"2020-{1 + i % 12:02d}-12"} for i in range(120)]
torneos += [
    {"clave": 1050.5, "nombre": "Festival de un año", "inicio": "2010-09-22", "fin": "2011-09-22"},
    {"clave": 1060.5, "nombre": "Infantil con el año viejo", "inicio": "2012-01-10", "fin": "2012-01-13"},
    {"clave": 1070.5, "nombre": "Torneo de club semanal", "inicio": "2020-02-01", "fin": "2020-04-25"},
    {"clave": 1080.5, "nombre": "Ya corregido", "inicio": "2001-01-01", "fin": "2002-01-01"},
]
for t in torneos:
    t["clave"] = str(int(t["clave"] * 2))   # claves enteras, en el mismo orden

print("=== Las fechas raras ===")
raras = ac.fechas_raras(torneos, corregidas=[2161])
igual("avisa del que dura un año y del que tiene el año lejos de sus vecinos; no del de club ni del ya corregido",
      [(r[1], r[4]) for r in raras],
      [("Festival de un año", "dura 365 días; es de 2010 y los torneos creados junto a él son de 2020"),
       ("Infantil con el año viejo", "es de 2012 y los torneos creados junto a él son de 2020")])
igual("sin la lista de corregidas, el ya corregido también sale", len(ac.fechas_raras(torneos)), 3)
igual("con pocos vecinos (menos de 20) no compara el año: no hay con qué", ac.fechas_raras(torneos[:5] + [torneos[-2]]), [])

print("\n=== Las fechas corregidas a mano ===")
with open(ac.CORREGIR, encoding="utf-8") as f:
    corregir = json.load(f)["corregir"]
malas = []
for c in corregir:
    try:
        ini, fin = datetime.date.fromisoformat(c["inicio"]), datetime.date.fromisoformat(c["fin"])
        if fin < ini or not c.get("motivo") or not isinstance(c["clave"], int):
            malas.append(c["clave"])
    except (KeyError, ValueError):
        malas.append(c.get("clave"))
igual(f"las {len(corregir)} tienen clave, motivo y una fecha que se lee, con el fin el mismo día o después", malas, [])
igual("ninguna clave repetida", len({c["clave"] for c in corregir}), len(corregir))

if fallos:
    print(f"\n✗ {fallos} comprobación(es) fallaron.")
    sys.exit(1)
print("\n✓ Todo bien.")
