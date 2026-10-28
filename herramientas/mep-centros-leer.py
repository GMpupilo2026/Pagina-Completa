#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lee los listados oficiales de centros educativos del MEP y arma
herramientas/datos/mep-centros.csv: código presupuestario, nombre, Dirección
Regional, circuito y si es escuela o colegio.

Lo usa herramientas/jde-banco.js para que, en inscripcion-jde.html, quien
inscribe elija su Dirección Regional y el tipo de centro, escoja el suyo de una
lista y el circuito se llene solo. Ver «La inscripción de los JDE» en
docs/decisiones/juegos-y-torneos.md.

Los PDF no están en el repositorio (son documentos de otras instituciones). Se
bajan a una carpeta y se le pasa su ruta:

    python3 herramientas/mep-centros-leer.py <carpeta con los PDF>

Los que lee, por el nombre que tengan en la carpeta, y de dónde salen:

  comedor-1.pdf, comedor-2.pdf  MEP, «Listado de centros COMEDOR EN VACACIONES»,
        I y II corte, 2024 (mep.go.cr/sites/default/files/2024-07/…). Son de
        2024 y mandan: si un centro está en varias listas, su Dirección
        Regional y su circuito son los de esta.
  sutel.pdf  SUTEL, anexo 5 del cartel de Fonatel «Distribución de dispositivos
        por CPSP» (sutel.go.cr/sites/default/files/cartelesfonatel/
        anexo_5-_distribucion_de_dispositivos_por_cpsp_0.pdf): escuelas,
        colegios, CINDEA, IPEC y preescolar con su nivel y su circuito escolar.
  imas.pdf  IMAS, «Entrega de paquetes escolares 2018, listado de centros
        educativos MEP» (imas.go.cr/sites/default/files/
        listado_centros_educativos_entrega_paquetes_escolares_2018_0.pdf): solo
        escuelas, y es la más vieja.

Ninguna trae todos los centros del país (faltan sobre todo colegios): la
herramienta lo dice y deja escribir el centro y elegir el circuito a mano.
El circuito de una lista vieja puede haber cambiado; por eso es el MEP, y no
nosotros, quien manda: si falta un dato, se deja vacío y nunca se adivina.

Dependencia: pip install pypdf
"""
import csv, os, re, sys, unicodedata

import pypdf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "herramientas", "datos", "mep-centros.csv")

PROVINCIAS = r"SAN JOSE|ALAJUELA|CARTAGO|HEREDIA|GUANACASTE|PUNTARENAS|LIMON"
# Las 27 Direcciones Regionales como las escriben los listados, sin tildes y en
# mayúsculas. jde-banco.js las convierte a los nombres de js/pareo/grupos.js.
DRES = ["AGUIRRE", "ALAJUELA", "CARTAGO", "CANAS", "COTO", "DESAMPARADOS", "GRANDE DE TERRABA", "GRANDE TERRABA",
        "GUAPILES", "HEREDIA", "LIBERIA", "LIMON", "LOS SANTOS", "NICOYA", "OCCIDENTE", "PENINSULAR", "PUNTARENAS",
        "PURISCAL", "PEREZ ZELEDON", "SAN CARLOS", "SAN JOSE CENTRAL", "SAN JOSE NORTE", "SAN JOSE OESTE",
        "SANTA CRUZ", "SARAPIQUI", "SULA", "TURRIALBA", "ZONA NORTE NORTE", "ZONA NORTE-NORTE"]
DRE_ALT = "|".join(sorted((re.escape(d) for d in DRES), key=len, reverse=True))


def plano(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").upper()


# Una misma Dirección Regional se escribe distinto según el listado.
CANON_DRE = {"GRANDE TERRABA": "GRANDE DE TERRABA", "ZONA NORTE-NORTE": "ZONA NORTE NORTE"}


def dre_canon(s):
    s = espacios(plano(s))
    return CANON_DRE.get(s, s)


def espacios(s):
    return re.sub(r"\s+", " ", s).strip()


def lineas(ruta):
    for pagina in pypdf.PdfReader(ruta).pages:
        for l in (pagina.extract_text() or "").split("\n"):
            yield l


def tipo_por_nombre(nombre):
    n = plano(nombre)
    if re.search(r"\b(LICEO|COLEGIO|C\.?T\.?P\.?|CINDEA|IPEC|NOCTURNO|TELESECUNDARIA|BACHILLERATO|C\.?N\.?V\.? COLEGIO|COLEGIO ACADEMICO)\b", n):
        return "colegio"
    return "escuela"


def leer_comedor(ruta):
    for l in lineas(ruta):
        m = re.match(r"^(\d{4})-00\s+(.+)\s+(\d{1,2})\s*$", l.strip())
        if not m:
            continue
        resto = m.group(2)
        alt = re.search(r"\s(%s)\s*$" % DRE_ALT, plano(resto))
        if not alt:
            continue
        nombre = espacios(resto[: alt.start()])
        dre = dre_canon(alt.group(1))
        if nombre:
            yield {"codigo": m.group(1), "nombre": nombre, "dre": dre, "circuito": m.group(3).zfill(2), "tipo": tipo_por_nombre(nombre), "fuente": "mep-comedor-2024"}


NIVELES_SUTEL = [("Escuelas diurnas", "escuela"), ("Escuelas nocturnas", "escuela"), ("Preescolar", "escuela"),
                 ("Colegios", "colegio"), ("CINDEA", "colegio"), ("IPEC", "colegio")]


def leer_sutel(ruta):
    for l in lineas(ruta):
        m = re.match(r"^(\d{4}) \d+ \S+ \d- (.+?) DIRECCION REGIONAL (.+?) CIRCUITO (\d+)\b", l)
        if not m:
            continue
        # El nivel va pegado al nombre: «Escuelas diurnas LA CARPIO».
        nivel_y_nombre = m.group(2)
        tipo = None
        for etiqueta, t in NIVELES_SUTEL:
            if nivel_y_nombre.startswith(etiqueta):
                tipo, nombre = t, nivel_y_nombre[len(etiqueta):]
                break
        if tipo is None:
            continue  # «Educación especial» y lo que no es ni escuela ni colegio
        nombre = espacios(nombre)
        if nombre:
            yield {"codigo": m.group(1), "nombre": nombre, "dre": dre_canon(m.group(3)), "circuito": m.group(4).zfill(2), "tipo": tipo, "fuente": "sutel-fonatel"}


def leer_imas(ruta):
    patron = re.compile(r"^(\d{4}) (.+) (%s) (\d{2}) (?:%s)\b" % (DRE_ALT, PROVINCIAS))
    for l in lineas(ruta):
        m = patron.match(plano(l).strip())
        if not m:
            continue
        nombre = espacios(m.group(2))
        if nombre:
            yield {"codigo": m.group(1), "nombre": nombre, "dre": dre_canon(m.group(3)), "circuito": m.group(4), "tipo": "escuela", "fuente": "imas-2018"}


def main():
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        sys.exit(__doc__)
    carpeta = sys.argv[1]
    fuentes = [("imas.pdf", leer_imas), ("sutel.pdf", leer_sutel), ("comedor-1.pdf", leer_comedor), ("comedor-2.pdf", leer_comedor)]
    # De la más vieja a la más nueva: la nueva pisa la Dirección Regional y el
    # circuito; el nombre, en cambio, se queda con el de la lista que lo escribe
    # completo y en mayúsculas (SUTEL, luego IMAS).
    por_codigo = {}
    cambios = 0
    for archivo, leer in fuentes:
        ruta = os.path.join(carpeta, archivo)
        if not os.path.exists(ruta):
            print("falta", archivo)
            continue
        n = 0
        for f in leer(ruta):
            n += 1
            ant = por_codigo.get(f["codigo"])
            if ant:
                if (ant["dre"], ant["circuito"]) != (f["dre"], f["circuito"]):
                    cambios += 1
                ant.update(dre=f["dre"], circuito=f["circuito"], fuente=ant["fuente"] + "+" + f["fuente"])
                if archivo.startswith("comedor"):
                    continue  # su nombre es el menos cuidado
                ant["nombre"] = f["nombre"]
                if f["tipo"] == "colegio":
                    ant["tipo"] = "colegio"
            else:
                por_codigo[f["codigo"]] = f
        print("%-14s %5d centros leídos" % (archivo, n))
    filas = sorted(por_codigo.values(), key=lambda f: (f["dre"], f["circuito"], plano(f["nombre"])))
    with open(SALIDA, "w", encoding="utf-8", newline="") as sal:
        w = csv.writer(sal, lineterminator="\n")
        w.writerow(["codigo", "nombre", "dre", "circuito", "tipo", "fuente"])
        for f in filas:
            w.writerow([f["codigo"], f["nombre"], f["dre"], f["circuito"], f["tipo"], f["fuente"]])
    print("%d centros en total (%d escuelas y %d colegios); %d cambiaron de circuito o regional entre listas." % (
        len(filas), sum(f["tipo"] == "escuela" for f in filas), sum(f["tipo"] == "colegio" for f in filas), cambios))
    print("escrito", os.path.relpath(SALIDA, RAIZ))


if __name__ == "__main__":
    main()
