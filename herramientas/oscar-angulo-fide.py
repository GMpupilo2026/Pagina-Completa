#!/usr/bin/env python3
"""Arma data/oscar-angulo-fide.json, los datos de oscar-angulo-fide.html.

La página muestra los torneos valorados por FIDE en que Oscar Angulo Cubero
(ID FIDE 6501435) figura en su perfil de ratings.fide.com como árbitro
principal, adjunto principal, árbitro u organizador, y cuáles de ellos
cumplen las condiciones de un torneo para una norma de Árbitro FIDE (AF) y
de Árbitro Internacional (AI) según el reglamento FIDE B.06.1 vigente desde
el 1 de marzo de 2026. Él ya tiene los dos títulos (AF en 2016, AI en 2020):
la página dice qué torneos valdrían hoy, no los que usó.

La fuente es herramientas/datos/oscar-angulo-fide.json: lo que se leyó de
FIDE de cada torneo (la ficha, la lista de jugadores con Elo y el reporte
ronda a ronda), ya resumido. Cómo se bajó, en docs/decisiones/juegos-y-torneos.md
(«Sus torneos en FIDE y las normas de árbitro»).

    python3 herramientas/oscar-angulo-fide.py              escribe el JSON
    python3 herramientas/oscar-angulo-fide.py --comprobar  falla si no está al día
"""
import csv
import json
import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-fide.json")
CHESS_RESULTS = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-torneos.csv")
# El título de cada jugador con Elo de sus torneos («fideId»: [título,
# título femenino]), sacado de la lista de FIDE (players_list_foa.txt): el
# reporte de FIDE no lo trae. Solo los titulados. Lo arma
# herramientas/oscar-angulo-fide-titulos.py.
TITULOS = os.path.join(RAIZ, "herramientas", "datos", "oscar-angulo-fide-titulos.json")
DESTINO = os.path.join(RAIZ, "data", "oscar-angulo-fide.json")

REGLAMENTO = {
    "nombre": "FIDE B.06.1 – Regulations for the Titles of Arbiters, vigente desde el 1 de marzo de 2026",
    "enlace": "https://handbook.fide.com/chapter/B06012026",
}
SISTEMAS = {"s": "Suizo", "r": "Todos contra todos", "d": "Doble todos contra todos", "t": "Por equipos", "k": "Eliminación directa"}
RITMOS = {"Standard": "Clásico", "Rapid": "Rápido", "Blitz": "Blitz"}
PAISES = {"CRC": "Costa Rica", "ESA": "El Salvador", "CUB": "Cuba", "DOM": "República Dominicana", "HON": "Honduras",
          "PAN": "Panamá", "GUA": "Guatemala", "NCA": "Nicaragua", "MEX": "México", "COL": "Colombia", "USA": "Estados Unidos"}
MESES = {"January": "enero", "February": "febrero", "March": "marzo", "April": "abril", "May": "mayo", "June": "junio",
         "July": "julio", "August": "agosto", "September": "septiembre", "October": "octubre", "November": "noviembre", "December": "diciembre"}
# Para una norma de jugador (FIDE B.01) cuentan como titulados GM, IM, FM,
# WGM, WIM y WFM (no CM ni WCM).
TITULADOS = {"GM", "IM", "FM", "WGM", "WIM", "WFM"}
CARGOS = {"Chief": "Árbitro principal", "Dep. Chief": "Árbitro adjunto principal", "Arbiter": "Árbitro", "Organizer": "Organizador"}

# B.06.1, 3.8: mínimo de jugadores con Elo para una norma de AF, por sistema.
MINIMO_AF = {"s": 20, "r": 8, "d": 6, "t": 20, "k": 20}


def sin_tildes(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn").lower()


# La final del campeonato nacional individual de mayores, abierto o femenino
# (B.06.1, 4.8.1). Fuera los de categorías por edad, por pares o impares,
# rápidos, blitz, clasificatorios y los juegos.
FINAL_NACIONAL = re.compile(r"campeonato nacional|national championship|nacional (absoluto|femenino|mayor)")
NO_ES_FINAL = re.compile(r"\bsub|\bu ?\d|juvenil|infantil|escolar|estudiant|\bpares\b|impares|blitz|rapid|senior|veteran|"
                         r"grados|categor|clasificatori|semifinal|preliminar|\bfase\b|juegos|equipo|universit|colegial|"
                         r"aficionad|amateur|empresarial|\bliga\b|zona|regional|provincial")
# Eventos oficiales de FIDE o de la confederación continental (B.06.1, 4.8.2
# y 4.8.4): se reconocen por el nombre y se marcan para revisar.
OFICIAL = re.compile(r"panamerican|zonal|continental|mundial|world|olimp|olympiad|\bcca\b|centroamericano y del caribe|"
                     r"festival centroamericano|central american")
CAMPEONATO_EQUIPOS = re.compile(r"nacional (por|de) equipos|liga nacional|national team")


def evaluar(t):
    """Las condiciones del torneo para una norma de AF y de AI. Devuelve
    (af, ai): cada uno {"estado": "si"|"una"|"opcion"|"revisar"|"no",
    "detalle": texto, "motivos": [lo que falta]}.

    Solo se mira el torneo: las reglas de la solicitud (dos sistemas
    distintos, firmas, fechas que no se tocan, seis años…) dependen de qué
    normas se junten, y van explicadas en la página."""
    nombre = sin_tildes(t["nombre"])
    sistema, ritmo, rondas = t["sistema"], t["ritmo"], t["rondas"]
    con_elo, contados, feds = t["conElo"], t["contados"], len(t["federaciones"])
    internacional = feds >= 2
    cargo_ok = any(c in ("Chief", "Dep. Chief", "Arbiter") for c in t["cargos"])
    if not con_elo:
        nada = {"estado": "no", "detalle": "FIDE no lo valoró: no tiene jugadores con Elo" if not t.get("valorado")
                else "FIDE no publica su lista de jugadores" if not t.get("conReporte", True) else "ningún jugador con Elo"}
        return nada, dict(nada)

    # ---- AF (artículos 3.8 a 3.12) ----
    af_motivos = []
    if not cargo_ok:
        af_motivos.append("solo figura como organizador")
    if t["hibrido"]:
        af_motivos.append("es híbrido: solo vale si lo aprobó la Comisión de Árbitros")
    af = None
    if ritmo == "Standard":
        minimo = MINIMO_AF.get(sistema)
        if minimo is None:
            af_motivos.append("sistema que revisa la Comisión de Árbitros")
        elif contados < minimo:
            af_motivos.append(f"{contados} jugadores con Elo que jugaron casi todo (pide {minimo})")
        if rondas < 5:
            af_motivos.append(f"{rondas} rondas (pide 7; una de 5 o 6 se acepta)")
        if not af_motivos:
            af = {"estado": "si", "detalle": f"{SISTEMAS.get(sistema, sistema)}, {contados} jugadores con Elo, {rondas} rondas"} if rondas >= 7 else \
                 {"estado": "una", "detalle": f"{rondas} rondas: solo una norma así por solicitud"}
    else:
        if contados >= 30 and rondas >= 9 and cargo_ok and not t["hibrido"]:
            af = {"estado": "opcion", "detalle": f"{RITMOS[ritmo]} con {contados} jugadores con Elo y {rondas} rondas: vale una vez por solicitud (3.9.2)"}
        else:
            af_motivos.append(f"{RITMOS.get(ritmo, ritmo).lower()}: pide 30 jugadores con Elo y 9 rondas (tiene {contados} y {rondas})")

    # ---- AI (artículos 2.6.2 y 4.8 a 4.10) ----
    ai_motivos, ai = [], None
    if not cargo_ok:
        ai_motivos.append("solo figura como organizador")
    via = None
    if ritmo != "Standard":
        if OFICIAL.search(nombre) and cargo_ok:
            ai = {"estado": "revisar", "detalle": "si es un campeonato mundial o continental oficial de rápido o blitz, vale una vez (4.8.4)"}
        else:
            ai_motivos.append(f"{RITMOS.get(ritmo, ritmo).lower()}: solo valen los campeonatos mundiales o continentales oficiales")
    else:
        if rondas < 7:
            ai_motivos.append(f"{rondas} rondas (pide 9; una de 7 u 8 se acepta)")
        if FINAL_NACIONAL.search(nombre) and not NO_ES_FINAL.search(nombre):
            via = "Final del campeonato nacional individual (máximo dos por solicitud, 4.8.1)"
        elif OFICIAL.search(nombre):
            via = "Evento oficial de FIDE o continental (4.8.2): revisar"
        elif sistema == "t" and CAMPEONATO_EQUIPOS.search(nombre):
            via = "División principal del campeonato nacional por equipos (4.9.2, una vez): revisar tableros, equipos y 60 % con Elo"
        elif feds >= 3:
            # El reporte de FIDE no trae el título de los jugadores, así que
            # no se puede contar si el campo daba para una norma de jugador
            # (B.01): con 9 rondas, queda para revisar.
            if t["jugadores"] >= 100 and con_elo * 10 >= t["jugadores"] * 3 and rondas >= 7:
                via = "Internacional de 100 jugadores, 3 federaciones y 30 % con Elo (4.9.1, una vez)"
            elif rondas >= 9:
                # B.01: la mitad de los rivales titulados y un tercio GM o MI
                # (o WGM, WIM, GM o MI para una norma femenina). Con los
                # títulos de hoy: un título no se pierde, así que si hoy no
                # alcanza, tampoco alcanzaba; si alcanza, alguien pudo
                # sacarlo después, y queda para revisar.
                mitad, tercio = (rondas + 1) // 2, (rondas + 2) // 3
                th, mae, fem = t["titulados"], t["maestros"], t["maestrasYMaestros"]
                if th >= mitad and (mae >= tercio or fem >= tercio):
                    via = (f"Internacional con {feds} federaciones, {th} titulados y {max(mae, fem)} GM o MI (4.8.3): "
                           "el campo daba para una norma de jugador; revisar los títulos a la fecha del torneo y el promedio de Elo")
                else:
                    ai_motivos.append(f"internacional, pero el campo no daba para una norma de jugador: {th} titulados "
                                      f"(pide {mitad}) y {max(mae, fem)} GM o MI (pide {tercio}), con los títulos de hoy")
            else:
                ai_motivos.append(f"internacional de {rondas} rondas: pide 9 para una norma de título de jugador, "
                                  f"o 100 jugadores con 30 % con Elo ({t['jugadores']} jugadores, {con_elo} con Elo)")
        else:
            ai_motivos.append(("nacional" if not internacional else f"{feds} federaciones con Elo (pide 3)")
                              + ": solo vale la final del campeonato nacional o el nacional por equipos")
        if via and not ai_motivos:
            revisar = "revisar" in via
            if rondas >= 9:
                ai = {"estado": "revisar" if revisar else ("opcion" if "una vez" in via else "si"), "detalle": via}
            else:
                ai = {"estado": "revisar" if revisar else ("opcion" if "una vez" in via else "una"),
                      "detalle": via + f"; {rondas} rondas: solo una así por solicitud"}
    if t["hibrido"] and ai:
        ai = {"estado": "revisar", "detalle": ai["detalle"] + "; es híbrido: solo vale si lo aprobó la Comisión de Árbitros"}

    # 3.12: lo que vale para AI vale también para AF.
    if af is None and ai and ai["estado"] in ("si", "una"):
        af = {"estado": "si", "detalle": "vale para AI, así que vale para AF (3.12)"}
    af = af or {"estado": "no", "detalle": "; ".join(af_motivos)}
    ai = ai or {"estado": "no", "detalle": "; ".join(ai_motivos) or "no es de ninguno de los tipos del artículo 4.8"}
    return af, ai


def valorado(texto):
    """«February 2026» → «febrero de 2026»: el mes en que FIDE lo valoró."""
    if not texto:
        return ""
    mes, anio = texto.split()
    return f"{MESES.get(mes, mes)} de {anio}"


def chess_results():
    with open(CHESS_RESULTS, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def mismo_torneo(e, cr):
    """El torneo de chess-results que es el mismo (mismo día de inicio y al
    menos dos palabras del nombre en común), o None."""
    palabras = lambda s: {w for w in re.findall(r"[a-z0-9]{3,}", sin_tildes(s)) if w not in {"del", "de", "la", "los", "las", "torneo"}}
    mejor, puntos = None, 0
    for r in cr:
        if r["inicio"] != e["inicio"]:
            continue
        p = len(palabras(r["nombre"]) & palabras(e["nombre"]))
        if p > puntos:
            mejor, puntos = r, p
    return mejor if puntos >= 2 else None


def armar():
    with open(FUENTE, encoding="utf-8") as f:
        fuente = json.load(f)
    cr = chess_results()
    with open(TITULOS, encoding="utf-8") as f:
        titulos = json.load(f)
    torneos = []
    for e in fuente["torneos"]:
        rep = e.get("conElo") or []
        feds = sorted({j["fed"] for j in rep if j["fed"]})
        tit = [titulos.get(j["fid"], ["", ""]) for j in rep]
        par = mismo_torneo(e, cr)
        # Las rondas salen del reporte ronda a ronda de FIDE; si FIDE no lo
        # tiene, del mismo torneo en chess-results.
        rondas, rondas_de = e["rondas"], "FIDE"
        if not rondas and par and par["rondas"].isdigit() and int(par["rondas"]):
            rondas, rondas_de = int(par["rondas"]), "chess-results"
        # Un torneo registrado pero sin valorar (sin jugadores con Elo) no
        # dice «Rated as»: el ritmo sale del control de tiempo («Standard: …»).
        ritmo = e["ritmo"] or (e["control"] or "").split(":")[0].strip()
        t = {
            "id": e["id"], "nombre": e["nombre"], "ciudad": e["ciudad"], "pais": PAISES.get(e["pais"], e["pais"]),
            "inicio": e["inicio"], "fin": e["fin"], "anio": int(e["inicio"][:4]),
            "sistema": e["sistema"], "ritmo": ritmo if ritmo in RITMOS else "", "control": e["control"], "hibrido": e["hibrido"],
            # La ficha de FIDE a veces trae menos jugadores de los que tiene su
            # propia lista con Elo (el XLV Metropolitano U14 dice 60 y lista 108):
            # se toma el mayor.
            "jugadores": max(e["jugadores"] or 0, len(rep)), "conElo": len(rep),
            # B.06.1, 2.4.1: cuenta quien faltó a lo sumo a una ronda. Del
            # reporte salen las partidas valoradas; se descuenta a quien
            # perdió por no presentarse en dos rondas o más.
            "contados": sum(1 for j in rep if j["ausencias"] <= 1),
            "rondas": rondas or 0, "rondasDe": rondas_de if rondas else "", "federaciones": feds,
            "titulados": sum(1 for a, b in tit if a in TITULADOS or b in TITULADOS),
            "maestros": sum(1 for a, b in tit if a in ("GM", "IM")),
            "maestrasYMaestros": sum(1 for a, b in tit if a in ("GM", "IM") or b in ("WGM", "WIM")),
            "cargos": e["cargos"], "valorado": valorado(e["valorado"]), "conReporte": e["tieneReporte"],
            "chessResults": int(par["clave"]) if par else None,
        }
        t["af"], t["ai"] = evaluar(t)
        torneos.append(t)
    torneos.sort(key=lambda t: (t["inicio"], t["id"]), reverse=True)
    return {
        "actualizado": fuente["actualizado"],
        "idFide": fuente["idFide"],
        "reglamento": REGLAMENTO,
        "sistemas": SISTEMAS, "ritmos": RITMOS, "cargos": CARGOS,
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
            raise SystemExit(f"{os.path.relpath(DESTINO, RAIZ)} no está al día: python3 herramientas/oscar-angulo-fide.py")
        print(f"{os.path.relpath(DESTINO, RAIZ)} al día: {len(datos['torneos'])} torneos.")
        return
    with open(DESTINO, "w", encoding="utf-8") as f:
        f.write(nuevo)
    n = len(datos["torneos"])
    af = sum(t["af"]["estado"] != "no" for t in datos["torneos"])
    ai = sum(t["ai"]["estado"] != "no" for t in datos["torneos"])
    print(f"{os.path.relpath(DESTINO, RAIZ)}: {n} torneos; AF {af}, AI {ai} (sin contar los «no»).")


if __name__ == "__main__":
    main()
