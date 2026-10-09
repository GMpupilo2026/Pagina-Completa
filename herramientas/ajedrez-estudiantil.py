#!/usr/bin/env python3
"""Arma data/ajedrez-estudiantil.json, los datos de ajedrez-estudiantil.html.

La página muestra la participación en los torneos estudiantiles de Costa Rica
publicados en chess-results.com: los Juegos Deportivos Estudiantiles (JDE) del
MEP por etapa (institucional o circuital, regional, interregional y nacional),
los CODICADER y otros escolares internacionales. Cómo se buscaron y
clasificaron, en docs/decisiones/juegos-y-torneos.md («Ajedrez estudiantil en
Costa Rica: los torneos de chess-results»).

La fuente es herramientas/datos/ajedrez-estudiantil-torneos.csv: un torneo por
fila, ya clasificado. Este script no la vuelve a armar: la pone al día
herramientas/ajedrez-estudiantil-actualizar.py, que corre en GitHub Actions
cada seis horas. Este solo la pasa a lo que pide la página, sin el
organizador (a veces es el nombre de una persona y la página no lo usa) y con
las columnas que la página filtra.

Además arma data/ajedrez-estudiantil-jugadores.json, los datos del historial
de un jugador (historial-jugador.html) y de las estadísticas por colegio
(estadisticas-colegios.html), con lo que leyó de cada torneo
herramientas/ajedrez-estudiantil-jugadores.py. Ver «Historial del jugador y
estadísticas por colegio» en docs/decisiones/juegos-y-torneos.md.

    python3 herramientas/ajedrez-estudiantil.py              escribe los JSON
    python3 herramientas/ajedrez-estudiantil.py --comprobar  falla si no están al día
"""
import collections
import csv
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ajedrez_estudiantil_reglas import sin_tildes  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-torneos.csv")
DESTINO = os.path.join(RAIZ, "data", "ajedrez-estudiantil.json")
DATOS = os.path.join(RAIZ, "herramientas", "datos")
JUGADORES = os.path.join(DATOS, "ajedrez-estudiantil-jugadores.csv")
EQUIPOS = os.path.join(DATOS, "ajedrez-estudiantil-equipos.csv")
# Quien pidió que su nombre no salga: un nombre por línea, como lo escribe
# chess-results (da igual mayúsculas, tildes y la coma). Se quita de los
# historiales; su equipo sigue contando para su colegio.
EXCLUIDOS = os.path.join(DATOS, "ajedrez-estudiantil-excluidos.txt")
# Las variantes de un mismo colegio que la normalización no junta sola:
# «variante,nombre» (la variante, como la da chess-results).
INSTITUCIONES = os.path.join(DATOS, "ajedrez-estudiantil-instituciones.csv")
DESTINO_JUGADORES = os.path.join(RAIZ, "data", "ajedrez-estudiantil-jugadores.json")

# El último día en que cambió algo de chess-results: la página lo dice. Lo
# escribe herramientas/ajedrez-estudiantil-actualizar.py cuando suma o pone al
# día un torneo.
FECHA = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-actualizado.txt")

COLUMNAS = ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar",
            "region", "jugadores", "rondas", "modalidad", "ritmo"]
ETAPAS = {"Institucional o circuital", "Regional", "Interregional", "Nacional",
          "Internacional (CODICADER)", "Internacional federativo", "Otro estudiantil"}
JDE = {"Institucional o circuital", "Regional", "Interregional", "Nacional"}
CATEGORIAS = {"A", "B", "C", "D", "E", "Sin dato"}
NUMEROS = {"clave", "anio", "jugadores", "rondas"}


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
    with open(FECHA, encoding="utf-8") as f:
        actualizado = f.read().strip()
    datos = {"actualizado": actualizado, "columnas": COLUMNAS, "torneos": torneos}
    return json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n"


# ---------- Jugadores e instituciones ----------

def clave_de_persona(nombre):
    """Una persona es su nombre tal como lo da chess-results, sin tildes,
    mayúsculas, comas ni espacios de más: «SOLANO MORA, ANA LUCIA» y «Solano
    Mora, Ana Lucía» son la misma. Dos nombres escritos distinto quedan como
    dos personas, y dos personas con el mismo nombre, como una: la página lo
    dice."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9ñ ]", " ", sin_tildes(nombre).replace("ñ", "n"))).strip()


# Abreviaturas que se escriben de varias formas: «C.T.P.», «CTP», «Colegio
# Técnico Profesional» son lo mismo. Solo las seguras.
ABREVIATURAS = [
    (r"\bcolegio tecnico profesional\b", "ctp"), (r"\bc t p\b", "ctp"),
    (r"\bliceo rural\b", "lr"), (r"\bl r\b", "lr"),
    (r"\bcolegio cientifico\b", "cientifico"), (r"\bc c\b", "cientifico"),
    (r"\bunidad pedagogica\b", "up"), (r"\bu p\b", "up"),
    (r"\bescuela\b", "esc"), (r"\besc\b", "esc"),
    (r"\bsaint\b", "st"), (r"\bst\b", "st"),
]
# Lo que llega en la columna del colegio y no es un colegio.
NO_ES_INSTITUCION = re.compile(r"^(|crc|costa rica|cr|sin club|ninguno|n a|na|independiente|libre|x|0|\d+)$")


def clave_de_institucion(nombre):
    k = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", sin_tildes(nombre).replace("ñ", "n"))).strip()
    for patron, cambio in ABREVIATURAS:
        k = re.sub(patron, cambio, k)
    return k


def leer(ruta):
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


SIGLAS = {"ctp", "iegb", "up", "lr", "cit", "ipec", "cindea", "cna", "cedes", "ctp.", "c.t.p.", "ugb", "tec", "sjo"}
MINUSCULAS = {"de", "del", "la", "las", "los", "y", "e", "el"}


def bonito(variantes):
    """El nombre que se muestra: la variante más usada, prefiriendo la que no
    viene toda en mayúsculas; si todas lo están, con mayúscula inicial (y las
    siglas y los «de», «la» como van)."""
    cuenta = collections.Counter(variantes)
    mejor = max(cuenta, key=lambda v: (not v.isupper(), cuenta[v], v))
    if not mejor.isupper():
        return mejor
    palabras = []
    for i, p in enumerate(mejor.split()):
        b = p.lower()
        if b in SIGLAS or not re.search(r"[aeiouáéíóú]", b):
            palabras.append(p)
        elif i and b in MINUSCULAS:
            palabras.append(b)
        else:
            palabras.append(b[:1].upper() + b[1:])
    return " ".join(palabras)


# chess-results corta la columna del colegio a unas 35 letras: «Colegio
# Teresiano San Enrique de Os». Un nombre así de largo que es el comienzo de
# UNO SOLO de los otros es ese otro.
CORTADO = 30


def juntar_cortados(claves):
    fuera = {}
    largas = sorted(claves, key=len)
    for k in largas:
        if len(k) < CORTADO:
            continue
        candidatas = {o for o in largas if len(o) > len(k) and o.startswith(k)}
        if len(candidatas) == 1:
            fuera[k] = candidatas.pop()
    return fuera


def numero(t):
    if t in ("", None):
        return None
    v = float(t)
    return int(v) if v == int(v) else v


def armar_jugadores():
    with open(FUENTE, encoding="utf-8", newline="") as f:
        torneos = {r["clave"]: r for r in csv.DictReader(f)}
    excluidos = set()
    if os.path.exists(EXCLUIDOS):
        with open(EXCLUIDOS, encoding="utf-8") as f:
            excluidos = {clave_de_persona(l) for l in f if l.strip() and not l.lstrip().startswith("#")}
    alias = {clave_de_institucion(r["variante"]): r["nombre"] for r in leer(INSTITUCIONES)}
    filas_j = [r for r in leer(JUGADORES) if r["clave"] in torneos]   # un torneo que salió de la lista no cuenta
    filas_e = [r for r in leer(EQUIPOS) if r["clave"] in torneos]

    def clave_inst(nombre):
        k = clave_de_institucion(nombre)
        if NO_ES_INSTITUCION.match(k):
            return None, nombre
        if k in alias:
            nombre = alias[k]
            k = clave_de_institucion(nombre)
        return k, nombre.strip()

    todas = {clave_inst(r["institucion"])[0] for r in filas_j} | {clave_inst(r["equipo"])[0] for r in filas_e}
    cortados = juntar_cortados(todas - {None})

    personas, instituciones = {}, {}          # clave → (índice, [variantes])
    def indice(tabla, clave, variante, cuenta=True):
        if clave not in tabla:
            tabla[clave] = (len(tabla), [])
        if cuenta:
            tabla[clave][1].append(variante)
        return tabla[clave][0]

    def institucion(nombre):
        k, nombre = clave_inst(nombre)
        if k is None:
            return None
        return indice(instituciones, cortados.get(k, k), nombre, cuenta=k not in cortados)

    participaciones, equipos = [], []
    for r in filas_j:
        k = clave_de_persona(r["nombre"])
        if not k or k in excluidos:
            continue
        participaciones.append([int(r["clave"]), indice(personas, k, r["nombre"].strip()),
                                institucion(r["institucion"]), numero(r["puesto"]), numero(r["puntos"]), numero(r["elo"])])
    for r in filas_e:
        equipos.append([int(r["clave"]), institucion(r["equipo"]), numero(r["puesto"]), numero(r["puntos"])])

    def nombres(tabla):
        fuera = [None] * len(tabla)
        for clave, (i, variantes) in tabla.items():
            fuera[i] = [bonito(variantes) if variantes else clave, clave]
        return fuera

    with open(FECHA, encoding="utf-8") as f:
        actualizado = f.read().strip()
    datos = {
        "actualizado": actualizado,
        "jugadores": nombres(personas),
        "instituciones": nombres(instituciones),
        "columnas_participaciones": ["clave", "jugador", "institucion", "puesto", "puntos", "elo"],
        "participaciones": participaciones,
        "columnas_equipos": ["clave", "institucion", "puesto", "puntos"],
        "equipos": equipos,
    }
    return json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
    salidas = [(DESTINO, armar()), (DESTINO_JUGADORES, armar_jugadores())]
    if "--comprobar" in sys.argv:
        for destino, texto in salidas:
            actual = open(destino, encoding="utf-8").read() if os.path.exists(destino) else ""
            if actual != texto:
                sys.exit(f"{os.path.relpath(destino, RAIZ)} no está al día: corre python3 herramientas/ajedrez-estudiantil.py")
        print("data/ajedrez-estudiantil.json y data/ajedrez-estudiantil-jugadores.json al día")
        return
    for destino, texto in salidas:
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
    print(f"data/ajedrez-estudiantil.json: {salidas[0][1].count('],[') + 1} torneos")
    j = json.loads(salidas[1][1])
    print(f"data/ajedrez-estudiantil-jugadores.json: {len(j['jugadores'])} jugadores, "
          f"{len(j['instituciones'])} instituciones, {len(j['participaciones'])} participaciones")


if __name__ == "__main__":
    main()
