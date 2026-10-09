#!/usr/bin/env python3
"""Lee de chess-results quién jugó cada torneo de ajedrez-estudiantil.html.

Con eso salen dos herramientas gratis: el historial de un jugador en los
juegos estudiantiles (historial-jugador.html) y las estadísticas por colegio y
región (estadisticas-colegios.html). Lo corre el flujo
.github/workflows/ajedrez-estudiantil.yml (desde una sesión de Claude Code no
hay salida a chess-results).

De cada torneo de herramientas/datos/ajedrez-estudiantil-torneos.csv:

  · individual: la clasificación (art=1): puesto, nombre, Elo, el
    «Club/Ciudad» (en los JDE es el colegio o la escuela; en un CODICADER, el
    país) y los puntos;
  · por equipos: la clasificación de los equipos (art=0) y la lista de sus
    jugadores con su equipo (art=16). NO art=4: trae solo a quien jugó.

Los puntos: si la tabla no trae «Pts.», son el desempate que la anotación de
abajo llama «points (game-points)» (en los JDE casi siempre es el primero).
Si no hay ninguno de los dos, quedan en blanco: no se adivina.

Guarda tres archivos en herramientas/datos/ (no se publican: .assetsignore):

  ajedrez-estudiantil-jugadores.csv  clave,puesto,nombre,institucion,elo,puntos
  ajedrez-estudiantil-equipos.csv    clave,puesto,equipo,puntos
  ajedrez-estudiantil-leidos.csv     clave,leido,jugadores,rondas,final

y vuelve a armar los JSON con herramientas/ajedrez-estudiantil.py.

Qué se lee en cada vuelta: primero los torneos que nunca se leyeron (los más
nuevos antes); después, los que cambiaron de inscritos o de rondas desde la
última lectura y los que todavía no terminaban, si empezaron hace menos de
60 días. Como mucho --maximo torneos por vuelta (100 por omisión), con un
segundo entre pedido y pedido: la primera lectura completa (unos mil
torneos) se reparte en varias vueltas en vez de pedirle mil quinientas
páginas seguidas a chess-results.

    python3 herramientas/ajedrez-estudiantil-jugadores.py [--maximo N] [--resumen archivo.md]

Ver «Historial del jugador y estadísticas por colegio» en
docs/decisiones/juegos-y-torneos.md.
"""
import csv
import datetime
import html
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
EQUIPOS = os.path.join(DATOS, "ajedrez-estudiantil-equipos.csv")
LEIDOS = os.path.join(DATOS, "ajedrez-estudiantil-leidos.csv")

COLUMNAS_JUGADORES = ["clave", "puesto", "nombre", "institucion", "elo", "puntos"]
COLUMNAS_EQUIPOS = ["clave", "puesto", "equipo", "puntos"]
COLUMNAS_LEIDOS = ["clave", "leido", "jugadores", "rondas", "final"]

AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
PAUSA = 1.0
DIAS_EN_JUEGO = 60


# ---------- Leer el HTML de chess-results ----------

def texto(c):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()


def balanceado(pagina, desde, etiqueta):
    """El contenido de una etiqueta hasta su cierre VERDADERO, contando las del
    mismo nombre que se abran adentro. Devuelve (contenido, fin)."""
    abre = re.compile(r"<" + etiqueta + r"(?:\s[^>]*)?>", re.I)
    cierra = re.compile(r"</" + etiqueta + r">", re.I)
    nivel, pos = 1, desde
    while True:
        a = abre.search(pagina, pos)
        c = cierra.search(pagina, pos)
        if not c:
            return pagina[desde:], len(pagina)
        if a and a.start() < c.start():
            nivel += 1
            pos = a.end()
        else:
            nivel -= 1
            if nivel == 0:
                return pagina[desde:c.start()], c.end()
            pos = c.end()


def de_primer_nivel(pagina, apertura, etiqueta):
    """[(etiqueta de apertura, contenido)] de las etiquetas de primer nivel."""
    fuera, desde = [], 0
    while True:
        m = apertura.search(pagina, desde)
        if not m:
            return fuera
        contenido, fin = balanceado(pagina, m.end(), etiqueta)
        fuera.append((m.group(0), contenido))
        desde = fin


def celdas(fila):
    fuera, desde = [], 0
    abre = re.compile(r"<t([dh])\b[^>]*>", re.I)
    while True:
        m = abre.search(fila, desde)
        if not m:
            return fuera
        contenido, fin = balanceado(fila, m.end(), "t" + m.group(1).lower())
        fuera.append(texto(contenido))
        desde = fin


def tablas(pagina):
    """Cada tabla CRs1 como (encabezado, filas). El encabezado es la primera
    fila: con clase CRg1b/CRng1b o, si no la trae, la que tiene <th>."""
    fuera = []
    for _, t in de_primer_nivel(pagina, re.compile(r'<table[^>]*class="CRs1"[^>]*>', re.I), "table"):
        encabezado, filas = None, []
        for apertura, f in de_primer_nivel(t, re.compile(r"<tr\b[^>]*>", re.I), "tr"):
            c = celdas(f)
            if encabezado is None and (re.search(r"\bCRn?g1b\b", apertura, re.I) or re.search(r"<th\b", f, re.I)):
                encabezado = c
            elif c:
                filas.append(c)
        fuera.append((encabezado, filas))
    return fuera


def columna(encabezado, *nombres):
    for i, c in enumerate(encabezado):
        if any(re.fullmatch(n, c, re.I) for n in nombres):
            return i
    return -1


def titulos(pagina):
    return [texto(m) for m in re.findall(r"<h2>(.*?)</h2>", pagina, re.S | re.I)]


def es_final(pagina):
    """¿La clasificación es la final? «Clasificación Final después de 5
    rondas» sí; «Clasificación después de la ronda 3», no. Un cuadro cruzado
    de equipos sin ronda («Cuadro cruzado por clasificación (Pts.)») cuenta
    como final si no dice «después de la ronda»."""
    for t in titulos(pagina)[1:]:
        if re.search(r"clasificaci[oó]n|ranking|cuadro cruzado", t, re.I):
            return bool(re.search(r"\bfinal\b", t, re.I)) or not re.search(r"despu[eé]s de la ronda", t, re.I)
    return False


def columna_de_puntos(pagina, encabezado):
    """La columna de los puntos: «Pts.» o el desempate que la anotación llama
    points (game-points) / puntos. -1 si no hay."""
    i = columna(encabezado, r"Pts\.?", r"Puntos", r"Points")
    if i >= 0:
        return i
    for n, que in re.findall(r"Desempate\s*(\d+)\s*:\s*([^<]+)", pagina, re.I):
        if re.match(r"\s*(points|puntos)\b", que, re.I) and "match" not in que.lower():
            return columna(encabezado, r"Des\.?\s*" + n, r"TB\s*" + n)
    return -1


def numero(t):
    t = (t or "").replace(",", ".").replace("½", ".5").strip()
    if t.startswith("."):
        t = "0" + t
    try:
        v = float(t)
    except ValueError:
        return ""
    return str(int(v)) if v == int(v) else str(v)


def elo(t):
    return t if t.isdigit() and t != "0" else ""


def leer_individual(pagina):
    """art=1: [{puesto, nombre, institucion, elo, puntos}]. Vacío si la página
    no trae la clasificación."""
    for enc, filas in tablas(pagina):
        if not enc:
            continue
        i_rk, i_nombre = columna(enc, r"Rk\.?"), columna(enc, r"Nombre", r"Name")
        if i_rk < 0 or i_nombre < 0:
            continue
        i_club = columna(enc, r"Club/Ciudad", r"Club/City", r"Club", r"Equipo", r"Team")
        i_elo = columna(enc, r"Elo", r"Rtg", r"ELO")
        i_pts = columna_de_puntos(pagina, enc)
        fuera = []
        for f in filas:
            if len(f) <= max(i_rk, i_nombre) or not f[i_nombre] or not f[i_rk].isdigit():
                continue
            fuera.append({
                "puesto": f[i_rk],
                "nombre": f[i_nombre],
                "institucion": f[i_club] if 0 <= i_club < len(f) else "",
                "elo": elo(f[i_elo]) if 0 <= i_elo < len(f) else "",
                "puntos": numero(f[i_pts]) if 0 <= i_pts < len(f) else "",
            })
        return fuera
    return []


def leer_equipos(pagina):
    """art=0 de un torneo por equipos: [{puesto, equipo, puntos}]."""
    for enc, filas in tablas(pagina):
        if not enc:
            continue
        i_rk, i_eq = columna(enc, r"Rk\.?"), columna(enc, r"Equipo", r"Team")
        if i_rk < 0 or i_eq < 0:
            continue
        i_pts = columna_de_puntos(pagina, enc)
        return [{"puesto": f[i_rk], "equipo": f[i_eq], "puntos": numero(f[i_pts]) if 0 <= i_pts < len(f) else ""}
                for f in filas if len(f) > max(i_rk, i_eq) and f[i_eq] and f[i_rk].isdigit()]
    return []


def leer_jugadores_de_equipos(pagina):
    """art=16: [{nombre, equipo, elo}] en el orden de su número inicial."""
    for enc, filas in tablas(pagina):
        if not enc:
            continue
        i_nombre, i_eq = columna(enc, r"Nombre", r"Name"), columna(enc, r"Equipo", r"Team")
        if i_nombre < 0 or i_eq < 0:
            continue
        i_elo = columna(enc, r"Elo", r"Rtg")
        return [{"nombre": f[i_nombre], "equipo": f[i_eq], "elo": elo(f[i_elo]) if 0 <= i_elo < len(f) else ""}
                for f in filas if len(f) > max(i_nombre, i_eq) and f[i_nombre]]
    return []


def leer_torneo(torneo, pedir):
    """Lee un torneo. `pedir(clave, art)` devuelve el HTML. Devuelve
    (jugadores, equipos, final)."""
    clave = torneo["clave"]
    if torneo["modalidad"] == "Equipos":
        portada = pedir(clave, 0)
        equipos = leer_equipos(portada)
        if equipos:
            puesto = {e["equipo"]: e["puesto"] for e in equipos}
            lista = leer_jugadores_de_equipos(pedir(clave, 16))
            jugadores = [{"puesto": puesto.get(j["equipo"], ""), "nombre": j["nombre"], "institucion": j["equipo"],
                          "elo": j["elo"], "puntos": ""} for j in lista]
            return jugadores, equipos, es_final(portada)
        # Mal clasificado como de equipos: se lee como individual.
    pagina = pedir(clave, 1)
    return leer_individual(pagina), [], es_final(pagina)


# ---------- Qué leer en esta vuelta ----------

def hoy_en_costa_rica():
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).date()


def por_leer(torneos, leidos, hoy, maximo):
    nunca = [t for t in torneos if t["clave"] not in leidos]
    nunca.sort(key=lambda t: t["inicio"], reverse=True)
    cambiados = []
    for t in torneos:
        l = leidos.get(t["clave"])
        if not l:
            continue
        cambio = l["jugadores"] != t["jugadores"] or l["rondas"] != t["rondas"]
        try:
            reciente = (hoy - datetime.date.fromisoformat(t["inicio"])).days <= DIAS_EN_JUEGO
        except ValueError:
            reciente = False
        if cambio or (l["final"] != "si" and reciente and l["leido"] != hoy.isoformat()):
            cambiados.append(t)
    return (nunca + cambiados)[:maximo]


def leer_csv(ruta, columnas):
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8", newline="") as f:
        filas = list(csv.DictReader(f))
    if filas and list(filas[0].keys()) != columnas:
        sys.exit(f"{os.path.relpath(ruta, RAIZ)}: columnas inesperadas")
    return filas


def escribir_csv(ruta, columnas, filas):
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columnas)
        w.writeheader()
        w.writerows(filas)


def orden(r):
    return (int(r["clave"]), int(r["puesto"]) if r["puesto"].isdigit() else 10**6)


def main():
    maximo = int(sys.argv[sys.argv.index("--maximo") + 1]) if "--maximo" in sys.argv else 100
    with open(TORNEOS, encoding="utf-8", newline="") as f:
        torneos = list(csv.DictReader(f))
    jugadores = leer_csv(JUGADORES, COLUMNAS_JUGADORES)
    equipos = leer_csv(EQUIPOS, COLUMNAS_EQUIPOS)
    leidos = {r["clave"]: r for r in leer_csv(LEIDOS, COLUMNAS_LEIDOS)}
    hoy = hoy_en_costa_rica()
    lista = por_leer(torneos, leidos, hoy, maximo)
    print(f"torneos por leer en esta vuelta: {len(lista)}")
    if not lista:
        return

    abridor = urllib.request.build_opener()
    abridor.addheaders = [("User-Agent", AGENTE)]

    def pedir(clave, art):
        url = f"https://chess-results.com/tnr{clave}.aspx?lan=2&art={art}&turdet=YES&zeilen=99999"
        for intento in range(3):
            time.sleep(PAUSA)
            try:
                with abridor.open(url, timeout=90) as r:
                    return r.read().decode("utf-8", "replace")
            except Exception as e:  # la red falla de vez en cuando: tres intentos y se rinde
                if intento == 2:
                    raise
                print(f"  reintento tras error: {e}")
                time.sleep(5 * (intento + 1))

    leidos_ahora, sin_datos, fallidos = [], [], []
    por_clave_j, por_clave_e = {}, {}
    for t in lista:
        try:
            js, es, final = leer_torneo(t, pedir)
        except Exception as e:  # un torneo que no carga no frena a los demás
            print(f"  {t['clave']}: no se pudo leer ({e})")
            fallidos.append(t)
            continue
        por_clave_j[t["clave"]] = [dict(r, clave=t["clave"]) for r in js]
        por_clave_e[t["clave"]] = [dict(r, clave=t["clave"]) for r in es]
        leidos[t["clave"]] = {"clave": t["clave"], "leido": hoy.isoformat(), "jugadores": t["jugadores"],
                              "rondas": t["rondas"], "final": "si" if final else "no"}
        (leidos_ahora if js else sin_datos).append(t)
        print(f"  {t['clave']}: {len(js)} jugadores, {len(es)} equipos{'' if final else ' (sin terminar)'}")

    jugadores = [r for r in jugadores if r["clave"] not in por_clave_j] + [r for v in por_clave_j.values() for r in v]
    equipos = [r for r in equipos if r["clave"] not in por_clave_e] + [r for v in por_clave_e.values() for r in v]
    jugadores.sort(key=orden)
    equipos.sort(key=orden)
    escribir_csv(JUGADORES, COLUMNAS_JUGADORES, jugadores)
    escribir_csv(EQUIPOS, COLUMNAS_EQUIPOS, equipos)
    escribir_csv(LEIDOS, COLUMNAS_LEIDOS, sorted(leidos.values(), key=lambda r: int(r["clave"])))
    subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil.py")], check=True)

    if "--resumen" in sys.argv:
        faltan = len(por_leer(torneos, leidos, hoy, 10**6))
        with open(sys.argv[sys.argv.index("--resumen") + 1], "a", encoding="utf-8") as f:
            f.write(f"\n**Jugadores:** se leyeron {len(leidos_ahora) + len(sin_datos)} torneo(s)"
                    f" ({len(sin_datos)} sin clasificación publicada, {len(fallidos)} que no cargaron);"
                    f" quedan {faltan} por leer.\n")


if __name__ == "__main__":
    main()
