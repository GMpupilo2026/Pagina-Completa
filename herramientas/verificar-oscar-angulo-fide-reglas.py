#!/usr/bin/env python3
"""Las reglas de normas de árbitro de herramientas/normas_arbitro.py (las
usan oscar-angulo-fide.py y arbitros-cr.py), con torneos de prueba armados a
mano: cada condición del reglamento FIDE B.06.1
(vigente desde el 1 de marzo de 2026) por los dos lados del límite.

Comprueba también que data/oscar-angulo-fide.json esté al día con su fuente.
Ver «Sus torneos en FIDE y las normas de árbitro» en
docs/decisiones/juegos-y-torneos.md.

    python3 herramientas/verificar-oscar-angulo-fide-reglas.py
"""
import importlib.util
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("fide", os.path.join(RAIZ, "herramientas", "normas_arbitro.py"))
fide = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fide)

fallos = 0


def cierto(nombre, valor, detalle=""):
    global fallos
    print(("  ✓ " if valor else "  ✗ ") + nombre + ("" if valor or not detalle else "\n      " + detalle))
    fallos += 0 if valor else 1


def torneo(**cambios):
    """Un suizo nacional clásico de 30 jugadores con Elo y 9 rondas, con él
    de árbitro principal; cada prueba cambia lo que mira."""
    t = {"nombre": "Abierto de prueba", "sistema": "s", "ritmo": "Standard", "rondas": 9, "jugadores": 30,
         "conElo": 30, "contados": 30, "federaciones": ["CRC"], "titulados": 0, "maestros": 0, "maestrasYMaestros": 0, "cargos": ["Chief"], "hibrido": False}
    t.update(cambios)
    return t


def estados(**cambios):
    af, ai = fide.evaluar(torneo(**cambios))
    return af["estado"], ai["estado"]


print("Norma de AF (3.8 a 3.12)")
cierto("suizo con 20 jugadores con Elo y 7 rondas: vale", estados(contados=20, rondas=7)[0] == "si")
cierto("suizo con 19: no", estados(contados=19, rondas=7)[0] == "no")
cierto("cuenta a quien faltó a lo sumo a una ronda, no a todos los con Elo", estados(conElo=25, contados=19)[0] == "no")
cierto("todos contra todos con 8: vale", estados(sistema="r", contados=8, rondas=7)[0] == "si")
cierto("todos contra todos con 7: no", estados(sistema="r", contados=7, rondas=7)[0] == "no")
cierto("por equipos con 20: vale", estados(sistema="t", contados=20, rondas=7)[0] == "si")
cierto("6 rondas: vale, pero solo una así", estados(rondas=6)[0] == "una")
cierto("4 rondas: no", estados(rondas=4)[0] == "no")
cierto("rápido con 30 y 9 rondas: vale una vez", estados(ritmo="Rapid", contados=30, rondas=9)[0] == "opcion")
cierto("rápido con 29: no", estados(ritmo="Rapid", contados=29, rondas=9)[0] == "no")
cierto("blitz con 30 y 8 rondas: no", estados(ritmo="Blitz", contados=30, rondas=8)[0] == "no")
cierto("solo como organizador: no", estados(cargos=["Organizer"])[0] == "no")
cierto("como adjunto principal: vale", estados(cargos=["Dep. Chief"])[0] == "si")

print("Norma de AI (2.6.2 y 4.8 a 4.10)")
cierto("un suizo nacional cualquiera: no", estados()[1] == "no")
cierto("final del campeonato nacional absoluto con 9 rondas: vale",
       estados(nombre="Campeonato Nacional Absoluto 2025", sistema="r", contados=10, rondas=9)[1] == "si")
cierto("final del nacional femenino con 7 rondas: vale, solo una así",
       estados(nombre="FCA Campeonato Nacional Femenino 2025", rondas=7)[1] == "una")
cierto("campeonato nacional Sub-16: no es la final de mayores", estados(nombre="Campeonato Nacional Sub-16 2025")[1] == "no")
cierto("campeonato nacional blitz: no", estados(nombre="Campeonato Nacional Blitz 2025", ritmo="Blitz")[1] == "no")
cierto("final nacional con 6 rondas: no", estados(nombre="Campeonato Nacional Absoluto 2025", rondas=6)[1] == "no")
grande = dict(jugadores=100, conElo=30, contados=30, federaciones=["CRC", "PAN", "GUA"], rondas=7)
cierto("internacional de 100 jugadores, 3 federaciones, 30 % con Elo y 7 rondas: vale una vez", estados(**grande)[1] == "opcion")
cierto("lo mismo con 29 % con Elo: no", estados(**{**grande, "conElo": 29})[1] == "no")
cierto("lo mismo con 2 federaciones: no", estados(**{**grande, "federaciones": ["CRC", "PAN"]})[1] == "no")
cierto("lo mismo con 99 jugadores: no", estados(**{**grande, "jugadores": 99})[1] == "no")
campo = dict(federaciones=["CRC", "CUB", "PAN"], rondas=9, titulados=5, maestros=3, maestrasYMaestros=3)
cierto("internacional de 9 rondas con 5 titulados y 3 GM o MI: revisar (los títulos son los de hoy)", estados(**campo)[1] == "revisar")
cierto("con 4 titulados: no (la mitad de 9 rivales)", estados(**{**campo, "titulados": 4})[1] == "no")
cierto("con 2 GM o MI: no (un tercio de 9)", estados(**{**campo, "maestros": 2, "maestrasYMaestros": 2})[1] == "no")
cierto("con 3 WGM o WIM alcanza para una norma femenina: revisar", estados(**{**campo, "maestros": 1, "maestrasYMaestros": 3})[1] == "revisar")
cierto("internacional de 3 federaciones y 8 rondas, 30 jugadores: no", estados(**{**campo, "rondas": 8})[1] == "no")
cierto("campeonato panamericano: revisar (oficial de la confederación)", estados(nombre="Campeonato Panamericano Juvenil", federaciones=["CRC", "MEX", "USA"])[1] == "revisar")
cierto("rápido mundial o continental: revisar", estados(nombre="Campeonato Panamericano de Rapido", ritmo="Rapid")[1] == "revisar")
cierto("un rápido cualquiera: no", estados(ritmo="Rapid")[1] == "no")
cierto("lo que vale para AI vale para AF (3.12)",
       fide.evaluar(torneo(nombre="Campeonato Nacional Absoluto", sistema="r", contados=6, rondas=9))[0]["estado"] == "si")
cierto("solo como organizador: tampoco vale para AI",
       estados(nombre="Campeonato Nacional Absoluto 2025", cargos=["Organizer"])[1] == "no")
cierto("un híbrido queda para revisar", estados(nombre="Campeonato Nacional Absoluto 2025", hibrido=True)[1] == "revisar")

print("Los datos")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "oscar-angulo-fide.py"), "--comprobar"], capture_output=True, text=True)
cierto("data/oscar-angulo-fide.json está al día con su fuente", r.returncode == 0, (r.stdout + r.stderr).strip())

print(f"\n{fallos} comprobación(es) fallaron" if fallos else "\nTodo bien")
sys.exit(1 if fallos else 0)
