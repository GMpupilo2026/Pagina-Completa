#!/usr/bin/env python3
"""Las reglas y el actualizador de ajedrez-estudiantil.html, sin salir a la red.

Lo que comprueba:
- que las reglas (herramientas/ajedrez_estudiantil_reglas.py) clasifiquen los
  torneos guardados exactamente como están: etapa, categoría, región,
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
- que el lector de jugadores (herramientas/ajedrez-estudiantil-jugadores.py)
  lea la clasificación individual, la de equipos y la lista de jugadores de
  equipos con la forma real (muestras con nombres inventados), saque los
  puntos de «Pts.» o del desempate «points», sepa si el torneo terminó, y
  elija bien qué leer en cada vuelta;
- que al armar los jugadores junte a una persona escrita con o sin tildes y
  mayúsculas, junte las formas de un mismo colegio («C.T.P.» y «Colegio
  Técnico Profesional») y el nombre cortado por chess-results, no tome «CRC»
  por un colegio, use la lista de variantes y quite a quien pidió no salir;
- que los dos JSON estén al día con los CSV.

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

import datetime  # noqa: E402
import json  # noqa: E402
import tempfile  # noqa: E402


def modulo(nombre, archivo):
    e = importlib.util.spec_from_file_location(nombre, os.path.join(RAIZ, "herramientas", archivo))
    m = importlib.util.module_from_spec(e)
    e.loader.exec_module(m)
    return m


lector = modulo("jugadores", "ajedrez-estudiantil-jugadores.py")
armador = modulo("armar", "ajedrez-estudiantil.py")

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
# Las que faltaban cuando el buscador cortó en 1000 filas (ver «El buscador
# corta en 1000 filas» en docs/decisiones/juegos-y-torneos.md).
c = reglas.clasificar("&#10145;&#65039; Regional Turrialba - Individual Abierto Categoria A", "", "", "2026-04-20") or {}
cierto("«➡️ Regional Turrialba - … A» sin organizador es la regional de Turrialba, categoría A",
       (c.get("etapa"), c.get("region"), c.get("categoria")) == ("Regional", "Turrialba", "A"), str(c))
cierto("«Regional San José CentralA Abierto»: la letra pegada a la región es la categoría",
       reglas.categoria("Regional San José CentralA Abierto Equipos") == "A")
cierto("«Regional Desamparados» que subió la regional de San José Central es de Desamparados",
       reglas.region("Regional DesamparadosC Abierto Individual", "Regional San José Central", "") == "Desamparados")
cierto("«Peninsular» no es Grande de Térraba (por el «sula» de adentro)",
       reglas.region("Categoría A - Regional Penínsular", "Regional de Paquera", "") == "Peninsular")
cierto("«Inter-regional» con guion es interregional",
       reglas.etapa("ELIMINATORIA INTER-REGIONAL HEREDIA-SAN JOSE CATEGORIA D ABIERTO INDIVIDUAL") == "Interregional")
cierto("«Eliminatoria Regional San Carlos» es regional",
       reglas.etapa("Eliminatoria Regional San Carlos Cat A individual abierto", "Asesoría de Educación Física") == "Regional")
cierto("los amistosos, fogueos y recreativos quedan fuera",
       [reglas.etapa(n, "Regional San José Central") for n in ("Regional San José Norte Amistoso", "Regional San José Central Fogueo", "Regional Limon Recreativo")] == [None, None, None])

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

print("Leer los jugadores de cada torneo")
ind = lector.leer_individual(muestra("clasificacion.txt"))
cierto("lee la clasificación individual: puesto, nombre, colegio, Elo",
       [(j["puesto"], j["nombre"], j["institucion"], j["elo"]) for j in ind]
       == [("1", "Solano Mora, Ana Lucía", "Liceo de Muestra", "1650"), ("2", "Quesada Rojas, Pablo", "C.T.P. Ejemplo", ""),
           ("3", "Vargas Núñez, Sofía", "Liceo de Muestra", "")], str(ind))
cierto("los puntos salen del desempate que la anotación llama «points» (con ½)", [j["puntos"] for j in ind] == ["4.5", "4", "0.5"], str([j["puntos"] for j in ind]))
cierto("una clasificación final se reconoce como final", lector.es_final(muestra("clasificacion.txt")))
en_juego = lector.leer_individual(muestra("clasificacion-en-juego.txt"))
cierto("con columna «Pts.», los puntos salen de ahí y no del desempate", [j["puntos"] for j in en_juego] == ["3", "2.5"], str(en_juego))
cierto("el «Equipo» de un torneo internacional se lee como la institución", en_juego and en_juego[0]["institucion"] == "Escuela Modelo")
cierto("«Clasificación después de la ronda 3» no es final", not lector.es_final(muestra("clasificacion-en-juego.txt")))
sin_puntos = lector.leer_individual(muestra("clasificacion.txt").replace("Desempate 1: points (game-points)", "Desempate 1: Buchholz"))
cierto("sin «Pts.» ni desempate de puntos, los puntos quedan en blanco (no se adivinan)", all(j["puntos"] == "" for j in sin_puntos))
eq = lector.leer_equipos(muestra("equipos.txt"))
cierto("lee la clasificación de equipos del cuadro cruzado", eq == [{"puesto": "1", "equipo": "Liceo de Muestra", "puntos": "4.5"},
                                                                     {"puesto": "2", "equipo": "C.T.P. Ejemplo", "puntos": "3.5"}], str(eq))
cierto("un cuadro cruzado sin «después de la ronda» es final", lector.es_final(muestra("equipos.txt")))

paginas = {0: muestra("equipos.txt"), 16: muestra("equipos-jugadores.txt"), 1: muestra("clasificacion.txt")}
pedidas = []
def pedir(clave, art):
    pedidas.append(art)
    return paginas[art]
js, es, final = lector.leer_torneo({"clave": "1", "modalidad": "Equipos"}, pedir)
cierto("en un torneo por equipos pide art=0 y art=16, no art=4", pedidas == [0, 16], str(pedidas))
cierto("cada jugador de equipos lleva su equipo y el puesto del equipo",
       [(j["nombre"], j["institucion"], j["puesto"]) for j in js]
       == [("SOLANO MORA, ANA LUCIA", "Liceo de Muestra", "1"), ("QUESADA ROJAS, PABLO", "C.T.P. Ejemplo", "2"), ("ARAYA LEON, JOSE", "Liceo de Muestra", "1")], str(js))
pedidas.clear()
paginas[0] = muestra("clasificacion.txt")
js, es, final = lector.leer_torneo({"clave": "1", "modalidad": "Equipos"}, pedir)
cierto("un «por equipos» sin clasificación de equipos se lee como individual", pedidas == [0, 1] and len(js) == 3 and es == [], str(pedidas))
pedidas.clear()
paginas[0] = muestra("equipos.txt")
paginas[1] = "<html><body><h2>JDE Muestra por Equipos</h2><h2>Orden de fuerza de los equipos con resultados ronda a ronda</h2></body></html>"
js, es, final = lector.leer_torneo({"clave": "1", "modalidad": "Individual"}, pedir)
cierto("un «individual» cortado que es por equipos se lee por equipos", pedidas == [1, 0, 16] and len(es) == 2 and len(js) == 3, str(pedidas))

hoy = datetime.date(2026, 10, 9)
torneos_prueba = [
    {"clave": "1", "inicio": "2020-05-01", "jugadores": "10", "rondas": "5"},
    {"clave": "2", "inicio": "2026-09-30", "jugadores": "12", "rondas": "5"},
    {"clave": "3", "inicio": "2026-10-01", "jugadores": "8", "rondas": "5"},
    {"clave": "4", "inicio": "2026-09-01", "jugadores": "9", "rondas": "5"},
    {"clave": "5", "inicio": "2025-01-01", "jugadores": "6", "rondas": "5"},
]
leidos_prueba = {
    "1": {"clave": "1", "leido": "2026-01-01", "jugadores": "10", "rondas": "5", "final": "si"},
    "2": {"clave": "2", "leido": "2026-10-08", "jugadores": "12", "rondas": "5", "final": "no"},
    "4": {"clave": "4", "leido": "2026-10-08", "jugadores": "7", "rondas": "5", "final": "si"},
    "5": {"clave": "5", "leido": "2025-02-01", "jugadores": "6", "rondas": "5", "final": "no"},
}
orden_leer = [t["clave"] for t in lector.por_leer(torneos_prueba, leidos_prueba, hoy, 10)]
cierto("lee primero lo nunca leído, después lo que cambió o sigue en juego, y no lo viejo sin terminar",
       orden_leer == ["3", "2", "4"], str(orden_leer))
cierto("respeta el máximo por vuelta", [t["clave"] for t in lector.por_leer(torneos_prueba, leidos_prueba, hoy, 1)] == ["3"])

print("Armar los jugadores y los colegios")
cp = armador.clave_de_persona
cierto("una persona con y sin tildes, mayúsculas ni coma es la misma",
       cp("SOLANO MORA, ANA LUCIA") == cp("Solano Mora, Ana Lucía") == cp("Solano  Mora Ana lucia"))
ci = armador.clave_de_institucion
cierto("«C.T.P.», «CTP» y «Colegio Técnico Profesional» son lo mismo",
       ci("C.T.P. de Ejemplo") == ci("CTP de Ejemplo") == ci("Colegio Técnico Profesional de Ejemplo"))
cierto("un nombre cortado a 35 letras se junta con el completo, si es uno solo",
       armador.juntar_cortados({"colegio teresiano san enrique de os", "colegio teresiano san enrique de ossó"})
       == {"colegio teresiano san enrique de os": "colegio teresiano san enrique de ossó"})
cierto("un nombre corto no se junta con otro que empieza igual", armador.juntar_cortados({"liceo de", "liceo de muestra"}) == {})
cierto("un nombre en mayúsculas se muestra con mayúscula inicial y las siglas como van",
       armador.bonito(["CTP 27 DE ABRIL"]) == "CTP 27 de Abril" and armador.bonito(["QUESADA ROJAS, PABLO", "Quesada Rojas, Pablo"]) == "Quesada Rojas, Pablo",
       armador.bonito(["CTP 27 DE ABRIL"]))

claves = [r["clave"] for r in guardados[:2]]
with tempfile.TemporaryDirectory() as tmp:
    def escribir(nombre, texto):
        ruta = os.path.join(tmp, nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
        return ruta
    armador.JUGADORES = escribir("j.csv", "clave,puesto,nombre,institucion,elo,puntos\n"
                                f"{claves[0]},1,\"Solano Mora, Ana Lucía\",C.T.P. de Ejemplo,1650,4.5\n"
                                f"{claves[0]},2,\"Pérez Ruiz, Juan\",CRC,,3\n"
                                f"{claves[0]},3,\"Borrar Este, Nombre\",Liceo Uno,,2\n"
                                f"{claves[1]},1,\"SOLANO MORA, ANA LUCIA\",Colegio Técnico Profesional de Ejemplo,,\n"
                                "99999999,1,\"Fuera De Lista, Torneo\",Liceo Uno,,1\n")
    armador.EQUIPOS = escribir("e.csv", f"clave,puesto,equipo,puntos\n{claves[1]},1,Liceo Viejo,4\n")
    armador.EXCLUIDOS = escribir("x.txt", "# comentario\nBORRAR ESTE, NOMBRE\n")
    with open(armador.JUGADORES, "a", encoding="utf-8") as f:
        f.write(f"{claves[0]},4,\"Mena Paz, Rosa\",Anglo Americano,,1\n{claves[1]},2,\"Mena Paz, Rosa\",Angloamericano,,1\n"
                f"{claves[1]},3,\"Rey Sol, Luis\",Angloamericano,,1\n"
                f"{claves[0]},5,\"Ruiz Lara, Ana\",Pacto del Jocote,,1\n{claves[1]},4,\"Ruiz Lara, Ana\",Escuela Pacto del Jocote,,1\n"
                f"{claves[0]},6,\"Mora Gil, Eva\",Lepanto,,1\n{claves[1]},5,\"Mora Gil, Eva\",Escuela Lepanto,,1\n{claves[1]},6,\"Mora Gil, Teo\",Colegio Lepanto,,1\n")
    armador.INSTITUCIONES = escribir("i.csv", "variante,nombre\nLiceo Viejo,Liceo Uno\n")
    d = json.loads(armador.armar_jugadores())
    nombres = [j[0] for j in d["jugadores"]]
    cierto("la misma persona en dos torneos queda una sola vez, con su nombre bien escrito",
           nombres.count("Solano Mora, Ana Lucía") == 1 and len([p for p in d["participaciones"] if p[1] == nombres.index("Solano Mora, Ana Lucía")]) == 2, str(nombres))
    cierto("quien pidió no salir no sale", "Borrar Este, Nombre" not in nombres)
    cierto("un torneo que no está en la lista no cuenta", "Fuera De Lista, Torneo" not in nombres)
    insts = [i[0] for i in d["instituciones"]]
    cierto("«CRC» no es un colegio", "CRC" not in insts and any(p[2] is None for p in d["participaciones"]), str(insts))
    cierto("las dos formas del C.T.P. son una institución", len([i for i in insts if "Ejemplo" in i]) == 1, str(insts))
    cierto("la lista de variantes junta «Liceo Viejo» con «Liceo Uno»", "Liceo Viejo" not in insts and d["equipos"][0][1] == insts.index("Liceo Uno"), str(insts))
    cierto("«Anglo Americano» y «Angloamericano» son una institución, con la forma más usada",
           "Angloamericano" in insts and "Anglo Americano" not in insts, str(insts))
    cierto("«Pacto del Jocote» se junta con «Escuela Pacto del Jocote» (es la única con tipo)",
           "Pacto del Jocote" not in insts and "Escuela Pacto del Jocote" in insts, str(insts))
    cierto("«Lepanto» no se junta: hay una Escuela y un Colegio Lepanto",
           all(x in insts for x in ("Lepanto", "Escuela Lepanto", "Colegio Lepanto")), str(insts))
    cierto("los puntos y el Elo vacíos quedan en null", any(p[4] is None and p[5] is None for p in d["participaciones"]))

print("Los JSON")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil.py"), "--comprobar"], capture_output=True, text=True)
cierto("data/ajedrez-estudiantil.json y data/ajedrez-estudiantil-jugadores.json están al día", r.returncode == 0, (r.stdout + r.stderr).strip())

print(f"\n{fallos} comprobación(es) fallaron" if fallos else "\nTodo bien")
sys.exit(1 if fallos else 0)
