#!/usr/bin/env python3
"""Los ejercicios de cada tema, para el premio por terminarlo.

Cuando un alumno termina un tema de Entrenamiento (los 80 temas de
Ejercicios por tema, Mate en 1/2/3, los seis niveles del 4×4, los Tipos, las
categorías de Aprender y Practicar, y las aperturas de Aperturas y celadas),
la base le paga el doble de lo que valen sus ejercicios, con un tope de 500
(interno.premio_por_tema()). Para eso la base tiene que saber QUÉ ejercicios
tiene cada tema: solo paga si cada uno existe de verdad en el tema, para que
anotarse ejercicios inventados desde la consola no sirva de nada.

Este script lee las mismas fuentes que herramientas/metas-indice.py (los
JSON de entreno/data y los .js que carga el sitio) y escribe
entreno/data/premio-temas.json. **No se escribe a mano.** La base lo carga
con interno.premio_temas_cargar(): son unos 150 KB, demasiado para pasarlos
en una migración, así que la base se baja el archivo publicado con pg_net
(los pasos, en la decisión de abajo). Al agregar un tema o ejercicios a uno:

    python3 herramientas/premio-temas.py

y, publicado el sitio, volver a cargarlo en la base.
herramientas/verificar-premio-temas.py comprueba que el archivo siga
coincidiendo con las fuentes.

Ver «Terminar un tema: el doble, hasta 500» en docs/decisiones/puntos-y-premios.md.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "entreno" / "data"

_spec = importlib.util.spec_from_file_location("metas_indice", RAIZ / "herramientas" / "metas-indice.py")
metas = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(metas)


def temas():
    """grupo 'temas': la página anota 'temas' o 'tactica' con puzzle_id. Un
    mismo ejercicio está en varios temas: cuenta para todos."""
    d = json.loads((DATOS / "temas.json").read_text(encoding="utf-8"))
    nombres = {t["key"]: t["name"] for g in d.get("groups", []) for t in g.get("themes", [])}
    for clave, ids in d.get("themes", {}).items():
        if clave in nombres and ids:
            yield "temas", clave, nombres[clave], sorted(set(ids))


def mates():
    ex = json.loads((DATOS / "mates.json").read_text(encoding="utf-8"))
    por = {}
    for x in ex:
        por.setdefault(x["category"], []).append(x["id"])
    for clave, ids in por.items():
        yield "mates", clave, metas.NOMBRE_MATE.get(clave, clave), sorted(set(ids))


def cuatro():
    """El 4×4 anota el id del puzzle de puzzles.json que corresponde al
    número del ejercicio (puzzleForExercise en js/entreno-4x4.js)."""
    ex = json.loads((DATOS / "exercises.json").read_text(encoding="utf-8"))
    pz = json.loads((DATOS / "puzzles.json").read_text(encoding="utf-8"))
    clave_de = {"FACIL": "facil", "INTERMEDIO": "intermedio", "AVANZADO": "avanzado",
                "ESPECIALISTA": "especialista", "MAESTRO": "maestro", "GRANMAESTRO": "granmaestro"}
    por, nombre = {}, {}
    for x in ex:
        lista = pz.get(clave_de.get(x["category"], ""), [])
        p = next((p for p in lista if p.get("number") == x.get("number")), None)
        if p:
            por.setdefault(x["category"], set()).add(p["id"])
            nombre.setdefault(x["category"], x.get("categoryLabel") or x["category"])
    for clave, ids in por.items():
        yield "4x4", clave, nombre[clave], sorted(ids)


def tipos():
    """Tipos anota puzzle_id = '<tipo>:<id>' (TiposCatalogo.clave)."""
    datos = json.loads((DATOS / "tipos.json").read_text(encoding="utf-8"))
    nombres = metas.por_node(
        "const C=require('./js/tipos-catalogo.js');"
        "console.log(JSON.stringify(C.TIPOS.map(t=>[t.id,t.nombre,!!t.propio])))")
    for t, n, propio in nombres:
        if propio or not datos.get(t):
            continue
        yield "tipos", t, n, sorted({t + ":" + x["id"] for x in datos[t]})


def de_pagina(archivo, grupo, nombres):
    """Aprender (lesson_id) y Practicar (set_id): las listas escritas en el JS."""
    lista = "window.AprenderLecciones.LESSONS" if "aprender" in archivo else "window.PracticasSeries.SETS"
    filas = metas.por_node(
        "global.window={};require('./" + archivo + "');"
        "console.log(JSON.stringify(" + lista + ".map(x=>[x.id,x.cat])))")
    por = {}
    for i, c in filas:
        por.setdefault(c, set()).add(i)
    for clave, ids in por.items():
        yield grupo, clave, nombres.get(clave, clave), sorted(ids)


def aperturas():
    """Aperturas y celadas: el tema es la apertura; sus ejercicios, las líneas."""
    lineas = metas.por_node(
        "global.window={};require('./js/aperturas-lineas.js');"
        "const L=window.AperturasLineas.LINEAS||window.AperturasLineas;"
        "console.log(JSON.stringify(L.map(l=>[l.id,l.apertura||''])))")
    por = {}
    for i, a in lineas:
        if a:
            por.setdefault(a, set()).add(i)
    for apertura, ids in por.items():
        yield "aperturas", apertura, apertura, sorted(ids)


def todos():
    yield from temas()
    yield from mates()
    yield from cuatro()
    yield from tipos()
    yield from de_pagina("js/aprender-lecciones.js", "aprender", metas.NOMBRE_APRENDER)
    yield from de_pagina("js/practicas-series.js", "practicar", metas.NOMBRE_PRACTICAR)
    yield from aperturas()


SALIDA = DATOS / "premio-temas.json"


def armar():
    # Un «tema» de un solo ejercicio no es un tema.
    return {
        "_generado_por": "herramientas/premio-temas.py",
        "temas": [{"grupo": g, "tema": t, "nombre": n, "items": ids}
                  for g, t, n, ids in todos() if len(ids) >= 2],
    }


if __name__ == "__main__":
    datos = armar()
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{SALIDA.relative_to(RAIZ)}: {len(datos['temas'])} temas, "
          f"{sum(len(t['items']) for t in datos['temas'])} ejercicios")
