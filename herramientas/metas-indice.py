#!/usr/bin/env python3
"""Índice ligero del material que se puede pedir en una tarea.

Escribe `entreno/data/metas.json`: por cada herramienta de entrenamiento,
sus RECORTES (los 80 temas de Ejercicios por tema, las tres categorías de
Mates, los seis niveles de 4×4…) con cuántos ejercicios tiene cada uno.
Es lo que `tareas.html` necesita para que el profesor pueda pedir "10
ejercicios de ataque doble" y para ponerle un tope de verdad a la cantidad.

**Se GENERA, no se escribe a mano**, y esa es toda la razón de que este
script exista: `entreno/data/temas.json` pesa 1,8 MB y `mates.json` otros
320 KB. Bajarlos enteros en la página de Tareas para listar ochenta
nombres sería la misma piedra de la portada con el libro de aperturas
(7,9 MB para quien entraba a leer y se iba). Y copiar los nombres a mano
en un archivo aparte sería la otra piedra: una segunda lista que se va
separando de la primera a la primera corrección.

Al agregar un tema, una categoría o un ejercicio, correrlo:

    python3 herramientas/metas-indice.py

`herramientas/verificar-tareas.js` comprueba que lo generado siga
coincidiendo con las fuentes, así que un índice que se quede viejo se ve
—en vez de ofrecerle al profesor un tema que ya no existe, que no daría
ningún error: el alumno abriría el enlace y no encontraría nada—.
"""

import json
import re
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "entreno" / "data"
SALIDA = DATOS / "metas.json"

# Cómo se llama en pantalla lo que en los datos es una clave. Son de
# presentación y por eso viven acá y no en los datos.
NOMBRE_MATE = {"mate1": "Mate en 1", "mate2": "Mate en 2", "mate3": "Mate en 3"}
NOMBRE_APRENDER = {
    "movimientos": "Cómo mueve cada pieza",
    "reglas": "Las reglas",
    "tacticas": "Primeras tácticas",
}
NOMBRE_PRACTICAR = {
    "tacticas": "Tácticas", "mates": "Mates", "finales": "Finales",
}


def recortes_de_temas():
    """Los 80 temas, con su grupo y cuántos ejercicios tiene cada uno.

    La `actividad` no es siempre 'temas': los del grupo de táctica se
    registran en training_progress como 'tactica' (ver temasDeTactica() en
    entreno/temas.html). Deducirla del slug dejaría esos diez ejercicios
    contando contra cero sin que nada fallara.
    """
    d = json.loads((DATOS / "temas.json").read_text(encoding="utf-8"))
    por_tema = {k: len(v) for k, v in d.get("themes", {}).items()}
    salida = []
    for grupo in d.get("groups", []):
        actividad = "tactica" if grupo.get("id") == "tactica" else "temas"
        for t in grupo.get("themes", []):
            total = por_tema.get(t["key"], 0)
            if not total:
                continue
            salida.append({
                "clave": t["key"],
                "label": t["name"],
                "grupo": grupo.get("title", ""),
                "total": total,
                "actividades": [actividad],
            })
    return salida


def recortes_por_categoria(archivo, nombres, actividad):
    ex = json.loads((DATOS / archivo).read_text(encoding="utf-8"))
    cuenta, etiqueta = {}, {}
    for x in ex:
        cat = x.get("category")
        if not cat:
            continue
        cuenta[cat] = cuenta.get(cat, 0) + 1
        etiqueta.setdefault(cat, x.get("categoryLabel") or nombres.get(cat, cat))
    return [
        {"clave": c, "label": nombres.get(c, etiqueta[c]), "total": n,
         "actividades": [actividad]}
        for c, n in sorted(cuenta.items(), key=lambda kv: -kv[1])
    ]


def recortes_de_pagina(pagina, nombres, actividad):
    """Las categorías de Aprender y Practicar, que viven dentro del HTML.

    No tienen un JSON propio: son listas escritas dentro de la página. Se
    leen de ahí igual, que es la fuente, en vez de copiarlas."""
    s = (RAIZ / "entreno" / pagina).read_text(encoding="utf-8")
    cuenta = {}
    for cat in re.findall(r"cat:'([a-z_]+)'", s):
        cuenta[cat] = cuenta.get(cat, 0) + 1
    return [
        {"clave": c, "label": nombres.get(c, c), "total": n,
         "actividades": [actividad]}
        for c, n in sorted(cuenta.items(), key=lambda kv: -kv[1])
    ]


def por_node(js):
    """Lee un banco que vive en un .js con Node, desde el MISMO archivo que
    carga el sitio. Comprobar el índice contra una copia de la lista no
    comprobaría nada — es la misma razón por la que
    verificar-libro-diagnostico.py lee el banco con Node."""
    r = subprocess.run(["node", "-e", js], cwd=RAIZ, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("node falló leyendo el banco:\n" + r.stderr)
    return json.loads(r.stdout)


def recortes_de_aperturas():
    """Las 40 líneas de Aperturas y celadas, cada una con su id.

    El id NO se cambia nunca: es la clave con la que queda guardado el avance
    de cada alumno (y ahora, también, con la que una tarea pide esa línea)."""
    lineas = por_node(
        "global.window={};require('./js/aperturas-lineas.js');"
        "const L=window.AperturasLineas.LINEAS||window.AperturasLineas;"
        "console.log(JSON.stringify(L.map(l=>({id:l.id,nombre:l.nombre,"
        "apertura:l.apertura,color:l.color}))))")
    return [
        {"clave": l["id"],
         "label": l["nombre"],
         "grupo": l.get("apertura") or "",
         "total": 1,
         "actividades": ["aperturas"]}
        for l in lineas
    ]


def recortes_de_estudio():
    """Las 56 fichas de Estudio. Van con su enlace propio (?ficha=<id>), que
    es lo que evita que el alumno tenga que buscarla entre las cuatro
    secciones. No se miden solas —Estudio no escribe en training_progress, a
    propósito— así que su meta es 'completar'."""
    fichas = por_node(
        "global.window={};require('./js/fichas-estudio.js');"
        "const F=window.FichasEstudio;"
        "console.log(JSON.stringify(F.FICHAS.map(f=>({id:f.id,titulo:f.titulo,"
        "categoria:f.categoria}))))")
    etiqueta = {"apertura": "Aperturas", "defensa": "Defensas",
                "tactica": "Táctica", "concepto": "Conceptos"}
    return [
        {"clave": f["id"], "label": f["titulo"],
         "grupo": etiqueta.get(f["categoria"], f["categoria"]),
         "total": 1, "actividades": []}
        for f in fichas
    ]


def main():
    indice = {
        "_generado_por": "herramientas/metas-indice.py",
        "temas": recortes_de_temas(),
        "mates": recortes_por_categoria("mates.json", NOMBRE_MATE, "mates"),
        "4x4": recortes_por_categoria("exercises.json", {}, "4x4"),
        "aprender": recortes_de_pagina("aprender.html", NOMBRE_APRENDER, "aprender"),
        "practicas": recortes_de_pagina("practicas.html", NOMBRE_PRACTICAR, "practicar"),
        "aperturas": recortes_de_aperturas(),
        "estudio": recortes_de_estudio(),
    }
    SALIDA.write_text(
        json.dumps(indice, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(len(v) for k, v in indice.items() if isinstance(v, list))
    print(f"{SALIDA.relative_to(RAIZ)}: {total} recortes")
    for k, v in indice.items():
        if isinstance(v, list):
            print(f"  {k}: {len(v)}")


if __name__ == "__main__":
    main()
