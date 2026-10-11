#!/usr/bin/env python3
"""Lee de chess-results, ronda a ronda, las partidas de los torneos
INDIVIDUALES de 2024 en adelante: contra quién jugó cada estudiante, con qué
color y el resultado. Se agrega a la ficha de cada torneo en el historial de
un jugador (historial-jugador.html).

Por qué solo individuales de 2024 en adelante: un torneo por equipos reparte
sus partidas por tablero dentro de un duelo entre equipos, una estructura
distinta que este script no lee. Y traer esto de TODOS los torneos desde 2011
le pediría a chess-results una página por cada JUGADOR de cada torneo, no una
por torneo como el resto de este sitio (unas 5300 nada más que para los
individuales de 2024 en adelante) — se acota a eso y se reparte en el tiempo
con --maximo, igual que el resto del sitio.

Lo corre el flujo .github/workflows/ajedrez-estudiantil.yml, después de
herramientas/ajedrez-estudiantil-jugadores.py (del que reusa, por
importlib, las funciones de lectura de tablas: no hay que mantenerlas dos
veces).

Dos pasos, los dos cuentan para --maximo pedidos por vuelta:

  1. Si un torneo individual de 2024+ todavía no tiene el «snr» (No.Ini., el
     número con que arrancó cada jugador) — ajedrez-estudiantil-jugadores.py
     lo guarda desde que existe esta columna, pero los torneos que ya se
     habían leído antes no lo tienen — se vuelve a pedir su clasificación
     (art=1) una sola vez para completarlo en todos sus jugadores de una vez.
  2. Por cada (torneo, jugador) con snr que todavía no se leyó, se pide
     tnr<clave>.aspx?art=9&snr=<snr>&turdet=YES: la tabla «Rd./M./No.Ini./
     Nombre/Elo/FED/Club/Ciudad/Pts./Res.» de ESE jugador, una fila por ronda
     (la misma página que ya usa, para un jugador puntual, el panel de
     administración — supabase/functions/chess-results-proxy/index.ts).

     El color (blancas/negras) sale de un <div class="FarbewT"/"FarbesT">
     DENTRO de la celda del resultado; cuando no está (una ronda sin
     emparejar o ganada/perdida por incomparecencia, se comprobó con una
     página real) el color queda «desconocido» y el resultado es el texto
     tal cual lo escribe chess-results, sin interpretarlo. Una ronda sin
     rival real («sin emparejar», un bye) no se guarda como partida: no hubo
     nadie contra quien jugar.

Guarda en herramientas/datos/ (no se publican: .assetsignore):

  ajedrez-estudiantil-jugadores.csv        (le completa la columna «snr»)
  ajedrez-estudiantil-partidas.csv         clave,snr,ronda,mesa,color,resultado,
                                            rival_snr,rival_nombre,rival_institucion,rival_elo
  ajedrez-estudiantil-partidas-leidas.csv  clave,snr   (ya se le pidieron sus partidas;
                                            no se vuelve a pedir aunque el torneo cambie)

y vuelve a armar los JSON con herramientas/ajedrez-estudiantil.py.

    python3 herramientas/ajedrez-estudiantil-partidas.py [--maximo N] [--resumen archivo.md]

Ver «Historial del jugador y estadísticas por colegio» en
docs/decisiones/juegos-y-torneos.md.
"""
import csv
import importlib.util
import os
import re
import subprocess
import sys
import time
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "herramientas", "datos")
TORNEOS = os.path.join(DATOS, "ajedrez-estudiantil-torneos.csv")
JUGADORES = os.path.join(DATOS, "ajedrez-estudiantil-jugadores.csv")
PARTIDAS = os.path.join(DATOS, "ajedrez-estudiantil-partidas.csv")
LEIDAS = os.path.join(DATOS, "ajedrez-estudiantil-partidas-leidas.csv")

COLUMNAS_PARTIDAS = ["clave", "snr", "ronda", "mesa", "color", "resultado",
                      "rival_snr", "rival_nombre", "rival_institucion", "rival_elo"]
COLUMNAS_LEIDAS = ["clave", "snr"]
DESDE_ANIO = 2024

_spec = importlib.util.spec_from_file_location("ajedrez_estudiantil_jugadores_lector",
                                                os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil-jugadores.py"))
jug = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(jug)


# ---------- Leer la tabla de rondas (art=9&snr=N) ----------

def celdas_crudas(fila):
    """Como jug.celdas(), pero sin pasar cada celda por jug.texto(): la celda
    «Res.» trae un <div class="FarbewT"/"FarbesT"> que texto() borraría antes
    de poder leer el color."""
    fuera, desde = [], 0
    abre = re.compile(r"<t([dh])\b[^>]*>", re.I)
    while True:
        m = abre.search(fila, desde)
        if not m:
            return fuera
        contenido, fin = jug.balanceado(fila, m.end(), "t" + m.group(1).lower())
        fuera.append(contenido)
        desde = fin


COLUMNAS_RONDA = {
    "ronda": (r"Rd\.?",), "mesa": (r"M\.?",), "rival_snr": (r"No\.Ini\.?",),
    "rival_nombre": (r"Nombre", r"Name"), "rival_elo": (r"Elo", r"Rtg"),
    "rival_institucion": (r"Club/Ciudad", r"Club/City", r"Club", r"Equipo", r"Team"),
    "resultado": (r"Res\.?", r"Result"),
}


def indexar_encabezado(celdas_texto):
    idx = {}
    for campo, patrones in COLUMNAS_RONDA.items():
        i = jug.columna(celdas_texto, *patrones)
        if i >= 0:
            idx[campo] = i
    return idx


COLOR_RE = re.compile(r"Farbe(w|s)T", re.I)


def fila_de_ronda(crudas, idx):
    def cruda(campo):
        i = idx.get(campo)
        return crudas[i] if i is not None and i < len(crudas) else ""

    res_crudo = cruda("resultado")
    m = COLOR_RE.search(res_crudo)
    color = {"w": "blancas", "s": "negras"}[m.group(1).lower()] if m else "desconocido"
    elo_rival = jug.texto(cruda("rival_elo"))
    return {
        "ronda": jug.texto(cruda("ronda")),
        "mesa": jug.texto(cruda("mesa")),
        "rival_snr": jug.texto(cruda("rival_snr")),
        "rival_nombre": jug.texto(cruda("rival_nombre")),
        "rival_institucion": jug.texto(cruda("rival_institucion")),
        "rival_elo": jug.elo(elo_rival),
        "color": color,
        "resultado": jug.texto(res_crudo).strip(),
    }


def leer_partidas_jugador(pagina):
    """[{ronda, mesa, rival_snr, rival_nombre, rival_institucion, rival_elo,
    color, resultado}] de la tabla de rondas de art=9&snr=N&turdet=YES. []
    si la página no la trae (snr inválido, o un torneo tan viejo que pide
    tocar «Mostrar detalles del torneo» incluso con turdet=YES)."""
    for _, contenido in jug.de_primer_nivel(pagina, re.compile(r'<table[^>]*class="CRs1"[^>]*>', re.I), "table"):
        idx, filas_crudas = None, []
        for apertura, f in jug.de_primer_nivel(contenido, re.compile(r"<tr\b[^>]*>", re.I), "tr"):
            crudas = celdas_crudas(f)
            if not crudas:
                continue
            if idx is None and (re.search(r"\bCRn?g1b\b", apertura, re.I) or re.search(r"<th\b", f, re.I)):
                idx = indexar_encabezado([jug.texto(c) for c in crudas])
                continue
            if idx is not None:
                filas_crudas.append(crudas)
        if idx is None or "resultado" not in idx or "rival_nombre" not in idx:
            continue  # no es la tabla de rondas (es la de resumen, u otra)
        return [fila_de_ronda(c, idx) for c in filas_crudas]
    return []


def es_partida_real(fila):
    """Una ronda sin emparejar (bye) no tiene con quién jugó."""
    snr = fila["rival_snr"]
    if not re.fullmatch(r"-?\d+", snr or "") or int(snr) <= 0:
        return False
    return bool(fila["rival_nombre"]) and fila["rival_nombre"].strip().lower() != "sin emparejar"


# ---------- Pedir las páginas ----------

def elegible(r, torneos):
    t = torneos.get(r["clave"])
    return bool(t) and t["modalidad"] == "Individual" and t["anio"].isdigit() and int(t["anio"]) >= DESDE_ANIO


def procesar(torneos, jugadores, leidas, maximo, pedir):
    """El trabajo de una vuelta, sin tocar disco ni la red: `pedir(clave, art,
    snr=None)` da el HTML (así se prueba sin salir a chess-results). Modifica
    `jugadores` en el lugar (les completa el «snr») y devuelve
    (completados, leidas_ahora, nuevas, fallidos, pedidos)."""
    pedidos = 0

    # 1. Completar el «snr» de los torneos leídos antes de que existiera esa columna.
    faltan = sorted({r["clave"] for r in jugadores if elegible(r, torneos) and not r["snr"]},
                     key=lambda c: torneos[c]["inicio"], reverse=True)
    completados = []
    for clave in faltan:
        if pedidos >= maximo:
            break
        try:
            pagina = pedir(clave, 1)
        except Exception as e:
            print(f"  {clave}: no se pudo completar el snr ({e})")
            continue
        pedidos += 1
        por_nombre = {j["nombre"]: j["snr"] for j in jug.leer_individual(pagina) if j["snr"]}
        cambiados = 0
        for r in jugadores:
            if r["clave"] == clave and not r["snr"] and r["nombre"] in por_nombre:
                r["snr"] = por_nombre[r["nombre"]]
                cambiados += 1
        if cambiados:
            completados.append(clave)
        print(f"  {clave}: snr completado para {cambiados} jugador(es)")

    # 2. Las partidas de cada (torneo, jugador) con snr que falte leer.
    pendientes = [r for r in jugadores if elegible(r, torneos) and r["snr"] and (r["clave"], r["snr"]) not in leidas]
    pendientes.sort(key=lambda r: torneos[r["clave"]]["inicio"], reverse=True)

    leidas_ahora, nuevas, fallidos = [], [], []
    for r in pendientes:
        if pedidos >= maximo:
            break
        try:
            pagina = pedir(r["clave"], 9, r["snr"])
        except Exception as e:
            print(f"  {r['clave']} snr {r['snr']}: no se pudo leer ({e})")
            fallidos.append(r)
            continue
        pedidos += 1
        rondas = [f for f in leer_partidas_jugador(pagina) if es_partida_real(f)]
        for f in rondas:
            nuevas.append({"clave": r["clave"], "snr": r["snr"], "ronda": f["ronda"], "mesa": f["mesa"],
                            "color": f["color"], "resultado": f["resultado"], "rival_snr": f["rival_snr"],
                            "rival_nombre": f["rival_nombre"], "rival_institucion": f["rival_institucion"],
                            "rival_elo": f["rival_elo"]})
        leidas_ahora.append((r["clave"], r["snr"]))
        print(f"  {r['clave']} snr {r['snr']} ({r['nombre']}): {len(rondas)} partida(s)")

    return completados, leidas_ahora, nuevas, fallidos, pedidos


def pedir_red(abridor, clave, art, snr=None):
    extra = f"&snr={snr}" if snr is not None else ""
    url = f"https://chess-results.com/tnr{clave}.aspx?lan=2&art={art}{extra}&turdet=YES&zeilen=99999"
    for intento in range(3):
        time.sleep(jug.PAUSA)
        try:
            with abridor.open(url, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # la red falla de vez en cuando: tres intentos y se rinde
            if intento == 2:
                raise
            print(f"  reintento tras error: {e}")
            time.sleep(5 * (intento + 1))


def main():
    maximo = int(sys.argv[sys.argv.index("--maximo") + 1]) if "--maximo" in sys.argv else 100
    with open(TORNEOS, encoding="utf-8", newline="") as f:
        torneos = {r["clave"]: r for r in csv.DictReader(f)}
    jugadores = jug.leer_csv(JUGADORES, jug.COLUMNAS_JUGADORES)
    leidas = {(r["clave"], r["snr"]) for r in jug.leer_csv(LEIDAS, COLUMNAS_LEIDAS)}
    partidas = jug.leer_csv(PARTIDAS, COLUMNAS_PARTIDAS)

    abridor = urllib.request.build_opener()
    abridor.addheaders = [("User-Agent", jug.AGENTE)]
    completados, leidas_ahora, nuevas, fallidos, _ = procesar(
        torneos, jugadores, leidas, maximo, lambda clave, art, snr=None: pedir_red(abridor, clave, art, snr))

    leidas_fin = leidas | set(leidas_ahora)
    if completados:
        jug.escribir_csv(JUGADORES, jug.COLUMNAS_JUGADORES, jugadores)
    if nuevas or leidas_ahora:
        partidas = partidas + nuevas
        partidas.sort(key=lambda r: (int(r["clave"]), int(r["snr"]), int(r["ronda"]) if r["ronda"].isdigit() else 0))
        jug.escribir_csv(PARTIDAS, COLUMNAS_PARTIDAS, partidas)
        jug.escribir_csv(LEIDAS, COLUMNAS_LEIDAS,
                          [{"clave": c, "snr": s} for c, s in sorted(leidas_fin, key=lambda t: (int(t[0]), int(t[1])))])
        subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil.py")], check=True)

    if "--resumen" in sys.argv:
        faltan_total = len({(r["clave"], r["snr"]) for r in jugadores if elegible(r, torneos) and r["snr"]} - leidas_fin)
        with open(sys.argv[sys.argv.index("--resumen") + 1], "a", encoding="utf-8") as f:
            f.write(f"\n**Partidas:** se completó el snr de {len(completados)} torneo(s) y se leyeron las partidas de "
                    f"{len(leidas_ahora)} jugador(es) ({len(fallidos)} que no cargaron); quedan {faltan_total} por leer.\n")


if __name__ == "__main__":
    main()
