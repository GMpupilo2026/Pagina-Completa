#!/usr/bin/env python3
"""Arma data/oscar-angulo-torneos.json, los datos de oscar-angulo-torneos.html.

La página junta todos los torneos de chess-results.com en que Oscar Angulo
Cubero (ID FIDE 6501435) figura como director del torneo, organizador, árbitro
principal, árbitro adjunto principal o árbitro. Cómo se buscaron, en
docs/decisiones/juegos-y-torneos.md («Los torneos de Oscar Angulo en
chess-results»).

La fuente es herramientas/datos/oscar-angulo-torneos.csv: un torneo por fila,
tal como lo da el buscador de chess-results (las celdas de los árbitros y del
director, solo si nombran a un «Angulo»: las demás traen nombres de otras
personas que la página no usa). Este script decide, con las reglas de abajo,
en qué rol figura él en cada torneo, con qué forma del nombre y qué título
usó, y lo pasa a lo que pide la página.

    python3 herramientas/oscar-angulo-torneos.py              escribe el JSON
    python3 herramientas/oscar-angulo-torneos.py --comprobar  falla si no está al día
"""
import collections
import csv
import json
import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-torneos.csv")
ESTUDIANTILES = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-torneos.csv")
FECHA = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-actualizado.txt")
DESTINO = os.path.join(RAIZ, "data", "oscar-angulo-torneos.json")

ID_FIDE = "6501435"

# Las columnas del buscador de chess-results que dicen quién hizo qué, con el
# nombre que les da la página. El orden es el de importancia: el «rol
# principal» de un torneo es el primero en que figura.
ROLES = [
    ("arbitro_principal", "ap", "Árbitro principal"),
    ("director", "dir", "Director del torneo"),
    ("arbitro_adjunto", "adj", "Árbitro adjunto principal"),
    ("arbitros", "arb", "Árbitro"),
    ("organizador", "org", "Organizador"),
]

# Una celda lo nombra a él si trae su ID FIDE, sus dos apellidos o «Oscar» y
# «Angulo» juntos, en cualquier orden («Angulo Cubero, Oscar», «Angulo
# Oscar», «IOscar Angulo», «Óscar Ángulo»…). Se compara sin tildes ni
# mayúsculas. «AnguloChess» y «Angulo Chess» son su organización: en los seis
# torneos que la nombran él es también el árbitro principal o el director.
ES_EL = re.compile(r"6501435|angulo cubero|oscar angulo|angulo,? *(?:ia|fa|af|an|na|ai)?\.? *oscar|angulo ?chess")

# Torneos que la búsqueda trae pero que no son de él, con la razón.
NO_SON_DE_EL = {
    # Juegos Intercolegiados de Montería (Colombia), agosto de 2022: el árbitro
    # es «Oscar Angulo», sin segundo apellido ni ID FIDE, en torneos de la
    # Alcaldía de Montería. Es otra persona.
    "670624", "670625", "670627", "670634", "670635", "670827",
    "671087", "671279", "671427", "671449", "671492",
}

# chess-results subió dos veces el mismo torneo (mismo nombre, fechas e
# inscritos): queda el último, como en Ajedrez estudiantil.
REPETIDOS = {"447139": "489491"}  # 3er La Vega International Chess Open 2019

# La federación que dice chess-results no siempre es el país: el torneo del
# 14/11/2015 se jugó en Escazú, con la federación sin poner (ZZZ).
FEDERACION_CORREGIDA = {"195265": "CRC"}

PAISES = {
    "CRC": "Costa Rica", "HON": "Honduras", "CUB": "Cuba", "DOM": "República Dominicana",
    "ESA": "El Salvador", "PAN": "Panamá", "GUA": "Guatemala", "NCA": "Nicaragua",
    "MEX": "México", "COL": "Colombia", "USA": "Estados Unidos",
}

# Los títulos de árbitro, como los escribe la gente en inglés o en español.
TITULOS = {"ia": "IA", "ai": "IA", "fa": "FA", "af": "FA", "na": "AN", "an": "AN"}
NOMBRE_TITULO = {"IA": "Árbitro Internacional (IA)", "FA": "Árbitro FIDE (FA)", "AN": "Árbitro Nacional (AN)"}


def sin_tildes(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def normal(texto):
    return re.sub(r"\s+", " ", sin_tildes(texto).lower()).strip()


def lo_nombra(celda):
    return bool(ES_EL.search(normal(celda)))


def su_parte(celda):
    """De una celda con varias personas («Ordonez Chacon, Guillermo 6503128; IA
    Angulo Cubero, Oscar 6501435; …»), solo lo que lo nombra a él."""
    for trozo in re.split(r";|\s[-–/]\s|\s+y\s+", celda):
        if not lo_nombra(trozo) and "angulo" not in normal(trozo):
            continue
        piezas = [p.strip() for p in trozo.split(",")]
        for i, p in enumerate(piezas):
            n = normal(p)
            if "angulo" not in n:
                continue
            # «Angulo Cubero, Oscar 6501435»: el nombre va en la pieza siguiente.
            if "oscar" not in n and i + 1 < len(piezas) and "oscar" in normal(piezas[i + 1]):
                return f"{p}, {piezas[i + 1]}"
            return p
        return trozo.strip()
    return celda.strip()


def titulo_de(parte):
    """El título de árbitro que acompaña su nombre: «IA Oscar Angulo», «Angulo
    Cubero, IA Oscar», «6501435 Angulo Cubero, Oscar FA», «IOscar Angulo»."""
    n = normal(parte).replace(".", " ")
    n = re.sub(r"\s+", " ", n)
    m = (re.match(r"\(?(ia|ai|fa|af|na|an)\)? ", n)
         or re.search(r", (ia|ai|fa|af|na|an) oscar", n)
         or re.search(r"oscar (ia|ai|fa|af|na|an)\b", n)
         or re.search(r"\b(ia|ai|fa|af|na|an) (?:oscar angulo|angulo cubero)", n))
    if m:
        return TITULOS[m.group(1)]
    if n.startswith("ioscar"):
        return "IA"
    return ""


def forma_de(parte):
    """La forma del nombre sin título ni ID: «Oscar Angulo Cubero», «Angulo
    Cubero, Oscar», «Oscar Angulo», «Oscar Angulo C»…"""
    t = re.sub(r"\(?\b(?:ID|FIDE)\b[\s:.-]*\d*\)?|\(\s*\d+\s*\)|\b\d{5,}\b", " ", parte, flags=re.I)
    t = re.sub(r"^\s*\(?(?:I\.?A|A\.?I|F\.?A|A\.?F|N\.?A|A\.?N)\.?\)?\s+", "", t)
    t = re.sub(r",\s*(?:IA|AI|FA|AF|NA|AN)\.?\s+", ", ", t)
    t = re.sub(r"\s+(?:IA|AI|FA|AF|NA|AN)\.?\s*$", "", t)
    t = re.sub(r"^IOscar", "Oscar", t)
    t = re.sub(r"[()]", " ", t)
    t = re.sub(r"\s+,", ",", re.sub(r"\s+", " ", t)).strip(" ,.")
    if t.isupper():
        t = t.title()
    return t


def ritmo_de(nombre, texto):
    """Clásico, rápido o blitz. Primero lo que dice el nombre; si no, el
    control de tiempo: base en minutos más el incremento por 60 jugadas (la
    regla de FIDE: blitz hasta 10 minutos, rápido hasta 60, clásico desde 60)."""
    n = normal(nombre)
    if re.search(r"\bblitz\b|relampago|bala\b", n):
        return "Blitz"
    if re.search(r"\brapid|\brapido|activo\b", n):
        return "Rápido"
    t = normal(texto).replace(",", ".")
    if re.fullmatch(r"(clasico|standard)\.?", t):
        return "Clásico"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(h(?:ora)?s?\b|min|m\b|'|minutos|minutes)?", t)
    if not m:
        return "Sin dato"
    base = float(m.group(1))
    if m.group(2) and m.group(2).startswith("h"):
        base *= 60
    resto = t[m.end():]
    inc = re.search(r"(?:\+|mas|con incremento de|with)\s*(\d+)", resto)
    total = base + (int(inc.group(1)) if inc else 0)
    if base <= 0 or base > 240:
        return "Sin dato"
    if total <= 10:
        return "Blitz"
    if total < 60:
        return "Rápido"
    return "Clásico"


def tipo_de(clave, nombre, federacion, estudiantiles):
    n = normal(nombre)
    if clave in estudiantiles or re.search(r"\bjde\b|estudiantil|codicader|intercolegial|colegial", n):
        return "Juegos estudiantiles"
    if re.search(r"\bjdn\b|juegos deportivos nacionales|juegos nacionales", n):
        return "Juegos Deportivos Nacionales"
    if federacion != "CRC" or re.search(r"internacional|international|centroamerican|panamerican|festival|caribe|olimpiad", n):
        return "Internacional"
    if re.search(r"nacional|national", n):
        return "Campeonatos nacionales"
    return "Abiertos, clubes y otros"


def modalidad_de(nombre):
    return "Equipos" if re.search(r"equipo|teams?\b|por clubes|\bliga\b", normal(nombre)) else "Individual"


def anio_de(fila):
    """El año del inicio; si chess-results no tiene la fecha («unknown»), el
    que diga el nombre."""
    if re.match(r"\d{4}-", fila["inicio"]):
        return int(fila["inicio"][:4]), False
    m = re.search(r"\b(20[0-3]\d)\b", fila["nombre"])
    return (int(m.group(1)), False) if m else (None, True)


def numero(texto):
    return int(texto) if texto.isdigit() else 0


def armar():
    with open(FUENTE, encoding="utf-8", newline="") as f:
        filas = list(csv.DictReader(f))
    with open(ESTUDIANTILES, encoding="utf-8", newline="") as f:
        estudiantiles = {r["clave"] for r in csv.DictReader(f)}
    claves = [r["clave"] for r in filas]
    repetida = [c for c, n in collections.Counter(claves).items() if n > 1]
    if repetida:
        raise SystemExit(f"{os.path.relpath(FUENTE, RAIZ)}: claves repetidas: {repetida}")
    # Un año para los que no lo tienen: el del torneo de clave más cercana
    # (chess-results numera los torneos en el orden en que se crean).
    con_anio = sorted((int(r["clave"]), anio_de(r)[0]) for r in filas if anio_de(r)[0])
    torneos, variantes = [], collections.defaultdict(lambda: {"n": 0, "ejemplos": collections.Counter()})
    for i, r in enumerate(filas, start=2):
        donde = f"{os.path.relpath(FUENTE, RAIZ)}, fila {i} (torneo {r['clave']})"
        if r["clave"] in NO_SON_DE_EL or r["clave"] in REPETIDOS:
            continue
        roles, partes = [], []
        for columna, codigo, _ in ROLES:
            if lo_nombra(r[columna]):
                roles.append(codigo)
                partes.append(su_parte(r[columna]))
        if not roles:
            raise SystemExit(f"{donde}: ninguna celda lo nombra. ¿Cambió la regla ES_EL?")
        # La forma del nombre y el título salen de su mención como persona (un
        # organizador como «AnguloChess» no es una forma de su nombre).
        personas = [p for p in partes if "chess" not in normal(p)]
        titulo = next((titulo_de(p) for p in personas if titulo_de(p)), "")
        formas = sorted({forma_de(p) for p in personas})
        for p in personas:
            v = variantes[forma_de(p)]
            v["n"] += 1
            v["ejemplos"][re.sub(r"\s+", " ", p)] += 1
        anio, aproximado = anio_de(r)
        if anio is None:
            clave = int(r["clave"])
            anio = min(con_anio, key=lambda x: abs(x[0] - clave))[1]
        federacion = FEDERACION_CORREGIDA.get(r["clave"], r["fed"])
        torneos.append({
            "clave": int(r["clave"]),
            "nombre": r["nombre"],
            "inicio": r["inicio"] if re.match(r"\d{4}-\d\d-\d\d$", r["inicio"]) else "",
            "fin": r["fin"] if re.match(r"\d{4}-\d\d-\d\d$", r["fin"]) else "",
            "anio": anio,
            "anioAprox": aproximado,
            "federacion": federacion,
            "pais": PAISES.get(federacion, "Sin dato"),
            "lugar": r["lugar"],
            "roles": roles,
            "titulo": titulo,
            "formas": formas,
            "tipo": tipo_de(r["clave"], r["nombre"], federacion, estudiantiles),
            "ritmo": ritmo_de(r["nombre"], r["ritmo"]),
            "modalidad": modalidad_de(r["nombre"]),
            "rondas": numero(r["rondas"]),
            "jugadores": numero(r["jugadores"]),
        })
    torneos.sort(key=lambda t: (t["inicio"] or f"{t['anio']}-00-00", t["clave"]), reverse=True)
    lista_variantes = sorted(
        ({"forma": k, "veces": v["n"], "comoAparece": [e for e, _ in v["ejemplos"].most_common(4)]}
         for k, v in variantes.items()),
        key=lambda v: (-v["veces"], v["forma"]))
    with open(FECHA, encoding="utf-8") as f:
        actualizado = f.read().strip()
    return {
        "actualizado": actualizado,
        "idFide": ID_FIDE,
        "roles": [{"codigo": c, "nombre": n} for _, c, n in ROLES],
        "titulos": NOMBRE_TITULO,
        "variantes": lista_variantes,
        "torneos": torneos,
    }


def texto(datos):
    return json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
    datos = armar()
    nuevo = texto(datos)
    if "--comprobar" in sys.argv:
        viejo = open(DESTINO, encoding="utf-8").read() if os.path.exists(DESTINO) else ""
        if viejo != nuevo:
            raise SystemExit(f"{os.path.relpath(DESTINO, RAIZ)} no está al día: python3 herramientas/oscar-angulo-torneos.py")
        print(f"{os.path.relpath(DESTINO, RAIZ)} al día: {len(datos['torneos'])} torneos.")
        return
    with open(DESTINO, "w", encoding="utf-8") as f:
        f.write(nuevo)
    print(f"{os.path.relpath(DESTINO, RAIZ)}: {len(datos['torneos'])} torneos, {len(datos['variantes'])} formas del nombre.")


if __name__ == "__main__":
    main()
