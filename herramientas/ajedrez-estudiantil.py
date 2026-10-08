#!/usr/bin/env python3
"""Arma data/ajedrez-estudiantil.json, los datos de ajedrez-estudiantil.html.

La página muestra la participación en los torneos estudiantiles de Costa Rica
publicados en chess-results.com: los Juegos Deportivos Estudiantiles (JDE) del
MEP por etapa (institucional o circuital, regional, interregional y nacional),
los CODICADER y otros escolares internacionales. Cómo se buscaron y
clasificaron, en docs/decisiones/juegos-y-torneos.md («Ajedrez estudiantil en
Costa Rica: los torneos de chess-results»).

La fuente es herramientas/datos/ajedrez-estudiantil-torneos.csv: un torneo por
fila, ya clasificado. Este script no la vuelve a armar (chess-results no tiene
API y desde una sesión de Claude Code no hay salida al sitio): solo la pasa a
lo que pide la página, sin el organizador (a veces es el nombre de una persona
y la página no lo usa) y con las columnas que la página filtra.

    python3 herramientas/ajedrez-estudiantil.py              escribe el JSON
    python3 herramientas/ajedrez-estudiantil.py --comprobar  falla si no está al día
"""
import csv
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-torneos.csv")
DESTINO = os.path.join(RAIZ, "data", "ajedrez-estudiantil.json")

# El día de la búsqueda en chess-results: la página lo dice.
CONSULTA = "2026-10-08"

COLUMNAS = ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar",
            "region", "jugadores", "modalidad", "ritmo"]
ETAPAS = {"Institucional o circuital", "Regional", "Interregional", "Nacional",
          "Internacional (CODICADER)", "Internacional federativo", "Otro estudiantil"}
JDE = {"Institucional o circuital", "Regional", "Interregional", "Nacional"}
CATEGORIAS = {"A", "B", "C", "D", "E", "Sin dato"}
NUMEROS = {"clave", "anio", "jugadores"}


def armar():
    with open(FUENTE, encoding="utf-8", newline="") as f:
        filas = list(csv.DictReader(f))
    vistas = set()
    torneos = []
    for i, r in enumerate(filas, start=2):
        donde = f"{os.path.relpath(FUENTE, RAIZ)}, fila {i}"
        if r["etapa"] not in ETAPAS:
            sys.exit(f"{donde}: etapa desconocida «{r['etapa']}»")
        if r["etapa"] in JDE and r["categoria"] not in CATEGORIAS:
            sys.exit(f"{donde}: un torneo de los JDE sin categoría válida («{r['categoria']}»)")
        if r["etapa"] not in JDE and r["categoria"]:
            sys.exit(f"{donde}: solo los torneos de los JDE llevan categoría")
        if r["clave"] in vistas:
            sys.exit(f"{donde}: el torneo {r['clave']} está dos veces")
        vistas.add(r["clave"])
        torneos.append([int(r[c]) if c in NUMEROS else r[c] for c in COLUMNAS])
    torneos.sort(key=lambda t: (t[1], t[5], t[0]))
    datos = {"consulta": CONSULTA, "columnas": COLUMNAS, "torneos": torneos}
    return json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
    texto = armar()
    if "--comprobar" in sys.argv:
        actual = open(DESTINO, encoding="utf-8").read() if os.path.exists(DESTINO) else ""
        if actual != texto:
            sys.exit("data/ajedrez-estudiantil.json no está al día: corre python3 herramientas/ajedrez-estudiantil.py")
        print("data/ajedrez-estudiantil.json al día")
        return
    with open(DESTINO, "w", encoding="utf-8") as f:
        f.write(texto)
    print(f"data/ajedrez-estudiantil.json: {texto.count('],[') + 1} torneos")


if __name__ == "__main__":
    main()
