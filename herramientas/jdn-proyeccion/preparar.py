#!/usr/bin/env python3
"""Arma el SQL para cargar un export nuevo del ICODER a jdn_inscripciones
(jdn-proyeccion.html, la proyección JDN por comité: herramienta de arbitraje
con licencia, id «jdn-proyeccion»).

NO lee chess-results: lee el CSV que exporta el propio sistema de
inscripciones del ICODER («Archivo › Descargar › Valores separados por
comas») con sus columnas de siempre: Agrupacion Deportiva, Deporte, Tipo
Inscripción, Identificación, Tipo Identificación, Nombre, Primer Apellido,
Segundo Apellido, Nacimiento, Sexo biológico, Edad, Etapa, Nacionalidad,
Categoría, Estado Inscripción.

Saca lo que la página usa: comité, tipo, nombre, categoría, estado, cédula
(«Identificación») y fecha de nacimiento. NO copia el tipo de identificación
ni la nacionalidad. El CSV de origen tampoco se commitea: queda afuera del
repositorio, igual que los datos de calibración del diagnóstico.

El SQL que arma este script TAMPOCO se commitea (son datos de personas,
muchas menores de edad): se corre una vez contra la base y se descarta.

    python3 herramientas/jdn-proyeccion/preparar.py <export.csv> <edición> [--salida archivo.sql]

<edición> es un texto corto para distinguir esta carga de otras más
adelante (por ejemplo «Eliminatoria JDN(P) 2027 - Limón»). El SQL generado
primero borra lo que ya hubiera de esa misma edición, así se puede volver a
correr con un export corregido sin duplicar filas.

Ver «Proyección JDN por comité» en docs/decisiones/juegos-y-torneos.md."""
import argparse
import csv
import sys

COLUMNAS = ["Agrupacion Deportiva", "Deporte", "Tipo Inscripción", "Identificación",
            "Tipo Identificación", "Nombre", "Primer Apellido", "Segundo Apellido",
            "Nacimiento", "Sexo biológico", "Edad", "Etapa", "Nacionalidad",
            "Categoría", "Estado Inscripción"]
TIPOS_VALIDOS = {"Atleta", "Entrenador", "Asistente", "Chaperona"}
ESTADOS_VALIDOS = {"REGISTRADO", "APROBADO ICODER", "PASE CANTONAL",
                   "DEBEN CORREGIR LO SOLICITADO", "NO CONVOCATORIA"}


def escapar(s):
    return s.replace("'", "''")


def iso(fecha):
    """«DD/MM/AAAA» (como la escribe el ICODER) a «AAAA-MM-DD», o None si no se reconoce."""
    partes = fecha.strip().split("/")
    if len(partes) != 3:
        return None
    dd, mm, yyyy = partes
    return f"{yyyy}-{mm}-{dd}"


def leer(ruta):
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        filas = list(csv.DictReader(f))
    faltan = [c for c in COLUMNAS if c not in (filas[0].keys() if filas else [])]
    if faltan:
        sys.exit(f"Al CSV le faltan columnas del export del ICODER: {', '.join(faltan)}")
    return filas


def armar_sql(filas, edicion):
    valores = []
    avisos = []
    for i, f in enumerate(filas, start=2):  # la fila 1 es la cabecera
        comite = f["Agrupacion Deportiva"].strip()
        tipo = f["Tipo Inscripción"].strip()
        categoria = f["Categoría"].strip()
        estado = f["Estado Inscripción"].strip()
        nombre = ", ".join(p for p in (f"{f['Primer Apellido'].strip()} {f['Segundo Apellido'].strip()}".strip(),
                                        f["Nombre"].strip()) if p)
        if not comite or not nombre:
            avisos.append(f"fila {i}: sin comité o sin nombre, se saltó")
            continue
        if tipo not in TIPOS_VALIDOS:
            avisos.append(f"fila {i}: tipo de inscripción «{tipo}» desconocido, se saltó")
            continue
        if estado not in ESTADOS_VALIDOS:
            avisos.append(f"fila {i}: estado «{estado}» desconocido, se saltó")
            continue
        identificacion = f["Identificación"].strip()
        fecha = iso(f["Nacimiento"])
        if not fecha:
            avisos.append(f"fila {i} ({nombre}): fecha de nacimiento «{f['Nacimiento']}» no reconocida, queda en blanco")
        valores.append("('{}','{}','{}','{}','{}','{}',{},{})".format(
            escapar(edicion), escapar(comite), escapar(tipo), escapar(nombre), escapar(categoria), escapar(estado),
            f"'{escapar(identificacion)}'" if identificacion else "null",
            f"'{fecha}'" if fecha else "null"))
    if not valores:
        sys.exit("Ninguna fila se pudo cargar.")
    sql = (f"delete from public.jdn_inscripciones where edicion = '{escapar(edicion)}';\n"
           "insert into public.jdn_inscripciones (edicion, comite, tipo, nombre, categoria, estado, identificacion, nacimiento) values\n"
           + ",\n".join(valores) + ";\n")
    return sql, avisos


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", help="el export del ICODER, tal cual, en CSV")
    ap.add_argument("edicion", help="un texto corto para esta edición, p. ej. «Eliminatoria JDN(P) 2027 - Limón»")
    ap.add_argument("--salida", help="dónde escribir el SQL (por omisión, lo imprime)")
    args = ap.parse_args()

    filas = leer(args.csv)
    sql, avisos = armar_sql(filas, args.edicion)
    if args.salida:
        with open(args.salida, "w", encoding="utf-8") as f:
            f.write(sql)
        print(f"{args.salida}: listo. NO lo commitees: son datos de personas.")
    else:
        print(sql)
    for a in avisos:
        print("⚠️  " + a, file=sys.stderr)
    print(f"{len(filas) - len(avisos)} de {len(filas)} filas listas para cargar.", file=sys.stderr)


if __name__ == "__main__":
    main()
