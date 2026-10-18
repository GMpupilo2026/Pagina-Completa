#!/usr/bin/env python3
"""Arma el SQL que llena public.arbitros_cr_cr_elo (migraciones
20261017224002_arbitros_cr_calculo_elo.sql y 20261017224637_arbitros_cr_calculo_elo_ritmo.sql)
desde herramientas/datos/arbitros-cr-calculo-elo.json: con qué Elo se evaluó
cada torneo de chess-results de Costa Rica que no es de FIDE («Cálculo de
elo» de su ficha: nacional, internacional, ambos o ninguno) y su ritmo
(«Control de tiempo (Standard | Rapid | Blitz)»). Lo usa el filtro «Solo con
Elo nacional» de arbitros-cr.html.

    python3 herramientas/arbitros-cr/calculo-elo.py > /tmp/calculo-elo.sql

El ritmo que se miró a mano (herramientas/datos/arbitros-cr-ritmo-corregir.json,
la lista la da herramientas/arbitros-cr/ritmos-raros.js) va encima del de la
ficha.

Un upsert por cada 500 torneos (`on conflict do update`): correr las
sentencias en orden. Cómo se leen las fichas (chess-results esconde la de los
torneos de hace más de dos semanas detrás de un botón, y el formulario solo lo
acepta el mismo servidor que armó la página) está en «Los torneos con Elo
nacional» de docs/decisiones/juegos-y-torneos.md.
"""
import json
import os

POR_CARGA = 500
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATOS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-calculo-elo.json")
CORREGIR = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-ritmo-corregir.json")
CALCULOS = {"nacional", "internacional", "ambos", "ninguno"}
RITMOS = {"clasico", "rapido", "blitz", None}


def main():
    with open(DATOS, encoding="utf-8") as f:
        d = json.load(f)
    with open(CORREGIR, encoding="utf-8") as f:
        a_mano = {c["clave"]: c["ritmo"] for c in json.load(f)["corregir"]}
    filas = []
    for clave, calculo, ritmo in d["torneos"]:
        ritmo = a_mano.get(int(clave), ritmo)
        if calculo not in CALCULOS or ritmo not in RITMOS:
            raise SystemExit(f"Valor raro en el torneo {clave}: {calculo!r}, {ritmo!r}")
        filas.append(f"({int(clave)}, '{calculo}', {('%s' % repr(ritmo)) if ritmo else 'null'}, '{d['leido']}')")
    for i in range(0, len(filas), POR_CARGA):
        print("insert into public.arbitros_cr_cr_elo (clave, calculo, ritmo, leido) values\n  " + ",\n  ".join(filas[i:i + POR_CARGA])
              + "\non conflict (clave) do update set calculo = excluded.calculo, ritmo = excluded.ritmo, leido = excluded.leido;")


if __name__ == "__main__":
    main()
