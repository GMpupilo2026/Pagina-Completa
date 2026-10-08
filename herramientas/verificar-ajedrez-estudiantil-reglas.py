#!/usr/bin/env python3
"""Las reglas y el actualizador de ajedrez-estudiantil.html, sin salir a la red.

Lo que comprueba:
- que las reglas (herramientas/ajedrez_estudiantil_reglas.py) clasifiquen los
  1082 torneos guardados exactamente como están: etapa, categoría, región,
  modalidad, ritmo y año. Si una regla cambia y desordena lo que ya estaba,
  salta acá antes de que el actualizador lo escriba;
- que el actualizador lea el formulario y la tabla del buscador de
  chess-results con la forma real (las muestras de
  herramientas/datos/ajedrez-estudiantil-muestras/), por el nombre de cada
  columna;
- que al juntar: ponga al día un torneo que ya estaba, sume uno nuevo de los
  JDE leyendo su título completo, sume uno corto sin pedir nada, deje fuera el
  que no es estudiantil y el que se jugó en otro país, y no pida el título de
  un nombre cortado sin pistas de ser estudiantil;
- que el JSON esté al día con el CSV.

Ver «Ajedrez estudiantil en Costa Rica: los torneos de chess-results» en
docs/decisiones/juegos-y-torneos.md.

    python3 herramientas/verificar-ajedrez-estudiantil-reglas.py
"""
import copy
import csv
import importlib.util
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
import ajedrez_estudiantil_reglas as reglas  # noqa: E402

espec = importlib.util.spec_from_file_location("actualizar", os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil-actualizar.py"))
actualizar = importlib.util.module_from_spec(espec)
espec.loader.exec_module(actualizar)

MUESTRAS = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-muestras")
fallos = 0


def cierto(nombre, valor, detalle=""):
    global fallos
    if valor:
        print("  ✓ " + nombre)
    else:
        fallos += 1
        print("  ✗ " + nombre + ("\n      " + detalle if detalle else ""))


def muestra(nombre):
    with open(os.path.join(MUESTRAS, nombre), encoding="utf-8") as f:
        return f.read()


print("Las reglas contra los torneos guardados")
with open(actualizar.FUENTE, encoding="utf-8", newline="") as f:
    guardados = list(csv.DictReader(f))
distintos = []
for r in guardados:
    c = reglas.clasificar(r["nombre"], r["organizador"], r["lugar"], r["inicio"])
    if c is None:
        distintos.append(f"{r['clave']} quedaría fuera")
        continue
    for k in ("anio", "etapa", "categoria", "region", "modalidad", "ritmo"):
        if str(c[k]) != r[k]:
            distintos.append(f"{r['clave']} {k}: guardado «{r[k]}», la regla da «{c[k]}»")
cierto(f"las reglas clasifican los {len(guardados)} torneos igual que están guardados", not distintos, "; ".join(distintos[:8]))
cierto("«DRE» no es la categoría D", reglas.categoria("JDE DRE Guapiles Equipos C abierto") == "C")
cierto("«2025 AIO» es la categoría A", reglas.categoria("Eliminatoria Regional Juegos Deportivos Estudiantiles 2025 AIO") == "A")
cierto("los JDN del ICODER quedan fuera", reglas.etapa("Eliminatoria JDN 2024- Zona 2- Individual U16", "ICODER-FCACR") is None)
cierto("la eliminatoria «JDN» de la DRE de Coto es de los JDE", reglas.etapa("JDN ELIMINATORIA REGION COTO - A ABIERTO", "DRE COTO") == "Regional")
cierto("un torneo de otro país queda fuera", reglas.etapa("Campeonato Nacional Estudiantil 2008", "Federación Deportiva Nacional del Ecuador") is None)

print("Leer chess-results")
ocultos = actualizar.campos_ocultos(muestra("formulario.txt"))
cierto("lee los campos ocultos del formulario", set(ocultos) == {"__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"}, str(sorted(ocultos)))
filas = actualizar.leer_filas(muestra("busqueda.txt"))
cierto("lee las seis filas de la búsqueda", len(filas) == 6, str(len(filas)))
primera = filas[0] if filas else {}
cierto("lee cada columna por su nombre", primera == {"clave": "1408605", "nombre": "JDE Interregional SJ Central - SJ Norte - Heredia♔",
                                                     "inicio": "2026-05-06", "organizador": "Regional SJ Central", "lugar": "",
                                                     "rondas": "5", "jugadores": "9"}, str(primera))
cierto("lee también las filas con la clase «CRng2 CRC»", any(f["clave"] == "1599004" for f in filas))
cierto("lee el título completo de la página de un torneo",
       actualizar.leer_titulo(muestra("torneo.txt")) == "JDE Regional Cartago 2027 - Categoría B Individual Abierto ♖")
try:
    actualizar.leer_filas(muestra("busqueda.txt").replace(">dbkey<", ">clave<"))
    cierto("si chess-results cambia las columnas, se detiene en vez de leer mal", False)
except SystemExit:
    cierto("si chess-results cambia las columnas, se detiene en vez de leer mal", True)

print("Juntar lo nuevo con lo guardado")
pedidos = []


def titulo(clave):
    pedidos.append(clave)
    return actualizar.leer_titulo(muestra("torneo.txt")) if clave == "1599001" else ""


copia = copy.deepcopy(guardados)
total, nuevos, cambiados = actualizar.actualizar(copia, filas, titulo)
claves_nuevas = [r["clave"] for r in nuevos]
cierto("pone al día los inscritos del torneo que ya estaba", [(r["clave"], c) for r, c in cambiados] == [("1408605", {"jugadores": "9"})], str(cambiados))
cierto("suma los dos torneos nuevos de los JDE y nada más", claves_nuevas == ["1599001", "1599004"], str(claves_nuevas))
nuevo = next((r for r in nuevos if r["clave"] == "1599001"), {})
cierto("el nuevo de nombre cortado se clasifica con su título completo",
       nuevo.get("nombre", "").endswith("Abierto ♖") and nuevo.get("categoria") == "B" and nuevo.get("region") == "Cartago"
       and nuevo.get("etapa") == "Regional" and nuevo.get("anio") == "2027", str(nuevo))
corto = next((r for r in nuevos if r["clave"] == "1599004"), {})
cierto("el nuevo de nombre corto entra sin pedir su página", corto.get("categoria") == "C" and corto.get("region") == "Nicoya" and "1599004" not in pedidos, str(corto))
cierto("solo pide la página de los nombres cortados con pistas de ser estudiantil", pedidos == ["1599001", "1599005"], str(pedidos))
cierto("deja fuera el torneo jugado en otro país", "1599005" not in claves_nuevas)
cierto("la lista queda con los nuevos y ordenada", len(total) == len(guardados) + 2 and total == sorted(total, key=lambda r: (int(r["anio"]), r["inicio"], int(r["clave"]))))
cierto("no toca la lista guardada en disco", len(list(csv.DictReader(open(actualizar.FUENTE, encoding="utf-8")))) == len(guardados))
cierto("el resumen nombra el torneo nuevo", "JDE Regional Cartago 2027" in actualizar.resumen(nuevos, cambiados))

print("El JSON")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil.py"), "--comprobar"], capture_output=True, text=True)
cierto("data/ajedrez-estudiantil.json está al día", r.returncode == 0, (r.stdout + r.stderr).strip())

print(f"\n{fallos} comprobación(es) fallaron" if fallos else "\nTodo bien")
sys.exit(1 if fallos else 0)
