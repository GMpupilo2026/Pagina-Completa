#!/usr/bin/env python3
"""herramientas/ajedrez-estudiantil-partidas.py, sin salir a la red.

Lo que comprueba:
- que lea la tabla de rondas de una página real de chess-results (art=9&snr=,
  muestra con nombres inventados): ronda, mesa, color (del
  <div class="FarbewT"/"FarbesT">), rival y resultado;
- que una ronda sin emparejar (bye) no cuente como partida, y que una ganada
  por incomparecencia de un rival real sí cuente, con el color «desconocido»
  y el resultado tal cual lo escribe chess-results, sin interpretarlo;
- que «elegible» acote a los torneos individuales de 2024 en adelante;
- que una vuelta completa el «snr» de quien no lo tenía, pida después las
  partidas de quien ya lo tiene y no las pidió antes, no vuelva a pedir lo ya
  leído, y respete el --maximo de pedidos (los dos pasos cuentan juntos).

Ver «Historial del jugador y estadísticas por colegio» en
docs/decisiones/juegos-y-torneos.md.

    python3 herramientas/verificar-ajedrez-estudiantil-partidas.py
"""
import importlib.util
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUESTRAS = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-muestras")

fallos = 0


def cierto(nombre, valor, detalle=None):
    global fallos
    if valor:
        print("  ✓ " + nombre)
    else:
        print("  ✗ " + nombre + (("\n      " + str(detalle)) if detalle is not None else ""))
        fallos += 1


def modulo(nombre, archivo):
    e = importlib.util.spec_from_file_location(nombre, os.path.join(RAIZ, "herramientas", archivo))
    m = importlib.util.module_from_spec(e)
    e.loader.exec_module(m)
    return m


p = modulo("partidas", "ajedrez-estudiantil-partidas.py")


def muestra(nombre):
    with open(os.path.join(MUESTRAS, nombre), encoding="utf-8") as f:
        return f.read()


print("Leer la tabla de rondas")
rondas = p.leer_partidas_jugador(muestra("partidas.txt"))
cierto("lee las cuatro rondas, en orden", [r["ronda"] for r in rondas] == ["1", "2", "3", "4"], rondas)
cierto("ronda 1: blancas, ganada, rival y mesa", rondas[0]["color"] == "blancas" and rondas[0]["resultado"] == "1"
       and rondas[0]["rival_nombre"] == "Beto Soto Vargas," and rondas[0]["mesa"] == "2" and rondas[0]["rival_snr"] == "5", rondas[0])
cierto("ronda 2: negras, perdida", rondas[1]["color"] == "negras" and rondas[1]["resultado"] == "0", rondas[1])
cierto("ronda 3: sin emparejar, sin color (no hay <div> de color)", rondas[2]["color"] == "desconocido" and rondas[2]["rival_nombre"] == "sin emparejar", rondas[2])
cierto("ronda 4: ganada por incomparecencia de un rival real, sin inventar el resultado",
       rondas[3]["color"] == "desconocido" and rondas[3]["resultado"] == "+ 1K" and rondas[3]["rival_nombre"] == "Tono Jara Solís,", rondas[3])

reales = [p.es_partida_real(r) for r in rondas]
cierto("un bye (sin emparejar, snr negativo) no es una partida real", reales == [True, True, False, True], reales)
cierto("página sin la tabla de rondas: lista vacía, no explota", p.leer_partidas_jugador("<html><body>nada</body></html>") == [])

print("Elegible: individuales de 2024 en adelante")
torneos_e = {
    "1": {"clave": "1", "anio": "2024", "modalidad": "Individual", "inicio": "2024-05-01"},
    "2": {"clave": "2", "anio": "2023", "modalidad": "Individual", "inicio": "2023-05-01"},
    "3": {"clave": "3", "anio": "2025", "modalidad": "Equipos", "inicio": "2025-05-01"},
}
cierto("un individual de 2024 es elegible", p.elegible({"clave": "1"}, torneos_e))
cierto("un individual de 2023 no (es antes de 2024)", not p.elegible({"clave": "2"}, torneos_e))
cierto("uno por equipos no (las partidas de equipos se leen aparte)", not p.elegible({"clave": "3"}, torneos_e))
cierto("un torneo que no está en la lista no es elegible", not p.elegible({"clave": "9"}, torneos_e))

print("Una vuelta completa")
ART1_CON_SNR = ("<html><body><table class=\"CRs1\"><tr class=\"CRng1b\">"
                 "<th>Rk.</th><th>No.Ini.</th><th></th><th>Nombre</th><th>FED</th><th>Elo</th><th>Club/Ciudad</th><th>Pts.</th></tr>"
                 "<tr class=\"CRng2\"><td>1</td><td>7</td><td></td><td>Ana Pérez Mora,</td><td>CRC</td><td>0</td><td>Liceo</td><td>2</td></tr>"
                 "<tr class=\"CRng1\"><td>2</td><td>5</td><td></td><td>Beto Soto Vargas,</td><td>CRC</td><td>1200</td><td>Liceo</td><td>1</td></tr>"
                 "<tr class=\"CRng2\"><td>3</td><td>3</td><td></td><td>Carla Jiménez,</td><td>CRC</td><td>0</td><td>Liceo</td><td>2</td></tr>"
                 "</table></body></html>")


def jugadores_de_prueba():
    return [
        {"clave": "1", "puesto": "1", "nombre": "Ana Pérez Mora,", "institucion": "Liceo", "elo": "", "puntos": "2", "snr": ""},
        {"clave": "1", "puesto": "2", "nombre": "Beto Soto Vargas,", "institucion": "Liceo", "elo": "1200", "puntos": "1", "snr": "5"},
        {"clave": "1", "puesto": "3", "nombre": "Carla Jiménez,", "institucion": "Liceo", "elo": "", "puntos": "2", "snr": "3"},
        {"clave": "2", "puesto": "1", "nombre": "Fuera De Rango,", "institucion": "X", "elo": "", "puntos": "1", "snr": ""},
        {"clave": "3", "puesto": "1", "nombre": "De Equipos,", "institucion": "X", "elo": "", "puntos": "1", "snr": ""},
    ]


def pedir_de_prueba(vistos):
    def pedir(clave, art, snr=None):
        vistos.append((clave, art, snr))
        if clave == "1" and art == 1:
            return ART1_CON_SNR
        if clave == "1" and art == 9:
            return muestra("partidas.txt")
        raise AssertionError(f"pedido inesperado: {clave}, art={art}, snr={snr}")
    return pedir


jugadores = jugadores_de_prueba()
vistos = []
completados, leidas_ahora, nuevas, fallidos, pedidos = p.procesar(torneos_e, jugadores, {("1", "5")}, 10, pedir_de_prueba(vistos))
cierto("completa el snr de quien no lo tenía (Ana) con art=1", next(r for r in jugadores if r["nombre"].startswith("Ana"))["snr"] == "7")
cierto("no toca el snr de quien ya lo tenía", next(r for r in jugadores if r["nombre"].startswith("Beto"))["snr"] == "5")
cierto("solo pide el torneo 1 (2 y 3 no son elegibles)", {c for c, _, _ in vistos} == {"1"}, vistos)
cierto("no vuelve a pedir las partidas de quien ya estaba en «leídas» (Beto)", ("1", "5") not in [(c, s) for c, a, s in vistos if a == 9], vistos)
cierto("pide las partidas de Ana (snr recién completado) y de Carla", {s for c, a, s in vistos if a == 9} == {"7", "3"}, vistos)
cierto("leidas_ahora trae a Ana y a Carla, no a Beto", set(leidas_ahora) == {("1", "7"), ("1", "3")}, leidas_ahora)
cierto("3 partidas reales por jugador leído (la del bye no entra) × 2 jugadores", len(nuevas) == 6, len(nuevas))
cierto("pedidos: 1 (snr) + 2 (partidas)", pedidos == 3, pedidos)
cierto("sin fallidos", fallidos == [])

print("El --maximo se respeta entre los dos pasos")
jugadores2 = jugadores_de_prueba()
vistos2 = []
completados2, leidas_ahora2, nuevas2, _, pedidos2 = p.procesar(torneos_e, jugadores2, {("1", "5")}, 1, pedir_de_prueba(vistos2))
cierto("con --maximo 1 solo alcanza para completar el snr, no para las partidas",
       pedidos2 == 1 and completados2 == ["1"] and leidas_ahora2 == [], (pedidos2, completados2, leidas_ahora2))

print("Todo bien" if fallos == 0 else f"\n{fallos} fallo(s)")
sys.exit(1 if fallos else 0)
