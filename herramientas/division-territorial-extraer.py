#!/usr/bin/env python3
"""Saca provincias, cantones y distritos del PDF de la División Territorial
Electoral del TSE y los deja en herramientas/division-territorial-tse.json, tal
cual los escribe el TSE (mayúsculas, sin tildes).

    python3 herramientas/division-territorial-extraer.py <ruta del PDF>
    node herramientas/division-territorial-generar.js

El PDF es el «Provincias, Cantones, Distritos, Barrios.pdf» de la carpeta
«JDN 2027» del Drive: el Decreto 2-2025 del TSE (Alcance 15 a La Gaceta 23,
5 de febrero de 2025). No va en el repositorio: pesa 1,6 MB y lo que sirve de
él es la lista.

Se comprueba sola: cada distrito tiene su código de poblado (PCCDD…), y la
cantidad de distritos de cada cantón tiene que dar igual contada por los
encabezados («IV DISTRITO …») y por los códigos. El PDF trae «Xl» y «Xll» con
ele en vez de I: por eso el número romano acepta la «l».
Necesita: pip install pypdf
"""
import json
import re
import sys
from pathlib import Path

import pypdf

SALIDA = Path(__file__).with_name("division-territorial-tse.json")


def main(ruta):
    texto = "\n".join(p.extract_text() for p in pypdf.PdfReader(ruta).pages)
    lineas = [re.sub(r"\s+", " ", l).strip() for l in texto.split("\n")]
    datos, provincia, canton = {}, None, None
    for l in lineas:
        m = re.match(r"^([1-7]) ([A-ZÑ ]+)$", l)
        if m:
            provincia = m.group(2).strip()
            datos.setdefault(provincia, {})
            continue
        m = re.match(r"^(\d\d) CANTON (.+)$", l)
        if m:
            canton = m.group(2).strip()
            datos[provincia].setdefault(canton, [])
            continue
        m = re.match(r"^([IVXLCl]+) DISTRITO (.+)$", l)
        if m and m.group(2).strip() not in datos[provincia][canton]:
            datos[provincia][canton].append(m.group(2).strip())

    codigos = {}
    for p, c, d in re.findall(r"^(\d)(\d\d)(\d\d)\d\d\d ", texto, re.M):
        codigos.setdefault((p, c), set()).add(d)
    mal = []
    for i, (p, cantones) in enumerate(datos.items(), 1):
        for j, (c, distritos) in enumerate(cantones.items(), 1):
            if len(codigos.get((str(i), "%02d" % j), ())) != len(distritos):
                mal.append(f"{p} / {c}")
    n_cantones = sum(len(c) for c in datos.values())
    n_distritos = sum(len(d) for c in datos.values() for d in c.values())
    if len(datos) != 7 or mal:
        sys.exit(f"No cuadra: {len(datos)} provincias; distritos distintos de los códigos en {mal}")
    SALIDA.write_text(json.dumps({
        "fuente": "TSE, División Territorial Electoral, Decreto 2-2025 (Alcance 15 a La Gaceta 23, 5 de febrero de 2025)",
        "provincias": datos,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(datos)} provincias, {n_cantones} cantones, {n_distritos} distritos → {SALIDA.name}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
