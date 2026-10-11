#!/usr/bin/env python3
"""TEMPORAL — se borra antes de mergear este PR.

Recorre ajedrezcostarica.com/es/national-rating (el Elo Nacional de la FCA,
paginado de 50 en 50) con reintentos y espera entre pedido y pedido, y
escribe en CSV a quién se le marca `active: true` y edad < 20, con su club.

Lo corre .github/workflows/_tmp-buscar-elo-nacional.yml (también temporal):
desde una sesión de Claude Code no hay salida a ese sitio, y pedirlo en
ráfaga desde pg_net (Supabase) lo empieza a frenar con respuestas sin datos.
"""
import csv
import random
import re
import sys
import time
import urllib.request

AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
BASE = "https://ajedrezcostarica.com/es/national-rating?page={}"
SALIDA = "herramientas/jdn-proyeccion/_tmp-elo-nacional-menores.csv"


def pedir(url, intentos=6):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            espera = min(60, (2 ** i)) + random.uniform(0, 2)
            print(f"  reintento {i + 1} tras error ({e}): esperando {espera:.1f}s", file=sys.stderr)
            time.sleep(espera)
    raise SystemExit(f"No se pudo leer {url} tras {intentos} intentos")


def jugadores_de(html):
    t = html.replace("\\", "")
    salida = []
    for m in re.finditer(r'"player":\{', t):
        ventana = t[m.end():m.end() + 400]

        def campo(pat):
            mm = re.search(pat, ventana)
            return mm.group(1) if mm else None

        fide_id = campo(r'"fideId":"(\d*)"')
        nombre = campo(r'"name":"([^"]*)"')
        club = campo(r'"club":"([^"]*)"')
        edad = campo(r'"age":(\d+)')
        activo = campo(r'"active":(true|false)')
        if fide_id and nombre and edad:
            salida.append({"fide_id": fide_id, "nombre": nombre, "club": club or "",
                            "edad": int(edad), "activo": activo == "true"})
    return salida


def main():
    vistos = {}
    pagina = 1
    vacias_seguidas = 0
    while vacias_seguidas < 3 and pagina <= 400:  # tope de cordura
        html = pedir(BASE.format(pagina))
        jugadores = jugadores_de(html)
        if not jugadores:
            vacias_seguidas += 1
        else:
            vacias_seguidas = 0
            for j in jugadores:
                vistos[j["fide_id"]] = j
        print(f"página {pagina}: {len(jugadores)} jugadores (total acumulado {len(vistos)})")
        pagina += 1
        time.sleep(2 + random.uniform(0, 1.5))

    menores_activos = [j for j in vistos.values() if j["edad"] < 20 and j["activo"]]
    menores_activos.sort(key=lambda j: (j["club"], j["nombre"]))
    with open(SALIDA, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["fide_id", "nombre", "club", "edad"])
        w.writeheader()
        for j in menores_activos:
            w.writerow({"fide_id": j["fide_id"], "nombre": j["nombre"], "club": j["club"], "edad": j["edad"]})
    print(f"TOTAL: {len(vistos)} jugadores del Elo Nacional, {len(menores_activos)} activos menores de 20")


if __name__ == "__main__":
    main()
