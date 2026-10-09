#!/usr/bin/env python3
"""Arma descargas/pareo-integral-cli.zip: la versión de línea de comandos de
Pareo Integral, para bajar desde pareo.html y pareo-manual.html.

Lleva los MISMOS archivos que usa la página (js/pareo/ y el motor en
js/vendor/bbppairings/), así que la línea de comandos contesta exactamente lo
mismo que la web. Las instrucciones (README.md en inglés, LEEME.md en español)
viven en herramientas/pareo-cli/.

El zip sale siempre con los mismos bytes (fechas fijas, orden fijo):
verificar-pareo-cli.js lo vuelve a armar y lo compara, así que tocar un archivo
de js/pareo/ sin volver a correr esto hace fallar el CI.

    python3 herramientas/pareo-cli-empaquetar.py [--salida RUTA]
"""
import os
import sys
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = "pareo-integral"
FECHA = (2026, 1, 1, 0, 0, 0)

ARCHIVOS = [
    # (dentro del zip, en el repositorio)
    ("README.md", "herramientas/pareo-cli/README.md"),
    ("LEEME.md", "herramientas/pareo-cli/LEEME.md"),
    ("js/pareo/cli.js", "js/pareo/cli.js"),
    ("js/pareo/torneo.js", "js/pareo/torneo.js"),
    ("js/pareo/desempates.js", "js/pareo/desempates.js"),
    ("js/vendor/bbppairings/bbppairings.js", "js/vendor/bbppairings/bbppairings.js"),
    ("js/vendor/bbppairings/bbppairings.wasm", "js/vendor/bbppairings/bbppairings.wasm"),
    ("js/vendor/bbppairings/LICENSE.txt", "js/vendor/bbppairings/LICENSE.txt"),
    ("js/vendor/bbppairings/Apache-2.0.txt", "js/vendor/bbppairings/Apache-2.0.txt"),
    ("js/vendor/bbppairings/LEEME.txt", "js/vendor/bbppairings/LEEME.txt"),
]

# La entrada: `node pareo.js …` desde la carpeta del paquete.
ENTRADA = """#!/usr/bin/env node
// Pareo Integral, línea de comandos. Ver README.md (English) o LEEME.md (español).
"use strict";
const { principal } = require("./js/pareo/cli.js");
principal(process.argv.slice(2)).then(
  (codigo) => process.exit(codigo),
  (e) => { process.stderr.write(String((e && e.stack) || e) + "\\n"); process.exit(2); }
);
"""


def armar(destino):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        def poner(nombre, datos, ejecutable=False):
            info = zipfile.ZipInfo(CARPETA + "/" + nombre, date_time=FECHA)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if ejecutable else 0o644) << 16
            z.writestr(info, datos)
        poner("pareo.js", ENTRADA.encode("utf-8"), ejecutable=True)
        for dentro, fuera in ARCHIVOS:
            with open(os.path.join(RAIZ, fuera), "rb") as f:
                poner(dentro, f.read())


if __name__ == "__main__":
    salida = os.path.join(RAIZ, "descargas", "pareo-integral-cli.zip")
    if "--salida" in sys.argv:
        salida = sys.argv[sys.argv.index("--salida") + 1]
    armar(salida)
    print(f"{os.path.relpath(salida, RAIZ)}: {os.path.getsize(salida) // 1024} KB")
