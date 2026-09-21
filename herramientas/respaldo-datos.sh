#!/usr/bin/env bash
#
# Respalda los DATOS de la plataforma (lo único que el repositorio no puede
# guardar) con pg_dump.
#
# POR QUÉ HACE FALTA, Y POR QUÉ ES LO MÁS URGENTE DE TODO EL PUNTO DE
# RESTAURACIÓN. El esquema entero —las 184 migraciones, las 110 funciones, las
# 176 políticas— vive en el repositorio desde esta tanda, así que la base se
# puede reconstruir vacía en minutos. Lo que NO se puede reconstruir es lo que
# la gente hizo dentro: los 105 perfiles, el progreso de cada alumno, los
# encargados a los que llegan los informes, los planes de clase, la bitácora,
# los cobros. Eso solo existe en Supabase.
#
# Y la organización está en el plan GRATUITO, que no hace copias automáticas
# de la base. O sea que hoy no hay ninguna red debajo de esos datos: lo que se
# borre, se borró. Esto es esa red, y hay que correrlo a mano (o por cron en
# alguna máquina que quede prendida).
#
#   PGURL='postgresql://postgres.<ref>:<clave>@<host>:6543/postgres' \
#     bash herramientas/respaldo-datos.sh
#
# La cadena sale del panel de Supabase: Project Settings › Database ›
# Connection string › URI. NO se escribe en ningún archivo del repositorio —
# una cadena de conexión en el repositorio es una cadena publicada, la misma
# regla que ya tiene escrita `.mcp.json`.
#
# Deja tres archivos en `respaldos/`, que está en .gitignore A PROPÓSITO:
# ahí adentro van cédulas, correos y progreso de menores de edad, y eso no
# entra a git ni una vez, porque de git no se borra.

set -euo pipefail

if [ -z "${PGURL:-}" ]; then
  echo "Falta PGURL. Ver el encabezado de este archivo." >&2
  exit 1
fi
command -v pg_dump >/dev/null || { echo "Falta pg_dump (paquete postgresql-client)." >&2; exit 1; }

DEST="$(cd "$(dirname "$0")/.." && pwd)/respaldos"
FECHA=$(date +%Y-%m-%d-%H%M)
mkdir -p "$DEST"

# Tres archivos y no uno, porque se restauran en momentos distintos:
#
#   esquema  : para levantar una base vacía si las migraciones no alcanzaran.
#   datos    : lo único irreemplazable. Va aparte para poder meterlo sobre un
#              esquema ya reconstruido con las migraciones, que es el camino
#              normal.
#   completo : el respaldo de verdad, el que se restaura de un solo golpe.
echo "Volcando el esquema…"
pg_dump "$PGURL" --schema-only --no-owner --no-privileges -n public -f "$DEST/esquema-$FECHA.sql"
echo "Volcando los datos…"
pg_dump "$PGURL" --data-only --no-owner --no-privileges -n public -f "$DEST/datos-$FECHA.sql"
echo "Volcando todo junto…"
pg_dump "$PGURL" --no-owner --no-privileges -n public -Fc -f "$DEST/completo-$FECHA.dump"

# Un volcado que se corta a la mitad no da ningún error: el archivo queda ahí,
# con su nombre y su fecha, y solo se descubre el día que no restaura. pg_dump
# cierra el .sql con una línea propia; si no está, el volcado no terminó.
for f in "$DEST/esquema-$FECHA.sql" "$DEST/datos-$FECHA.sql"; do
  tail -5 "$f" | grep -q "PostgreSQL database dump complete" \
    || { echo "✗ $f quedó cortado: NO sirve como respaldo." >&2; exit 1; }
done
[ -s "$DEST/completo-$FECHA.dump" ] || { echo "✗ el .dump quedó vacío." >&2; exit 1; }

echo
echo "✓ Listo, en respaldos/ (que NO se commitea):"
ls -lh "$DEST"/*-"$FECHA".* | awk '{print "   " $9 "  " $5}'
echo
echo "Conviene guardar una copia FUERA de esta computadora: un respaldo que vive en el"
echo "mismo lugar que lo respaldado no es un respaldo."
